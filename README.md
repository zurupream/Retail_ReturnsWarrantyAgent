# Multimodal Customer Return, Warranty & Refund Abuse Triage Agent (`Retail_ReturnsWarrantyAgent`)

**Agent #11 — Retail, Distribution & Manufacturing Suite**

An enterprise store-counter and loss-prevention workbench that combines **multimodal POS receipt & serial/lot inspection**, **deterministic return policy window & abuse velocity scoring**, and **automated upstream Supplier Return-to-Vendor (RTV) chargeback recovery**.

---

## Core Capabilities

1. **POS Receipt, Serial/Batch No. & Visual Defect Inspection**
   - Compares POS receipt serial/lot numbers against physical chassis serial plates and inner product batch codes.
   - Detects serial-swapped consumer electronics and broken hygiene seals on personal care items at the counter.
2. **Deterministic Policy Window, Abuse Score & Supplier Warranty Match**
   - Enforces category-specific return windows (`7-Day Cold-Chain & Personal Care`, `14-Day Consumer Electronics & Small Appliances`, `30-Day Major Appliances`).
   - Calculates a deterministic `0–100` Customer Abuse Risk Score from 60-day return velocity, lifetime return rate, and serial/tamper flags.
   - Matches genuine manufacturing defects and cold-chain transit excursions directly to upstream vendor RTV chargebacks and quality debit notes.
3. **1-Page Return Disposition & Supplier RTV Chargeback Slip**
   - Generates a print-ready 1-page disposition certificate and vendor RTV voucher via `window.print()`.

---

## Seeded Retail Return & Warranty Scenarios

| Return ID | Product & Category | Key Finding | Disposition & RTV Impact |
| :--- | :--- | :--- | :--- |
| **`RET-2026-8410`** | Von Hotpoint 340L Double Door Fridge (*Major Appliances*) | Day 11/30; Exact Serial Match `VHP-340L-992841`; Verified inverter compressor defect | **Approve Full Refund/Exchange + 100% Vendor RTV Chargeback (KES 68,500)** |
| **`RET-2026-8411`** | Sony WH-1000XM5 Headphones (*Consumer Electronics*) | POS Serial `SNY-XM5-884120` != Unit Serial `SNY-XM5-102944`; 9 returns in 60 days (Abuse Score 96/100) | **Reject Refund — Serial Swap Fraud Alert** |
| **`RET-2026-8412`** | NutriBullet Pro 900W Blender (*Small Appliances*) | Day 45 vs. 14-day retail window; Exact Serial Match `NTB-900W-447102` | **Deny Cash Refund — Route to Authorized Vendor Service Center** |
| **`RET-2026-8413`** | Brookside Greek Yogurt 6kg Multipack (*Cold-Chain Perishables*) | Day 1/7; Lot `BSK-LOT-202604A` matches +11.4°C transit excursion log | **Approve Refund + 100% Supplier Quality Debit Note (KES 3,480)** |
| **`RET-2026-8414`** | LG 55" OLED evo C3 4K Smart TV (*Consumer Electronics*) | Day 3/14; Exact Serial Match `LG-OLED55-773190`; Factory panel bonding defect | **Approve DOA Exchange + 100% Vendor RTV Credit Note (KES 142,000)** |
| **`RET-2026-8415`** | La Roche-Posay Effaclar Kit (*Personal Care*) | Broken hygiene seal + Lot mismatch (`#7721` vs `#5109`); Day 9/7; 6 returns in 60d | **Reject Refund — Hygiene Tamper & Lot Mismatch Alert** |
