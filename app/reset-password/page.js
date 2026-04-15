'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Supabase will auto-detect the recovery token from the URL hash
    if (!supabase) return;
    supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setReady(true);
      }
    });
    // Also check if we already have a session (user clicked link)
    supabase.auth.getSession().then(({ data }) => {
      if (data?.session) setReady(true);
    });
  }, []);

  async function handleReset(e) {
    e.preventDefault();
    setError('');
    if (password.length < 6) { setError('Password must be at least 6 characters'); return; }
    if (password !== confirm) { setError('Passwords do not match'); return; }

    setLoading(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;
      setSuccess(true);
      setTimeout(() => router.push('/login'), 3000);
    } catch (err) {
      setError(err.message || 'Failed to update password');
    }
    setLoading(false);
  }

  const EyeIcon = ({ show }) => show ? (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L6.344 6.344m7.314 7.314l3.536 3.536M3 3l18 18" /></svg>
  ) : (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-900 via-teal-800 to-sky-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-2">
            <img src="/icon-192.svg" alt="ParkManagerAI" className="w-12 h-12 rounded-xl" />
            <span className="text-2xl font-bold text-white">ParkManagerAI</span>
          </Link>
          <p className="text-sm text-slate-300 mt-2">Set your new password</p>
        </div>

        <div className="bg-white rounded-2xl shadow-2xl p-8">
          {success ? (
            <div className="text-center py-4">
              <div className="w-14 h-14 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <svg className="w-7 h-7 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
              </div>
              <p className="text-sm font-semibold text-slate-800">Password updated!</p>
              <p className="text-xs text-slate-500 mt-1">Redirecting to login...</p>
            </div>
          ) : !ready ? (
            <div className="text-center py-4">
              <div className="animate-spin w-8 h-8 border-3 border-emerald-500 border-t-transparent rounded-full mx-auto mb-3" />
              <p className="text-sm text-slate-600">Verifying reset link...</p>
              <p className="text-xs text-slate-400 mt-2">If this takes too long, the link may have expired.</p>
              <Link href="/login" className="mt-4 inline-block text-sm text-emerald-600 hover:text-emerald-500 font-medium">Back to Login</Link>
            </div>
          ) : (
            <form onSubmit={handleReset} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">New Password</label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={6}
                    className="w-full px-4 py-3 pr-12 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                    placeholder="Min 6 characters"
                  />
                  <button type="button" onClick={() => setShowPassword(p => !p)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                    <EyeIcon show={showPassword} />
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Confirm Password</label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    required
                    minLength={6}
                    className="w-full px-4 py-3 pr-12 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                    placeholder="Re-enter password"
                  />
                  <button type="button" onClick={() => setShowPassword(p => !p)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                    <EyeIcon show={showPassword} />
                  </button>
                </div>
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">{error}</div>
              )}

              <button type="submit" disabled={loading} className="w-full py-3 bg-emerald-600 text-white rounded-xl font-semibold text-sm hover:bg-emerald-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                {loading ? 'Updating...' : 'Update Password'}
              </button>
            </form>
          )}
        </div>

        <p className="text-center text-xs text-slate-400 mt-6">
          &copy; {new Date().getFullYear()} ParkManagerAI
        </p>
      </div>
    </div>
  );
}
