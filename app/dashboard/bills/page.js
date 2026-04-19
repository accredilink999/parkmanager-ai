'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { getOrgId } from '@/lib/org';

export default function BillsPage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [bills, setBills] = useState([]);
  const [pitches, setPitches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState('');
  const [unitRate, setUnitRate] = useState(0.34);
  const [managerEmail, setManagerEmail] = useState('');
  const [siteName, setSiteName] = useState('ParkManagerAI');

  // Generate bill form
  const [showGenerate, setShowGenerate] = useState(false);
  const [selectedPitch, setSelectedPitch] = useState('');
  const [generating, setGenerating] = useState(false);

  // Expanded bill detail
  const [expandedBill, setExpandedBill] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [deletingBill, setDeletingBill] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem('pm_user');
    if (!saved) { router.push('/login'); return; }
    const u = JSON.parse(saved);
    setUser(u);
    // Only super_admin, admin, accounts can access bills
    if (u.role === 'customer') { router.push('/portal'); return; }
    loadData();
  }, [router]);

  async function loadData() {
    setLoading(true);
    if (!supabase) {
      // Load settings from localStorage in demo mode
      try {
        const saved = JSON.parse(localStorage.getItem('pm_settings') || '[]');
        saved.forEach(s => {
          if (s.key === 'electricity_unit_rate') setUnitRate(parseFloat(s.value));
          if (s.key === 'manager_email') setManagerEmail(s.value);
          if (s.key === 'site_name') setSiteName(s.value);
        });
      } catch {}
      setPitches([
        { id: '1', pitch_number: 'A1', customer_name: 'John Smith', customer_email: 'john@example.com' },
        { id: '2', pitch_number: 'A2', customer_name: 'Jane Doe', customer_email: 'jane@example.com' },
        { id: '4', pitch_number: 'B1', customer_name: 'Bob Williams', customer_email: 'bob@example.com' },
      ]);
      setBills([
        {
          id: '1', pitch_id: '1', usage_kwh: 344, unit_rate: 0.34, amount_gbp: 116.96,
          start_reading: 14890, end_reading: 15234, status: 'unpaid',
          created_at: '2026-03-01', period_start: '2026-02-01', period_end: '2026-03-01',
          pitch: { pitch_number: 'A1', customer_name: 'John Smith', customer_email: 'john@example.com' },
        },
        {
          id: '2', pitch_id: '2', usage_kwh: 271, unit_rate: 0.34, amount_gbp: 92.14,
          start_reading: 8650, end_reading: 8921, status: 'paid', paid_at: '2026-03-05',
          created_at: '2026-02-15', period_start: '2026-01-15', period_end: '2026-02-15',
          pitch: { pitch_number: 'A2', customer_name: 'Jane Doe', customer_email: 'jane@example.com' },
          marked_paid_by: 'Accounts Admin',
        },
        {
          id: '3', pitch_id: '4', usage_kwh: 300, unit_rate: 0.34, amount_gbp: 102.00,
          start_reading: 21800, end_reading: 22100, status: 'unpaid',
          created_at: '2026-03-02', period_start: '2026-02-02', period_end: '2026-03-02',
          pitch: { pitch_number: 'B1', customer_name: 'Bob Williams', customer_email: 'bob@example.com' },
        },
      ]);
      setLoading(false);
      return;
    }

    const [pitchRes, billRes, settingsRes] = await Promise.all([
      supabase.from('pitches').select('*').order('created_at'),
      supabase.from('bills').select('*, pitches(pitch_number, customer_name, customer_email)').order('created_at', { ascending: false }),
      supabase.from('site_settings').select('*'),
    ]);
    setPitches(pitchRes.data || []);
    setBills((billRes.data || []).map(b => ({ ...b, pitch: b.pitches })));
    (settingsRes.data || []).forEach(s => {
      if (s.key === 'electricity_unit_rate') setUnitRate(parseFloat(s.value));
      if (s.key === 'manager_email') setManagerEmail(s.value);
      if (s.key === 'site_name') setSiteName(s.value);
    });
    setLoading(false);
  }

  async function generateBill() {
    if (!selectedPitch) return;
    setGenerating(true);

    const pitch = pitches.find(p => p.id === selectedPitch);

    // Get latest two readings for this pitch to determine start and end
    let endReading = null;
    let startReading = null;

    if (!supabase) {
      endReading = { reading: 15234, previous_reading: 14890, usage_kwh: 344, id: 'r1', read_at: '2026-03-01' };
      startReading = { reading: 14890 };
    } else {
      const { data } = await supabase
        .from('meter_readings')
        .select('*')
        .eq('pitch_id', selectedPitch)
        .order('read_at', { ascending: false })
        .limit(2);

      if (data && data.length > 0) {
        endReading = data[0];
        startReading = data.length > 1 ? data[1] : null;
      }
    }

    if (!endReading) {
      setToast('No meter reading found for this pitch. Take a reading first.');
      setTimeout(() => setToast(''), 4000);
      setGenerating(false);
      return;
    }

    const endVal = Number(endReading.reading);
    const startVal = startReading ? Number(startReading.reading) : Number(endReading.previous_reading || 0);
    const usage = Math.max(0, endVal - startVal);
    const amount = Math.round(usage * unitRate * 100) / 100;

    const billPayload = {
      pitch_id: selectedPitch,
      reading_id: endReading.id,
      usage_kwh: usage,
      unit_rate: unitRate,
      amount_gbp: amount,
      start_reading: startVal,
      end_reading: endVal,
      status: 'unpaid',
      period_start: startReading?.read_at?.split('T')[0] || endReading.read_at?.split('T')[0] || new Date().toISOString().split('T')[0],
      period_end: endReading.read_at?.split('T')[0] || new Date().toISOString().split('T')[0],
    };

    if (!supabase) {
      setBills(prev => [{
        id: String(Date.now()), ...billPayload, created_at: new Date().toISOString(),
        pitch: { pitch_number: pitch?.pitch_number, customer_name: pitch?.customer_name, customer_email: pitch?.customer_email },
      }, ...prev]);
      setToast(`Bill generated: ${startVal.toLocaleString()} -> ${endVal.toLocaleString()} = ${usage} kWh = £${amount.toFixed(2)}`);
    } else {
      await supabase.from('bills').insert({ ...billPayload, org_id: getOrgId() });
      setToast(`Bill generated: ${usage} kWh = £${amount.toFixed(2)}`);
      loadData();
    }

    setTimeout(() => setToast(''), 4000);
    setShowGenerate(false); setSelectedPitch('');
    setGenerating(false);
  }

  async function markPaid(billId) {
    const bill = bills.find(b => b.id === billId);
    if (!bill) return;

    const now = new Date().toISOString();

    if (!supabase) {
      setBills(prev => prev.map(b => b.id === billId ? {
        ...b, status: 'paid', paid_at: now, marked_paid_by: user.full_name || user.email,
      } : b));
    } else {
      await supabase.from('bills').update({
        status: 'paid', paid_at: now,
        marked_paid_by: user.full_name || user.email,
        payment_method: 'marked_by_accounts',
      }).eq('id', billId);
      loadData();
    }

    setToast('Bill marked as paid - sending notifications...');
    setTimeout(() => setToast(''), 4000);

    // Send notification emails
    sendPaymentNotification(bill);
  }

  async function deleteBill(bill) {
    setDeleteConfirm(bill);
  }

  async function confirmDeleteBill() {
    if (!deleteConfirm) return;
    setDeletingBill(true);
    if (!supabase) {
      setBills(prev => prev.filter(b => b.id !== deleteConfirm.id));
      setDeleteConfirm(null);
      setDeletingBill(false);
      setExpandedBill(null);
      setToast('Bill deleted');
      setTimeout(() => setToast(''), 3000);
      return;
    }
    try {
      await supabase.from('bills').delete().eq('id', deleteConfirm.id);
      setToast('Bill deleted');
      setTimeout(() => setToast(''), 3000);
      setDeleteConfirm(null);
      setExpandedBill(null);
      loadData();
    } catch (err) {
      setToast('Error: ' + err.message);
      setTimeout(() => setToast(''), 4000);
    }
    setDeletingBill(false);
  }

  async function sendPaymentNotification(bill) {
    const pitchInfo = bill.pitch || {};
    const subject = `Payment Confirmed - Pitch ${pitchInfo.pitch_number || ''} - £${Number(bill.amount_gbp).toFixed(2)}`;
    const body = `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
        <div style="background:#059669;padding:20px;border-radius:12px 12px 0 0;">
          <h1 style="color:#fff;margin:0;font-size:20px;">Payment Confirmed</h1>
        </div>
        <div style="background:#fff;padding:24px;border:1px solid #e2e8f0;border-top:0;border-radius:0 0 12px 12px;">
          <p style="font-size:15px;color:#1e293b;">The following bill has been marked as <strong style="color:#059669;">PAID</strong>:</p>
          <table style="width:100%;border-collapse:collapse;margin:16px 0;">
            <tr><td style="padding:8px 0;color:#64748b;font-size:13px;">Pitch</td><td style="padding:8px 0;font-weight:700;font-size:13px;">${pitchInfo.pitch_number || '—'}</td></tr>
            <tr><td style="padding:8px 0;color:#64748b;font-size:13px;">Customer</td><td style="padding:8px 0;font-size:13px;">${pitchInfo.customer_name || '—'}</td></tr>
            <tr><td style="padding:8px 0;color:#64748b;font-size:13px;">Start Reading</td><td style="padding:8px 0;font-family:monospace;font-size:13px;">${Number(bill.start_reading || 0).toLocaleString()}</td></tr>
            <tr><td style="padding:8px 0;color:#64748b;font-size:13px;">End Reading</td><td style="padding:8px 0;font-family:monospace;font-size:13px;">${Number(bill.end_reading || 0).toLocaleString()}</td></tr>
            <tr><td style="padding:8px 0;color:#64748b;font-size:13px;">Usage</td><td style="padding:8px 0;font-weight:700;font-size:13px;">${Number(bill.usage_kwh).toLocaleString()} kWh</td></tr>
            <tr><td style="padding:8px 0;color:#64748b;font-size:13px;">Amount</td><td style="padding:8px 0;font-weight:700;font-size:15px;color:#059669;">£${Number(bill.amount_gbp).toFixed(2)}</td></tr>
            <tr><td style="padding:8px 0;color:#64748b;font-size:13px;">Marked Paid By</td><td style="padding:8px 0;font-size:13px;">${user.full_name || user.email}</td></tr>
            <tr><td style="padding:8px 0;color:#64748b;font-size:13px;">Date Paid</td><td style="padding:8px 0;font-size:13px;">${new Date().toLocaleDateString('en-GB')}</td></tr>
          </table>
          <p style="font-size:12px;color:#94a3b8;margin-top:20px;">This is an automated notification from ${siteName}.</p>
        </div>
      </div>
    `;

    // Send to manager
    if (managerEmail) {
      try {
        await fetch('/api/send-report', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ to: managerEmail, subject, body }),
        });
      } catch {}
    }

    // Send to customer
    if (pitchInfo.customer_email) {
      try {
        await fetch('/api/send-report', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ to: pitchInfo.customer_email, subject, body }),
        });
      } catch {}
    }
  }

  if (!user) return null;

  const canMarkPaid = ['super_admin', 'admin', 'accounts', 'developer'].includes(user.role);

  // Stats
  const totalBilled = bills.reduce((s, b) => s + Number(b.amount_gbp || 0), 0);
  const totalPaid = bills.filter(b => b.status === 'paid').reduce((s, b) => s + Number(b.amount_gbp || 0), 0);
  const totalOutstanding = bills.filter(b => b.status !== 'paid').reduce((s, b) => s + Number(b.amount_gbp || 0), 0);

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 px-4 py-3 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/dashboard" className="text-slate-400 hover:text-slate-700 text-sm">&larr; Dashboard</Link>
            <h1 className="text-lg font-bold text-slate-900">Billing</h1>
          </div>
          <button
            onClick={() => setShowGenerate(true)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-500 transition-colors"
          >
            + Generate Bill
          </button>
        </div>
      </header>

      {toast && (
        <div className="fixed top-4 right-4 z-50 bg-emerald-600 text-white px-4 py-2 rounded-lg shadow-lg text-sm">{toast}</div>
      )}

      {renderDeleteModal()}

      <div className="max-w-7xl mx-auto p-4">
        {/* Stats */}
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="bg-white rounded-xl border p-4">
            <p className="text-xs text-slate-400 uppercase font-medium">Total Billed</p>
            <p className="text-xl font-bold text-blue-600 mt-1">&pound;{totalBilled.toFixed(2)}</p>
          </div>
          <div className="bg-white rounded-xl border p-4">
            <p className="text-xs text-slate-400 uppercase font-medium">Paid</p>
            <p className="text-xl font-bold text-emerald-600 mt-1">&pound;{totalPaid.toFixed(2)}</p>
          </div>
          <div className="bg-white rounded-xl border p-4">
            <p className="text-xs text-slate-400 uppercase font-medium">Outstanding</p>
            <p className="text-xl font-bold text-red-600 mt-1">&pound;{totalOutstanding.toFixed(2)}</p>
          </div>
        </div>

        {/* Generate form */}
        {showGenerate && (
          <div className="bg-white rounded-xl border p-5 mb-4">
            <h3 className="text-sm font-semibold text-slate-800 mb-4">Generate Bill</h3>
            <p className="text-xs text-slate-500 mb-3">
              Bill is calculated from the last two meter readings for the selected pitch.
              Current unit rate: <strong>&pound;{unitRate.toFixed(2)}/kWh</strong>
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Select Pitch *</label>
                <select value={selectedPitch} onChange={e => setSelectedPitch(e.target.value)} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="">Choose pitch...</option>
                  {pitches.map(p => (
                    <option key={p.id} value={p.id}>{p.pitch_number} — {p.customer_name || 'Vacant'}</option>
                  ))}
                </select>
              </div>
              <div className="flex items-end gap-2">
                <button onClick={() => { setShowGenerate(false); setSelectedPitch(''); }} className="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg text-sm">Cancel</button>
                <button onClick={generateBill} disabled={!selectedPitch || generating} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium disabled:opacity-50">{generating ? 'Generating...' : 'Generate'}</button>
              </div>
            </div>
          </div>
        )}

        {/* Bills table */}
        {loading ? (
          <div className="flex justify-center py-12"><div className="animate-spin w-8 h-8 border-2 border-blue-400 border-t-transparent rounded-full" /></div>
        ) : bills.length === 0 ? (
          <div className="bg-white rounded-xl border p-8 text-center">
            <p className="text-sm text-slate-400">No bills yet. Take a meter reading, then generate a bill.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {bills.map(b => (
              <div key={b.id} className={`bg-white rounded-xl border overflow-hidden transition-all ${b.status === 'paid' ? 'border-emerald-200' : 'border-slate-200'}`}>
                {/* Bill header row */}
                <div
                  className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-slate-50"
                  onClick={() => setExpandedBill(expandedBill === b.id ? null : b.id)}
                >
                  {/* Paid tick or status badge */}
                  <div className="flex-shrink-0">
                    {b.status === 'paid' ? (
                      <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center">
                        <svg className="w-5 h-5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center">
                        <svg className="w-5 h-5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </div>
                    )}
                  </div>

                  {/* Pitch & customer */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-slate-900">{b.pitch?.pitch_number || '—'}</span>
                      <span className="text-sm text-slate-500">{b.pitch?.customer_name || '—'}</span>
                    </div>
                    <div className="text-xs text-slate-400 mt-0.5">
                      Billed: {b.period_end ? new Date(b.period_end).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : b.created_at ? new Date(b.created_at).toLocaleDateString('en-GB') : '—'}
                      {b.period_start && b.period_end && (
                        <span className="text-slate-300 ml-1">
                          (period: {new Date(b.period_start).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} — {new Date(b.period_end).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })})
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Due kWh */}
                  <div className="text-right hidden sm:block">
                    <span className="text-xs text-slate-400">Due kWh</span>
                    <p className="text-sm font-mono font-medium text-slate-700">{Number(b.usage_kwh).toLocaleString()}</p>
                  </div>

                  {/* Amount */}
                  <div className="text-right">
                    <span className="text-xs text-slate-400">Amount</span>
                    <p className={`text-base font-bold ${b.status === 'paid' ? 'text-emerald-600' : 'text-slate-900'}`}>
                      &pound;{Number(b.amount_gbp).toFixed(2)}
                    </p>
                  </div>

                  {/* Status badge */}
                  <div className="flex-shrink-0">
                    <span className={`text-xs px-2 py-1 rounded-full font-semibold ${
                      b.status === 'paid' ? 'bg-emerald-100 text-emerald-700' :
                      b.status === 'overdue' ? 'bg-amber-100 text-amber-700' :
                      'bg-red-100 text-red-700'
                    }`}>
                      {b.status === 'paid' ? 'PAID' : b.status === 'overdue' ? 'OVERDUE' : 'UNPAID'}
                    </span>
                  </div>

                  {/* Chevron */}
                  <svg className={`w-4 h-4 text-slate-400 transition-transform ${expandedBill === b.id ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>

                {/* Expanded detail */}
                {expandedBill === b.id && (
                  <div className="border-t border-slate-100 bg-slate-50 px-4 py-4">
                    {/* Billing Date */}
                    <div className="bg-white rounded-lg border p-3 mb-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-xs text-slate-400 font-medium">Billing Date</p>
                          <p className="text-sm font-bold text-slate-900">
                            {b.period_end ? new Date(b.period_end).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : '—'}
                          </p>
                        </div>
                        {b.period_start && b.period_end && (
                          <div className="text-right">
                            <p className="text-xs text-slate-400 font-medium">Billing Period</p>
                            <p className="text-sm text-slate-600">
                              {new Date(b.period_start).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })} &mdash; {new Date(b.period_end).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
                      {/* Previous Reading (From) */}
                      <div className="bg-white rounded-lg border p-3">
                        <p className="text-xs text-slate-400 font-medium mb-1">Previous Reading (From)</p>
                        <p className="text-lg font-mono font-bold text-slate-700">
                          {b.start_reading != null ? Number(b.start_reading).toLocaleString() : '—'}
                        </p>
                        {b.period_start && (
                          <p className="text-xs text-slate-400 mt-0.5">{new Date(b.period_start).toLocaleDateString('en-GB')}</p>
                        )}
                      </div>

                      {/* New Reading (To) */}
                      <div className="bg-white rounded-lg border p-3">
                        <p className="text-xs text-slate-400 font-medium mb-1">New Reading (To)</p>
                        <p className="text-lg font-mono font-bold text-slate-700">
                          {b.end_reading != null ? Number(b.end_reading).toLocaleString() : '—'}
                        </p>
                        {b.period_end && (
                          <p className="text-xs text-slate-400 mt-0.5">{new Date(b.period_end).toLocaleDateString('en-GB')}</p>
                        )}
                      </div>

                      {/* Due kWh for Period */}
                      <div className="bg-white rounded-lg border p-3">
                        <p className="text-xs text-slate-400 font-medium mb-1">Due kWh for Period</p>
                        <p className="text-lg font-bold text-blue-600">{Number(b.usage_kwh).toLocaleString()} kWh</p>
                        {b.start_reading != null && b.end_reading != null && (
                          <p className="text-xs text-slate-400 mt-0.5">
                            {Number(b.end_reading).toLocaleString()} &minus; {Number(b.start_reading).toLocaleString()}
                          </p>
                        )}
                      </div>

                      {/* Amount Due */}
                      <div className="bg-white rounded-lg border p-3">
                        <p className="text-xs text-slate-400 font-medium mb-1">Amount Due</p>
                        <p className="text-lg font-bold text-emerald-600">&pound;{Number(b.amount_gbp).toFixed(2)}</p>
                        <p className="text-xs text-slate-400 mt-0.5">
                          {Number(b.usage_kwh).toLocaleString()} kWh &times; &pound;{Number(b.unit_rate).toFixed(2)}
                        </p>
                      </div>
                    </div>

                    {/* Reading comparison bar */}
                    {b.start_reading != null && b.end_reading != null && (
                      <div className="bg-white rounded-lg border p-3 mb-4">
                        <p className="text-xs font-semibold text-slate-600 mb-2">From &rarr; To</p>
                        <div className="flex items-center gap-3">
                          <div className="text-center">
                            <p className="text-xs text-slate-400">From</p>
                            <p className="font-mono font-bold text-sm">{Number(b.start_reading).toLocaleString()}</p>
                          </div>
                          <div className="flex-1">
                            <div className="h-3 bg-slate-100 rounded-full overflow-hidden relative">
                              <div
                                className="h-full bg-gradient-to-r from-blue-500 to-emerald-500 rounded-full"
                                style={{ width: '100%' }}
                              />
                            </div>
                            <p className="text-center text-xs text-blue-600 font-bold mt-1">
                              +{Number(b.usage_kwh).toLocaleString()} kWh due
                            </p>
                          </div>
                          <div className="text-center">
                            <p className="text-xs text-slate-400">To</p>
                            <p className="font-mono font-bold text-sm">{Number(b.end_reading).toLocaleString()}</p>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Paid info */}
                    {b.status === 'paid' && (
                      <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 mb-4 flex items-center gap-2">
                        <svg className="w-5 h-5 text-emerald-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <div>
                          <p className="text-sm font-medium text-emerald-800">Paid on {b.paid_at ? new Date(b.paid_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : '—'}</p>
                          {b.marked_paid_by && <p className="text-xs text-emerald-600">Marked by: {b.marked_paid_by}</p>}
                        </div>
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex items-center gap-2">
                      {b.status !== 'paid' && canMarkPaid && (
                        <button
                          onClick={(e) => { e.stopPropagation(); markPaid(b.id); }}
                          className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-500 transition-colors flex items-center gap-1.5"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                          Mark as Paid
                        </button>
                      )}
                      <button
                        onClick={(e) => { e.stopPropagation(); printBill(b); }}
                        className="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-200 transition-colors flex items-center gap-1.5"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        Download PDF
                      </button>
                      {canMarkPaid && (
                        <button
                          onClick={(e) => { e.stopPropagation(); deleteBill(b); }}
                          className="px-4 py-2 bg-red-50 text-red-600 rounded-lg text-sm font-medium hover:bg-red-100 transition-colors flex items-center gap-1.5 ml-auto"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                          Delete
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  // Delete confirmation modal rendered below the bills list
  function renderDeleteModal() {
    if (!deleteConfirm) return null;
    const b = deleteConfirm;
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
          <div className="px-6 py-4 border-b">
            <h2 className="text-lg font-bold text-slate-900">Delete Bill</h2>
          </div>
          <div className="p-6 space-y-4">
            <p className="text-sm text-slate-700">
              Delete the bill for <strong>{b.pitch?.pitch_number || '—'}</strong> ({b.pitch?.customer_name || '—'})?
            </p>
            <div className="bg-red-50 border border-red-200 rounded-xl p-3">
              <p className="text-xs text-red-700">
                <strong>Amount:</strong> &pound;{Number(b.amount_gbp).toFixed(2)} &middot; <strong>Usage:</strong> {Number(b.usage_kwh).toLocaleString()} kWh
                {b.status === 'paid' && <span className="ml-2 text-amber-700 font-medium">(This bill is marked as paid)</span>}
              </p>
            </div>
            <div className="flex gap-3 pt-2">
              <button
                onClick={confirmDeleteBill}
                disabled={deletingBill}
                className="flex-1 py-2.5 bg-red-600 text-white rounded-xl font-semibold text-sm hover:bg-red-500 transition-colors disabled:opacity-50"
              >
                {deletingBill ? 'Deleting...' : 'Delete Bill'}
              </button>
              <button
                onClick={() => setDeleteConfirm(null)}
                disabled={deletingBill}
                className="px-5 py-2.5 border border-slate-200 text-slate-600 rounded-xl text-sm hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  async function printBill(bill) {
    const { default: jsPDF } = await import('jspdf');
    const doc = new jsPDF();
    const p = bill.pitch || {};

    // Header
    doc.setFontSize(20);
    doc.setTextColor(5, 150, 105); // emerald
    doc.text('Electricity Bill', 14, 22);
    doc.setFontSize(11);
    doc.setTextColor(100);
    doc.text(siteName, 14, 30);
    doc.setFontSize(9);
    doc.text(new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }), 196, 22, { align: 'right' });

    // Divider
    doc.setDrawColor(5, 150, 105);
    doc.setLineWidth(0.8);
    doc.line(14, 34, 196, 34);

    // Customer info
    let y = 44;
    doc.setFontSize(10);
    doc.setTextColor(0);
    const billingDate = bill.period_end ? new Date(bill.period_end).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
    const info = [
      ['Pitch', p.pitch_number || '—'],
      ['Customer', p.customer_name || '—'],
      ['Billing Date', billingDate],
      ['Billing Period', `${bill.period_start ? new Date(bill.period_start).toLocaleDateString('en-GB') : '—'} to ${bill.period_end ? new Date(bill.period_end).toLocaleDateString('en-GB') : '—'}`],
    ];
    info.forEach(([label, val]) => {
      doc.setFont(undefined, 'bold');
      doc.text(label, 14, y);
      doc.setFont(undefined, 'normal');
      doc.text(val, 60, y);
      y += 7;
    });

    // Meter readings box
    y += 6;
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(14, y - 4, 182, 40, 3, 3, 'FD');

    doc.setFontSize(11);
    doc.setFont(undefined, 'bold');
    doc.setTextColor(0);
    doc.text('Meter Readings', 18, y + 4);

    y += 12;
    doc.setFontSize(9);
    doc.setFillColor(241, 245, 249);
    doc.rect(18, y - 3, 174, 7, 'F');
    doc.setTextColor(100);
    doc.text('Description', 20, y + 1);
    doc.text('Reading', 170, y + 1, { align: 'right' });

    y += 9;
    doc.setTextColor(0);
    doc.setFont(undefined, 'normal');
    doc.text('Previous Reading (From)', 20, y);
    doc.setFont(undefined, 'bold');
    doc.text(bill.start_reading != null ? Number(bill.start_reading).toLocaleString() : '—', 170, y, { align: 'right' });

    y += 7;
    doc.setFont(undefined, 'normal');
    doc.text('New Reading (To)', 20, y);
    doc.setFont(undefined, 'bold');
    doc.text(bill.end_reading != null ? Number(bill.end_reading).toLocaleString() : '—', 170, y, { align: 'right' });

    // Cost calculation box
    y += 14;
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(14, y - 4, 182, 36, 3, 3, 'FD');

    doc.setFontSize(11);
    doc.setFont(undefined, 'bold');
    doc.setTextColor(0);
    doc.text('Cost Calculation', 18, y + 4);

    y += 12;
    doc.setFontSize(9);
    doc.setFont(undefined, 'normal');
    doc.text('Due kWh for Period', 20, y);
    doc.text(`${Number(bill.usage_kwh).toLocaleString()} kWh`, 170, y, { align: 'right' });

    y += 7;
    doc.text('Unit Rate', 20, y);
    doc.text(`£${Number(bill.unit_rate).toFixed(2)} per kWh`, 170, y, { align: 'right' });

    y += 9;
    doc.setDrawColor(226, 232, 240);
    doc.line(18, y - 4, 192, y - 4);
    doc.setFontSize(12);
    doc.setFont(undefined, 'bold');
    doc.text('Total Amount Due', 20, y);
    doc.setTextColor(5, 150, 105);
    doc.setFontSize(16);
    doc.text(`£${Number(bill.amount_gbp).toFixed(2)}`, 170, y, { align: 'right' });

    // Paid / Outstanding stamp
    y += 16;
    if (bill.status === 'paid') {
      doc.setDrawColor(5, 150, 105);
      doc.setLineWidth(1);
      doc.setTextColor(5, 150, 105);
      doc.setFontSize(24);
      doc.setFont(undefined, 'bold');
      doc.text('PAID', 105, y + 4, { align: 'center' });
      doc.roundedRect(75, y - 8, 60, 18, 3, 3, 'S');
      doc.setFontSize(9);
      doc.setFont(undefined, 'normal');
      doc.text(`Paid on ${bill.paid_at ? new Date(bill.paid_at).toLocaleDateString('en-GB') : '—'}${bill.marked_paid_by ? ' by ' + bill.marked_paid_by : ''}`, 105, y + 16, { align: 'center' });
    } else {
      doc.setFillColor(254, 242, 242);
      doc.setDrawColor(254, 202, 202);
      doc.roundedRect(50, y - 6, 110, 20, 3, 3, 'FD');
      doc.setTextColor(220, 38, 38);
      doc.setFontSize(14);
      doc.setFont(undefined, 'bold');
      doc.text('PAYMENT OUTSTANDING', 105, y + 3, { align: 'center' });
      doc.setFontSize(8);
      doc.setFont(undefined, 'normal');
      doc.text('Please contact the site manager to arrange payment.', 105, y + 10, { align: 'center' });
    }

    // Footer
    doc.setFontSize(8);
    doc.setTextColor(80);
    doc.text(`Carried out by: ${user.full_name || user.email}`, 14, 278);
    doc.setFontSize(7);
    doc.setTextColor(150);
    doc.text(`Generated by ${siteName} — ParkManagerAI — ${new Date().toLocaleString('en-GB')}`, 105, 285, { align: 'center' });

    const filename = `Bill-${p.pitch_number || 'Unknown'}-${bill.period_end || new Date().toISOString().slice(0, 10)}.pdf`;
    doc.save(filename);
    setToast(`PDF downloaded: ${filename}`);
    setTimeout(() => setToast(''), 3000);
  }
}
