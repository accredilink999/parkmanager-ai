'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

export default function Dashboard() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [stats, setStats] = useState({ pitches: 0, outstanding: 0, revenue: 0, readings: 0 });
  const [loading, setLoading] = useState(true);
  const [siteName, setSiteName] = useState('ParkManagerAI');
  const [siteAddress, setSiteAddress] = useState('');
  const [siteLogo, setSiteLogo] = useState('');

  useEffect(() => {
    const saved = sessionStorage.getItem('pm_user');
    if (!saved) { router.push('/login'); return; }
    const u = JSON.parse(saved);
    if (u.role === 'customer') { router.push('/portal'); return; }
    setUser(u);
    loadStats();
    loadBranding();
  }, [router]);

  function loadBranding() {
    // Load from localStorage (demo) or could load from supabase
    try {
      const saved = localStorage.getItem('pm_settings');
      if (saved) {
        JSON.parse(saved).forEach(s => {
          if (s.key === 'site_name' && s.value) setSiteName(s.value);
          if (s.key === 'site_address' && s.value) setSiteAddress(s.value);
          if (s.key === 'site_logo' && s.value) setSiteLogo(s.value);
        });
      }
    } catch {}

    // Also load from supabase if available
    if (supabase) {
      supabase.from('site_settings').select('*').in('key', ['site_name', 'site_address', 'site_logo']).then(({ data }) => {
        (data || []).forEach(s => {
          if (s.key === 'site_name' && s.value) setSiteName(s.value);
          if (s.key === 'site_address' && s.value) setSiteAddress(s.value);
          if (s.key === 'site_logo' && s.value) setSiteLogo(s.value);
        });
      });
    }
  }

  async function loadStats() {
    if (!supabase) {
      setStats({ pitches: 24, outstanding: 8, revenue: 1847.50, readings: 42 });
      setLoading(false);
      return;
    }
    try {
      const [pitchRes, billRes, readingRes] = await Promise.all([
        supabase.from('pitches').select('id', { count: 'exact', head: true }),
        supabase.from('bills').select('amount_gbp, status'),
        supabase.from('meter_readings').select('id', { count: 'exact', head: true }),
      ]);
      const bills = billRes.data || [];
      const outstanding = bills.filter(b => b.status === 'unpaid').length;
      const revenue = bills.filter(b => b.status === 'paid').reduce((sum, b) => sum + Number(b.amount_gbp || 0), 0);
      setStats({
        pitches: pitchRes.count || 0,
        outstanding,
        revenue,
        readings: readingRes.count || 0,
      });
    } catch (err) {
      console.error('Stats error:', err);
    }
    setLoading(false);
  }

  function logout() {
    sessionStorage.removeItem('pm_user');
    if (supabase) supabase.auth.signOut();
    router.push('/login');
  }

  if (!user) return null;

  const sections = [
    {
      heading: 'Electric',
      icon: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>,
      tiles: [
        { label: 'Scan Meter', desc: 'QR scan & record readings', icon: (
          <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" /></svg>
        ), href: '/dashboard/readings', from: 'from-emerald-500', to: 'to-green-400' },
        { label: 'Generate Bill', desc: 'Create & send invoices', icon: (
          <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2z" /></svg>
        ), href: '/dashboard/bills', from: 'from-blue-500', to: 'to-sky-400' },
        { label: 'Reports', desc: 'Usage & financial reports', icon: (
          <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
        ), href: '/dashboard/reports', from: 'from-purple-500', to: 'to-violet-400' },
      ],
    },
    {
      heading: 'Gas',
      icon: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.879 16.121A3 3 0 1012.015 11L11 14H9c0 .768.293 1.536.879 2.121z" /></svg>,
      tiles: [
        { label: 'Manage Gas', desc: 'Scan in, out & deliveries', icon: (
          <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.879 16.121A3 3 0 1012.015 11L11 14H9c0 .768.293 1.536.879 2.121z" /></svg>
        ), href: '/dashboard/gas', from: 'from-orange-500', to: 'to-red-400' },
        { label: 'Gas Inventory', desc: 'Full cylinder register', icon: (
          <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>
        ), href: '/dashboard/gas?tab=inventory', from: 'from-amber-500', to: 'to-yellow-400' },
        { label: 'On-Site Register', desc: 'Fire compliance register', icon: (
          <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" /></svg>
        ), href: '/dashboard/gas?tab=onsite', from: 'from-red-500', to: 'to-rose-400' },
      ],
    },
    {
      heading: 'Admin',
      icon: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>,
      tiles: [
        { label: 'Customers', desc: 'Manage customer accounts', icon: (
          <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
        ), href: '/dashboard/customers', from: 'from-slate-600', to: 'to-slate-500' },
        { label: 'Pitch List', desc: 'All caravan pitches', icon: (
          <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
        ), href: '/dashboard/pitches', from: 'from-teal-500', to: 'to-cyan-400' },
        { label: 'Settings', desc: 'Site config & branding', icon: (
          <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
        ), href: '/dashboard/settings', from: 'from-gray-500', to: 'to-gray-400' },
      ],
    },
  ];

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-4 py-3 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            {siteLogo ? (
              <img src={siteLogo} alt="Logo" className="w-9 h-9 object-contain rounded-lg" />
            ) : (
              <svg className="w-9 h-9 rounded-lg" viewBox="0 0 192 192" xmlns="http://www.w3.org/2000/svg">
                <defs><linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor="#059669"/><stop offset="100%" stopColor="#0d9488"/></linearGradient></defs>
                <rect width="192" height="192" rx="38" fill="url(#bg)"/>
                <rect x="28" y="62" width="108" height="58" rx="10" fill="white" opacity="0.95"/>
                <path d="M28 72 Q28 52 48 52 L116 52 Q136 52 136 72" fill="white" opacity="0.95"/>
                <rect x="42" y="60" width="28" height="22" rx="4" fill="#059669" opacity="0.6"/>
                <rect x="78" y="60" width="28" height="22" rx="4" fill="#059669" opacity="0.6"/>
                <rect x="114" y="72" width="16" height="28" rx="3" fill="#059669" opacity="0.5"/>
                <circle cx="117" cy="86" r="2" fill="white" opacity="0.8"/>
                <line x1="136" y1="100" x2="164" y2="100" stroke="white" strokeWidth="4" strokeLinecap="round" opacity="0.9"/>
                <circle cx="52" cy="120" r="12" fill="white" opacity="0.9"/>
                <circle cx="52" cy="120" r="6" fill="#059669"/>
                <circle cx="112" cy="120" r="12" fill="white" opacity="0.9"/>
                <circle cx="112" cy="120" r="6" fill="#059669"/>
                <line x1="20" y1="132" x2="172" y2="132" stroke="white" strokeWidth="2" opacity="0.4"/>
              </svg>
            )}
            <div>
              <h1 className="text-lg font-bold text-slate-900 leading-tight">{siteName}</h1>
              {siteAddress ? (
                <p className="text-xs text-slate-500 leading-tight">{siteAddress.split('\n').join(', ')}</p>
              ) : (
                <p className="text-xs text-slate-500">Welcome, {user.full_name}</p>
              )}
            </div>
          </div>
          <button
            onClick={logout}
            className="px-3 py-2 text-sm text-slate-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors flex items-center gap-1.5 flex-shrink-0"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            <span className="hidden sm:inline">Sign Out</span>
          </button>
        </div>
      </header>

      <div className="max-w-7xl mx-auto p-4 space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: 'Total Pitches', value: loading ? '...' : stats.pitches, color: 'text-emerald-600', bg: 'bg-emerald-50' },
            { label: 'Outstanding Bills', value: loading ? '...' : stats.outstanding, color: 'text-red-600', bg: 'bg-red-50' },
            { label: 'Revenue This Month', value: loading ? '...' : `£${stats.revenue.toFixed(2)}`, color: 'text-blue-600', bg: 'bg-blue-50' },
            { label: 'Readings This Month', value: loading ? '...' : stats.readings, color: 'text-purple-600', bg: 'bg-purple-50' },
          ].map((s) => (
            <div key={s.label} className="bg-white rounded-xl border border-slate-200 p-4">
              <p className="text-xs font-medium text-slate-500 mb-1">{s.label}</p>
              <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
            </div>
          ))}
        </div>

        {/* Sectioned Tiles */}
        {sections.map((section) => (
          <div key={section.heading}>
            <div className="flex items-center gap-2 mb-3">
              <div className="text-slate-500">{section.icon}</div>
              <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wider">{section.heading}</h2>
              <div className="flex-1 h-px bg-slate-200" />
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
              {section.tiles.map((tile) => (
                <Link
                  key={tile.label}
                  href={tile.href}
                  className={`bg-gradient-to-br ${tile.from} ${tile.to} rounded-2xl p-6 text-white hover:shadow-xl hover:scale-[1.02] transition-all group`}
                >
                  <div className="bg-white/20 w-14 h-14 rounded-xl flex items-center justify-center mb-4 group-hover:bg-white/30 transition-colors">
                    {tile.icon}
                  </div>
                  <h3 className="text-lg font-bold mb-1">{tile.label}</h3>
                  <p className="text-sm text-white/80">{tile.desc}</p>
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
