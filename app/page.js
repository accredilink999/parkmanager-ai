import Link from 'next/link';
import QRCode from 'qrcode';

export default async function Home() {
  const qrDataUrl = await QRCode.toDataURL('https://parkmanager-ai.vercel.app/login', {
    width: 200, margin: 1, color: { dark: '#0f766e', light: '#ffffff' }
  });

  return (
    <div className="min-h-screen bg-slate-900">
      {/* Hero with background image */}
      <div className="relative min-h-screen flex flex-col">
        {/* Background */}
        <div
          className="absolute inset-0 bg-cover bg-center bg-no-repeat"
          style={{ backgroundImage: "url('/hero-bg.jpg')" }}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/40 to-black/80" />

        {/* Nav */}
        <nav className="relative z-10 px-6 py-5 flex items-center justify-between max-w-7xl mx-auto w-full">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-emerald-500 shadow-lg shadow-emerald-500/30 flex items-center justify-center">
              <svg className="w-7 h-7 text-white" viewBox="0 0 192 192" xmlns="http://www.w3.org/2000/svg">
                <rect x="28" y="62" width="108" height="58" rx="10" fill="white" opacity="0.95"/>
                <path d="M28 72 Q28 52 48 52 L116 52 Q136 52 136 72" fill="white" opacity="0.95"/>
                <circle cx="52" cy="120" r="12" fill="white" opacity="0.9"/>
                <circle cx="52" cy="120" r="6" fill="#059669"/>
                <circle cx="112" cy="120" r="12" fill="white" opacity="0.9"/>
                <circle cx="112" cy="120" r="6" fill="#059669"/>
              </svg>
            </div>
            <span className="text-xl font-bold text-white tracking-tight">ParkManager<span className="text-emerald-400">AI</span></span>
          </div>
          <Link
            href="/login"
            className="px-6 py-2.5 bg-white/10 backdrop-blur-sm text-white rounded-xl font-semibold text-sm hover:bg-white/20 transition-all border border-white/20"
          >
            Sign In
          </Link>
        </nav>

        {/* Hero Content */}
        <div className="relative z-10 flex-1 flex items-center">
          <div className="max-w-7xl mx-auto px-6 py-16 w-full">
            <div className="max-w-2xl">
              <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-emerald-500/20 backdrop-blur-sm border border-emerald-400/30 rounded-full text-emerald-300 text-sm mb-8">
                <span className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
                Intelligent Park Management
              </div>

              <h1 className="text-5xl md:text-7xl font-extrabold text-white mb-6 leading-[1.1] tracking-tight">
                Manage Your Park<br />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-teal-300">Smarter, Not Harder</span>
              </h1>

              <p className="text-lg md:text-xl text-slate-200 max-w-xl mb-10 leading-relaxed">
                Electricity metering, automated billing, customer portals, gas management and real-time reporting
                &mdash; all in one intelligent platform built for caravan parks.
              </p>

              <div className="flex flex-wrap items-center gap-4">
                <Link
                  href="/login"
                  className="px-8 py-4 bg-emerald-500 text-white rounded-2xl font-bold text-lg hover:bg-emerald-400 transition-all shadow-xl shadow-emerald-500/30 hover:shadow-emerald-400/40 hover:scale-105"
                >
                  Get Started Free
                </Link>
                <a
                  href="#features"
                  className="px-8 py-4 bg-white/10 backdrop-blur-sm text-white rounded-2xl font-semibold text-lg hover:bg-white/20 transition-all border border-white/20"
                >
                  See Features
                </a>
              </div>

              {/* Stats */}
              <div className="flex gap-8 mt-14">
                {[
                  { val: '100%', label: 'Automated Billing' },
                  { val: 'Real-time', label: 'Meter Tracking' },
                  { val: '24/7', label: 'Customer Portal' },
                ].map(s => (
                  <div key={s.label}>
                    <p className="text-2xl md:text-3xl font-extrabold text-white">{s.val}</p>
                    <p className="text-xs md:text-sm text-slate-300 mt-1">{s.label}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Scroll indicator */}
        <div className="relative z-10 pb-8 flex justify-center">
          <a href="#features" className="animate-bounce">
            <svg className="w-6 h-6 text-white/50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
            </svg>
          </a>
        </div>
      </div>

      {/* Features */}
      <div id="features" className="bg-white py-24">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-16">
            <p className="text-sm font-bold text-emerald-600 uppercase tracking-wider mb-3">Everything You Need</p>
            <h2 className="text-4xl md:text-5xl font-extrabold text-slate-900">
              One Platform, Complete Control
            </h2>
            <p className="text-lg text-slate-500 mt-4 max-w-2xl mx-auto">
              From meter readings to customer billing, gas orders to emergency alerts &mdash; manage every aspect of your park from one dashboard.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              { icon: (
                <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
              ), title: 'QR Meter Scanning', desc: 'Scan QR codes on meters to instantly pull up pitch info and record readings with one tap.', color: 'emerald' },
              { icon: (
                <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
              ), title: 'Automated Billing', desc: 'Usage x unit rate = instant invoices. Bills generated automatically after each meter reading.', color: 'blue' },
              { icon: (
                <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
              ), title: 'Reports & PDF Export', desc: 'Generate branded reports by pitch, date range, or full site. Export and send as professional PDFs.', color: 'purple' },
              { icon: (
                <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
              ), title: 'Customer Portal', desc: 'Customers view their bills, track usage, order gas, report issues and access emergency contacts.', color: 'teal' },
              { icon: (
                <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z" /></svg>
              ), title: 'Gas Management', desc: 'Track cylinder stock, manage customer orders, and monitor delivery status across all pitches.', color: 'amber' },
              { icon: (
                <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" /></svg>
              ), title: 'Emergency Alerts', desc: 'Customers can trigger panic alerts with countdown timers. Site managers get instant notification.', color: 'red' },
            ].map((f) => {
              const colors = {
                emerald: 'bg-emerald-50 text-emerald-600 border-emerald-100',
                blue: 'bg-blue-50 text-blue-600 border-blue-100',
                purple: 'bg-purple-50 text-purple-600 border-purple-100',
                teal: 'bg-teal-50 text-teal-600 border-teal-100',
                amber: 'bg-amber-50 text-amber-600 border-amber-100',
                red: 'bg-red-50 text-red-600 border-red-100',
              };
              return (
                <div key={f.title} className="group bg-white border border-slate-200 rounded-2xl p-7 hover:shadow-xl hover:border-emerald-200 hover:-translate-y-1 transition-all duration-300">
                  <div className={`w-14 h-14 ${colors[f.color]} border rounded-2xl flex items-center justify-center mb-5`}>
                    {f.icon}
                  </div>
                  <h3 className="text-lg font-bold text-slate-900 mb-2">{f.title}</h3>
                  <p className="text-sm text-slate-500 leading-relaxed">{f.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* CTA Section */}
      <div className="relative py-24 overflow-hidden">
        <div
          className="absolute inset-0 bg-cover bg-center bg-no-repeat opacity-20"
          style={{ backgroundImage: "url('/hero-bg.jpg')" }}
        />
        <div className="absolute inset-0 bg-gradient-to-r from-emerald-900 to-teal-900" style={{ mixBlendMode: 'multiply' }} />
        <div className="relative z-10 max-w-4xl mx-auto px-6 text-center">
          <h2 className="text-4xl md:text-5xl font-extrabold text-white mb-6">
            Ready to Modernise Your Park?
          </h2>
          <p className="text-lg text-emerald-100 mb-10 max-w-2xl mx-auto">
            Join park managers who are saving hours every week with automated metering, billing and customer management.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/login"
              className="px-10 py-4 bg-white text-emerald-800 rounded-2xl font-bold text-lg hover:bg-emerald-50 transition-all shadow-xl hover:scale-105"
            >
              Start Managing Smarter
            </Link>
          </div>

          {/* QR Code */}
          <div className="mt-14 flex flex-col items-center gap-3">
            <div className="bg-white p-3 rounded-2xl shadow-xl">
              <img src={qrDataUrl} alt="Scan to login" className="w-36 h-36 rounded-lg" />
            </div>
            <p className="text-sm text-emerald-200">Scan with your phone to open the app</p>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="bg-slate-950 border-t border-white/10 py-10">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-500 flex items-center justify-center">
              <svg className="w-5 h-5 text-white" viewBox="0 0 192 192" xmlns="http://www.w3.org/2000/svg">
                <rect x="28" y="62" width="108" height="58" rx="10" fill="white" opacity="0.95"/>
                <path d="M28 72 Q28 52 48 52 L116 52 Q136 52 136 72" fill="white" opacity="0.95"/>
                <circle cx="52" cy="120" r="12" fill="white" opacity="0.9"/>
                <circle cx="52" cy="120" r="6" fill="#059669"/>
                <circle cx="112" cy="120" r="12" fill="white" opacity="0.9"/>
                <circle cx="112" cy="120" r="6" fill="#059669"/>
              </svg>
            </div>
            <span className="text-sm font-bold text-white">ParkManager<span className="text-emerald-400">AI</span></span>
          </div>
          <p className="text-sm text-slate-500">&copy; {new Date().getFullYear()} ParkManagerAI. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
