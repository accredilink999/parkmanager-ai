'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

const demoPitches = [
  { id: '1', pitch_number: 'A1', customer_name: 'John Smith', customer_email: 'john@example.com', customer_phone: '07700 900001', meter_id: 'M001' },
  { id: '2', pitch_number: 'A2', customer_name: 'Jane Doe', customer_email: 'jane@example.com', meter_id: 'M002' },
  { id: '4', pitch_number: 'B1', customer_name: 'Bob Williams', customer_email: 'bob@example.com', meter_id: 'M004' },
];

const demoBills = [
  { id: '1', pitch_id: '1', usage_kwh: 344, unit_rate: 0.34, amount_gbp: 116.96, start_reading: 14890, end_reading: 15234, status: 'unpaid', created_at: '2026-03-01', period_start: '2026-02-01', period_end: '2026-03-01' },
  { id: '3', pitch_id: '4', usage_kwh: 300, unit_rate: 0.34, amount_gbp: 102.00, start_reading: 21800, end_reading: 22100, status: 'unpaid', created_at: '2026-03-02', period_start: '2026-02-02', period_end: '2026-03-02' },
];

export default function OutstandingBillsPage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [pitches, setPitches] = useState([]);
  const [bills, setBills] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState('');
  const [sending, setSending] = useState('');
  const [selectedBills, setSelectedBills] = useState(new Set());

  // Settings
  const [siteName, setSiteName] = useState('ParkManagerAI');
  const [siteAddress, setSiteAddress] = useState('');
  const [unitRate, setUnitRate] = useState(0.34);
  const [managerEmail, setManagerEmail] = useState('');
  const [hoEmail, setHoEmail] = useState('');
  const [hoName, setHoName] = useState('');

  useEffect(() => {
    const saved = sessionStorage.getItem('pm_user');
    if (!saved) { router.push('/login'); return; }
    setUser(JSON.parse(saved));
    loadData();
  }, [router]);

  async function loadData() {
    setLoading(true);

    // Load settings
    try {
      const saved = JSON.parse(localStorage.getItem('pm_settings') || '[]');
      saved.forEach(s => {
        if (s.key === 'site_name' && s.value) setSiteName(s.value);
        if (s.key === 'site_address' && s.value) setSiteAddress(s.value);
        if (s.key === 'electricity_unit_rate' && s.value) setUnitRate(parseFloat(s.value));
        if (s.key === 'manager_email' && s.value) setManagerEmail(s.value);
        if (s.key === 'ho_email' && s.value) setHoEmail(s.value);
        if (s.key === 'ho_name' && s.value) setHoName(s.value);
      });
    } catch {}

    if (!supabase) {
      setPitches(demoPitches);
      setBills(demoBills);
      setLoading(false);
      return;
    }

    const [pRes, bRes, sRes] = await Promise.all([
      supabase.from('pitches').select('*').order('created_at'),
      supabase.from('bills').select('*, pitches(pitch_number, customer_name, customer_email, customer_phone)').eq('status', 'unpaid').order('created_at', { ascending: false }),
      supabase.from('site_settings').select('*'),
    ]);

    setPitches(pRes.data || []);
    setBills((bRes.data || []).map(b => ({ ...b, pitch: b.pitches })));
    (sRes.data || []).forEach(s => {
      if (s.key === 'site_name') setSiteName(s.value);
      if (s.key === 'site_address') setSiteAddress(s.value);
      if (s.key === 'electricity_unit_rate') setUnitRate(parseFloat(s.value));
      if (s.key === 'manager_email') setManagerEmail(s.value);
      if (s.key === 'ho_email') setHoEmail(s.value);
      if (s.key === 'ho_name') setHoName(s.value);
    });
    setLoading(false);
  }

  function getPitch(bill) {
    if (bill.pitch) return bill.pitch;
    return pitches.find(p => p.id === bill.pitch_id) || {};
  }

  function flash(msg) {
    setToast(msg);
    setTimeout(() => setToast(''), 4000);
  }

  // Toggle selection
  function toggleSelect(billId) {
    setSelectedBills(prev => {
      const next = new Set(prev);
      if (next.has(billId)) next.delete(billId);
      else next.add(billId);
      return next;
    });
  }

  function selectAll() {
    if (selectedBills.size === unpaidBills.length) {
      setSelectedBills(new Set());
    } else {
      setSelectedBills(new Set(unpaidBills.map(b => b.id)));
    }
  }

  // ---- Generate individual bill PDF (returns jsPDF doc) ----
  async function generateBillPdf(bill) {
    const { default: jsPDF } = await import('jspdf');
    const doc = new jsPDF();
    const p = getPitch(bill);

    // Header
    doc.setFontSize(20);
    doc.setTextColor(5, 150, 105);
    doc.text('Electricity Bill', 14, 22);
    doc.setFontSize(11);
    doc.setTextColor(100);
    doc.text(siteName, 14, 30);
    if (siteAddress) {
      doc.setFontSize(8);
      doc.text(siteAddress.replace(/\n/g, ', '), 14, 36);
    }
    doc.setFontSize(9);
    doc.text(new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }), 196, 22, { align: 'right' });

    doc.setDrawColor(5, 150, 105);
    doc.setLineWidth(0.8);
    doc.line(14, 40, 196, 40);

    // Customer info
    let y = 50;
    doc.setFontSize(10);
    doc.setTextColor(0);
    const info = [
      ['Pitch', p.pitch_number || '—'],
      ['Customer', p.customer_name || '—'],
      ['Email', p.customer_email || '—'],
      ['Phone', p.customer_phone || '—'],
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
    doc.text('Meter Reading Comparison', 18, y + 4);

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
    doc.text('Start Reading', 20, y);
    doc.setFont(undefined, 'bold');
    doc.text(bill.start_reading != null ? Number(bill.start_reading).toLocaleString() : '—', 170, y, { align: 'right' });

    y += 7;
    doc.setFont(undefined, 'normal');
    doc.text('End Reading', 20, y);
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
    doc.text('Usage', 20, y);
    doc.text(`${Number(bill.usage_kwh).toLocaleString()} kWh`, 170, y, { align: 'right' });
    y += 7;
    doc.text('Unit Rate', 20, y);
    doc.text(`£${Number(bill.unit_rate || unitRate).toFixed(2)} per kWh`, 170, y, { align: 'right' });

    y += 9;
    doc.setDrawColor(226, 232, 240);
    doc.line(18, y - 4, 192, y - 4);
    doc.setFontSize(12);
    doc.setFont(undefined, 'bold');
    doc.text('Total Amount Due', 20, y);
    doc.setTextColor(220, 38, 38);
    doc.setFontSize(16);
    doc.text(`£${Number(bill.amount_gbp).toFixed(2)}`, 170, y, { align: 'right' });

    // Outstanding stamp
    y += 16;
    doc.setFillColor(254, 242, 242);
    doc.setDrawColor(254, 202, 202);
    doc.roundedRect(50, y - 6, 110, 20, 3, 3, 'FD');
    doc.setTextColor(220, 38, 38);
    doc.setFontSize(14);
    doc.setFont(undefined, 'bold');
    doc.text('PAYMENT OUTSTANDING', 105, y + 3, { align: 'center' });
    doc.setFontSize(8);
    doc.setFont(undefined, 'normal');
    doc.text('Please contact the site office to arrange payment.', 105, y + 10, { align: 'center' });

    // Footer
    doc.setFontSize(8);
    doc.setTextColor(80);
    doc.text(`Carried out by: ${user?.full_name || user?.email || ''}`, 14, 278);
    doc.setFontSize(7);
    doc.setTextColor(150);
    doc.text(`Generated by ${siteName} — ParkManagerAI — ${new Date().toLocaleString('en-GB')}`, 105, 285, { align: 'center' });

    return doc;
  }

  // ---- Download individual bill PDF ----
  async function downloadBillPdf(bill) {
    const doc = await generateBillPdf(bill);
    const p = getPitch(bill);
    const filename = `Bill-${p.pitch_number || 'Unknown'}-${bill.period_end || new Date().toISOString().slice(0, 10)}.pdf`;
    doc.save(filename);
    flash(`Downloaded: ${filename}`);
  }

  // ---- Batch download: combined PDF with all selected ----
  async function downloadBatchPdf() {
    const billsToExport = selectedBills.size > 0
      ? unpaidBills.filter(b => selectedBills.has(b.id))
      : unpaidBills;

    if (billsToExport.length === 0) { flash('No bills to export'); return; }

    const { default: jsPDF } = await import('jspdf');
    const doc = new jsPDF();
    const totalOutstanding = billsToExport.reduce((s, b) => s + Number(b.amount_gbp || 0), 0);

    // Cover / summary page
    doc.setFontSize(20);
    doc.setTextColor(5, 150, 105);
    doc.text('Outstanding Bills Report', 14, 22);
    doc.setFontSize(11);
    doc.setTextColor(100);
    doc.text(siteName, 14, 30);
    if (siteAddress) {
      doc.setFontSize(8);
      doc.text(siteAddress.replace(/\n/g, ', '), 14, 36);
    }
    doc.setFontSize(9);
    doc.text(new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }), 196, 22, { align: 'right' });
    if (hoName) doc.text(`To: ${hoName}`, 196, 28, { align: 'right' });

    doc.setDrawColor(5, 150, 105);
    doc.setLineWidth(0.8);
    doc.line(14, 40, 196, 40);

    // Stats
    let y = 50;
    doc.setFontSize(11);
    doc.setTextColor(0);
    doc.setFont(undefined, 'bold');
    doc.text('Summary', 14, y);
    y += 8;
    doc.setFontSize(10);
    doc.setFont(undefined, 'normal');
    doc.text(`Unpaid Bills: ${billsToExport.length}`, 14, y);
    doc.setTextColor(220, 38, 38);
    doc.setFont(undefined, 'bold');
    doc.text(`Total Outstanding: £${totalOutstanding.toFixed(2)}`, 100, y);
    doc.setTextColor(0);
    doc.setFont(undefined, 'normal');

    // Summary table
    y += 12;
    doc.setFillColor(241, 245, 249);
    doc.rect(14, y, 182, 7, 'F');
    doc.setFontSize(8);
    doc.setTextColor(100);
    const headers = ['Pitch', 'Customer', 'Email', 'Phone', 'Usage', 'Amount', 'Period'];
    const colW = 182 / headers.length;
    headers.forEach((h, i) => doc.text(h, 16 + i * colW, y + 5));

    y += 9;
    doc.setTextColor(0);
    billsToExport.forEach(bill => {
      if (y > 270) { doc.addPage(); y = 20; }
      const p = getPitch(bill);
      const cells = [
        p.pitch_number || '—',
        (p.customer_name || '—').substring(0, 14),
        (p.customer_email || '—').substring(0, 16),
        (p.customer_phone || '—').substring(0, 12),
        `${Number(bill.usage_kwh).toLocaleString()} kWh`,
        `£${Number(bill.amount_gbp).toFixed(2)}`,
        bill.period_end || '',
      ];
      cells.forEach((c, i) => {
        doc.setFont(undefined, i === 5 ? 'bold' : 'normal');
        doc.setTextColor(i === 5 ? 220 : 0, i === 5 ? 38 : 0, i === 5 ? 38 : 0);
        doc.text(c, 16 + i * colW, y);
      });
      y += 5;
    });

    // Totals
    y += 3;
    doc.setDrawColor(220, 38, 38);
    doc.line(14, y - 2, 196, y - 2);
    doc.setFont(undefined, 'bold');
    doc.setTextColor(220, 38, 38);
    doc.setFontSize(10);
    doc.text('TOTAL OUTSTANDING', 16, y + 2);
    doc.text(`£${totalOutstanding.toFixed(2)}`, 16 + 5 * colW, y + 2);

    doc.setFontSize(8);
    doc.setTextColor(80);
    doc.setFont(undefined, 'normal');
    doc.text(`Carried out by: ${user?.full_name || user?.email || ''}`, 14, 278);
    doc.setFontSize(7);
    doc.setTextColor(150);
    doc.text(`Generated by ${siteName} — ParkManagerAI — ${new Date().toLocaleString('en-GB')}`, 105, 285, { align: 'center' });

    // Individual bill pages
    for (const bill of billsToExport) {
      doc.addPage();
      const p = getPitch(bill);
      let py = 20;

      doc.setFontSize(18);
      doc.setTextColor(5, 150, 105);
      doc.text('Electricity Bill', 14, py);
      doc.setFontSize(10);
      doc.setTextColor(100);
      doc.text(siteName, 14, py + 8);
      doc.setFontSize(9);
      doc.text(new Date().toLocaleDateString('en-GB'), 196, py, { align: 'right' });

      doc.setDrawColor(5, 150, 105);
      doc.setLineWidth(0.6);
      doc.line(14, py + 12, 196, py + 12);

      py = py + 22;
      doc.setFontSize(10);
      doc.setTextColor(0);
      const info = [
        ['Pitch', p.pitch_number || '—'],
        ['Customer', p.customer_name || '—'],
        ['Email', p.customer_email || '—'],
        ['Phone', p.customer_phone || '—'],
        ['Period', `${bill.period_start ? new Date(bill.period_start).toLocaleDateString('en-GB') : '—'} to ${bill.period_end ? new Date(bill.period_end).toLocaleDateString('en-GB') : '—'}`],
      ];
      info.forEach(([label, val]) => {
        doc.setFont(undefined, 'bold');
        doc.text(label, 14, py);
        doc.setFont(undefined, 'normal');
        doc.text(val, 55, py);
        py += 7;
      });

      // Readings
      py += 6;
      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(226, 232, 240);
      doc.roundedRect(14, py - 4, 182, 32, 2, 2, 'FD');
      doc.setFontSize(10);
      doc.setFont(undefined, 'bold');
      doc.text('Meter Readings', 18, py + 3);
      py += 10;
      doc.setFontSize(9);
      doc.setFont(undefined, 'normal');
      doc.text('Start Reading:', 20, py);
      doc.setFont(undefined, 'bold');
      doc.text(bill.start_reading != null ? Number(bill.start_reading).toLocaleString() : '—', 170, py, { align: 'right' });
      py += 6;
      doc.setFont(undefined, 'normal');
      doc.text('End Reading:', 20, py);
      doc.setFont(undefined, 'bold');
      doc.text(bill.end_reading != null ? Number(bill.end_reading).toLocaleString() : '—', 170, py, { align: 'right' });
      py += 6;
      doc.setTextColor(5, 150, 105);
      doc.text(`Usage: ${Number(bill.usage_kwh).toLocaleString()} kWh`, 20, py);

      // Cost
      py += 14;
      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(226, 232, 240);
      doc.roundedRect(14, py - 4, 182, 28, 2, 2, 'FD');
      doc.setFontSize(10);
      doc.setTextColor(0);
      doc.setFont(undefined, 'bold');
      doc.text('Amount Due', 18, py + 3);
      py += 10;
      doc.setFontSize(9);
      doc.setFont(undefined, 'normal');
      doc.text(`${Number(bill.usage_kwh).toLocaleString()} kWh × £${Number(bill.unit_rate || unitRate).toFixed(2)}`, 20, py);
      doc.setTextColor(220, 38, 38);
      doc.setFontSize(16);
      doc.setFont(undefined, 'bold');
      doc.text(`£${Number(bill.amount_gbp).toFixed(2)}`, 170, py + 2, { align: 'right' });

      // Stamp
      py += 18;
      doc.setFillColor(254, 242, 242);
      doc.setDrawColor(254, 202, 202);
      doc.roundedRect(55, py, 100, 16, 2, 2, 'FD');
      doc.setTextColor(220, 38, 38);
      doc.setFontSize(12);
      doc.text('PAYMENT OUTSTANDING', 105, py + 7, { align: 'center' });
      doc.setFontSize(7);
      doc.setFont(undefined, 'normal');
      doc.text('Please contact the site office to arrange payment.', 105, py + 13, { align: 'center' });

      doc.setFontSize(7);
      doc.setTextColor(150);
      doc.text(`${siteName} — ParkManagerAI`, 105, 285, { align: 'center' });
    }

    const filename = `Outstanding-Bills-${new Date().toISOString().slice(0, 10)}.pdf`;
    doc.save(filename);
    flash(`Downloaded ${billsToExport.length} bills: ${filename}`);
  }

  // ---- Email report with PDF attachment ----
  async function emailReport(recipientType) {
    const recipient = recipientType === 'manager' ? managerEmail : hoEmail;
    if (!recipient) {
      flash(`No ${recipientType === 'manager' ? 'manager' : 'head office'} email configured. Set it in Settings.`);
      return;
    }

    setSending(recipientType);

    const billsToSend = selectedBills.size > 0
      ? unpaidBills.filter(b => selectedBills.has(b.id))
      : unpaidBills;

    const totalOutstanding = billsToSend.reduce((s, b) => s + Number(b.amount_gbp || 0), 0);

    // Build email HTML
    let rows = '';
    billsToSend.forEach(bill => {
      const p = getPitch(bill);
      rows += `<tr>
        <td style="padding:8px;border-bottom:1px solid #e2e8f0;font-weight:bold">${p.pitch_number || '—'}</td>
        <td style="padding:8px;border-bottom:1px solid #e2e8f0">${p.customer_name || '—'}</td>
        <td style="padding:8px;border-bottom:1px solid #e2e8f0">${p.customer_email || '—'}</td>
        <td style="padding:8px;border-bottom:1px solid #e2e8f0;text-align:right">${Number(bill.usage_kwh).toLocaleString()} kWh</td>
        <td style="padding:8px;border-bottom:1px solid #e2e8f0;text-align:right;font-weight:bold;color:#dc2626">£${Number(bill.amount_gbp).toFixed(2)}</td>
        <td style="padding:8px;border-bottom:1px solid #e2e8f0">${bill.period_end || '—'}</td>
      </tr>`;
    });

    const html = `
      <div style="font-family:Arial,sans-serif;max-width:700px;margin:0 auto">
        <div style="background:linear-gradient(135deg,#059669,#0d9488);padding:24px;border-radius:12px 12px 0 0">
          <h1 style="color:white;margin:0;font-size:20px">${siteName}</h1>
          <p style="color:rgba(255,255,255,0.8);margin:4px 0 0;font-size:13px">Outstanding Bills Report</p>
        </div>
        <div style="background:#f8fafc;padding:24px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 12px 12px">
          <div style="display:flex;gap:20px;margin-bottom:20px">
            <div style="background:white;border:1px solid #e2e8f0;border-radius:8px;padding:16px;flex:1">
              <p style="color:#64748b;font-size:11px;margin:0;text-transform:uppercase">Unpaid Bills</p>
              <p style="color:#dc2626;font-size:24px;font-weight:bold;margin:4px 0 0">${billsToSend.length}</p>
            </div>
            <div style="background:white;border:1px solid #e2e8f0;border-radius:8px;padding:16px;flex:1">
              <p style="color:#64748b;font-size:11px;margin:0;text-transform:uppercase">Total Outstanding</p>
              <p style="color:#dc2626;font-size:24px;font-weight:bold;margin:4px 0 0">£${totalOutstanding.toFixed(2)}</p>
            </div>
          </div>
          <table style="width:100%;border-collapse:collapse;font-size:13px">
            <thead>
              <tr style="background:#f1f5f9">
                <th style="padding:8px;text-align:left;font-size:11px;color:#64748b">Pitch</th>
                <th style="padding:8px;text-align:left;font-size:11px;color:#64748b">Customer</th>
                <th style="padding:8px;text-align:left;font-size:11px;color:#64748b">Email</th>
                <th style="padding:8px;text-align:right;font-size:11px;color:#64748b">Usage</th>
                <th style="padding:8px;text-align:right;font-size:11px;color:#64748b">Amount</th>
                <th style="padding:8px;text-align:left;font-size:11px;color:#64748b">Period</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
            <tfoot>
              <tr style="background:#fef2f2;border-top:2px solid #dc2626">
                <td colspan="4" style="padding:10px;font-weight:bold;color:#dc2626">TOTAL OUTSTANDING</td>
                <td style="padding:10px;text-align:right;font-weight:bold;color:#dc2626;font-size:16px">£${totalOutstanding.toFixed(2)}</td>
                <td></td>
              </tr>
            </tfoot>
          </table>
          <p style="color:#94a3b8;font-size:11px;text-align:center;margin-top:20px">Full PDF report attached. Generated by ParkManagerAI on ${new Date().toLocaleDateString('en-GB')}</p>
        </div>
      </div>
    `;

    // Generate PDF for attachment
    // Reuse the batch PDF logic inline
    const { default: jsPDF } = await import('jspdf');
    const doc = new jsPDF();

    doc.setFontSize(18);
    doc.setTextColor(5, 150, 105);
    doc.text('Outstanding Bills Report', 14, 20);
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(siteName, 14, 28);
    doc.setFontSize(9);
    doc.text(new Date().toLocaleDateString('en-GB'), 196, 20, { align: 'right' });
    if (hoName && recipientType === 'head_office') doc.text(`To: ${hoName}`, 196, 26, { align: 'right' });
    doc.setDrawColor(5, 150, 105);
    doc.setLineWidth(0.6);
    doc.line(14, 32, 196, 32);

    let y = 40;
    doc.setFontSize(10);
    doc.setTextColor(0);
    doc.setFont(undefined, 'bold');
    doc.text(`Unpaid Bills: ${billsToSend.length}`, 14, y);
    doc.setTextColor(220, 38, 38);
    doc.text(`Total Outstanding: £${totalOutstanding.toFixed(2)}`, 100, y);
    doc.setTextColor(0);
    doc.setFont(undefined, 'normal');

    y += 10;
    const headers = ['Pitch', 'Customer', 'Usage', 'Amount', 'Period'];
    const colW = 182 / headers.length;
    doc.setFillColor(241, 245, 249);
    doc.rect(14, y, 182, 7, 'F');
    doc.setFontSize(7);
    doc.setTextColor(100);
    headers.forEach((h, i) => doc.text(h, 16 + i * colW, y + 5));

    y += 9;
    doc.setFontSize(8);
    doc.setTextColor(0);
    billsToSend.forEach(bill => {
      if (y > 270) { doc.addPage(); y = 20; }
      const p = getPitch(bill);
      [p.pitch_number || '—', (p.customer_name || '—').substring(0, 20), `${Number(bill.usage_kwh).toLocaleString()} kWh`, `£${Number(bill.amount_gbp).toFixed(2)}`, bill.period_end || ''].forEach((c, i) => {
        doc.setFont(undefined, i === 3 ? 'bold' : 'normal');
        doc.setTextColor(i === 3 ? 220 : 0, i === 3 ? 38 : 0, i === 3 ? 38 : 0);
        doc.text(c, 16 + i * colW, y);
      });
      y += 5;
    });

    y += 3;
    doc.setDrawColor(220, 38, 38);
    doc.line(14, y - 2, 196, y - 2);
    doc.setFont(undefined, 'bold');
    doc.setTextColor(220, 38, 38);
    doc.setFontSize(10);
    doc.text(`TOTAL: £${totalOutstanding.toFixed(2)}`, 16 + 3 * colW, y + 2);

    doc.setFontSize(7);
    doc.setTextColor(150);
    doc.setFont(undefined, 'normal');
    doc.text(`${siteName} — ParkManagerAI — ${new Date().toLocaleString('en-GB')}`, 105, 285, { align: 'center' });

    const pdfBase64 = doc.output('datauristring').split(',')[1];
    const fileName = `Outstanding-Bills-${new Date().toISOString().slice(0, 10)}.pdf`;

    // Send emails
    const recipients = [];
    if (recipientType === 'both') {
      if (managerEmail) recipients.push(managerEmail);
      if (hoEmail) recipients.push(hoEmail);
    } else {
      recipients.push(recipient);
    }

    let success = 0;
    for (const to of recipients) {
      try {
        const res = await fetch('/api/send-report', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to,
            subject: `${siteName} — Outstanding Bills (${billsToSend.length} unpaid, £${totalOutstanding.toFixed(2)})`,
            body: html,
            pdfBase64,
            fileName,
          }),
        });
        if (res.ok) success++;
      } catch {}
    }

    if (success > 0) {
      flash(`Report sent to ${recipients.join(' & ')} with PDF attached`);
    } else {
      flash('Failed to send email. Check server configuration or try PDF download instead.');
    }
    setSending('');
  }

  if (!user) return null;

  const unpaidBills = bills.filter(b => b.status === 'unpaid');
  const totalOutstanding = unpaidBills.reduce((s, b) => s + Number(b.amount_gbp || 0), 0);
  const allSelected = selectedBills.size === unpaidBills.length && unpaidBills.length > 0;

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 px-4 py-3 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/dashboard/reports" className="text-slate-400 hover:text-slate-700 text-sm">&larr; Reports</Link>
            <h1 className="text-lg font-bold text-slate-900">Outstanding Bills</h1>
          </div>
        </div>
      </header>

      {toast && (
        <div className="fixed top-4 right-4 z-50 bg-emerald-600 text-white px-4 py-2 rounded-lg shadow-lg text-sm max-w-sm">{toast}</div>
      )}

      <div className="max-w-7xl mx-auto p-4 space-y-4">
        {/* Stats */}
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-white rounded-xl border p-4">
            <p className="text-xs text-slate-500 uppercase font-medium">Unpaid Bills</p>
            <p className="text-3xl font-bold text-red-600 mt-1">{unpaidBills.length}</p>
          </div>
          <div className="bg-white rounded-xl border p-4">
            <p className="text-xs text-slate-500 uppercase font-medium">Total Outstanding</p>
            <p className="text-3xl font-bold text-red-600 mt-1">£{totalOutstanding.toFixed(2)}</p>
          </div>
        </div>

        {/* Actions */}
        <div className="bg-white rounded-xl border p-4">
          <p className="text-xs text-slate-500 font-medium mb-3">
            {selectedBills.size > 0
              ? `${selectedBills.size} bill${selectedBills.size > 1 ? 's' : ''} selected — actions apply to selection`
              : 'No selection — actions apply to all bills'}
          </p>
          <div className="flex flex-wrap gap-2">
            <button onClick={downloadBatchPdf} className="px-4 py-2.5 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-500 flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
              Download All (PDF)
            </button>

            {managerEmail && (
              <button onClick={() => emailReport('manager')} disabled={!!sending} className="px-4 py-2.5 bg-teal-600 text-white rounded-lg text-sm font-medium hover:bg-teal-500 flex items-center gap-2 disabled:opacity-50">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                {sending === 'manager' ? 'Sending...' : 'Email Manager'}
              </button>
            )}

            {hoEmail && (
              <button onClick={() => emailReport('head_office')} disabled={!!sending} className="px-4 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-500 flex items-center gap-2 disabled:opacity-50">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                {sending === 'head_office' ? 'Sending...' : 'Email Head Office'}
              </button>
            )}

            {managerEmail && hoEmail && (
              <button onClick={() => emailReport('both')} disabled={!!sending} className="px-4 py-2.5 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-500 flex items-center gap-2 disabled:opacity-50">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                {sending === 'both' ? 'Sending...' : 'Email Both'}
              </button>
            )}

            {!managerEmail && !hoEmail && (
              <Link href="/dashboard/settings" className="px-4 py-2.5 border border-slate-200 text-slate-500 rounded-lg text-sm hover:bg-slate-50 flex items-center gap-2">
                Configure email recipients in Settings
              </Link>
            )}
          </div>
        </div>

        {/* Bills list */}
        {loading ? (
          <div className="flex justify-center py-12"><div className="animate-spin w-8 h-8 border-2 border-red-400 border-t-transparent rounded-full" /></div>
        ) : unpaidBills.length === 0 ? (
          <div className="bg-white rounded-xl border p-8 text-center">
            <svg className="w-12 h-12 text-emerald-400 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-sm font-medium text-emerald-700">No outstanding bills</p>
            <p className="text-xs text-slate-400 mt-1">All bills have been paid</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border overflow-hidden">
            <div className="px-4 py-3 border-b bg-slate-50 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <button onClick={selectAll} className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${allSelected ? 'bg-red-600 border-red-600' : 'border-slate-300 hover:border-red-400'}`}>
                  {allSelected && <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                </button>
                <span className="text-xs font-medium text-slate-500">Select all ({unpaidBills.length})</span>
              </div>
              {selectedBills.size > 0 && (
                <span className="text-xs text-red-600 font-bold">
                  Selected: £{unpaidBills.filter(b => selectedBills.has(b.id)).reduce((s, b) => s + Number(b.amount_gbp || 0), 0).toFixed(2)}
                </span>
              )}
            </div>
            <div className="divide-y divide-slate-100">
              {unpaidBills.map(bill => {
                const p = getPitch(bill);
                const selected = selectedBills.has(bill.id);
                return (
                  <div key={bill.id} className={`px-4 py-3 flex items-center gap-3 transition-colors ${selected ? 'bg-red-50' : 'hover:bg-slate-50'}`}>
                    {/* Checkbox */}
                    <button onClick={() => toggleSelect(bill.id)} className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${selected ? 'bg-red-600 border-red-600' : 'border-slate-300 hover:border-red-400'}`}>
                      {selected && <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                    </button>

                    {/* Status icon */}
                    <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                      <svg className="w-4 h-4 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>

                    {/* Bill info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-slate-900">{p.pitch_number || '—'}</span>
                        <span className="text-sm text-slate-500">{p.customer_name || '—'}</span>
                      </div>
                      <div className="text-xs text-slate-400 mt-0.5">
                        {Number(bill.usage_kwh).toLocaleString()} kWh &middot;
                        {bill.period_start && bill.period_end
                          ? ` ${new Date(bill.period_start).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} — ${new Date(bill.period_end).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`
                          : ''}
                        {p.customer_email ? ` · ${p.customer_email}` : ''}
                      </div>
                    </div>

                    {/* Amount */}
                    <div className="text-right flex-shrink-0">
                      <p className="text-base font-bold text-red-600">£{Number(bill.amount_gbp).toFixed(2)}</p>
                    </div>

                    {/* Download button */}
                    <button onClick={() => downloadBillPdf(bill)} className="px-3 py-1.5 bg-slate-100 text-slate-700 rounded-lg text-xs font-medium hover:bg-slate-200 flex items-center gap-1 flex-shrink-0">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                      PDF
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
