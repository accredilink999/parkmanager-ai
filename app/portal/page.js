'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

export default function CustomerPortal() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [tab, setTab] = useState('bills');
  const [bills, setBills] = useState([]);
  const [readings, setReadings] = useState([]);
  const [pitch, setPitch] = useState(null);
  const [loading, setLoading] = useState(true);
  const [expandedBill, setExpandedBill] = useState(null);
  const [siteName, setSiteName] = useState('ParkManagerAI');
  const [sitePhone, setSitePhone] = useState('');

  useEffect(() => {
    const saved = sessionStorage.getItem('pm_user');
    if (!saved) { router.push('/login'); return; }
    const u = JSON.parse(saved);
    setUser(u);
    loadData(u);
  }, [router]);

  async function loadData(u) {
    setLoading(true);
    if (!supabase) {
      setPitch({
        id: '1', pitch_number: 'A1', customer_name: u.full_name || 'John Smith',
        customer_email: u.email, customer_phone: '07700 900000', meter_id: 'M001', status: 'occupied',
      });
      setBills([
        {
          id: '1', usage_kwh: 344, unit_rate: 0.34, amount_gbp: 116.96,
          start_reading: 14890, end_reading: 15234, status: 'unpaid',
          period_start: '2026-02-01', period_end: '2026-03-01', created_at: '2026-03-01',
        },
        {
          id: '2', usage_kwh: 289, unit_rate: 0.34, amount_gbp: 98.26,
          start_reading: 14601, end_reading: 14890, status: 'paid',
          period_start: '2026-01-01', period_end: '2026-02-01', paid_at: '2026-02-05', created_at: '2026-02-01',
        },
      ]);
      setReadings([
        { id: '1', reading: 15234, previous_reading: 14890, usage_kwh: 344, read_at: '2026-03-01T09:15:00' },
        { id: '2', reading: 14890, previous_reading: 14601, usage_kwh: 289, read_at: '2026-02-01T10:30:00' },
        { id: '3', reading: 14601, previous_reading: 14350, usage_kwh: 251, read_at: '2026-01-02T11:00:00' },
      ]);
      setLoading(false);
      loadSettings();
      return;
    }

    try {
      const { data: pitches } = await supabase
        .from('pitches')
        .select('*')
        .eq('customer_email', u.email)
        .limit(1);

      const myPitch = pitches?.[0] || null;
      setPitch(myPitch);

      if (myPitch) {
        const [billRes, readingRes] = await Promise.all([
          supabase.from('bills').select('*').eq('pitch_id', myPitch.id).order('created_at', { ascending: false }),
          supabase.from('meter_readings').select('*').eq('pitch_id', myPitch.id).order('read_at', { ascending: false }),
        ]);
        setBills(billRes.data || []);
        setReadings(readingRes.data || []);
      }
    } catch (err) {
      console.error('Portal load error:', err);
    }
    loadSettings();
    setLoading(false);
  }

  function loadSettings() {
    try {
      const saved = localStorage.getItem('pm_settings');
      if (saved) {
        JSON.parse(saved).forEach(s => {
          if (s.key === 'site_name' && s.value) setSiteName(s.value);
          if (s.key === 'site_phone' && s.value) setSitePhone(s.value);
        });
      }
    } catch {}
    if (supabase) {
      supabase.from('site_settings').select('*').in('key', ['site_name', 'site_phone']).then(({ data }) => {
        (data || []).forEach(s => {
          if (s.key === 'site_name' && s.value) setSiteName(s.value);
          if (s.key === 'site_phone' && s.value) setSitePhone(s.value);
        });
      });
    }
  }

  function logout() {
    sessionStorage.removeItem('pm_user');
    if (supabase) supabase.auth.signOut();
    router.push('/login');
  }

  async function downloadBillPDF(bill) {
    const { default: jsPDF } = await import('jspdf');
    const doc = new jsPDF();

    doc.setFontSize(20);
    doc.setTextColor(5, 150, 105);
    doc.text('Electricity Bill', 14, 22);
    doc.setFontSize(11);
    doc.setTextColor(100);
    doc.text(siteName, 14, 30);
    doc.setFontSize(9);
    doc.text(new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }), 196, 22, { align: 'right' });

    doc.setDrawColor(5, 150, 105);
    doc.setLineWidth(0.8);
    doc.line(14, 34, 196, 34);

    let y = 44;
    doc.setFontSize(10);
    doc.setTextColor(0);
    [
      ['Pitch', pitch?.pitch_number || '\u2014'],
      ['Customer', pitch?.customer_name || user?.full_name || '\u2014'],
      ['Period', `${bill.period_start ? new Date(bill.period_start).toLocaleDateString('en-GB') : '\u2014'} to ${bill.period_end ? new Date(bill.period_end).toLocaleDateString('en-GB') : '\u2014'}`],
    ].forEach(([label, val]) => {
      doc.setFont(undefined, 'bold'); doc.text(label, 14, y);
      doc.setFont(undefined, 'normal'); doc.text(val, 60, y);
      y += 7;
    });

    y += 6;
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(14, y - 4, 182, 30, 3, 3, 'FD');
    doc.setFontSize(11); doc.setFont(undefined, 'bold');
    doc.text('Meter Readings', 18, y + 4);
    y += 12; doc.setFontSize(9); doc.setFont(undefined, 'normal');
    doc.text('Start Reading', 20, y);
    doc.setFont(undefined, 'bold');
    doc.text(Number(bill.start_reading || 0).toLocaleString(), 170, y, { align: 'right' });
    y += 7; doc.setFont(undefined, 'normal');
    doc.text('End Reading', 20, y);
    doc.setFont(undefined, 'bold');
    doc.text(Number(bill.end_reading || 0).toLocaleString(), 170, y, { align: 'right' });

    y += 14;
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(14, y - 4, 182, 36, 3, 3, 'FD');
    doc.setFontSize(11); doc.setFont(undefined, 'bold');
    doc.text('Cost', 18, y + 4);
    y += 12; doc.setFontSize(9); doc.setFont(undefined, 'normal');
    doc.text('Usage', 20, y);
    doc.text(`${Number(bill.usage_kwh).toLocaleString()} kWh`, 170, y, { align: 'right' });
    y += 7;
    doc.text('Unit Rate', 20, y);
    doc.text(`\u00A3${Number(bill.unit_rate).toFixed(2)} per kWh`, 170, y, { align: 'right' });
    y += 9;
    doc.setDrawColor(226, 232, 240);
    doc.line(18, y - 4, 192, y - 4);
    doc.setFontSize(12); doc.setFont(undefined, 'bold');
    doc.text('Total Amount', 20, y);
    doc.setTextColor(5, 150, 105); doc.setFontSize(16);
    doc.text(`\u00A3${Number(bill.amount_gbp).toFixed(2)}`, 170, y, { align: 'right' });

    y += 16;
    if (bill.status === 'paid') {
      doc.setTextColor(5, 150, 105); doc.setFontSize(24); doc.setFont(undefined, 'bold');
      doc.text('PAID', 105, y + 4, { align: 'center' });
      doc.setDrawColor(5, 150, 105); doc.setLineWidth(1);
      doc.roundedRect(75, y - 8, 60, 18, 3, 3, 'S');
    } else {
      doc.setFillColor(254, 242, 242); doc.setDrawColor(254, 202, 202);
      doc.roundedRect(50, y - 6, 110, 20, 3, 3, 'FD');
      doc.setTextColor(220, 38, 38); doc.setFontSize(14); doc.setFont(undefined, 'bold');
      doc.text('PAYMENT OUTSTANDING', 105, y + 3, { align: 'center' });
      doc.setFontSize(8); doc.setFont(undefined, 'normal');
      doc.text('Please contact the site office to arrange payment.', 105, y + 10, { align: 'center' });
    }

    doc.setFontSize(7); doc.setTextColor(150);
    doc.text(`Generated by ${siteName} \u2014 ParkManagerAI`, 105, 285, { align: 'center' });
    doc.save(`Bill-${pitch?.pitch_number || 'Unknown'}-${bill.period_end || 'period'}.pdf`);
  }

  if (!user) return null;

  const totalOwed = bills.filter(b => b.status !== 'paid').reduce((s, b) => s + Number(b.amount_gbp || 0), 0);

  const tabs = [
    { key: 'bills', label: 'My Bills', icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2z" /></svg>
    )},
    { key: 'readings', label: 'Readings', icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
    )},
    { key: 'details', label: 'My Details', icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
    )},
  ];

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      {/* Header */}
      <header className="bg-gradient-to-r from-emerald-600 to-teal-600 text-white px-4 pt-6 pb-8">
        <div className="max-w-lg mx-auto">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <svg className="w-7 h-7 rounded-lg" viewBox="0 0 192 192" xmlns="http://www.w3.org/2000/svg">
                <rect width="192" height="192" rx="38" fill="rgba(255,255,255,0.2)"/>
                <rect x="28" y="62" width="108" height="58" rx="10" fill="white" opacity="0.95"/>
                <path d="M28 72 Q28 52 48 52 L116 52 Q136 52 136 72" fill="white" opacity="0.95"/>
                <circle cx="52" cy="120" r="12" fill="white" opacity="0.9"/>
                <circle cx="52" cy="120" r="6" fill="#059669"/>
                <circle cx="112" cy="120" r="12" fill="white" opacity="0.9"/>
                <circle cx="112" cy="120" r="6" fill="#059669"/>
              </svg>
              <span className="font-bold text-sm opacity-90">{siteName}</span>
            </div>
            <button onClick={logout} className="text-xs text-white/70 hover:text-white transition-colors">Sign Out</button>
          </div>
          <h1 className="text-xl font-bold">Hello, {user.full_name || 'Customer'}</h1>
          {pitch && (
            <p className="text-sm text-white/80 mt-1">Pitch {pitch.pitch_number} &middot; Meter {pitch.meter_id || '\u2014'}</p>
          )}
          {totalOwed > 0 && (
            <div className="mt-4 bg-white/15 backdrop-blur-sm rounded-xl p-3 flex items-center justify-between">
              <div>
                <p className="text-xs text-white/70">Amount Outstanding</p>
                <p className="text-2xl font-bold">&pound;{totalOwed.toFixed(2)}</p>
              </div>
              <div className="bg-white/20 rounded-lg px-3 py-1.5 text-xs font-medium">
                {bills.filter(b => b.status !== 'paid').length} unpaid
              </div>
            </div>
          )}
          {totalOwed === 0 && !loading && (
            <div className="mt-4 bg-white/15 backdrop-blur-sm rounded-xl p-3 flex items-center gap-2">
              <svg className="w-5 h-5 text-emerald-200" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-sm text-white/90 font-medium">All bills paid &mdash; you&apos;re up to date!</span>
            </div>
          )}
        </div>
      </header>

      {/* Content */}
      <div className="max-w-lg mx-auto px-4 -mt-3">
        {loading ? (
          <div className="flex justify-center py-16">
            <div className="animate-spin w-8 h-8 border-2 border-emerald-400 border-t-transparent rounded-full" />
          </div>
        ) : !pitch ? (
          <div className="bg-white rounded-2xl border p-8 text-center mt-4">
            <svg className="w-12 h-12 text-slate-300 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
            <p className="text-sm text-slate-500">No pitch assigned to your account yet.</p>
            <p className="text-xs text-slate-400 mt-1">Contact the site office to get set up.</p>
          </div>
        ) : (
          <>
            {/* Bills Tab */}
            {tab === 'bills' && (
              <div className="space-y-3 mt-1">
                {bills.length === 0 ? (
                  <div className="bg-white rounded-2xl border p-6 text-center">
                    <p className="text-sm text-slate-400">No bills yet.</p>
                  </div>
                ) : bills.map(b => (
                  <div key={b.id} className="bg-white rounded-2xl border overflow-hidden">
                    <button
                      className="w-full flex items-center gap-3 px-4 py-3.5 text-left"
                      onClick={() => setExpandedBill(expandedBill === b.id ? null : b.id)}
                    >
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${b.status === 'paid' ? 'bg-emerald-100' : 'bg-red-100'}`}>
                        {b.status === 'paid' ? (
                          <svg className="w-5 h-5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                          </svg>
                        ) : (
                          <span className="text-red-600 font-bold text-sm">&pound;</span>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-slate-900">
                          {b.period_start && b.period_end
                            ? `${new Date(b.period_start).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} \u2013 ${new Date(b.period_end).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`
                            : 'Billing Period'}
                        </p>
                        <p className="text-xs text-slate-400">{Number(b.usage_kwh).toLocaleString()} kWh used</p>
                      </div>
                      <div className="text-right">
                        <p className={`text-base font-bold ${b.status === 'paid' ? 'text-emerald-600' : 'text-slate-900'}`}>
                          &pound;{Number(b.amount_gbp).toFixed(2)}
                        </p>
                        <span className={`text-xs font-medium ${b.status === 'paid' ? 'text-emerald-500' : 'text-red-500'}`}>
                          {b.status === 'paid' ? 'Paid' : 'Unpaid'}
                        </span>
                      </div>
                      <svg className={`w-4 h-4 text-slate-300 transition-transform flex-shrink-0 ${expandedBill === b.id ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>

                    {expandedBill === b.id && (
                      <div className="border-t bg-slate-50 px-4 py-4 space-y-3">
                        <div className="grid grid-cols-2 gap-3">
                          <div className="bg-white rounded-xl p-3 border">
                            <p className="text-xs text-slate-400">Start Reading</p>
                            <p className="text-lg font-mono font-bold text-slate-700">{Number(b.start_reading || 0).toLocaleString()}</p>
                          </div>
                          <div className="bg-white rounded-xl p-3 border">
                            <p className="text-xs text-slate-400">End Reading</p>
                            <p className="text-lg font-mono font-bold text-slate-700">{Number(b.end_reading || 0).toLocaleString()}</p>
                          </div>
                        </div>
                        <div className="bg-white rounded-xl p-3 border flex items-center justify-between">
                          <div>
                            <p className="text-xs text-slate-400">Usage x Rate</p>
                            <p className="text-sm text-slate-600">{Number(b.usage_kwh).toLocaleString()} kWh x &pound;{Number(b.unit_rate).toFixed(2)}</p>
                          </div>
                          <p className="text-lg font-bold text-emerald-600">&pound;{Number(b.amount_gbp).toFixed(2)}</p>
                        </div>

                        {b.status === 'paid' && b.paid_at && (
                          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 flex items-center gap-2">
                            <svg className="w-4 h-4 text-emerald-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            <p className="text-xs text-emerald-700">
                              Paid on {new Date(b.paid_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
                            </p>
                          </div>
                        )}

                        {b.status !== 'paid' && (
                          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
                            <p className="text-xs text-amber-800 font-medium">Payment required &mdash; please contact the site office.</p>
                            {sitePhone && <p className="text-xs text-amber-700 mt-1">Tel: {sitePhone}</p>}
                          </div>
                        )}

                        <button
                          onClick={() => downloadBillPDF(b)}
                          className="w-full py-2.5 bg-slate-100 text-slate-700 rounded-xl text-sm font-medium hover:bg-slate-200 transition-colors flex items-center justify-center gap-2"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                          Download PDF
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Readings Tab */}
            {tab === 'readings' && (
              <div className="space-y-3 mt-1">
                {readings.length === 0 ? (
                  <div className="bg-white rounded-2xl border p-6 text-center">
                    <p className="text-sm text-slate-400">No meter readings recorded yet.</p>
                  </div>
                ) : readings.map((r, i) => (
                  <div key={r.id} className="bg-white rounded-2xl border p-4">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-sm font-semibold text-slate-900">
                        {r.read_at ? new Date(r.read_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : '\u2014'}
                      </p>
                      {r.usage_kwh != null && (
                        <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">
                          +{Number(r.usage_kwh).toLocaleString()} kWh
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="flex-1">
                        <p className="text-xs text-slate-400">Previous</p>
                        <p className="text-base font-mono font-bold text-slate-500">{Number(r.previous_reading || 0).toLocaleString()}</p>
                      </div>
                      <svg className="w-4 h-4 text-slate-300 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                      </svg>
                      <div className="flex-1 text-right">
                        <p className="text-xs text-slate-400">Current</p>
                        <p className="text-base font-mono font-bold text-slate-900">{Number(r.reading).toLocaleString()}</p>
                      </div>
                    </div>
                    {i < readings.length - 1 && r.usage_kwh && readings[i + 1]?.usage_kwh && (
                      <div className="mt-3 pt-2 border-t">
                        <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
                          <span>vs previous period</span>
                          <span className={r.usage_kwh > readings[i + 1].usage_kwh ? 'text-red-500' : 'text-emerald-500'}>
                            {r.usage_kwh > readings[i + 1].usage_kwh ? '+' : ''}{Math.round(((r.usage_kwh - readings[i + 1].usage_kwh) / readings[i + 1].usage_kwh) * 100)}%
                          </span>
                        </div>
                        <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${r.usage_kwh > readings[i + 1].usage_kwh ? 'bg-red-400' : 'bg-emerald-400'}`}
                            style={{ width: `${Math.min(100, (r.usage_kwh / Math.max(r.usage_kwh, readings[i + 1].usage_kwh)) * 100)}%` }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Details Tab */}
            {tab === 'details' && (
              <div className="space-y-3 mt-1">
                <div className="bg-white rounded-2xl border overflow-hidden">
                  <div className="px-4 py-3 bg-emerald-50 border-b border-emerald-100">
                    <p className="text-xs font-semibold text-emerald-700 uppercase tracking-wider">Pitch Details</p>
                  </div>
                  <div className="divide-y">
                    {[
                      ['Pitch Number', pitch.pitch_number],
                      ['Status', pitch.status],
                      ['Meter ID', pitch.meter_id || '\u2014'],
                    ].map(([label, val]) => (
                      <div key={label} className="flex items-center justify-between px-4 py-3">
                        <p className="text-sm text-slate-500">{label}</p>
                        <p className="text-sm font-semibold text-slate-900 capitalize">{val}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="bg-white rounded-2xl border overflow-hidden">
                  <div className="px-4 py-3 bg-blue-50 border-b border-blue-100">
                    <p className="text-xs font-semibold text-blue-700 uppercase tracking-wider">Your Details</p>
                  </div>
                  <div className="divide-y">
                    {[
                      ['Name', pitch.customer_name || user.full_name || '\u2014'],
                      ['Email', pitch.customer_email || user.email || '\u2014'],
                      ['Phone', pitch.customer_phone || '\u2014'],
                    ].map(([label, val]) => (
                      <div key={label} className="flex items-center justify-between px-4 py-3">
                        <p className="text-sm text-slate-500">{label}</p>
                        <p className="text-sm font-medium text-slate-900">{val}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="bg-white rounded-2xl border overflow-hidden">
                  <div className="px-4 py-3 bg-slate-50 border-b">
                    <p className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Account Summary</p>
                  </div>
                  <div className="divide-y">
                    <div className="flex items-center justify-between px-4 py-3">
                      <p className="text-sm text-slate-500">Total Bills</p>
                      <p className="text-sm font-bold text-slate-900">{bills.length}</p>
                    </div>
                    <div className="flex items-center justify-between px-4 py-3">
                      <p className="text-sm text-slate-500">Total Paid</p>
                      <p className="text-sm font-bold text-emerald-600">
                        &pound;{bills.filter(b => b.status === 'paid').reduce((s, b) => s + Number(b.amount_gbp || 0), 0).toFixed(2)}
                      </p>
                    </div>
                    <div className="flex items-center justify-between px-4 py-3">
                      <p className="text-sm text-slate-500">Outstanding</p>
                      <p className={`text-sm font-bold ${totalOwed > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                        &pound;{totalOwed.toFixed(2)}
                      </p>
                    </div>
                    <div className="flex items-center justify-between px-4 py-3">
                      <p className="text-sm text-slate-500">Meter Readings</p>
                      <p className="text-sm font-bold text-slate-900">{readings.length}</p>
                    </div>
                  </div>
                </div>

                <p className="text-xs text-slate-400 text-center pt-2 pb-4">
                  To update your details, please contact the site office.
                  {sitePhone && <><br />Tel: {sitePhone}</>}
                </p>
              </div>
            )}
          </>
        )}
      </div>

      {/* Bottom Tab Bar */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 z-20">
        <div className="max-w-lg mx-auto flex">
          {tabs.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex-1 flex flex-col items-center py-2 pt-2.5 transition-colors ${
                tab === t.key ? 'text-emerald-600' : 'text-slate-400'
              }`}
            >
              {t.icon}
              <span className="text-[10px] font-medium mt-0.5">{t.label}</span>
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}
