'use client';

export default function PortalEmergency({ siteName, sitePhone, onEmergencyPress }) {
  const numbers = [
    { label: 'Site Office', number: sitePhone || 'Not set', desc: `Contact ${siteName || 'the site office'}`, color: 'bg-emerald-600', available: !!sitePhone },
    { label: 'Emergency Services', number: '999', desc: 'Police, Fire, Ambulance', color: 'bg-red-600', available: true },
    { label: 'Gas Emergency', number: '0800 111 999', desc: 'National Gas Emergency Service', color: 'bg-amber-600', available: true },
    { label: 'NHS Non-Emergency', number: '111', desc: 'Medical advice when not life-threatening', color: 'bg-blue-600', available: true },
  ];

  return (
    <div className="space-y-3 mt-1">
      {/* Emergency Button */}
      {sitePhone && (
        <button onClick={onEmergencyPress} className="w-full bg-red-600 hover:bg-red-700 active:bg-red-800 text-white rounded-2xl p-6 text-center transition-colors">
          <svg className="w-12 h-12 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
          <h2 className="text-xl font-bold">Emergency — I Need Help</h2>
          <p className="text-sm text-white/80 mt-1">Press for on-site emergency assistance</p>
        </button>
      )}

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
                className={`${n.color} text-white px-5 py-3 rounded-xl text-sm font-bold flex items-center gap-1.5 flex-shrink-0`}>
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
          <li>5. Alert the site office when safe to do so</li>
        </ul>
      </div>
    </div>
  );
}
