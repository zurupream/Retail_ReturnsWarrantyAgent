import React, { useState, useEffect, useRef } from 'react';
import {
  ShieldCheck,
  ScanBarcode,
  FileCheck2,
  RefreshCw,
  Mail,
  KeyRound,
  ArrowRight,
  CheckCircle2,
  AlertTriangle,
  Sparkles,
  Lock
} from 'lucide-react';

const GOOGLE_CLIENT_ID = '259388273008-n8vg3ae8be86e56svvg09rbdciah17u1.apps.googleusercontent.com';

export default function SignInPage({ onSignIn }) {
  const [email, setEmail] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [step, setStep] = useState('request'); // 'request' | 'verify'
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [infoMessage, setInfoMessage] = useState('');
  const googleBtnRef = useRef(null);

  useEffect(() => {
    const initGoogle = () => {
      if (window.google && window.google.accounts && googleBtnRef.current) {
        try {
          window.google.accounts.id.initialize({
            client_id: GOOGLE_CLIENT_ID,
            callback: handleGoogleResponse,
          });
          window.google.accounts.id.renderButton(googleBtnRef.current, {
            theme: 'outline',
            size: 'large',
            width: 340,
            text: 'signin_with',
            shape: 'pill',
          });
        } catch (err) {
          console.error('Google Sign-In initialization error:', err);
        }
      }
    };

    const timer = setInterval(() => {
      if (window.google && window.google.accounts) {
        initGoogle();
        clearInterval(timer);
      }
    }, 300);

    return () => clearInterval(timer);
  }, []);

  const handleGoogleResponse = async (response) => {
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/auth/google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credential: response.credential }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || 'Google authentication failed.');
      }
      onSignIn(data.user);
    } catch (err) {
      setError(err.message || 'Unable to sign in with Google.');
    } finally {
      setLoading(false);
    }
  };

  const handleRequestOtp = async (e) => {
    e.preventDefault();
    setError('');
    setInfoMessage('');
    if (!email.trim()) {
      setError('Please enter your work email address.');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/auth/otp/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || 'Failed to send verification code.');
      }
      setInfoMessage(data.message || `6-digit code sent to ${email}`);
      setStep('verify');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    setError('');
    if (!otpCode.trim()) {
      setError('Please enter the 6-digit verification code.');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/auth/otp/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), code: otpCode.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || 'Invalid or expired verification code.');
      }
      onSignIn(data.user);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const workflowSteps = [
    {
      num: '01',
      title: '1. Original Store Receipt & Returned Item Check',
      desc: "Verifies purchase date, price paid, and that the returned item's serial number matches the original receipt.",
      badge: 'Receipt & Serial Match',
      icon: ScanBarcode,
      metrics: ['Original Store Receipt Verification', 'Receipt Serial vs. Returned Item Serial'],
    },
    {
      num: '02',
      title: '2. Store Return Days & Manufacturer Warranty Check',
      desc: 'Checks whether the item is within the 7/14/30-day store refund window or covered by the 12-month manufacturer warranty, and inspects for physical damage.',
      badge: 'Return Window & Warranty',
      icon: ShieldCheck,
      metrics: ['14 / 30-Day Store Return Policy', '12-Month Warranty & Condition Check'],
    },
    {
      num: '03',
      title: '3. Customer Return Decision & Approval Slip',
      desc: 'Produces a clear decision: Approve Refund/Exchange, Send for Free Warranty Repair, or Reject Return — plus a printable Customer Return Slip.',
      badge: '3 Simple Outcomes',
      icon: FileCheck2,
      metrics: ['Approve Refund or Exchange', 'Free Warranty Repair or Reject Return'],
    },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50/40 text-slate-900 flex flex-col justify-between">
      {/* Top Header */}
      <header className="border-b border-slate-200/80 bg-white/80 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center text-white shadow-sm">
              <RefreshCw className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
                  Retail Store Operations • Agent #11
                </span>
                <span className="text-xs text-slate-500 font-medium">
                  Store Counter Customer Service &amp; Warranty Desk
                </span>
              </div>
              <h1 className="text-lg font-bold tracking-tight text-slate-900 mt-0.5">
                Customer Return &amp; Warranty Verification Agent
              </h1>
            </div>
          </div>
          <div className="hidden md:flex items-center gap-2 text-xs font-medium text-slate-600 bg-slate-100 px-3.5 py-1.5 rounded-full">
            <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
            <span>Receipt Match • Return Window • 12-Month Warranty Verification</span>
          </div>
        </div>
      </header>

      {/* Main Split Grid */}
      <main className="max-w-7xl mx-auto px-6 py-10 w-full flex-1 flex items-center">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 w-full items-center">
          {/* Left 7/12: 3-Step Visual Workflow Diagram */}
          <div className="lg:col-span-7 space-y-6">
            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 text-xs font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200/80 px-3 py-1 rounded-full">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Simple 3-Step Store Counter Return &amp; Warranty Check</span>
              </div>
              <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 leading-tight">
                Verify Customer Returns, Store Receipts &amp; Warranty Coverage in Seconds
              </h2>
              <p className="text-sm text-slate-600 leading-relaxed">
                When a customer brings back an item for a refund or exchange, verify that the item matches the original store receipt, check the store return days and manufacturer warranty period, and issue a clear approval, warranty repair booking, or rejection.
              </p>
            </div>

            {/* 3-Step Cards */}
            <div className="space-y-4">
              {workflowSteps.map((item, idx) => {
                const IconComponent = item.icon;
                return (
                  <div
                    key={item.num}
                    className="relative bg-white rounded-2xl p-5 border border-slate-200/90 shadow-sm hover:shadow-md transition-all"
                  >
                    <div className="flex items-start gap-4">
                      <div className="w-11 h-11 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shrink-0 font-bold">
                        <IconComponent className="w-5 h-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <h3 className="text-sm font-bold text-slate-900">{item.title}</h3>
                          <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                            {item.badge}
                          </span>
                        </div>
                        <p className="text-xs text-slate-600 mt-1 leading-relaxed">{item.desc}</p>
                        <div className="flex flex-wrap gap-2 mt-3">
                          {item.metrics.map((m) => (
                            <span
                              key={m}
                              className="inline-flex items-center gap-1 text-[11px] font-medium text-indigo-950 bg-indigo-50/70 px-2.5 py-1 rounded-lg border border-indigo-100"
                            >
                              <CheckCircle2 className="w-3 h-3 text-indigo-600" />
                              {m}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                    {idx < workflowSteps.length - 1 && (
                      <div className="hidden sm:flex justify-center -mb-7 mt-1 text-slate-300">
                        <ArrowRight className="w-4 h-4 rotate-90" />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* 3 Simple Outcomes Strip */}
            <div className="grid grid-cols-3 gap-3 pt-1">
              <div className="bg-emerald-50/70 border border-emerald-200 rounded-xl p-3.5">
                <div className="text-xs text-emerald-800 font-semibold">Outcome 1</div>
                <div className="text-sm font-bold text-slate-900 mt-0.5">Approve Refund / Exchange</div>
                <div className="text-[11px] text-emerald-700 font-medium mt-0.5">Within return days &amp; factory fault</div>
              </div>
              <div className="bg-amber-50/70 border border-amber-200 rounded-xl p-3.5">
                <div className="text-xs text-amber-800 font-semibold">Outcome 2</div>
                <div className="text-sm font-bold text-slate-900 mt-0.5">Send for Warranty Repair</div>
                <div className="text-[11px] text-amber-800 font-medium mt-0.5">Past return days, under 1-yr warranty</div>
              </div>
              <div className="bg-rose-50/70 border border-rose-200 rounded-xl p-3.5">
                <div className="text-xs text-rose-800 font-semibold">Outcome 3</div>
                <div className="text-sm font-bold text-slate-900 mt-0.5">Reject Return</div>
                <div className="text-[11px] text-rose-700 font-medium mt-0.5">Wrong serial number or physical damage</div>
              </div>
            </div>
          </div>

          {/* Right 5/12: Enterprise SSO Card */}
          <div className="lg:col-span-5">
            <div className="bg-white rounded-3xl border border-slate-200/90 shadow-xl shadow-slate-200/50 p-7 sm:p-8 space-y-6">
              <div className="space-y-1.5">
                <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded-full">
                  <Lock className="w-3 h-3" />
                  <span>Store Supervisor &amp; Service Desk Sign-In</span>
                </div>
                <h3 className="text-xl font-bold text-slate-900">
                  Sign in to Customer Returns Workbench
                </h3>
                <p className="text-xs text-slate-500">
                  Use your work email 6-digit verification code or Google Workspace account.
                </p>
              </div>

              {error && (
                <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700 flex items-start gap-2.5">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
                  <span>{error}</span>
                </div>
              )}

              {infoMessage && (
                <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 flex items-start gap-2.5">
                  <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600" />
                  <span>{infoMessage}</span>
                </div>
              )}

              {step === 'request' ? (
                <form onSubmit={handleRequestOtp} className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                      Work Email Address
                    </label>
                    <div className="relative">
                      <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                      <input
                        type="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="name@company.com"
                        className="w-full pl-10 pr-4 py-2.5 text-sm rounded-xl border border-slate-300 focus:border-indigo-600 focus:ring-2 focus:ring-indigo-500/20 outline-none transition"
                      />
                    </div>
                  </div>
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white font-semibold text-sm shadow-sm transition flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <span>{loading ? 'Sending 6-Digit Code...' : 'Send 6-Digit Verification Code'}</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </form>
              ) : (
                <form onSubmit={handleVerifyOtp} className="space-y-4">
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="block text-xs font-semibold text-slate-700">
                        6-Digit Verification Code
                      </label>
                      <button
                        type="button"
                        onClick={() => {
                          setStep('request');
                          setOtpCode('');
                          setError('');
                        }}
                        className="text-xs font-medium text-indigo-600 hover:text-indigo-800 cursor-pointer"
                      >
                        Change email
                      </button>
                    </div>
                    <div className="relative">
                      <KeyRound className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                      <input
                        type="text"
                        required
                        maxLength={6}
                        value={otpCode}
                        onChange={(e) => setOtpCode(e.target.value)}
                        placeholder="Enter 6-digit code"
                        className="w-full pl-10 pr-4 py-2.5 text-sm tracking-widest font-mono rounded-xl border border-slate-300 focus:border-indigo-600 focus:ring-2 focus:ring-indigo-500/20 outline-none transition"
                      />
                    </div>
                  </div>
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-semibold text-sm shadow-sm transition flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <span>{loading ? 'Verifying Code...' : 'Verify & Open Returns Workbench'}</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </form>
              )}

              <div className="relative flex py-1 items-center">
                <div className="flex-grow border-t border-slate-200"></div>
                <span className="flex-shrink mx-3 text-[11px] uppercase tracking-wider text-slate-400 font-semibold">
                  Or Continue With Google SSO
                </span>
                <div className="flex-grow border-t border-slate-200"></div>
              </div>

              <div className="flex flex-col items-center justify-center">
                <div ref={googleBtnRef} className="min-h-[42px] flex items-center justify-center" />
              </div>

              <div className="pt-2 border-t border-slate-100 text-[11px] text-slate-500 text-center leading-relaxed">
                Designed for Store Customer Service Counters, Branch Supervisors, and Warranty Service Desks.
              </div>
            </div>
          </div>
        </div>
      </main>

      <footer className="border-t border-slate-200/70 bg-white/60 py-3 px-6 text-center text-xs text-slate-500">
        Customer Return &amp; Warranty Verification Agent • Store Receipt Match, Return Window &amp; Manufacturer Warranty Check
      </footer>
    </div>
  );
}
