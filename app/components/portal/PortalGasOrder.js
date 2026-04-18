'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

export default function PortalGasOrder({ user, pitch }) {
  const [orders, setOrders] = useState([]);
  const [cylinders, setCylinders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState('');
  const [saving, setSaving] = useState(false);

  // Form
  const [size, setSize] = useState('13kg');
  const [type, setType] = useState('Propane');
  const [qty, setQty] = useState(1);
  const [notes, setNotes] = useState('');

  useEffect(() => { loadData(); }, [pitch?.id]);

  async function loadData() {
    if (!supabase || !pitch?.id) { setLoading(false); return; }
    try {
      const [ordersRes, cylRes] = await Promise.all([
        supabase.from('gas_orders').select('*').eq('pitch_id', pitch.id).order('requested_at', { ascending: false }),
        supabase.from('gas_cylinders').select('*').eq('pitch_id', pitch.id).eq('status', 'with_customer'),
      ]);
      setOrders(ordersRes.data || []);
      setCylinders(cylRes.data || []);
    } catch {}
    setLoading(false);
  }

  async function submitOrder() {
    if (!supabase || !pitch?.id) return;
    setSaving(true);
    try {
      const { error } = await supabase.from('gas_orders').insert({
        user_id: user.id,
        pitch_id: pitch.id,
        org_id: user.org_id,
        cylinder_size: size,
        cylinder_type: type,
        quantity: qty,
        notes: notes.trim() || null,
      });
      if (error) throw error;
      setNotes('');
      setQty(1);
      setToast('Gas order submitted! The site team will confirm shortly.');
      setTimeout(() => setToast(''), 4000);
      loadData();
    } catch (err) {
      console.error('Order error:', err);
      setToast('Failed to submit order — try again');
      setTimeout(() => setToast(''), 3000);
    }
    setSaving(false);
  }

  const statusColors = { pending: 'bg-amber-100 text-amber-700', confirmed: 'bg-blue-100 text-blue-700', delivered: 'bg-emerald-100 text-emerald-700', cancelled: 'bg-red-100 text-red-700' };

  if (loading) return <div className="flex justify-center py-16"><div className="animate-spin w-8 h-8 border-2 border-emerald-400 border-t-transparent rounded-full" /></div>;

  return (
    <div className="space-y-3 mt-1">
      {toast && <div className="bg-emerald-600 text-white text-center py-2 rounded-xl text-sm font-medium">{toast}</div>}

      {/* Current on-site cylinders */}
      {cylinders.length > 0 && (
        <div className="bg-white rounded-2xl border overflow-hidden">
          <div className="px-4 py-3 bg-orange-50 border-b border-orange-100">
            <p className="text-xs font-semibold text-orange-700 uppercase tracking-wider">Cylinders On Your Pitch</p>
          </div>
          <div className="divide-y">
            {cylinders.map(c => (
              <div key={c.id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="text-sm font-mono font-medium text-slate-800">{c.collar_number}</p>
                  <p className="text-xs text-slate-400">{c.size} {c.type}</p>
                </div>
                <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full font-medium">On site</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Order Form */}
      <div className="bg-white rounded-2xl border p-4">
        <h3 className="text-sm font-bold text-slate-900 mb-3">Order Gas Cylinder</h3>
        <div className="grid grid-cols-2 gap-3 mb-3">
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Size</label>
            <select value={size} onChange={e => setSize(e.target.value)}
              className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500">
              <option>6kg</option><option>13kg</option><option>19kg</option><option>47kg</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Type</label>
            <select value={type} onChange={e => setType(e.target.value)}
              className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500">
              <option>Propane</option><option>Butane</option><option>Patio Gas</option>
            </select>
          </div>
        </div>
        <div className="mb-3">
          <label className="block text-xs font-medium text-slate-500 mb-1">Quantity</label>
          <input type="number" min="1" max="4" value={qty} onChange={e => setQty(Number(e.target.value) || 1)}
            className="w-20 px-3 py-2.5 border border-slate-200 rounded-xl text-sm text-center focus:outline-none focus:ring-2 focus:ring-emerald-500" />
        </div>
        <div className="mb-3">
          <label className="block text-xs font-medium text-slate-500 mb-1">Notes (optional)</label>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
            className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm resize-none focus:outline-none focus:ring-2 focus:ring-emerald-500"
            placeholder="Any special requirements..." />
        </div>
        <button onClick={submitOrder} disabled={saving}
          className="w-full py-3 bg-orange-600 text-white rounded-xl text-sm font-bold disabled:opacity-50 hover:bg-orange-500">
          {saving ? 'Submitting...' : 'Submit Gas Order'}
        </button>
      </div>

      {/* Order History */}
      {orders.length > 0 && (
        <div className="bg-white rounded-2xl border overflow-hidden">
          <div className="px-4 py-3 bg-slate-50 border-b">
            <p className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Order History</p>
          </div>
          <div className="divide-y">
            {orders.map(o => (
              <div key={o.id} className="px-4 py-3">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-sm font-medium text-slate-800">{o.quantity}x {o.cylinder_size} {o.cylinder_type}</p>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusColors[o.status] || 'bg-slate-100 text-slate-600'}`}>
                    {o.status}
                  </span>
                </div>
                <p className="text-xs text-slate-400">
                  {new Date(o.requested_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                </p>
                {o.manager_notes && <p className="text-xs text-slate-500 mt-1 italic">{o.manager_notes}</p>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
