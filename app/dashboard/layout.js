'use client';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';

export default function DashboardLayout({ children }) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [unreadChat, setUnreadChat] = useState(0);

  // Emergency state
  const [emergencyCountdown, setEmergencyCountdown] = useState(null);
  const [alertActive, setAlertActive] = useState(false);
  const [emergencyLock, setEmergencyLock] = useState(null);
  const [toast, setToast] = useState(null);
  const countdownRef = useRef(null);
  const audioCtxRef = useRef(null);
  const toastTimerRef = useRef(null);
  const userRef = useRef(null);
  const emergencyLockRef = useRef(null);

  // Keep ref in sync with state (avoids stale closure in intervals)
  useEffect(() => { emergencyLockRef.current = emergencyLock; }, [emergencyLock]);

  useEffect(() => {
    const saved = localStorage.getItem('pm_user');
    if (saved) {
      const u = JSON.parse(saved);
      if (u.role !== 'customer') {
        setUser(u);
        userRef.current = u;
      }
    }
  }, []);

  // ── POLL: unified check every 3 seconds ──
  useEffect(() => {
    if (!user || !supabase) return;

    // Run immediately
    pollEverything(user);

    const interval = setInterval(() => pollEverything(user), 3000);
    return () => clearInterval(interval);
  }, [user]);

  // Realtime for unread badge
  useEffect(() => {
    if (!supabase || !user) return;
    const ch = supabase.channel('dash-nav-unread')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pm_conversations' }, () => {
        pollEverything(user);
      })
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [user]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current);
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  // ── Single poll function: unread badge + emergency lockscreen ──
  async function pollEverything(u) {
    if (!supabase || !u) return;
    try {
      // ONE query gets all conversations — used for both unread badge AND emergency detection
      const { data } = await supabase.from('pm_conversations')
        .select('id, name, unread_count, participants, created_by, last_message_at');

      if (!data) return;

      const mine = data.filter(c => c.participants?.includes(u.id));

      // 1. Unread badge count
      const total = mine.reduce((sum, c) => sum + (c.unread_count?.[u.id] || 0), 0);
      setUnreadChat(total);

      // 2. Emergency lockscreen — check for EMERGENCY HELP conversations with unread
      checkEmergencyFromConversations(mine, u);
    } catch {}
  }

  // ── Emergency detection from conversations (same data as unread badge) ──
  function checkEmergencyFromConversations(conversations, u) {
    // Find the most recent emergency conversation with unread messages for this user
    const emergencyConvs = conversations
      .filter(c => c.name && c.name.includes('EMERGENCY HELP'))
      .filter(c => (c.unread_count?.[u.id] || 0) > 0)
      .sort((a, b) => (b.last_message_at || '').localeCompare(a.last_message_at || ''));

    const emergency = emergencyConvs[0];

    if (!emergency) {
      // No active emergency with unread messages — clear lockscreen if showing
      if (emergencyLockRef.current) {
        setEmergencyLock(null);
      }
      // Clear stale dismissals
      sessionStorage.removeItem('pm_emergency_dismissed');
      return;
    }

    // Don't lock the person who triggered it
    if (emergency.created_by === u.id) {
      if (!alertActive) setAlertActive(true);
      return;
    }

    // Already dismissed this specific conversation
    const dismissed = sessionStorage.getItem('pm_emergency_dismissed');
    if (dismissed === emergency.id) return;

    // Already showing this exact lockscreen
    if (emergencyLockRef.current?.convId === emergency.id) return;

    // SHOW LOCKSCREEN
    setEmergencyLock({
      convId: emergency.id,
      triggeredBy: emergency.name.replace('🚨 EMERGENCY HELP', '').trim() || 'Staff Member',
      content: '',
      at: emergency.last_message_at,
    });
    playBeep(1000, 300);
  }

  function playBeep(freq = 800, duration = 200) {
    try {
      if (!audioCtxRef.current) audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
      const ctx = audioCtxRef.current;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = freq;
      gain.gain.value = 0.3;
      osc.start();
      osc.stop(ctx.currentTime + duration / 1000);
    } catch {}
  }

  function showToast(message, type = 'info') {
    setToast({ message, type });
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), 3000);
  }

  // Create emergency group chat
  async function createEmergencyChat(u) {
    if (!supabase || !u) return;
    try {
      const { data: allProfiles } = await supabase.from('profiles').select('id, full_name, email, role')
        .eq('org_id', u.org_id);
      if (!allProfiles || allProfiles.length === 0) return;

      const participants = allProfiles.map(p => p.id);
      const participant_names = allProfiles.map(p => p.full_name || p.email || 'Unknown');
      const unread_count = {};
      participants.forEach(pid => { unread_count[pid] = pid === u.id ? 0 : 1; });

      // Try to get the user's pitch number
      let pitchNumber = '';
      const { data: pitches } = await supabase.from('pitches').select('pitch_number')
        .eq('customer_email', u.email).limit(1);
      if (pitches?.[0]) {
        pitchNumber = pitches[0].pitch_number;
      }

      const timestamp = new Date().toLocaleString('en-GB', {
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
      });

      const alertMessage = `🚨 EMERGENCY ALERT 🚨\n\nEmergency call made by: ${u.full_name || u.email}\nRole: ${u.role?.replace('_', ' ') || 'Staff'}${pitchNumber ? `\n📍 PITCH: ${pitchNumber}` : ''}\nTime: ${timestamp}\n\n⚠️ IMMEDIATE ASSISTANCE REQUIRED\nPlease check and update on this emergency here.\nRespond with status updates and actions taken.`;

      const { data: conv, error: convError } = await supabase.from('pm_conversations').insert({
        org_id: u.org_id,
        type: 'group',
        name: '🚨 EMERGENCY HELP',
        participants,
        participant_names,
        unread_count,
        created_by: u.id,
        last_message: '🚨 EMERGENCY ALERT',
        last_message_at: new Date().toISOString(),
        last_message_by: u.id,
      }).select().single();

      if (convError) { console.error('Emergency chat create error:', convError); return; }

      await supabase.from('pm_chat_messages').insert({
        conversation_id: conv.id,
        sender_id: u.id,
        sender_name: u.full_name || u.email,
        content: alertMessage,
        read_by: [u.id],
      });

      localStorage.setItem('pm_emergency_active', JSON.stringify({
        convId: conv.id, userId: u.id,
        triggeredBy: u.full_name || u.email,
        at: new Date().toISOString(),
      }));

      showToast('Emergency group chat created — all staff notified', 'warning');
    } catch (err) {
      console.error('Emergency chat error:', err);
    }
  }

  // Handle lockscreen responses (Acknowledge / On Route)
  async function handleEmergencyResponse(action) {
    if (!emergencyLock || !supabase || !user) return;
    const convId = emergencyLock.convId;

    try {
      // Mark all messages as read for this user
      const { data: unreadMsgs } = await supabase.from('pm_chat_messages')
        .select('id, read_by')
        .eq('conversation_id', convId);
      const toMark = (unreadMsgs || []).filter(m => !(m.read_by || []).includes(user.id));
      if (toMark.length > 0) {
        await Promise.all(toMark.map(m =>
          supabase.from('pm_chat_messages').update({ read_by: [...(m.read_by || []), user.id] }).eq('id', m.id)
        ));
      }

      // Clear unread count for this user
      const { data: convData } = await supabase.from('pm_conversations').select('unread_count').eq('id', convId).single();
      if (convData) {
        const uc = { ...(convData.unread_count || {}), [user.id]: 0 };
        await supabase.from('pm_conversations').update({ unread_count: uc }).eq('id', convId);
      }

      // Post response message
      const responseMsg = action === 'onroute'
        ? `🚨 ${user.full_name || user.email} is ON ROUTE to assist with the emergency.`
        : `✅ ${user.full_name || user.email} has acknowledged the emergency alert.`;

      await supabase.from('pm_chat_messages').insert({
        conversation_id: convId,
        sender_id: user.id,
        sender_name: user.full_name || user.email,
        content: responseMsg,
        read_by: [user.id],
      });

      await supabase.from('pm_conversations').update({
        last_message: responseMsg,
        last_message_at: new Date().toISOString(),
        last_message_by: user.id,
      }).eq('id', convId);
    } catch (err) {
      console.error('Emergency response error:', err);
    }

    // Dismiss lockscreen
    sessionStorage.setItem('pm_emergency_dismissed', convId);
    setEmergencyLock(null);

    // Navigate to emergency chat
    router.push('/dashboard/chat');
  }

  function startEmergencyCountdown() {
    if (emergencyCountdown !== null) return;
    showToast('Emergency alert starting — 10 second countdown', 'warning');
    playBeep(600, 150);
    let count = 10;
    setEmergencyCountdown(count);

    countdownRef.current = setInterval(() => {
      count--;
      if (count > 0) {
        setEmergencyCountdown(count);
        playBeep(count <= 3 ? 1000 : 800, count <= 3 ? 300 : 150);
      } else {
        clearInterval(countdownRef.current);
        countdownRef.current = null;
        setEmergencyCountdown(null);
        setAlertActive(true);
        playBeep(1200, 500);
        createEmergencyChat(user);
      }
    }, 1000);
  }

  function cancelEmergency() {
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }
    setEmergencyCountdown(null);
    showToast('Emergency alert cancelled', 'success');
  }

  function cancelAlert() {
    setAlertActive(false);
    localStorage.removeItem('pm_emergency_active');
    sessionStorage.removeItem('pm_emergency_dismissed');
    showToast('Emergency alert stood down', 'success');
  }

  if (!user) return children;

  const isPrivileged = ['super_admin', 'admin', 'developer'].includes(user.role);
  const isHome = pathname === '/dashboard';
  const isChat = pathname === '/dashboard/chat';
  const isProfile = pathname === '/dashboard/profile';
  const isEmergency = pathname === '/dashboard/emergency';
  const isSettings = pathname === '/dashboard/settings';

  const tabs = [
    {
      key: 'home', label: 'Home', href: '/dashboard', active: isHome,
      icon: (
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
        </svg>
      ),
    },
    {
      key: 'chat', label: 'Chat', href: '/dashboard/chat', active: isChat, badge: unreadChat,
      icon: (
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
      ),
    },
    {
      key: 'profile', label: 'Profile', href: '/dashboard/profile', active: isProfile,
      icon: (
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
        </svg>
      ),
    },
    {
      key: 'emergency', label: 'SOS', href: '/dashboard/emergency', active: isEmergency, sos: true,
      icon: (
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
        </svg>
      ),
    },
    {
      key: 'settings', label: 'Settings', href: '/dashboard/settings', active: isSettings,
      icon: (
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      ),
    },
  ];

  return (
    <div className="min-h-screen flex flex-col">
      <div className="flex-1 pb-[68px]">
        {children}
      </div>

      {/* ── Emergency Lockscreen (incoming alert for other users) ── */}
      {emergencyLock && (
        <div className="fixed inset-0 z-[10000] bg-red-700 flex flex-col items-center justify-center px-6">
          <div className="absolute inset-0 bg-red-600 animate-pulse opacity-50" />

          <div className="relative z-10 text-center max-w-md">
            <div className="w-24 h-24 rounded-full border-4 border-white/40 flex items-center justify-center mx-auto mb-6 animate-bounce">
              <svg className="w-14 h-14 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
            </div>

            <h1 className="text-3xl font-black text-white mb-2 tracking-wide">EMERGENCY ON SITE</h1>
            <p className="text-lg text-white/90 font-semibold mb-1">Immediate assistance required</p>

            <div className="space-y-3 mt-8">
              <button
                onClick={() => handleEmergencyResponse('onroute')}
                className="w-full py-5 bg-white text-red-700 rounded-2xl text-lg font-black hover:bg-red-50 active:bg-red-100 transition-colors shadow-2xl flex items-center justify-center gap-3"
              >
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                </svg>
                ON ROUTE TO HELP
              </button>

              <button
                onClick={() => handleEmergencyResponse('acknowledge')}
                className="w-full py-4 bg-white/20 text-white border-2 border-white/40 rounded-2xl text-base font-bold hover:bg-white/30 active:bg-white/40 transition-colors flex items-center justify-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                ACKNOWLEDGE
              </button>
            </div>

            <p className="text-xs text-white/50 mt-6">Tap a button to dismiss and view the emergency chat</p>
          </div>
        </div>
      )}

      {/* Floating Emergency Button — on all pages except SOS page */}
      {!isEmergency && !emergencyLock && (
        <button
          onClick={startEmergencyCountdown}
          className="fixed bottom-[84px] right-4 z-40 w-14 h-14 bg-red-600 hover:bg-red-700 active:bg-red-800 text-white rounded-full shadow-lg flex items-center justify-center transition-colors"
          title="Emergency — I Need Help"
        >
          <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
        </button>
      )}

      {/* Emergency Countdown Overlay */}
      {emergencyCountdown !== null && (
        <div className="fixed inset-0 z-[9999] bg-black/80 flex flex-col items-center justify-center">
          <div className="text-center">
            <div className="w-32 h-32 rounded-full border-4 border-red-500 flex items-center justify-center mx-auto mb-6 animate-pulse">
              <span className="text-6xl font-bold text-red-500">{emergencyCountdown}</span>
            </div>
            <h2 className="text-2xl font-bold text-white mb-2">Emergency Alert</h2>
            <p className="text-sm text-white/70 mb-8">Alert in {emergencyCountdown} seconds</p>
            <button onClick={cancelEmergency}
              className="px-8 py-4 bg-white text-slate-900 rounded-2xl text-lg font-bold hover:bg-slate-100 active:bg-slate-200 transition-colors">
              Cancel Alert
            </button>
            <p className="text-xs text-white/50 mt-3">Pressed by mistake? Tap cancel above</p>
          </div>
        </div>
      )}

      {/* Active Alert Banner (for the user who triggered it) */}
      {alertActive && (
        <div className="fixed top-0 left-0 right-0 z-[9998] bg-red-600 animate-pulse">
          <div className="max-w-lg mx-auto px-4 py-4 flex items-center gap-3">
            <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center flex-shrink-0">
              <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
            </div>
            <div className="flex-1">
              <p className="text-white font-bold text-sm">EMERGENCY ALERT ACTIVE</p>
              <p className="text-white/80 text-xs">All staff have been notified</p>
            </div>
            {isPrivileged && (
              <button onClick={cancelAlert}
                className="bg-white text-red-700 px-4 py-2 rounded-xl text-xs font-bold flex-shrink-0 hover:bg-red-50 active:bg-red-100">
                Stand Down
              </button>
            )}
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 left-4 right-4 z-[9999] max-w-lg mx-auto rounded-xl px-4 py-3 shadow-lg ${
          toast.type === 'warning' ? 'bg-amber-500 text-white' :
          toast.type === 'success' ? 'bg-emerald-600 text-white' :
          'bg-slate-800 text-white'
        }`}>
          <p className="text-sm font-medium text-center">{toast.message}</p>
        </div>
      )}

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-slate-200 shadow-lg"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
        <div className="max-w-lg mx-auto flex items-center justify-around h-[64px]">
          {tabs.map(tab => (
            <Link
              key={tab.key}
              href={tab.href}
              className={`relative flex flex-col items-center justify-center gap-0.5 px-2 py-1.5 rounded-xl transition-colors min-w-[52px] ${
                tab.sos
                  ? tab.active ? 'text-red-600' : 'text-red-400 hover:text-red-600'
                  : tab.active
                    ? 'text-emerald-600'
                    : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              <div className="relative">
                {tab.icon}
                {tab.badge > 0 && (
                  <span className="absolute -top-1.5 -right-2 bg-red-500 text-white text-[10px] font-bold min-w-[18px] h-[18px] px-1 rounded-full flex items-center justify-center">
                    {tab.badge > 99 ? '99+' : tab.badge}
                  </span>
                )}
              </div>
              <span className={`text-[10px] font-semibold ${
                tab.sos
                  ? tab.active ? 'text-red-600' : 'text-red-400'
                  : tab.active ? 'text-emerald-600' : 'text-slate-400'
              }`}>
                {tab.label}
              </span>
              {tab.active && (
                <div className={`absolute -top-px left-1/2 -translate-x-1/2 w-8 h-0.5 rounded-full ${tab.sos ? 'bg-red-500' : 'bg-emerald-500'}`} />
              )}
            </Link>
          ))}
        </div>
      </nav>
    </div>
  );
}
