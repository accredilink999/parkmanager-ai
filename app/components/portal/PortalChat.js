'use client';
import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

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
function initials(n) { return !n ? '?' : n.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2); }

export default function PortalChat({ user, siteName, sitePhone }) {
  const [conversation, setConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [message, setMessage] = useState('');
  const [replyTo, setReplyTo] = useState(null);
  const [contextMenu, setContextMenu] = useState(null);
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);

  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const menuRef = useRef(null);

  // ── Find or create conversation with site manager ──
  const initConversation = useCallback(async () => {
    if (!supabase || !user) return;

    // Find existing conversation where this customer is a participant
    const { data: convs } = await supabase
      .from('pm_conversations')
      .select('*')
      .contains('participants', [user.id])
      .eq('type', 'direct')
      .order('last_message_at', { ascending: false, nullsFirst: false })
      .limit(1);

    if (convs && convs.length > 0) {
      setConversation(convs[0]);
    }
    // If no conversation exists, it will be created when the customer sends their first message
    setLoading(false);
  }, [user]);

  useEffect(() => { initConversation(); }, [initConversation]);

  // ── Load messages ──
  const loadMessages = useCallback(async () => {
    if (!supabase || !conversation) return;
    const { data } = await supabase
      .from('pm_chat_messages')
      .select('*')
      .eq('conversation_id', conversation.id)
      .order('created_at', { ascending: true })
      .limit(500);
    setMessages(data || []);

    // Mark unread as read
    const unread = (data || []).filter(m => m.sender_id !== user.id && !m.read_by?.includes(user.id));
    if (unread.length > 0) {
      await Promise.all(unread.map(m =>
        supabase.from('pm_chat_messages').update({ read_by: [...(m.read_by || []), user.id] }).eq('id', m.id)
      ));
      const uc = { ...(conversation.unread_count || {}), [user.id]: 0 };
      await supabase.from('pm_conversations').update({ unread_count: uc }).eq('id', conversation.id);
    }
  }, [conversation, user]);

  useEffect(() => { if (conversation) loadMessages(); }, [conversation?.id, loadMessages]);

  // ── Scroll to bottom ──
  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    }
  }, [messages.length]);

  // ── Realtime ──
  useEffect(() => {
    if (!supabase || !user) return;
    const ch = supabase.channel('pm-portal-chat')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pm_chat_messages' }, (payload) => {
        if (conversation && payload.new?.conversation_id === conversation.id) loadMessages();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pm_conversations' }, () => initConversation())
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [user, conversation?.id, loadMessages, initConversation]);

  // ── Close context menu ──
  useEffect(() => {
    if (!contextMenu) return;
    const handler = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setContextMenu(null); };
    document.addEventListener('mousedown', handler);
    document.addEventListener('touchstart', handler);
    return () => { document.removeEventListener('mousedown', handler); document.removeEventListener('touchstart', handler); };
  }, [contextMenu]);

  // ── Create conversation if needed and send ──
  async function handleSend(e) {
    e?.preventDefault();
    if (!message.trim() || sending) return;
    setSending(true);
    const content = message.trim();
    setMessage('');

    let conv = conversation;

    // Auto-create conversation if none exists
    if (!conv) {
      // Find the site manager (admin user)
      const { data: managers } = await supabase
        .from('users')
        .select('id, full_name, email')
        .eq('role', 'admin')
        .limit(1);

      const manager = managers?.[0];
      if (!manager) {
        setSending(false);
        return;
      }

      const participants = [user.id, manager.id];
      const participant_names = [user.full_name || user.email, manager.full_name || manager.email];
      const { data: newConv } = await supabase.from('pm_conversations').insert({
        org_id: user.org_id,
        type: 'direct',
        participants,
        participant_names,
        unread_count: { [user.id]: 0, [manager.id]: 0 },
        created_by: user.id,
      }).select().single();

      if (newConv) {
        conv = newConv;
        setConversation(newConv);
      } else {
        setSending(false);
        return;
      }
    }

    // Send message
    await supabase.from('pm_chat_messages').insert({
      conversation_id: conv.id,
      sender_id: user.id,
      sender_name: user.full_name || user.email,
      content,
      read_by: [user.id],
      reply_to_id: replyTo?.id || null,
    });

    // Update conversation
    const others = (conv.participants || []).filter(p => p !== user.id);
    const uc = { ...(conv.unread_count || {}), [user.id]: 0 };
    others.forEach(p => { uc[p] = (uc[p] || 0) + 1; });
    await supabase.from('pm_conversations').update({
      last_message: content,
      last_message_at: new Date().toISOString(),
      last_message_by: user.id,
      unread_count: uc,
    }).eq('id', conv.id);

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

  async function deleteMessage(msgId) {
    await supabase.from('pm_chat_messages').delete().eq('id', msgId);
    setContextMenu(null);
    loadMessages();
  }

  const messagesById = useMemo(() => {
    const map = {};
    messages.forEach(m => { map[m.id] = m; });
    return map;
  }, [messages]);

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

  const managerName = conversation?.participant_names?.find((_, i) => conversation?.participants?.[i] !== user?.id) || siteName || 'Site Manager';

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-4 border-emerald-200 border-t-emerald-500 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex flex-col" style={{ height: 'calc(100dvh - 140px)' }}>
      {/* Header info */}
      <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-3 mb-2 flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-emerald-500 flex items-center justify-center flex-shrink-0">
          <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-emerald-900">Chat with {managerName}</p>
          <p className="text-xs text-emerald-600">Messages are delivered in real-time</p>
        </div>
      </div>

      {/* Messages area */}
      <div
        className="flex-1 overflow-y-auto rounded-2xl border border-slate-200 bg-[#efeae2] py-2"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23c8b89a' fill-opacity='0.08'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
        }}
      >
        {messages.length === 0 && !loading && (
          <div className="flex flex-col items-center justify-center py-16 px-6">
            <div className="w-20 h-20 rounded-full bg-white/80 flex items-center justify-center mb-4">
              <svg className="w-10 h-10 text-emerald-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
            </div>
            <p className="text-sm text-slate-600 text-center font-medium">No messages yet</p>
            <p className="text-xs text-slate-400 text-center mt-1">Send a message to start chatting with {managerName}</p>
          </div>
        )}

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
          const totalOthers = Math.max(0, (conversation?.participants?.length || 0) - 1);
          const isRead = readCount >= totalOthers && totalOthers > 0;

          return (
            <div key={msg.id} className={`flex gap-1.5 mb-0.5 px-2 ${isOwn ? 'justify-end' : 'justify-start'}`}>
              {!isOwn && item.showAvatar && (
                <div className="w-7 h-7 rounded-full bg-emerald-200 flex items-center justify-center mt-auto mb-1 flex-shrink-0">
                  <span className="text-[10px] font-bold text-emerald-700">{initials(msg.sender_name)}</span>
                </div>
              )}
              {!isOwn && !item.showAvatar && <div className="w-7 flex-shrink-0" />}

              <div className="max-w-[80%] min-w-0">
                {!isOwn && item.showAvatar && (
                  <p className="text-xs font-semibold text-emerald-700 px-1 mb-0.5">{msg.sender_name}</p>
                )}
                <div
                  className={`relative rounded-lg px-2.5 py-1.5 shadow-sm select-text ${isOwn ? 'bg-[#d9fdd3] rounded-tr-none' : 'bg-white rounded-tl-none'}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setContextMenu({ msgId: msg.id, x: e.clientX, y: e.clientY, isOwn, msg });
                  }}
                >
                  {replyToMsg && (
                    <div className={`border-l-4 rounded px-2 py-1 mb-1.5 text-xs ${replyToMsg.sender_id === user.id ? 'border-emerald-500 bg-emerald-50' : 'border-blue-400 bg-blue-50'}`}>
                      <p className="font-semibold text-emerald-700 truncate">{replyToMsg.sender_id === user.id ? 'You' : replyToMsg.sender_name}</p>
                      <p className="text-slate-600 truncate">{replyToMsg.content}</p>
                    </div>
                  )}

                  <div className="flex items-end gap-2">
                    <p className="text-[14.2px] leading-[19px] whitespace-pre-wrap break-words text-slate-900 flex-1" style={{ overflowWrap: 'anywhere' }}>
                      {msg.content}
                    </p>
                    <span className="text-[11px] flex items-center gap-0.5 flex-shrink-0 translate-y-1 text-[#667781]">
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
        <div className="flex-1 min-w-0 bg-white rounded-2xl border border-slate-200 px-3 py-2.5">
          <textarea
            ref={inputRef}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Type a message..."
            rows={1}
            className="w-full text-[15px] text-slate-900 placeholder:text-slate-400 outline-none bg-transparent resize-none overflow-hidden"
            style={{ maxHeight: '100px' }}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(e); } }}
            onInput={(e) => { e.target.style.height = 'auto'; e.target.style.height = Math.min(e.target.scrollHeight, 100) + 'px'; }}
          />
        </div>
        <button
          type="submit"
          disabled={!message.trim() || sending}
          className="p-3 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 rounded-2xl transition-colors flex-shrink-0"
        >
          <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" /></svg>
        </button>
      </form>

      {/* Context menu */}
      {contextMenu && (
        <div
          ref={menuRef}
          className="fixed z-[999] bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden w-[180px]"
          style={{
            left: Math.max(8, Math.min(contextMenu.x, window.innerWidth - 200)),
            top: Math.max(8, Math.min(contextMenu.y - 40, window.innerHeight - 180)),
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
          {contextMenu.isOwn && (
            <button onClick={() => deleteMessage(contextMenu.msgId)}
              className="w-full flex items-center gap-3 px-4 py-3 text-sm text-red-600 hover:bg-red-50">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
              Delete
            </button>
          )}
        </div>
      )}
    </div>
  );
}
