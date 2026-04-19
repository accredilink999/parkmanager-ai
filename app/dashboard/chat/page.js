'use client';
import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

/* ─── helpers ─── */
function timeAgo(d) {
  if (!d) return '';
  const now = new Date(), t = new Date(d), diff = now - t;
  if (diff < 60000) return 'now';
  if (diff < 3600000) return `${Math.floor(diff/60000)}m`;
  if (diff < 86400000) return `${Math.floor(diff/3600000)}h`;
  if (diff < 604800000) return `${Math.floor(diff/86400000)}d`;
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
  return t.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).toUpperCase();
}
function isSameDay(a, b) {
  const d1 = new Date(a), d2 = new Date(b);
  return d1.getFullYear() === d2.getFullYear() && d1.getMonth() === d2.getMonth() && d1.getDate() === d2.getDate();
}
function getNameColor(name) {
  const colors = ['#e17076','#7bc862','#e5a64e','#65aadd','#a695e7','#ee7aae','#6ec9cb','#faa774'];
  let h = 0;
  for (let i = 0; i < (name||'').length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return colors[Math.abs(h) % colors.length];
}
function initials(name) {
  if (!name) return '?';
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

export default function ChatPage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [conversations, setConversations] = useState([]);
  const [selectedConv, setSelectedConv] = useState(null);
  const [messages, setMessages] = useState([]);
  const [message, setMessage] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [showNewChat, setShowNewChat] = useState(false);
  const [contacts, setContacts] = useState([]);
  const [contactSearch, setContactSearch] = useState('');
  const [replyTo, setReplyTo] = useState(null);
  const [contextMenu, setContextMenu] = useState(null);
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);

  const messagesEndRef = useRef(null);
  const containerRef = useRef(null);
  const inputRef = useRef(null);
  const menuRef = useRef(null);

  // ── Auth ──
  useEffect(() => {
    const saved = localStorage.getItem('pm_user');
    if (!saved) { router.push('/login'); return; }
    const u = JSON.parse(saved);
    if (u.role === 'customer') { router.push('/portal'); return; }
    setUser(u);
  }, [router]);

  // ── Load conversations ──
  const loadConversations = useCallback(async () => {
    if (!supabase || !user) return;
    const { data } = await supabase
      .from('pm_conversations')
      .select('*')
      .order('last_message_at', { ascending: false, nullsFirst: false });
    setConversations((data || []).filter(c => c.participants?.includes(user.id)));
    setLoading(false);
  }, [user]);

  useEffect(() => { if (user) loadConversations(); }, [user, loadConversations]);

  // ── Load contacts (all users in org for new chat) ──
  useEffect(() => {
    if (!supabase || !user) return;
    supabase.from('users').select('id, email, full_name, role').then(({ data }) => {
      setContacts((data || []).filter(u => u.id !== user.id));
    });
  }, [user]);

  // ── Load messages for selected conversation ──
  const loadMessages = useCallback(async () => {
    if (!supabase || !selectedConv) return;
    const { data } = await supabase
      .from('pm_chat_messages')
      .select('*')
      .eq('conversation_id', selectedConv.id)
      .order('created_at', { ascending: true })
      .limit(500);
    setMessages(data || []);

    // Mark unread as read
    const unread = (data || []).filter(m => m.sender_id !== user.id && !m.read_by?.includes(user.id));
    if (unread.length > 0) {
      await Promise.all(unread.map(m =>
        supabase.from('pm_chat_messages').update({ read_by: [...(m.read_by || []), user.id] }).eq('id', m.id)
      ));
      // Reset unread count
      const conv = selectedConv;
      const uc = { ...(conv.unread_count || {}), [user.id]: 0 };
      await supabase.from('pm_conversations').update({ unread_count: uc }).eq('id', conv.id);
      loadConversations();
    }
  }, [selectedConv, user, loadConversations]);

  useEffect(() => {
    if (selectedConv) {
      loadMessages();
    } else {
      setMessages([]);
    }
  }, [selectedConv?.id, loadMessages]);

  // ── Scroll to bottom on new messages ──
  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    }
  }, [messages.length]);

  // ── Realtime subscriptions ──
  useEffect(() => {
    if (!supabase || !user) return;
    const ch1 = supabase.channel('pm-chat-convs')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pm_conversations' }, () => loadConversations())
      .subscribe();
    const ch2 = supabase.channel('pm-chat-msgs')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pm_chat_messages' }, (payload) => {
        if (selectedConv && payload.new?.conversation_id === selectedConv.id) {
          loadMessages();
        }
        loadConversations();
      })
      .subscribe();
    return () => { supabase.removeChannel(ch1); supabase.removeChannel(ch2); };
  }, [user, selectedConv?.id, loadConversations, loadMessages]);

  // ── Close context menu on outside click ──
  useEffect(() => {
    if (!contextMenu) return;
    const handler = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setContextMenu(null); };
    document.addEventListener('mousedown', handler);
    document.addEventListener('touchstart', handler);
    return () => { document.removeEventListener('mousedown', handler); document.removeEventListener('touchstart', handler); };
  }, [contextMenu]);

  // ── Send message ──
  async function handleSend(e) {
    e?.preventDefault();
    if (!message.trim() || !selectedConv || sending) return;
    setSending(true);
    const content = message.trim();
    setMessage('');

    await supabase.from('pm_chat_messages').insert({
      conversation_id: selectedConv.id,
      sender_id: user.id,
      sender_name: user.full_name || user.email,
      content,
      read_by: [user.id],
      reply_to_id: replyTo?.id || null,
    });

    // Update conversation
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
    setSending(false);
    // Sound
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const now = ctx.currentTime;
      [600, 900].forEach((f, i) => {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.connect(g); g.connect(ctx.destination);
        o.frequency.value = f; o.type = 'sine';
        g.gain.setValueAtTime(0.12, now + i*0.06);
        g.gain.exponentialRampToValueAtTime(0.001, now + i*0.06 + 0.1);
        o.start(now + i*0.06); o.stop(now + i*0.06 + 0.1);
      });
    } catch {}
  }

  // ── Delete message ──
  async function deleteMessage(msgId) {
    await supabase.from('pm_chat_messages').delete().eq('id', msgId);
    setContextMenu(null);
    loadMessages();
  }

  // ── Start new conversation ──
  async function startChat(contact) {
    // Check if direct conversation already exists
    const existing = conversations.find(c =>
      c.type === 'direct' && c.participants?.includes(contact.id) && c.participants?.includes(user.id)
    );
    if (existing) {
      setSelectedConv(existing);
      setShowNewChat(false);
      setContactSearch('');
      return;
    }
    const participants = [user.id, contact.id];
    const participant_names = [user.full_name || user.email, contact.full_name || contact.email];
    const { data } = await supabase.from('pm_conversations').insert({
      org_id: user.org_id,
      type: 'direct',
      participants,
      participant_names,
      unread_count: { [user.id]: 0, [contact.id]: 0 },
      created_by: user.id,
    }).select().single();
    if (data) {
      setSelectedConv(data);
      loadConversations();
    }
    setShowNewChat(false);
    setContactSearch('');
  }

  // ── Derived values ──
  const filteredConvs = conversations.filter(c => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    const otherName = c.participant_names?.find((_, i) => c.participants?.[i] !== user?.id) || c.name || '';
    return otherName.toLowerCase().includes(q);
  });

  const totalUnread = conversations.reduce((sum, c) => sum + (c.unread_count?.[user?.id] || 0), 0);

  const filteredContacts = contacts.filter(c => {
    if (!contactSearch) return true;
    return (c.full_name || c.email || '').toLowerCase().includes(contactSearch.toLowerCase());
  }).sort((a, b) => (a.full_name || a.email || '').localeCompare(b.full_name || b.email || ''));

  const messagesById = useMemo(() => {
    const map = {};
    messages.forEach(m => { map[m.id] = m; });
    return map;
  }, [messages]);

  // Group messages by date
  const groupedMessages = useMemo(() => {
    const groups = [];
    let lastDate = null;
    messages.forEach((msg, idx) => {
      const d = msg.created_at;
      if (!lastDate || !isSameDay(lastDate, d)) {
        groups.push({ type: 'date', date: d, id: `date-${idx}` });
        lastDate = d;
      }
      const prev = idx > 0 ? messages[idx - 1] : null;
      const showAvatar = !prev || prev.sender_id !== msg.sender_id || !isSameDay(prev.created_at, d);
      groups.push({ type: 'msg', msg, showAvatar, id: msg.id });
    });
    return groups;
  }, [messages]);

  if (!user) return null;

  const convDisplayName = (conv) => {
    if (conv.type === 'group') return conv.name || 'Group';
    return conv.participant_names?.find((_, i) => conv.participants?.[i] !== user.id) || 'Chat';
  };

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between z-20">
        <div className="flex items-center gap-3">
          <Link href="/dashboard" className="p-2 hover:bg-slate-100 rounded-lg transition-colors">
            <svg className="w-5 h-5 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
          </Link>
          <h1 className="text-lg font-bold text-slate-900">Chat</h1>
          {totalUnread > 0 && <span className="bg-emerald-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">{totalUnread}</span>}
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden" style={{ height: 'calc(100dvh - 57px)' }}>
        {/* ── Sidebar ── */}
        <div className={`w-full lg:w-[380px] border-r border-slate-200 flex flex-col bg-white ${selectedConv ? 'hidden lg:flex' : 'flex'}`}>
          <div className="px-4 pt-4 pb-2">
            <div className="flex items-center gap-2 mb-3">
              <div className="relative flex-1">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                <input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search chats..."
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-100 rounded-xl text-sm outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition-all"
                />
              </div>
              <button
                onClick={() => setShowNewChat(true)}
                className="w-10 h-10 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl flex items-center justify-center transition-colors flex-shrink-0"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-20"><div className="w-8 h-8 border-4 border-emerald-200 border-t-emerald-500 rounded-full animate-spin" /></div>
            ) : filteredConvs.length === 0 ? (
              <div className="text-center py-20 px-6">
                <svg className="w-16 h-16 text-slate-200 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
                <p className="text-sm text-slate-500">No conversations yet</p>
                <button onClick={() => setShowNewChat(true)} className="text-sm text-emerald-600 font-medium mt-2">Start a chat</button>
              </div>
            ) : (
              filteredConvs.map(conv => {
                const name = convDisplayName(conv);
                const unread = conv.unread_count?.[user.id] || 0;
                const isSelected = selectedConv?.id === conv.id;
                return (
                  <button
                    key={conv.id}
                    onClick={() => setSelectedConv(conv)}
                    className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition-colors text-left ${isSelected ? 'bg-emerald-50' : ''}`}
                  >
                    <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0">
                      <span className="text-sm font-bold text-emerald-700">{initials(name)}</span>
                    </div>
                    <div className="flex-1 min-w-0 border-b border-slate-100 pb-3">
                      <div className="flex items-center justify-between">
                        <p className="font-semibold text-slate-900 text-[15px] truncate">{name}</p>
                        <span className="text-[11px] text-slate-400 flex-shrink-0 ml-2">{timeAgo(conv.last_message_at)}</span>
                      </div>
                      <div className="flex items-center justify-between mt-0.5">
                        <p className="text-sm text-slate-500 truncate">{conv.last_message || 'No messages yet'}</p>
                        {unread > 0 && (
                          <span className="bg-emerald-500 text-white text-[10px] font-bold min-w-[20px] h-5 px-1.5 rounded-full flex items-center justify-center flex-shrink-0 ml-2">
                            {unread}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* ── Chat Window ── */}
        {selectedConv ? (
          <div className="flex-1 flex flex-col bg-[#efeae2] min-w-0" ref={containerRef}>
            {/* Chat Header */}
            <div className="bg-white border-b border-slate-200 px-3 py-2.5 flex items-center gap-3 z-10">
              <button onClick={() => setSelectedConv(null)} className="lg:hidden p-2 hover:bg-slate-100 rounded-lg">
                <svg className="w-5 h-5 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
              </button>
              <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0">
                <span className="text-sm font-bold text-emerald-700">{initials(convDisplayName(selectedConv))}</span>
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-slate-900 text-[15px] truncate">{convDisplayName(selectedConv)}</h3>
                <p className="text-xs text-slate-400">
                  {selectedConv.type === 'group'
                    ? `${selectedConv.participant_names?.length || 0} members`
                    : contacts.find(c => selectedConv.participants?.includes(c.id))?.role === 'customer' ? 'Customer' : 'Staff'}
                </p>
              </div>
            </div>

            {/* Messages */}
            <div
              className="flex-1 overflow-y-auto py-2"
              style={{
                backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23c8b89a' fill-opacity='0.08'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
              }}
            >
              {groupedMessages.map(item => {
                if (item.type === 'date') {
                  return (
                    <div key={item.id} className="flex justify-center my-3">
                      <span className="bg-white/90 text-slate-500 text-[12px] px-3 py-1 rounded-lg shadow-sm font-medium">
                        {fmtDateSep(item.date)}
                      </span>
                    </div>
                  );
                }
                const msg = item.msg;
                const isOwn = msg.sender_id === user.id;
                const replyToMsg = msg.reply_to_id ? messagesById[msg.reply_to_id] : null;
                const readCount = msg.read_by?.filter(id => id !== msg.sender_id).length || 0;
                const totalOthers = Math.max(0, (selectedConv.participants?.length || 0) - 1);
                const isRead = readCount >= totalOthers && totalOthers > 0;

                return (
                  <div key={msg.id} className={`flex gap-1.5 mb-0.5 px-2 ${isOwn ? 'justify-end' : 'justify-start'}`}>
                    {!isOwn && item.showAvatar && (
                      <div className="w-7 h-7 rounded-full bg-slate-200 flex items-center justify-center mt-auto mb-1 flex-shrink-0">
                        <span className="text-[10px] font-bold text-slate-600">{initials(msg.sender_name)}</span>
                      </div>
                    )}
                    {!isOwn && !item.showAvatar && <div className="w-7 flex-shrink-0" />}

                    <div className="max-w-[75%] sm:max-w-[65%] min-w-0">
                      {!isOwn && item.showAvatar && (
                        <p className="text-xs font-semibold px-1 mb-0.5" style={{ color: getNameColor(msg.sender_name) }}>{msg.sender_name}</p>
                      )}

                      <div
                        className={`relative rounded-lg px-2.5 py-1.5 shadow-sm select-text cursor-pointer ${isOwn ? 'bg-[#d9fdd3] rounded-tr-none' : 'bg-white rounded-tl-none'}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          setContextMenu({ msgId: msg.id, x: e.clientX, y: e.clientY, isOwn, msg });
                        }}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          setContextMenu({ msgId: msg.id, x: e.clientX, y: e.clientY, isOwn, msg });
                        }}
                      >
                        {/* Reply preview */}
                        {replyToMsg && (
                          <div className={`border-l-4 rounded px-2 py-1 mb-1.5 text-xs ${replyToMsg.sender_id === user.id ? 'border-emerald-500 bg-emerald-50' : 'border-blue-400 bg-blue-50'}`}>
                            <p className="font-semibold text-emerald-700 truncate">{replyToMsg.sender_id === user.id ? 'You' : replyToMsg.sender_name}</p>
                            <p className="text-slate-600 truncate">{replyToMsg.content}</p>
                          </div>
                        )}

                        {/* Image attachment */}
                        {msg.attachment_url && msg.attachment_type === 'image' && (
                          <img src={msg.attachment_url} alt="" className="rounded-md max-w-full max-h-64 object-cover mb-1.5" />
                        )}

                        {/* Content */}
                        <div className="flex items-end gap-2">
                          <p className="text-[14.2px] leading-[19px] whitespace-pre-wrap break-words text-slate-900 flex-1" style={{ overflowWrap: 'anywhere' }}>
                            {msg.content}
                          </p>
                          <span className="text-[11px] flex items-center gap-0.5 flex-shrink-0 translate-y-1 text-[#667781]">
                            {msg.is_edited && <span className="italic mr-1">edited</span>}
                            {fmtTime(msg.created_at)}
                            {isOwn && (
                              isRead ? (
                                <svg className="w-4 h-4 text-[#53bdeb] ml-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M1 12l5 5L17 6M7 12l5 5L23 6" /></svg>
                              ) : (
                                <svg className="w-4 h-4 text-[#667781] ml-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M5 12l5 5L20 7" /></svg>
                              )
                            )}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            {/* Reply bar */}
            {replyTo && (
              <div className="bg-slate-100 border-t border-slate-200 px-4 py-2 flex items-center gap-3">
                <div className="flex-1 border-l-4 border-emerald-500 bg-white rounded px-3 py-2">
                  <p className="text-xs font-semibold text-emerald-700">{replyTo.sender_id === user.id ? 'You' : replyTo.sender_name}</p>
                  <p className="text-sm text-slate-600 truncate">{replyTo.content}</p>
                </div>
                <button onClick={() => setReplyTo(null)} className="p-1 hover:bg-slate-200 rounded-full">
                  <svg className="w-5 h-5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
            )}

            {/* Input bar */}
            <div className="bg-slate-100 px-3 py-2">
              <form onSubmit={handleSend} className="flex items-end gap-2">
                <div className="flex-1 min-w-0 bg-white rounded-xl border border-slate-200 px-3 py-2">
                  <textarea
                    ref={inputRef}
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="Type a message"
                    rows={1}
                    className="w-full text-[15px] text-slate-900 placeholder:text-slate-400 outline-none bg-transparent resize-none overflow-hidden"
                    style={{ maxHeight: '120px' }}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(e); } }}
                    onInput={(e) => { e.target.style.height = 'auto'; e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px'; }}
                  />
                </div>
                <button
                  type="submit"
                  disabled={!message.trim() || sending}
                  className="p-2.5 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 rounded-xl transition-colors flex-shrink-0"
                >
                  <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" /></svg>
                </button>
              </form>
            </div>
          </div>
        ) : (
          /* Empty state — desktop only */
          <div className="flex-1 hidden lg:flex flex-col items-center justify-center bg-slate-100">
            <div className="w-[280px] text-center">
              <div className="w-[160px] h-[160px] mx-auto mb-6 rounded-full bg-gradient-to-br from-emerald-100 to-teal-100 flex items-center justify-center">
                <svg className="w-20 h-20 text-emerald-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
              </div>
              <h3 className="text-xl font-bold text-slate-700 mb-2">ParkManagerAI Chat</h3>
              <p className="text-sm text-slate-500">Select a conversation or start a new chat.</p>
            </div>
          </div>
        )}
      </div>

      {/* ── Context Menu ── */}
      {contextMenu && (
        <div
          ref={menuRef}
          className="fixed z-[999] bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden w-[200px]"
          style={{
            left: Math.max(8, Math.min(contextMenu.x, window.innerWidth - 220)),
            top: Math.max(8, Math.min(contextMenu.y - 40, window.innerHeight - 200)),
          }}
        >
          <button onClick={() => { setReplyTo(contextMenu.msg); setContextMenu(null); inputRef.current?.focus(); }}
            className="w-full flex items-center gap-3 px-4 py-3 text-sm text-slate-700 hover:bg-slate-50">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" /></svg>
            Reply
          </button>
          <button onClick={() => { navigator.clipboard.writeText(contextMenu.msg.content || ''); setContextMenu(null); }}
            className="w-full flex items-center gap-3 px-4 py-3 text-sm text-slate-700 hover:bg-slate-50">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
            Copy
          </button>
          {(contextMenu.isOwn || user?.role === 'admin') && (
            <button onClick={() => deleteMessage(contextMenu.msgId)}
              className="w-full flex items-center gap-3 px-4 py-3 text-sm text-red-600 hover:bg-red-50">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
              Delete
            </button>
          )}
        </div>
      )}

      {/* ── New Chat Dialog ── */}
      {showNewChat && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center" onClick={() => { setShowNewChat(false); setContactSearch(''); }}>
          <div className="bg-white w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="px-5 pt-5 pb-3 border-b border-slate-100">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-bold text-slate-900">New Chat</h3>
                <button onClick={() => { setShowNewChat(false); setContactSearch(''); }} className="p-1 hover:bg-slate-100 rounded-full">
                  <svg className="w-5 h-5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
              <div className="relative">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                <input
                  value={contactSearch}
                  onChange={(e) => setContactSearch(e.target.value)}
                  placeholder="Search contacts..."
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-100 rounded-xl text-sm outline-none focus:ring-2 focus:ring-emerald-500"
                  autoFocus
                />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto">
              {filteredContacts.length === 0 ? (
                <div className="py-12 text-center text-sm text-slate-500">No contacts found</div>
              ) : (
                filteredContacts.map(c => (
                  <button
                    key={c.id}
                    onClick={() => startChat(c)}
                    className="w-full flex items-center gap-3 px-5 py-3 hover:bg-slate-50 transition-colors text-left"
                  >
                    <div className="w-11 h-11 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0">
                      <span className="text-sm font-bold text-emerald-700">{initials(c.full_name || c.email)}</span>
                    </div>
                    <div className="flex-1 min-w-0 border-b border-slate-100 pb-3">
                      <p className="font-medium text-slate-900 text-[15px]">{c.full_name || c.email}</p>
                      <p className="text-sm text-slate-500 capitalize">{c.role || 'Staff'}</p>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
