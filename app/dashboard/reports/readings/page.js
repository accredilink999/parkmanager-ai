'use client';
import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

export default function ReadingReportsPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-50 flex items-center justify-center"><div className="animate-spin w-8 h-8 border-2 border-emerald-400 border-t-transparent rounded-full" /></div>}>
      <ReadingReportsContent />
    </Suspense>
  );
}

// Demo data
const demoPitches = [
  { id: '1', pitch_number: 'A1', customer_name: 'John Smith', customer_email: 'john@example.com', customer_phone: '07700 900001', meter_id: 'M001', status: 'occupied' },
  { id: '2', pitch_number: 'A2', customer_name: 'Jane Doe', customer_email: 'jane@example.com', meter_id: 'M002', status: 'occupied' },
  { id: '4', pitch_number: 'B1', customer_name: 'Bob Williams', customer_email: 'bob@example.com', meter_id: 'M004', status: 'occupied' },
  { id: '6', pitch_number: 'B3', customer_name: 'Sarah Johnson', customer_email: 'sarah@example.com', meter_id: 'M006', status: 'occupied' },
];

const demoReadings = [
  { id: '1', pitch_id: '1', reading: 15234, previous_reading: 14890, usage_kwh: 344, read_at: '2026-03-01T10:00:00' },
  { id: '2', pitch_id: '2', reading: 8921, previous_reading: 8650, usage_kwh: 271, read_at: '2026-03-01T10:15:00' },
  { id: '3', pitch_id: '4', reading: 22100, previous_reading: 21800, usage_kwh: 300, read_at: '2026-03-02T09:00:00' },
  { id: '4', pitch_id: '6', reading: 5420, previous_reading: 5110, usage_kwh: 310, read_at: '2026-03-02T09:30:00' },
  { id: '5', pitch_id: '1', reading: 14890, previous_reading: 14560, usage_kwh: 330, read_at: '2026-02-01T10:00:00' },
  { id: '6', pitch_id: '2', reading: 8650, previous_reading: 8400, usage_kwh: 250, read_at: '2026-02-01T10:15:00' },
  { id: '7', pitch_id: '4', reading: 21800, previous_reading: 21500, usage_kwh: 300, read_at: '2026-02-02T09:00:00' },
  { id: '8', pitch_id: '6', reading: 5110, previous_reading: 4800, usage_kwh: 310, read_at: '2026-02-02T09:30:00' },
];

function getMonthEnd(year, month, endDay) {
  if (endDay === 'last') return new Date(year, month + 1, 0);
  const d = parseInt(endDay);
  const lastDay = new Date(year, month + 1, 0).getDate();
  return new Date(year, month, Math.min(d, lastDay));
}

function formatDate(d) {
  return d.toISOString().split('T')[0];
}

function ReadingReportsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [user, setUser] = useState(null);
  const [pitches, setPitches] = useState([]);
  const [allReadings, setAllReadings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState('');
  const [sending, setSending] = useState('');
  const [siteName, setSiteName] = useState('ParkManagerAI');
  const [hoEmail, setHoEmail] = useState('');
  const [hoName, setHoName] = useState('');
  const [hoAddress, setHoAddress] = useState('');
  const [hoContact, setHoContact] = useState('');
  const [managerEmail, setManagerEmail] = useState('');
  const [monthEndDay, setMonthEndDay] = useState('last');
  const [unitRate, setUnitRate] = useState(0.34);

  // Date range
  const now = new Date();
  const defEnd = getMonthEnd(now.getFullYear(), now.getMonth(), 'last');
  const defStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const [dateFrom, setDateFrom] = useState(formatDate(defStart));
  const [dateTo, setDateTo] = useState(formatDate(defEnd));

  useEffect(() => {
    const saved = sessionStorage.getItem('pm_user');
    if (!saved) { router.push('/login'); return; }
    setUser(JSON.parse(saved));
    loadData();
  }, [router]);

  async function loadData() {
    setLoading(true);
    if (!supabase) {
      setPitches(demoPitches);
      setAllReadings(demoReadings);
      setLoading(false);
      return;
    }
    const [pRes, rRes, sRes] = await Promise.all([
      supabase.from('pitches').select('*').order('created_at'),
      supabase.from('meter_readings').select('*').order('read_at', { ascending: false }),
      supabase.from('site_settings').select('*'),
    ]);
    setPitches(pRes.data || []);
    setAllReadings(rRes.data || []);
    (sRes.data || []).forEach(s => {
      if (s.key === 'site_name') setSiteName(s.value);
      if (s.key === 'ho_email') setHoEmail(s.value);
      if (s.key === 'ho_name') setHoName(s.value);
      if (s.key === 'ho_address') setHoAddress(s.value);
      if (s.key === 'ho_contact') setHoContact(s.value);
      if (s.key === 'manager_email') setManagerEmail(s.value);
      if (s.key === 'month_end_day') setMonthEndDay(s.value);
      if (s.key === 'electricity_unit_rate') setUnitRate(parseFloat(s.value));
    });
    setLoading(false);
  }

  // Filter readings by date range
  const filtered = allReadings.filter(r => {
    const d = r.read_at?.split('T')[0];
    return d >= dateFrom && d <= dateTo;
  });

  // Previous period (same length, immediately before)
  const fromDate = new Date(dateFrom);
  const toDate = new Date(dateTo);
  const periodDays = Math.round((toDate - fromDate) / 86400000);
  const prevEnd = new Date(fromDate);
  prevEnd.setDate(prevEnd.getDate() - 1);
  const prevStart = new Date(prevEnd);
  prevStart.setDate(prevStart.getDate() - periodDays);
  const prevFiltered = allReadings.filter(r => {
    const d = r.read_at?.split('T')[0];
    return d >= formatDate(prevStart) && d <= formatDate(prevEnd);
  });

  const totalUsage = filtered.reduce((s, r) => s + Number(r.usage_kwh || 0), 0);
  const prevTotalUsage = prevFiltered.reduce((s, r) => s + Number(r.usage_kwh || 0), 0);
  const usageChange = prevTotalUsage > 0 ? ((totalUsage - prevTotalUsage) / prevTotalUsage * 100).toFixed(1) : null;

  function getPitch(pitchId) {
    return pitches.find(p => p.id === pitchId);
  }

  // Quick month presets
  function setMonth(offset) {
    const d = new Date();
    d.setMonth(d.getMonth() + offset);
    const start = new Date(d.getFullYear(), d.getMonth(), 1);
    const end = getMonthEnd(d.getFullYear(), d.getMonth(), monthEndDay);
    setDateFrom(formatDate(start));
    setDateTo(formatDate(end));
  }

  // PDF generation
  async function generatePDF() {
    const { default: jsPDF } = await import('jspdf');
    await import('jspdf-autotable');
    const doc = new jsPDF();

    // Header
    doc.setFillColor(5, 150, 105);
    doc.rect(0, 0, 210, 35, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(18);
    doc.text(siteName, 14, 16);
    doc.setFontSize(10);
    doc.text(`Meter Reading Report: ${dateFrom} to ${dateTo}`, 14, 25);
    doc.text(`Generated: ${new Date().toLocaleDateString('en-GB')}`, 14, 31);

    // Head office details
    if (hoName) {
      doc.setTextColor(100, 116, 139);
      doc.setFontSize(9);
      doc.text(`To: ${hoContact || hoName}`, 140, 16);
      doc.text(hoName, 140, 22);
    }

    // Stats
    doc.setTextColor(30, 41, 59);
    doc.setFontSize(11);
    let y = 45;
    doc.text(`Total Readings: ${filtered.length}`, 14, y);
    doc.text(`Total Usage: ${totalUsage.toLocaleString()} kWh`, 80, y);
    doc.text(`Est. Value: £${(totalUsage * unitRate).toFixed(2)}`, 150, y);
    y += 6;
    if (usageChange !== null) {
      doc.setFontSize(9);
      doc.setTextColor(usageChange > 0 ? 220 : 5, usageChange > 0 ? 38 : 150, usageChange > 0 ? 38 : 105);
      doc.text(`vs previous period: ${usageChange > 0 ? '+' : ''}${usageChange}% (${prevTotalUsage.toLocaleString()} kWh)`, 14, y);
    }

    // Table
    const rows = filtered.map(r => {
      const p = getPitch(r.pitch_id);
      return [
        new Date(r.read_at).toLocaleDateString('en-GB'),
        p?.pitch_number || '—',
        p?.customer_name || '—',
        p?.meter_id || '—',
        Number(r.previous_reading).toLocaleString(),
        Number(r.reading).toLocaleString(),
        Number(r.usage_kwh).toLocaleString(),
        `£${(Number(r.usage_kwh) * unitRate).toFixed(2)}`,
      ];
    });

    doc.autoTable({
      startY: y + 8,
      head: [['Date', 'Pitch', 'Customer', 'Meter', 'Previous', 'Current', 'Usage (kWh)', 'Value']],
      body: rows,
      styles: { fontSize: 8, cellPadding: 3 },
      headStyles: { fillColor: [5, 150, 105], textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [248, 250, 252] },
    });

    // Summary by pitch
    const pitchSummary = {};
    filtered.forEach(r => {
      if (!pitchSummary[r.pitch_id]) pitchSummary[r.pitch_id] = { usage: 0, count: 0 };
      pitchSummary[r.pitch_id].usage += Number(r.usage_kwh || 0);
      pitchSummary[r.pitch_id].count++;
    });

    const summaryY = doc.lastAutoTable.finalY + 10;
    doc.setFontSize(11);
    doc.setTextColor(30, 41, 59);
    doc.text('Summary by Pitch', 14, summaryY);

    const summaryRows = Object.entries(pitchSummary).map(([pid, data]) => {
      const p = getPitch(pid);
      return [
        p?.pitch_number || '—',
        p?.customer_name || '—',
        data.count.toString(),
        data.usage.toLocaleString() + ' kWh',
        `£${(data.usage * unitRate).toFixed(2)}`,
      ];
    });

    doc.autoTable({
      startY: summaryY + 4,
      head: [['Pitch', 'Customer', 'Readings', 'Total Usage', 'Value']],
      body: summaryRows,
      foot: [['', '', '', totalUsage.toLocaleString() + ' kWh', `£${(totalUsage * unitRate).toFixed(2)}`]],
      styles: { fontSize: 9, cellPadding: 3 },
      headStyles: { fillColor: [5, 150, 105], textColor: 255, fontStyle: 'bold' },
      footStyles: { fillColor: [5, 150, 105], textColor: 255, fontStyle: 'bold' },
    });

    // Footer
    const pageHeight = doc.internal.pageSize.height;
    const ru = JSON.parse(sessionStorage.getItem('pm_user') || '{}');
    doc.setFontSize(8);
    doc.setTextColor(80);
    doc.text(`Carried out by: ${ru.full_name || ru.email || ''}`, 14, pageHeight - 16);
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184);
    doc.text(`${siteName} — ParkManagerAI — ${new Date().toLocaleString('en-GB')}`, 14, pageHeight - 10);

    return doc;
  }

  async function downloadPDF() {
    const doc = await generatePDF();
    doc.save(`${siteName.replace(/\s+/g, '-')}-Readings-${dateFrom}-to-${dateTo}.pdf`);
    setToast('PDF downloaded');
    setTimeout(() => setToast(''), 3000);
  }

  async function downloadIndividualPDF(reading) {
    const { default: jsPDF } = await import('jspdf');
    const doc = new jsPDF();
    const p = getPitch(reading.pitch_id);

    doc.setFillColor(5, 150, 105);
    doc.rect(0, 0, 210, 30, 'F');
    doc.setTextColor(255);
    doc.setFontSize(16);
    doc.text(`Meter Reading — Pitch ${p?.pitch_number || '—'}`, 14, 14);
    doc.setFontSize(10);
    doc.text(`${siteName} — ${new Date(reading.read_at).toLocaleDateString('en-GB')}`, 14, 23);

    doc.setTextColor(30, 41, 59);
    doc.setFontSize(11);
    let y = 45;
    const details = [
      ['Pitch:', p?.pitch_number || '—'],
      ['Customer:', p?.customer_name || '—'],
      ['Meter ID:', p?.meter_id || '—'],
      ['Date:', new Date(reading.read_at).toLocaleDateString('en-GB')],
      ['Previous Reading:', Number(reading.previous_reading).toLocaleString()],
      ['Current Reading:', Number(reading.reading).toLocaleString()],
      ['Usage:', Number(reading.usage_kwh).toLocaleString() + ' kWh'],
      ['Unit Rate:', `£${unitRate.toFixed(2)}/kWh`],
      ['Value:', `£${(Number(reading.usage_kwh) * unitRate).toFixed(2)}`],
    ];
    details.forEach(([label, val]) => {
      doc.setFont(undefined, 'bold');
      doc.text(label, 14, y);
      doc.setFont(undefined, 'normal');
      doc.text(val, 60, y);
      y += 8;
    });

    y += 6;
    const iru = JSON.parse(sessionStorage.getItem('pm_user') || '{}');
    doc.setFontSize(8);
    doc.setTextColor(80);
    doc.text(`Carried out by: ${iru.full_name || iru.email || ''}`, 14, y);

    doc.save(`Reading-${p?.pitch_number || 'unknown'}-${new Date(reading.read_at).toLocaleDateString('en-GB').replace(/\//g, '-')}.pdf`);
  }

  async function sendToEmail(recipient, label) {
    setSending(label);
    try {
      const doc = await generatePDF();
      const pdfBase64 = doc.output('datauristring').split(',')[1];
      const fileName = `${siteName.replace(/\s+/g, '-')}-Readings-${dateFrom}-to-${dateTo}.pdf`;

      const res = await fetch('/api/send-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: recipient,
          subject: `${siteName} — Meter Readings Report (${dateFrom} to ${dateTo})`,
          body: `
            <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
              <div style="background:linear-gradient(135deg,#059669,#0d9488);padding:24px;border-radius:12px 12px 0 0;">
                <h1 style="color:white;margin:0;font-size:20px;">${siteName}</h1>
                <p style="color:rgba(255,255,255,0.8);margin:4px 0 0;font-size:13px;">Meter Readings Report</p>
              </div>
              <div style="background:#f8fafc;padding:24px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 12px 12px;">
                <p style="color:#475569;font-size:14px;">Please find attached the meter readings report for the period <strong>${dateFrom}</strong> to <strong>${dateTo}</strong>.</p>
                <div style="background:white;border:1px solid #e2e8f0;border-radius:8px;padding:16px;margin:16px 0;">
                  <table style="width:100%;">
                    <tr><td style="color:#64748b;font-size:12px;padding:4px 0;">Total Readings:</td><td style="font-weight:bold;font-size:13px;">${filtered.length}</td></tr>
                    <tr><td style="color:#64748b;font-size:12px;padding:4px 0;">Total Usage:</td><td style="font-weight:bold;font-size:13px;">${totalUsage.toLocaleString()} kWh</td></tr>
                    <tr><td style="color:#64748b;font-size:12px;padding:4px 0;">Estimated Value:</td><td style="font-weight:bold;font-size:13px;">£${(totalUsage * unitRate).toFixed(2)}</td></tr>
                  </table>
                </div>
                <p style="color:#94a3b8;font-size:11px;text-align:center;margin-top:16px;">Generated by ParkManagerAI</p>
              </div>
            </div>
          `,
          pdfBase64,
          fileName,
        }),
      });

      const data = await res.json();
      setToast(data.message || `Report sent to ${recipient}`);
    } catch (err) {
      setToast('Error: ' + err.message);
    }
    setSending('');
    setTimeout(() => setToast(''), 4000);
  }

  if (!user) return null;

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 px-4 py-3 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto flex items-center gap-3">
          <Link href="/dashboard/reports" className="text-slate-400 hover:text-slate-700 text-sm">&larr; Reports</Link>
          <h1 className="text-lg font-bold text-slate-900">Meter Reading Report</h1>
        </div>
      </header>

      {toast && (
        <div className="fixed top-4 right-4 z-50 bg-emerald-600 text-white px-4 py-2 rounded-lg shadow-lg text-sm z-[60]">{toast}</div>
      )}

      <div className="max-w-7xl mx-auto p-4 space-y-4">
        {/* Date Range Picker */}
        <div className="bg-white rounded-xl border p-5">
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">From</label>
              <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">To</label>
              <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
            </div>
            <div className="flex gap-2">
              <button onClick={() => setMonth(0)} className="px-3 py-2 bg-emerald-100 text-emerald-700 rounded-lg text-xs font-medium hover:bg-emerald-200">This Month</button>
              <button onClick={() => setMonth(-1)} className="px-3 py-2 bg-slate-100 text-slate-700 rounded-lg text-xs font-medium hover:bg-slate-200">Last Month</button>
              <button onClick={() => setMonth(-2)} className="px-3 py-2 bg-slate-100 text-slate-700 rounded-lg text-xs font-medium hover:bg-slate-200">2 Months Ago</button>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white rounded-xl border p-4">
            <p className="text-xs text-slate-500 mb-1">Readings</p>
            <p className="text-2xl font-bold text-blue-600">{filtered.length}</p>
          </div>
          <div className="bg-white rounded-xl border p-4">
            <p className="text-xs text-slate-500 mb-1">Total Usage</p>
            <p className="text-2xl font-bold text-emerald-600">{totalUsage.toLocaleString()} kWh</p>
          </div>
          <div className="bg-white rounded-xl border p-4">
            <p className="text-xs text-slate-500 mb-1">Estimated Value</p>
            <p className="text-2xl font-bold text-purple-600">£{(totalUsage * unitRate).toFixed(2)}</p>
          </div>
          <div className="bg-white rounded-xl border p-4">
            <p className="text-xs text-slate-500 mb-1">vs Previous Period</p>
            {usageChange !== null ? (
              <p className={`text-2xl font-bold ${parseFloat(usageChange) > 0 ? 'text-red-600' : 'text-green-600'}`}>
                {parseFloat(usageChange) > 0 ? '+' : ''}{usageChange}%
              </p>
            ) : (
              <p className="text-2xl font-bold text-slate-300">—</p>
            )}
            <p className="text-xs text-slate-400">Prev: {prevTotalUsage.toLocaleString()} kWh</p>
          </div>
        </div>

        {/* Actions */}
        <div className="bg-white rounded-xl border p-4">
          <div className="flex flex-wrap gap-3">
            <button onClick={downloadPDF} className="px-4 py-2.5 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-500 transition-colors flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
              Download PDF
            </button>
            {hoEmail && (
              <button onClick={() => sendToEmail(hoEmail, 'ho')} disabled={!!sending} className="px-4 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-500 transition-colors flex items-center gap-2 disabled:opacity-50">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                {sending === 'ho' ? 'Sending...' : `Send to Head Office`}
              </button>
            )}
            {managerEmail && (
              <button onClick={() => sendToEmail(managerEmail, 'mgr')} disabled={!!sending} className="px-4 py-2.5 bg-teal-600 text-white rounded-lg text-sm font-medium hover:bg-teal-500 transition-colors flex items-center gap-2 disabled:opacity-50">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                {sending === 'mgr' ? 'Sending...' : `Send to Manager`}
              </button>
            )}
            {hoEmail && managerEmail && (
              <button onClick={() => sendToEmail(hoEmail, 'both')} disabled={!!sending} className="px-4 py-2.5 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-500 transition-colors flex items-center gap-2 disabled:opacity-50">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                {sending === 'both' ? 'Sending...' : 'Send to Both'}
              </button>
            )}
            {!hoEmail && !managerEmail && (
              <Link href="/dashboard/settings" className="px-4 py-2.5 border border-slate-200 text-slate-500 rounded-lg text-sm hover:bg-slate-50 flex items-center gap-2">
                Configure email recipients in Settings
              </Link>
            )}
          </div>
        </div>

        {/* Readings Table */}
        {loading ? (
          <div className="flex justify-center py-12"><div className="animate-spin w-8 h-8 border-2 border-emerald-400 border-t-transparent rounded-full" /></div>
        ) : filtered.length === 0 ? (
          <div className="bg-white rounded-xl border p-8 text-center">
            <p className="text-sm text-slate-400">No readings found in this date range.</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border overflow-hidden">
            <table className="w-full">
              <thead className="bg-slate-50 border-b">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500">Date</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500">Pitch</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 hidden sm:table-cell">Customer</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500">Previous</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500">Current</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500">Usage</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 hidden sm:table-cell">Value</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500">PDF</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map(r => {
                  const p = getPitch(r.pitch_id);
                  return (
                    <tr key={r.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 text-sm text-slate-600">{new Date(r.read_at).toLocaleDateString('en-GB')}</td>
                      <td className="px-4 py-3 text-sm font-semibold text-slate-900">{p?.pitch_number || '—'}</td>
                      <td className="px-4 py-3 text-sm text-slate-600 hidden sm:table-cell">{p?.customer_name || '—'}</td>
                      <td className="px-4 py-3 text-sm text-right font-mono text-slate-400">{Number(r.previous_reading).toLocaleString()}</td>
                      <td className="px-4 py-3 text-sm text-right font-mono">{Number(r.reading).toLocaleString()}</td>
                      <td className="px-4 py-3 text-sm text-right font-bold text-emerald-600">{Number(r.usage_kwh).toLocaleString()}</td>
                      <td className="px-4 py-3 text-sm text-right text-slate-600 hidden sm:table-cell">£{(Number(r.usage_kwh) * unitRate).toFixed(2)}</td>
                      <td className="px-4 py-3 text-right">
                        <button onClick={() => downloadIndividualPDF(r)} className="text-xs text-emerald-600 hover:text-emerald-800 font-medium">PDF</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="bg-emerald-50 border-t-2 border-emerald-200">
                <tr>
                  <td colSpan={5} className="px-4 py-3 text-sm font-bold text-slate-700 text-right">Totals:</td>
                  <td className="px-4 py-3 text-sm text-right font-bold text-emerald-700">{totalUsage.toLocaleString()} kWh</td>
                  <td className="px-4 py-3 text-sm text-right font-bold text-emerald-700 hidden sm:table-cell">£{(totalUsage * unitRate).toFixed(2)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
