'use client';
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState('login'); // login | signup
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [orgName, setOrgName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState('');
  const [showQr, setShowQr] = useState(false);
  const [qrReady, setQrReady] = useState(false);
  const [copied, setCopied] = useState(false);
  const qrCanvasRef = useRef(null);

  // Render QR code directly to canvas element
  useEffect(() => {
    if (!showQr || !qrCanvasRef.current) return;
    setQrReady(false);
    const loginUrl = window.location.origin + '/login';

    import('qrcode').then(mod => {
      const QRCode = mod.default || mod;
      QRCode.toCanvas(qrCanvasRef.current, loginUrl, {
        width: 240,
        margin: 2,
        color: { dark: '#0f172a', light: '#ffffff' },
        errorCorrectionLevel: 'M',
      }, (err) => {
        if (err) console.error('QR render error:', err);
        else setQrReady(true);
      });
    }).catch(err => console.error('QR import error:', err));
  }, [showQr]);

  function copyLoginLink() {
    const url = typeof window !== 'undefined' ? window.location.href : 'https://parkmanager-ai.vercel.app/login';
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  }

  async function shareLoginLink() {
    const url = typeof window !== 'undefined' ? window.location.href : 'https://parkmanager-ai.vercel.app/login';
    if (navigator.share) {
      try {
        await navigator.share({ title: 'ParkManagerAI Login', text: 'Sign in to ParkManagerAI', url });
      } catch {}
    } else {
      copyLoginLink();
    }
  }

  async function handleLogin(e) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (!supabase) {
        sessionStorage.setItem('pm_user', JSON.stringify({
          id: 'demo',
          email,
          role: 'super_admin',
          full_name: 'Demo Admin',
        }));
        router.push('/dashboard');
        return;
      }

      const { data, error: authError } = await supabase.auth.signInWithPassword({ email, password });
      if (authError) throw authError;

      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', data.user.id)
        .single();

      const userInfo = {
        id: data.user.id,
        email: data.user.email,
        role: profile?.role || 'customer',
        full_name: profile?.full_name || email,
      };

      sessionStorage.setItem('pm_user', JSON.stringify(userInfo));

      if (userInfo.role === 'customer') {
        router.push('/portal');
      } else if (userInfo.role === 'accounts') {
        router.push('/dashboard/bills');
      } else { // super_admin, admin, developer
        router.push('/dashboard');
      }
    } catch (err) {
      setError(err.message || 'Login failed');
    }
    setLoading(false);
  }

  async function handleSignup(e) {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      if (!supabase) {
        sessionStorage.setItem('pm_user', JSON.stringify({
          id: 'demo',
          email,
          role: 'super_admin',
          full_name: fullName || 'Demo Admin',
          org_name: orgName,
        }));
        router.push('/dashboard');
        return;
      }

      if (password.length < 6) throw new Error('Password must be at least 6 characters');

      // Use server-side API to create user (bypasses email confirmation + RLS)
      const res = await fetch('/api/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, fullName, orgName }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Signup failed');

      setSuccess('Account created! You can now sign in.');
      setMode('login');
    } catch (err) {
      setError(err.message || 'Sign up failed');
    }
    setLoading(false);
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-900 via-teal-800 to-sky-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-2">
            <img src="/icon-192.svg" alt="ParkManagerAI" className="w-12 h-12 rounded-xl" />
            <span className="text-2xl font-bold text-white">ParkManagerAI</span>
          </Link>
          <p className="text-sm text-slate-300 mt-2">
            {mode === 'login' ? 'Sign in to your account' : 'Create your park account'}
          </p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-2xl p-8">
          {/* Tabs */}
          <div className="flex rounded-xl bg-slate-100 p-1 mb-6">
            <button
              onClick={() => { setMode('login'); setError(''); }}
              className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-colors ${mode === 'login' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              Sign In
            </button>
            <button
              onClick={() => { setMode('signup'); setError(''); }}
              className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-colors ${mode === 'signup' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              Register Park
            </button>
          </div>

          {success && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-sm text-emerald-700 mb-4">
              {success}
            </div>
          )}

          {mode === 'login' ? (
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                  placeholder="you@example.com"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                  placeholder="Enter your password"
                />
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">{error}</div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 bg-emerald-600 text-white rounded-xl font-semibold text-sm hover:bg-emerald-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Signing in...
                  </span>
                ) : 'Sign In'}
              </button>

              <p className="text-center text-xs text-slate-400 mt-2">
                Contact your site manager for account access, or register your park above.
              </p>
            </form>
          ) : (
            <form onSubmit={handleSignup} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Park / Site Name</label>
                <input
                  value={orgName}
                  onChange={(e) => setOrgName(e.target.value)}
                  required
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                  placeholder="e.g. Sunset Caravan Park"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Your Full Name</label>
                <input
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                  placeholder="John Smith"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                  placeholder="you@example.com"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                  placeholder="Min 6 characters"
                />
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">{error}</div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 bg-emerald-600 text-white rounded-xl font-semibold text-sm hover:bg-emerald-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Creating account...
                  </span>
                ) : 'Register & Get Started'}
              </button>

              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 mt-2">
                <p className="text-xs text-slate-500 leading-relaxed">
                  By registering you'll be set up as the <strong>Site Admin</strong>. You can then invite your staff and customers from the dashboard.
                </p>
              </div>
            </form>
          )}
        </div>

        {/* Share / QR Code section */}
        <div className="mt-6 text-center">
          <button
            onClick={() => setShowQr(prev => !prev)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl text-sm font-medium transition-colors backdrop-blur-sm"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
            </svg>
            {showQr ? 'Hide QR Code' : 'Share Login QR Code'}
          </button>

          {showQr && (
            <div className="mt-4 bg-white rounded-2xl shadow-2xl p-6 inline-block">
              <p className="text-sm font-semibold text-slate-800 mb-1">Scan to open login page</p>
              <p className="text-xs text-slate-400 mb-4">Share this with staff or customers to access the app</p>
              <div className="mx-auto flex items-center justify-center">
                <canvas ref={qrCanvasRef} className={`rounded-xl ${qrReady ? '' : 'hidden'}`} />
                {!qrReady && (
                  <div className="w-56 h-56 flex items-center justify-center bg-slate-50 rounded-xl">
                    <div className="animate-spin w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full" />
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2 mt-4 justify-center">
                <button
                  onClick={copyLoginLink}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-medium transition-colors flex items-center gap-1.5"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                  {copied ? 'Copied!' : 'Copy Link'}
                </button>
                <button
                  onClick={shareLoginLink}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-medium transition-colors flex items-center gap-1.5"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                  </svg>
                  Share
                </button>
              </div>
            </div>
          )}
        </div>

        <p className="text-center text-xs text-slate-400 mt-6">
          &copy; {new Date().getFullYear()} ParkManagerAI
        </p>
      </div>
    </div>
  );
}
