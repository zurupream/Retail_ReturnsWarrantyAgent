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
  Wrench
} from 'lucide-react';
import SignInPage from './components/SignInPage';

const STORAGE_KEY = 'retail_returns_warranty_agent_user_v2';

export default function App() {
  const [user, setUser] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const [activeTab, setActiveTab] = useState('queue'); // 'queue' | 'check' | 'assistant' | 'slip'
  const [returnsList, setReturnsList] = useState([]);
  const [kpis, setKpis] = useState(null);
  const [selectedRetId, setSelectedRetId] = useState('RET-2026-8410');
  const [loading, setLoading] = useState(false);
  const [confirmBanner, setConfirmBanner] = useState('');
  const [supervisorNotes, setSupervisorNotes] = useState('');

  // Quick Counter Check Simulator in Tab 2
  const [simForm, setSimForm] = useState({
    product_name: 'Samsung 65-Inch 4K Smart TV',
    category: 'Consumer Electronics',
    supplier_name: 'Samsung Electronics East Africa',
    retail_price_kes: 145000,
    days_since_purchase: 8,
    receipt_serial: 'SAM-Q65-90012',
    physical_serial: 'SAM-Q65-90012',
    customer_physical_damage: false,
    genuine_defect_verified: true,
    fault_summary: 'Screen does not power on out of the box (Factory Fault)',
  });
  const [simResult, setSimResult] = useState(null);

  // AI Assistant state in Tab 3
  const [chatMessages, setChatMessages] = useState([
    {
      role: 'assistant',
      model: 'gemini-2.5-flash',
      text: 'Welcome to the Returns & Warranty AI Assistant. Select any customer return and ask me to explain the receipt check, store return window, 12-month warranty coverage, or the recommended counter decision.',
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

  const handleConfirmDecision = async () => {
    if (!selectedClaim) return;
    setConfirmBanner('');
    try {
      const res = await fetch(`/api/returns/${selectedClaim.ret_id}/authorize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          authorized_by: `${user.name} (${user.email})`,
          supervisor_notes:
            supervisorNotes.trim() ||
            `Confirmed by ${user.name}: ${selectedClaim.decision_label} (Slip ${selectedClaim.approval_slip_no}).`,
        }),
      });
      const data = await res.json();
      if (res.ok && data.claim) {
        setReturnsList((prev) =>
          prev.map((item) => (item.ret_id === data.claim.ret_id ? data.claim : item))
        );
        if (data.kpis) setKpis(data.kpis);
        setConfirmBanner(
          `Confirmed ${data.claim.ret_id}: ${data.claim.decision_label} • Slip #${data.claim.approval_slip_no}`
        );
      }
    } catch (err) {
      console.error('Confirmation error:', err);
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
          genuine_defect_verified: !simForm.customer_physical_damage,
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

  const handleAskAssistant = async (promptText) => {
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
    } catch {
      setChatMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          model: 'store-warranty-verifier',
          text: 'Unable to reach the Returns & Warranty AI Assistant right now. Please try again.',
        },
      ]);
    } finally {
      setChatLoading(false);
    }
  };

  const getDecisionBadge = (claim) => {
    if (!claim) return null;
    if (claim.decision_code === 'APPROVE_REFUND_OR_EXCHANGE') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
          <CheckCircle2 className="w-3.5 h-3.5" />
          Approve Refund or Exchange
        </span>
      );
    }
    if (claim.decision_code === 'SEND_FOR_WARRANTY_REPAIR') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200">
          <Wrench className="w-3.5 h-3.5" />
          Send for Manufacturer Warranty Repair
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200">
        <XCircle className="w-3.5 h-3.5" />
        {claim.decision_label}
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
                  Agent #11 • Store Customer Returns
                </span>
                <span className="text-xs text-slate-500">
                  Receipt Match • Store Return Days • 12-Month Warranty Check
                </span>
              </div>
              <h1 className="text-base sm:text-lg font-bold text-slate-900">
                Customer Return &amp; Warranty Verification Agent
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

        {/* Clean 4-Tab Navigation Strip */}
        <div className="max-w-7xl mx-auto px-6 flex overflow-x-auto gap-2 border-t border-slate-100 pt-2 pb-2">
          {[
            {
              id: 'queue',
              label: '1. Store Customer Returns Queue',
              icon: PackageCheck,
            },
            {
              id: 'check',
              label: '2. Receipt, Return Window & Warranty Check',
              icon: ScanBarcode,
            },
            {
              id: 'assistant',
              label: '3. Returns & Warranty AI Assistant',
              icon: Bot,
            },
            {
              id: 'slip',
              label: '4. Customer Return Decision Slip',
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
        {/* Top Summary KPI Cards (Hidden during print) */}
        {kpis && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 print:hidden">
            {/* Card 1 */}
            <div className="bg-white rounded-2xl p-4 border border-slate-200/90 shadow-sm">
              <div className="text-xs font-medium text-slate-500">
                Customer Returns in Queue
              </div>
              <div className="text-2xl font-bold text-slate-900 mt-1">
                {kpis.total_requests} Requests
              </div>
              <div className="text-xs text-slate-600 mt-1">
                Total Value: <span className="font-semibold">KES {kpis.total_value_kes.toLocaleString()}</span>
              </div>
            </div>

            {/* Card 2 */}
            <div className="bg-white rounded-2xl p-4 border border-slate-200/90 shadow-sm">
              <div className="text-xs font-medium text-slate-500">
                Approved for Refund / Exchange
              </div>
              <div className="text-2xl font-bold text-emerald-700 mt-1">
                {kpis.approved_count} Approved
              </div>
              <div className="text-xs text-emerald-700 font-medium mt-1">
                KES {kpis.approved_value_kes.toLocaleString()} — Covered by Supplier Warranty
              </div>
            </div>

            {/* Card 3 */}
            <div className="bg-white rounded-2xl p-4 border border-slate-200/90 shadow-sm">
              <div className="text-xs font-medium text-slate-500">
                Routed to Free Warranty Repair
              </div>
              <div className="text-2xl font-bold text-amber-700 mt-1">
                {kpis.warranty_repair_count} Item (KES {kpis.warranty_repair_value_kes.toLocaleString()})
              </div>
              <div className="text-xs text-amber-800 font-medium mt-1">
                Past 14-day refund window, under 1-yr warranty
              </div>
            </div>

            {/* Card 4 */}
            <div className="bg-white rounded-2xl p-4 border border-slate-200/90 shadow-sm">
              <div className="text-xs font-medium text-slate-500">
                Rejected Returns (Saved Store Cash)
              </div>
              <div className="text-2xl font-bold text-rose-600 mt-1">
                {kpis.rejected_count} Rejected (KES {kpis.rejected_value_kes.toLocaleString()})
              </div>
              <div className="text-xs text-slate-600 mt-1">
                {kpis.wrong_serial_count} Wrong Serial Number · {kpis.physical_damage_count} Customer Damage
              </div>
            </div>
          </div>
        )}

        {/* TAB 1: Store Customer Returns Queue */}
        {activeTab === 'queue' && (
          <div className="space-y-5">
            <div className="bg-white rounded-2xl border border-slate-200/90 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-bold text-slate-900">
                    Store Customer Returns Queue
                  </h2>
                  <p className="text-xs text-slate-500">
                    Select any customer return to check the original store receipt, return days, 12-month manufacturer warranty, and product condition.
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
                      <th className="py-3.5 px-4">Return ID &amp; Store</th>
                      <th className="py-3.5 px-4">Returned Item &amp; Price</th>
                      <th className="py-3.5 px-4">1. Receipt &amp; Serial Match</th>
                      <th className="py-3.5 px-4">2. Return Days Check</th>
                      <th className="py-3.5 px-4">3. Reported Fault / Condition</th>
                      <th className="py-3.5 px-4">Store Counter Decision</th>
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
                            <div className="text-[11px] text-slate-600 font-medium mt-0.5">
                              {item.customer_name}
                            </div>
                          </td>
                          <td className="py-3.5 px-4">
                            <div className="font-semibold text-slate-900">{item.product_name}</div>
                            <div className="text-[11px] text-slate-500">
                              {item.category} • <span className="font-semibold text-slate-800">KES {item.retail_price_kes.toLocaleString()}</span>
                            </div>
                          </td>
                          <td className="py-3.5 px-4 font-mono text-[11px]">
                            <div className="text-slate-600">Receipt: {item.receipt_serial}</div>
                            <div
                              className={
                                item.serial_match
                                  ? 'text-emerald-700 font-semibold'
                                  : 'text-rose-600 font-bold'
                              }
                            >
                              Item: {item.physical_serial} ({item.serial_match ? 'Matched' : 'Mismatch'})
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
                              Bought {item.days_since_purchase}d ago ({item.policy_window_days}d Policy)
                            </span>
                          </td>
                          <td className="py-3.5 px-4 max-w-xs">
                            <div className="font-semibold text-slate-800">{item.fault_summary}</div>
                            <div className="text-[11px] text-slate-500">{item.supplier_coverage_status}</div>
                          </td>
                          <td className="py-3.5 px-4">{getDecisionBadge(item)}</td>
                          <td className="py-3.5 px-4 text-right">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedRetId(item.ret_id);
                                setActiveTab('check');
                              }}
                              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs shadow-xs transition cursor-pointer"
                            >
                              <span>Verify</span>
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

        {/* TAB 2: Receipt, Return Window & Warranty Check */}
        {activeTab === 'check' && selectedClaim && (
          <div className="space-y-6">
            {/* Return Request Selector Pills */}
            <div className="flex flex-wrap items-center gap-2 bg-white p-3 rounded-2xl border border-slate-200">
              <span className="text-xs font-bold text-slate-500 px-2">Select Customer Return:</span>
              {returnsList.map((item) => (
                <button
                  key={item.ret_id}
                  onClick={() => {
                    setSelectedRetId(item.ret_id);
                    setConfirmBanner('');
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

            {confirmBanner && (
              <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-semibold flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>{confirmBanner}</span>
                </div>
                <button
                  onClick={() => setActiveTab('slip')}
                  className="px-3 py-1.5 rounded-lg bg-emerald-700 text-white font-semibold hover:bg-emerald-800 transition cursor-pointer"
                >
                  Open Customer Return Decision Slip →
                </button>
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Left 7 Columns: Step-by-Step Breakdown of the 3 Simple Checks */}
              <div className="lg:col-span-7 space-y-5">
                <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-5">
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
                        Customer: <span className="font-semibold">{selectedClaim.customer_name}</span> • Original Store Receipt: <span className="font-mono font-semibold">{selectedClaim.pos_receipt_no}</span> • Paid: <span className="font-semibold">KES {selectedClaim.retail_price_kes.toLocaleString()}</span>
                      </p>
                    </div>
                    {getDecisionBadge(selectedClaim)}
                  </div>

                  {/* Step-by-Step 3 Everyday Counter Checks */}
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">
                      3-Step Store Counter Verification Checklist
                    </h4>
                    <div className="space-y-3">
                      {selectedClaim.verification_steps.map((step) => (
                        <div
                          key={step.step_id}
                          className={`p-4 rounded-xl border ${
                            step.passed
                              ? 'bg-emerald-50/40 border-emerald-200'
                              : 'bg-rose-50/50 border-rose-200'
                          }`}
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              {step.passed ? (
                                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                              ) : (
                                <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0" />
                              )}
                              <span className="text-xs font-bold text-slate-900">
                                {step.step_title}
                              </span>
                            </div>
                            <span
                              className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full ${
                                step.passed
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : 'bg-rose-100 text-rose-800'
                              }`}
                            >
                              {step.status_badge}
                            </span>
                          </div>
                          <p className="text-xs text-slate-700 mt-1.5 pl-6 leading-relaxed">
                            {step.detail}
                          </p>
                          <div className="flex flex-wrap gap-4 mt-2 pl-6 text-[11px] font-mono text-slate-600">
                            <span>Policy / Receipt: {step.expected}</span>
                            <span className="font-semibold text-slate-900">Observed: {step.actual}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Store Counter Inspection Notes */}
                  <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
                    <div className="text-xs font-bold text-slate-800 mb-1.5">
                      Store Counter Inspection Notes
                    </div>
                    <ul className="space-y-1 text-xs text-slate-600 list-disc list-inside">
                      {selectedClaim.counter_inspection_notes.map((n, idx) => (
                        <li key={idx}>{n}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>

              {/* Right 5 Columns: Clear Store Counter Decision & Quick Simulator */}
              <div className="lg:col-span-5 space-y-5">
                <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-5">
                  <div>
                    <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-700 bg-indigo-50 px-2.5 py-1 rounded-md">
                      Recommended Store Counter Decision
                    </span>
                    <h3 className="text-base font-bold text-slate-900 mt-2">
                      {selectedClaim.decision_label}
                    </h3>
                    <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                      {selectedClaim.counter_action_summary}
                    </p>
                  </div>

                  <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 space-y-2.5 text-xs">
                    <div className="flex justify-between">
                      <span className="text-slate-600">Original Receipt Amount:</span>
                      <span className="font-bold text-slate-900">
                        KES {selectedClaim.retail_price_kes.toLocaleString()}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-600">Customer Refund / Replacement Value:</span>
                      <span className="font-bold text-indigo-700">
                        KES {selectedClaim.customer_refund_kes.toLocaleString()}
                      </span>
                    </div>
                    <div className="flex justify-between border-t border-slate-200 pt-2">
                      <span className="text-slate-600">Manufacturer / Supplier Coverage:</span>
                      <span className="font-semibold text-emerald-700 text-right">
                        {selectedClaim.supplier_coverage_status}
                      </span>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Store Supervisor Note (Optional)
                    </label>
                    <textarea
                      rows={2}
                      value={supervisorNotes}
                      onChange={(e) => setSupervisorNotes(e.target.value)}
                      placeholder="Add a note for the customer return slip or service center..."
                      className="w-full rounded-xl border border-slate-300 p-2.5 text-xs focus:border-indigo-600 outline-none"
                    />
                  </div>

                  <div className="space-y-2.5">
                    <button
                      onClick={handleConfirmDecision}
                      className="w-full py-3 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-sm transition flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <ShieldCheck className="w-4 h-4" />
                      <span>Confirm Return Decision</span>
                    </button>

                    <button
                      onClick={() => setActiveTab('slip')}
                      className="w-full py-2.5 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold text-xs transition flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <Printer className="w-4 h-4" />
                      <span>Open Printable Customer Return Decision Slip</span>
                    </button>
                  </div>
                </div>

                {/* Test Another Return Scenario */}
                <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
                  <div className="flex items-center gap-2">
                    <SlidersHorizontal className="w-4 h-4 text-indigo-600" />
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                      Quick Counter Check Simulator
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
                          <option>Small Kitchen Appliances</option>
                          <option>Computers &amp; Laptops</option>
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
                          Receipt Serial Number
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
                          Returned Item Serial
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

                    <div className="grid grid-cols-2 gap-2.5 items-center">
                      <div>
                        <label className="block font-semibold text-slate-600 mb-1">
                          Price Paid (KES)
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
                      <div className="pt-4">
                        <label className="inline-flex items-center gap-2 font-semibold text-slate-700 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={simForm.customer_physical_damage}
                            onChange={(e) =>
                              setSimForm({
                                ...simForm,
                                customer_physical_damage: e.target.checked,
                              })
                            }
                            className="rounded border-slate-300"
                          />
                          <span>Customer Physical Damage?</span>
                        </label>
                      </div>
                    </div>

                    <button
                      type="submit"
                      className="w-full py-2 px-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-semibold transition cursor-pointer"
                    >
                      Check Return Eligibility
                    </button>
                  </form>

                  {simResult && (
                    <div className="p-3.5 rounded-xl bg-indigo-50/70 border border-indigo-200 space-y-1 text-xs">
                      <div className="font-bold text-indigo-950">
                        Decision: {simResult.decision_label}
                      </div>
                      <div className="text-slate-700">
                        Serial Match: <span className="font-bold">{simResult.serial_match ? 'Matched' : 'Mismatch'}</span> • Store Window:{' '}
                        <span className="font-bold">{simResult.within_policy_window ? 'Within Window' : 'Past Window'}</span>
                      </div>
                      <div className="text-slate-600">{simResult.counter_action_summary}</div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: Returns & Warranty AI Assistant */}
        {activeTab === 'assistant' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-4 space-y-4">
              <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3">
                <div className="flex items-center gap-2 text-indigo-700 font-bold text-sm">
                  <Bot className="w-5 h-5" />
                  <span>Common Store Counter Questions</span>
                </div>
                <p className="text-xs text-slate-500">
                  Click any question below to ask the AI Assistant about the selected customer return or the store queue.
                </p>
                <div className="space-y-2">
                  {[
                    `Explain the 3 verification checks and counter decision for ${selectedClaim?.ret_id || 'RET-2026-8410'}.`,
                    'Why is the NutriBullet blender (RET-2026-8412) sent for free warranty repair instead of a cash refund?',
                    'Why were the Sony headphones (RET-2026-8411) and HP laptop (RET-2026-8415) rejected?',
                    'Which customer returns qualify for an immediate refund or replacement today?',
                  ].map((q, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleAskAssistant(q)}
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
                      Returns &amp; Warranty AI Assistant
                    </span>
                  </div>
                  <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700">
                    Selected Return: {selectedClaim?.ret_id}
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
                      Checking store receipt, return policy days, and manufacturer warranty coverage...
                    </div>
                  )}
                </div>

                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleAskAssistant();
                  }}
                  className="p-4 border-t border-slate-200 flex items-center gap-2"
                >
                  <input
                    type="text"
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    placeholder="Ask a question about receipt matching, return days, or warranty repair..."
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

        {/* TAB 4: Customer Return Decision Slip (Printable) */}
        {activeTab === 'slip' && selectedClaim && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-200 print:hidden">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-bold text-slate-600">Select Return Slip:</span>
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
                <span>Print Customer Return Decision Slip</span>
              </button>
            </div>

            {/* Printable Customer Return Decision Slip */}
            <div className="bg-white rounded-2xl border border-slate-300 p-8 shadow-sm max-w-4xl mx-auto space-y-6 print:border-0 print:shadow-none print:p-2">
              <div className="flex items-start justify-between border-b-2 border-slate-900 pb-4">
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-widest text-indigo-700">
                    Store Customer Service &amp; Warranty Verification Desk
                  </div>
                  <h2 className="text-xl font-bold text-slate-900 mt-0.5">
                    Customer Return Decision Slip
                  </h2>
                  <p className="text-xs text-slate-600">
                    Store Branch: {selectedClaim.store_branch} • Date: {selectedClaim.claim_date}
                  </p>
                </div>
                <div className="text-right font-mono text-xs">
                  <div className="font-bold text-slate-900">RETURN ID: {selectedClaim.ret_id}</div>
                  <div className="text-indigo-700 font-bold">SLIP NO: {selectedClaim.approval_slip_no}</div>
                  <div className="text-slate-500">STATUS: {selectedClaim.status}</div>
                </div>
              </div>

              {/* 2-Column Customer & Item Details */}
              <div className="grid grid-cols-2 gap-6 text-xs">
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5">
                  <div className="font-bold text-slate-900 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                    <UserCheck className="w-3.5 h-3.5 text-indigo-600" />
                    <span>Customer &amp; Original Store Receipt</span>
                  </div>
                  <div><span className="text-slate-500">Customer Name:</span> <span className="font-semibold">{selectedClaim.customer_name}</span></div>
                  <div><span className="text-slate-500">Customer Phone:</span> <span className="font-semibold">{selectedClaim.customer_phone}</span></div>
                  <div><span className="text-slate-500">Original Store Receipt:</span> <span className="font-mono font-semibold">{selectedClaim.pos_receipt_no}</span></div>
                  <div><span className="text-slate-500">Purchase Date:</span> <span className="font-semibold">{selectedClaim.purchase_date} ({selectedClaim.days_since_purchase} days ago)</span></div>
                  <div><span className="text-slate-500">Price Paid:</span> <span className="font-bold">KES {selectedClaim.retail_price_kes.toLocaleString()}</span></div>
                </div>

                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5">
                  <div className="font-bold text-slate-900 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                    <Building2 className="w-3.5 h-3.5 text-indigo-600" />
                    <span>Returned Item &amp; Warranty Details</span>
                  </div>
                  <div><span className="text-slate-500">Product:</span> <span className="font-semibold">{selectedClaim.product_name}</span></div>
                  <div><span className="text-slate-500">Manufacturer / Partner:</span> <span className="font-semibold">{selectedClaim.supplier_name}</span></div>
                  <div><span className="text-slate-500">Serial on Receipt:</span> <span className="font-mono font-semibold">{selectedClaim.receipt_serial}</span></div>
                  <div><span className="text-slate-500">Serial on Returned Item:</span> <span className="font-mono font-bold">{selectedClaim.physical_serial}</span></div>
                  <div><span className="text-slate-500">Policy Terms:</span> <span className="font-semibold">{selectedClaim.supplier_warranty_terms}</span></div>
                </div>
              </div>

              {/* 3-Step Verification Summary Table */}
              <div>
                <div className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-2">
                  3-Step Store Return &amp; Warranty Verification Checklist
                </div>
                <table className="w-full text-xs border border-slate-200">
                  <thead className="bg-slate-100 text-slate-700">
                    <tr>
                      <th className="py-2 px-3 text-left">Verification Check</th>
                      <th className="py-2 px-3 text-left">Requirement</th>
                      <th className="py-2 px-3 text-left">Counter Finding</th>
                      <th className="py-2 px-3 text-left">Result</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {selectedClaim.verification_steps.map((s) => (
                      <tr key={s.step_id}>
                        <td className="py-2 px-3 font-semibold">{s.step_title}</td>
                        <td className="py-2 px-3 font-mono">{s.expected}</td>
                        <td className="py-2 px-3 font-mono font-semibold">{s.actual}</td>
                        <td className="py-2 px-3 font-bold">{s.status_badge}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Final Counter Decision Box */}
              <div className="p-4 rounded-xl bg-indigo-50/60 border border-indigo-200 space-y-2 text-xs">
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <div className="text-slate-500">Store Counter Decision</div>
                    <div className="font-bold text-slate-900 text-sm mt-0.5">
                      {selectedClaim.decision_label}
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-500">Customer Refund / Replacement</div>
                    <div className="font-bold text-indigo-700 text-sm mt-0.5">
                      KES {selectedClaim.customer_refund_kes.toLocaleString()}
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-500">Warranty Coverage Status</div>
                    <div className="font-bold text-emerald-700 text-xs mt-0.5">
                      {selectedClaim.supplier_coverage_status}
                    </div>
                  </div>
                </div>
                <div className="pt-2 border-t border-indigo-100 text-slate-700">
                  <span className="font-semibold">Next Step Instructions:</span> {selectedClaim.counter_action_summary}
                </div>
              </div>

              {/* Sign-Off Lines */}
              <div className="grid grid-cols-3 gap-6 pt-4 border-t border-slate-200 text-xs text-slate-600">
                <div>
                  <div className="font-bold text-slate-900">Store Supervisor Sign-Off</div>
                  <div className="mt-4 border-b border-slate-400 pb-1 font-mono text-[11px]">
                    {selectedClaim.authorized_by || `${user.name} (${user.email})`}
                  </div>
                </div>
                <div>
                  <div className="font-bold text-slate-900">Warranty / Service Desk Reference</div>
                  <div className="mt-4 border-b border-slate-400 pb-1 font-mono text-[11px]">
                    Slip #{selectedClaim.approval_slip_no}
                  </div>
                </div>
                <div>
                  <div className="font-bold text-slate-900">Customer Signature</div>
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
