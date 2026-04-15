'use client';
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { getOrgId } from '@/lib/org';
import QRCode from 'qrcode';

export default function PitchesPage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [pitches, setPitches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [toast, setToast] = useState('');
  const [qrPitch, setQrPitch] = useState(null);
  const qrCanvasRef = useRef(null);

  // Form
  const [pitchNumber, setPitchNumber] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [meterId, setMeterId] = useState('');
  const [status, setStatus] = useState('occupied');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const saved = sessionStorage.getItem('pm_user');
    if (!saved) { router.push('/login'); return; }
    setUser(JSON.parse(saved));
    loadPitches();
  }, [router]);

  // Generate QR when pitch selected
  useEffect(() => {
    if (qrPitch && qrCanvasRef.current) {
      const siteUrl = window.location.origin;
      const qrData = `${siteUrl}/dashboard/readings?pitch=${qrPitch.id}`;
      QRCode.toCanvas(qrCanvasRef.current, qrData, {
        width: 200,
        margin: 2,
        color: { dark: '#1e293b', light: '#ffffff' },
      });
    }
  }, [qrPitch]);

  async function loadPitches() {
    setLoading(true);
    if (!supabase) {
      setPitches([
        { id: '1', pitch_number: 'A1', customer_name: 'John Smith', customer_email: 'john@example.com', meter_id: 'M001', status: 'occupied' },
        { id: '2', pitch_number: 'A2', customer_name: 'Jane Doe', customer_email: 'jane@example.com', meter_id: 'M002', status: 'occupied' },
        { id: '3', pitch_number: 'A3', customer_name: null, customer_email: null, meter_id: 'M003', status: 'vacant' },
      ]);
      setLoading(false);
      return;
    }
    const { data } = await supabase.from('pitches').select('*').order('created_at');
    setPitches(data || []);
    setLoading(false);
  }

  function resetForm() {
    setPitchNumber(''); setCustomerName(''); setCustomerEmail(''); setCustomerPhone('');
    setMeterId(''); setStatus('occupied'); setEditing(null);
  }

  function editPitch(p) {
    setPitchNumber(p.pitch_number); setCustomerName(p.customer_name || '');
    setCustomerEmail(p.customer_email || ''); setCustomerPhone(p.customer_phone || ''); setMeterId(p.meter_id || '');
    setStatus(p.status); setEditing(p); setShowForm(true);
  }

  async function savePitch() {
    setSaving(true);
    const payload = {
      pitch_number: pitchNumber,
      customer_name: customerName || null,
      customer_email: customerEmail || null,
      customer_phone: customerPhone || null,
      meter_id: meterId || null,
      status,
    };

    if (!supabase) {
      if (editing) {
        setPitches(prev => prev.map(p => p.id === editing.id ? { ...p, ...payload } : p));
      } else {
        setPitches(prev => [...prev, { id: String(Date.now()), ...payload }]);
      }
      setShowForm(false); resetForm(); setSaving(false);
      setToast(editing ? 'Pitch updated' : 'Pitch added');
      setTimeout(() => setToast(''), 3000);
      return;
    }

    try {
      if (editing) {
        await supabase.from('pitches').update(payload).eq('id', editing.id);
        setToast('Pitch updated');
      } else {
        await supabase.from('pitches').insert({ ...payload, org_id: getOrgId() });
        setToast('Pitch added');
      }
      setTimeout(() => setToast(''), 3000);
      setShowForm(false); resetForm(); loadPitches();
    } catch (err) {
      setToast('Error: ' + err.message);
    }
    setSaving(false);
  }

  async function deletePitch(id) {
    if (!confirm('Delete this pitch?')) return;
    if (!supabase) {
      setPitches(prev => prev.filter(p => p.id !== id));
      return;
    }
    await supabase.from('pitches').delete().eq('id', id);
    loadPitches();
  }

  function printQR() {
    if (!qrPitch || !qrCanvasRef.current) return;
    const dataUrl = qrCanvasRef.current.toDataURL('image/png');
    const win = window.open('', '_blank');
    win.document.write(`
      <html>
        <head><title>QR Label — Pitch ${qrPitch.pitch_number}</title></head>
        <body style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;font-family:Arial,sans-serif;margin:0;">
          <div style="text-align:center;border:2px solid #000;padding:24px 32px;border-radius:12px;">
            <h2 style="margin:0 0 4px;font-size:28px;">Pitch ${qrPitch.pitch_number}</h2>
            <p style="margin:0 0 16px;color:#666;font-size:14px;">Meter: ${qrPitch.meter_id || 'N/A'}</p>
            <img src="${dataUrl}" style="width:200px;height:200px;" />
            <p style="margin:12px 0 0;font-size:12px;color:#999;">Scan to record meter reading</p>
            <p style="margin:4px 0 0;font-size:11px;color:#bbb;">ParkManagerAI</p>
          </div>
          <script>setTimeout(()=>window.print(),300)</script>
        </body>
      </html>
    `);
    win.document.close();
  }

  function downloadQRPng() {
    if (!qrPitch || !qrCanvasRef.current) return;
    const composite = document.createElement('canvas');
    composite.width = 300;
    composite.height = 360;
    const ctx = composite.getContext('2d');

    // White background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 300, 360);

    // Border
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(4, 4, 292, 352, 12);
    ctx.stroke();

    // Pitch number heading
    ctx.fillStyle = '#1e293b';
    ctx.font = 'bold 24px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`Pitch ${qrPitch.pitch_number}`, 150, 38);

    // Meter ID
    ctx.fillStyle = '#64748b';
    ctx.font = '14px Arial, sans-serif';
    ctx.fillText(`Meter: ${qrPitch.meter_id || 'N/A'}`, 150, 60);

    // Draw QR code from existing canvas
    ctx.drawImage(qrCanvasRef.current, 50, 75, 200, 200);

    // Footer text
    ctx.fillStyle = '#94a3b8';
    ctx.font = '12px Arial, sans-serif';
    ctx.fillText('Scan to record meter reading', 150, 300);
    ctx.font = '11px Arial, sans-serif';
    ctx.fillText('ParkManagerAI', 150, 320);

    // Download
    const link = document.createElement('a');
    link.download = `QR-Pitch-${qrPitch.pitch_number}.png`;
    link.href = composite.toDataURL('image/png');
    link.click();
    setToast('QR label downloaded');
    setTimeout(() => setToast(''), 2000);
  }

  function printAllQR() {
    const siteUrl = window.location.origin;
    const win = window.open('', '_blank');
    let labelsHtml = '';
    const promises = pitches.map(p => {
      const canvas = document.createElement('canvas');
      return QRCode.toCanvas(canvas, `${siteUrl}/dashboard/readings?pitch=${p.id}`, {
        width: 160, margin: 1, color: { dark: '#1e293b', light: '#ffffff' },
      }).then(() => {
        labelsHtml += `
          <div style="display:inline-flex;flex-direction:column;align-items:center;border:1px solid #ccc;padding:16px 20px;border-radius:8px;margin:8px;width:200px;">
            <h3 style="margin:0 0 2px;font-size:20px;">Pitch ${p.pitch_number}</h3>
            <p style="margin:0 0 8px;color:#888;font-size:11px;">Meter: ${p.meter_id || 'N/A'}</p>
            <img src="${canvas.toDataURL('image/png')}" style="width:140px;height:140px;" />
            <p style="margin:6px 0 0;font-size:10px;color:#aaa;">Scan for reading</p>
          </div>
        `;
      });
    });
    Promise.all(promises).then(() => {
      win.document.write(`
        <html>
          <head><title>QR Labels — All Pitches</title></head>
          <body style="font-family:Arial,sans-serif;padding:20px;margin:0;">
            <h1 style="text-align:center;margin-bottom:20px;font-size:20px;">ParkManagerAI — Meter QR Labels</h1>
            <div style="display:flex;flex-wrap:wrap;justify-content:center;">
              ${labelsHtml}
            </div>
            <script>setTimeout(()=>window.print(),500)</script>
          </body>
        </html>
      `);
      win.document.close();
    });
  }

  async function exportAllQRPdf() {
    setToast('Generating PDF...');
    try {
      const { default: jsPDF } = await import('jspdf');
      const doc = new jsPDF();
      const siteUrl = window.location.origin;
      const perPage = 6; // 2 cols x 3 rows

      for (let i = 0; i < pitches.length; i++) {
        const p = pitches[i];
        const col = i % 2;
        const row = Math.floor((i % perPage) / 2);

        if (i > 0 && i % perPage === 0) doc.addPage();

        const x = 15 + col * 95;
        const y = 15 + row * 90;

        // Generate QR as data URL
        const canvas = document.createElement('canvas');
        await QRCode.toCanvas(canvas, `${siteUrl}/dashboard/readings?pitch=${p.id}`, {
          width: 200, margin: 1, color: { dark: '#1e293b', light: '#ffffff' },
        });
        const dataUrl = canvas.toDataURL('image/png');

        // Draw bordered label
        doc.setDrawColor(200);
        doc.roundedRect(x, y, 85, 82, 3, 3, 'S');

        // Pitch number
        doc.setFontSize(14);
        doc.setFont(undefined, 'bold');
        doc.setTextColor(30, 41, 59);
        doc.text(`Pitch ${p.pitch_number}`, x + 42.5, y + 12, { align: 'center' });

        // Meter ID
        doc.setFontSize(9);
        doc.setFont(undefined, 'normal');
        doc.setTextColor(148, 163, 184);
        doc.text(`Meter: ${p.meter_id || 'N/A'}`, x + 42.5, y + 19, { align: 'center' });

        // QR image
        doc.addImage(dataUrl, 'PNG', x + 17.5, y + 22, 50, 50);

        // Footer
        doc.setFontSize(7);
        doc.text('Scan for reading', x + 42.5, y + 78, { align: 'center' });
      }

      doc.save('ParkManagerAI-QR-Labels.pdf');
      setToast('PDF downloaded');
    } catch (err) {
      setToast('PDF error: ' + err.message);
    }
    setTimeout(() => setToast(''), 3000);
  }

  if (!user) return null;

  const statusColors = {
    occupied: 'bg-green-100 text-green-700',
    vacant: 'bg-slate-100 text-slate-600',
    maintenance: 'bg-amber-100 text-amber-700',
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 px-4 py-3 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/dashboard" className="text-slate-400 hover:text-slate-700 text-sm">&larr; Dashboard</Link>
            <h1 className="text-lg font-bold text-slate-900">Pitch List</h1>
          </div>
          <div className="flex items-center gap-1 sm:gap-2 flex-wrap justify-end">
            {pitches.length > 0 && (
              <>
                <button
                  onClick={exportAllQRPdf}
                  className="px-2.5 py-2 bg-blue-100 text-blue-700 rounded-lg text-xs sm:text-sm font-medium hover:bg-blue-200 transition-colors flex items-center gap-1"
                >
                  <svg className="w-4 h-4 hidden sm:block" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                  </svg>
                  PDF
                </button>
                <button
                  onClick={printAllQR}
                  className="px-2.5 py-2 bg-slate-100 text-slate-700 rounded-lg text-xs sm:text-sm font-medium hover:bg-slate-200 transition-colors flex items-center gap-1"
                >
                  <svg className="w-4 h-4 hidden sm:block" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                  </svg>
                  Print QR
                </button>
              </>
            )}
            <button
              onClick={() => { resetForm(); setShowForm(true); }}
              className="px-3 py-2 bg-teal-600 text-white rounded-lg text-xs sm:text-sm font-medium hover:bg-teal-500 transition-colors"
            >
              + Add
            </button>
          </div>
        </div>
      </header>

      {toast && (
        <div className="fixed top-4 right-4 z-50 bg-emerald-600 text-white px-4 py-2 rounded-lg shadow-lg text-sm">{toast}</div>
      )}

      <div className="max-w-7xl mx-auto p-4">
        {/* Form */}
        {showForm && (
          <div className="bg-white rounded-xl border p-5 mb-4">
            <h3 className="text-sm font-semibold text-slate-800 mb-4">{editing ? 'Edit Pitch' : 'Add New Pitch'}</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Pitch Number *</label>
                <input value={pitchNumber} onChange={e => setPitchNumber(e.target.value)} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" placeholder="e.g. A1" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Customer Name</label>
                <input value={customerName} onChange={e => setCustomerName(e.target.value)} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" placeholder="John Smith" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Customer Email</label>
                <input type="email" value={customerEmail} onChange={e => setCustomerEmail(e.target.value)} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" placeholder="john@example.com" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Phone Number</label>
                <input type="tel" value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" placeholder="07700 900000" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Meter ID</label>
                <input value={meterId} onChange={e => setMeterId(e.target.value)} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" placeholder="M001" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Status</label>
                <select value={status} onChange={e => setStatus(e.target.value)} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500">
                  <option value="occupied">Occupied</option>
                  <option value="vacant">Vacant</option>
                  <option value="maintenance">Maintenance</option>
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => { setShowForm(false); resetForm(); }} className="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg text-sm">Cancel</button>
              <button onClick={savePitch} disabled={!pitchNumber || saving} className="px-4 py-2 bg-teal-600 text-white rounded-lg text-sm font-medium disabled:opacity-50">{saving ? 'Saving...' : editing ? 'Update' : 'Add Pitch'}</button>
            </div>
          </div>
        )}

        {/* Pitch List */}
        {loading ? (
          <div className="flex justify-center py-12"><div className="animate-spin w-8 h-8 border-2 border-teal-400 border-t-transparent rounded-full" /></div>
        ) : pitches.length === 0 ? (
          <div className="bg-white rounded-xl border p-8 text-center">
            <p className="text-sm text-slate-400">No pitches yet. Click &quot;Add Pitch&quot; to get started.</p>
          </div>
        ) : (
          <>
          {/* Desktop table */}
          <div className="bg-white rounded-xl border overflow-hidden hidden sm:block">
            <table className="w-full">
              <thead className="bg-slate-50 border-b">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500">Pitch</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500">Customer</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500">Meter ID</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500">Status</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pitches.map(p => (
                  <tr key={p.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 text-sm font-semibold text-slate-900">{p.pitch_number}</td>
                    <td className="px-4 py-3">
                      <p className="text-sm text-slate-900">{p.customer_name || '—'}</p>
                      {p.customer_email && <p className="text-xs text-slate-400">{p.customer_email}</p>}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600">{p.meter_id || '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColors[p.status] || statusColors.vacant}`}>
                        {p.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right space-x-2">
                      <button onClick={() => setQrPitch(p)} className="text-xs text-teal-600 hover:text-teal-800 font-medium">QR</button>
                      <button onClick={() => editPitch(p)} className="text-xs text-slate-500 hover:text-slate-700">Edit</button>
                      <button onClick={() => deletePitch(p.id)} className="text-xs text-red-500 hover:text-red-700">Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="space-y-2 sm:hidden">
            {pitches.map(p => (
              <div key={p.id} className="bg-white rounded-xl border p-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-teal-600 rounded-lg flex items-center justify-center text-white font-bold text-sm flex-shrink-0">{p.pitch_number}</div>
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{p.customer_name || 'Vacant'}</p>
                      {p.customer_email && <p className="text-xs text-slate-400">{p.customer_email}</p>}
                      {p.meter_id && <p className="text-xs text-slate-500">Meter: {p.meter_id}</p>}
                    </div>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColors[p.status] || statusColors.vacant}`}>
                    {p.status}
                  </span>
                </div>
                <div className="flex items-center gap-3 mt-3 pt-3 border-t border-slate-100">
                  <button onClick={() => setQrPitch(p)} className="text-xs text-teal-600 hover:text-teal-800 font-medium">QR Code</button>
                  <button onClick={() => editPitch(p)} className="text-xs text-slate-500 hover:text-slate-700">Edit</button>
                  <button onClick={() => deletePitch(p.id)} className="text-xs text-red-500 hover:text-red-700">Delete</button>
                </div>
              </div>
            ))}
          </div>
          </>
        )}
      </div>

      {/* QR Code Modal */}
      {qrPitch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm text-center p-6">
            <h2 className="text-lg font-bold text-slate-900 mb-1">Pitch {qrPitch.pitch_number}</h2>
            <p className="text-sm text-slate-500 mb-4">Meter: {qrPitch.meter_id || 'N/A'}</p>

            <div className="flex justify-center mb-4">
              <canvas ref={qrCanvasRef} />
            </div>

            <p className="text-xs text-slate-400 mb-5">Scan this QR code at the meter to auto-select this pitch for a reading.</p>

            <div className="flex flex-wrap gap-2 justify-center">
              <button
                onClick={downloadQRPng}
                className="px-4 py-2.5 border-2 border-emerald-600 text-emerald-600 rounded-xl text-sm font-semibold hover:bg-emerald-50 transition-colors flex items-center gap-1.5"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Download PNG
              </button>
              <button
                onClick={printQR}
                className="px-4 py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-semibold hover:bg-emerald-500 transition-colors flex items-center gap-1.5"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                </svg>
                Print Label
              </button>
              <button
                onClick={() => setQrPitch(null)}
                className="px-4 py-2.5 border border-slate-200 text-slate-600 rounded-xl text-sm hover:bg-slate-50 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
