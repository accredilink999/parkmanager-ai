import Link from 'next/link';

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-900 via-teal-800 to-sky-900">
      {/* Nav */}
      <nav className="px-6 py-4 flex items-center justify-between max-w-6xl mx-auto">
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 rounded-xl bg-emerald-500 flex items-center justify-center text-white font-bold text-lg">P</div>
          <span className="text-xl font-bold text-white">ParkManagerAI</span>
        </div>
        <Link
          href="/login"
          className="px-5 py-2 bg-white text-emerald-800 rounded-lg font-semibold text-sm hover:bg-emerald-50 transition-colors"
        >
          Sign In
        </Link>
      </nav>

      {/* Hero */}
      <div className="max-w-6xl mx-auto px-6 py-20 text-center">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-emerald-500/20 border border-emerald-400/30 rounded-full text-emerald-300 text-sm mb-8">
          <span className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
          Intelligent Park Management
        </div>
        <h1 className="text-5xl md:text-6xl font-bold text-white mb-6 leading-tight">
          Manage Your Caravan Park<br />
          <span className="text-emerald-400">Smarter, Not Harder</span>
        </h1>
        <p className="text-lg text-slate-300 max-w-2xl mx-auto mb-10">
          Electricity metering, automated billing, QR-code scanning, customer portals, and real-time reporting
          — all in one intelligent platform built for static caravan sites.
        </p>
        <div className="flex items-center justify-center gap-4">
          <Link
            href="/login"
            className="px-8 py-3 bg-emerald-500 text-white rounded-xl font-semibold text-lg hover:bg-emerald-400 transition-colors shadow-lg shadow-emerald-500/25"
          >
            Get Started
          </Link>
          <a
            href="#features"
            className="px-8 py-3 bg-white/10 text-white rounded-xl font-semibold text-lg hover:bg-white/20 transition-colors border border-white/20"
          >
            Learn More
          </a>
        </div>
      </div>

      {/* Features */}
      <div id="features" className="max-w-6xl mx-auto px-6 py-16">
        <h2 className="text-3xl font-bold text-white text-center mb-12">Phase 1 Features</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[
            { icon: '📱', title: 'QR Meter Scanning', desc: 'Scan QR codes to instantly pull up meter info. Record readings with camera or manual entry.' },
            { icon: '⚡', title: 'Auto Billing', desc: 'Automatic usage calculation and bill generation. Usage x unit rate = instant invoices.' },
            { icon: '📊', title: 'Reports & PDF', desc: 'Monthly, yearly, or custom date range reports. Export as branded PDFs and send to head office.' },
            { icon: '👤', title: 'Customer Portal', desc: 'Customers view bills, track usage charts, mark payments, and download PDFs.' },
            { icon: '📶', title: 'Offline-First', desc: 'Works without internet. Readings stored locally and synced when connection returns.' },
            { icon: '🔒', title: 'Role-Based Access', desc: 'Super Admin, Admin, and Customer roles with appropriate access levels.' },
          ].map((f) => (
            <div key={f.title} className="bg-white/10 backdrop-blur-sm border border-white/10 rounded-2xl p-6 hover:bg-white/15 transition-colors">
              <span className="text-3xl mb-4 block">{f.icon}</span>
              <h3 className="text-lg font-bold text-white mb-2">{f.title}</h3>
              <p className="text-sm text-slate-300">{f.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-white/10 py-8 text-center">
        <p className="text-sm text-slate-400">&copy; {new Date().getFullYear()} ParkManagerAI. All rights reserved.</p>
      </footer>
    </div>
  );
}
