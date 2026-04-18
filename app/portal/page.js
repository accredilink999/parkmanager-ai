'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import OnboardingModal from '../components/portal/OnboardingModal';
import PortalProfile from '../components/portal/PortalProfile';
import PortalFinancials from '../components/portal/PortalFinancials';
import PortalCertificates from '../components/portal/PortalCertificates';
import PortalGasOrder from '../components/portal/PortalGasOrder';
import PortalSiteReport from '../components/portal/PortalSiteReport';
import PortalEmergency from '../components/portal/PortalEmergency';

export default function CustomerPortal() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [tab, setTab] = useState('profile');
  const [bills, setBills] = useState([]);
  const [readings, setReadings] = useState([]);
  const [pitch, setPitch] = useState(null);
  const [loading, setLoading] = useState(true);
  const [siteName, setSiteName] = useState('');
  const [sitePhone, setSitePhone] = useState('');
  const [customerProfile, setCustomerProfile] = useState(null);
  const [showOnboarding, setShowOnboarding] = useState(false);

  useEffect(() => {
    const saved = sessionStorage.getItem('pm_user');
    if (!saved) { router.push('/login'); return; }
    const u = JSON.parse(saved);
    setUser(u);
    if (u.org_name) setSiteName(u.org_name);
    loadData(u);
  }, [router]);

  async function loadData(u) {
    setLoading(true);

    if (!supabase) {
      // Demo mode
      setPitch({ id: '1', pitch_number: 'A1', customer_name: u.full_name || 'John Smith', customer_email: u.email, customer_phone: '07700 900000', meter_id: 'M001', status: 'occupied' });
      setBills([
        { id: '1', usage_kwh: 344, unit_rate: 0.34, amount_gbp: 116.96, start_reading: 14890, end_reading: 15234, status: 'unpaid', period_start: '2026-02-01', period_end: '2026-03-01', created_at: '2026-03-01' },
        { id: '2', usage_kwh: 289, unit_rate: 0.34, amount_gbp: 98.26, start_reading: 14601, end_reading: 14890, status: 'paid', period_start: '2026-01-01', period_end: '2026-02-01', paid_at: '2026-02-05', created_at: '2026-02-01' },
      ]);
      setReadings([
        { id: '1', reading: 15234, previous_reading: 14890, usage_kwh: 344, read_at: '2026-03-01T09:15:00' },
        { id: '2', reading: 14890, previous_reading: 14601, usage_kwh: 289, read_at: '2026-02-01T10:30:00' },
      ]);
      setCustomerProfile({ lead_occupier_name: u.full_name, email: u.email, phone: '07700 900000', home_address: '123 Main St', other_occupants: [{ name: 'Jane Smith', relationship: 'Spouse' }], emergency_contact_name: 'Bob Smith', emergency_contact_phone: '07700 111111', emergency_contact_relationship: 'Parent', onboarding_complete: true });
      setLoading(false);
      loadSettings();
      return;
    }

    try {
      // Get pitch
      const { data: pitches } = await supabase.from('pitches').select('*').eq('customer_email', u.email).limit(1);
      const myPitch = pitches?.[0] || null;
      setPitch(myPitch);

      // Load bills + readings
      if (myPitch) {
        const [billRes, readingRes] = await Promise.all([
          supabase.from('bills').select('*').eq('pitch_id', myPitch.id).order('created_at', { ascending: false }),
          supabase.from('meter_readings').select('*').eq('pitch_id', myPitch.id).order('read_at', { ascending: false }),
        ]);
        setBills(billRes.data || []);
        setReadings(readingRes.data || []);
      }

      // Load customer profile via API (bypasses RLS)
      try {
        const profRes = await fetch(`/api/customer-profile?user_id=${u.id}`);
        const profData = await profRes.json();
        if (profData.profile) {
          setCustomerProfile(profData.profile);
          if (!profData.profile.onboarding_complete) {
            setShowOnboarding(true);
          }
        } else {
          setShowOnboarding(true);
        }
      } catch {
        setShowOnboarding(true);
      }
    } catch (err) {
      console.error('Portal load error:', err);
    }

    loadSettings();
    setLoading(false);
  }

  function loadSettings() {
    try {
      const saved = localStorage.getItem('pm_settings');
      if (saved) {
        JSON.parse(saved).forEach(s => {
          if (s.key === 'site_name' && s.value) setSiteName(s.value);
          if (s.key === 'site_phone' && s.value) setSitePhone(s.value);
        });
      }
    } catch {}
    if (supabase) {
      supabase.from('site_settings').select('*').in('key', ['site_name', 'site_phone']).then(({ data }) => {
        (data || []).forEach(s => {
          if (s.key === 'site_name' && s.value) setSiteName(s.value);
          if (s.key === 'site_phone' && s.value) setSitePhone(s.value);
        });
      });
    }
  }

  function logout() {
    sessionStorage.removeItem('pm_user');
    if (supabase) supabase.auth.signOut();
    router.push('/login');
  }

  async function downloadBillPDF(bill) {
    const { default: jsPDF } = await import('jspdf');
    const doc = new jsPDF();

    doc.setFontSize(20);
    doc.setTextColor(5, 150, 105);
    doc.text('Electricity Bill', 14, 22);
    doc.setFontSize(11);
    doc.setTextColor(100);
    doc.text(siteName, 14, 30);
    doc.setFontSize(9);
    doc.text(new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }), 196, 22, { align: 'right' });

    doc.setDrawColor(5, 150, 105);
    doc.setLineWidth(0.8);
    doc.line(14, 34, 196, 34);

    let y = 44;
    doc.setFontSize(10);
    doc.setTextColor(0);
    [
      ['Pitch', pitch?.pitch_number || '\u2014'],
      ['Customer', pitch?.customer_name || user?.full_name || '\u2014'],
      ['Period', `${bill.period_start ? new Date(bill.period_start).toLocaleDateString('en-GB') : '\u2014'} to ${bill.period_end ? new Date(bill.period_end).toLocaleDateString('en-GB') : '\u2014'}`],
    ].forEach(([label, val]) => {
      doc.setFont(undefined, 'bold'); doc.text(label, 14, y);
      doc.setFont(undefined, 'normal'); doc.text(val, 60, y);
      y += 7;
    });

    y += 6;
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(14, y - 4, 182, 30, 3, 3, 'FD');
    doc.setFontSize(11); doc.setFont(undefined, 'bold');
    doc.text('Meter Readings', 18, y + 4);
    y += 12; doc.setFontSize(9); doc.setFont(undefined, 'normal');
    doc.text('Start Reading', 20, y);
    doc.setFont(undefined, 'bold');
    doc.text(Number(bill.start_reading || 0).toLocaleString(), 170, y, { align: 'right' });
    y += 7; doc.setFont(undefined, 'normal');
    doc.text('End Reading', 20, y);
    doc.setFont(undefined, 'bold');
    doc.text(Number(bill.end_reading || 0).toLocaleString(), 170, y, { align: 'right' });

    y += 14;
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(14, y - 4, 182, 36, 3, 3, 'FD');
    doc.setFontSize(11); doc.setFont(undefined, 'bold');
    doc.text('Cost', 18, y + 4);
    y += 12; doc.setFontSize(9); doc.setFont(undefined, 'normal');
    doc.text('Usage', 20, y);
    doc.text(`${Number(bill.usage_kwh).toLocaleString()} kWh`, 170, y, { align: 'right' });
    y += 7;
    doc.text('Unit Rate', 20, y);
    doc.text(`\u00A3${Number(bill.unit_rate).toFixed(2)} per kWh`, 170, y, { align: 'right' });
    y += 9;
    doc.setDrawColor(226, 232, 240);
    doc.line(18, y - 4, 192, y - 4);
    doc.setFontSize(12); doc.setFont(undefined, 'bold');
    doc.text('Total Amount', 20, y);
    doc.setTextColor(5, 150, 105); doc.setFontSize(16);
    doc.text(`\u00A3${Number(bill.amount_gbp).toFixed(2)}`, 170, y, { align: 'right' });

    y += 16;
    if (bill.status === 'paid') {
      doc.setTextColor(5, 150, 105); doc.setFontSize(24); doc.setFont(undefined, 'bold');
      doc.text('PAID', 105, y + 4, { align: 'center' });
      doc.setDrawColor(5, 150, 105); doc.setLineWidth(1);
      doc.roundedRect(75, y - 8, 60, 18, 3, 3, 'S');
    } else {
      doc.setFillColor(254, 242, 242); doc.setDrawColor(254, 202, 202);
      doc.roundedRect(50, y - 6, 110, 20, 3, 3, 'FD');
      doc.setTextColor(220, 38, 38); doc.setFontSize(14); doc.setFont(undefined, 'bold');
      doc.text('PAYMENT OUTSTANDING', 105, y + 3, { align: 'center' });
      doc.setFontSize(8); doc.setFont(undefined, 'normal');
      doc.text('Please contact the site office to arrange payment.', 105, y + 10, { align: 'center' });
    }

    doc.setFontSize(7); doc.setTextColor(150);
    doc.text(`Generated by ${siteName} \u2014 ParkManagerAI`, 105, 285, { align: 'center' });
    doc.save(`Bill-${pitch?.pitch_number || 'Unknown'}-${bill.period_end || 'period'}.pdf`);
  }

  function handleOnboardingComplete(profile) {
    setCustomerProfile(profile);
    setShowOnboarding(false);
  }

  if (!user) return null;

  const tabs = [
    { key: 'profile', label: 'Profile', color: 'emerald', activeBg: 'bg-emerald-100', activeText: 'text-emerald-700', inactiveText: 'text-emerald-400', icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
    )},
    { key: 'financials', label: 'Bills', color: 'blue', activeBg: 'bg-blue-100', activeText: 'text-blue-700', inactiveText: 'text-blue-400', icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
    )},
    { key: 'certificates', label: 'Certs', color: 'purple', activeBg: 'bg-purple-100', activeText: 'text-purple-700', inactiveText: 'text-purple-400', icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
    )},
    { key: 'gas', label: 'Gas', color: 'amber', activeBg: 'bg-amber-100', activeText: 'text-amber-700', inactiveText: 'text-amber-500', icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.879 16.121A3 3 0 1012.015 11L11 14H9c0 .768.293 1.536.879 2.121z" /></svg>
    )},
    { key: 'report', label: 'Report', color: 'teal', activeBg: 'bg-teal-100', activeText: 'text-teal-700', inactiveText: 'text-teal-400', icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" /></svg>
    )},
    { key: 'emergency', label: 'SOS', color: 'red', activeBg: 'bg-red-100', activeText: 'text-red-700', inactiveText: 'text-red-400', icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" /></svg>
    )},
  ];

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      {/* Onboarding */}
      {showOnboarding && (
        <OnboardingModal user={user} pitch={pitch} siteName={siteName} onComplete={handleOnboardingComplete} />
      )}

      {/* Header */}
      <header className="bg-gradient-to-r from-emerald-600 to-teal-600 text-white px-4 pt-6 pb-5">
        <div className="max-w-lg mx-auto">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <svg className="w-7 h-7 rounded-lg" viewBox="0 0 192 192" xmlns="http://www.w3.org/2000/svg">
                <rect width="192" height="192" rx="38" fill="rgba(255,255,255,0.2)"/>
                <rect x="28" y="62" width="108" height="58" rx="10" fill="white" opacity="0.95"/>
                <path d="M28 72 Q28 52 48 52 L116 52 Q136 52 136 72" fill="white" opacity="0.95"/>
                <circle cx="52" cy="120" r="12" fill="white" opacity="0.9"/>
                <circle cx="52" cy="120" r="6" fill="#059669"/>
                <circle cx="112" cy="120" r="12" fill="white" opacity="0.9"/>
                <circle cx="112" cy="120" r="6" fill="#059669"/>
              </svg>
              <span className="font-bold text-sm opacity-90">{siteName}</span>
            </div>
            <button onClick={logout} className="text-xs text-white/70 hover:text-white transition-colors">Sign Out</button>
          </div>
          <h1 className="text-lg font-bold">
            {customerProfile?.lead_occupier || user.full_name || 'Welcome'}
          </h1>
          {pitch && (
            <p className="text-sm text-white/80 mt-0.5">Pitch {pitch.pitch_number} &middot; {pitch.meter_id || 'No meter'}</p>
          )}
        </div>
      </header>

      {/* Content */}
      <div className="max-w-lg mx-auto px-4 mt-3">
        {/* Emergency button on every page */}
        {sitePhone && !loading && pitch && (
          <a href={`tel:${sitePhone.replace(/\s/g, '')}`}
            className="flex items-center gap-3 bg-red-600 hover:bg-red-700 active:bg-red-800 text-white rounded-xl px-4 py-3 mb-3 transition-colors">
            <svg className="w-6 h-6 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
            <div>
              <p className="text-sm font-bold">Emergency — I Need Help</p>
              <p className="text-[11px] text-white/70">Press for on-site emergency assistance</p>
            </div>
          </a>
        )}

        {loading ? (
          <div className="flex justify-center py-16">
            <div className="animate-spin w-8 h-8 border-2 border-emerald-400 border-t-transparent rounded-full" />
          </div>
        ) : !pitch ? (
          <div className="bg-white rounded-2xl border p-8 text-center mt-4">
            <svg className="w-12 h-12 text-slate-300 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
            <p className="text-sm text-slate-500">No pitch assigned to your account yet.</p>
            <p className="text-xs text-slate-400 mt-1">Contact the site office to get set up.</p>
            {sitePhone && <p className="text-xs text-emerald-600 mt-2 font-medium">Tel: {sitePhone}</p>}
          </div>
        ) : (
          <>
            {tab === 'profile' && (
              <PortalProfile user={user} pitch={pitch} customerProfile={customerProfile}
                onUpdate={p => setCustomerProfile(p)} />
            )}
            {tab === 'financials' && (
              <PortalFinancials bills={bills} readings={readings} pitch={pitch} user={user}
                siteName={siteName} sitePhone={sitePhone} downloadBillPDF={downloadBillPDF} />
            )}
            {tab === 'certificates' && (
              <PortalCertificates pitch={pitch} />
            )}
            {tab === 'gas' && (
              <PortalGasOrder user={user} pitch={pitch} />
            )}
            {tab === 'report' && (
              <PortalSiteReport user={user} pitch={pitch} />
            )}
            {tab === 'emergency' && (
              <PortalEmergency siteName={siteName} sitePhone={sitePhone} />
            )}
          </>
        )}
      </div>

      {/* Bottom Tab Bar */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 z-20" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
        <div className="max-w-lg mx-auto flex gap-0.5 px-1 py-1.5">
          {tabs.map(t => {
            const isActive = tab === t.key;
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`flex-1 flex flex-col items-center py-1.5 rounded-xl transition-all ${
                  isActive
                    ? `${t.activeBg} ${t.activeText} font-bold`
                    : `${t.inactiveText}`
                }`}
              >
                {t.icon}
                <span className="text-[10px] font-medium mt-0.5">{t.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
