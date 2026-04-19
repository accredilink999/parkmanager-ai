'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

// Demo data
const demoPitches = [
  { id: '1', pitch_number: 'A1', customer_name: 'John Smith', customer_email: 'john@example.com', customer_phone: '07700 900001', meter_id: 'M001', status: 'occupied' },
  { id: '2', pitch_number: 'A2', customer_name: 'Jane Doe', customer_email: 'jane@example.com', customer_phone: '07700 900002', meter_id: 'M002', status: 'occupied' },
  { id: '3', pitch_number: 'A3', customer_name: null, meter_id: 'M003', status: 'vacant' },
  { id: '4', pitch_number: 'B1', customer_name: 'Bob Williams', customer_email: 'bob@example.com', meter_id: 'M004', status: 'occupied' },
  { id: '5', pitch_number: 'B2', customer_name: null, meter_id: 'M005', status: 'maintenance' },
  { id: '6', pitch_number: 'B3', customer_name: 'Sarah Johnson', customer_email: 'sarah@example.com', meter_id: 'M006', status: 'occupied' },
];

const demoReadings = [
  { id: '1', pitch_id: '1', reading: 15234, previous_reading: 14890, usage_kwh: 344, read_at: '2026-03-01T10:00:00' },
  { id: '2', pitch_id: '2', reading: 8921, previous_reading: 8650, usage_kwh: 271, read_at: '2026-03-01T10:15:00' },
  { id: '3', pitch_id: '4', reading: 22100, previous_reading: 21800, usage_kwh: 300, read_at: '2026-03-02T09:00:00' },
  { id: '4', pitch_id: '6', reading: 5420, previous_reading: 5110, usage_kwh: 310, read_at: '2026-03-02T09:30:00' },
  { id: '5', pitch_id: '1', reading: 14890, previous_reading: 14560, usage_kwh: 330, read_at: '2026-02-01T10:00:00' },
  { id: '6', pitch_id: '2', reading: 8650, previous_reading: 8400, usage_kwh: 250, read_at: '2026-02-01T10:15:00' },
];

const demoBills = [
  { id: '1', pitch_id: '1', customer_id: '1', usage_kwh: 344, unit_rate: 0.34, amount_gbp: 116.96, status: 'unpaid', created_at: '2026-03-01', period_end: '2026-03-01' },
  { id: '2', pitch_id: '2', customer_id: '2', usage_kwh: 271, unit_rate: 0.34, amount_gbp: 92.14, status: 'paid', created_at: '2026-03-01', period_end: '2026-03-01', paid_at: '2026-03-05' },
  { id: '3', pitch_id: '4', customer_id: '4', usage_kwh: 300, unit_rate: 0.34, amount_gbp: 102.00, status: 'unpaid', created_at: '2026-03-02', period_end: '2026-03-02' },
  { id: '4', pitch_id: '6', customer_id: '6', usage_kwh: 310, unit_rate: 0.34, amount_gbp: 105.40, status: 'paid', created_at: '2026-02-01', period_end: '2026-02-28', paid_at: '2026-02-15' },
  { id: '5', pitch_id: '1', customer_id: '1', usage_kwh: 330, unit_rate: 0.34, amount_gbp: 112.20, status: 'paid', created_at: '2026-02-01', period_end: '2026-02-28', paid_at: '2026-02-20' },
];

