'use client';
import { useState, useEffect, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { getOrgId } from '@/lib/org';

export default function GasPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-50 flex items-center justify-center"><div className="animate-spin w-8 h-8 border-2 border-orange-400 border-t-transparent rounded-full" /></div>}>
      <GasContent />
    </Suspense>
  );
}

function GasContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [user, setUser] = useState(null);
  const [toast, setToast] = useState('');

  // Tab: inventory | onsite
  const [tab, setTab] = useState('inventory');

  // Data
  const [cylinders, setCylinders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pitches, setPitches] = useState([]);

  // Active event: null | 'scan_out' | 'scan_in' | 'remove_empties' | 'delivery_in'
  const [activeEvent, setActiveEvent] = useState(null);

  // Scan Out state
  const [scanOutCollar, setScanOutCollar] = useState('');
  const [scanOutFound, setScanOutFound] = useState(null);
  const [scanOutPitch, setScanOutPitch] = useState('');

  // Scan In state
  const [scanInCollar, setScanInCollar] = useState('');
  const [scanInFound, setScanInFound] = useState(null);

  // Delivery In state
  const [deliveryText, setDeliveryText] = useState('');
  const [deliverySize, setDeliverySize] = useState('13kg');
  const [deliveryType, setDeliveryType] = useState('Propane');
  const [deliverySupplier, setDeliverySupplier] = useState('');
  const [deliveryParsed, setDeliveryParsed] = useState([]);
  const [deliveryStep, setDeliveryStep] = useState('input'); // input | preview

  // Remove empties confirm
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false);

  // Edit cylinder
  const [editingCylinder, setEditingCylinder] = useState(null);

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');

  // Refs
  const collarInputRef = useRef(null);

  useEffect(() => {
    const saved = localStorage.getItem('pm_user');
    if (!saved) { router.push('/login'); return; }
    setUser(JSON.parse(saved));

    const urlTab = searchParams.get('tab');
    if (urlTab && ['inventory', 'onsite'].includes(urlTab)) {
      setTab(urlTab);
    }

    loadData();
  }, [router, searchParams]);

  // Focus collar input when event changes
  useEffect(() => {
    if ((activeEvent === 'scan_out' || activeEvent === 'scan_in') && collarInputRef.current) {
      setTimeout(() => collarInputRef.current?.focus(), 100);
    }
  }, [activeEvent]);

  // ---- Data loading ----
  async function loadData() {
    setLoading(true);
    if (supabase) {
      const [pitchRes, cylRes] = await Promise.all([
        supabase.from('pitches').select('*').order('created_at'),
        supabase.from('gas_cylinders').select('*').order('created_at', { ascending: false }),
      ]);
      setPitches(pitchRes.data || []);
      setCylinders(cylRes.data || []);
    }
    setLoading(false);
  }

  function flash(msg) {
    setToast(msg);
    setTimeout(() => setToast(''), 4000);
  }

  // ---- EVENT: Scan Out to Customer ----
  function handleScanOutSearch() {
    const collar = scanOutCollar.trim();
    if (!collar) return;
    const cyl = cylinders.find(c => c.collar_number === collar && c.status === 'in_cage_full');
    if (!cyl) {
      const exists = cylinders.find(c => c.collar_number === collar);
      if (exists) {
        flash(`Collar ${collar} is currently "${statusLabel(exists.status)}" — must be "Cage (Full)" to scan out`);
      } else {
        flash(`Collar ${collar} not found in inventory`);
      }
      setScanOutFound(null);
      return;
    }
    setScanOutFound(cyl);
  }

  async function confirmScanOut() {
    if (!scanOutFound || !scanOutPitch) return;
    const pitch = pitches.find(p => p.id === scanOutPitch);
    await supabase.from('gas_cylinders').update({
      status: 'with_customer',
      pitch_id: scanOutPitch,
      pitch_number: pitch?.pitch_number || null,
      customer_name: pitch?.customer_name || null,
      updated_at: new Date().toISOString(),
    }).eq('id', scanOutFound.id);
    await supabase.from('gas_logs').insert({
      cylinder_id: scanOutFound.id,
      collar_number: scanOutFound.collar_number,
      action: 'scan_out',
      pitch_id: scanOutPitch,
      pitch_number: pitch?.pitch_number || null,
      customer_name: pitch?.customer_name || null,
      org_id: getOrgId(),
    });
    flash(`${scanOutFound.collar_number} scanned out to ${pitch?.pitch_number || 'pitch'}`);
    setScanOutCollar('');
    setScanOutFound(null);
    setScanOutPitch('');
    loadData();
  }

  // ---- EVENT: Scan In (empty return to cage) ----
  function handleScanInSearch() {
    const collar = scanInCollar.trim();
    if (!collar) return;
    const cyl = cylinders.find(c => c.collar_number === collar && c.status === 'with_customer');
    if (!cyl) {
      const exists = cylinders.find(c => c.collar_number === collar);
      if (exists) {
        flash(`Collar ${collar} is "${statusLabel(exists.status)}" — must be "With Customer" to scan in`);
      } else {
        flash(`Collar ${collar} not found in inventory`);
      }
      setScanInFound(null);
      return;
    }
    setScanInFound(cyl);
  }

  async function confirmScanIn(cyl) {
    const target = cyl || scanInFound;
    if (!target) return;
    const prevPitch = target.pitch_number;
    const prevCustomer = target.customer_name;
    await supabase.from('gas_cylinders').update({
      status: 'in_cage_empty',
      pitch_id: null,
      pitch_number: null,
      customer_name: null,
      updated_at: new Date().toISOString(),
    }).eq('id', target.id);
    await supabase.from('gas_logs').insert({
      cylinder_id: target.id,
      collar_number: target.collar_number,
      action: 'scan_in_empty',
      pitch_number: prevPitch || null,
      customer_name: prevCustomer || null,
      notes: `Returned empty from ${prevPitch || 'unknown pitch'}`,
      org_id: getOrgId(),
    });
    flash(`${target.collar_number} scanned in as empty (from ${prevPitch || 'pitch'})`);
    setScanInCollar('');
    setScanInFound(null);
    loadData();
  }

  // ---- EVENT: Remove Empties (batch offsite) ----
  const emptiesInCage = cylinders.filter(c => c.status === 'in_cage_empty');

  async function confirmRemoveEmpties() {
    if (emptiesInCage.length === 0) return;
    const ids = emptiesInCage.map(c => c.id);
    await supabase.from('gas_cylinders').update({
      status: 'offsite',
      updated_at: new Date().toISOString(),
    }).in('id', ids);
    // Batch log
    const logs = emptiesInCage.map(c => ({
      cylinder_id: c.id,
      collar_number: c.collar_number,
      action: 'removed_offsite',
      notes: 'Batch removal — handed to delivery driver',
      org_id: getOrgId(),
    }));
    await supabase.from('gas_logs').insert(logs);
    flash(`${emptiesInCage.length} empty cylinders removed from site`);
    setShowRemoveConfirm(false);
    setActiveEvent(null);
    loadData();
  }

  // ---- EVENT: Delivery In (batch add) ----
  function parseDeliveryText() {
    const lines = deliveryText.split('\n').map(l => l.trim()).filter(Boolean);
    const unique = [...new Set(lines)];
    setDeliveryParsed(unique);
    setDeliveryStep('preview');
  }

  async function confirmDeliveryIn() {
    if (deliveryParsed.length === 0) return;
    let added = 0, updated = 0;
    for (const collar of deliveryParsed) {
      const existing = cylinders.find(c => c.collar_number === collar);
      if (existing) {
        // Update existing (e.g. offsite → in_cage_full)
        await supabase.from('gas_cylinders').update({
          status: 'in_cage_full',
          pitch_id: null,
          pitch_number: null,
          customer_name: null,
          size: deliverySize,
          type: deliveryType,
          supplier: deliverySupplier || existing.supplier,
          updated_at: new Date().toISOString(),
        }).eq('id', existing.id);
        await supabase.from('gas_logs').insert({
          cylinder_id: existing.id,
          collar_number: collar,
          action: 'delivery_in',
          notes: `${deliverySize} ${deliveryType}${deliverySupplier ? ' from ' + deliverySupplier : ''} (re-delivered)`,
          org_id: getOrgId(),
        });
        updated++;
      } else {
        // Insert new
        const { data: inserted } = await supabase.from('gas_cylinders').insert({
          collar_number: collar,
          size: deliverySize,
          type: deliveryType,
          supplier: deliverySupplier,
          status: 'in_cage_full',
          org_id: getOrgId(),
        }).select('id').single();
        if (inserted) {
          await supabase.from('gas_logs').insert({
            cylinder_id: inserted.id,
            collar_number: collar,
            action: 'delivery_in',
            notes: `${deliverySize} ${deliveryType}${deliverySupplier ? ' from ' + deliverySupplier : ''} (new)`,
            org_id: getOrgId(),
          });
        }
        added++;
      }
    }
    flash(`Delivery complete — ${added} new, ${updated} updated`);
    setDeliveryText('');
    setDeliveryParsed([]);
    setDeliveryStep('input');
    setActiveEvent(null);
    loadData();
  }

  // ---- Edit / Delete ----
  async function saveEditCylinder() {
    if (!editingCylinder) return;
    const { id, collar_number, size, type, supplier } = editingCylinder;
    await supabase.from('gas_cylinders').update({ collar_number, size, type, supplier, updated_at: new Date().toISOString() }).eq('id', id);
    setEditingCylinder(null);
    flash(`Cylinder ${collar_number} updated`);
    loadData();
  }

  async function deleteCylinder(cyl) {
    if (!confirm(`Delete cylinder ${cyl.collar_number}?`)) return;
    await supabase.from('gas_cylinders').delete().eq('id', cyl.id);
    flash(`Cylinder ${cyl.collar_number} removed`);
    loadData();
  }

  // ---- Export PDF ----
  async function exportInventoryPdf(recipient) {
    const { default: jsPDF } = await import('jspdf');
    const doc = new jsPDF();

    let siteName = 'Park Manager AI', siteAddress = '';
    if (supabase) {
      try {
        const { data } = await supabase.from('site_settings').select('*');
        (data || []).forEach(s => {
          if (s.key === 'site_name') siteName = s.value;
          if (s.key === 'site_address') siteAddress = s.value;
        });
      } catch {}
    }

    const cageFull = cylinders.filter(c => c.status === 'in_cage_full');
    const withCustomer = cylinders.filter(c => c.status === 'with_customer');
    const cageEmpty = cylinders.filter(c => c.status === 'in_cage_empty');
    const onPremises = [...cageFull, ...withCustomer, ...cageEmpty];
    const isFireReport = recipient === 'fire_report';
    const now = new Date();

    // Header
    doc.setFontSize(18);
    doc.setTextColor(isFireReport ? 220 : 234, isFireReport ? 38 : 88, isFireReport ? 38 : 12);
    doc.text(siteName, 14, 20);
    if (siteAddress) { doc.setFontSize(9); doc.setTextColor(100); doc.text(siteAddress, 14, 26); }
    doc.setFontSize(14);
    doc.setTextColor(0);
    doc.text(isFireReport ? 'LPG Cylinder Fire Safety Register' : 'Gas Cylinder Inventory Report', 14, siteAddress ? 34 : 28);
    doc.setFontSize(9);
    doc.setTextColor(100);
    const topY = siteAddress ? 40 : 35;
    doc.text(`Date: ${now.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}`, 14, topY);
    doc.text(`Time: ${now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`, 100, topY);
    if (recipient === 'head_office') doc.text('Report for: Head Office', 14, topY + 5);
    if (recipient === 'manager') doc.text('Report for: Site Manager', 14, topY + 5);

    let y = topY + (isFireReport ? 10 : 12);
    if (isFireReport) {
      doc.setFillColor(254, 242, 242);
      doc.setDrawColor(252, 165, 165);
      doc.roundedRect(14, y - 4, 182, 16, 2, 2, 'FD');
      doc.setFontSize(8);
      doc.setTextColor(153, 27, 27);
      doc.text('IMPORTANT: This register must be available at all times for inspection by the Fire Service.', 18, y + 1);
      doc.text('LPG cylinders must be stored in accordance with HSE INDG308 and local fire authority requirements.', 18, y + 7);
      y += 18;
    }

    // Summary
    doc.setFontSize(11);
    doc.setFont(undefined, 'bold');
    doc.setTextColor(0);
    doc.text('Summary', 14, y);
    y += 7;
    doc.setFontSize(9);
    doc.setFont(undefined, 'normal');
    doc.text(`Total On Premises: ${onPremises.length}`, 14, y);
    doc.text(`Cage (Full): ${cageFull.length}`, 110, y);
    y += 5;
    doc.text(`With Customers: ${withCustomer.length}`, 14, y);
    doc.text(`Cage (Empty): ${cageEmpty.length}`, 110, y);

    // Helper to draw a section
    function drawSection(title, items, color, columns) {
      y += 12;
      if (y > 260) { doc.addPage(); y = 20; }
      doc.setFontSize(10);
      doc.setFont(undefined, 'bold');
      doc.setTextColor(...color);
      doc.text(`${title} — ${items.length} cylinder${items.length !== 1 ? 's' : ''}`, 14, y);
      y += 6;
      doc.setFillColor(245, 245, 245);
      doc.rect(14, y - 4, 182, 8, 'F');
      doc.setFontSize(8);
      doc.setTextColor(100);
      columns.forEach(col => doc.text(col.label, col.x, y));
      y += 6;
      doc.setTextColor(0);
      doc.setFont(undefined, 'normal');
      for (const c of items) {
        if (y > 275) { doc.addPage(); y = 20; }
        doc.setFontSize(8);
        columns.forEach(col => doc.text((col.val(c) || '—').substring(0, col.max || 30), col.x, y));
        y += 5;
      }
      if (items.length === 0) { doc.setFontSize(8); doc.setTextColor(150); doc.text('None', 16, y); y += 5; }
    }

    drawSection('CAGE — FULL', cageFull, [22, 163, 74], [
      { label: 'Collar No.', x: 16, val: c => c.collar_number },
      { label: 'Size', x: 50, val: c => c.size },
      { label: 'Type', x: 75, val: c => c.type },
      { label: 'Supplier', x: 105, val: c => c.supplier, max: 20 },
      { label: 'Added', x: 150, val: c => c.created_at ? new Date(c.created_at).toLocaleDateString('en-GB') : '' },
    ]);

    drawSection('WITH CUSTOMERS', withCustomer, [37, 99, 235], [
      { label: 'Collar No.', x: 16, val: c => c.collar_number },
      { label: 'Size', x: 50, val: c => c.size },
      { label: 'Type', x: 75, val: c => c.type },
      { label: 'Pitch', x: 105, val: c => c.pitch_number },
      { label: 'Customer', x: 125, val: c => c.customer_name, max: 20 },
      { label: 'Assigned', x: 170, val: c => c.updated_at ? new Date(c.updated_at).toLocaleDateString('en-GB') : '' },
    ]);

    drawSection('CAGE — EMPTY (awaiting collection)', cageEmpty, [161, 98, 7], [
      { label: 'Collar No.', x: 16, val: c => c.collar_number },
      { label: 'Size', x: 50, val: c => c.size },
      { label: 'Type', x: 75, val: c => c.type },
      { label: 'Returned', x: 105, val: c => c.updated_at ? new Date(c.updated_at).toLocaleDateString('en-GB') : '' },
    ]);

    // Sign-off for fire report
    if (isFireReport) {
      y += 10;
      if (y > 240) { doc.addPage(); y = 20; }
      doc.setDrawColor(200);
      doc.setLineWidth(0.5);
      doc.roundedRect(14, y, 182, 36, 2, 2, 'S');
      doc.setFontSize(9);
      doc.setTextColor(0);
      doc.setFont(undefined, 'bold');
      doc.text('Inspection Sign-Off', 18, y + 7);
      doc.setFont(undefined, 'normal');
      doc.setFontSize(8);
      doc.text('Checked by: ___________________________________', 18, y + 16);
      doc.text('Signature: ___________________________________', 18, y + 23);
      doc.text(`Date: ${now.toLocaleDateString('en-GB')}`, 18, y + 30);
      doc.text('Position: ___________________________________', 110, y + 23);
    }

    // Footer
    doc.setFontSize(8);
    doc.setTextColor(80);
    doc.text(`Carried out by: ${user?.full_name || user?.email || ''}`, 14, 278);
    doc.setFontSize(7);
    doc.setTextColor(150);
    doc.text(`Generated by ${siteName} — ParkManagerAI — ${now.toLocaleString('en-GB')}`, 105, 285, { align: 'center' });

    const typeLabel = isFireReport ? 'FireRegister' : `GasInventory-${recipient}`;
    doc.save(`${typeLabel}-${now.toISOString().slice(0, 10)}.pdf`);
    flash(`PDF exported`);
  }

  // ---- Helpers ----
  function statusLabel(status) {
    const map = { in_cage_full: 'Cage (Full)', with_customer: 'With Customer', in_cage_empty: 'Cage (Empty)', offsite: 'Offsite' };
    return map[status] || status;
  }

  function statusBadge(status) {
    const map = {
      in_cage_full: { label: 'Cage (Full)', bg: 'bg-green-100', text: 'text-green-700' },
      with_customer: { label: 'With Customer', bg: 'bg-blue-100', text: 'text-blue-700' },
      in_cage_empty: { label: 'Cage (Empty)', bg: 'bg-amber-100', text: 'text-amber-700' },
      offsite: { label: 'Offsite', bg: 'bg-slate-100', text: 'text-slate-500' },
      // Legacy fallback
      on_site: { label: 'In Store', bg: 'bg-green-100', text: 'text-green-700' },
    };
    const s = map[status] || { label: status, bg: 'bg-slate-100', text: 'text-slate-500' };
    return <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${s.bg} ${s.text}`}>{s.label}</span>;
  }

  // Counts
  const countFull = cylinders.filter(c => c.status === 'in_cage_full').length;
  const countCustomer = cylinders.filter(c => c.status === 'with_customer').length;
  const countEmpty = cylinders.filter(c => c.status === 'in_cage_empty').length;
  const countOffsite = cylinders.filter(c => c.status === 'offsite').length;

  // Filtered
  const filteredCylinders = cylinders.filter(c => {
    if (filterStatus !== 'all' && c.status !== filterStatus) return false;
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      return (c.collar_number || '').toLowerCase().includes(q) ||
        (c.pitch_number || '').toLowerCase().includes(q) ||
        (c.customer_name || '').toLowerCase().includes(q) ||
        (c.type || '').toLowerCase().includes(q);
    }
    return true;
  });

  // On-site for register (everything except offsite)
  const onsiteFull = cylinders.filter(c => c.status === 'in_cage_full');
  const onsiteCustomer = cylinders.filter(c => c.status === 'with_customer');
  const onsiteEmpty = cylinders.filter(c => c.status === 'in_cage_empty');

  if (!user) return null;

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-4 py-3 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/dashboard" className="text-slate-400 hover:text-slate-700 text-sm">&larr; Dashboard</Link>
            <h1 className="text-lg font-bold text-slate-900">Gas Cylinders</h1>
          </div>
        </div>
      </header>

      {/* Toast */}
      {toast && (
        <div className="fixed top-4 right-4 z-50 bg-orange-600 text-white px-4 py-2 rounded-lg shadow-lg text-sm max-w-sm">{toast}</div>
      )}

      {/* Edit Cylinder Modal */}
      {editingCylinder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <h3 className="text-base font-bold text-slate-900 mb-4">Edit Cylinder</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Collar Number</label>
                <input value={editingCylinder.collar_number || ''} onChange={e => setEditingCylinder(p => ({ ...p, collar_number: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-lg font-mono text-center tracking-widest focus:outline-none focus:ring-2 focus:ring-orange-500" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Size</label>
                  <select value={editingCylinder.size} onChange={e => setEditingCylinder(p => ({ ...p, size: e.target.value }))}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500">
                    <option>6kg</option><option>13kg</option><option>19kg</option><option>47kg</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Type</label>
                  <select value={editingCylinder.type} onChange={e => setEditingCylinder(p => ({ ...p, type: e.target.value }))}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500">
                    <option>Propane</option><option>Butane</option><option>Patio Gas</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Supplier</label>
                <input value={editingCylinder.supplier || ''} onChange={e => setEditingCylinder(p => ({ ...p, supplier: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" placeholder="e.g. Calor, Flogas" />
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={() => setEditingCylinder(null)} className="flex-1 py-2 bg-slate-100 text-slate-700 rounded-lg text-sm">Cancel</button>
              <button onClick={saveEditCylinder} className="flex-1 py-2 bg-orange-600 text-white rounded-lg text-sm font-medium hover:bg-orange-500">Save Changes</button>
            </div>
          </div>
        </div>
      )}

      {/* Remove Empties Confirm Modal */}
      {showRemoveConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <h3 className="text-base font-bold text-slate-900 mb-2">Remove All Empties?</h3>
            <p className="text-sm text-slate-600 mb-1">This will mark <strong>{emptiesInCage.length}</strong> empty cylinder{emptiesInCage.length !== 1 ? 's' : ''} as offsite (handed to delivery driver).</p>
            <div className="bg-slate-50 rounded-lg p-3 my-3 max-h-40 overflow-y-auto">
              {emptiesInCage.map(c => (
                <div key={c.id} className="text-xs font-mono text-slate-700 py-0.5">{c.collar_number} — {c.size} {c.type}</div>
              ))}
            </div>
            <div className="flex gap-2">
              <button onClick={() => setShowRemoveConfirm(false)} className="flex-1 py-2 bg-slate-100 text-slate-700 rounded-lg text-sm">Cancel</button>
              <button onClick={confirmRemoveEmpties} className="flex-1 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-500">Remove All</button>
            </div>
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto px-4 pt-4 pb-8">
        {/* ===== EVENT SELECTOR CARDS ===== */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          {/* Scan Out */}
          <button onClick={() => setActiveEvent(activeEvent === 'scan_out' ? null : 'scan_out')}
            className={`p-4 rounded-xl border-2 text-left transition-all ${activeEvent === 'scan_out' ? 'border-blue-500 bg-blue-50 shadow-md' : 'border-slate-200 bg-white hover:border-blue-300'}`}>
            <div className="flex items-center gap-2 mb-1">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${activeEvent === 'scan_out' ? 'bg-blue-500' : 'bg-blue-100'}`}>
                <svg className={`w-5 h-5 ${activeEvent === 'scan_out' ? 'text-white' : 'text-blue-600'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                </svg>
              </div>
              <span className="text-sm font-bold text-slate-900">Scan Out</span>
            </div>
            <p className="text-xs text-slate-500">Full cylinder to customer</p>
          </button>

          {/* Scan In */}
          <button onClick={() => setActiveEvent(activeEvent === 'scan_in' ? null : 'scan_in')}
            className={`p-4 rounded-xl border-2 text-left transition-all ${activeEvent === 'scan_in' ? 'border-green-500 bg-green-50 shadow-md' : 'border-slate-200 bg-white hover:border-green-300'}`}>
            <div className="flex items-center gap-2 mb-1">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${activeEvent === 'scan_in' ? 'bg-green-500' : 'bg-green-100'}`}>
                <svg className={`w-5 h-5 ${activeEvent === 'scan_in' ? 'text-white' : 'text-green-600'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16l-4-4m0 0l4-4m-4 4h18" />
                </svg>
              </div>
              <span className="text-sm font-bold text-slate-900">Scan In</span>
            </div>
            <p className="text-xs text-slate-500">Empty back to cage</p>
          </button>

          {/* Remove Empties */}
          <button onClick={() => setActiveEvent(activeEvent === 'remove_empties' ? null : 'remove_empties')}
            className={`p-4 rounded-xl border-2 text-left transition-all ${activeEvent === 'remove_empties' ? 'border-slate-500 bg-slate-100 shadow-md' : 'border-slate-200 bg-white hover:border-slate-400'}`}>
            <div className="flex items-center gap-2 mb-1">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${activeEvent === 'remove_empties' ? 'bg-slate-600' : 'bg-slate-200'}`}>
                <svg className={`w-5 h-5 ${activeEvent === 'remove_empties' ? 'text-white' : 'text-slate-600'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </div>
              <span className="text-sm font-bold text-slate-900">Remove Empties</span>
            </div>
            <p className="text-xs text-slate-500">{emptiesInCage.length} to hand off</p>
          </button>

          {/* Delivery In */}
          <button onClick={() => setActiveEvent(activeEvent === 'delivery_in' ? null : 'delivery_in')}
            className={`p-4 rounded-xl border-2 text-left transition-all ${activeEvent === 'delivery_in' ? 'border-orange-500 bg-orange-50 shadow-md' : 'border-slate-200 bg-white hover:border-orange-300'}`}>
            <div className="flex items-center gap-2 mb-1">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${activeEvent === 'delivery_in' ? 'bg-orange-500' : 'bg-orange-100'}`}>
                <svg className={`w-5 h-5 ${activeEvent === 'delivery_in' ? 'text-white' : 'text-orange-600'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              </div>
              <span className="text-sm font-bold text-slate-900">Delivery In</span>
            </div>
            <p className="text-xs text-slate-500">Add full cylinders from delivery</p>
          </button>
        </div>

        {/* ===== ACTIVE EVENT FORM (inline) ===== */}
        {activeEvent === 'scan_out' && (
          <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-4 mb-4">
            <h3 className="text-sm font-bold text-blue-900 mb-3">Scan Out to Customer</h3>
            <div className="flex items-center gap-2 mb-3">
              <input ref={collarInputRef} value={scanOutCollar} onChange={e => setScanOutCollar(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleScanOutSearch()}
                className="flex-1 px-3 py-2 border border-blue-200 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Enter collar number" />
              <button onClick={handleScanOutSearch} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-500">Find</button>
            </div>

            {scanOutFound && (
              <div className="bg-white rounded-lg p-3 border border-blue-200">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <span className="text-sm font-mono font-bold text-slate-900">{scanOutFound.collar_number}</span>
                    <span className="text-xs text-slate-500 ml-2">{scanOutFound.size} {scanOutFound.type}</span>
                  </div>
                  {statusBadge(scanOutFound.status)}
                </div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Assign to Pitch</label>
                <select value={scanOutPitch} onChange={e => setScanOutPitch(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 mb-2">
                  <option value="">Choose pitch...</option>
                  {pitches.map(p => <option key={p.id} value={p.id}>{p.pitch_number} — {p.customer_name || 'Vacant'}</option>)}
                </select>
                <button onClick={confirmScanOut} disabled={!scanOutPitch}
                  className="w-full py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-500 disabled:opacity-40">
                  Confirm Scan Out
                </button>
              </div>
            )}
          </div>
        )}

        {activeEvent === 'scan_in' && (
          <div className="bg-green-50 border-2 border-green-200 rounded-xl p-4 mb-4">
            <h3 className="text-sm font-bold text-green-900 mb-3">Scan In Empty Return</h3>
            <div className="flex items-center gap-2 mb-3">
              <input ref={collarInputRef} value={scanInCollar} onChange={e => setScanInCollar(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleScanInSearch()}
                className="flex-1 px-3 py-2 border border-green-200 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-green-500"
                placeholder="Enter collar number" />
              <button onClick={handleScanInSearch} className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-500">Find</button>
            </div>

            {scanInFound && (
              <div className="bg-white rounded-lg p-3 border border-green-200 mb-3">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <span className="text-sm font-mono font-bold text-slate-900">{scanInFound.collar_number}</span>
                    <span className="text-xs text-slate-500 ml-2">{scanInFound.size} {scanInFound.type}</span>
                  </div>
                  <span className="text-xs text-blue-600">Pitch {scanInFound.pitch_number} ({scanInFound.customer_name || '?'})</span>
                </div>
                <button onClick={() => confirmScanIn()} className="w-full py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-500">
                  Confirm — Return Empty to Cage
                </button>
              </div>
            )}

            {/* Quick list of cylinders with customers */}
            {onsiteCustomer.length > 0 && (
              <div className="border-t border-green-200 pt-3">
                <p className="text-xs font-semibold text-green-800 mb-2">Or tap to return:</p>
                <div className="space-y-1 max-h-48 overflow-y-auto">
                  {onsiteCustomer.map(c => (
                    <button key={c.id} onClick={() => confirmScanIn(c)}
                      className="w-full flex items-center justify-between px-3 py-2 bg-white rounded-lg border border-green-100 hover:bg-green-100 text-left">
                      <div>
                        <span className="text-sm font-mono font-medium text-slate-800">{c.collar_number}</span>
                        <span className="text-xs text-slate-500 ml-2">{c.size} — Pitch {c.pitch_number}</span>
                      </div>
                      <span className="text-xs text-green-600 font-medium">Return</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {activeEvent === 'remove_empties' && (
          <div className="bg-slate-100 border-2 border-slate-300 rounded-xl p-4 mb-4">
            <h3 className="text-sm font-bold text-slate-900 mb-2">Remove All Empties from Site</h3>
            {emptiesInCage.length === 0 ? (
              <p className="text-sm text-slate-500">No empty cylinders in cage to remove.</p>
            ) : (
              <>
                <p className="text-sm text-slate-600 mb-3">{emptiesInCage.length} empty cylinder{emptiesInCage.length !== 1 ? 's' : ''} ready to hand off to delivery driver:</p>
                <div className="bg-white rounded-lg p-3 mb-3 max-h-40 overflow-y-auto">
                  {emptiesInCage.map(c => (
                    <div key={c.id} className="text-xs font-mono text-slate-700 py-0.5 flex justify-between">
                      <span>{c.collar_number}</span>
                      <span className="text-slate-400">{c.size} {c.type}</span>
                    </div>
                  ))}
                </div>
                <button onClick={() => setShowRemoveConfirm(true)}
                  className="w-full py-3 bg-red-600 text-white rounded-lg text-sm font-bold hover:bg-red-500">
                  Remove All {emptiesInCage.length} Empties from Site
                </button>
              </>
            )}
          </div>
        )}

        {activeEvent === 'delivery_in' && (
          <div className="bg-orange-50 border-2 border-orange-200 rounded-xl p-4 mb-4">
            <h3 className="text-sm font-bold text-orange-900 mb-3">Delivery In — Add Full Cylinders</h3>
            {deliveryStep === 'input' ? (
              <>
                <div className="grid grid-cols-3 gap-2 mb-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Size</label>
                    <select value={deliverySize} onChange={e => setDeliverySize(e.target.value)}
                      className="w-full px-2 py-2 border border-orange-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500">
                      <option>6kg</option><option>13kg</option><option>19kg</option><option>47kg</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Type</label>
                    <select value={deliveryType} onChange={e => setDeliveryType(e.target.value)}
                      className="w-full px-2 py-2 border border-orange-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500">
                      <option>Propane</option><option>Butane</option><option>Patio Gas</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Supplier</label>
                    <input value={deliverySupplier} onChange={e => setDeliverySupplier(e.target.value)}
                      className="w-full px-2 py-2 border border-orange-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" placeholder="Calor" />
                  </div>
                </div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Collar Numbers (one per line)</label>
                <textarea value={deliveryText} onChange={e => setDeliveryText(e.target.value)}
                  className="w-full px-3 py-2 border border-orange-200 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-orange-500 h-32"
                  placeholder={"7208\n4421\n9903\n..."} />
                <button onClick={parseDeliveryText} disabled={!deliveryText.trim()}
                  className="w-full mt-2 py-2 bg-orange-600 text-white rounded-lg text-sm font-medium hover:bg-orange-500 disabled:opacity-40">
                  Preview ({deliveryText.split('\n').filter(l => l.trim()).length} cylinders)
                </button>
              </>
            ) : (
              <>
                <p className="text-sm text-slate-700 mb-2">{deliveryParsed.length} cylinders to add as <strong>{deliverySize} {deliveryType}</strong>{deliverySupplier ? ` from ${deliverySupplier}` : ''}:</p>
                <div className="bg-white rounded-lg p-3 mb-3 max-h-40 overflow-y-auto">
                  {deliveryParsed.map((collar, i) => {
                    const exists = cylinders.find(c => c.collar_number === collar);
                    return (
                      <div key={i} className="text-xs font-mono py-0.5 flex justify-between">
                        <span className="text-slate-800">{collar}</span>
                        <span className={exists ? 'text-amber-600' : 'text-green-600'}>{exists ? `update (${statusLabel(exists.status)})` : 'new'}</span>
                      </div>
                    );
                  })}
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setDeliveryStep('input')} className="flex-1 py-2 bg-slate-100 text-slate-700 rounded-lg text-sm">Back</button>
                  <button onClick={confirmDeliveryIn} className="flex-1 py-2 bg-orange-600 text-white rounded-lg text-sm font-bold hover:bg-orange-500">
                    Confirm Delivery
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {/* ===== TAB BAR ===== */}
        <div className="flex items-center gap-1 bg-white rounded-xl border p-1 mb-4">
          {[
            { key: 'inventory', label: 'Inventory' },
            { key: 'onsite', label: 'On-Site Register' },
          ].map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                tab === t.key ? 'bg-orange-600 text-white' : 'text-slate-600 hover:bg-slate-50'
              }`}>
              {t.label}
            </button>
          ))}
        </div>

        {/* ======= INVENTORY TAB ======= */}
        {tab === 'inventory' && (
          <>
            {/* Stats */}
            <div className="grid grid-cols-4 gap-2 mb-4">
              <div className="bg-white rounded-xl border p-3 text-center">
                <p className="text-xl font-bold text-green-600">{countFull}</p>
                <p className="text-[10px] text-slate-500">Cage (Full)</p>
              </div>
              <div className="bg-white rounded-xl border p-3 text-center">
                <p className="text-xl font-bold text-blue-600">{countCustomer}</p>
                <p className="text-[10px] text-slate-500">With Customer</p>
              </div>
              <div className="bg-white rounded-xl border p-3 text-center">
                <p className="text-xl font-bold text-amber-600">{countEmpty}</p>
                <p className="text-[10px] text-slate-500">Cage (Empty)</p>
              </div>
              <div className="bg-white rounded-xl border p-3 text-center">
                <p className="text-xl font-bold text-slate-400">{countOffsite}</p>
                <p className="text-[10px] text-slate-500">Offsite</p>
              </div>
            </div>

            {/* Search & Filter */}
            <div className="flex gap-2 mb-4">
              <input value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="Search collar, pitch, customer..."
                className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />
              <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
                className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500">
                <option value="all">All Status</option>
                <option value="in_cage_full">Cage (Full)</option>
                <option value="with_customer">With Customer</option>
                <option value="in_cage_empty">Cage (Empty)</option>
                <option value="offsite">Offsite</option>
              </select>
            </div>

            {/* PDF Export */}
            <div className="flex flex-wrap gap-2 mb-4">
              <button onClick={() => exportInventoryPdf('manager')} className="px-3 py-2 bg-slate-100 text-slate-700 rounded-lg text-xs font-medium hover:bg-slate-200">PDF (Manager)</button>
              <button onClick={() => exportInventoryPdf('head_office')} className="px-3 py-2 bg-slate-100 text-slate-700 rounded-lg text-xs font-medium hover:bg-slate-200">PDF (Head Office)</button>
            </div>

            {/* Cylinder List */}
            {loading ? (
              <div className="flex justify-center py-12"><div className="animate-spin w-8 h-8 border-2 border-orange-400 border-t-transparent rounded-full" /></div>
            ) : filteredCylinders.length === 0 ? (
              <div className="bg-white rounded-xl border p-8 text-center">
                <p className="text-sm text-slate-400">No cylinders found. Use &quot;Delivery In&quot; to add cylinders.</p>
              </div>
            ) : (
              <div className="bg-white rounded-xl border overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-slate-50 border-b">
                      <tr>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500">Collar</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500">Size</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500">Type</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500">Status</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 hidden sm:table-cell">Pitch</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 hidden sm:table-cell">Customer</th>
                        <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredCylinders.map(c => (
                        <tr key={c.id} className="hover:bg-slate-50">
                          <td className="px-4 py-3 text-sm font-mono font-medium text-slate-900">{c.collar_number}</td>
                          <td className="px-4 py-3 text-sm text-slate-600">{c.size}</td>
                          <td className="px-4 py-3 text-sm text-slate-600">{c.type}</td>
                          <td className="px-4 py-3">{statusBadge(c.status)}</td>
                          <td className="px-4 py-3 text-sm text-slate-600 hidden sm:table-cell">{c.pitch_number || '—'}</td>
                          <td className="px-4 py-3 text-sm text-slate-600 hidden sm:table-cell">{c.customer_name || '—'}</td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <button onClick={() => setEditingCylinder({ ...c })}
                                className="text-xs text-teal-600 hover:text-teal-800 font-medium px-1">Edit</button>
                              <button onClick={() => deleteCylinder(c)}
                                className="text-xs text-red-400 hover:text-red-600 px-1">
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}

        {/* ======= ON-SITE REGISTER TAB ======= */}
        {tab === 'onsite' && (
          <>
            {/* Fire reg notice */}
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-4 flex items-start gap-3">
              <svg className="w-6 h-6 text-red-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <div>
                <p className="text-sm font-semibold text-red-800">Fire Regulations — On-Site Gas Register</p>
                <p className="text-xs text-red-600">All cylinders currently on the premises. Only cylinders sent offsite are excluded.</p>
              </div>
            </div>

            {/* Summary */}
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="bg-white rounded-xl border p-4 text-center">
                <p className="text-3xl font-bold text-red-600">{onsiteFull.length + onsiteCustomer.length + onsiteEmpty.length}</p>
                <p className="text-xs text-slate-500 font-medium">Total On Premises</p>
              </div>
              <div className="bg-white rounded-xl border p-4">
                <div className="flex justify-between mb-1">
                  <span className="text-xs text-slate-500">Cage (Full)</span>
                  <span className="text-sm font-bold text-green-600">{onsiteFull.length}</span>
                </div>
                <div className="flex justify-between mb-1">
                  <span className="text-xs text-slate-500">With Customers</span>
                  <span className="text-sm font-bold text-blue-600">{onsiteCustomer.length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-xs text-slate-500">Cage (Empty)</span>
                  <span className="text-sm font-bold text-amber-600">{onsiteEmpty.length}</span>
                </div>
              </div>
            </div>

            {/* Export */}
            <div className="flex flex-wrap gap-2 mb-4">
              <button onClick={() => exportInventoryPdf('fire_report')} className="px-4 py-2 bg-red-600 text-white rounded-lg text-xs font-semibold hover:bg-red-500 flex items-center gap-1.5">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                Fire Safety Register (PDF)
              </button>
              <button onClick={() => exportInventoryPdf('manager')} className="px-3 py-2 bg-red-100 text-red-700 rounded-lg text-xs font-medium hover:bg-red-200">Manager Report</button>
              <button onClick={() => exportInventoryPdf('head_office')} className="px-3 py-2 bg-red-100 text-red-700 rounded-lg text-xs font-medium hover:bg-red-200">Head Office Report</button>
            </div>

            {/* Sections */}
            {(onsiteFull.length + onsiteCustomer.length + onsiteEmpty.length) === 0 ? (
              <div className="bg-white rounded-xl border p-8 text-center">
                <p className="text-sm text-slate-400">No gas cylinders currently on site.</p>
              </div>
            ) : (
              <>
                {/* Cage Full */}
                {onsiteFull.length > 0 && (
                  <div className="bg-white rounded-xl border overflow-hidden mb-4">
                    <div className="px-4 py-3 border-b bg-green-50 flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-green-800">Cage — Full</h3>
                      <span className="text-xs text-green-600 font-bold">{onsiteFull.length} cylinders</span>
                    </div>
                    <div className="divide-y divide-slate-100">
                      {onsiteFull.map(c => (
                        <div key={c.id} className="px-4 py-3 flex items-center justify-between">
                          <div>
                            <p className="text-sm font-mono font-medium text-slate-800">{c.collar_number}</p>
                            <p className="text-xs text-slate-400">{c.size} {c.type}{c.supplier ? ` — ${c.supplier}` : ''}</p>
                          </div>
                          {statusBadge(c.status)}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* With Customers */}
                {onsiteCustomer.length > 0 && (
                  <div className="bg-white rounded-xl border overflow-hidden mb-4">
                    <div className="px-4 py-3 border-b bg-blue-50 flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-blue-800">With Customers (on pitches)</h3>
                      <span className="text-xs text-blue-600 font-bold">{onsiteCustomer.length} cylinders</span>
                    </div>
                    <div className="divide-y divide-slate-100">
                      {onsiteCustomer.map(c => (
                        <div key={c.id} className="px-4 py-3 flex items-center justify-between">
                          <div>
                            <p className="text-sm font-mono font-medium text-slate-800">{c.collar_number}</p>
                            <p className="text-xs text-slate-400">{c.size} {c.type} — Pitch {c.pitch_number || '?'} ({c.customer_name || 'Unknown'})</p>
                          </div>
                          {statusBadge(c.status)}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Cage Empty */}
                {onsiteEmpty.length > 0 && (
                  <div className="bg-white rounded-xl border overflow-hidden mb-4">
                    <div className="px-4 py-3 border-b bg-amber-50 flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-amber-800">Cage — Empty (awaiting collection)</h3>
                      <span className="text-xs text-amber-600 font-bold">{onsiteEmpty.length} cylinders</span>
                    </div>
                    <div className="divide-y divide-slate-100">
                      {onsiteEmpty.map(c => (
                        <div key={c.id} className="px-4 py-3 flex items-center justify-between">
                          <div>
                            <p className="text-sm font-mono font-medium text-slate-800">{c.collar_number}</p>
                            <p className="text-xs text-slate-400">{c.size} {c.type}</p>
                          </div>
                          {statusBadge(c.status)}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
