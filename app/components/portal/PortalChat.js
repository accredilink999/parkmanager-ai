'use client';
import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

/* ─── helpers ─── */
function timeAgo(d) {
  if (!d) return '';
  const now = new Date(), t = new Date(d), diff = now - t;
  if (diff < 60000) return 'now';
  if (diff < 3600000) return `${Math.floor(diff/60000)}m`;
  if (diff < 86400000) return `${Math.floor(diff/3600000)}h`;
  return t.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
}
function fmtTime(d) {
  if (!d) return '';
  return new Date(d).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}
function fmtDateSep(d) {
  const now = new Date(), t = new Date(d);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const msgDay = new Date(t.getFullYear(), t.getMonth(), t.getDate());
  const diff = (today - msgDay) / 86400000;
  if (diff === 0) return 'TODAY';
  if (diff === 1) return 'YESTERDAY';
  return t.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }).toUpperCase();
}
function isSameDay(a, b) {
  const d1 = new Date(a), d2 = new Date(b);
  return d1.getFullYear() === d2.getFullYear() && d1.getMonth() === d2.getMonth() && d1.getDate() === d2.getDate();
}
function initials(n) { return !n ? '?' : n.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2); }
function getNameColor(name) {
  const colors = ['#e17076','#7bc862','#e5a64e','#65aadd','#a695e7','#ee7aae','#6ec9cb','#faa774'];
  let h = 0; for (let i = 0; i < (name||'').length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return colors[Math.abs(h) % colors.length];
}
function playSendSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const now = ctx.currentTime;
    [600, 900].forEach((f, i) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination); o.frequency.value = f; o.type = 'sine';
      g.gain.setValueAtTime(0.12, now + i*0.06);
      g.gain.exponentialRampToValueAtTime(0.001, now + i*0.06 + 0.1);
      o.start(now + i*0.06); o.stop(now + i*0.06 + 0.1);
    });
  } catch {}
}
function playNotifSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const now = ctx.currentTime;
    [440, 660, 880].forEach((f, i) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination); o.frequency.value = f; o.type = 'sine';
      g.gain.setValueAtTime(0.15, now + i*0.08);
      g.gain.exponentialRampToValueAtTime(0.001, now + i*0.08 + 0.15);
      o.start(now + i*0.08); o.stop(now + i*0.08 + 0.15);
    });
  } catch {}
}

