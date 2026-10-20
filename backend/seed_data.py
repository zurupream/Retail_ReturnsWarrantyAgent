from typing import Dict, Any, List
import copy

CATEGORY_POLICIES: Dict[str, Dict[str, Any]] = {
    "Major Appliances": {
        "store_return_window_days": 30,
        "manufacturer_warranty_days": 365,
        "policy_name": "30-Day Store Refund/Exchange & 12-Month Manufacturer Warranty",
    },
    "Consumer Electronics": {
        "store_return_window_days": 14,
        "manufacturer_warranty_days": 365,
        "policy_name": "14-Day Store Refund/Exchange & 12-Month Manufacturer Warranty",
    },
    "Small Kitchen Appliances": {
        "store_return_window_days": 14,
        "manufacturer_warranty_days": 365,
        "policy_name": "14-Day Store Refund/Exchange & 12-Month Manufacturer Warranty",
    },
    "Computers & Laptops": {
        "store_return_window_days": 14,
        "manufacturer_warranty_days": 365,
        "policy_name": "14-Day Store Refund/Exchange & 12-Month Manufacturer Warranty (Excludes Physical Damage)",
    },
}


def evaluate_return_claim(claim: Dict[str, Any]) -> Dict[str, Any]:
    """
    Plain-English 3-Step Store Return & Warranty Verification Engine:
    Step 1: Original Store Receipt & Returned Item Serial Match
    Step 2: Store Return Days (7/14/30-Day Window) & 12-Month Manufacturer Warranty Check
    Step 3: Product Condition Inspection & Clear Store Counter Decision
    """
    category = claim.get("category", "Consumer Electronics")
    policy = CATEGORY_POLICIES.get(category, CATEGORY_POLICIES["Consumer Electronics"])

    store_window_days = int(claim.get("policy_window_days", policy["store_return_window_days"]))
    warranty_days = int(claim.get("manufacturer_warranty_days", policy["manufacturer_warranty_days"]))
    days_since_purchase = int(claim.get("days_since_purchase", 0))

    within_store_window = days_since_purchase <= store_window_days
    within_manufacturer_warranty = days_since_purchase <= warranty_days

    receipt_serial = str(claim.get("receipt_serial", "")).strip().upper()
    physical_serial = str(claim.get("physical_serial", "")).strip().upper()
    serial_match = (receipt_serial == physical_serial) and bool(receipt_serial)

    customer_physical_damage = bool(claim.get("customer_physical_damage", False))
    genuine_defect_verified = bool(claim.get("genuine_defect_verified", True))

    retail_price_kes = float(claim.get("retail_price_kes", 0.0))
    supplier_name = claim.get("supplier_name", "Authorized Manufacturer")

    # Step 3: Clear Store Counter Decision (3 Simple Outcomes)
    if not serial_match:
        decision_code = "REJECT_WRONG_SERIAL"
        decision_label = "Reject Return — Wrong Serial Number"
        decision_outcome = "Reject Return"
        customer_refund_kes = 0.0
        supplier_credit_kes = 0.0
        saved_store_cash_kes = retail_price_kes
        supplier_coverage_status = "Not Covered — Returned Item Does Not Match Receipt"
        counter_action_summary = (
            "Do not issue refund or replacement. The serial number on the item brought to the counter "
            "does not match the serial number printed on the original store receipt."
        )
    elif customer_physical_damage or not genuine_defect_verified:
        decision_code = "REJECT_PHYSICAL_DAMAGE"
        decision_label = "Reject Return — Customer Physical Damage"
        decision_outcome = "Reject Return"
        customer_refund_kes = 0.0
        supplier_credit_kes = 0.0
        saved_store_cash_kes = retail_price_kes
        supplier_coverage_status = "Not Covered — Physical / Liquid Damage Excluded by Warranty"
        counter_action_summary = (
            "Do not issue store refund. Physical impact or liquid damage caused after purchase is not "
            "covered by the store return policy or the manufacturer warranty."
        )
    elif within_store_window:
        decision_code = "APPROVE_REFUND_OR_EXCHANGE"
        decision_label = "Approve Refund or Exchange"
        decision_outcome = "Approve Refund or Exchange"
        customer_refund_kes = retail_price_kes
        supplier_credit_kes = retail_price_kes
        saved_store_cash_kes = 0.0
        supplier_coverage_status = f"Covered by {supplier_name} Supplier Credit"
        counter_action_summary = (
            f"Give the customer an immediate replacement or full refund of KES {retail_price_kes:,.0f}. "
            f"The store recovers the full value via {supplier_name} supplier warranty credit."
        )
    elif within_manufacturer_warranty:
        decision_code = "SEND_FOR_WARRANTY_REPAIR"
        decision_label = "Send for Manufacturer Warranty Repair"
        decision_outcome = "Send for Manufacturer Warranty Repair"
        customer_refund_kes = 0.0
        supplier_credit_kes = 0.0
        saved_store_cash_kes = retail_price_kes
        supplier_coverage_status = f"Covered for Free Repair by {supplier_name} (12-Month Warranty)"
        counter_action_summary = (
            f"Item is past the {store_window_days}-day store refund window ({days_since_purchase} days old), "
            f"so do not pay out cash from the store till. Book a free manufacturer warranty repair with {supplier_name}."
        )
    else:
        decision_code = "REJECT_EXPIRED_WARRANTY"
        decision_label = "Reject Return — Warranty Expired"
        decision_outcome = "Reject Return"
        customer_refund_kes = 0.0
        supplier_credit_kes = 0.0
        saved_store_cash_kes = retail_price_kes
        supplier_coverage_status = "Expired — Past 12-Month Manufacturer Warranty"
        counter_action_summary = "Both the store return window and the 12-month manufacturer warranty have expired."

    verification_steps = [
        {
            "step_id": "STEP-1-RECEIPT",
            "step_title": "Check A: Original Store Receipt & Serial Number Match",
            "expected": f"Receipt Serial: {receipt_serial}",
            "actual": f"Returned Item Serial: {physical_serial}",
            "passed": serial_match,
            "status_badge": "Matched" if serial_match else "Serial Mismatch",
            "detail": (
                f"Returned unit serial number ({physical_serial}) matches Original Store Receipt {claim.get('pos_receipt_no', '')}."
                if serial_match
                else f"MISMATCH: Receipt shows serial {receipt_serial}, but the item brought to the counter has serial {physical_serial}."
            ),
        },
        {
            "step_id": "STEP-2-WINDOW",
            "step_title": "Check B: Store Return Window vs. 12-Month Warranty Period",
            "expected": f"Within {store_window_days}-Day Store Refund Policy",
            "actual": f"Bought {days_since_purchase} Days Ago (12-Mo Warranty: {'Active' if within_manufacturer_warranty else 'Expired'})",
            "passed": within_store_window,
            "status_badge": (
                f"Within {store_window_days}-Day Return Window"
                if within_store_window
                else f"Past {store_window_days}-Day Window (Under 1-Yr Warranty)"
            ),
            "detail": (
                f"Purchased {days_since_purchase} days ago — qualifies for immediate store refund or exchange under the {store_window_days}-day store policy."
                if within_store_window
                else f"Purchased {days_since_purchase} days ago — past the {store_window_days}-day store cash refund window, but covered under the 365-day manufacturer warranty."
            ),
        },
        {
            "step_id": "STEP-3-CONDITION",
            "step_title": "Check C: Product Condition & Fault Inspection",
            "expected": "Genuine Factory Fault (No Customer Physical Damage)",
            "actual": claim.get("fault_summary", "Factory Fault Verified"),
            "passed": genuine_defect_verified and not customer_physical_damage and serial_match,
            "status_badge": (
                "Genuine Factory Fault"
                if (genuine_defect_verified and not customer_physical_damage and serial_match)
                else ("Wrong Unit Returned" if not serial_match else "Customer Physical Damage")
            ),
            "detail": claim.get("condition_detail", claim.get("claimed_reason", "")),
        },
    ]

    enriched = copy.deepcopy(claim)
    enriched.update(
        {
            "policy_window_days": store_window_days,
            "manufacturer_warranty_days": warranty_days,
            "policy_name": policy["policy_name"],
            "within_policy_window": within_store_window,
            "within_manufacturer_warranty": within_manufacturer_warranty,
            "serial_match": serial_match,
            "decision_code": decision_code,
            "decision_label": decision_label,
            "decision_outcome": decision_outcome,
            "customer_refund_kes": customer_refund_kes,
            "supplier_credit_kes": supplier_credit_kes,
            "saved_store_cash_kes": saved_store_cash_kes,
            "supplier_coverage_status": supplier_coverage_status,
            "counter_action_summary": counter_action_summary,
            "verification_steps": verification_steps,
        }
    )
    return enriched


