import os
from datetime import datetime
from typing import Dict, Any, List, Optional
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel

from auth_service import (
    format_name_from_email,
    is_access_allowed,
    get_otp_rejection_message,
    generate_and_store_otp,
    send_otp_email,
    verify_stored_otp,
    verify_google_id_token,
)
from seed_data import get_initial_returns, evaluate_return_claim, CATEGORY_POLICIES

app = FastAPI(
    title="Customer Return & Warranty Verification Agent",
    version="2.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# In-memory store initialized with the 6 seeded store return cases
RETURNS_STORE: List[Dict[str, Any]] = get_initial_returns()


# ---------------------------------------------------------------------------
# Pydantic Schemas
# ---------------------------------------------------------------------------
class OTPRequestPayload(BaseModel):
    email: str


class OTPVerifyPayload(BaseModel):
    email: str
    code: str


class GoogleAuthPayload(BaseModel):
    credential: str


class ConfirmReturnDecisionPayload(BaseModel):
    authorized_by: Optional[str] = "Store Customer Service Supervisor"
    supervisor_notes: Optional[str] = None


class SimulateReturnPayload(BaseModel):
    product_name: str
    category: str
    supplier_name: str
    retail_price_kes: float
    days_since_purchase: int
    receipt_serial: str
    physical_serial: str
    customer_physical_damage: bool = False
    genuine_defect_verified: bool = True
    fault_summary: Optional[str] = "Factory Fault Verified at Counter"


class AgentAskPayload(BaseModel):
    question: str
    ret_id: Optional[str] = None


# ---------------------------------------------------------------------------
# Health & Auth Endpoints
# ---------------------------------------------------------------------------
@app.get("/api/health")
def health_check() -> Dict[str, Any]:
    return {
        "status": "ok",
        "service": "Retail_ReturnsWarrantyAgent",
        "agent_number": 11,
        "title": "Customer Return & Warranty Verification Agent",
        "seeded_returns_count": len(RETURNS_STORE),
        "timestamp": datetime.utcnow().isoformat() + "Z",
    }


@app.post("/api/auth/otp/request")
def request_otp(payload: OTPRequestPayload) -> Dict[str, Any]:
    email = (payload.email or "").strip().lower()
    if not email or "@" not in email:
        raise HTTPException(status_code=400, detail="Please enter a valid work email address.")
    if not is_access_allowed(email):
        raise HTTPException(status_code=403, detail=get_otp_rejection_message(email))
    code = generate_and_store_otp(email)
    try:
        send_otp_email(email, code)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to send verification email: {exc}")
    return {
        "ok": True,
        "message": f"6-digit verification code sent to {email}.",
        "email": email,
    }


@app.post("/api/auth/otp/verify")
def verify_otp(payload: OTPVerifyPayload) -> Dict[str, Any]:
    email = (payload.email or "").strip().lower()
    code = (payload.code or "").strip()
    ok, msg = verify_stored_otp(email, code)
    if not ok:
        raise HTTPException(status_code=401, detail=msg)
    return {
        "ok": True,
        "user": {
            "email": email,
            "name": format_name_from_email(email),
            "role": "Store Customer Returns & Warranty Supervisor",
            "auth_method": "email_otp",
        },
    }


@app.post("/api/auth/google")
def google_auth(payload: GoogleAuthPayload) -> Dict[str, Any]:
    ok, user_info, err = verify_google_id_token(payload.credential)
    if not ok:
        raise HTTPException(status_code=401, detail=err or "Google authentication failed.")
    return {
        "ok": True,
        "user": {
            "email": user_info.get("email", ""),
            "name": user_info.get("name") or format_name_from_email(user_info.get("email", "")),
            "picture": user_info.get("picture", ""),
            "role": "Store Customer Returns & Warranty Supervisor",
            "auth_method": "google_sso",
        },
    }


# ---------------------------------------------------------------------------
# Store Customer Return & Warranty Verification Endpoints
# ---------------------------------------------------------------------------
def _compute_portfolio_kpis(items: List[Dict[str, Any]]) -> Dict[str, Any]:
    total_value_kes = sum(x["retail_price_kes"] for x in items)

    approved_items = [x for x in items if x["decision_code"] == "APPROVE_REFUND_OR_EXCHANGE"]
    repair_items = [x for x in items if x["decision_code"] == "SEND_FOR_WARRANTY_REPAIR"]
    rejected_items = [
        x for x in items if x["decision_code"] in ("REJECT_WRONG_SERIAL", "REJECT_PHYSICAL_DAMAGE", "REJECT_EXPIRED_WARRANTY")
    ]

    wrong_serial_count = sum(1 for x in rejected_items if not x["serial_match"])
    physical_damage_count = sum(1 for x in rejected_items if x.get("customer_physical_damage"))

    return {
        "total_requests": len(items),
        "total_value_kes": round(total_value_kes, 2),
        "approved_count": len(approved_items),
        "approved_value_kes": round(sum(x["retail_price_kes"] for x in approved_items), 2),
        "warranty_repair_count": len(repair_items),
        "warranty_repair_value_kes": round(sum(x["retail_price_kes"] for x in repair_items), 2),
        "rejected_count": len(rejected_items),
        "rejected_value_kes": round(sum(x["retail_price_kes"] for x in rejected_items), 2),
        "wrong_serial_count": wrong_serial_count,
        "physical_damage_count": physical_damage_count,
    }


@app.get("/api/returns")
def list_returns() -> Dict[str, Any]:
    return {
        "returns": RETURNS_STORE,
        "kpis": _compute_portfolio_kpis(RETURNS_STORE),
        "category_policies": CATEGORY_POLICIES,
    }


@app.get("/api/returns/{ret_id}")
def get_return_detail(ret_id: str) -> Dict[str, Any]:
    for item in RETURNS_STORE:
        if item["ret_id"].upper() == ret_id.upper():
            return item
    raise HTTPException(status_code=404, detail=f"Return request {ret_id} not found.")


@app.post("/api/returns/{ret_id}/authorize")
def confirm_return_decision(ret_id: str, payload: ConfirmReturnDecisionPayload) -> Dict[str, Any]:
    for idx, item in enumerate(RETURNS_STORE):
        if item["ret_id"].upper() == ret_id.upper():
            updated = dict(item)
            updated["status"] = "CONFIRMED"
            updated["confirmed_at"] = datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC")
            updated["authorized_by"] = payload.authorized_by or "Store Customer Service Supervisor"
            updated["supervisor_note"] = (
                payload.supervisor_notes
                or f"Return decision confirmed ({updated['decision_label']}) — Slip {updated.get('approval_slip_no')} ready."
            )
            RETURNS_STORE[idx] = updated
            return {
                "ok": True,
                "message": f"Return decision confirmed for {ret_id}: {updated['decision_label']}.",
                "claim": updated,
                "kpis": _compute_portfolio_kpis(RETURNS_STORE),
            }
    raise HTTPException(status_code=404, detail=f"Return request {ret_id} not found.")


@app.post("/api/returns/simulate")
def simulate_return_claim(payload: SimulateReturnPayload) -> Dict[str, Any]:
    sim_claim = {
        "ret_id": f"SIM-{datetime.utcnow().strftime('%H%M%S')}",
        "claim_date": datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC"),
        "store_branch": "Store Returns Counter Check",
        "customer_name": "Walk-In Customer Check",
        "customer_id": "CUST-SIM-9901",
        "customer_phone": "+254 700 000 000",
        "sku": "SIM-SKU-001",
        "product_name": payload.product_name,
        "category": payload.category,
        "supplier_name": payload.supplier_name,
        "supplier_warranty_terms": CATEGORY_POLICIES.get(
            payload.category, CATEGORY_POLICIES["Consumer Electronics"]
        )["policy_name"],
        "pos_receipt_no": "RCP-SIM-2026-001",
        "purchase_date": "2026-10-01",
        "days_since_purchase": payload.days_since_purchase,
        "receipt_serial": payload.receipt_serial,
        "physical_serial": payload.physical_serial,
        "retail_price_kes": payload.retail_price_kes,
        "customer_physical_damage": payload.customer_physical_damage,
        "genuine_defect_verified": payload.genuine_defect_verified,
        "fault_summary": (
            "Customer Physical Damage"
            if payload.customer_physical_damage
            else (payload.fault_summary or "Factory Fault Verified")
        ),
        "claimed_reason": payload.fault_summary or "Customer requested return verification at store counter.",
        "condition_detail": (
            "Physical damage observed on returned item."
            if payload.customer_physical_damage
            else "No physical misuse; factory condition verified."
        ),
        "counter_inspection_notes": [
            f"Quick counter check for {payload.product_name} ({payload.category}).",
            f"Original Store Receipt Serial '{payload.receipt_serial}' vs Returned Item Serial '{payload.physical_serial}'.",
        ],
        "status": "SIMULATED",
        "approval_slip_no": f"SLIP-SIM-{datetime.utcnow().strftime('%H%M')}",
    }
    evaluated = evaluate_return_claim(sim_claim)
    return {"ok": True, "simulation": evaluated}


# ---------------------------------------------------------------------------
# Returns & Warranty AI Assistant (Gemini 2.5 Flash + Plain-English Fallback)
# ---------------------------------------------------------------------------
def _build_plain_english_assistant_response(question: str, claim: Optional[Dict[str, Any]]) -> str:
    kpis = _compute_portfolio_kpis(RETURNS_STORE)
    if claim:
        return (
            f"### Store Return Verification Summary — {claim['ret_id']} ({claim['product_name']})\n\n"
            f"1. **Check A — Receipt & Serial Number Match:** Original Store Receipt `{claim['pos_receipt_no']}` shows serial **`{claim['receipt_serial']}`** and the returned item shows **`{claim['physical_serial']}`** → **{'Matched' if claim['serial_match'] else 'Serial Mismatch'}**.\n"
            f"2. **Check B — Store Return Window & Warranty Period:** Bought **`{claim['days_since_purchase']} days ago`** vs. **`{claim['policy_window_days']}-Day Store Return Policy`** (12-Month Manufacturer Warranty: **{'Active' if claim['within_manufacturer_warranty'] else 'Expired'}**).\n"
            f"3. **Check C — Product Condition & Fault:** {claim['fault_summary']} — {claim['condition_detail']}\n\n"
            f"**Recommended Counter Decision:** **{claim['decision_label']}**\n"
            f"- **What to do next:** {claim['counter_action_summary']}"
        )
    return (
        f"### Store Customer Returns & Warranty Queue Summary\n\n"
        f"- **Customer Returns in Queue:** **{kpis['total_requests']} requests** worth **KES {kpis['total_value_kes']:,.0f}**.\n"
        f"- **Approved for Refund / Exchange ({kpis['approved_count']} items · KES {kpis['approved_value_kes']:,.0f}):** Within the store return window, matching receipt & serial number, and genuine factory fault (`RET-2026-8410` Von Hotpoint Fridge, `RET-2026-8413` Samsung Microwave, `RET-2026-8414` LG 55-Inch TV — covered by supplier warranty credit).\n"
        f"- **Routed to Free Warranty Repair ({kpis['warranty_repair_count']} item · KES {kpis['warranty_repair_value_kes']:,.0f}):** `RET-2026-8412` (NutriBullet Blender bought 45 days ago) is past the 14-day store refund window, so we book a free manufacturer warranty repair instead of paying cash from the till.\n"
        f"- **Rejected Returns — Saved Store Cash ({kpis['rejected_count']} items · KES {kpis['rejected_value_kes']:,.0f}):** `RET-2026-8411` (Sony Headphones with wrong serial number) and `RET-2026-8415` (HP Laptop with cracked screen and liquid spill)."
    )


@app.post("/api/agent/ask")
def ask_returns_assistant(payload: AgentAskPayload) -> Dict[str, Any]:
    question = (payload.question or "").strip()
    if not question:
        raise HTTPException(status_code=400, detail="Please enter a question.")

    selected_claim = None
    if payload.ret_id:
        for item in RETURNS_STORE:
            if item["ret_id"].upper() == payload.ret_id.upper():
                selected_claim = item
                break

    fallback_answer = _build_plain_english_assistant_response(question, selected_claim)

    try:
        from google import genai
        from google.genai import types

        use_vertex = os.getenv("GOOGLE_GENAI_USE_VERTEXAI", "1") == "1"
        project = os.getenv("GOOGLE_CLOUD_PROJECT", "gemini-enterprise-demo-498212")
        location = os.getenv("GOOGLE_CLOUD_LOCATION", "global")

        if use_vertex:
            client = genai.Client(vertexai=True, project=project, location=location)
        else:
            api_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
            if not api_key:
                return {"answer": fallback_answer, "model": "store-warranty-verifier"}
            client = genai.Client(api_key=api_key)

        context_summary = "\n".join(
            [
                f"- {c['ret_id']}: {c['product_name']} (KES {c['retail_price_kes']:,.0f}) | "
                f"Bought {c['days_since_purchase']} days ago vs {c['policy_window_days']}-Day Store Return Policy | "
                f"Receipt Serial: {c['receipt_serial']} vs Returned Unit Serial: {c['physical_serial']} ({'Matched' if c['serial_match'] else 'Serial Mismatch'}) | "
                f"Fault: {c['fault_summary']} | Decision: {c['decision_label']} | Supplier Coverage: {c['supplier_coverage_status']}"
                for c in RETURNS_STORE
            ]
        )
        focus_text = (
            f"Currently Selected Return: {selected_claim['ret_id']} ({selected_claim['product_name']}) - {selected_claim['fault_summary']}"
            if selected_claim
            else "Currently Selected Return: All 6 Store Customer Returns"
        )

        prompt = (
            "You are the Store Customer Return & Warranty Verification Assistant. "
            "Use clear, simple, everyday retail store English. Do NOT use technical supply-chain acronyms. "
            "Explain decisions using the 3 simple counter checks: (1) Original Store Receipt & Serial Number Match, "
            "(2) Store Return Window vs. 12-Month Manufacturer Warranty Period, and (3) Genuine Factory Fault vs. Customer Physical Damage.\n\n"
            f"Store Returns Queue:\n{context_summary}\n\n"
            f"{focus_text}\n"
            f"Question: {question}"
        )

        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=prompt,
            config=types.GenerateContentConfig(temperature=0.2, max_output_tokens=650),
        )
        answer_text = (response.text or "").strip()
        if not answer_text:
            answer_text = fallback_answer
        return {"answer": answer_text, "model": "gemini-2.5-flash"}
    except Exception:
        return {"answer": fallback_answer, "model": "store-warranty-verifier"}


# ---------------------------------------------------------------------------
# SPA Static File Hosting (../frontend/dist)
# ---------------------------------------------------------------------------
FRONTEND_DIST = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "frontend", "dist"))

if os.path.isdir(FRONTEND_DIST):
    assets_dir = os.path.join(FRONTEND_DIST, "assets")
    if os.path.isdir(assets_dir):
        app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")

    @app.get("/{full_path:path}")
    def serve_spa(full_path: str):
        if full_path.startswith("api/"):
            raise HTTPException(status_code=404, detail="API route not found")
        candidate = os.path.join(FRONTEND_DIST, full_path)
        if full_path and os.path.isfile(candidate):
            return FileResponse(candidate)
        return FileResponse(os.path.join(FRONTEND_DIST, "index.html"))
