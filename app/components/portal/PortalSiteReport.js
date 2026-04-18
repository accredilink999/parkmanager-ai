'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

export default function PortalSiteReport({ user, pitch }) {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState('');
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);

  // Form
  const [category, setCategory] = useState('general');
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [urgency, setUrgency] = useState('normal');

  useEffect(() => { loadReports(); }, []);

  async function loadReports() {
    if (!supabase) { setLoading(false); return; }
    try {
      const { data } = await supabase.from('site_reports').select('*').eq('user_id', user.id).order('created_at', { ascending: false });
      setReports(data || []);
    } catch {}
    setLoading(false);
  }

  async function submitReport() {
    if (!subject.trim() || !description.trim()) return;
    setSaving(true);
    try {
      const { error } = await supabase.from('site_reports').insert({
        user_id: user.id,
        pitch_id: pitch?.id || null,
        org_id: user.org_id,
        category,
        subject: subject.trim(),
        description: description.trim(),
        urgency,
      });
      if (error) throw error;
      setSubject('');
      setDescription('');
      setCategory('general');
      setUrgency('normal');
      setShowForm(false);
      setToast('Report submitted! The site team will review it shortly.');
      setTimeout(() => setToast(''), 4000);
      loadReports();
    } catch (err) {
      console.error('Report error:', err);
      setToast('Failed to submit report — try again');
      setTimeout(() => setToast(''), 3000);
    }
    setSaving(false);
  }

  const statusColors = { open: 'bg-amber-100 text-amber-700', in_progress: 'bg-blue-100 text-blue-700', resolved: 'bg-emerald-100 text-emerald-700', closed: 'bg-slate-100 text-slate-600' };
  const urgencyColors = { low: 'text-slate-400', normal: 'text-amber-500', urgent: 'text-red-500' };
  const categories = ['general', 'maintenance', 'noise', 'safety', 'drainage', 'electrical', 'other'];

  if (loading) return <div className="flex justify-center py-16"><div className="animate-spin w-8 h-8 border-2 border-emerald-400 border-t-transparent rounded-full" /></div>;

  return (
    <div className="space-y-3 mt-1">
      {toast && <div className="bg-emerald-600 text-white text-center py-2 rounded-xl text-sm font-medium">{toast}</div>}

      {/* New Report Button / Form */}
      {!showForm ? (
        <button onClick={() => setShowForm(true)}
          className="w-full py-4 bg-teal-600 text-white rounded-2xl text-sm font-bold hover:bg-teal-500 flex items-center justify-center gap-2">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
          Make a Site Report
        </button>
      ) : (
        <div className="bg-white rounded-2xl border p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900">New Report</h3>
            <button onClick={() => setShowForm(false)} className="text-xs text-slate-400 hover:text-slate-600">Cancel</button>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Category</label>
            <select value={category} onChange={e => setCategory(e.target.value)}
              className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm capitalize focus:outline-none focus:ring-2 focus:ring-teal-500">
              {categories.map(c => <option key={c} value={c} className="capitalize">{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Subject *</label>
            <input type="text" value={subject} onChange={e => setSubject(e.target.value)}
              className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              placeholder="Brief summary of the issue" />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Description *</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} rows={4}
              className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm resize-none focus:outline-none focus:ring-2 focus:ring-teal-500"
              placeholder="Describe the issue in detail..." />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Urgency</label>
            <div className="flex gap-2">
              {['low', 'normal', 'urgent'].map(u => (
                <button key={u} onClick={() => setUrgency(u)}
                  className={`flex-1 py-2 rounded-xl text-sm font-medium border transition-colors capitalize ${
                    urgency === u
                      ? u === 'urgent' ? 'bg-red-600 text-white border-red-600' : u === 'normal' ? 'bg-amber-500 text-white border-amber-500' : 'bg-slate-600 text-white border-slate-600'
                      : 'border-slate-200 text-slate-500'
                  }`}>
                  {u}
                </button>
              ))}
            </div>
          </div>

          <button onClick={submitReport} disabled={saving || !subject.trim() || !description.trim()}
            className="w-full py-3 bg-teal-600 text-white rounded-xl text-sm font-bold disabled:opacity-50 hover:bg-teal-500">
            {saving ? 'Submitting...' : 'Submit Report'}
          </button>
        </div>
      )}

      {/* Report History */}
      {reports.length > 0 ? (
        <div className="bg-white rounded-2xl border overflow-hidden">
          <div className="px-4 py-3 bg-slate-50 border-b">
            <p className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Your Reports</p>
          </div>
          <div className="divide-y">
            {reports.map(r => (
              <div key={r.id} className="px-4 py-3">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-sm font-medium text-slate-800">{r.subject}</p>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusColors[r.status] || 'bg-slate-100 text-slate-600'}`}>
                    {r.status?.replace('_', ' ')}
                  </span>
                </div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs text-slate-400 capitalize">{r.category}</span>
                  <span className="text-xs text-slate-300">&middot;</span>
                  <span className={`text-xs font-medium capitalize ${urgencyColors[r.urgency] || 'text-slate-400'}`}>{r.urgency}</span>
                  <span className="text-xs text-slate-300">&middot;</span>
                  <span className="text-xs text-slate-400">{new Date(r.created_at).toLocaleDateString('en-GB')}</span>
                </div>
                <p className="text-xs text-slate-500 line-clamp-2">{r.description}</p>
                {r.manager_response && (
                  <div className="mt-2 bg-emerald-50 border border-emerald-100 rounded-lg p-2">
                    <p className="text-xs text-emerald-700 font-medium">Site Response:</p>
                    <p className="text-xs text-emerald-600">{r.manager_response}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ) : !showForm && (
        <div className="bg-white rounded-2xl border p-6 text-center">
          <p className="text-sm text-slate-400">No reports submitted yet.</p>
        </div>
      )}
    </div>
  );
}