RAW_SEED_RETURNS: List[Dict[str, Any]] = [
    {
        "ret_id": "RET-2026-8410",
        "claim_date": "2026-10-20 08:42 EAT",
        "store_branch": "Westlands Flagship Hypermarket (Nairobi)",
        "customer_name": "Dr. Amina Wanjiku Mwangi",
        "customer_id": "CUST-KE-10492",
        "customer_phone": "+254 722 410 892",
        "sku": "VHP-REF-340L-INX",
        "product_name": "Von Hotpoint 340L Double Door Refrigerator",
        "category": "Major Appliances",
        "supplier_name": "Hotpoint Appliances Kenya",
        "supplier_warranty_terms": "30-Day Store Exchange & 12-Month Manufacturer Warranty",
        "pos_receipt_no": "RCP-WL-2026-99104",
        "purchase_date": "2026-10-09",
        "days_since_purchase": 11,
        "policy_window_days": 30,
        "manufacturer_warranty_days": 365,
        "receipt_serial": "VHP-340L-992841",
        "physical_serial": "VHP-340L-992841",
        "retail_price_kes": 89500.0,
        "customer_physical_damage": False,
        "genuine_defect_verified": True,
        "fault_summary": "Compressor not cooling (Factory Fault)",
        "claimed_reason": "Fridge compressor does not start cooling and shows error code E04 on the front display.",
        "condition_detail": "No dents, scratches, or misuse. Factory compressor relay fault confirmed at the store counter with all original shelves and box included.",
        "counter_inspection_notes": [
            "Original Store Receipt RCP-WL-2026-99104 verified — bought 11 days ago (within 30-day store return policy).",
            "Rear serial number plate VHP-340L-992841 matches the original store receipt.",
            "Genuine factory compressor fault confirmed; eligible for immediate customer refund or replacement.",
        ],
        "status": "PENDING_REVIEW",
        "approval_slip_no": "SLIP-HPK-2026-4401",
    },
    {
        "ret_id": "RET-2026-8411",
        "claim_date": "2026-10-20 09:15 EAT",
        "store_branch": "Sarit Centre Electronics Store (Nairobi)",
        "customer_name": "Kevin Omondi Otieno",
        "customer_id": "CUST-KE-88310",
        "customer_phone": "+254 711 839 204",
        "sku": "SNY-WH1000XM5-BLK",
        "product_name": "Sony WH-1000XM5 Wireless Headphones",
        "category": "Consumer Electronics",
        "supplier_name": "Sony East Africa Authorized Distributor",
        "supplier_warranty_terms": "14-Day Store Return Policy (Requires Exact Serial Number Match)",
        "pos_receipt_no": "RCP-SR-2026-77412",
        "purchase_date": "2026-10-14",
        "days_since_purchase": 6,
        "policy_window_days": 14,
        "manufacturer_warranty_days": 365,
        "receipt_serial": "SNY-884120",
        "physical_serial": "SNY-102944",
        "retail_price_kes": 54000.0,
        "customer_physical_damage": False,
        "genuine_defect_verified": False,
        "fault_summary": "Different old unit brought back on a new receipt",
        "claimed_reason": "Customer claims right speaker is not working and asks for a cash refund.",
        "condition_detail": "Receipt shows serial number SNY-884120, but the headphones inside the box have serial number SNY-102944 with heavy earpad wear.",
        "counter_inspection_notes": [
            "Serial Mismatch: Original Store Receipt lists S/N SNY-884120, but the physical headphone band reads S/N SNY-102944.",
            "The returned unit is an older worn pair placed inside the new retail box.",
            "Return must be rejected because the item does not match the unit sold on receipt RCP-SR-2026-77412.",
        ],
        "status": "PENDING_REVIEW",
        "approval_slip_no": "SLIP-REJ-2026-4402",
    },
    {
        "ret_id": "RET-2026-8412",
        "claim_date": "2026-10-20 09:48 EAT",
        "store_branch": "Karen Waterfront Megastore (Nairobi)",
        "customer_name": "Beatrice Muthoni Kariuki",
        "customer_id": "CUST-KE-39201",
        "customer_phone": "+254 733 501 920",
        "sku": "NTB-PRO-900W-CHP",
        "product_name": "NutriBullet Pro 900W Blender",
        "category": "Small Kitchen Appliances",
        "supplier_name": "Kenwood & NutriBullet Service Center",
        "supplier_warranty_terms": "14-Day Store Refund Window; 365-Day Free Manufacturer Warranty Repair",
        "pos_receipt_no": "RCP-KW-2026-51029",
        "purchase_date": "2026-09-05",
        "days_since_purchase": 45,
        "policy_window_days": 14,
        "manufacturer_warranty_days": 365,
        "receipt_serial": "NTB-900W-447102",
        "physical_serial": "NTB-900W-447102",
        "retail_price_kes": 18500.0,
        "customer_physical_damage": False,
        "genuine_defect_verified": True,
        "fault_summary": "Motor overheating under normal use",
        "claimed_reason": "Motor base smells warm and stops spinning after 6 weeks of normal home use.",
        "condition_detail": "Bought 45 days ago (past the 14-day store refund policy), but well within the 365-day manufacturer warranty. Serial number matches receipt.",
        "counter_inspection_notes": [
            "Serial number NTB-900W-447102 matches Original Store Receipt RCP-KW-2026-51029.",
            "Purchased 45 days ago — 31 days past the 14-day store cash refund policy.",
            "Covered under the 12-month manufacturer warranty: book free warranty repair instead of paying cash from the store till.",
        ],
        "status": "PENDING_REVIEW",
        "approval_slip_no": "SLIP-REP-2026-4403",
    },
    {
        "ret_id": "RET-2026-8413",
        "claim_date": "2026-10-20 10:05 EAT",
        "store_branch": "Kilimani Express Store (Nairobi)",
        "customer_name": "David Kiprop Sang",
        "customer_id": "CUST-KE-55194",
        "customer_phone": "+254 720 618 441",
        "sku": "SAM-MW32-DG-BLK",
        "product_name": "Samsung 32L Digital Microwave Oven",
        "category": "Small Kitchen Appliances",
        "supplier_name": "Samsung Electronics East Africa",
        "supplier_warranty_terms": "14-Day Store Exchange & 12-Month Manufacturer Warranty",
        "pos_receipt_no": "RCP-KL-2026-99812",
        "purchase_date": "2026-10-15",
        "days_since_purchase": 5,
        "policy_window_days": 14,
        "manufacturer_warranty_days": 365,
        "receipt_serial": "SAM-MW32-551920",
        "physical_serial": "SAM-MW32-551920",
        "retail_price_kes": 21500.0,
        "customer_physical_damage": False,
        "genuine_defect_verified": True,
        "fault_summary": "Touch keypad not responding out of the box (Factory Fault)",
        "claimed_reason": "Start and timer buttons on the front touch panel do not respond when pressed.",
        "condition_detail": "Bought 5 days ago (within 14-day return policy). Serial number matches receipt, glass turntable intact, genuine factory keypad fault.",
        "counter_inspection_notes": [
            "Original Store Receipt RCP-KL-2026-99812 verified — purchased 5 days ago (within 14-day return window).",
            "Rear serial sticker SAM-MW32-551920 matches receipt and box barcode.",
            "Tested at counter plug point: power light turns on, but touch membrane is unresponsive out of the box.",
        ],
        "status": "PENDING_REVIEW",
        "approval_slip_no": "SLIP-SAM-2026-4404",
    },
    {
        "ret_id": "RET-2026-8414",
        "claim_date": "2026-10-20 10:22 EAT",
        "store_branch": "Two Rivers Mall Flagship (Nairobi)",
        "customer_name": "Eng. Rajesh Patel",
        "customer_id": "CUST-KE-21908",
        "customer_phone": "+254 734 991 102",
        "sku": "LG-UHD55-4K-SMART",
        "product_name": "LG 55-Inch 4K Smart TV",
        "category": "Consumer Electronics",
        "supplier_name": "LG Electronics East Africa",
        "supplier_warranty_terms": "14-Day Store Replacement & 12-Month Manufacturer Warranty",
        "pos_receipt_no": "RCP-TR-2026-66301",
        "purchase_date": "2026-10-17",
        "days_since_purchase": 3,
        "policy_window_days": 14,
        "manufacturer_warranty_days": 365,
        "receipt_serial": "LG-TV55-773190",
        "physical_serial": "LG-TV55-773190",
        "retail_price_kes": 145000.0,
        "customer_physical_damage": False,
        "genuine_defect_verified": True,
        "fault_summary": "Vertical display line defect (Factory Panel Fault)",
        "claimed_reason": "Green vertical line appears across the middle of the TV screen right after unboxing.",
        "condition_detail": "Bought 3 days ago. Serial number LG-TV55-773190 matches receipt. Screen glass has zero cracks or impact marks.",
        "counter_inspection_notes": [
            "Original Store Receipt RCP-TR-2026-66301 verified — purchased 3 days ago (within 14-day store return policy).",
            "TV back-cover serial number LG-TV55-773190 matches receipt and settings menu.",
            "No external screen crack or drop marks; genuine factory display fault eligible for immediate exchange or refund.",
        ],
        "status": "CONFIRMED",
        "approval_slip_no": "SLIP-LGE-2026-4405",
    },
    {
        "ret_id": "RET-2026-8415",
        "claim_date": "2026-10-20 10:40 EAT",
        "store_branch": "Junction Mall Electronics Counter (Nairobi)",
        "customer_name": "Sylvia Naliaka Wafula",
        "customer_id": "CUST-KE-77419",
        "customer_phone": "+254 712 309 775",
        "sku": "HP-PAV15-I5-512",
        "product_name": "HP Pavilion 15 Laptop",
        "category": "Computers & Laptops",
        "supplier_name": "HP East Africa Authorized Partner",
        "supplier_warranty_terms": "14-Day Store Return Policy; 12-Month Warranty (Excludes Drops & Liquid Spills)",
        "pos_receipt_no": "RCP-JM-2026-31088",
        "purchase_date": "2026-10-01",
        "days_since_purchase": 19,
        "policy_window_days": 14,
        "manufacturer_warranty_days": 365,
        "receipt_serial": "HP-PAV15-339104",
        "physical_serial": "HP-PAV15-339104",
        "retail_price_kes": 60000.0,
        "customer_physical_damage": True,
        "genuine_defect_verified": False,
        "fault_summary": "Cracked screen & liquid spill on keyboard (Customer Physical Damage)",
        "claimed_reason": "Customer states laptop stopped turning on and requests a replacement unit.",
        "condition_detail": "Serial number matches receipt, but inspection shows a cracked top-left LCD corner, dented hinge, and sticky coffee residue under the keyboard.",
        "counter_inspection_notes": [
            "Serial number HP-PAV15-339104 matches Original Store Receipt RCP-JM-2026-31088 (bought 19 days ago).",
            "Physical inspection reveals impact crack on LCD screen and liquid spill corrosion on keyboard tray.",
            "Accidental customer damage is not covered by the store return policy or standard manufacturer warranty — reject return.",
        ],
        "status": "PENDING_REVIEW",
        "approval_slip_no": "SLIP-REJ-2026-4406",
    },
]


def get_initial_returns() -> List[Dict[str, Any]]:
    return [evaluate_return_claim(item) for item in RAW_SEED_RETURNS]
