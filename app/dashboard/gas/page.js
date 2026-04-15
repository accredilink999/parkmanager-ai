'use client';
import { useState, useEffect, Suspense } from 'react';
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

  // Tab: inventory | delivery | returns | onsite
  const [tab, setTab] = useState('inventory');

  // Inventory
  const [cylinders, setCylinders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pitches, setPitches] = useState([]);

  // Add cylinder form
  const [showAddForm, setShowAddForm] = useState(false);
  const [newCylinder, setNewCylinder] = useState({ collar_number: '', size: '13kg', type: 'Propane', supplier: '' });

  // Assign / scan-out form
  const [showScanOutForm, setShowScanOutForm] = useState(false);
  const [scanOutCylinder, setScanOutCylinder] = useState(null);
  const [scanOutPitch, setScanOutPitch] = useState('');
  const [scanOutType, setScanOutType] = useState('customer'); // customer | offsite

  // Collar number lookup
  const [collarInput, setCollarInput] = useState('');

  // Delivery sessions
  const [deliverySessions, setDeliverySessions] = useState([]);
  const [activeDelivery, setActiveDelivery] = useState(null);

  // Return sessions
  const [returnSessions, setReturnSessions] = useState([]);
  const [activeReturn, setActiveReturn] = useState(null);

  // Edit cylinder
  const [editingCylinder, setEditingCylinder] = useState(null);

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');

  useEffect(() => {
    const saved = sessionStorage.getItem('pm_user');
    if (!saved) { router.push('/login'); return; }
    setUser(JSON.parse(saved));

    // Set tab from URL param
    const urlTab = searchParams.get('tab');
    if (urlTab && ['inventory', 'delivery', 'returns', 'onsite'].includes(urlTab)) {
      setTab(urlTab);
    }

    loadData();
    loadSessions();
  }, [router, searchParams]);

  // ---- Data loading ----
  async function loadData() {
    setLoading(true);

    // Load pitches
    if (supabase) {
      const { data } = await supabase.from('pitches').select('*').order('created_at');
      setPitches(data || []);
    } else {
      setPitches([
        { id: '1', pitch_number: 'A1', customer_name: 'John Smith' },
        { id: '2', pitch_number: 'A2', customer_name: 'Jane Doe' },
        { id: '3', pitch_number: 'A3', customer_name: 'Bob Wilson' },
        { id: '4', pitch_number: 'B1', customer_name: 'Mary Jones' },
        { id: '5', pitch_number: 'B2', customer_name: '' },
      ]);
    }

    // Load cylinders from localStorage (demo) or supabase
    if (supabase) {
      const { data } = await supabase.from('gas_cylinders').select('*').order('created_at', { ascending: false });
      setCylinders(data || []);
    } else {
      try {
        const saved = localStorage.getItem('pm_gas_cylinders');
        setCylinders(saved ? JSON.parse(saved) : []);
      } catch { setCylinders([]); }
    }

    setLoading(false);
  }

  function saveCylinders(updated) {
    setCylinders(updated);
    if (!supabase) {
      try { localStorage.setItem('pm_gas_cylinders', JSON.stringify(updated)); } catch {}
    }
  }

  function loadSessions() {
    try {
      const dSaved = localStorage.getItem('pm_gas_delivery_sessions');
      if (dSaved) {
        const all = JSON.parse(dSaved);
        setDeliverySessions(all);
        const active = all.find(s => s.status === 'active');
        if (active) setActiveDelivery(active);
      }
      const rSaved = localStorage.getItem('pm_gas_return_sessions');
      if (rSaved) {
        const all = JSON.parse(rSaved);
        setReturnSessions(all);
        const active = all.find(s => s.status === 'active');
        if (active) setActiveReturn(active);
      }
    } catch {}
  }

  function saveDeliverySessions(all) {
    setDeliverySessions(all);
    try { localStorage.setItem('pm_gas_delivery_sessions', JSON.stringify(all)); } catch {}
  }

  function saveReturnSessions(all) {
    setReturnSessions(all);
    try { localStorage.setItem('pm_gas_return_sessions', JSON.stringify(all)); } catch {}
  }

  // ---- Collar Number Lookup ----
  function handleCollarLookup(mode) {
    const collar = collarInput.trim();
    if (!collar) return;

    if (mode === 'out_customer' || mode === 'out_offsite') {
      const cyl = cylinders.find(c => c.collar_number === collar);
      if (!cyl) {
        flash(`Collar ${collar} not found in inventory. Add it first.`);
        return;
      }
      if (cyl.status === 'offsite') {
        flash(`Collar ${collar} is already offsite.`);
        return;
      }
      setScanOutCylinder(cyl);
      setScanOutType(mode === 'out_customer' ? 'customer' : 'offsite');
      setShowScanOutForm(true);
    } else if (mode === 'return') {
      const cyl = cylinders.find(c => c.collar_number === collar);
      if (!cyl) {
        flash(`Collar ${collar} not found in inventory.`);
        return;
      }
      handleReturnCylinder(cyl);
    }
    setCollarInput('');
  }

  function flash(msg) {
    setToast(msg);
    setTimeout(() => setToast(''), 4000);
  }

  // ---- Cylinder CRUD ----
  async function addCylinder() {
    if (!newCylinder.collar_number) return;

    // Check duplicate collar number
    const existing = cylinders.find(c => c.collar_number === newCylinder.collar_number);
    if (existing) {
      flash(`Collar ${newCylinder.collar_number} already in inventory (${existing.status})`);
      return;
    }

    const cyl = {
      id: 'cyl_' + Date.now(),
      collar_number: newCylinder.collar_number,
      size: newCylinder.size,
      type: newCylinder.type,
      supplier: newCylinder.supplier,
      status: 'on_site', // on_site | with_customer | offsite
      pitch_id: null,
      pitch_number: null,
      customer_name: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      history: [{ action: 'added', at: new Date().toISOString() }],
    };

    if (supabase) {
      const { collar_number, size, type, supplier, status } = cyl;
      const { data: inserted } = await supabase.from('gas_cylinders').insert({ collar_number, size, type, supplier, status, org_id: getOrgId() }).select('id').single();
      // Log to gas_logs
      if (inserted) {
        await supabase.from('gas_logs').insert({ cylinder_id: inserted.id, collar_number, action: 'added', notes: `${size} ${type}${supplier ? ' from ' + supplier : ''}`, org_id: getOrgId() });
      }
      loadData();
    } else {
      saveCylinders([cyl, ...cylinders]);
    }

    // Add to active delivery session if one exists
    if (activeDelivery) {
      const updated = {
        ...activeDelivery,
        cylinders: [...(activeDelivery.cylinders || []), { collar_number: cyl.collar_number, size: cyl.size, type: cyl.type, added_at: new Date().toISOString() }],
      };
      setActiveDelivery(updated);
      const allSessions = deliverySessions.map(s => s.id === updated.id ? updated : s);
      saveDeliverySessions(allSessions);
    }

    flash(`Cylinder ${newCylinder.collar_number} added to inventory`);
    setShowAddForm(false);
    setNewCylinder({ collar_number: '', size: '13kg', type: 'Propane', supplier: '' });
  }

  async function scanOutCylinderConfirm() {
    if (!scanOutCylinder) return;

    const updated = cylinders.map(c => {
      if (c.id === scanOutCylinder.id) {
        const pitch = pitches.find(p => p.id === scanOutPitch);
        return {
          ...c,
          status: scanOutType === 'offsite' ? 'offsite' : 'with_customer',
          pitch_id: scanOutType === 'customer' ? scanOutPitch : null,
          pitch_number: pitch?.pitch_number || null,
          customer_name: pitch?.customer_name || null,
          updated_at: new Date().toISOString(),
          history: [...(c.history || []), {
            action: scanOutType === 'offsite' ? 'sent_offsite' : 'given_to_customer',
            pitch_id: scanOutPitch || null,
            pitch_number: pitch?.pitch_number || null,
            at: new Date().toISOString(),
          }],
        };
      }
      return c;
    });

    if (supabase) {
      const pitch = pitches.find(p => p.id === scanOutPitch);
      await supabase.from('gas_cylinders').update({
        status: scanOutType === 'offsite' ? 'offsite' : 'with_customer',
        pitch_id: scanOutType === 'customer' ? scanOutPitch : null,
        pitch_number: pitch?.pitch_number || null,
        customer_name: pitch?.customer_name || null,
        updated_at: new Date().toISOString(),
      }).eq('id', scanOutCylinder.id);
      // Log to gas_logs
      await supabase.from('gas_logs').insert({
        cylinder_id: scanOutCylinder.id, collar_number: scanOutCylinder.collar_number,
        action: scanOutType === 'offsite' ? 'sent_offsite' : 'given_to_customer',
        pitch_id: scanOutType === 'customer' ? scanOutPitch : null,
        pitch_number: pitch?.pitch_number || null,
        customer_name: pitch?.customer_name || null,
        org_id: getOrgId(),
      });
      loadData();
    } else {
      saveCylinders(updated);
    }

    flash(`Cylinder ${scanOutCylinder.collar_number} — ${scanOutType === 'offsite' ? 'removed from site' : 'assigned to customer'}`);
    setShowScanOutForm(false);
    setScanOutCylinder(null);
    setScanOutPitch('');
  }

  async function handleReturnCylinder(cyl) {
    const updated = cylinders.map(c => {
      if (c.id === cyl.id) {
        return {
          ...c,
          status: 'on_site',
          pitch_id: null,
          pitch_number: null,
          customer_name: null,
          updated_at: new Date().toISOString(),
          history: [...(c.history || []), { action: 'returned_to_site', at: new Date().toISOString() }],
        };
      }
      return c;
    });

    if (supabase) {
      await supabase.from('gas_cylinders').update({
        status: 'on_site',
        pitch_id: null,
        pitch_number: null,
        customer_name: null,
        updated_at: new Date().toISOString(),
      }).eq('id', cyl.id);
      // Log to gas_logs
      await supabase.from('gas_logs').insert({
        cylinder_id: cyl.id, collar_number: cyl.collar_number,
        action: 'returned_to_site',
        pitch_number: cyl.pitch_number || null,
        customer_name: cyl.customer_name || null,
        org_id: getOrgId(),
      });
      loadData();
    } else {
      saveCylinders(updated);
    }

    // Add to active return session if exists
    if (activeReturn) {
      const updatedSession = {
        ...activeReturn,
        cylinders: [...(activeReturn.cylinders || []), { collar_number: cyl.collar_number, size: cyl.size, type: cyl.type, returned_at: new Date().toISOString() }],
      };
      setActiveReturn(updatedSession);
      const allSessions = returnSessions.map(s => s.id === updatedSession.id ? updatedSession : s);
      saveReturnSessions(allSessions);
    }

    flash(`Cylinder ${cyl.collar_number} returned to site`);
  }

  async function deleteCylinder(cyl) {
    if (!confirm(`Delete cylinder ${cyl.collar_number || cyl.barcode}?`)) return;
    if (supabase) {
      await supabase.from('gas_cylinders').delete().eq('id', cyl.id);
      loadData();
    } else {
      saveCylinders(cylinders.filter(c => c.id !== cyl.id));
    }
    flash(`Cylinder ${cyl.collar_number} removed from inventory`);
  }

  function startEditCylinder(cyl) {
    setEditingCylinder({ ...cyl });
  }

  async function saveEditCylinder() {
    if (!editingCylinder) return;
    const { id, collar_number, size, type, supplier } = editingCylinder;
    if (supabase) {
      await supabase.from('gas_cylinders').update({ collar_number, size, type, supplier, updated_at: new Date().toISOString() }).eq('id', id);
      loadData();
    } else {
      saveCylinders(cylinders.map(c => c.id === id ? { ...c, collar_number, size, type, supplier, updated_at: new Date().toISOString() } : c));
    }
    setEditingCylinder(null);
    flash(`Cylinder ${collar_number} updated`);
  }

  // ---- Delivery Sessions ----
  function startDeliverySession() {
    const sess = {
      id: 'del_' + Date.now(),
      name: `Delivery — ${new Date().toLocaleDateString('en-GB')}`,
      started_at: new Date().toISOString(),
      cylinders: [],
      status: 'active',
    };
    setActiveDelivery(sess);
    const all = [...deliverySessions, sess];
    saveDeliverySessions(all);
    setTab('delivery');
    flash('Delivery session started — add incoming cylinders');
  }

  function completeDeliverySession() {
    if (!activeDelivery) return;
    const updated = { ...activeDelivery, status: 'complete', completed_at: new Date().toISOString() };
    setActiveDelivery(null);
    const all = deliverySessions.map(s => s.id === updated.id ? updated : s);
    saveDeliverySessions(all);
    flash(`Delivery session complete — ${updated.cylinders.length} cylinders received`);
  }

  function deleteDeliverySession(id) {
    const all = deliverySessions.filter(s => s.id !== id);
    saveDeliverySessions(all);
    if (activeDelivery?.id === id) setActiveDelivery(null);
  }

  // ---- Return Sessions ----
  function startReturnSession() {
    const sess = {
      id: 'ret_' + Date.now(),
      name: `Empty Returns — ${new Date().toLocaleDateString('en-GB')}`,
      started_at: new Date().toISOString(),
      cylinders: [],
      status: 'active',
    };
    setActiveReturn(sess);
    const all = [...returnSessions, sess];
    saveReturnSessions(all);
    setTab('returns');
    flash('Return session started — enter collar numbers for empties');
  }

  function completeReturnSession() {
    if (!activeReturn) return;
    const updated = { ...activeReturn, status: 'complete', completed_at: new Date().toISOString() };
    setActiveReturn(null);
    const all = returnSessions.map(s => s.id === updated.id ? updated : s);
    saveReturnSessions(all);
    flash(`Return session complete — ${updated.cylinders.length} empties collected`);
  }

  function deleteReturnSession(id) {
    const all = returnSessions.filter(s => s.id !== id);
    saveReturnSessions(all);
    if (activeReturn?.id === id) setActiveReturn(null);
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
    } else {
      try {
        const saved = JSON.parse(localStorage.getItem('pm_settings') || '[]');
        saved.forEach(s => {
          if (s.key === 'site_name') siteName = s.value;
          if (s.key === 'site_address') siteAddress = s.value;
        });
      } catch {}
    }

    const onSite = cylinders.filter(c => c.status !== 'offsite');
    const withCustomer = cylinders.filter(c => c.status === 'with_customer');
    const onSiteStore = cylinders.filter(c => c.status === 'on_site');
    const offsite = cylinders.filter(c => c.status === 'offsite');
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

    // Fire compliance notice
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
    doc.text(`Total Cylinders on Premises: ${onSite.length}`, 14, y);
    doc.text(`In Store (unallocated): ${onSiteStore.length}`, 110, y);
    y += 5;
    doc.text(`With Customers (on pitches): ${withCustomer.length}`, 14, y);
    doc.text(`Offsite / Returned: ${offsite.length}`, 110, y);

    // === IN STORE section ===
    y += 12;
    doc.setFontSize(10);
    doc.setFont(undefined, 'bold');
    doc.setTextColor(22, 163, 74);
    doc.text(`IN STORE — ${onSiteStore.length} cylinder${onSiteStore.length !== 1 ? 's' : ''}`, 14, y);

    y += 6;
    doc.setFillColor(240, 253, 244);
    doc.rect(14, y - 4, 182, 8, 'F');
    doc.setFontSize(8);
    doc.setTextColor(100);
    doc.text('Collar No.', 16, y);
    doc.text('Size', 50, y);
    doc.text('Type', 75, y);
    doc.text('Supplier', 105, y);
    doc.text('Added', 150, y);

    y += 6;
    doc.setTextColor(0);
    doc.setFont(undefined, 'normal');
    for (const c of onSiteStore) {
      if (y > 275) { doc.addPage(); y = 20; }
      doc.setFontSize(8);
      doc.text(c.collar_number || c.barcode || '', 16, y);
      doc.text(c.size || '', 50, y);
      doc.text(c.type || '', 75, y);
      doc.text((c.supplier || '—').substring(0, 20), 105, y);
      doc.text(c.created_at ? new Date(c.created_at).toLocaleDateString('en-GB') : '—', 150, y);
      y += 5;
    }
    if (onSiteStore.length === 0) { doc.setFontSize(8); doc.setTextColor(150); doc.text('No cylinders in store', 16, y); y += 5; }

    // === WITH CUSTOMERS section ===
    y += 8;
    if (y > 260) { doc.addPage(); y = 20; }
    doc.setFontSize(10);
    doc.setFont(undefined, 'bold');
    doc.setTextColor(37, 99, 235);
    doc.text(`WITH CUSTOMERS — ${withCustomer.length} cylinder${withCustomer.length !== 1 ? 's' : ''}`, 14, y);

    y += 6;
    doc.setFillColor(239, 246, 255);
    doc.rect(14, y - 4, 182, 8, 'F');
    doc.setFontSize(8);
    doc.setTextColor(100);
    doc.text('Collar No.', 16, y);
    doc.text('Size', 50, y);
    doc.text('Type', 75, y);
    doc.text('Pitch', 105, y);
    doc.text('Customer', 125, y);
    doc.text('Assigned', 170, y);

    y += 6;
    doc.setTextColor(0);
    doc.setFont(undefined, 'normal');
    for (const c of withCustomer) {
      if (y > 275) { doc.addPage(); y = 20; }
      doc.setFontSize(8);
      doc.text(c.collar_number || c.barcode || '', 16, y);
      doc.text(c.size || '', 50, y);
      doc.text(c.type || '', 75, y);
      doc.text(c.pitch_number || '—', 105, y);
      doc.text((c.customer_name || '—').substring(0, 20), 125, y);
      doc.text(c.updated_at ? new Date(c.updated_at).toLocaleDateString('en-GB') : '—', 170, y);
      y += 5;
    }
    if (withCustomer.length === 0) { doc.setFontSize(8); doc.setTextColor(150); doc.text('No cylinders with customers', 16, y); y += 5; }

    // Sign-off box for fire report
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
    y += isFireReport ? 44 : 12;
    if (y > 280) { doc.addPage(); y = 20; }
    doc.setFontSize(8);
    doc.setTextColor(80);
    doc.text(`Carried out by: ${user?.full_name || user?.email || ''}`, 14, 278);
    doc.setFontSize(7);
    doc.setTextColor(150);
    doc.text(`Generated by ${siteName} — ParkManagerAI — ${now.toLocaleString('en-GB')}`, 105, 285, { align: 'center' });

    const typeLabel = isFireReport ? 'FireRegister' : `GasInventory-${recipient}`;
    const filename = `${typeLabel}-${now.toISOString().slice(0, 10)}.pdf`;
    doc.save(filename);
    flash(`PDF exported: ${filename}`);
  }

  // ---- Render helpers ----
  function statusBadge(status) {
    const map = {
      on_site: { label: 'In Store', bg: 'bg-green-100', text: 'text-green-700' },
      with_customer: { label: 'With Customer', bg: 'bg-blue-100', text: 'text-blue-700' },
      offsite: { label: 'Offsite', bg: 'bg-slate-100', text: 'text-slate-500' },
    };
    const s = map[status] || map.on_site;
    return <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${s.bg} ${s.text}`}>{s.label}</span>;
  }

  // Filtered cylinders
  const filteredCylinders = cylinders.filter(c => {
    if (filterStatus !== 'all' && c.status !== filterStatus) return false;
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      return (c.collar_number || c.barcode || '').toLowerCase().includes(q) ||
        (c.pitch_number || '').toLowerCase().includes(q) ||
        (c.customer_name || '').toLowerCase().includes(q) ||
        (c.type || '').toLowerCase().includes(q);
    }
    return true;
  });

  // On-site cylinders (for fire regs view)
  const onsiteCylinders = cylinders.filter(c => c.status !== 'offsite');
  const onsiteInStore = onsiteCylinders.filter(c => c.status === 'on_site');
  const onsiteWithCustomer = onsiteCylinders.filter(c => c.status === 'with_customer');

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
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowAddForm(true)}
              className="px-3 py-2 bg-orange-600 text-white rounded-lg text-sm font-medium hover:bg-orange-500 transition-colors"
            >
              + Add Cylinder
            </button>
          </div>
        </div>
      </header>

      {/* Toast */}
      {toast && (
        <div className="fixed top-4 right-4 z-50 bg-orange-600 text-white px-4 py-2 rounded-lg shadow-lg text-sm max-w-sm">{toast}</div>
      )}

      {/* Add Cylinder Form Modal */}
      {showAddForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <h3 className="text-base font-bold text-slate-900 mb-4">Add Gas Cylinder</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Collar Number (4 digits) *</label>
                <input value={newCylinder.collar_number} onChange={e => setNewCylinder(p => ({ ...p, collar_number: e.target.value.replace(/[^0-9]/g, '').slice(0, 4) }))}
                  inputMode="numeric" maxLength={4}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-lg font-mono text-center tracking-widest focus:outline-none focus:ring-2 focus:ring-orange-500" placeholder="e.g. 7208" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Size</label>
                  <select value={newCylinder.size} onChange={e => setNewCylinder(p => ({ ...p, size: e.target.value }))}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500">
                    <option>6kg</option>
                    <option>13kg</option>
                    <option>19kg</option>
                    <option>47kg</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Type</label>
                  <select value={newCylinder.type} onChange={e => setNewCylinder(p => ({ ...p, type: e.target.value }))}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500">
                    <option>Propane</option>
                    <option>Butane</option>
                    <option>Patio Gas</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Supplier (optional)</label>
                <input value={newCylinder.supplier} onChange={e => setNewCylinder(p => ({ ...p, supplier: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" placeholder="e.g. Calor, Flogas" />
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={() => { setShowAddForm(false); setNewCylinder({ collar_number: '', size: '13kg', type: 'Propane', supplier: '' }); }}
                className="flex-1 py-2 bg-slate-100 text-slate-700 rounded-lg text-sm">Cancel</button>
              <button onClick={addCylinder} disabled={!newCylinder.collar_number || newCylinder.collar_number.length < 4}
                className="flex-1 py-2 bg-orange-600 text-white rounded-lg text-sm font-medium disabled:opacity-50 hover:bg-orange-500">Add to Inventory</button>
            </div>
          </div>
        </div>
      )}

      {/* Scan Out Form Modal */}
      {showScanOutForm && scanOutCylinder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <h3 className="text-base font-bold text-slate-900 mb-1">Assign Cylinder</h3>
            <p className="text-xs text-slate-400 mb-4">Collar: <span className="font-mono font-bold">{scanOutCylinder.collar_number || scanOutCylinder.barcode}</span> — {scanOutCylinder.size} {scanOutCylinder.type}</p>

            <div className="space-y-3 mb-5">
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Where is it going?</label>
                <div className="flex gap-2">
                  <button onClick={() => setScanOutType('customer')}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${scanOutType === 'customer' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600 border-slate-200'}`}>
                    To Customer
                  </button>
                  <button onClick={() => setScanOutType('offsite')}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${scanOutType === 'offsite' ? 'bg-slate-700 text-white border-slate-700' : 'bg-white text-slate-600 border-slate-200'}`}>
                    Offsite (Remove)
                  </button>
                </div>
              </div>

              {scanOutType === 'customer' && (
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Select Pitch / Customer</label>
                  <select value={scanOutPitch} onChange={e => setScanOutPitch(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500">
                    <option value="">Choose pitch...</option>
                    {pitches.map(p => <option key={p.id} value={p.id}>{p.pitch_number} — {p.customer_name || 'Vacant'}</option>)}
                  </select>
                </div>
              )}
            </div>

            <div className="flex gap-2">
              <button onClick={() => { setShowScanOutForm(false); setScanOutCylinder(null); setScanOutPitch(''); }}
                className="flex-1 py-2 bg-slate-100 text-slate-700 rounded-lg text-sm">Cancel</button>
              <button onClick={scanOutCylinderConfirm}
                disabled={scanOutType === 'customer' && !scanOutPitch}
                className="flex-1 py-2 bg-orange-600 text-white rounded-lg text-sm font-medium disabled:opacity-50 hover:bg-orange-500">
                {scanOutType === 'offsite' ? 'Remove from Site' : 'Assign to Customer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Cylinder Modal */}
      {editingCylinder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <h3 className="text-base font-bold text-slate-900 mb-4">Edit Cylinder</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Collar Number</label>
                <input value={editingCylinder.collar_number || ''} onChange={e => setEditingCylinder(p => ({ ...p, collar_number: e.target.value.replace(/[^0-9]/g, '').slice(0, 4) }))}
                  inputMode="numeric" maxLength={4}
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

      {/* Tab Bar */}
      <div className="max-w-7xl mx-auto px-4 pt-4">
        <div className="flex items-center gap-1 bg-white rounded-xl border p-1 mb-4 overflow-x-auto">
          {[
            { key: 'inventory', label: 'Inventory' },
            { key: 'delivery', label: 'Delivery', badge: activeDelivery ? 'Active' : null },
            { key: 'returns', label: 'Returns', badge: activeReturn ? 'Active' : null },
            { key: 'onsite', label: 'On-Site Register' },
          ].map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap flex items-center justify-center gap-1.5 ${
                tab === t.key ? 'bg-orange-600 text-white' : 'text-slate-600 hover:bg-slate-50'
              }`}>
              {t.label}
              {t.badge && <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${tab === t.key ? 'bg-white/20' : 'bg-amber-100 text-amber-700'}`}>{t.badge}</span>}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 pb-8">
        {/* ======= INVENTORY TAB ======= */}
        {tab === 'inventory' && (
          <>
            {/* Stats */}
            <div className="grid grid-cols-3 gap-3 mb-4">
              <div className="bg-white rounded-xl border p-3 text-center">
                <p className="text-2xl font-bold text-green-600">{cylinders.filter(c => c.status === 'on_site').length}</p>
                <p className="text-xs text-slate-500">In Store</p>
              </div>
              <div className="bg-white rounded-xl border p-3 text-center">
                <p className="text-2xl font-bold text-blue-600">{cylinders.filter(c => c.status === 'with_customer').length}</p>
                <p className="text-xs text-slate-500">With Customers</p>
              </div>
              <div className="bg-white rounded-xl border p-3 text-center">
                <p className="text-2xl font-bold text-slate-400">{cylinders.filter(c => c.status === 'offsite').length}</p>
                <p className="text-xs text-slate-500">Offsite</p>
              </div>
            </div>

            {/* Quick collar lookup */}
            <div className="bg-white rounded-xl border p-4 mb-4">
              <label className="block text-xs font-semibold text-slate-600 mb-2">Quick Action — Enter Collar Number</label>
              <div className="flex items-center gap-2">
                <input value={collarInput} onChange={e => setCollarInput(e.target.value.replace(/[^0-9]/g, '').slice(0, 4))}
                  inputMode="numeric" maxLength={4}
                  className="w-28 px-3 py-2 border border-slate-200 rounded-lg text-lg font-mono text-center tracking-widest focus:outline-none focus:ring-2 focus:ring-orange-500" placeholder="0000" />
                <button onClick={() => handleCollarLookup('out_customer')} disabled={collarInput.length < 4}
                  className="px-3 py-2 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-500 disabled:opacity-40">Out to Customer</button>
                <button onClick={() => handleCollarLookup('out_offsite')} disabled={collarInput.length < 4}
                  className="px-3 py-2 bg-slate-600 text-white rounded-lg text-xs font-medium hover:bg-slate-500 disabled:opacity-40">Offsite</button>
                <button onClick={() => handleCollarLookup('return')} disabled={collarInput.length < 4}
                  className="px-3 py-2 bg-green-600 text-white rounded-lg text-xs font-medium hover:bg-green-500 disabled:opacity-40">Return</button>
              </div>
            </div>

            {/* Actions bar */}
            <div className="flex flex-wrap items-center gap-2 mb-4">
              <button onClick={() => setShowAddForm(true)} className="px-3 py-2 bg-orange-600 text-white rounded-lg text-xs font-medium hover:bg-orange-500">+ Add Cylinder</button>
              <div className="flex-1" />
              <button onClick={() => exportInventoryPdf('manager')} className="px-3 py-2 bg-slate-100 text-slate-700 rounded-lg text-xs font-medium hover:bg-slate-200">PDF (Manager)</button>
              <button onClick={() => exportInventoryPdf('head_office')} className="px-3 py-2 bg-slate-100 text-slate-700 rounded-lg text-xs font-medium hover:bg-slate-200">PDF (Head Office)</button>
            </div>

            {/* Search & Filter */}
            <div className="flex gap-2 mb-4">
              <input value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="Search collar number, pitch, customer..."
                className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />
              <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
                className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500">
                <option value="all">All Status</option>
                <option value="on_site">In Store</option>
                <option value="with_customer">With Customer</option>
                <option value="offsite">Offsite</option>
              </select>
            </div>

            {/* Cylinder List */}
            {loading ? (
              <div className="flex justify-center py-12"><div className="animate-spin w-8 h-8 border-2 border-orange-400 border-t-transparent rounded-full" /></div>
            ) : filteredCylinders.length === 0 ? (
              <div className="bg-white rounded-xl border p-8 text-center">
                <svg className="w-12 h-12 text-slate-300 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                </svg>
                <p className="text-sm text-slate-400">No cylinders in inventory. Add one using the collar number.</p>
              </div>
            ) : (
              <div className="bg-white rounded-xl border overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-slate-50 border-b">
                      <tr>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500">Collar No.</th>
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
                          <td className="px-4 py-3 text-sm font-mono font-medium text-slate-900">{c.collar_number || c.barcode}</td>
                          <td className="px-4 py-3 text-sm text-slate-600">{c.size}</td>
                          <td className="px-4 py-3 text-sm text-slate-600">{c.type}</td>
                          <td className="px-4 py-3">{statusBadge(c.status)}</td>
                          <td className="px-4 py-3 text-sm text-slate-600 hidden sm:table-cell">{c.pitch_number || '—'}</td>
                          <td className="px-4 py-3 text-sm text-slate-600 hidden sm:table-cell">{c.customer_name || '—'}</td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex items-center justify-end gap-1">
                              {c.status === 'on_site' && (
                                <button onClick={() => { setScanOutCylinder(c); setScanOutType('customer'); setShowScanOutForm(true); }}
                                  className="text-xs text-blue-600 hover:text-blue-800 font-medium px-1">Out</button>
                              )}
                              {c.status === 'with_customer' && (
                                <button onClick={() => handleReturnCylinder(c)}
                                  className="text-xs text-green-600 hover:text-green-800 font-medium px-1">Return</button>
                              )}
                              <button onClick={() => startEditCylinder(c)}
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

        {/* ======= DELIVERY TAB ======= */}
        {tab === 'delivery' && (
          <>
            {activeDelivery ? (
              <div className="space-y-4">
                <div className="bg-white rounded-xl border p-5">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <h3 className="text-sm font-bold text-slate-900">{activeDelivery.name}</h3>
                      <p className="text-xs text-slate-400">{activeDelivery.cylinders.length} cylinders scanned in</p>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => setShowAddForm(true)} className="px-3 py-2 bg-orange-600 text-white rounded-lg text-xs font-medium hover:bg-orange-500">
                        + Add Next
                      </button>
                      <button onClick={completeDeliverySession} className="px-3 py-2 bg-green-600 text-white rounded-lg text-xs font-medium hover:bg-green-500">Complete</button>
                    </div>
                  </div>

                  {activeDelivery.cylinders.length === 0 ? (
                    <div className="border-2 border-dashed border-slate-200 rounded-xl p-8 text-center">
                      <p className="text-sm text-slate-400">No cylinders added yet. Tap &quot;+ Add Next&quot; to enter each incoming cylinder&apos;s collar number.</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-100">
                      {activeDelivery.cylinders.map((c, i) => (
                        <div key={i} className="py-2 flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-green-600 font-bold">&#10003;</span>
                            <span className="text-sm font-mono text-slate-800">{c.collar_number || c.barcode}</span>
                          </div>
                          <span className="text-xs text-slate-400">{c.size} {c.type}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="bg-white rounded-xl border p-6 text-center">
                  <div className="w-16 h-16 bg-orange-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                    <svg className="w-8 h-8 text-orange-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                    </svg>
                  </div>
                  <h3 className="text-base font-bold text-slate-900 mb-1">Delivery Session</h3>
                  <p className="text-sm text-slate-500 mb-4">Start a session when a gas delivery arrives. Enter each cylinder&apos;s collar number as it comes off the truck.</p>
                  <button onClick={startDeliverySession} className="px-6 py-3 bg-orange-600 text-white rounded-xl text-sm font-semibold hover:bg-orange-500">Start Delivery Session</button>
                </div>

                {/* Past delivery sessions */}
                {deliverySessions.length > 0 && (
                  <div className="bg-white rounded-xl border overflow-hidden">
                    <div className="px-4 py-3 border-b bg-slate-50">
                      <h3 className="text-sm font-semibold text-slate-700">Past Deliveries</h3>
                    </div>
                    <div className="divide-y divide-slate-100">
                      {deliverySessions.sort((a, b) => new Date(b.started_at) - new Date(a.started_at)).map(s => (
                        <div key={s.id} className="px-4 py-3 flex items-center justify-between">
                          <div>
                            <p className="text-sm font-medium text-slate-800">{s.name}</p>
                            <p className="text-xs text-slate-400">{s.cylinders.length} cylinders — {s.status === 'complete' ? 'Completed' : 'In Progress'}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            {s.status === 'active' && (
                              <button onClick={() => { setActiveDelivery(s); setTab('delivery'); }} className="px-3 py-1.5 bg-amber-100 text-amber-700 rounded-lg text-xs font-medium hover:bg-amber-200">Resume</button>
                            )}
                            <button onClick={() => deleteDeliverySession(s.id)} className="text-red-400 hover:text-red-600">
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* ======= RETURNS TAB ======= */}
        {tab === 'returns' && (
          <>
            {activeReturn ? (
              <div className="space-y-4">
                <div className="bg-white rounded-xl border p-5">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <h3 className="text-sm font-bold text-slate-900">{activeReturn.name}</h3>
                      <p className="text-xs text-slate-400">{activeReturn.cylinders.length} empties returned</p>
                    </div>
                    <div className="flex gap-2">
                      <div className="flex items-center gap-1">
                        <input value={collarInput} onChange={e => setCollarInput(e.target.value.replace(/[^0-9]/g, '').slice(0, 4))}
                          inputMode="numeric" maxLength={4}
                          className="w-20 px-2 py-2 border border-slate-200 rounded-lg text-sm font-mono text-center focus:outline-none focus:ring-2 focus:ring-green-500" placeholder="0000" />
                        <button onClick={() => handleCollarLookup('return')} disabled={collarInput.length < 4}
                          className="px-3 py-2 bg-green-600 text-white rounded-lg text-xs font-medium hover:bg-green-500 disabled:opacity-40">Return</button>
                      </div>
                      <button onClick={completeReturnSession} className="px-3 py-2 bg-green-600 text-white rounded-lg text-xs font-medium hover:bg-green-500">Complete</button>
                    </div>
                  </div>

                  {activeReturn.cylinders.length === 0 ? (
                    <div className="border-2 border-dashed border-slate-200 rounded-xl p-8 text-center">
                      <p className="text-sm text-slate-400">No empties returned yet. Scan each empty cylinder as it comes back.</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-100">
                      {activeReturn.cylinders.map((c, i) => (
                        <div key={i} className="py-2 flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-green-600 font-bold">&#10003;</span>
                            <span className="text-sm font-mono text-slate-800">{c.collar_number || c.barcode}</span>
                          </div>
                          <span className="text-xs text-slate-400">{c.size} {c.type} — returned {new Date(c.returned_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Cylinders with customers that can be returned */}
                {cylinders.filter(c => c.status === 'with_customer').length > 0 && (
                  <div className="bg-white rounded-xl border overflow-hidden">
                    <div className="px-4 py-3 border-b bg-slate-50">
                      <h3 className="text-sm font-semibold text-slate-700">Cylinders With Customers (tap to return)</h3>
                    </div>
                    <div className="divide-y divide-slate-100">
                      {cylinders.filter(c => c.status === 'with_customer').map(c => (
                        <button key={c.id} onClick={() => handleReturnCylinder(c)} className="w-full px-4 py-3 flex items-center justify-between hover:bg-slate-50 text-left">
                          <div>
                            <p className="text-sm font-mono font-medium text-slate-800">{c.collar_number || c.barcode}</p>
                            <p className="text-xs text-slate-400">{c.size} {c.type} — Pitch {c.pitch_number} ({c.customer_name || 'Unknown'})</p>
                          </div>
                          <span className="text-xs text-green-600 font-medium">Return &rarr;</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                <div className="bg-white rounded-xl border p-6 text-center">
                  <div className="w-16 h-16 bg-green-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                    <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                    </svg>
                  </div>
                  <h3 className="text-base font-bold text-slate-900 mb-1">Empty Returns Session</h3>
                  <p className="text-sm text-slate-500 mb-4">Start a session when collecting empties. Enter each empty cylinder&apos;s collar number to move it back to store.</p>
                  <button onClick={startReturnSession} className="px-6 py-3 bg-green-600 text-white rounded-xl text-sm font-semibold hover:bg-green-500">Start Return Session</button>
                </div>

                {/* Past return sessions */}
                {returnSessions.length > 0 && (
                  <div className="bg-white rounded-xl border overflow-hidden">
                    <div className="px-4 py-3 border-b bg-slate-50">
                      <h3 className="text-sm font-semibold text-slate-700">Past Returns</h3>
                    </div>
                    <div className="divide-y divide-slate-100">
                      {returnSessions.sort((a, b) => new Date(b.started_at) - new Date(a.started_at)).map(s => (
                        <div key={s.id} className="px-4 py-3 flex items-center justify-between">
                          <div>
                            <p className="text-sm font-medium text-slate-800">{s.name}</p>
                            <p className="text-xs text-slate-400">{s.cylinders.length} empties — {s.status === 'complete' ? 'Completed' : 'In Progress'}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            {s.status === 'active' && (
                              <button onClick={() => { setActiveReturn(s); setTab('returns'); }} className="px-3 py-1.5 bg-amber-100 text-amber-700 rounded-lg text-xs font-medium hover:bg-amber-200">Resume</button>
                            )}
                            <button onClick={() => deleteReturnSession(s.id)} className="text-red-400 hover:text-red-600">
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
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
                <p className="text-xs text-red-600">This register shows ALL live gas cylinders currently on the premises, including those with customers. Only cylinders sent offsite are excluded.</p>
              </div>
            </div>

            {/* Summary */}
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="bg-white rounded-xl border p-4 text-center">
                <p className="text-3xl font-bold text-red-600">{onsiteCylinders.length}</p>
                <p className="text-xs text-slate-500 font-medium">Total On Premises</p>
              </div>
              <div className="bg-white rounded-xl border p-4">
                <div className="flex justify-between mb-1">
                  <span className="text-xs text-slate-500">In Store</span>
                  <span className="text-sm font-bold text-green-600">{onsiteInStore.length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-xs text-slate-500">With Customers</span>
                  <span className="text-sm font-bold text-blue-600">{onsiteWithCustomer.length}</span>
                </div>
              </div>
            </div>

            {/* Export */}
            <div className="flex flex-wrap gap-2 mb-4">
              <button onClick={() => exportInventoryPdf('fire_report')} className="px-4 py-2 bg-red-600 text-white rounded-lg text-xs font-semibold hover:bg-red-500 flex items-center gap-1.5">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                Fire Safety Register (PDF)
              </button>
              <button onClick={() => exportInventoryPdf('manager')} className="px-3 py-2 bg-red-100 text-red-700 rounded-lg text-xs font-medium hover:bg-red-200">
                Manager Report
              </button>
              <button onClick={() => exportInventoryPdf('head_office')} className="px-3 py-2 bg-red-100 text-red-700 rounded-lg text-xs font-medium hover:bg-red-200">
                Head Office Report
              </button>
            </div>

            {/* On-site list */}
            {onsiteCylinders.length === 0 ? (
              <div className="bg-white rounded-xl border p-8 text-center">
                <p className="text-sm text-slate-400">No gas cylinders currently on site.</p>
              </div>
            ) : (
              <>
                {/* In Store section */}
                {onsiteInStore.length > 0 && (
                  <div className="bg-white rounded-xl border overflow-hidden mb-4">
                    <div className="px-4 py-3 border-b bg-green-50 flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-green-800">In Store</h3>
                      <span className="text-xs text-green-600 font-bold">{onsiteInStore.length} cylinders</span>
                    </div>
                    <div className="divide-y divide-slate-100">
                      {onsiteInStore.map(c => (
                        <div key={c.id} className="px-4 py-3 flex items-center justify-between">
                          <div>
                            <p className="text-sm font-mono font-medium text-slate-800">{c.collar_number || c.barcode}</p>
                            <p className="text-xs text-slate-400">{c.size} {c.type}{c.supplier ? ` — ${c.supplier}` : ''}</p>
                          </div>
                          {statusBadge(c.status)}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* With Customers section */}
                {onsiteWithCustomer.length > 0 && (
                  <div className="bg-white rounded-xl border overflow-hidden">
                    <div className="px-4 py-3 border-b bg-blue-50 flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-blue-800">With Customers (still on premises)</h3>
                      <span className="text-xs text-blue-600 font-bold">{onsiteWithCustomer.length} cylinders</span>
                    </div>
                    <div className="divide-y divide-slate-100">
                      {onsiteWithCustomer.map(c => (
                        <div key={c.id} className="px-4 py-3 flex items-center justify-between">
                          <div>
                            <p className="text-sm font-mono font-medium text-slate-800">{c.collar_number || c.barcode}</p>
                            <p className="text-xs text-slate-400">{c.size} {c.type} — Pitch {c.pitch_number || '?'} ({c.customer_name || 'Unknown'})</p>
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
