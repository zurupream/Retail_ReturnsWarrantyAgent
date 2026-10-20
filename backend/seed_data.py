from typing import Dict, Any, List, Optional
import copy

CATEGORY_POLICIES: Dict[str, Dict[str, Any]] = {
    "Major Appliances": {
        "policy_window_days": 30,
        "requires_serial_match": True,
        "hygiene_seal_required": False,
        "supplier_rtv_recovery_rate": 1.0,
        "policy_name": "30-Day Major Appliance DOA & Compressor Warranty Policy",
    },
    "Consumer Electronics": {
        "policy_window_days": 14,
        "requires_serial_match": True,
        "hygiene_seal_required": False,
        "supplier_rtv_recovery_rate": 1.0,
        "policy_name": "14-Day Consumer Electronics Serial-Verified DOA Policy",
    },
    "Small Domestic Appliances": {
        "policy_window_days": 14,
        "requires_serial_match": True,
        "hygiene_seal_required": False,
        "supplier_rtv_recovery_rate": 0.85,
        "policy_name": "14-Day Small Appliance Return & Authorized Repair Policy",
    },
    "Cold-Chain Perishables": {
        "policy_window_days": 7,
        "requires_serial_match": True,
        "hygiene_seal_required": False,
        "supplier_rtv_recovery_rate": 1.0,
        "policy_name": "7-Day Fresh & Cold-Chain Lot Quality Guarantee",
    },
    "Personal Care & Dermocosmetics": {
        "policy_window_days": 7,
        "requires_serial_match": True,
        "hygiene_seal_required": True,
        "supplier_rtv_recovery_rate": 0.0,
        "policy_name": "7-Day Unopened Hygiene-Sealed Personal Care Policy",
    },
}


