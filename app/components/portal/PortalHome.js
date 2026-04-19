'use client';

export default function PortalHome({ user, pitch, customerProfile, siteName, sitePhone, onNavigate }) {
  const quickLinks = [
    { key: 'financials', label: 'My Bills', desc: 'View bills & readings', color: 'bg-blue-500', icon: (
      <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
    )},
    { key: 'gas', label: 'Order Gas', desc: 'Request a cylinder', color: 'bg-amber-500', icon: (
      <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z" /></svg>
    )},
    { key: 'report', label: 'Report Issue', desc: 'Maintenance or concern', color: 'bg-teal-500', icon: (
      <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
    )},
    { key: 'certificates', label: 'Certificates', desc: 'Gas & electric certs', color: 'bg-purple-500', icon: (
      <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
    )},
    { key: 'profile', label: 'My Profile', desc: 'View & edit details', color: 'bg-emerald-500', icon: (
      <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
    )},
    { key: 'emergency', label: 'Emergency', desc: 'Numbers & help', color: 'bg-red-500', icon: (
      <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" /></svg>
    )},
  ];

  return (
    <div className="space-y-4">
      {/* Welcome hero with park photo */}
      <div className="relative rounded-2xl overflow-hidden">
        <div
          className="h-44 bg-cover bg-center"
          style={{ backgroundImage: "url('/hero-bg.jpg')" }}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent" />
        <div className="absolute bottom-0 left-0 right-0 p-4">
          <h2 className="text-xl font-bold text-white">
            Welcome{customerProfile?.lead_occupier ? `, ${customerProfile.lead_occupier.split(' ')[0]}` : ''}
          </h2>
          <p className="text-sm text-white/80 mt-0.5">{siteName || 'Your Park'}</p>
        </div>
      </div>

      {/* Pitch info card */}
      {pitch && (
        <div className="bg-white rounded-2xl border p-4 flex items-center gap-4">
          <div className="w-12 h-12 bg-emerald-100 rounded-xl flex items-center justify-center">
            <svg className="w-6 h-6 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
            </svg>
          </div>
          <div className="flex-1">
            <p className="text-sm font-bold text-slate-900">Pitch {pitch.pitch_number}</p>
            <p className="text-xs text-slate-400">{pitch.meter_id ? `Meter: ${pitch.meter_id}` : 'No meter assigned'}</p>
          </div>
          <span className={`text-xs font-bold px-3 py-1 rounded-full ${pitch.status === 'occupied' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
            {pitch.status || 'Active'}
          </span>
        </div>
      )}

      {/* Site office contact */}
      {sitePhone && (
        <a href={`tel:${sitePhone.replace(/\s/g, '')}`}
          className="block bg-emerald-50 border border-emerald-200 rounded-2xl p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-emerald-600 rounded-xl flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-bold text-emerald-800">Call Site Manager</p>
              <p className="text-xs text-emerald-600">{sitePhone}</p>
            </div>
          </div>
        </a>
      )}

      {/* Quick links grid */}
      <div>
        <h3 className="text-sm font-bold text-slate-700 mb-3">Quick Links</h3>
        <div className="grid grid-cols-2 gap-3">
          {quickLinks.map(link => (
            <button
              key={link.key}
              onClick={() => onNavigate(link.key)}
              className="bg-white rounded-2xl border p-4 text-left hover:shadow-md hover:border-slate-300 active:bg-slate-50 transition-all"
            >
              <div className={`w-10 h-10 ${link.color} rounded-xl flex items-center justify-center mb-3`}>
                {link.icon}
              </div>
              <p className="text-sm font-bold text-slate-900">{link.label}</p>
              <p className="text-xs text-slate-400 mt-0.5">{link.desc}</p>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