export default function PortalChat({ user, siteName }) {
  // ── State ──
  const [view, setView] = useState('list'); // 'list' | 'chat'
  const [conversations, setConversations] = useState([]);
  const [selectedConv, setSelectedConv] = useState(null);
  const [messages, setMessages] = useState([]);
  const [message, setMessage] = useState('');
  const [contacts, setContacts] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [showNewChat, setShowNewChat] = useState(false);
  const [chatMode, setChatMode] = useState('private');
  const [selectedUsers, setSelectedUsers] = useState([]);
  const [groupName, setGroupName] = useState('');
  const [newChatStep, setNewChatStep] = useState(1);
  const [contactSearch, setContactSearch] = useState('');
  const [replyTo, setReplyTo] = useState(null);
  const [contextMenu, setContextMenu] = useState(null);
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [recording, setRecording] = useState(false);
  const [recordDuration, setRecordDuration] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [playingAudio, setPlayingAudio] = useState(null);
  const [toast, setToast] = useState(null);
  const [expandedImage, setExpandedImage] = useState(null);
  const [editingMsg, setEditingMsg] = useState(null);
  const [editText, setEditText] = useState('');

  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const menuRef = useRef(null);
  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const recordTimerRef = useRef(null);
  const audioRef = useRef(null);
  const toastTimerRef = useRef(null);
  const selectedConvRef = useRef(null);
  const recordStartRef = useRef(0);

  useEffect(() => { selectedConvRef.current = selectedConv; }, [selectedConv]);

  // ── Request mic + camera permissions on load ──
  useEffect(() => {
    navigator.mediaDevices?.getUserMedia({ audio: true })
      .then(stream => stream.getTracks().forEach(t => t.stop()))
      .catch(() => {});
    navigator.mediaDevices?.getUserMedia({ video: true })
      .then(stream => stream.getTracks().forEach(t => t.stop()))
      .catch(() => {});
  }, []);

  // ── Load conversations ──
  const loadConversations = useCallback(async () => {
    if (!supabase || !user) return;
    const { data, error } = await supabase
      .from('pm_conversations').select('*')
      .order('last_message_at', { ascending: false, nullsFirst: false });
    if (error) console.error('Load conversations error:', error);
    const mine = (data || []).filter(c => c.participants?.includes(user.id));
    setConversations(mine);
    setLoading(false);
  }, [user]);

  useEffect(() => { if (user) loadConversations(); }, [user, loadConversations]);

  // ── Load contacts ──
  useEffect(() => {
    if (!supabase || !user) return;
    supabase.from('profiles').select('id, email, full_name, role, org_id')
      .eq('org_id', user.org_id)
      .then(({ data }) => {
        setContacts((data || []).filter(u => u.id !== user.id));
      });
  }, [user]);

  // ── Load messages ──
  const loadMessages = useCallback(async () => {
    if (!supabase || !selectedConv) return;
    const { data } = await supabase
      .from('pm_chat_messages').select('*')
      .eq('conversation_id', selectedConv.id)
      .order('created_at', { ascending: true }).limit(500);
    setMessages(data || []);

    // Mark unread
    const unread = (data || []).filter(m => m.sender_id !== user.id && !m.read_by?.includes(user.id));
    if (unread.length > 0) {
      await Promise.all(unread.map(m =>
        supabase.from('pm_chat_messages').update({ read_by: [...(m.read_by || []), user.id] }).eq('id', m.id)
      ));
      await supabase.from('pm_conversations').update({
        unread_count: { ...(selectedConv.unread_count || {}), [user.id]: 0 }
      }).eq('id', selectedConv.id);
      loadConversations();
    }
  }, [selectedConv, user, loadConversations]);

  useEffect(() => { if (selectedConv) loadMessages(); else setMessages([]); }, [selectedConv?.id, loadMessages]);

  // ── Scroll to bottom ──
  useEffect(() => {
    if (messages.length > 0) setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
  }, [messages.length]);

  // ── Realtime + toast ──
  useEffect(() => {
    if (!supabase || !user) return;
    const ch = supabase.channel('pm-portal-chat-v2')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'pm_chat_messages' }, (p) => {
        const newMsg = p.new;
        if (selectedConvRef.current && newMsg?.conversation_id === selectedConvRef.current.id) loadMessages();
        loadConversations();
        if (newMsg?.sender_id !== user.id) {
          playNotifSound();
          if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
          setToast({ sender: newMsg.sender_name || 'Someone', content: newMsg.content || 'New message', convId: newMsg.conversation_id });
          toastTimerRef.current = setTimeout(() => setToast(null), 4000);
        }
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'pm_chat_messages' }, () => {
        if (selectedConvRef.current) loadMessages();
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'pm_chat_messages' }, () => {
        if (selectedConvRef.current) loadMessages();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pm_conversations' }, () => loadConversations())
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [user, loadMessages, loadConversations]);

  // ── Close context menu ──
  useEffect(() => {
    if (!contextMenu) return;
    const handler = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setContextMenu(null); };
    document.addEventListener('mousedown', handler);
    document.addEventListener('touchstart', handler);
    return () => { document.removeEventListener('mousedown', handler); document.removeEventListener('touchstart', handler); };
  }, [contextMenu]);

  // ── Send text message ──
  async function handleSend(e) {
    e?.preventDefault();
    if (!message.trim() || !selectedConv || sending) return;
    setSending(true);
    const content = message.trim();
    setMessage('');

    try {
      await supabase.from('pm_chat_messages').insert({
        conversation_id: selectedConv.id,
        sender_id: user.id,
        sender_name: user.full_name || user.email,
        content,
        read_by: [user.id],
        reply_to_id: replyTo?.id || null,
      });
      const others = (selectedConv.participants || []).filter(p => p !== user.id);
      const uc = { ...(selectedConv.unread_count || {}), [user.id]: 0 };
      others.forEach(p => { uc[p] = (uc[p] || 0) + 1; });
      await supabase.from('pm_conversations').update({
        last_message: content,
        last_message_at: new Date().toISOString(),
        last_message_by: user.id,
        unread_count: uc,
      }).eq('id', selectedConv.id);
      setReplyTo(null);
      playSendSound();
      loadMessages();
      loadConversations();
    } catch (err) { console.error('Send failed:', err); }
    setSending(false);
  }

  // ── Send attachment (image) ──
  async function handleImageUpload(e) {
    const file = e.target.files?.[0];
    if (!file || !selectedConv) return;
    setUploading(true);
    try {
      const reader = new FileReader();
      reader.onload = async () => {
        const dataUrl = reader.result;
        await supabase.from('pm_chat_messages').insert({
          conversation_id: selectedConv.id,
          sender_id: user.id,
          sender_name: user.full_name || user.email,
          content: '📷 Photo',
          attachment_url: dataUrl,
          attachment_type: 'image',
          read_by: [user.id],
        });
        const others = (selectedConv.participants || []).filter(p => p !== user.id);
        const uc = { ...(selectedConv.unread_count || {}), [user.id]: 0 };
        others.forEach(p => { uc[p] = (uc[p] || 0) + 1; });
        await supabase.from('pm_conversations').update({
          last_message: '📷 Photo',
          last_message_at: new Date().toISOString(),
          last_message_by: user.id,
          unread_count: uc,
        }).eq('id', selectedConv.id);
        playSendSound();
        setUploading(false);
        loadMessages();
        loadConversations();
      };
      reader.readAsDataURL(file);
    } catch { setUploading(false); }
    e.target.value = '';
  }

  // ── Voice recording (hold to record, release to send) ──
  async function startRecording(e) {
    e?.preventDefault();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream, { mimeType: MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4' });
      audioChunksRef.current = [];
      mr.ondataavailable = (ev) => { if (ev.data.size > 0) audioChunksRef.current.push(ev.data); };
      mr.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        if (audioChunksRef.current.length === 0) return;
        const elapsed = Date.now() - recordStartRef.current;
        if (elapsed < 400) return;

        const blob = new Blob(audioChunksRef.current, { type: mr.mimeType });
        const conv = selectedConvRef.current;
        if (!conv) return;

        // Optimistic: show voice note immediately
        const tempUrl = URL.createObjectURL(blob);
        setMessages(prev => [...prev, {
          id: 'opt-voice-' + Date.now(), conversation_id: conv.id, sender_id: user.id,
          sender_name: user.full_name || user.email, content: '🎤 Voice Note',
          attachment_url: tempUrl, attachment_type: 'audio',
          read_by: [user.id], created_at: new Date().toISOString(),
        }]);
        playSendSound();

        const reader = new FileReader();
        reader.onload = async () => {
          await supabase.from('pm_chat_messages').insert({
            conversation_id: conv.id, sender_id: user.id,
            sender_name: user.full_name || user.email, content: '🎤 Voice Note',
            attachment_url: reader.result, attachment_type: 'audio', read_by: [user.id],
          });
          const others = (conv.participants || []).filter(p => p !== user.id);
          const uc = { ...(conv.unread_count || {}), [user.id]: 0 };
          others.forEach(p => { uc[p] = (uc[p] || 0) + 1; });
          await supabase.from('pm_conversations').update({
            last_message: '🎤 Voice Note', last_message_at: new Date().toISOString(),
            last_message_by: user.id, unread_count: uc,
          }).eq('id', conv.id);
          loadMessages();
          loadConversations();
          URL.revokeObjectURL(tempUrl);
        };
        reader.readAsDataURL(blob);
      };
      mr.start();
      mediaRecorderRef.current = mr;
      recordStartRef.current = Date.now();
      setRecording(true);
      setRecordDuration(0);
      recordTimerRef.current = setInterval(() => setRecordDuration(d => d + 1), 1000);

      const release = () => {
        document.removeEventListener('pointerup', release);
        document.removeEventListener('pointercancel', release);
        if (mediaRecorderRef.current?.state === 'recording') mediaRecorderRef.current.stop();
        setRecording(false);
        clearInterval(recordTimerRef.current);
      };
      document.addEventListener('pointerup', release);
      document.addEventListener('pointercancel', release);
    } catch (err) { console.error('Mic access denied:', err); }
  }

  // ── Play audio ──
  function toggleAudio(url, msgId) {
    if (playingAudio === msgId) {
      audioRef.current?.pause();
      setPlayingAudio(null);
    } else {
      if (audioRef.current) audioRef.current.pause();
      const a = new Audio(url);
      a.onended = () => setPlayingAudio(null);
      a.play();
      audioRef.current = a;
      setPlayingAudio(msgId);
    }
  }

  const isPrivileged = ['super_admin', 'admin', 'developer'].includes(user?.role);

  // ── Edit message ──
  async function saveEdit() {
    if (!editingMsg || !editText.trim()) return;
    await supabase.from('pm_chat_messages').update({ content: editText.trim(), is_edited: true }).eq('id', editingMsg.id);
    setEditingMsg(null);
    setEditText('');
    loadMessages();
  }

  function startEdit(msg) {
    setEditingMsg(msg);
    setEditText(msg.content || '');
    setContextMenu(null);
  }

  // ── Delete message ──
  async function deleteMessage(msgId) {
    await supabase.from('pm_chat_messages').delete().eq('id', msgId);
    setContextMenu(null);
    if (selectedConv) {
      const { data: remaining } = await supabase.from('pm_chat_messages')
        .select('content, created_at, sender_id')
        .eq('conversation_id', selectedConv.id)
        .order('created_at', { ascending: false }).limit(1);
      const last = remaining?.[0];
      await supabase.from('pm_conversations').update({
        last_message: last?.content || null,
        last_message_at: last?.created_at || null,
        last_message_by: last?.sender_id || null,
      }).eq('id', selectedConv.id);
    }
    loadMessages();
    loadConversations();
  }

  // ── New chat helpers ──
  function closeNewChat() {
    setShowNewChat(false);
    setContactSearch('');
    setChatMode('private');
    setSelectedUsers([]);
    setGroupName('');
    setNewChatStep(1);
  }

  async function startDirectChat(contact) {
    const existing = conversations.find(c =>
      c.type === 'direct' && c.participants?.includes(contact.id) && c.participants?.includes(user.id)
    );
    if (existing) { openConversation(existing); closeNewChat(); return; }
    const participants = [user.id, contact.id];
    const participant_names = [user.full_name || user.email, contact.full_name || contact.email];
    const { data, error } = await supabase.from('pm_conversations').insert({
      org_id: user.org_id, type: 'direct', participants, participant_names,
      unread_count: participants.reduce((a, p) => ({ ...a, [p]: 0 }), {}),
      created_by: user.id,
    }).select().single();
    if (error) { console.error('Start chat error:', error); alert('Failed to start chat: ' + (error.message || 'Unknown error')); return; }
    if (data) { openConversation(data); loadConversations(); }
    closeNewChat();
  }

  async function createGroupChat() {
    if (selectedUsers.length === 0 || !groupName.trim()) return;
    const participants = [user.id, ...selectedUsers];
    const participant_names = [
      user.full_name || user.email,
      ...selectedUsers.map(id => { const c = contacts.find(c => c.id === id); return c?.full_name || c?.email || 'Unknown'; }),
    ];
    const { data, error } = await supabase.from('pm_conversations').insert({
      org_id: user.org_id, type: 'group', name: groupName.trim(), participants, participant_names,
      unread_count: participants.reduce((a, p) => ({ ...a, [p]: 0 }), {}),
      created_by: user.id,
    }).select().single();
    if (error) { console.error('Create group error:', error); alert('Failed to create group: ' + (error.message || 'Unknown error')); return; }
    if (data) { openConversation(data); loadConversations(); }
    closeNewChat();
  }

  function handleSelectContact(contactId) {
    if (chatMode === 'private') {
      const contact = contacts.find(c => c.id === contactId);
      if (contact) startDirectChat(contact);
    } else {
      setSelectedUsers(prev => prev.includes(contactId) ? prev.filter(id => id !== contactId) : [...prev, contactId]);
    }
  }

  function openConversation(conv) {
    setSelectedConv(conv);
    setView('chat');
  }

  function backToList() {
    setSelectedConv(null);
    setView('list');
    setReplyTo(null);
  }

  function handleToastClick(convId) {
    const conv = conversations.find(c => c.id === convId);
    if (conv) { setSelectedConv(conv); setView('chat'); }
    setToast(null);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
  }

  // ── Derived ──
  const convDisplayName = (conv) => {
    if (conv.type === 'group') return conv.name || 'Group';
    return conv.participant_names?.find((_, i) => conv.participants?.[i] !== user?.id) || 'Chat';
  };

  const filteredConvs = conversations.filter(c => {
    if (!searchQuery) return true;
    const name = convDisplayName(c);
    return name.toLowerCase().includes(searchQuery.toLowerCase());
  });

  const totalUnread = conversations.reduce((sum, c) => sum + (c.unread_count?.[user?.id] || 0), 0);

  const filteredContacts = contacts.filter(c => {
    if (!contactSearch) return true;
    return (c.full_name || c.email || '').toLowerCase().includes(contactSearch.toLowerCase());
  }).sort((a, b) => (a.full_name || a.email || '').localeCompare(b.full_name || b.email || ''));

  const messagesById = useMemo(() => {
    const map = {}; messages.forEach(m => { map[m.id] = m; }); return map;
  }, [messages]);

  const groupedMessages = useMemo(() => {
    const groups = []; let lastDate = null;
    messages.forEach((msg, idx) => {
      if (!lastDate || !isSameDay(lastDate, msg.created_at)) {
        groups.push({ type: 'date', date: msg.created_at, id: `date-${idx}` });
        lastDate = msg.created_at;
      }
      const prev = idx > 0 ? messages[idx - 1] : null;
      const showAvatar = !prev || prev.sender_id !== msg.sender_id || !isSameDay(prev.created_at, msg.created_at);
      groups.push({ type: 'msg', msg, showAvatar, id: msg.id });
    });
    return groups;
  }, [messages]);

  const isGroup = selectedConv?.type === 'group';

  if (loading) {
    return <div className="flex items-center justify-center py-20"><div className="w-8 h-8 border-4 border-emerald-200 border-t-emerald-500 rounded-full animate-spin" /></div>;
  }

  // ═══════════════════════════════════
  // ── CONVERSATION LIST VIEW ──
  // ═══════════════════════════════════
  // ── Toast + Expanded Image (shared across views) ──
  const toastEl = toast && (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[9999] w-[90%] max-w-md animate-in slide-in-from-top fade-in duration-300 cursor-pointer"
      onClick={() => handleToastClick(toast.convId)}>
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 px-4 py-3 flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0">
          <span className="text-sm font-bold text-emerald-700">{initials(toast.sender)}</span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-slate-900 truncate">{toast.sender}</p>
          <p className="text-xs text-slate-500 truncate">{toast.content}</p>
        </div>
        <button onClick={(e) => { e.stopPropagation(); setToast(null); }} className="p-1 hover:bg-slate-100 rounded-full flex-shrink-0">
          <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
      </div>
    </div>
  );

  const expandedImageEl = expandedImage && (
    <div className="fixed inset-0 z-[9998] bg-black/90 flex items-center justify-center" onClick={() => setExpandedImage(null)}>
      <button className="absolute top-4 right-4 p-2 bg-white/20 hover:bg-white/30 rounded-full" onClick={() => setExpandedImage(null)}>
        <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
      </button>
      <img src={expandedImage} alt="" className="max-w-[95vw] max-h-[90vh] object-contain rounded-lg" onClick={(e) => e.stopPropagation()} />
    </div>
  );

  if (view === 'list') {
    return (
      <div className="space-y-2">
        {toastEl}
        {expandedImageEl}
        {/* Search + New */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
            <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search chats..."
              className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-2xl text-sm outline-none focus:ring-2 focus:ring-emerald-500" />
          </div>
          <button onClick={() => setShowNewChat(true)} className="w-10 h-10 bg-emerald-500 hover:bg-emerald-600 text-white rounded-2xl flex items-center justify-center transition-colors flex-shrink-0">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
          </button>
        </div>

        {/* Conversation list */}
        {filteredConvs.length === 0 ? (
          <div className="text-center py-16">
            <svg className="w-16 h-16 text-slate-200 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
            <p className="text-sm text-slate-500">No conversations yet</p>
            <button onClick={() => setShowNewChat(true)} className="text-sm text-emerald-600 font-semibold mt-2">Start a chat</button>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden divide-y divide-slate-100">
            {filteredConvs.map(conv => {
              const name = convDisplayName(conv);
              const unread = conv.unread_count?.[user?.id] || 0;
              return (
                <button key={conv.id} onClick={() => openConversation(conv)} className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition-colors text-left">
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 ${conv.type === 'group' ? 'bg-teal-100' : 'bg-emerald-100'}`}>
                    {conv.type === 'group' ? (
                      <svg className="w-6 h-6 text-teal-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                    ) : (
                      <span className="text-sm font-bold text-emerald-700">{initials(name)}</span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <p className="font-semibold text-slate-900 text-[15px] truncate">{name}</p>
                      <span className="text-[11px] text-slate-400 flex-shrink-0 ml-2">{timeAgo(conv.last_message_at)}</span>
                    </div>
                    <div className="flex items-center justify-between mt-0.5">
                      <p className="text-sm text-slate-500 truncate">{conv.last_message || 'No messages yet'}</p>
                      {unread > 0 && <span className="bg-emerald-500 text-white text-[10px] font-bold min-w-[20px] h-5 px-1.5 rounded-full flex items-center justify-center flex-shrink-0 ml-2">{unread}</span>}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {/* ── New Chat Modal ── */}
        {showNewChat && (
          <div className="fixed inset-0 z-50 bg-black/50 flex items-end justify-center" onClick={closeNewChat}>
            <div className="bg-white w-full rounded-t-2xl max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
              {newChatStep === 1 && (
                <>
                  <div className="px-5 pt-5 pb-3 border-b border-slate-100">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <h3 className="text-lg font-bold text-slate-900">New Chat</h3>
                        {chatMode === 'group' && selectedUsers.length > 0 && <p className="text-xs text-emerald-600">{selectedUsers.length} selected</p>}
                      </div>
                      <button onClick={closeNewChat} className="p-1 hover:bg-slate-100 rounded-full">
                        <svg className="w-5 h-5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                      </button>
                    </div>
                    <div className="flex gap-2 mb-3">
                      {[{ key: 'private', label: 'Private' }, { key: 'group', label: 'New Group' }].map(t => (
                        <button key={t.key} onClick={() => { setChatMode(t.key); setSelectedUsers([]); }}
                          className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${chatMode === t.key ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-600'}`}>{t.label}</button>
                      ))}
                    </div>
                    <div className="relative">
                      <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                      <input value={contactSearch} onChange={e => setContactSearch(e.target.value)} placeholder="Search contacts..."
                        className="w-full pl-10 pr-4 py-2.5 bg-slate-100 rounded-xl text-sm outline-none focus:ring-2 focus:ring-emerald-500" autoFocus />
                    </div>
                    {chatMode === 'group' && selectedUsers.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-3">
                        {selectedUsers.map(id => {
                          const c = contacts.find(c => c.id === id);
                          return (
                            <span key={id} className="inline-flex items-center gap-1 bg-emerald-50 text-slate-800 text-xs px-2.5 py-1 rounded-full border border-emerald-200">
                              {(c?.full_name || c?.email || '?').split(' ')[0]}
                              <button onClick={() => setSelectedUsers(prev => prev.filter(uid => uid !== id))} className="hover:text-red-500">&times;</button>
                            </span>
                          );
                        })}
                      </div>
                    )}
                  </div>
                  <div className="flex-1 overflow-y-auto">
                    {filteredContacts.map(c => {
                      const name = c.full_name || c.email;
                      const isSelected = selectedUsers.includes(c.id);
                      return (
                        <button key={c.id} onClick={() => handleSelectContact(c.id)} className="w-full flex items-center gap-3 px-5 py-3 hover:bg-slate-50 text-left">
                          <div className="relative">
                            <div className="w-11 h-11 rounded-full bg-emerald-100 flex items-center justify-center"><span className="text-sm font-bold text-emerald-700">{initials(name)}</span></div>
                            {chatMode === 'group' && isSelected && (
                              <div className="absolute -bottom-0.5 -right-0.5 w-5 h-5 bg-emerald-500 rounded-full flex items-center justify-center border-2 border-white">
                                <span className="text-white text-xs font-bold">&#10003;</span>
                              </div>
                            )}
                          </div>
                          <div className="flex-1 min-w-0 border-b border-slate-100 pb-3">
                            <p className="font-medium text-slate-900 text-[15px]">{name}</p>
                            <p className="text-sm text-slate-500 capitalize">{c.role || 'Staff'}</p>
                          </div>
                        </button>
                      );
                    })}
                    {filteredContacts.length === 0 && <div className="py-12 text-center text-sm text-slate-500">No contacts found</div>}
                  </div>
                  {chatMode === 'group' && selectedUsers.length > 0 && (
                    <div className="p-4 border-t border-slate-100">
                      <button onClick={() => setNewChatStep(2)} className="w-full py-2.5 bg-emerald-500 text-white rounded-xl font-semibold text-sm">Next ({selectedUsers.length} selected)</button>
                    </div>
                  )}
                </>
              )}
              {newChatStep === 2 && (
                <div className="p-6 space-y-5">
                  <div className="flex items-center gap-3 mb-2">
                    <button onClick={() => setNewChatStep(1)} className="p-1 hover:bg-slate-100 rounded-full">
                      <svg className="w-5 h-5 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
                    </button>
                    <h3 className="text-lg font-bold text-slate-900">New Group</h3>
                  </div>
                  <input value={groupName} onChange={e => setGroupName(e.target.value)} placeholder="Group name"
                    className="w-full text-lg border-b-2 border-emerald-500 pb-2 outline-none placeholder:text-slate-400" autoFocus />
                  <div>
                    <p className="text-sm text-slate-500 mb-2">Members: {selectedUsers.length}</p>
                    <div className="flex flex-wrap gap-3">
                      {selectedUsers.map(id => {
                        const c = contacts.find(c => c.id === id); const name = c?.full_name || c?.email || '?';
                        return (
                          <div key={id} className="flex flex-col items-center w-16">
                            <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center"><span className="text-xs font-bold text-emerald-700">{initials(name)}</span></div>
                            <p className="text-xs text-slate-600 truncate w-full text-center mt-1">{name.split(' ')[0]}</p>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  <button onClick={createGroupChat} disabled={!groupName.trim()} className="w-full py-2.5 bg-emerald-500 disabled:opacity-50 text-white rounded-xl font-semibold text-sm">Create Group</button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  // ═══════════════════════════════════
  // ── CHAT VIEW ──
  // ═══════════════════════════════════
  return (
    <div className="flex flex-col" style={{ height: 'calc(100dvh - 140px)' }}>
      {toastEl}
      {expandedImageEl}
      {/* Header */}
      <div className="bg-white border border-slate-200 rounded-2xl p-3 mb-2 flex items-center gap-3">
        <button onClick={backToList} className="p-1.5 hover:bg-slate-100 rounded-lg flex-shrink-0">
          <svg className="w-5 h-5 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
        </button>
        <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${isGroup ? 'bg-teal-100' : 'bg-emerald-100'}`}>
          {isGroup ? (
            <svg className="w-5 h-5 text-teal-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
          ) : (
            <span className="text-sm font-bold text-emerald-700">{initials(convDisplayName(selectedConv))}</span>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-slate-900 truncate">{convDisplayName(selectedConv)}</p>
          <p className="text-xs text-slate-400">{isGroup ? `${selectedConv.participant_names?.length || 0} members` : 'Direct message'}</p>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto rounded-2xl border border-slate-200 bg-[#efeae2] py-2"
        style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23c8b89a' fill-opacity='0.08'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")` }}>
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 px-6">
            <div className="w-16 h-16 rounded-full bg-white/80 flex items-center justify-center mb-3">
              <svg className="w-8 h-8 text-emerald-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
            </div>
            <p className="text-sm text-slate-600 font-medium">No messages yet</p>
            <p className="text-xs text-slate-400 mt-1">Send a message to start the conversation</p>
          </div>
        )}

        {groupedMessages.map(item => {
          if (item.type === 'date') {
            return <div key={item.id} className="flex justify-center my-3"><span className="bg-white/90 text-slate-500 text-[12px] px-3 py-1 rounded-lg shadow-sm font-medium">{fmtDateSep(item.date)}</span></div>;
          }
          const msg = item.msg;
          const isOwn = msg.sender_id === user.id;
          const replyToMsg = msg.reply_to_id ? messagesById[msg.reply_to_id] : null;
          const readCount = msg.read_by?.filter(id => id !== msg.sender_id).length || 0;
          const totalOthers = Math.max(0, (selectedConv?.participants?.length || 0) - 1);
          const isRead = readCount >= totalOthers && totalOthers > 0;

          return (
            <div key={msg.id} className={`flex gap-1.5 mb-0.5 px-2 ${isOwn ? 'justify-end' : 'justify-start'}`}>
              {!isOwn && isGroup && item.showAvatar && (
                <div className="w-7 h-7 rounded-full bg-slate-200 flex items-center justify-center mt-auto mb-1 flex-shrink-0">
                  <span className="text-[10px] font-bold text-slate-600">{initials(msg.sender_name)}</span>
                </div>
              )}
              {!isOwn && isGroup && !item.showAvatar && <div className="w-7 flex-shrink-0" />}

              <div className="max-w-[80%] min-w-0">
                {!isOwn && isGroup && item.showAvatar && (
                  <p className="text-xs font-semibold px-1 mb-0.5" style={{ color: getNameColor(msg.sender_name) }}>{msg.sender_name}</p>
                )}
                <div
                  className={`relative rounded-lg px-2.5 py-1.5 shadow-sm select-text ${isOwn ? 'bg-[#d9fdd3] rounded-tr-none' : 'bg-white rounded-tl-none'}`}
                  onClick={(e) => { e.stopPropagation(); setContextMenu({ msgId: msg.id, x: e.clientX, y: e.clientY, isOwn, msg }); }}
                >
                  {replyToMsg && (
                    <div className={`border-l-4 rounded px-2 py-1 mb-1.5 text-xs ${replyToMsg.sender_id === user.id ? 'border-emerald-500 bg-emerald-50' : 'border-blue-400 bg-blue-50'}`}>
                      <p className="font-semibold text-emerald-700 truncate">{replyToMsg.sender_id === user.id ? 'You' : replyToMsg.sender_name}</p>
                      <p className="text-slate-600 truncate">{replyToMsg.content}</p>
                    </div>
                  )}

                  {/* Image attachment */}
                  {msg.attachment_url && msg.attachment_type === 'image' && (
                    <img src={msg.attachment_url} alt="" className="rounded-md max-w-full max-h-48 object-cover mb-1.5 cursor-pointer"
                      onClick={(e) => { e.stopPropagation(); setExpandedImage(msg.attachment_url); }} />
                  )}

                  {/* Audio attachment */}
                  {msg.attachment_url && msg.attachment_type === 'audio' && (
                    <div className="flex items-center gap-2 mb-1">
                      <button onClick={(e) => { e.stopPropagation(); toggleAudio(msg.attachment_url, msg.id); }}
                        className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${isOwn ? 'bg-emerald-500' : 'bg-slate-500'}`}>
                        {playingAudio === msg.id ? (
                          <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24"><rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" /></svg>
                        ) : (
                          <svg className="w-4 h-4 text-white ml-0.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                        )}
                      </button>
                      <div className="flex-1 flex items-center gap-1">
                        {Array.from({ length: 20 }).map((_, i) => (
                          <div key={i} className={`w-1 rounded-full ${isOwn ? 'bg-emerald-600/40' : 'bg-slate-400/40'}`} style={{ height: `${8 + Math.random() * 14}px` }} />
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Text content */}
                  {msg.content && msg.content !== '🎤 Voice Note' && msg.content !== '📷 Photo' && (
                    <div className="flex items-end gap-2">
                      <p className="text-[14.2px] leading-[19px] whitespace-pre-wrap break-words text-slate-900 flex-1" style={{ overflowWrap: 'anywhere' }}>{msg.content}</p>
                      <span className="text-[11px] flex items-center gap-0.5 flex-shrink-0 translate-y-1 text-[#667781]">
                        {fmtTime(msg.created_at)}
                        {isOwn && (isRead
                          ? <svg className="w-[18px] h-[18px] text-[#53bdeb] ml-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2}><path d="M1 12l5 5L17 6M7 12l5 5L23 6" /></svg>
                          : readCount > 0
                          ? <svg className="w-[18px] h-[18px] text-[#667781] ml-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2}><path d="M1 12l5 5L17 6M7 12l5 5L23 6" /></svg>
                          : <svg className="w-[18px] h-[18px] text-[#667781] ml-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2}><path d="M5 12l5 5L20 7" /></svg>
                        )}
                      </span>
                    </div>
                  )}
                  {/* Time for attachment-only messages */}
                  {(msg.content === '🎤 Voice Note' || msg.content === '📷 Photo') && (
                    <div className="flex justify-end">
                      <span className="text-[11px] flex items-center gap-0.5 text-[#667781]">
                        {fmtTime(msg.created_at)}
                        {isOwn && (isRead
                          ? <svg className="w-[18px] h-[18px] text-[#53bdeb] ml-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2}><path d="M1 12l5 5L17 6M7 12l5 5L23 6" /></svg>
                          : readCount > 0
                          ? <svg className="w-[18px] h-[18px] text-[#667781] ml-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2}><path d="M1 12l5 5L17 6M7 12l5 5L23 6" /></svg>
                          : <svg className="w-[18px] h-[18px] text-[#667781] ml-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2}><path d="M5 12l5 5L20 7" /></svg>
                        )}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Reply bar */}
      {replyTo && (
        <div className="bg-slate-50 border border-slate-200 rounded-xl mt-1 px-3 py-2 flex items-center gap-3">
          <div className="flex-1 border-l-4 border-emerald-500 bg-white rounded px-3 py-1.5">
            <p className="text-xs font-semibold text-emerald-700">{replyTo.sender_id === user.id ? 'You' : replyTo.sender_name}</p>
            <p className="text-xs text-slate-600 truncate">{replyTo.content}</p>
          </div>
          <button onClick={() => setReplyTo(null)} className="p-1 hover:bg-slate-200 rounded-full">
            <svg className="w-4 h-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
      )}

      {/* Input */}
      <form onSubmit={handleSend} className="flex items-end gap-2 mt-2">
        <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
        <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleImageUpload} />
        {!recording && (
          <>
            <button type="button" onClick={() => fileInputRef.current?.click()} disabled={uploading}
              className="p-3 hover:bg-slate-100 rounded-2xl transition-colors flex-shrink-0" title="Photo library">
              {uploading ? (
                <div className="w-5 h-5 border-2 border-emerald-200 border-t-emerald-500 rounded-full animate-spin" />
              ) : (
                <svg className="w-5 h-5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" /></svg>
              )}
            </button>
            <button type="button" onClick={() => cameraInputRef.current?.click()} disabled={uploading}
              className="p-3 hover:bg-slate-100 rounded-2xl transition-colors flex-shrink-0" title="Take photo">
              <svg className="w-5 h-5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
            </button>
          </>
        )}
        {recording ? (
          <div className="flex-1 min-w-0 bg-red-50 rounded-2xl border border-red-200 px-3 py-2.5 flex items-center gap-2">
            <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse flex-shrink-0" />
            <p className="text-sm font-medium text-red-700 flex-1">
              Recording... {Math.floor(recordDuration / 60)}:{String(recordDuration % 60).padStart(2, '0')}
            </p>
            <p className="text-xs text-red-400">Release to send</p>
          </div>
        ) : (
          <div className="flex-1 min-w-0 bg-white rounded-2xl border border-slate-200 px-3 py-2.5">
            <textarea ref={inputRef} value={message} onChange={e => setMessage(e.target.value)} placeholder="Type a message..." rows={1}
              className="w-full text-[15px] text-slate-900 placeholder:text-slate-400 outline-none bg-transparent resize-none overflow-hidden"
              style={{ maxHeight: '100px' }}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(e); } }}
              onInput={(e) => { e.target.style.height = 'auto'; e.target.style.height = Math.min(e.target.scrollHeight, 100) + 'px'; }} />
          </div>
        )}
        {message.trim() ? (
          <button type="submit" disabled={sending} className="p-3 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 rounded-2xl transition-colors flex-shrink-0">
            <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" /></svg>
          </button>
        ) : (
          <button type="button" onPointerDown={startRecording}
            className={`p-3 rounded-2xl transition-colors flex-shrink-0 touch-none ${recording ? 'bg-red-500' : 'bg-slate-100 hover:bg-slate-200'}`}>
            <svg className={`w-5 h-5 ${recording ? 'text-white' : 'text-slate-600'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg>
          </button>
        )}
      </form>

      {/* Context menu */}
      {contextMenu && (
        <div ref={menuRef} className="fixed z-[999] bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden w-[180px]"
          style={{ left: Math.max(8, Math.min(contextMenu.x, window.innerWidth - 200)), top: Math.max(8, Math.min(contextMenu.y - 40, window.innerHeight - 180)) }}>
          <button onClick={() => { setReplyTo(contextMenu.msg); setContextMenu(null); inputRef.current?.focus(); }}
            className="w-full flex items-center gap-3 px-4 py-3 text-sm text-slate-700 hover:bg-slate-50">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" /></svg> Reply
          </button>
          <button onClick={() => { navigator.clipboard.writeText(contextMenu.msg.content || ''); setContextMenu(null); }}
            className="w-full flex items-center gap-3 px-4 py-3 text-sm text-slate-700 hover:bg-slate-50">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg> Copy
          </button>
          {contextMenu.isOwn && !contextMenu.msg.attachment_url && (
            <button onClick={() => startEdit(contextMenu.msg)} className="w-full flex items-center gap-3 px-4 py-3 text-sm text-slate-700 hover:bg-slate-50">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg> Edit
            </button>
          )}
          {(contextMenu.isOwn || isPrivileged) && (
            <button onClick={() => deleteMessage(contextMenu.msgId)} className="w-full flex items-center gap-3 px-4 py-3 text-sm text-red-600 hover:bg-red-50">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg> Delete
            </button>
          )}
        </div>
      )}

      {/* ── Edit Message Overlay ── */}
      {editingMsg && (
        <div className="fixed inset-0 z-[998] bg-black/50 flex items-center justify-center px-4" onClick={() => setEditingMsg(null)}>
          <div className="bg-white rounded-2xl w-full max-w-md p-5 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-900">Edit Message</h3>
              <button onClick={() => setEditingMsg(null)} className="p-1 hover:bg-slate-100 rounded-full">
                <svg className="w-5 h-5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <textarea
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              className="w-full border border-slate-200 rounded-xl p-3 text-[15px] text-slate-900 outline-none focus:ring-2 focus:ring-emerald-500 resize-none"
              rows={3}
              autoFocus
            />
            <div className="flex gap-2 justify-end">
              <button onClick={() => setEditingMsg(null)} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">Cancel</button>
              <button onClick={saveEdit} disabled={!editText.trim()} className="px-4 py-2 text-sm bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white rounded-lg font-semibold">Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
