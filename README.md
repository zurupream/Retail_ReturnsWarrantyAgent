# Customer Return & Warranty Verification Agent (`Retail_ReturnsWarrantyAgent`)

**Agent #11 — Retail Store Operations Suite**

A clear, everyday store-counter assistant that helps retail supervisors verify **Customer Returns, Store Receipts, and Manufacturer Warranty Coverage** in seconds before paying out store cash or issuing a replacement item.

---

## Single Core Concept: 3 Simple Store Counter Checks

When a customer brings an item back to the store counter asking for a refund or exchange, the agent checks **3 everyday rules**:

1. **Step 1 — Original Store Receipt & Returned Item Check**
   - Does the customer's **Original Store Receipt** match the **exact item and serial number** brought back to the counter?
2. **Step 2 — Store Return Days & Manufacturer Warranty Check**
   - Is the item within the **Store Return Policy Window** (`14-Day` or `30-Day` store refund/exchange window)?
   - If it is past the 14-day store refund window (for example, bought `45 days ago`), is it still covered under the **12-Month Manufacturer Warranty**?
   - Is the problem a **Genuine Factory Fault**, or **Customer Physical Damage** (cracked screen, liquid spill, or dropped unit)?
3. **Step 3 — Clear Store Counter Decision (`Customer Return Decision Slip`)**
   - **`Approve Refund or Exchange`** — Within the store return window, receipt matches the item's serial number, and a genuine factory fault is confirmed.
   - **`Send for Manufacturer Warranty Repair`** — Past the 14-day store refund window, but still within the 12-month manufacturer warranty period. Book a free warranty repair instead of giving out store cash.
   - **`Reject Return`** — Either the serial number on the item does not match the receipt, or the item has customer physical damage not covered by warranty.

---

## Seeded Store Return Requests (`KES 388,500` Total Queue)

| Return ID | Item & Price | 1. Receipt & Serial Match | 2. Return Days Check | 3. Fault / Condition | Store Counter Decision |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **`RET-2026-8410`** | Von Hotpoint 340L Double Door Refrigerator (`KES 89,500`) | **Matched** (`VHP-340L-992841`) | Bought `11 days ago` (`30-Day Policy`) | Compressor not cooling (Factory Fault) | **Approve Refund or Exchange** |
| **`RET-2026-8411`** | Sony WH-1000XM5 Wireless Headphones (`KES 54,000`) | **Serial Mismatch** (`SNY-884120` vs `SNY-102944`) | Bought `6 days ago` (`14-Day Policy`) | Different old unit brought back on a new receipt | **Reject Return — Wrong Serial Number** |
| **`RET-2026-8412`** | NutriBullet Pro 900W Blender (`KES 18,500`) | **Matched** (`NTB-900W-447102`) | Bought `45 days ago` (Past `14-Day` refund window; under `365-Day` warranty) | Motor overheating under normal use | **Send for Manufacturer Warranty Repair** |
| **`RET-2026-8413`** | Samsung 32L Digital Microwave Oven (`KES 21,500`) | **Matched** (`SAM-MW32-551920`) | Bought `5 days ago` (`14-Day Policy`) | Touch keypad not responding out of the box (Factory Fault) | **Approve Refund or Exchange** |
| **`RET-2026-8414`** | LG 55-Inch 4K Smart TV (`KES 145,000`) | **Matched** (`LG-TV55-773190`) | Bought `3 days ago` (`14-Day Policy`) | Vertical display line defect (Factory Panel Fault) | **Approve Refund or Exchange** |
| **`RET-2026-8415`** | HP Pavilion 15 Laptop (`KES 60,000`) | **Matched** (`HP-PAV15-339104`) | Bought `19 days ago` (`14-Day Policy`) | Cracked screen & liquid spill on keyboard (Customer Physical Damage) | **Reject Return — Customer Physical Damage** |
