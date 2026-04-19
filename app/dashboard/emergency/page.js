'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

export default function EmergencyPage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [sitePhone, setSitePhone] = useState('');
  const [siteName, setSiteName] = useState('');
  const [managerName, setManagerName] = useState('');

  useEffect(() => {
    const saved = localStorage.getItem('pm_user');
    if (!saved) { router.push('/login'); return; }
    const u = JSON.parse(saved);
    if (u.role === 'customer') { router.push('/portal'); return; }
    setUser(u);
    loadSettings(u);
  }, [router]);

  function loadSettings(u) {
    try {
      const saved = localStorage.getItem('pm_settings');
      if (saved) {
        JSON.parse(saved).forEach(s => {
          if (s.key === 'site_phone' && s.value) setSitePhone(s.value);
          if (s.key === 'site_name' && s.value) setSiteName(s.value);
        });
      }
    } catch {}
    if (supabase) {
      supabase.from('site_settings').select('*').in('key', ['site_phone', 'site_name']).then(({ data }) => {
        (data || []).forEach(s => {
          if (s.key === 'site_phone' && s.value) setSitePhone(s.value);
          if (s.key === 'site_name' && s.value) setSiteName(s.value);
        });
      });
      // Load site manager name (first admin or super_admin)
      supabase.from('profiles').select('full_name, role')
        .eq('org_id', u.org_id)
        .in('role', ['super_admin', 'admin'])
        .limit(1)
        .then(({ data }) => {
          if (data?.[0]?.full_name) setManagerName(data[0].full_name);
        });
    }
  }

  if (!user) return null;

  const numbers = [
    { label: managerName ? `Site Manager — ${managerName}` : 'Site Manager', number: sitePhone || 'Not set', desc: `Contact ${siteName || 'the site office'}`, color: 'bg-emerald-600', available: !!sitePhone },
    { label: 'Emergency Services', number: '999', desc: 'Police, Fire, Ambulance', color: 'bg-red-600', available: true },
    { label: 'Gas Emergency', number: '0800 111 999', desc: 'National Gas Emergency Service (24hr)', color: 'bg-amber-600', available: true },
    { label: 'NHS Non-Emergency', number: '111', desc: 'Medical advice when not life-threatening', color: 'bg-blue-600', available: true },
    { label: 'Police Non-Emergency', number: '101', desc: 'Report crime or concerns', color: 'bg-indigo-600', available: true },
    { label: 'Electricity Emergency', number: '105', desc: 'Power cuts and electrical emergencies', color: 'bg-purple-600', available: true },
    { label: 'Water Emergency', number: '0800 085 3968', desc: 'Flooding, burst mains, no water', color: 'bg-cyan-600', available: true },
  ];

  return (
    <div className="bg-slate-50 min-h-screen">
      {/* Header */}
      <header className="bg-red-600 text-white px-4 py-3 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto flex items-center gap-3">
          <Link href="/dashboard" className="p-2 hover:bg-red-700 rounded-lg transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
          </Link>
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
          <h1 className="text-lg font-bold">Emergency & SOS</h1>
        </div>
      </header>

      <div className="max-w-2xl mx-auto p-4 space-y-3">
        {/* Emergency Numbers */}
        {numbers.map((n, i) => (
          <div key={i} className="bg-white rounded-2xl border overflow-hidden">
            <div className="px-4 py-4 flex items-center gap-4">
              <div className={`w-12 h-12 ${n.color} rounded-xl flex items-center justify-center flex-shrink-0`}>
                <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-slate-900">{n.label}</p>
                <p className="text-xs text-slate-400">{n.desc}</p>
                <p className="text-lg font-mono font-bold text-slate-800 mt-0.5">{n.number}</p>
              </div>
              {n.available && (
                <a href={`tel:${n.number.replace(/\s/g, '')}`}
                  className={`${n.color} text-white px-5 py-3 rounded-xl text-sm font-bold flex items-center gap-1.5 flex-shrink-0 hover:opacity-90 active:opacity-80 transition-opacity`}>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                  </svg>
                  Call
                </a>
              )}
            </div>
          </div>
        ))}

        {/* Safety Tips */}
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
          <h3 className="text-sm font-bold text-amber-800 mb-2">If you smell gas:</h3>
          <ul className="text-xs text-amber-700 space-y-1.5">
            <li>1. Do NOT use any electrical switches</li>
            <li>2. Open all doors and windows</li>
            <li>3. Turn off the gas supply at the cylinder</li>
            <li>4. Move away from the area</li>
            <li>5. Call the Gas Emergency number: 0800 111 999</li>
          </ul>
        </div>

        <div className="bg-red-50 border border-red-200 rounded-2xl p-4">
          <h3 className="text-sm font-bold text-red-800 mb-2">In case of fire:</h3>
          <ul className="text-xs text-red-700 space-y-1.5">
            <li>1. Get everyone out immediately</li>
            <li>2. Call 999</li>
            <li>3. Go to the fire assembly point</li>
            <li>4. Do NOT go back inside</li>
            <li>5. Alert the site manager when safe to do so</li>
          </ul>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4">
          <h3 className="text-sm font-bold text-blue-800 mb-2">Medical emergency:</h3>
          <ul className="text-xs text-blue-700 space-y-1.5">
            <li>1. Call 999 immediately if life-threatening</li>
            <li>2. Stay calm and follow operator instructions</li>
            <li>3. Do not move the person unless in danger</li>
            <li>4. If trained, begin CPR if the person is unresponsive and not breathing</li>
            <li>5. Locate the nearest first aid kit and defibrillator</li>
          </ul>
        </div>

        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4">
          <h3 className="text-sm font-bold text-slate-700 mb-2">Flooding or severe weather:</h3>
          <ul className="text-xs text-slate-600 space-y-1.5">
            <li>1. Move caravans/vehicles to higher ground if safe</li>
            <li>2. Turn off electricity and gas at the mains</li>
            <li>3. Contact the site office for evacuation guidance</li>
            <li>4. Do NOT walk or drive through floodwater</li>
            <li>5. Check on elderly or vulnerable residents</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
