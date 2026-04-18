'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

export default function PortalCertificates({ pitch }) {
  const [certs, setCerts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadCerts();
  }, [pitch?.id]);

  async function loadCerts() {
    if (!pitch?.id || !supabase) { setLoading(false); return; }
    try {
      const { data } = await supabase.from('certificates').select('*').eq('pitch_id', pitch.id).order('expiry_date', { ascending: true });
      setCerts(data || []);
    } catch {}
    setLoading(false);
  }

  function statusBadge(cert) {
    if (!cert.expiry_date) return { label: 'No expiry', color: 'bg-slate-100 text-slate-600' };
    const exp = new Date(cert.expiry_date);
    const now = new Date();
    const daysLeft = Math.ceil((exp - now) / (1000 * 60 * 60 * 24));
    if (daysLeft < 0) return { label: 'Expired', color: 'bg-red-100 text-red-700' };
    if (daysLeft < 30) return { label: `${daysLeft}d left`, color: 'bg-amber-100 text-amber-700' };
    return { label: 'Valid', color: 'bg-emerald-100 text-emerald-700' };
  }

  const typeLabels = { gas_safety: 'Gas Safety', electrical: 'Electrical Safety', pat_test: 'PAT Test' };

  if (loading) return <div className="flex justify-center py-16"><div className="animate-spin w-8 h-8 border-2 border-emerald-400 border-t-transparent rounded-full" /></div>;

  return (
    <div className="space-y-3 mt-1">
      {certs.length === 0 ? (
        <div className="bg-white rounded-2xl border p-8 text-center">
          <svg className="w-12 h-12 text-slate-300 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
          <p className="text-sm text-slate-500 font-medium">No certificates uploaded yet</p>
          <p className="text-xs text-slate-400 mt-1">Your site manager will upload certificates for your pitch.</p>
        </div>
      ) : certs.map(c => {
        const badge = statusBadge(c);
        return (
          <div key={c.id} className="bg-white rounded-2xl border p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-bold text-slate-900">{typeLabels[c.type] || c.type}</p>
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${badge.color}`}>{badge.label}</span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              {c.certificate_number && (
                <div><span className="text-slate-400">Cert No:</span> <span className="text-slate-700 font-medium">{c.certificate_number}</span></div>
              )}
              {c.engineer_name && (
                <div><span className="text-slate-400">Engineer:</span> <span className="text-slate-700 font-medium">{c.engineer_name}</span></div>
              )}
              {c.issued_date && (
                <div><span className="text-slate-400">Issued:</span> <span className="text-slate-700 font-medium">{new Date(c.issued_date).toLocaleDateString('en-GB')}</span></div>
              )}
              {c.expiry_date && (
                <div><span className="text-slate-400">Expires:</span> <span className="text-slate-700 font-medium">{new Date(c.expiry_date).toLocaleDateString('en-GB')}</span></div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