export default function ReportsPage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [pitches, setPitches] = useState([]);
  const [readings, setReadings] = useState([]);
  const [bills, setBills] = useState([]);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState('');
  const [siteName, setSiteName] = useState('ParkManagerAI');
  const [hoDetails, setHoDetails] = useState({});

  useEffect(() => {
    const saved = localStorage.getItem('pm_user');
    if (!saved) { router.push('/login'); return; }
    setUser(JSON.parse(saved));
    loadData();
  }, [router]);

  async function loadData() {
    setLoading(true);
    if (!supabase) {
      setPitches(demoPitches);
      setReadings(demoReadings);
      setBills(demoBills);
      setLoading(false);
      return;
    }
    const [pRes, rRes, bRes, sRes] = await Promise.all([
      supabase.from('pitches').select('*').order('created_at'),
      supabase.from('meter_readings').select('*').order('read_at', { ascending: false }),
      supabase.from('bills').select('*').order('created_at', { ascending: false }),
      supabase.from('site_settings').select('*'),
    ]);
    setPitches(pRes.data || []);
    setReadings(rRes.data || []);
    setBills(bRes.data || []);
    (sRes.data || []).forEach(s => {
      if (s.key === 'site_name') setSiteName(s.value);
      if (s.key.startsWith('ho_')) setHoDetails(prev => ({ ...prev, [s.key]: s.value }));
    });
    setLoading(false);
  }

  function getPitchName(pitchId) {
    const p = pitches.find(x => x.id === pitchId);
    return p ? `${p.pitch_number} — ${p.customer_name || 'Vacant'}` : pitchId;
  }

  async function downloadReport(title, statBoxes, tableHeaders, tableRows, footerRow) {
    const { default: jsPDF } = await import('jspdf');
    const doc = new jsPDF();

    // Header
    doc.setFontSize(18);
    doc.setTextColor(5, 150, 105);
    doc.text(title, 14, 20);
    doc.setFontSize(11);
    doc.setTextColor(100);
    doc.text(siteName, 14, 28);
    doc.setFontSize(9);
    doc.text(new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }), 196, 20, { align: 'right' });
    if (hoDetails.ho_name) {
      doc.text(hoDetails.ho_name, 196, 26, { align: 'right' });
    }
    doc.setDrawColor(5, 150, 105);
    doc.setLineWidth(0.8);
    doc.line(14, 32, 196, 32);

    // Stat boxes
    let y = 40;
    if (statBoxes && statBoxes.length > 0) {
      const boxW = Math.min(45, (182 - (statBoxes.length - 1) * 4) / statBoxes.length);
      statBoxes.forEach((s, i) => {
        const x = 14 + i * (boxW + 4);
        doc.setFillColor(248, 250, 252);
        doc.setDrawColor(226, 232, 240);
        doc.roundedRect(x, y - 2, boxW, 18, 2, 2, 'FD');
        doc.setFontSize(7);
        doc.setTextColor(100);
        doc.text(s.label, x + 3, y + 4);
        doc.setFontSize(14);
        doc.setTextColor(s.color === 'red' ? 220 : s.color === 'green' ? 5 : s.color === 'blue' ? 37 : 30,
                         s.color === 'red' ? 38 : s.color === 'green' ? 150 : s.color === 'blue' ? 99 : 41,
                         s.color === 'red' ? 38 : s.color === 'green' ? 105 : s.color === 'blue' ? 235 : 59);
        doc.setFont(undefined, 'bold');
        doc.text(s.value, x + 3, y + 13);
        doc.setFont(undefined, 'normal');
      });
      y += 24;
    }

    // Table
    if (tableHeaders && tableRows) {
      // Header row
      doc.setFillColor(241, 245, 249);
      doc.rect(14, y, 182, 7, 'F');
      doc.setFontSize(7);
      doc.setTextColor(100);
      const colW = 182 / tableHeaders.length;
      tableHeaders.forEach((h, i) => {
        doc.text(h, 16 + i * colW, y + 5);
      });

      y += 9;
      doc.setFontSize(8);
      doc.setTextColor(0);
      tableRows.forEach(row => {
        if (y > 275) { doc.addPage(); y = 20; }
        row.forEach((cell, i) => {
          const isLast = i === row.length - 1;
          const isAmount = String(cell).startsWith('£');
          if (isAmount || isLast) {
            doc.setFont(undefined, 'bold');
          } else {
            doc.setFont(undefined, 'normal');
          }
          doc.text(String(cell), 16 + i * colW, y);
        });
        y += 5;
      });

      // Footer row
      if (footerRow) {
        y += 2;
        doc.setDrawColor(5, 150, 105);
        doc.line(14, y - 3, 196, y - 3);
        doc.setFont(undefined, 'bold');
        doc.setTextColor(5, 150, 105);
        footerRow.forEach((cell, i) => {
          doc.text(String(cell), 16 + i * colW, y);
        });
      }
    }

    // Footer
    const ru = JSON.parse(localStorage.getItem('pm_user') || '{}');
    doc.setFontSize(8);
    doc.setTextColor(80);
    doc.setFont(undefined, 'normal');
    doc.text(`Carried out by: ${ru.full_name || ru.email || ''}`, 14, 278);
    doc.setFontSize(7);
    doc.setTextColor(150);
    doc.text(`Generated by ${siteName} — ParkManagerAI — ${new Date().toLocaleString('en-GB')}`, 105, 285, { align: 'center' });

    const filename = `${title.replace(/\s+/g, '-')}-${new Date().toISOString().slice(0, 10)}.pdf`;
    doc.save(filename);
    setToast(`PDF downloaded: ${filename}`);
    setTimeout(() => setToast(''), 3000);
  }

  // ---- Report generators ----

  function monthlyUsage() {
    const now = new Date();
    const thisMonth = readings.filter(r => {
      const d = new Date(r.read_at);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    });
    const totalKwh = thisMonth.reduce((s, r) => s + Number(r.usage_kwh || 0), 0);
    const pitchUsage = {};
    thisMonth.forEach(r => {
      pitchUsage[r.pitch_id] = (pitchUsage[r.pitch_id] || 0) + Number(r.usage_kwh || 0);
    });

    const rows = Object.entries(pitchUsage)
      .sort((a, b) => b[1] - a[1])
      .map(([pid, kwh]) => [getPitchName(pid), `${kwh.toLocaleString()} kWh`]);

    downloadReport('Monthly Usage Report',
      [
        { label: 'Total Readings', value: String(thisMonth.length), color: 'blue' },
        { label: 'Total Usage', value: `${totalKwh.toLocaleString()} kWh`, color: 'green' },
        { label: 'Avg per Pitch', value: `${Object.keys(pitchUsage).length ? Math.round(totalKwh / Object.keys(pitchUsage).length).toLocaleString() : 0} kWh`, color: 'default' },
      ],
      ['Pitch', 'Usage (kWh)'],
      rows.length > 0 ? rows : [['No readings this month', '']],
    );
  }

  function revenueReport() {
    const totalBilled = bills.reduce((s, b) => s + Number(b.amount_gbp || 0), 0);
    const totalPaid = bills.filter(b => b.status === 'paid').reduce((s, b) => s + Number(b.amount_gbp || 0), 0);
    const totalOutstanding = bills.filter(b => b.status === 'unpaid').reduce((s, b) => s + Number(b.amount_gbp || 0), 0);

    const rows = bills.map(b => [
      getPitchName(b.pitch_id),
      `${Number(b.usage_kwh).toLocaleString()} kWh`,
      `£${Number(b.amount_gbp).toFixed(2)}`,
      b.status.toUpperCase(),
      b.period_end || b.created_at?.split('T')[0] || '',
    ]);

    downloadReport('Revenue Report',
      [
        { label: 'Total Billed', value: `£${totalBilled.toFixed(2)}`, color: 'blue' },
        { label: 'Paid', value: `£${totalPaid.toFixed(2)}`, color: 'green' },
        { label: 'Outstanding', value: `£${totalOutstanding.toFixed(2)}`, color: 'red' },
      ],
      ['Pitch', 'Usage', 'Amount', 'Status', 'Period'],
      rows,
    );
  }

  function pitchSummary() {
    const occupied = pitches.filter(p => p.status === 'occupied').length;
    const vacant = pitches.filter(p => p.status === 'vacant').length;
    const maint = pitches.filter(p => p.status === 'maintenance').length;
    const occupancy = pitches.length ? Math.round((occupied / pitches.length) * 100) : 0;

    const rows = pitches.map(p => [
      p.pitch_number,
      p.customer_name || '—',
      p.customer_email || '—',
      p.meter_id || '—',
      p.status,
    ]);

    downloadReport('Pitch Summary',
      [
        { label: 'Total Pitches', value: String(pitches.length), color: 'default' },
        { label: 'Occupied', value: String(occupied), color: 'green' },
        { label: 'Vacant', value: String(vacant), color: 'blue' },
        { label: `Occupancy ${occupancy}%`, value: String(maint) + ' maint', color: 'red' },
      ],
      ['Pitch', 'Customer', 'Email', 'Meter', 'Status'],
      rows,
    );
  }

  function headOfficeExport() {
    const occupied = pitches.filter(p => p.status === 'occupied').length;
    const totalBilled = bills.reduce((s, b) => s + Number(b.amount_gbp || 0), 0);
    const totalOutstanding = bills.filter(b => b.status === 'unpaid').reduce((s, b) => s + Number(b.amount_gbp || 0), 0);
    const totalUsage = readings.reduce((s, r) => s + Number(r.usage_kwh || 0), 0);

    const rows = pitches.map(p => {
      const pReadings = readings.filter(r => r.pitch_id === p.id);
      const pBills = bills.filter(b => b.pitch_id === p.id);
      const pUsage = pReadings.reduce((s, r) => s + Number(r.usage_kwh || 0), 0);
      const pBilled = pBills.reduce((s, b) => s + Number(b.amount_gbp || 0), 0);
      const pOwed = pBills.filter(b => b.status === 'unpaid').reduce((s, b) => s + Number(b.amount_gbp || 0), 0);
      return [
        p.pitch_number,
        p.customer_name || '—',
        p.status,
        `${pUsage.toLocaleString()} kWh`,
        `£${pBilled.toFixed(2)}`,
        `£${pOwed.toFixed(2)}`,
      ];
    });

    downloadReport('Head Office Report',
      [
        { label: 'Pitches', value: String(pitches.length), color: 'default' },
        { label: 'Occupied', value: String(occupied), color: 'green' },
        { label: 'Total Billed', value: `£${totalBilled.toFixed(2)}`, color: 'blue' },
        { label: 'Outstanding', value: `£${totalOutstanding.toFixed(2)}`, color: 'red' },
      ],
      ['Pitch', 'Customer', 'Status', 'Usage', 'Billed', 'Owed'],
      rows,
      ['', '', 'TOTALS', `${totalUsage.toLocaleString()} kWh`, `£${totalBilled.toFixed(2)}`, `£${totalOutstanding.toFixed(2)}`],
    );
  }

  if (!user) return null;

  const reports = [
    { title: 'Monthly Usage Report', desc: 'Total kWh usage across all pitches this month', icon: '⚡', color: 'from-emerald-500 to-green-400', action: monthlyUsage },
    { title: 'Revenue Report', desc: 'Total billing, paid vs outstanding amounts', icon: '💰', color: 'from-blue-500 to-sky-400', action: revenueReport },
    { title: 'Pitch Summary', desc: 'Occupancy rates, vacant pitches, maintenance', icon: '🏕️', color: 'from-purple-500 to-violet-400', action: pitchSummary },
    { title: 'Outstanding Bills', desc: 'Individual & batch PDFs, email to head office', icon: '📋', color: 'from-red-500 to-rose-400', action: () => router.push('/dashboard/reports/outstanding') },
    { title: 'Reading History', desc: 'All meter readings by date range with PDF export', icon: '📊', color: 'from-amber-500 to-orange-400', action: () => router.push('/dashboard/reports/readings') },
    { title: 'Head Office Export', desc: 'Generate branded report for head office', icon: '📄', color: 'from-teal-500 to-cyan-400', action: headOfficeExport },
  ];

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 px-4 py-3 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto flex items-center gap-3">
          <Link href="/dashboard" className="text-slate-400 hover:text-slate-700 text-sm">&larr; Dashboard</Link>
          <h1 className="text-lg font-bold text-slate-900">Reports</h1>
        </div>
      </header>

      {toast && (
        <div className="fixed top-4 right-4 z-50 bg-emerald-600 text-white px-4 py-2 rounded-lg shadow-lg text-sm">{toast}</div>
      )}

      <div className="max-w-7xl mx-auto p-4 space-y-4">
        {loading ? (
          <div className="flex justify-center py-12"><div className="animate-spin w-8 h-8 border-2 border-emerald-400 border-t-transparent rounded-full" /></div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {reports.map(r => (
              <button
                key={r.title}
                onClick={r.action}
                className={`bg-gradient-to-br ${r.color} rounded-2xl p-6 text-white text-left cursor-pointer hover:shadow-lg hover:scale-[1.02] transition-all`}
              >
                <span className="text-3xl mb-3 block">{r.icon}</span>
                <h3 className="text-base font-bold mb-1">{r.title}</h3>
                <p className="text-sm text-white/80">{r.desc}</p>
                <p className="text-xs text-white/60 mt-3 font-medium">Click to generate &rarr;</p>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
