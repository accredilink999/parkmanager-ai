'use client';
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

export default function SettingsPage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [unitRate, setUnitRate] = useState('0.34');
  const [siteName, setSiteName] = useState('Park Manager AI');
  const [siteAddress, setSiteAddress] = useState('');
  const [siteLogo, setSiteLogo] = useState(''); // base64 data URL
  const [hoName, setHoName] = useState('');
  const [hoAddress, setHoAddress] = useState('');
  const [hoEmail, setHoEmail] = useState('');
  const [hoPhone, setHoPhone] = useState('');
  const [hoContact, setHoContact] = useState('');
  const [monthEndDay, setMonthEndDay] = useState('last');
  const [reportGenDay, setReportGenDay] = useState('1');
  const [managerEmail, setManagerEmail] = useState('');
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');
  const fileInputRef = useRef(null);

  useEffect(() => {
    const saved = sessionStorage.getItem('pm_user');
    if (!saved) { router.push('/login'); return; }
    const u = JSON.parse(saved);
    if (u.role !== 'super_admin') { router.push('/dashboard'); return; }
    setUser(u);
    loadSettings();
  }, [router]);

  function applySettings(entries) {
    entries.forEach(s => {
      if (s.key === 'electricity_unit_rate') setUnitRate(s.value);
      if (s.key === 'site_name') setSiteName(s.value);
      if (s.key === 'site_address') setSiteAddress(s.value);
      if (s.key === 'site_logo') setSiteLogo(s.value);
      if (s.key === 'ho_name') setHoName(s.value);
      if (s.key === 'ho_address') setHoAddress(s.value);
      if (s.key === 'ho_email') setHoEmail(s.value);
      if (s.key === 'ho_phone') setHoPhone(s.value);
      if (s.key === 'ho_contact') setHoContact(s.value);
      if (s.key === 'month_end_day') setMonthEndDay(s.value);
      if (s.key === 'report_gen_day') setReportGenDay(s.value);
      if (s.key === 'manager_email') setManagerEmail(s.value);
    });
  }

  async function loadSettings() {
    if (!supabase) {
      try {
        const saved = localStorage.getItem('pm_settings');
        if (saved) applySettings(JSON.parse(saved));
      } catch {}
      return;
    }
    const { data } = await supabase.from('site_settings').select('*');
    applySettings(data || []);
  }

  function handleLogoUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate: images only, max 500KB
    if (!file.type.startsWith('image/')) {
      setToast('Please select an image file (PNG, JPG, SVG)');
      setTimeout(() => setToast(''), 3000);
      return;
    }
    if (file.size > 500 * 1024) {
      setToast('Logo must be under 500KB');
      setTimeout(() => setToast(''), 3000);
      return;
    }

    const reader = new FileReader();
    reader.onload = (ev) => {
      // Resize to max 200px wide for storage efficiency
      const img = new Image();
      img.onload = () => {
        const maxW = 200;
        const scale = Math.min(1, maxW / img.width);
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/png', 0.9);
        setSiteLogo(dataUrl);
        setToast('Logo uploaded — click Save to apply');
        setTimeout(() => setToast(''), 3000);
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  }

  function removeLogo() {
    setSiteLogo('');
    if (fileInputRef.current) fileInputRef.current.value = '';
    setToast('Logo removed — click Save to apply');
    setTimeout(() => setToast(''), 3000);
  }

  async function saveSettings() {
    setSaving(true);
    const settings = [
      { key: 'electricity_unit_rate', value: unitRate },
      { key: 'site_name', value: siteName },
      { key: 'site_address', value: siteAddress },
      { key: 'site_logo', value: siteLogo },
      { key: 'ho_name', value: hoName },
      { key: 'ho_address', value: hoAddress },
      { key: 'ho_email', value: hoEmail },
      { key: 'ho_phone', value: hoPhone },
      { key: 'ho_contact', value: hoContact },
      { key: 'month_end_day', value: monthEndDay },
      { key: 'report_gen_day', value: reportGenDay },
      { key: 'manager_email', value: managerEmail },
    ];

    if (!supabase) {
      try { localStorage.setItem('pm_settings', JSON.stringify(settings)); } catch {}
      setToast('Settings saved');
      setTimeout(() => setToast(''), 3000);
      setSaving(false);
      return;
    }
    try {
      for (const s of settings) {
        await supabase.from('site_settings').upsert(
          { key: s.key, value: s.value || '', updated_at: new Date().toISOString() },
          { onConflict: 'key' }
        );
      }
      setToast('Settings saved');
      setTimeout(() => setToast(''), 3000);
    } catch (err) {
      setToast('Error: ' + err.message);
    }
    setSaving(false);
  }

  if (!user) return null;

  const inputClass = "w-full px-4 py-3 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500";

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 px-4 py-3 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto flex items-center gap-3">
          <Link href="/dashboard" className="text-slate-400 hover:text-slate-700 text-sm">&larr; Dashboard</Link>
          <h1 className="text-lg font-bold text-slate-900">Settings</h1>
        </div>
      </header>

      {toast && (
        <div className="fixed top-4 right-4 z-50 bg-emerald-600 text-white px-4 py-2 rounded-lg shadow-lg text-sm">{toast}</div>
      )}

      <div className="max-w-2xl mx-auto p-4 space-y-4">
        {/* Site Branding */}
        <div className="bg-white rounded-xl border p-6 space-y-5">
          <h2 className="text-base font-semibold text-slate-900">Site Branding</h2>

          {/* Logo upload */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Site Logo</label>
            <div className="flex items-start gap-4">
              {siteLogo ? (
                <div className="relative group">
                  <img src={siteLogo} alt="Site logo" className="w-20 h-20 object-contain rounded-xl border border-slate-200 bg-white p-1" />
                  <button
                    onClick={removeLogo}
                    className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600"
                    title="Remove logo"
                  >
                    &times;
                  </button>
                </div>
              ) : (
                <div className="w-20 h-20 rounded-xl border-2 border-dashed border-slate-300 flex items-center justify-center text-slate-400">
                  <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
              )}
              <div className="flex-1">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/svg+xml,image/webp"
                  onChange={handleLogoUpload}
                  className="hidden"
                  id="logo-upload"
                />
                <label
                  htmlFor="logo-upload"
                  className="inline-block px-4 py-2 bg-slate-100 text-slate-700 rounded-lg text-sm font-medium cursor-pointer hover:bg-slate-200 transition-colors"
                >
                  {siteLogo ? 'Change Logo' : 'Upload Logo'}
                </label>
                <p className="text-xs text-slate-400 mt-1.5">PNG, JPG or SVG. Max 500KB. Will be resized to 200px wide.</p>
              </div>
            </div>
          </div>

          {/* Preview of how header will look */}
          {(siteLogo || siteName) && (
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1.5">Header Preview</label>
              <div className="bg-white border border-slate-200 rounded-xl px-4 py-3 flex items-center gap-3">
                {siteLogo ? (
                  <img src={siteLogo} alt="Logo" className="w-9 h-9 object-contain rounded-lg" />
                ) : (
                  <svg className="w-9 h-9 rounded-lg flex-shrink-0" viewBox="0 0 192 192" xmlns="http://www.w3.org/2000/svg">
                    <defs><linearGradient id="bgp" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor="#059669"/><stop offset="100%" stopColor="#0d9488"/></linearGradient></defs>
                    <rect width="192" height="192" rx="38" fill="url(#bgp)"/>
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
                  <p className="text-sm font-bold text-slate-900">{siteName || 'Park Manager AI'}</p>
                  {siteAddress && <p className="text-xs text-slate-500 leading-tight">{siteAddress.split('\n')[0]}</p>}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Site Config */}
        <div className="bg-white rounded-xl border p-6 space-y-5">
          <h2 className="text-base font-semibold text-slate-900">Site Configuration</h2>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Site Name</label>
            <input value={siteName} onChange={e => setSiteName(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Site Address</label>
            <textarea value={siteAddress} onChange={e => setSiteAddress(e.target.value)} rows={3} className={inputClass} placeholder={"e.g. Riverside Holiday Park\n123 Park Lane\nConwy LL28 5AB"} />
            <p className="text-xs text-slate-400 mt-1">Displayed in the page header and on printed reports.</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Electricity Unit Rate (£/kWh)</label>
            <input type="number" step="0.01" value={unitRate} onChange={e => setUnitRate(e.target.value)} className={inputClass} />
            <p className="text-xs text-slate-400 mt-1">Usage (kWh) x Rate = Bill Amount</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Site Manager Email</label>
            <input type="email" value={managerEmail} onChange={e => setManagerEmail(e.target.value)} className={inputClass} placeholder="manager@mypark.co.uk" />
            <p className="text-xs text-slate-400 mt-1">Receives copies of reports and payment notifications.</p>
          </div>
        </div>

        {/* Month Ending */}
        <div className="bg-white rounded-xl border p-6 space-y-5">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Month Ending & Billing Cycle</h2>
            <p className="text-xs text-slate-400 mt-0.5">Configure when your billing month ends and when reports are generated.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Month End Day</label>
              <select value={monthEndDay} onChange={e => setMonthEndDay(e.target.value)} className={inputClass + ' bg-white'}>
                <option value="last">Last day of month</option>
                {Array.from({ length: 28 }, (_, i) => i + 1).map(d => (
                  <option key={d} value={String(d)}>{d}{d === 1 ? 'st' : d === 2 ? 'nd' : d === 3 ? 'rd' : 'th'} of month</option>
                ))}
              </select>
              <p className="text-xs text-slate-400 mt-1">Readings taken up to this day are included in the month.</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Report Generation Day</label>
              <select value={reportGenDay} onChange={e => setReportGenDay(e.target.value)} className={inputClass + ' bg-white'}>
                {Array.from({ length: 28 }, (_, i) => i + 1).map(d => (
                  <option key={d} value={String(d)}>{d}{d === 1 ? 'st' : d === 2 ? 'nd' : d === 3 ? 'rd' : 'th'} of following month</option>
                ))}
              </select>
              <p className="text-xs text-slate-400 mt-1">Day reports should be generated and sent out.</p>
            </div>
          </div>
        </div>

        {/* Head Office */}
        <div className="bg-white rounded-xl border p-6 space-y-5">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Head Office Details</h2>
            <p className="text-xs text-slate-400 mt-0.5">Reports and meter readings are sent to this address.</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Company / Organisation Name</label>
            <input value={hoName} onChange={e => setHoName(e.target.value)} className={inputClass} placeholder="e.g. Leisure Parks Ltd" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Address</label>
            <textarea value={hoAddress} onChange={e => setHoAddress(e.target.value)} rows={3} className={inputClass} placeholder="123 Park Lane&#10;Townsville&#10;AB1 2CD" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Contact Person</label>
              <input value={hoContact} onChange={e => setHoContact(e.target.value)} className={inputClass} placeholder="Jane Smith" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Phone Number</label>
              <input type="tel" value={hoPhone} onChange={e => setHoPhone(e.target.value)} className={inputClass} placeholder="01234 567890" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Head Office Email</label>
            <input type="email" value={hoEmail} onChange={e => setHoEmail(e.target.value)} className={inputClass} placeholder="readings@leisureparks.co.uk" />
            <p className="text-xs text-slate-400 mt-1">Meter reading reports will be emailed here as PDF attachments.</p>
          </div>
        </div>

        {/* Save */}
        <div className="flex justify-end">
          <button onClick={saveSettings} disabled={saving} className="px-6 py-3 bg-emerald-600 text-white rounded-xl text-sm font-semibold hover:bg-emerald-500 transition-colors disabled:opacity-50">
            {saving ? 'Saving...' : 'Save All Settings'}
          </button>
        </div>

        {/* Account */}
        <div className="bg-white rounded-xl border p-6">
          <h2 className="text-base font-semibold text-slate-900 mb-3">Account</h2>
          <div className="space-y-2">
            <p className="text-sm text-slate-600"><span className="font-medium">Email:</span> {user.email}</p>
            <p className="text-sm text-slate-600"><span className="font-medium">Role:</span> {user.role}</p>
            <p className="text-sm text-slate-600"><span className="font-medium">Name:</span> {user.full_name}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