def evaluate_return_claim(claim: Dict[str, Any]) -> Dict[str, Any]:
    """
    Deterministic Python engine verifying:
    1. Days Since Purchase vs. Category Return Policy Window (7 / 14 / 30 Days)
    2. Serial / Batch Number Match (POS Receipt Serial == Physical Item Serial)
    3. Customer Return Frequency & Abuse Risk Score (0-100)
    4. Upstream Supplier Warranty Coverage & RTV Chargeback Recovery Amount
    """
    category = claim.get("category", "Consumer Electronics")
    policy = CATEGORY_POLICIES.get(category, CATEGORY_POLICIES["Consumer Electronics"])

    policy_window_days = int(claim.get("policy_window_days", policy["policy_window_days"]))
    days_since_purchase = int(claim.get("days_since_purchase", 0))
    within_policy_window = days_since_purchase <= policy_window_days
    window_variance_days = days_since_purchase - policy_window_days

    receipt_serial = str(claim.get("receipt_serial", "")).strip().upper()
    physical_serial = str(claim.get("physical_serial", "")).strip().upper()
    serial_match = (receipt_serial == physical_serial) and bool(receipt_serial)

    returns_60d = int(claim.get("customer_returns_60d", 0))
    lifetime_return_rate_pct = float(claim.get("customer_lifetime_return_rate_pct", 3.5))
    tamper_detected = bool(claim.get("tamper_or_swap_detected", False))
    genuine_defect_verified = bool(claim.get("genuine_defect_verified", True))

    # Deterministic Abuse Risk Score calculation (0 - 100)
    abuse_score = 5
    if not serial_match:
        abuse_score += 55
    if tamper_detected:
        abuse_score += 30
    if returns_60d >= 6:
        abuse_score += 35
    elif returns_60d >= 3:
        abuse_score += 18
    elif returns_60d >= 2:
        abuse_score += 10
    if not within_policy_window:
        abuse_score += 22
    if lifetime_return_rate_pct >= 25.0:
        abuse_score += 15
    if genuine_defect_verified and serial_match and not tamper_detected and returns_60d <= 1:
        abuse_score = max(4, min(abuse_score, 12))

    abuse_score = min(99, max(2, abuse_score))

    if abuse_score >= 75:
        abuse_tier = "CRITICAL_FRAUD_RISK"
    elif abuse_score >= 40:
        abuse_tier = "MODERATE_POLICY_EXCEPTION"
    else:
        abuse_tier = "LOW_RISK_GENUINE"

    retail_price_kes = float(claim.get("retail_price_kes", 0.0))
    wholesale_cost_kes = float(claim.get("wholesale_cost_kes", round(retail_price_kes * 0.76, 2)))

    # Determine Recommended Disposition & Upstream Supplier RTV Recovery
    if not serial_match or tamper_detected:
        recommended_disposition = "REJECT_FRAUD_SERIAL_TAMPER"
        disposition_label = "Reject Refund — Serial / Lot Mismatch & Tamper Alert"
        customer_refund_kes = 0.0
        supplier_rtv_eligible = False
        supplier_rtv_recovery_kes = 0.0
        net_retailer_loss_kes = 0.0
        rtv_mechanism = "None — Loss Prevention Incident Logged"
    elif not within_policy_window:
        recommended_disposition = "ROUTE_AUTHORIZED_WARRANTY_REPAIR"
        disposition_label = "Deny Cash Refund (Out-of-Window) — Route to Vendor Service Center"
        customer_refund_kes = 0.0
        supplier_rtv_eligible = True
        supplier_rtv_recovery_kes = round(wholesale_cost_kes * 0.25, 2)
        net_retailer_loss_kes = 0.0
        rtv_mechanism = "Vendor Service Center Warranty Repair Transfer"
    elif genuine_defect_verified:
        if category == "Cold-Chain Perishables":
            recommended_disposition = "APPROVE_REFUND_AND_SUPPLIER_DEBIT_NOTE"
            disposition_label = "Approve Instant Refund + Issue 100% Supplier Quality Debit Note"
            rtv_mechanism = "Automated ERP Supplier Quality Debit Note & Batch Quarantine"
        else:
            recommended_disposition = "APPROVE_REFUND_AND_VENDOR_RTV"
            disposition_label = "Approve Full Refund / DOA Exchange + 100% Vendor RTV Chargeback"
            rtv_mechanism = "Automated Vendor RTV Chargeback & Defective Dock Quarantine"
        customer_refund_kes = retail_price_kes
        supplier_rtv_eligible = True
        supplier_rtv_recovery_kes = wholesale_cost_kes
        net_retailer_loss_kes = 0.0
    else:
        recommended_disposition = "STORE_CREDIT_RESTOCK_FEE"
        disposition_label = "Approve Conditional Store Credit (15% Restocking Fee)"
        customer_refund_kes = round(retail_price_kes * 0.85, 2)
        supplier_rtv_eligible = False
        supplier_rtv_recovery_kes = 0.0
        net_retailer_loss_kes = 0.0
        rtv_mechanism = "Internal Markdown Restock to Open-Box Clearance"

    checks = [
        {
            "check_id": "CHK-WINDOW",
            "title": "Return Policy Window Check",
            "expected": f"<= {policy_window_days} Days ({category})",
            "actual": f"{days_since_purchase} Days Since Purchase",
            "passed": within_policy_window,
            "detail": (
                f"Within {policy_window_days}-day window ({abs(window_variance_days)} days remaining)"
                if within_policy_window
                else f"Exceeded {policy_window_days}-day policy window by {window_variance_days} days"
            ),
        },
        {
            "check_id": "CHK-SERIAL",
            "title": "POS Receipt vs. Physical Serial/Batch Match",
            "expected": receipt_serial,
            "actual": physical_serial,
            "passed": serial_match and not tamper_detected,
            "detail": (
                "Exact barcode & OCR serial/lot match verified on unit"
                if (serial_match and not tamper_detected)
                else "CRITICAL MISMATCH: Physical serial/lot or hygiene seal does not match POS receipt"
            ),
        },
        {
            "check_id": "CHK-ABUSE",
            "title": "Customer Return Velocity & Abuse Score",
            "expected": "<= 2 Returns / 60d (Score < 40)",
            "actual": f"{returns_60d} Returns / 60d (Score: {abuse_score}/100)",
            "passed": abuse_score < 40,
            "detail": (
                f"Low return velocity ({lifetime_return_rate_pct}% lifetime return rate)"
                if abuse_score < 40
                else f"Elevated return frequency ({returns_60d} claims in 60 days, {lifetime_return_rate_pct}% rate)"
            ),
        },
        {
            "check_id": "CHK-RTV",
            "title": "Upstream Supplier RTV Warranty Recovery",
            "expected": f"KES {wholesale_cost_kes:,.2f} Covered",
            "actual": f"KES {supplier_rtv_recovery_kes:,.2f} Recoverable",
            "passed": supplier_rtv_eligible and supplier_rtv_recovery_kes > 0,
            "detail": rtv_mechanism,
        },
    ]

    enriched = copy.deepcopy(claim)
    enriched.update(
        {
            "policy_window_days": policy_window_days,
            "policy_name": policy["policy_name"],
            "within_policy_window": within_policy_window,
            "window_variance_days": window_variance_days,
            "serial_match": serial_match,
            "abuse_risk_score": abuse_score,
            "abuse_tier": abuse_tier,
            "recommended_disposition": recommended_disposition,
            "disposition_label": disposition_label,
            "customer_refund_kes": customer_refund_kes,
            " wholesale_cost_kes": wholesale_cost_kes,
            "wholesale_cost_kes": wholesale_cost_kes,
            "supplier_rtv_eligible": supplier_rtv_eligible,
            "supplier_rtv_recovery_kes": supplier_rtv_recovery_kes,
            "net_retailer_loss_kes": net_retailer_loss_kes,
            "rtv_mechanism": rtv_mechanism,
            "deterministic_checks": checks,
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
        "loyalty_tier": "Platinum Member (7 Years)",
        "sku": "VHP-REF-340L-INX",
        "product_name": "Von Hotpoint 340L No-Frost Double Door Refrigerator (Inox)",
        "category": "Major Appliances",
        "supplier_name": "Hotpoint Appliances Kenya Ltd",
        "supplier_vendor_code": "VND-HPK-001",
        "supplier_warranty_terms": "24-Month Compressor & 30-Day Full DOA RTV Chargeback",
        "pos_receipt_no": "POS-WL-2026-99104",
        "purchase_date": "2026-10-09",
        "days_since_purchase": 11,
        "policy_window_days": 30,
        "receipt_serial": "VHP-340L-992841",
        "physical_serial": "VHP-340L-992841",
        "retail_price_kes": 89500.0,
        "wholesale_cost_kes": 68500.0,
        "customer_returns_60d": 0,
        "customer_lifetime_return_rate_pct": 1.8,
        "tamper_or_swap_detected": False,
        "genuine_defect_verified": True,
        "claimed_reason": "Inverter compressor fails to engage; freezer compartment warms to +14°C with error code E04.",
        "visual_inspection_notes": [
            "Factory serial plate VHP-340L-992841 intact and matches POS receipt POS-WL-2026-99104.",
            "Bench diagnostic confirms factory inverter relay failure (0.0A compressor draw) with zero external denting.",
            "All original packaging, glass shelves, and warranty card present.",
        ],
        "evidence_photos": [
            {"label": "POS Receipt OCR Scan", "tag": "Receipt #POS-WL-2026-99104 (Verified)"},
            {"label": "Rear Compressor Serial Plate", "tag": "S/N: VHP-340L-992841 (Exact Match)"},
            {"label": "Digital Panel Diagnostic Code", "tag": "Fault Code E04 — Inverter Open Circuit"},
        ],
        "status": "PENDING_TRIAGE",
        "rtv_claim_number": "RTV-HPK-2026-4401",
    },
    {
        "ret_id": "RET-2026-8411",
        "claim_date": "2026-10-20 09:15 EAT",
        "store_branch": "Sarit Centre Electronics Hub (Nairobi)",
        "customer_name": "Kevin Omondi Otieno",
        "customer_id": "CUST-KE-88310",
        "loyalty_tier": "Standard Account (Flagged Velocity)",
        "sku": "SNY-WH1000XM5-BLK",
        "product_name": "Sony WH-1000XM5 Wireless Noise-Canceling Headphones",
        "category": "Consumer Electronics",
        "supplier_name": "Sony Middle East & Africa (Authorized Dist.)",
        "supplier_vendor_code": "VND-SNY-014",
        "supplier_warranty_terms": "14-Day Serial-Matched DOA Return (Strict Serial Audit Required)",
        "pos_receipt_no": "POS-SR-2026-77412",
        "purchase_date": "2026-10-14",
        "days_since_purchase": 6,
        "policy_window_days": 14,
        "receipt_serial": "SNY-XM5-884120",
        "physical_serial": "SNY-XM5-102944",
        "retail_price_kes": 54000.0,
        "wholesale_cost_kes": 41200.0,
        "customer_returns_60d": 9,
        "customer_lifetime_return_rate_pct": 64.2,
        "tamper_or_swap_detected": True,
        "genuine_defect_verified": False,
        "claimed_reason": "Right earcup driver dead out of the box; requesting immediate cash refund.",
        "visual_inspection_notes": [
            "ALERT: Box barcode shows S/N SNY-XM5-884120, but inner headband laser-etched serial reads SNY-XM5-102944 (2024 production batch).",
            "Heavy earpad scuffing and third-party USB cable substituted inside new retail box.",
            "Customer has completed 9 high-value electronics returns across 4 Nairobi branches in the past 60 days.",
        ],
        "evidence_photos": [
            {"label": "POS Receipt & Retail Box Label", "tag": "Receipt S/N: SNY-XM5-884120"},
            {"label": "Headband Laser Serial Macro", "tag": "Physical S/N: SNY-XM5-102944 (MISMATCH!)"},
            {"label": "Hinge & Earpad Wear Macro", "tag": "Heavy Prior Wear & Heat-Gun Sticker Peel"},
        ],
        "status": "PENDING_TRIAGE",
        "rtv_claim_number": "N/A-FRAUD-BLOCK",
    },
    {
        "ret_id": "RET-2026-8412",
        "claim_date": "2026-10-20 09:48 EAT",
        "store_branch": "Karen Waterfront Megastore (Nairobi)",
        "customer_name": "Beatrice Muthoni Kariuki",
        "customer_id": "CUST-KE-39201",
        "loyalty_tier": "Gold Member (3 Years)",
        "sku": "NTB-PRO-900W-CHP",
        "product_name": "NutriBullet Pro 900W High-Speed Extractor Blender",
        "category": "Small Domestic Appliances",
        "supplier_name": "De'Longhi Kenwood East Africa Dist.",
        "supplier_vendor_code": "VND-DLK-008",
        "supplier_warranty_terms": "14-Day Retail Exchange; Days 15-365 Authorized Service Center Repair Only",
        "pos_receipt_no": "POS-KW-2026-51029",
        "purchase_date": "2026-09-05",
        "days_since_purchase": 45,
        "policy_window_days": 14,
        "receipt_serial": "NTB-900W-447102",
        "physical_serial": "NTB-900W-447102",
        "retail_price_kes": 18500.0,
        "wholesale_cost_kes": 13600.0,
        "customer_returns_60d": 2,
        "customer_lifetime_return_rate_pct": 8.4,
        "tamper_or_swap_detected": False,
        "genuine_defect_verified": True,
        "claimed_reason": "Extractor blade gasket leaking and motor clutch slipping after 6 weeks of daily use.",
        "visual_inspection_notes": [
            "Serial number NTB-900W-447102 matches POS receipt from 45 days ago (31 days past 14-day retail return window).",
            "Motor base is covered under 12-month manufacturer service warranty, but ineligible for counter cash refund.",
            "Recommended routing to De'Longhi Kenwood Authorized Service Center with zero store margin erosion.",
        ],
        "evidence_photos": [
            {"label": "POS Receipt Date Verification", "tag": "Purchased 2026-09-05 (45 Days Elapsed)"},
            {"label": "Motor Base Serial Sticker", "tag": "S/N: NTB-900W-447102 (Verified Match)"},
            {"label": "Extractor Clutch Gear Wear", "tag": "Eligible for Vendor Service Center Repair"},
        ],
        "status": "PENDING_TRIAGE",
        "rtv_claim_number": "SRV-DLK-2026-1192",
    },
    {
        "ret_id": "RET-2026-8413",
        "claim_date": "2026-10-20 10:05 EAT",
        "store_branch": "Kilimani Express Supermarket (Nairobi)",
        "customer_name": "Chef David Kiprop Sang",
        "customer_id": "CUST-KE-55194",
        "loyalty_tier": "Platinum B2B Hospitality Account",
        "sku": "BSK-GRK-YOG-6KG",
        "product_name": "Brookside Farm Fresh Greek Yogurt 1kg x 6 Catering Multipack",
        "category": "Cold-Chain Perishables",
        "supplier_name": "Brookside Dairy Limited (Ruiru Plant)",
        "supplier_vendor_code": "VND-BSK-002",
        "supplier_warranty_terms": "100% Cold-Chain Spoilage Debit Note within 7 Days of Purchase",
        "pos_receipt_no": "POS-KL-2026-99812",
        "purchase_date": "2026-10-19",
        "days_since_purchase": 1,
        "policy_window_days": 7,
        "receipt_serial": "BSK-LOT-202604A",
        "physical_serial": "BSK-LOT-202604A",
        "retail_price_kes": 4650.0,
        "wholesale_cost_kes": 3480.0,
        "customer_returns_60d": 0,
        "customer_lifetime_return_rate_pct": 0.6,
        "tamper_or_swap_detected": False,
        "genuine_defect_verified": True,
        "claimed_reason": "Curdled texture and bloated foil lids upon opening 1 day after purchase despite 18 days remaining to expiry.",
        "visual_inspection_notes": [
            "Lot #BSK-LOT-202604A matches POS receipt and cold-chain receiving manifest from Truck #KDK-441Z.",
            "Receiving IoT reefer log shows +11.4°C transit excursion during supplier delivery.",
            "Eligible for immediate customer refund and 100% Supplier Quality Debit Note + aisle batch pull.",
        ],
        "evidence_photos": [
            {"label": "POS Receipt & Lot Inkjet Scan", "tag": "Lot: BSK-LOT-202604A (1 Day Since Purchase)"},
            {"label": "Foil Lid Bloating Inspection", "tag": "Confirmed Thermal Spoilage Before Expiry"},
            {"label": "Reefer Transit Logger Printout", "tag": "+11.4°C Supplier Delivery Excursion"},
        ],
        "status": "PENDING_TRIAGE",
        "rtv_claim_number": "DBN-BSK-2026-0884",
    },
    {
        "ret_id": "RET-2026-8414",
        "claim_date": "2026-10-20 10:22 EAT",
        "store_branch": "Two Rivers Mall Flagship (Nairobi)",
        "customer_name": "Eng. Rajesh Patel",
        "customer_id": "CUST-KE-21908",
        "loyalty_tier": "Platinum Member (5 Years)",
        "sku": "LG-OLED55C3-4K",
        "product_name": "LG 55-Inch OLED evo C3 4K Smart TV",
        "category": "Consumer Electronics",
        "supplier_name": "LG Electronics East Africa (Official Dist.)",
        "supplier_vendor_code": "VND-LGE-003",
        "supplier_warranty_terms": "14-Day DOA Panel Replacement & 100% Vendor RTV Credit Note",
        "pos_receipt_no": "POS-TR-2026-66301",
        "purchase_date": "2026-10-17",
        "days_since_purchase": 3,
        "policy_window_days": 14,
        "receipt_serial": "LG-OLED55-773190",
        "physical_serial": "LG-OLED55-773190",
        "retail_price_kes": 185000.0,
        "wholesale_cost_kes": 142000.0,
        "customer_returns_60d": 0,
        "customer_lifetime_return_rate_pct": 1.1,
        "tamper_or_swap_detected": False,
        "genuine_defect_verified": True,
        "claimed_reason": "Persistent green vertical pixel column across center of OLED panel upon initial wall-mount power-on.",
        "visual_inspection_notes": [
            "Chassis serial LG-OLED55-773190 and internal EDID firmware serial both match POS receipt POS-TR-2026-66301.",
            "Zero glass impact or pressure marks; classic factory COF bonding defect verified on test bench.",
            "Qualifies for immediate customer exchange/refund and 100% LG DOA RTV Credit Note.",
        ],
        "evidence_photos": [
            {"label": "POS Receipt & EDID Firmware Readout", "tag": "S/N: LG-OLED55-773190 (100% Verified)"},
            {"label": "OLED Panel Power-On Test", "tag": "Vertical Green Subpixel Driver Fault (No Impact)"},
            {"label": "Factory Protective Film & Box", "tag": "Original Packaging & Accessories Complete"},
        ],
        "status": "AUTHORIZED",
        "rtv_claim_number": "RTV-LGE-2026-9012",
    },
    {
        "ret_id": "RET-2026-8415",
        "claim_date": "2026-10-20 10:40 EAT",
        "store_branch": "Junction Mall Pharmacy & Beauty Counter (Nairobi)",
        "customer_name": "Sylvia Naliaka Wafula",
        "customer_id": "CUST-KE-77419",
        "loyalty_tier": "Silver Member",
        "sku": "LRP-EFF-DUO-KIT",
        "product_name": "La Roche-Posay Effaclar Duo+ Dermocosmetic Regimen Kit",
        "category": "Personal Care & Dermocosmetics",
        "supplier_name": "L'Oréal East Africa Ltd",
        "supplier_vendor_code": "VND-LOR-019",
        "supplier_warranty_terms": "Unopened Tamper-Sealed Returns Within 7 Days Only; Opened Cosmetics Non-Returnable",
        "pos_receipt_no": "POS-JM-2026-31088",
        "purchase_date": "2026-10-11",
        "days_since_purchase": 9,
        "policy_window_days": 7,
        "receipt_serial": "LRP-BATCH-7721",
        "physical_serial": "LRP-BATCH-5109",
        "retail_price_kes": 9800.0,
        "wholesale_cost_kes": 6900.0,
        "customer_returns_60d": 6,
        "customer_lifetime_return_rate_pct": 48.0,
        "tamper_or_swap_detected": True,
        "genuine_defect_verified": False,
        "claimed_reason": "Claimed allergic reaction and requested full cash refund.",
        "visual_inspection_notes": [
            "Holographic hygiene seal torn open; inner tube crimp bears Lot #LRP-BATCH-5109 whereas outer carton & receipt show #LRP-BATCH-7721.",
            "Tube weight is 42% lighter than factory spec and filled with generic lotion.",
            "Submitted 9 days after purchase (past 7-day personal care window) with 6 prior beauty returns in 60 days.",
        ],
        "evidence_photos": [
            {"label": "Carton vs Tube Crimp Lot Macro", "tag": "Carton #7721 vs Tube #5109 (MISMATCH)"},
            {"label": "Broken Holographic Hygiene Seal", "tag": "Tamper Evidence & Diluted Product Weight"},
            {"label": "Customer Return Velocity Profile", "tag": "6 Beauty Returns in 60 Days (Score 89/100)"},
        ],
        "status": "PENDING_TRIAGE",
        "rtv_claim_number": "N/A-HYGIENE-REJECT",
    },
]


def get_initial_returns() -> List[Dict[str, Any]]:
    return [evaluate_return_claim(item) for item in RAW_SEED_RETURNS]
