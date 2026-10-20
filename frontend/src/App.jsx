import React, { useState, useEffect } from 'react';
import {
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ScanBarcode,
  FileCheck2,
  Printer,
  Bot,
  Send,
  LogOut,
  SlidersHorizontal,
  ArrowUpRight,
  PackageCheck,
  Clock,
  UserCheck,
  Building2,
  Receipt
} from 'lucide-react';
import SignInPage from './components/SignInPage';

const STORAGE_KEY = 'retail_returns_warranty_agent_user_v1';

export default function App() {
  const [user, setUser] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const [activeTab, setActiveTab] = useState('queue'); // 'queue' | 'workbench' | 'copilot' | 'slip'
  const [returnsList, setReturnsList] = useState([]);
  const [kpis, setKpis] = useState(null);
  const [selectedRetId, setSelectedRetId] = useState('RET-2026-8410');
  const [loading, setLoading] = useState(false);
  const [authBanner, setAuthBanner] = useState('');
  const [inspectorNotes, setInspectorNotes] = useState('');

  // Simulator state in Tab 2
  const [simForm, setSimForm] = useState({
    product_name: 'Samsung 65" QLED 4K Smart TV',
    category: 'Consumer Electronics',
    supplier_name: 'Samsung Electronics East Africa',
    retail_price_kes: 145000,
    days_since_purchase: 8,
    receipt_serial: 'SAM-Q65-90012',
    physical_serial: 'SAM-Q65-90012',
    customer_returns_60d: 0,
    tamper_or_swap_detected: false,
    genuine_defect_verified: true,
  });
  const [simResult, setSimResult] = useState(null);

  // AI Co-Pilot state in Tab 3
  const [chatMessages, setChatMessages] = useState([
    {
      role: 'assistant',
      model: 'gemini-2.5-flash',
      text: 'Welcome to the Returns, Warranty & Supplier RTV Co-Pilot. Ask me to audit any return claim, verify serial-swap fraud risk, or calculate upstream vendor RTV chargeback recovery.',
    },
  ]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);

  const fetchReturns = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/returns');
      const data = await res.json();
      if (data.returns) {
        setReturnsList(data.returns);
        setKpis(data.kpis);
      }
    } catch (err) {
      console.error('Failed to load returns:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) {
      fetchReturns();
    }
  }, [user]);

  const handleSignIn = (authenticatedUser) => {
    setUser(authenticatedUser);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(authenticatedUser));
    } catch {
      // ignore storage errors
    }
  };

  const handleSignOut = () => {
    setUser(null);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  };

  if (!user) {
    return <SignInPage onSignIn={handleSignIn} />;
  }

  const selectedClaim =
    returnsList.find((r) => r.ret_id === selectedRetId) || returnsList[0] || null;

  const handleAuthorizeDisposition = async () => {
    if (!selectedClaim) return;
    setAuthBanner('');
    try {
      const res = await fetch(`/api/returns/${selectedClaim.ret_id}/authorize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          authorized_by: `${user.name} (${user.email})`,
          inspector_notes:
            inspectorNotes.trim() ||
            `Disposition authorized by ${user.name}. Upstream RTV Reference ${selectedClaim.rtv_claim_number} locked.`,
        }),
      });
      const data = await res.json();
      if (res.ok && data.claim) {
        setReturnsList((prev) =>
          prev.map((item) => (item.ret_id === data.claim.ret_id ? data.claim : item))
        );
        if (data.kpis) setKpis(data.kpis);
        setAuthBanner(
          `Authorized ${data.claim.ret_id}: ${data.claim.disposition_label} • RTV Ref: ${data.claim.rtv_claim_number}`
        );
      }
    } catch (err) {
      console.error('Authorization error:', err);
    }
  };

  const handleRunSimulation = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/returns/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...simForm,
          retail_price_kes: Number(simForm.retail_price_kes),
          days_since_purchase: Number(simForm.days_since_purchase),
          customer_returns_60d: Number(simForm.customer_returns_60d),
        }),
      });
      const data = await res.json();
      if (data.simulation) {
        setSimResult(data.simulation);
      }
    } catch (err) {
      console.error('Simulation failed:', err);
    }
  };

  const handleAskCopilot = async (promptText) => {
    const question = (promptText || chatInput).trim();
    if (!question) return;
    setChatInput('');
    setChatMessages((prev) => [...prev, { role: 'user', text: question }]);
    setChatLoading(true);
    try {
      const res = await fetch('/api/agent/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question,
          ret_id: selectedClaim ? selectedClaim.ret_id : null,
        }),
      });
      const data = await res.json();
      setChatMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          model: data.model || 'gemini-2.5-flash',
          text: data.answer || 'No response generated.',
        },
      ]);
    } catch (err) {
      setChatMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          model: 'fallback',
          text: 'Unable to reach AI Co-Pilot endpoint. Please try again.',
        },
      ]);
    } finally {
      setChatLoading(false);
    }
  };

  const getDispositionBadge = (claim) => {
    if (!claim) return null;
    if (claim.recommended_disposition === 'REJECT_FRAUD_SERIAL_TAMPER') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200">
          <XCircle className="w-3.5 h-3.5" />
          Reject Refund (Fraud / Tamper Alert)
        </span>
      );
    }
    if (claim.recommended_disposition === 'ROUTE_AUTHORIZED_WARRANTY_REPAIR') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200">
          <AlertTriangle className="w-3.5 h-3.5" />
          Out-of-Window — Route Vendor Repair
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
        <CheckCircle2 className="w-3.5 h-3.5" />
        Approve + 100% Vendor RTV Recovery
      </span>
    );
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
      {/* Top Navigation Bar (Hidden during print) */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-20 print:hidden">
        <div className="max-w-7xl mx-auto px-6 py-3.5 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-sm">
              <RefreshCw className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-200">
                  Agent #11 • Retail &amp; Distribution
                </span>
                <span className="text-xs text-slate-500">
                  POS Serial Verification • Abuse Scoring • Vendor RTV Chargeback
                </span>
              </div>
              <h1 className="text-base sm:text-lg font-bold text-slate-900">
                Multimodal Customer Return, Warranty &amp; Refund Abuse Triage Agent
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-right hidden sm:block">
              <div className="text-xs font-bold text-slate-900">{user.name}</div>
              <div className="text-[11px] text-slate-500">{user.email}</div>
            </div>
            <button
              onClick={handleSignOut}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 transition cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Sign Out</span>
            </button>
          </div>
        </div>

        {/* 4-Tab Navigation Strip */}
        <div className="max-w-7xl mx-auto px-6 flex overflow-x-auto gap-2 border-t border-slate-100 pt-2 pb-2">
          {[
            {
              id: 'queue',
              label: 'Tab 1: Customer Return & Warranty Triage Queue',
              icon: PackageCheck,
            },
            {
              id: 'workbench',
              label: 'Tab 2: Multimodal Receipt, Serial & Supplier RTV Workbench',
              icon: ScanBarcode,
            },
            {
              id: 'copilot',
              label: 'Tab 3: Returns & Warranty AI Co-Pilot',
              icon: Bot,
            },
            {
              id: 'slip',
              label: 'Tab 4: 1-Page Return Disposition & Supplier RTV Claim Slip',
              icon: FileCheck2,
            },
          ].map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition cursor-pointer ${
                  active
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </header>

      {/* Main Content Container */}
      <main className="max-w-7xl mx-auto px-6 py-6 w-full flex-1 space-y-6">
        {/* Executive KPI Strip (Hidden during print) */}
        {kpis && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 print:hidden">
            <div className="bg-white rounded-2xl p-4 border border-slate-200/90 shadow-sm">
              <div className="text-xs font-medium text-slate-500">
                Active Return &amp; Warranty Queue
              </div>
              <div className="text-2xl font-bold text-slate-900 mt-1">
                {kpis.total_claims} Claims
              </div>
              <div className="text-xs text-slate-600 mt-1">
                Retail Value: <span className="font-semibold">KES {kpis.total_claimed_retail_kes.toLocaleString()}</span>
              </div>
            </div>

            <div className="bg-white rounded-2xl p-4 border border-slate-200/90 shadow-sm">
              <div className="text-xs font-medium text-slate-500">
                Upstream Supplier RTV Recovery
              </div>
              <div className="text-2xl font-bold text-emerald-700 mt-1">
                KES {kpis.total_supplier_rtv_recovery_kes.toLocaleString()}
              </div>
              <div className="text-xs text-emerald-700 font-medium mt-1">
                100% Vendor Chargeback &amp; Debit Notes
              </div>
            </div>

            <div className="bg-white rounded-2xl p-4 border border-slate-200/90 shadow-sm">
              <div className="text-xs font-medium text-slate-500">
                Fraud &amp; Out-of-Window Protected
              </div>
              <div className="text-2xl font-bold text-indigo-700 mt-1">
                KES {kpis.fraud_and_out_of_window_protected_kes.toLocaleString()}
              </div>
              <div className="text-xs text-indigo-700 font-medium mt-1">
                Cash Leakage Prevented at Counter
              </div>
            </div>

            <div className="bg-white rounded-2xl p-4 border border-slate-200/90 shadow-sm">
              <div className="text-xs font-medium text-slate-500">
                Serial / Lot Mismatch Alerts
              </div>
              <div className="text-2xl font-bold text-rose-600 mt-1">
                {kpis.serial_or_tamper_alerts} Critical Alerts
              </div>
              <div className="text-xs text-slate-600 mt-1">
                Authorized Dispositions: <span className="font-semibold">{kpis.authorized_dispositions}/{kpis.total_claims}</span>
              </div>
            </div>
          </div>
        )}

        {/* TAB 1: Customer Return & Warranty Triage Queue */}
        {activeTab === 'queue' && (
          <div className="space-y-5">
            <div className="bg-white rounded-2xl border border-slate-200/90 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-bold text-slate-900">
                    Store Counter Return, Warranty &amp; Refund Abuse Triage Queue
                  </h2>
                  <p className="text-xs text-slate-500">
                    Click any claim row to inspect POS receipt serial matching, policy window compliance, and vendor RTV chargeback recovery.
                  </p>
                </div>
                <button
                  onClick={fetchReturns}
                  disabled={loading}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 transition cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                  <span>Refresh Queue</span>
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                      <th className="py-3.5 px-4">Return ID &amp; Branch</th>
                      <th className="py-3.5 px-4">Product &amp; Category</th>
                      <th className="py-3.5 px-4">Window Audit</th>
                      <th className="py-3.5 px-4">POS vs. Unit Serial/Lot</th>
                      <th className="py-3.5 px-4">Abuse Risk Score</th>
                      <th className="py-3.5 px-4">Supplier RTV Recovery</th>
                      <th className="py-3.5 px-4">Recommended Disposition</th>
                      <th className="py-3.5 px-4 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200/80 text-xs">
                    {returnsList.map((item) => {
                      const isSelected = selectedClaim && selectedClaim.ret_id === item.ret_id;
                      return (
                        <tr
                          key={item.ret_id}
                          onClick={() => setSelectedRetId(item.ret_id)}
                          className={`hover:bg-indigo-50/40 transition cursor-pointer ${
                            isSelected ? 'bg-indigo-50/60' : ''
                          }`}
                        >
                          <td className="py-3.5 px-4">
                            <div className="font-bold text-slate-900">{item.ret_id}</div>
                            <div className="text-[11px] text-slate-500">{item.store_branch}</div>
                            <div className="text-[11px] text-slate-500 font-medium mt-0.5">
                              {item.customer_name}
                            </div>
                          </td>
                          <td className="py-3.5 px-4">
                            <div className="font-semibold text-slate-900">{item.product_name}</div>
                            <div className="text-[11px] text-slate-500">
                              {item.category} • Retail: <span className="font-semibold text-slate-700">KES {item.retail_price_kes.toLocaleString()}</span>
                            </div>
                          </td>
                          <td className="py-3.5 px-4">
                            <span
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-semibold ${
                                item.within_policy_window
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                  : 'bg-amber-50 text-amber-800 border border-amber-200'
                              }`}
                            >
                              <Clock className="w-3 h-3" />
                              {item.days_since_purchase}d / {item.policy_window_days}d Window
                            </span>
                          </td>
                          <td className="py-3.5 px-4 font-mono text-[11px]">
                            <div className="text-slate-700">POS: {item.receipt_serial}</div>
                            <div
                              className={
                                item.serial_match && !item.tamper_or_swap_detected
                                  ? 'text-emerald-700 font-semibold'
                                  : 'text-rose-600 font-bold'
                              }
                            >
                              Unit: {item.physical_serial}
                            </div>
                          </td>
                          <td className="py-3.5 px-4">
                            <div className="flex items-center gap-2">
                              <span
                                className={`px-2 py-0.5 rounded-md font-bold ${
                                  item.abuse_risk_score >= 75
                                    ? 'bg-rose-100 text-rose-800'
                                    : item.abuse_risk_score >= 40
                                    ? 'bg-amber-100 text-amber-800'
                                    : 'bg-emerald-100 text-emerald-800'
                                }`}
                              >
                                {item.abuse_risk_score}/100
                              </span>
                              <span className="text-[11px] text-slate-500">
                                ({item.customer_returns_60d} in 60d)
                              </span>
                            </div>
                          </td>
                          <td className="py-3.5 px-4">
                            <div className="font-bold text-emerald-700">
                              KES {item.supplier_rtv_recovery_kes.toLocaleString()}
                            </div>
                            <div className="text-[11px] text-slate-500">{item.supplier_name}</div>
                          </td>
                          <td className="py-3.5 px-4">{getDispositionBadge(item)}</td>
                          <td className="py-3.5 px-4 text-right">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedRetId(item.ret_id);
                                setActiveTab('workbench');
                              }}
                              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs shadow-xs transition cursor-pointer"
                            >
                              <span>Inspect</span>
                              <ArrowUpRight className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: Multimodal Receipt, Serial & Supplier RTV Workbench */}
        {activeTab === 'workbench' && selectedClaim && (
          <div className="space-y-6">
            {/* Claim Selector Pills */}
            <div className="flex flex-wrap items-center gap-2 bg-white p-3 rounded-2xl border border-slate-200">
              <span className="text-xs font-bold text-slate-500 px-2">Select Claim:</span>
              {returnsList.map((item) => (
                <button
                  key={item.ret_id}
                  onClick={() => {
                    setSelectedRetId(item.ret_id);
                    setAuthBanner('');
                  }}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer ${
                    selectedClaim.ret_id === item.ret_id
                      ? 'bg-indigo-600 text-white'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  {item.ret_id} • {item.product_name.split(' ').slice(0, 3).join(' ')}
                </button>
              ))}
            </div>

            {authBanner && (
              <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-semibold flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>{authBanner}</span>
                </div>
                <button
                  onClick={() => setActiveTab('slip')}
                  className="px-3 py-1.5 rounded-lg bg-emerald-700 text-white font-semibold hover:bg-emerald-800 transition cursor-pointer"
                >
                  View 1-Page RTV Slip →
                </button>
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Left 7 Columns: Multimodal Evidence & Deterministic Checks */}
              <div className="lg:col-span-7 space-y-5">
                <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
                  <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold px-2.5 py-0.5 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-200">
                          {selectedClaim.ret_id}
                        </span>
                        <span className="text-xs text-slate-500">{selectedClaim.store_branch}</span>
                      </div>
                      <h3 className="text-lg font-bold text-slate-900 mt-1">
                        {selectedClaim.product_name}
                      </h3>
                      <p className="text-xs text-slate-600 mt-0.5">
                        Customer: <span className="font-semibold">{selectedClaim.customer_name}</span> ({selectedClaim.loyalty_tier}) • POS Receipt: <span className="font-mono font-semibold">{selectedClaim.pos_receipt_no}</span>
                      </p>
                    </div>
                    {getDispositionBadge(selectedClaim)}
                  </div>

                  {/* Multimodal Evidence Cards */}
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2.5">
                      Multimodal Counter Inspection Evidence (OCR + Serial Macro + Bench Test)
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      {selectedClaim.evidence_photos.map((ev, i) => (
                        <div
                          key={i}
                          className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/90 space-y-1.5"
                        >
                          <div className="flex items-center gap-1.5 text-xs font-bold text-indigo-700">
                            <ScanBarcode className="w-4 h-4" />
                            <span>{ev.label}</span>
                          </div>
                          <div className="text-xs font-mono font-semibold text-slate-800 bg-white px-2.5 py-1.5 rounded-lg border border-slate-200">
                            {ev.tag}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Deterministic 4-Point Audit Matrix */}
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2.5">
                      Deterministic Python Policy, Serial &amp; Vendor RTV Verification
                    </h4>
                    <div className="space-y-2.5">
                      {selectedClaim.deterministic_checks.map((chk) => (
                        <div
                          key={chk.check_id}
                          className={`p-3.5 rounded-xl border flex items-start justify-between gap-4 ${
                            chk.passed
                              ? 'bg-emerald-50/40 border-emerald-200'
                              : 'bg-rose-50/50 border-rose-200'
                          }`}
                        >
                          <div className="space-y-0.5">
                            <div className="flex items-center gap-2">
                              {chk.passed ? (
                                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                              ) : (
                                <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0" />
                              )}
                              <span className="text-xs font-bold text-slate-900">{chk.title}</span>
                            </div>
                            <p className="text-xs text-slate-600 pl-6">{chk.detail}</p>
                          </div>
                          <div className="text-right shrink-0 font-mono text-[11px]">
                            <div className="text-slate-500">Expected: {chk.expected}</div>
                            <div className="font-bold text-slate-900">Actual: {chk.actual}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Physical Bench Inspection Notes */}
                  <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
                    <div className="text-xs font-bold text-slate-800 mb-1.5">
                      Counter &amp; Technical Bench Inspection Log
                    </div>
                    <ul className="space-y-1 text-xs text-slate-600 list-disc list-inside">
                      {selectedClaim.visual_inspection_notes.map((n, idx) => (
                        <li key={idx}>{n}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>

              {/* Right 5 Columns: Financial RTV Accounting & One-Click Authorization */}
              <div className="lg:col-span-5 space-y-5">
                <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-5">
                  <div>
                    <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-700 bg-indigo-50 px-2.5 py-1 rounded-md">
                      Disposition &amp; Upstream Supplier RTV Accounting
                    </span>
                    <h3 className="text-base font-bold text-slate-900 mt-2">
                      {selectedClaim.disposition_label}
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Supplier: <span className="font-semibold text-slate-800">{selectedClaim.supplier_name}</span> ({selectedClaim.supplier_vendor_code})
                    </p>
                  </div>

                  <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 space-y-2.5 text-xs">
                    <div className="flex justify-between">
                      <span className="text-slate-600">POS Retail Purchase Value:</span>
                      <span className="font-bold text-slate-900">
                        KES {selectedClaim.retail_price_kes.toLocaleString()}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-600">Approved Customer Refund / Exchange:</span>
                      <span className="font-bold text-indigo-700">
                        KES {selectedClaim.customer_refund_kes.toLocaleString()}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-600">Wholesale Inventory Cost:</span>
                      <span className="font-semibold text-slate-800">
                        KES {selectedClaim.wholesale_cost_kes.toLocaleString()}
                      </span>
                    </div>
                    <div className="flex justify-between border-t border-slate-200 pt-2">
                      <span className="font-semibold text-emerald-800">
                        Upstream Supplier RTV Recovery:
                      </span>
                      <span className="font-bold text-emerald-700">
                        KES {selectedClaim.supplier_rtv_recovery_kes.toLocaleString()}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-600">Net Unrecovered Store Margin Loss:</span>
                      <span className="font-bold text-slate-900">
                        KES {selectedClaim.net_retailer_loss_kes.toLocaleString()}
                      </span>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Controller Authorization &amp; RTV Dispatch Note
                    </label>
                    <textarea
                      rows={2}
                      value={inspectorNotes}
                      onChange={(e) => setInspectorNotes(e.target.value)}
                      placeholder="Optional supervisor sign-off note or RTV dock instructions..."
                      className="w-full rounded-xl border border-slate-300 p-2.5 text-xs focus:border-indigo-600 outline-none"
                    />
                  </div>

                  <div className="space-y-2.5">
                    <button
                      onClick={handleAuthorizeDisposition}
                      className="w-full py-3 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-sm transition flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <ShieldCheck className="w-4 h-4" />
                      <span>Authorize Disposition &amp; Generate Supplier RTV Claim</span>
                    </button>

                    <button
                      onClick={() => setActiveTab('slip')}
                      className="w-full py-2.5 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold text-xs transition flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <Printer className="w-4 h-4" />
                      <span>Open 1-Page Printable Disposition &amp; RTV Claim Slip</span>
                    </button>
                  </div>
                </div>

                {/* Interactive Policy & Abuse Simulator */}
                <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
                  <div className="flex items-center gap-2">
                    <SlidersHorizontal className="w-4 h-4 text-indigo-600" />
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                      What-If Counter Return &amp; Serial Match Simulator
                    </h4>
                  </div>

                  <form onSubmit={handleRunSimulation} className="space-y-3 text-xs">
                    <div className="grid grid-cols-2 gap-2.5">
                      <div>
                        <label className="block font-semibold text-slate-600 mb-1">Category</label>
                        <select
                          value={simForm.category}
                          onChange={(e) => setSimForm({ ...simForm, category: e.target.value })}
                          className="w-full rounded-lg border border-slate-300 p-2"
                        >
                          <option>Consumer Electronics</option>
                          <option>Major Appliances</option>
                          <option>Small Domestic Appliances</option>
                          <option>Cold-Chain Perishables</option>
                          <option>Personal Care &amp; Dermocosmetics</option>
                        </select>
                      </div>
                      <div>
                        <label className="block font-semibold text-slate-600 mb-1">
                          Days Since Purchase
                        </label>
                        <input
                          type="number"
                          value={simForm.days_since_purchase}
                          onChange={(e) =>
                            setSimForm({ ...simForm, days_since_purchase: e.target.value })
                          }
                          className="w-full rounded-lg border border-slate-300 p-2"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2.5">
                      <div>
                        <label className="block font-semibold text-slate-600 mb-1">
                          POS Receipt Serial
                        </label>
                        <input
                          type="text"
                          value={simForm.receipt_serial}
                          onChange={(e) =>
                            setSimForm({ ...simForm, receipt_serial: e.target.value })
                          }
                          className="w-full rounded-lg border border-slate-300 p-2 font-mono"
                        />
                      </div>
                      <div>
                        <label className="block font-semibold text-slate-600 mb-1">
                          Physical Unit Serial
                        </label>
                        <input
                          type="text"
                          value={simForm.physical_serial}
                          onChange={(e) =>
                            setSimForm({ ...simForm, physical_serial: e.target.value })
                          }
                          className="w-full rounded-lg border border-slate-300 p-2 font-mono"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2.5">
                      <div>
                        <label className="block font-semibold text-slate-600 mb-1">
                          Retail Price (KES)
                        </label>
                        <input
                          type="number"
                          value={simForm.retail_price_kes}
                          onChange={(e) =>
                            setSimForm({ ...simForm, retail_price_kes: e.target.value })
                          }
                          className="w-full rounded-lg border border-slate-300 p-2"
                        />
                      </div>
                      <div>
                        <label className="block font-semibold text-slate-600 mb-1">
                          Customer Returns (60d)
                        </label>
                        <input
                          type="number"
                          value={simForm.customer_returns_60d}
                          onChange={(e) =>
                            setSimForm({ ...simForm, customer_returns_60d: e.target.value })
                          }
                          className="w-full rounded-lg border border-slate-300 p-2"
                        />
                      </div>
                    </div>

                    <button
                      type="submit"
                      className="w-full py-2 px-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-semibold transition cursor-pointer"
                    >
                      Run Deterministic Policy Simulation
                    </button>
                  </form>

                  {simResult && (
                    <div className="p-3.5 rounded-xl bg-indigo-50/70 border border-indigo-200 space-y-1 text-xs">
                      <div className="font-bold text-indigo-950">
                        Result: {simResult.disposition_label}
                      </div>
                      <div className="text-slate-700">
                        Abuse Risk Score: <span className="font-bold">{simResult.abuse_risk_score}/100</span> • Serial Match:{' '}
                        <span className="font-bold">{simResult.serial_match ? 'PASS' : 'MISMATCH'}</span>
                      </div>
                      <div className="text-emerald-800 font-semibold">
                        Recoverable Supplier RTV: KES {simResult.supplier_rtv_recovery_kes.toLocaleString()}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: Returns & Warranty AI Co-Pilot */}
        {activeTab === 'copilot' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-4 space-y-4">
              <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3">
                <div className="flex items-center gap-2 text-indigo-700 font-bold text-sm">
                  <Bot className="w-5 h-5" />
                  <span>One-Click Executive Audit Prompts</span>
                </div>
                <p className="text-xs text-slate-500">
                  Query Gemini 2.5 Flash grounded on live POS serial checks, abuse velocity scores, and vendor RTV contracts.
                </p>
                <div className="space-y-2">
                  {[
                    `Audit ${selectedClaim?.ret_id || 'RET-2026-8410'} and explain the serial match, policy window, and supplier RTV recovery.`,
                    'Which return claims in our queue show serial number swapping or hygiene seal tampering?',
                    'Summarize total recoverable Supplier RTV chargebacks and cold-chain debit notes across all 6 claims.',
                    'How should the counter handle RET-2026-8412 (45-day NutriBullet blender return) without losing store margin?',
                  ].map((q, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleAskCopilot(q)}
                      className="w-full text-left p-3 rounded-xl bg-slate-50 hover:bg-indigo-50 border border-slate-200 hover:border-indigo-200 text-xs font-medium text-slate-800 transition cursor-pointer"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="lg:col-span-8">
              <div className="bg-white rounded-2xl border border-slate-200 flex flex-col h-[540px]">
                <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Bot className="w-4 h-4 text-indigo-600" />
                    <span className="text-xs font-bold text-slate-900">
                      Returns, Warranty &amp; Supplier RTV AI Co-Pilot
                    </span>
                  </div>
                  <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700">
                    Active Context: {selectedClaim?.ret_id}
                  </span>
                </div>

                <div className="flex-1 overflow-y-auto p-5 space-y-4">
                  {chatMessages.map((msg, i) => (
                    <div
                      key={i}
                      className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`max-w-[85%] rounded-2xl p-4 text-xs leading-relaxed whitespace-pre-wrap ${
                          msg.role === 'user'
                            ? 'bg-indigo-600 text-white font-medium'
                            : 'bg-slate-100 text-slate-800 border border-slate-200'
                        }`}
                      >
                        {msg.role === 'assistant' && msg.model && (
                          <div className="text-[10px] font-bold uppercase tracking-wider text-indigo-600 mb-1">
                            {msg.model}
                          </div>
                        )}
                        {msg.text}
                      </div>
                    </div>
                  ))}
                  {chatLoading && (
                    <div className="text-xs text-slate-500 italic">
                      Auditing POS receipt serials, abuse velocity, and supplier RTV terms...
                    </div>
                  )}
                </div>

                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleAskCopilot();
                  }}
                  className="p-4 border-t border-slate-200 flex items-center gap-2"
                >
                  <input
                    type="text"
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    placeholder="Ask about serial match, return policy window, or vendor RTV recovery..."
                    className="flex-1 rounded-xl border border-slate-300 px-3.5 py-2.5 text-xs focus:border-indigo-600 outline-none"
                  />
                  <button
                    type="submit"
                    disabled={chatLoading}
                    className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>Ask</span>
                  </button>
                </form>
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: 1-Page Return Disposition & Supplier RTV Claim Slip (Print-Ready) */}
        {activeTab === 'slip' && selectedClaim && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-200 print:hidden">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-bold text-slate-600">Select Slip:</span>
                {returnsList.map((item) => (
                  <button
                    key={item.ret_id}
                    onClick={() => setSelectedRetId(item.ret_id)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer ${
                      selectedClaim.ret_id === item.ret_id
                        ? 'bg-indigo-600 text-white'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    {item.ret_id}
                  </button>
                ))}
              </div>
              <button
                onClick={() => window.print()}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-sm transition cursor-pointer"
              >
                <Printer className="w-4 h-4" />
                <span>Print 1-Page Return Disposition &amp; RTV Slip</span>
              </button>
            </div>

            {/* Printable 1-Page Certificate */}
            <div className="bg-white rounded-2xl border border-slate-300 p-8 shadow-sm max-w-4xl mx-auto space-y-6 print:border-0 print:shadow-none print:p-2">
              <div className="flex items-start justify-between border-b-2 border-slate-900 pb-4">
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-widest text-indigo-700">
                    Official Retail Loss Prevention &amp; Upstream Vendor RTV Voucher
                  </div>
                  <h2 className="text-xl font-bold text-slate-900 mt-0.5">
                    1-Page Customer Return Disposition &amp; Supplier RTV Claim Slip
                  </h2>
                  <p className="text-xs text-slate-600">
                    Store Branch: {selectedClaim.store_branch} • Claim Date: {selectedClaim.claim_date}
                  </p>
                </div>
                <div className="text-right font-mono text-xs">
                  <div className="font-bold text-slate-900">CLAIM: {selectedClaim.ret_id}</div>
                  <div className="text-indigo-700 font-bold">RTV REF: {selectedClaim.rtv_claim_number}</div>
                  <div className="text-slate-500">STATUS: {selectedClaim.status}</div>
                </div>
              </div>

              {/* 2-Column Metadata Summary */}
              <div className="grid grid-cols-2 gap-6 text-xs">
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5">
                  <div className="font-bold text-slate-900 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                    <UserCheck className="w-3.5 h-3.5 text-indigo-600" />
                    <span>Customer &amp; POS Purchase Record</span>
                  </div>
                  <div><span className="text-slate-500">Customer:</span> <span className="font-semibold">{selectedClaim.customer_name} ({selectedClaim.customer_id})</span></div>
                  <div><span className="text-slate-500">Loyalty Tier:</span> <span className="font-semibold">{selectedClaim.loyalty_tier}</span></div>
                  <div><span className="text-slate-500">POS Receipt #:</span> <span className="font-mono font-semibold">{selectedClaim.pos_receipt_no}</span></div>
                  <div><span className="text-slate-500">Purchase Date:</span> <span className="font-semibold">{selectedClaim.purchase_date} ({selectedClaim.days_since_purchase} days elapsed)</span></div>
                  <div><span className="text-slate-500">60-Day Return Velocity:</span> <span className="font-semibold">{selectedClaim.customer_returns_60d} returns (Abuse Score: {selectedClaim.abuse_risk_score}/100)</span></div>
                </div>

                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5">
                  <div className="font-bold text-slate-900 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                    <Building2 className="w-3.5 h-3.5 text-indigo-600" />
                    <span>Product &amp; Upstream Supplier Warranty</span>
                  </div>
                  <div><span className="text-slate-500">Product / SKU:</span> <span className="font-semibold">{selectedClaim.product_name} ({selectedClaim.sku})</span></div>
                  <div><span className="text-slate-500">Supplier:</span> <span className="font-semibold">{selectedClaim.supplier_name} ({selectedClaim.supplier_vendor_code})</span></div>
                  <div><span className="text-slate-500">POS Receipt Serial/Lot:</span> <span className="font-mono font-semibold">{selectedClaim.receipt_serial}</span></div>
                  <div><span className="text-slate-500">Physical Unit Serial/Lot:</span> <span className="font-mono font-bold">{selectedClaim.physical_serial}</span></div>
                  <div><span className="text-slate-500">Warranty Policy:</span> <span className="font-semibold">{selectedClaim.supplier_warranty_terms}</span></div>
                </div>
              </div>

              {/* Deterministic Verification Table */}
              <div>
                <div className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-2">
                  Deterministic Policy, Serial &amp; Abuse Audit Matrix
                </div>
                <table className="w-full text-xs border border-slate-200">
                  <thead className="bg-slate-100 text-slate-700">
                    <tr>
                      <th className="py-2 px-3 text-left">Audit Control</th>
                      <th className="py-2 px-3 text-left">Policy Threshold</th>
                      <th className="py-2 px-3 text-left">Observed Counter Value</th>
                      <th className="py-2 px-3 text-left">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {selectedClaim.deterministic_checks.map((c) => (
                      <tr key={c.check_id}>
                        <td className="py-2 px-3 font-semibold">{c.title}</td>
                        <td className="py-2 px-3 font-mono">{c.expected}</td>
                        <td className="py-2 px-3 font-mono font-semibold">{c.actual}</td>
                        <td className="py-2 px-3 font-bold">
                          {c.passed ? 'PASS' : 'FLAGGED'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Financial Settlement & Supplier RTV Recovery Box */}
              <div className="p-4 rounded-xl bg-indigo-50/60 border border-indigo-200 grid grid-cols-4 gap-4 text-xs">
                <div>
                  <div className="text-slate-500">Final Disposition</div>
                  <div className="font-bold text-slate-900 mt-0.5">{selectedClaim.disposition_label}</div>
                </div>
                <div>
                  <div className="text-slate-500">Customer Refund Approved</div>
                  <div className="font-bold text-indigo-700 text-sm mt-0.5">
                    KES {selectedClaim.customer_refund_kes.toLocaleString()}
                  </div>
                </div>
                <div>
                  <div className="text-slate-500">Supplier RTV Chargeback</div>
                  <div className="font-bold text-emerald-700 text-sm mt-0.5">
                    KES {selectedClaim.supplier_rtv_recovery_kes.toLocaleString()}
                  </div>
                </div>
                <div>
                  <div className="text-slate-500">Net Store Margin Loss</div>
                  <div className="font-bold text-slate-900 text-sm mt-0.5">
                    KES {selectedClaim.net_retailer_loss_kes.toLocaleString()}
                  </div>
                </div>
              </div>

              {/* Signatures */}
              <div className="grid grid-cols-3 gap-6 pt-4 border-t border-slate-200 text-xs text-slate-600">
                <div>
                  <div className="font-bold text-slate-900">Counter Inspection Officer</div>
                  <div className="mt-4 border-b border-slate-400 pb-1 font-mono text-[11px]">
                    {selectedClaim.authorized_by || `${user.name} (${user.email})`}
                  </div>
                </div>
                <div>
                  <div className="font-bold text-slate-900">Upstream Vendor RTV Desk</div>
                  <div className="mt-4 border-b border-slate-400 pb-1 font-mono text-[11px]">
                    Ref: {selectedClaim.rtv_claim_number} ({selectedClaim.rtv_mechanism})
                  </div>
                </div>
                <div>
                  <div className="font-bold text-slate-900">Customer Acknowledgment</div>
                  <div className="mt-4 border-b border-slate-400 pb-1 font-mono text-[11px]">
                    {selectedClaim.customer_name}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
