'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

export default function CustomersPage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showInvite, setShowInvite] = useState(false);
  const [inviteForm, setInviteForm] = useState({ name: '', email: '', role: 'customer', pitch: '' });
  const [sending, setSending] = useState(false);
  const [toast, setToast] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState(null); // { customer, billCount, readingCount, gasCount }
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem('pm_user');
    if (!saved) { router.push('/login'); return; }
    setUser(JSON.parse(saved));
    loadCustomers();
  }, [router]);

  async function loadCustomers() {
    setLoading(true);
    if (!supabase) {
      // Demo fallback
      setCustomers([
        { id: '1', customer_name: 'John Smith', customer_email: 'john@example.com', pitch_number: 'A1', status: 'occupied', bills: 3, outstanding: 1 },
        { id: '2', customer_name: 'Jane Doe', customer_email: 'jane@example.com', pitch_number: 'A2', status: 'occupied', bills: 5, outstanding: 0 },
        { id: '3', customer_name: 'Bob Williams', customer_email: 'bob@example.com', pitch_number: 'B1', status: 'occupied', bills: 2, outstanding: 2 },
        { id: '4', customer_name: 'Sarah Johnson', customer_email: 'sarah@example.com', pitch_number: 'B3', status: 'occupied', bills: 4, outstanding: 1 },
      ]);
      setLoading(false);
      return;
    }

    try {
      // Load occupied pitches (customers)
      const { data: pitches } = await supabase
        .from('pitches')
        .select('*')
        .not('customer_name', 'is', null)
        .order('pitch_number');

      // Load all bills to get counts per pitch
      const { data: bills } = await supabase.from('bills').select('id, pitch_id, status');

      const billMap = {};
      (bills || []).forEach(b => {
        if (!billMap[b.pitch_id]) billMap[b.pitch_id] = { total: 0, outstanding: 0 };
        billMap[b.pitch_id].total++;
        if (b.status === 'unpaid' || b.status === 'overdue') billMap[b.pitch_id].outstanding++;
      });

      const enriched = (pitches || []).map(p => ({
        ...p,
        bills: billMap[p.id]?.total || 0,
        outstanding: billMap[p.id]?.outstanding || 0,
      }));

      setCustomers(enriched);
    } catch (err) {
      setToast('Error loading customers: ' + err.message);
      setTimeout(() => setToast(''), 4000);
    }
    setLoading(false);
  }

  async function prepareDelete(customer) {
    if (!supabase) {
      // Demo mode — just show simple confirm
      setDeleteConfirm({ customer, billCount: customer.bills || 0, readingCount: 0, gasCount: 0 });
      return;
    }

    try {
      // Count related records
      const [billRes, readingRes, gasRes] = await Promise.all([
        supabase.from('bills').select('id', { count: 'exact', head: true }).eq('pitch_id', customer.id),
        supabase.from('meter_readings').select('id', { count: 'exact', head: true }).eq('pitch_id', customer.id),
        supabase.from('gas_cylinders').select('id', { count: 'exact', head: true }).eq('location_pitch_id', customer.id),
      ]);

      setDeleteConfirm({
        customer,
        billCount: billRes.count || 0,
        readingCount: readingRes.count || 0,
        gasCount: gasRes.count || 0,
      });
    } catch (err) {
      setToast('Error: ' + err.message);
      setTimeout(() => setToast(''), 4000);
    }
  }

  async function confirmDelete() {
    if (!deleteConfirm) return;
    setDeleting(true);
    const { customer } = deleteConfirm;

    if (!supabase) {
      // Demo mode
      setCustomers(prev => prev.filter(c => c.id !== customer.id));
      setDeleteConfirm(null);
      setDeleting(false);
      setToast(`${customer.customer_name} removed`);
      setTimeout(() => setToast(''), 3000);
      return;
    }

    try {
      // Cascade delete: bills -> readings -> unassign gas -> delete pitch
      await supabase.from('bills').delete().eq('pitch_id', customer.id);
      await supabase.from('meter_readings').delete().eq('pitch_id', customer.id);
      // Unassign gas cylinders (don't delete them, just clear the location)
      await supabase.from('gas_cylinders')
        .update({ location_pitch_id: null, status: 'in_stock' })
        .eq('location_pitch_id', customer.id);
      // Delete the pitch record
      await supabase.from('pitches').delete().eq('id', customer.id);

      setToast(`${customer.customer_name} and all records removed`);
      setTimeout(() => setToast(''), 3000);
      setDeleteConfirm(null);
      loadCustomers();
    } catch (err) {
      setToast('Delete error: ' + err.message);
      setTimeout(() => setToast(''), 4000);
    }
    setDeleting(false);
  }

  async function sendInvite(e) {
    e.preventDefault();
    setSending(true);
    try {
      const res = await fetch('/api/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(inviteForm),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setToast(data.message || `Invite sent to ${inviteForm.email}`);
      setShowInvite(false);
      setInviteForm({ name: '', email: '', role: 'customer', pitch: '' });
    } catch (err) {
      setToast('Error: ' + err.message);
    }
    setSending(false);
    setTimeout(() => setToast(''), 4000);
  }

  if (!user) return null;

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 px-4 py-3 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/dashboard" className="text-slate-400 hover:text-slate-700 text-sm">&larr; Dashboard</Link>
            <h1 className="text-lg font-bold text-slate-900">Customer Accounts</h1>
            {!loading && <span className="text-xs text-slate-400">({customers.length})</span>}
          </div>
          <button
            onClick={() => setShowInvite(true)}
            className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-500 transition-colors flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
            Invite User
          </button>
        </div>
      </header>

      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-2 rounded-lg shadow-lg text-sm text-white ${toast.startsWith('Error') || toast.startsWith('Delete error') ? 'bg-red-600' : 'bg-emerald-600'}`}>
          {toast}
        </div>
      )}

      <div className="max-w-7xl mx-auto p-4">
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin w-8 h-8 border-2 border-teal-400 border-t-transparent rounded-full" />
          </div>
        ) : customers.length === 0 ? (
          <div className="bg-white rounded-xl border p-8 text-center">
            <p className="text-sm text-slate-400">No customers yet. Add pitches with customer details or send an invite.</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border overflow-hidden">
            <table className="w-full">
              <thead className="bg-slate-50 border-b">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500">Name</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 hidden sm:table-cell">Email</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500">Pitch</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 hidden md:table-cell">Status</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500">Bills</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500">Outstanding</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {customers.map(c => (
                  <tr key={c.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <p className="text-sm font-semibold text-slate-900">{c.customer_name}</p>
                      <p className="text-xs text-slate-400 sm:hidden">{c.customer_email}</p>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600 hidden sm:table-cell">{c.customer_email || '—'}</td>
                    <td className="px-4 py-3 text-sm">
                      <span className="px-2 py-0.5 bg-teal-100 text-teal-700 rounded-full text-xs font-medium">{c.pitch_number}</span>
                    </td>
                    <td className="px-4 py-3 text-sm hidden md:table-cell">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        c.status === 'occupied' ? 'bg-green-100 text-green-700' :
                        c.status === 'maintenance' ? 'bg-amber-100 text-amber-700' :
                        'bg-slate-100 text-slate-600'
                      }`}>
                        {c.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-right">{c.bills}</td>
                    <td className="px-4 py-3 text-sm text-right">
                      {c.outstanding > 0 ? (
                        <span className="text-red-600 font-medium">{c.outstanding}</span>
                      ) : (
                        <span className="text-green-600">None</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => prepareDelete(c)}
                        className="text-xs text-red-500 hover:text-red-700 font-medium"
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="px-6 py-4 border-b">
              <h2 className="text-lg font-bold text-slate-900">Remove Customer</h2>
            </div>

            <div className="p-6 space-y-4">
              <p className="text-sm text-slate-700">
                Are you sure you want to remove <strong>{deleteConfirm.customer.customer_name}</strong> (Pitch {deleteConfirm.customer.pitch_number})?
              </p>

              <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                <p className="text-xs text-red-800 font-medium mb-2">This will permanently delete:</p>
                <ul className="text-xs text-red-700 space-y-1">
                  <li>- The pitch record and customer details</li>
                  {deleteConfirm.billCount > 0 && (
                    <li>- {deleteConfirm.billCount} bill{deleteConfirm.billCount !== 1 ? 's' : ''}</li>
                  )}
                  {deleteConfirm.readingCount > 0 && (
                    <li>- {deleteConfirm.readingCount} meter reading{deleteConfirm.readingCount !== 1 ? 's' : ''}</li>
                  )}
                  {deleteConfirm.gasCount > 0 && (
                    <li>- {deleteConfirm.gasCount} gas cylinder{deleteConfirm.gasCount !== 1 ? 's' : ''} will be unassigned</li>
                  )}
                  {deleteConfirm.billCount === 0 && deleteConfirm.readingCount === 0 && deleteConfirm.gasCount === 0 && (
                    <li>- No associated records found</li>
                  )}
                </ul>
              </div>

              {deleteConfirm.customer.outstanding > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                  <p className="text-xs text-amber-800 font-medium">
                    Warning: This customer has {deleteConfirm.customer.outstanding} outstanding bill{deleteConfirm.customer.outstanding !== 1 ? 's' : ''}. These will be deleted too.
                  </p>
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  onClick={confirmDelete}
                  disabled={deleting}
                  className="flex-1 py-3 bg-red-600 text-white rounded-xl font-semibold text-sm hover:bg-red-500 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {deleting ? (
                    <>
                      <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Removing...
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                      Remove Customer & All Records
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setDeleteConfirm(null)}
                  disabled={deleting}
                  className="px-6 py-3 border border-slate-200 text-slate-600 rounded-xl text-sm hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Invite Modal */}
      {showInvite && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="px-6 py-4 border-b flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900">Invite User</h2>
              <button onClick={() => setShowInvite(false)} className="text-slate-400 hover:text-slate-600">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={sendInvite} className="p-6 space-y-4">
              <p className="text-sm text-slate-500">
                Send an email invite with login details and a link to install the ParkManagerAI app.
              </p>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Full Name</label>
                <input
                  value={inviteForm.name}
                  onChange={e => setInviteForm({ ...inviteForm, name: e.target.value })}
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  placeholder="John Smith"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Email Address</label>
                <input
                  type="email"
                  value={inviteForm.email}
                  onChange={e => setInviteForm({ ...inviteForm, email: e.target.value })}
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  placeholder="john@example.com"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Role</label>
                  <select
                    value={inviteForm.role}
                    onChange={e => setInviteForm({ ...inviteForm, role: e.target.value })}
                    className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
                  >
                    <option value="customer">Customer</option>
                    <option value="admin">Staff / Admin</option>
                    <option value="accounts">Accounts (Billing)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Pitch (optional)</label>
                  <input
                    value={inviteForm.pitch}
                    onChange={e => setInviteForm({ ...inviteForm, pitch: e.target.value })}
                    className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    placeholder="e.g. A1"
                  />
                </div>
              </div>

              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
                <p className="text-xs text-emerald-800 font-medium mb-1">What the invite includes:</p>
                <ul className="text-xs text-emerald-700 space-y-1">
                  <li>- Login credentials (auto-generated password)</li>
                  <li>- Direct link to ParkManagerAI</li>
                  <li>- Instructions to install the PWA on their phone</li>
                </ul>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="submit"
                  disabled={sending}
                  className="flex-1 py-3 bg-emerald-600 text-white rounded-xl font-semibold text-sm hover:bg-emerald-500 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {sending ? (
                    <>
                      <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Sending...
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                      </svg>
                      Send Invite
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setShowInvite(false)}
                  className="px-6 py-3 border border-slate-200 text-slate-600 rounded-xl text-sm hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
