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
    title="Multimodal Customer Return, Warranty & Refund Abuse Triage Agent",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# In-memory store initialized with the 6 seeded return claims
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


class AuthorizeDispositionPayload(BaseModel):
    authorized_by: Optional[str] = "Retail Loss Prevention & RTV Desk"
    override_disposition: Optional[str] = None
    inspector_notes: Optional[str] = None


class SimulateReturnPayload(BaseModel):
    product_name: str
    category: str
    supplier_name: str
    retail_price_kes: float
    wholesale_cost_kes: Optional[float] = None
    days_since_purchase: int
    receipt_serial: str
    physical_serial: str
    customer_returns_60d: int = 0
    tamper_or_swap_detected: bool = False
    genuine_defect_verified: bool = True
    claimed_reason: Optional[str] = "Customer reported hardware malfunction at returns desk."


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
        "title": "Multimodal Customer Return, Warranty & Refund Abuse Triage Agent",
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
        raise HTTPException(status_code=500, detail=f"Failed to dispatch OTP email: {exc}")
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
            "role": "National Returns, Warranty & RTV Controller",
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
            "role": "National Returns, Warranty & RTV Controller",
            "auth_method": "google_sso",
        },
    }


# ---------------------------------------------------------------------------
# Returns, Warranty & Supplier RTV Endpoints
# ---------------------------------------------------------------------------
def _compute_portfolio_kpis(items: List[Dict[str, Any]]) -> Dict[str, Any]:
    total_claimed_kes = sum(x["retail_price_kes"] for x in items)
    total_rtv_recoverable_kes = sum(x["supplier_rtv_recovery_kes"] for x in items)
    fraud_blocked_kes = sum(
        x["retail_price_kes"]
        for x in items
        if x["recommended_disposition"] in ("REJECT_FRAUD_SERIAL_TAMPER", "ROUTE_AUTHORIZED_WARRANTY_REPAIR")
    )
    serial_mismatch_count = sum(1 for x in items if not x["serial_match"] or x.get("tamper_or_swap_detected"))
    authorized_count = sum(1 for x in items if x.get("status") == "AUTHORIZED")
    return {
        "total_claims": len(items),
        "total_claimed_retail_kes": round(total_claimed_kes, 2),
        "total_supplier_rtv_recovery_kes": round(total_rtv_recoverable_kes, 2),
        "fraud_and_out_of_window_protected_kes": round(fraud_blocked_kes, 2),
        "serial_or_tamper_alerts": serial_mismatch_count,
        "authorized_dispositions": authorized_count,
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
    raise HTTPException(status_code=404, detail=f"Return claim {ret_id} not found.")


@app.post("/api/returns/{ret_id}/authorize")
def authorize_return_disposition(ret_id: str, payload: AuthorizeDispositionPayload) -> Dict[str, Any]:
    for idx, item in enumerate(RETURNS_STORE):
        if item["ret_id"].upper() == ret_id.upper():
            updated = dict(item)
            updated["status"] = "AUTHORIZED"
            updated["authorized_at"] = datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC")
            updated["authorized_by"] = payload.authorized_by or "Retail Loss Prevention & RTV Desk"
            if payload.override_disposition:
                updated["final_disposition"] = payload.override_disposition
            else:
                updated["final_disposition"] = updated["disposition_label"]
            if payload.inspector_notes:
                updated["inspector_authorization_note"] = payload.inspector_notes
            else:
                updated["inspector_authorization_note"] = (
                    f"Disposition locked & ERP RTV voucher ({updated.get('rtv_claim_number')}) transmitted."
                )
            RETURNS_STORE[idx] = updated
            return {
                "ok": True,
                "message": f"Return {ret_id} disposition authorized and Supplier RTV slip generated.",
                "claim": updated,
                "kpis": _compute_portfolio_kpis(RETURNS_STORE),
            }
    raise HTTPException(status_code=404, detail=f"Return claim {ret_id} not found.")


@app.post("/api/returns/simulate")
def simulate_return_claim(payload: SimulateReturnPayload) -> Dict[str, Any]:
    wholesale = (
        payload.wholesale_cost_kes
        if payload.wholesale_cost_kes is not None
        else round(payload.retail_price_kes * 0.76, 2)
    )
    sim_claim = {
        "ret_id": f"SIM-{datetime.utcnow().strftime('%H%M%S')}",
        "claim_date": datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC"),
        "store_branch": "Interactive Policy Simulator Desk",
        "customer_name": "Walk-In Triage Simulation",
        "customer_id": "CUST-SIM-9901",
        "loyalty_tier": "Simulated Profile",
        "sku": "SIM-SKU-001",
        "product_name": payload.product_name,
        "category": payload.category,
        "supplier_name": payload.supplier_name,
        "supplier_vendor_code": "VND-SIM-100",
        "supplier_warranty_terms": CATEGORY_POLICIES.get(
            payload.category, CATEGORY_POLICIES["Consumer Electronics"]
        )["policy_name"],
        "pos_receipt_no": "POS-SIM-2026-001",
        "purchase_date": "2026-10-01",
        "days_since_purchase": payload.days_since_purchase,
        "receipt_serial": payload.receipt_serial,
        "physical_serial": payload.physical_serial,
        "retail_price_kes": payload.retail_price_kes,
        "wholesale_cost_kes": wholesale,
        "customer_returns_60d": payload.customer_returns_60d,
        "customer_lifetime_return_rate_pct": round(min(90.0, payload.customer_returns_60d * 6.5 + 1.5), 1),
        "tamper_or_swap_detected": payload.tamper_or_swap_detected,
        "genuine_defect_verified": payload.genuine_defect_verified,
        "claimed_reason": payload.claimed_reason,
        "visual_inspection_notes": [
            f"Simulated inspection for {payload.product_name} ({payload.category}).",
            f"POS Receipt Serial '{payload.receipt_serial}' vs Physical Unit Serial '{payload.physical_serial}'.",
        ],
        "evidence_photos": [
            {"label": "Simulated POS Receipt", "tag": f"S/N: {payload.receipt_serial}"},
            {"label": "Physical Unit Serial Scan", "tag": f"S/N: {payload.physical_serial}"},
        ],
        "status": "SIMULATED",
        "rtv_claim_number": f"RTV-SIM-{datetime.utcnow().strftime('%H%M')}",
    }
    evaluated = evaluate_return_claim(sim_claim)
    return {"ok": True, "simulation": evaluated}


# ---------------------------------------------------------------------------
# AI Co-Pilot Endpoint (Vertex AI Gemini 2.5 Flash + Deterministic Fallback)
# ---------------------------------------------------------------------------
def _build_deterministic_copilot_response(question: str, claim: Optional[Dict[str, Any]]) -> str:
    kpis = _compute_portfolio_kpis(RETURNS_STORE)
    if claim:
        return (
            f"### Deterministic Triage Brief — {claim['ret_id']} ({claim['product_name']})\n\n"
            f"- **Recommended Disposition:** **{claim['disposition_label']}**\n"
            f"- **Policy Window Verification:** Purchased **{claim['days_since_purchase']} days ago** vs. **{claim['policy_window_days']}-day** window for *{claim['category']}* (`{'PASS' if claim['within_policy_window'] else 'OUT OF WINDOW'}`).\n"
            f"- **Serial / Batch Integrity:** POS Receipt `{claim['receipt_serial']}` vs. Physical Unit `{claim['physical_serial']}` (`{'EXACT MATCH' if claim['serial_match'] else 'CRITICAL MISMATCH'}`).\n"
            f"- **Customer Abuse Risk Score:** **{claim['abuse_risk_score']}/100** ({claim['customer_returns_60d']} returns in 60 days, {claim['customer_lifetime_return_rate_pct']}% lifetime return rate).\n"
            f"- **Upstream Supplier RTV Recovery:** **KES {claim['supplier_rtv_recovery_kes']:,.2f}** recoverable from **{claim['supplier_name']}** via `{claim['rtv_claim_number']}` ({claim['rtv_mechanism']}).\n\n"
            f"**Actionable Guidance:** Click **Authorize Disposition & Generate Supplier RTV Claim** in Tab 2 to lock the decision and print the 1-Page Return Disposition & Supplier RTV Claim Slip."
        )
    return (
        f"### Portfolio Returns, Warranty & RTV Executive Summary\n\n"
        f"- **Active Triage Queue:** **{kpis['total_claims']} claims** totaling **KES {kpis['total_claimed_retail_kes']:,.2f}** in retail value.\n"
        f"- **Upstream Supplier RTV Chargeback Recovery:** **KES {kpis['total_supplier_rtv_recovery_kes']:,.2f}** automatically matched to vendor warranty contracts (`RET-2026-8410` Hotpoint compressor, `RET-2026-8413` Brookside cold-chain debit note, `RET-2026-8414` LG OLED DOA panel, `RET-2026-8412` NutriBullet service transfer).\n"
        f"- **Fraud & Out-of-Window Loss Prevention:** **KES {kpis['fraud_and_out_of_window_protected_kes']:,.2f}** protected against serial-swapped headphones (`RET-2026-8411`), tampered cosmetics (`RET-2026-8415`), and out-of-window cash demands (`RET-2026-8412`).\n"
        f"- **Serial/Lot Mismatch Alerts:** **{kpis['serial_or_tamper_alerts']} high-risk claims** flagged at the counter before refund disbursement."
    )


@app.post("/api/agent/ask")
def ask_returns_copilot(payload: AgentAskPayload) -> Dict[str, Any]:
    question = (payload.question or "").strip()
    if not question:
        raise HTTPException(status_code=400, detail="Question cannot be empty.")

    selected_claim = None
    if payload.ret_id:
        for item in RETURNS_STORE:
            if item["ret_id"].upper() == payload.ret_id.upper():
                selected_claim = item
                break

    fallback_answer = _build_deterministic_copilot_response(question, selected_claim)

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
                return {"answer": fallback_answer, "model": "deterministic-policy-engine-v1"}
            client = genai.Client(api_key=api_key)

        context_summary = "\n".join(
            [
                f"- {c['ret_id']}: {c['product_name']} | Category: {c['category']} | "
                f"Days: {c['days_since_purchase']}/{c['policy_window_days']} | "
                f"Receipt S/N: {c['receipt_serial']} vs Physical S/N: {c['physical_serial']} | "
                f"Abuse Score: {c['abuse_risk_score']}/100 ({c['customer_returns_60d']} returns/60d) | "
                f"Disposition: {c['disposition_label']} | Supplier RTV Recovery: KES {c['supplier_rtv_recovery_kes']:,.2f} ({c['supplier_name']})"
                for c in RETURNS_STORE
            ]
        )
        focus_text = (
            f"Focused Claim: {selected_claim['ret_id']} ({selected_claim['product_name']}) - {selected_claim['claimed_reason']}"
            if selected_claim
            else "Focused Claim: Full Queue Portfolio"
        )

        prompt = (
            "You are the Retail Returns, Warranty & Refund Abuse Triage AI Co-Pilot. "
            "Provide a concise, executive, audit-ready response using exact KES amounts, serial numbers, "
            "policy windows, abuse scores, and upstream supplier RTV recovery figures from the live queue below.\n\n"
            f"Live Returns Queue:\n{context_summary}\n\n"
            f"{focus_text}\n"
            f"User Question: {question}"
        )

        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=prompt,
            config=types.GenerateContentConfig(temperature=0.2, max_output_tokens=700),
        )
        answer_text = (response.text or "").strip()
        if not answer_text:
            answer_text = fallback_answer
        return {"answer": answer_text, "model": "gemini-2.5-flash"}
    except Exception:
        return {"answer": fallback_answer, "model": "deterministic-policy-engine-v1"}


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
