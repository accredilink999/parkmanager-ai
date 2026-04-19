'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

export default function ProfilePage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');

  // Edit fields
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');

  // Password change
  const [showPassword, setShowPassword] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem('pm_user');
    if (!saved) { router.push('/login'); return; }
    const u = JSON.parse(saved);
    if (u.role === 'customer') { router.push('/portal'); return; }
    setUser(u);
    loadProfile(u);
  }, [router]);

  async function loadProfile(u) {
    if (!supabase || !u) { setLoading(false); return; }
    try {
      const { data } = await supabase.from('profiles').select('*').eq('id', u.id).single();
      if (data) {
        setProfile(data);
        setFullName(data.full_name || '');
        setPhone(data.phone || '');
      }
    } catch {}
    setLoading(false);
  }

  async function saveProfile() {
    if (!fullName.trim()) return;
    setSaving(true);
    try {
      const updates = { full_name: fullName.trim(), phone: phone.trim() };
      await supabase.from('profiles').update(updates).eq('id', user.id);

      // Update localStorage too
      const saved = JSON.parse(localStorage.getItem('pm_user'));
      saved.full_name = fullName.trim();
      localStorage.setItem('pm_user', JSON.stringify(saved));
      setUser(saved);

      setProfile(prev => ({ ...prev, ...updates }));
      setEditing(false);
      showToast('Profile updated');
    } catch (err) {
      console.error('Save profile error:', err);
      showToast('Failed to save');
    }
    setSaving(false);
  }

  async function changePassword() {
    if (!newPassword || newPassword.length < 6) {
      showToast('Password must be at least 6 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      showToast('Passwords do not match');
      return;
    }
    setChangingPassword(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      setNewPassword('');
      setConfirmPassword('');
      setShowPassword(false);
      showToast('Password changed successfully');
    } catch (err) {
      console.error('Password change error:', err);
      showToast(err.message || 'Failed to change password');
    }
    setChangingPassword(false);
  }

  function logout() {
    localStorage.removeItem('pm_user');
    if (supabase) supabase.auth.signOut();
    router.push('/login');
  }

  function showToast(msg) {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  }

  const roleLabels = {
    super_admin: 'Super Admin',
    admin: 'Admin',
    developer: 'Developer',
    accounts: 'Accounts',
  };

  const roleBadgeColors = {
    super_admin: 'bg-purple-100 text-purple-700',
    admin: 'bg-blue-100 text-blue-700',
    developer: 'bg-amber-100 text-amber-700',
    accounts: 'bg-slate-100 text-slate-600',
  };

  if (!user) return null;

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-4 py-3 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto flex items-center gap-3">
          <Link href="/dashboard" className="p-2 hover:bg-slate-100 rounded-lg transition-colors">
            <svg className="w-5 h-5 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
          </Link>
          <h1 className="text-lg font-bold text-slate-900">My Profile</h1>
        </div>
      </header>

      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[100] bg-emerald-600 text-white text-sm font-medium px-5 py-2.5 rounded-xl shadow-lg">
          {toast}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-20">
          <div className="w-8 h-8 border-4 border-emerald-200 border-t-emerald-500 rounded-full animate-spin" />
        </div>
      ) : (
        <div className="max-w-2xl mx-auto p-4 space-y-4">
          {/* Avatar + Name Card */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 text-center">
            <div className="w-20 h-20 bg-gradient-to-br from-emerald-400 to-teal-500 rounded-full mx-auto flex items-center justify-center mb-4 shadow-lg">
              <span className="text-2xl font-bold text-white">
                {(user.full_name || user.email || '?').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)}
              </span>
            </div>
            <h2 className="text-xl font-bold text-slate-900">{user.full_name || user.email}</h2>
            <p className="text-sm text-slate-500 mt-1">{user.email}</p>
            <span className={`inline-block mt-2 text-xs font-semibold px-3 py-1 rounded-full ${roleBadgeColors[user.role] || 'bg-slate-100 text-slate-600'}`}>
              {roleLabels[user.role] || user.role}
            </span>
            {user.org_name && (
              <p className="text-xs text-slate-400 mt-2">{user.org_name}</p>
            )}
          </div>

          {/* Personal Details */}
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <div className="px-5 py-3 bg-slate-50 border-b flex items-center justify-between">
              <p className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Personal Details</p>
              {!editing ? (
                <button onClick={() => setEditing(true)} className="text-xs text-emerald-600 font-semibold hover:text-emerald-700">
                  Edit
                </button>
              ) : (
                <button onClick={() => { setEditing(false); setFullName(profile?.full_name || ''); setPhone(profile?.phone || ''); }}
                  className="text-xs text-slate-400 hover:text-slate-600">Cancel</button>
              )}
            </div>

            {editing ? (
              <div className="p-5 space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Full Name</label>
                  <input type="text" value={fullName} onChange={e => setFullName(e.target.value)}
                    className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Phone</label>
                  <input type="tel" value={phone} onChange={e => setPhone(e.target.value)}
                    placeholder="07xxx xxxxxx"
                    className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                </div>
                <button onClick={saveProfile} disabled={saving || !fullName.trim()}
                  className="w-full py-2.5 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white rounded-xl text-sm font-semibold">
                  {saving ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                <div className="px-5 py-3.5 flex items-center justify-between">
                  <div>
                    <p className="text-xs text-slate-400">Full Name</p>
                    <p className="text-sm font-medium text-slate-900">{profile?.full_name || user.full_name || '—'}</p>
                  </div>
                  <svg className="w-4 h-4 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                </div>
                <div className="px-5 py-3.5 flex items-center justify-between">
                  <div>
                    <p className="text-xs text-slate-400">Email</p>
                    <p className="text-sm font-medium text-slate-900">{user.email}</p>
                  </div>
                  <svg className="w-4 h-4 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                </div>
                <div className="px-5 py-3.5 flex items-center justify-between">
                  <div>
                    <p className="text-xs text-slate-400">Phone</p>
                    <p className="text-sm font-medium text-slate-900">{profile?.phone || '—'}</p>
                  </div>
                  <svg className="w-4 h-4 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                  </svg>
                </div>
                <div className="px-5 py-3.5 flex items-center justify-between">
                  <div>
                    <p className="text-xs text-slate-400">Role</p>
                    <p className="text-sm font-medium text-slate-900">{roleLabels[user.role] || user.role}</p>
                  </div>
                  <svg className="w-4 h-4 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                </div>
              </div>
            )}
          </div>

          {/* Change Password */}
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <button onClick={() => setShowPassword(!showPassword)}
              className="w-full px-5 py-4 flex items-center justify-between hover:bg-slate-50 transition-colors">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-amber-50 rounded-xl flex items-center justify-center">
                  <svg className="w-5 h-5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                </div>
                <span className="text-sm font-medium text-slate-900">Change Password</span>
              </div>
              <svg className={`w-4 h-4 text-slate-400 transition-transform ${showPassword ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {showPassword && (
              <div className="px-5 pb-5 space-y-3 border-t border-slate-100 pt-4">
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">New Password</label>
                  <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)}
                    placeholder="Min 6 characters"
                    className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Confirm Password</label>
                  <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}
                    placeholder="Repeat password"
                    className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                </div>
                <button onClick={changePassword} disabled={changingPassword || !newPassword}
                  className="w-full py-2.5 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white rounded-xl text-sm font-semibold">
                  {changingPassword ? 'Changing...' : 'Update Password'}
                </button>
              </div>
            )}
          </div>

          {/* Sign Out */}
          <button onClick={logout}
            className="w-full bg-white rounded-2xl border border-slate-200 px-5 py-4 flex items-center gap-3 hover:bg-red-50 hover:border-red-200 transition-colors group">
            <div className="w-9 h-9 bg-red-50 group-hover:bg-red-100 rounded-xl flex items-center justify-center">
              <svg className="w-5 h-5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            </div>
            <span className="text-sm font-medium text-red-600">Sign Out</span>
          </button>
        </div>
      )}
    </div>
  );
}
