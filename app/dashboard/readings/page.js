'use client';
import { useState, useEffect, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { getOrgId } from '@/lib/org';

/** Format meter reading: 5 digits before decimal, .XX after.
 *  If the value already has decimal digits, keep them as-is (pad to 2 if only 1).
 *  If no decimal, append .00 */
function fmtReading(val) {
  const num = parseFloat(val);
  if (isNaN(num)) return String(val || '');
  const str = String(val);
  const dotIdx = str.indexOf('.');
  let whole, dec;
  if (dotIdx >= 0) {
    whole = str.slice(0, dotIdx);
    dec = str.slice(dotIdx + 1).slice(0, 2).padEnd(2, '0');
  } else {
    whole = String(Math.floor(num));
    dec = '00';
  }
  return `${whole.padStart(5, '0')}.${dec}`;
}

export default function ReadingsPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-50 flex items-center justify-center"><div className="animate-spin w-8 h-8 border-2 border-emerald-400 border-t-transparent rounded-full" /></div>}>
      <ReadingsContent />
    </Suspense>
  );
}

function ReadingsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [user, setUser] = useState(null);
  const [pitches, setPitches] = useState([]);
  const [readings, setReadings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState('');
  const [tab, setTab] = useState('readings'); // 'readings' | 'session'

  // New reading form
  const [showForm, setShowForm] = useState(false);
  const [selectedPitch, setSelectedPitch] = useState('');
  const [newReading, setNewReading] = useState('');
  const [saving, setSaving] = useState(false);

  // Edit mode
  const [editingReading, setEditingReading] = useState(null);

  // Camera/OCR state (UI removed but state kept for cleanup references)
  const [capturedImage, setCapturedImage] = useState(null);
  const [ocrConfidence, setOcrConfidence] = useState(null);

  // ---- Reading Session ----
  const [session, setSession] = useState(null); // { id, started_at, readings: { [pitchId]: { reading, usage_kwh, previous_reading, read_at } }, status: 'active'|'complete' }
  const [sessionPitchIndex, setSessionPitchIndex] = useState(0);
  const sessionPitchIdRef = useRef(null); // Track pitch ID to prevent index mismatch bugs
  const [pastSessions, setPastSessions] = useState([]);
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportSession, setExportSession] = useState(null);

  // Baseline mode — first-time setup for pitches with no previous readings
  const [showBaseline, setShowBaseline] = useState(false);
  const [baselineReadings, setBaselineReadings] = useState({}); // { pitchId: readingValue }
  const [savingBaseline, setSavingBaseline] = useState(false);

  // Unit rate (£/kWh) from site settings
  const [unitRate, setUnitRate] = useState(0.34);

  // Email sending state
  const [sendingEmail, setSendingEmail] = useState(null); // 'manager' | 'head_office' | null

  // Edit session reading
  const [editingSessionPitchId, setEditingSessionPitchId] = useState(null);
  const [editSessionValue, setEditSessionValue] = useState('');

  // Gas cylinder entry during session
  const [showGasEntry, setShowGasEntry] = useState(null); // pitchId or null
  const [sessionGasCylinders, setSessionGasCylinders] = useState({}); // { pitchId: [{ collar_number, size, type }] }
  const [gasCollarInput, setGasCollarInput] = useState('');
  const [gasSize, setGasSize] = useState('13kg');
  const [gasType, setGasType] = useState('Propane');
  const [editingGasCylIndex, setEditingGasCylIndex] = useState(null); // { pitchId, index } or null
  const [editGasCollar, setEditGasCollar] = useState('');
  const [editGasSize, setEditGasSize] = useState('13kg');
  const [editGasType, setEditGasType] = useState('Propane');

  // Multi-device sync
  const pollCountRef = useRef(0);

  // Offline / low-network support
  const [isOnline, setIsOnline] = useState(true);
  const [offlineQueue, setOfflineQueue] = useState([]);
  const [syncing, setSyncing] = useState(false);
  const syncingRef = useRef(false);

  // Helper: build readings map from meter_readings rows
  function buildReadingsMap(readingsData) {
    const map = {};
    (readingsData || []).forEach(r => {
      const isDormant = Number(r.reading) === 0 && Number(r.previous_reading) === 0 && Number(r.usage_kwh) === 0;
      map[r.pitch_id] = {
        reading: r.reading,
        previous_reading: r.previous_reading,
        usage_kwh: r.usage_kwh,
        dormant: isDormant,
        read_at: r.read_at || r.created_at,
        pitch_number: r.pitches?.pitch_number,
        customer_name: r.pitches?.customer_name,
        meter_id: r.pitches?.meter_id,
      };
    });
    return map;
  }

  // ---- Offline cache helpers ----
  function cacheToLocal(key, data) {
    try { localStorage.setItem(`pm_cache_${key}`, JSON.stringify({ data, ts: Date.now() })); } catch {}
  }
  function getFromCache(key) {
    try {
      const raw = localStorage.getItem(`pm_cache_${key}`);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch { return null; }
  }
  function getOfflineQueue() {
    try { return JSON.parse(localStorage.getItem('pm_offline_queue') || '[]'); } catch { return []; }
  }
  function saveOfflineQueue(queue) {
    try { localStorage.setItem('pm_offline_queue', JSON.stringify(queue)); } catch {}
    setOfflineQueue(queue);
  }
  function addToOfflineQueue(item) {
    const queue = [...getOfflineQueue(), { ...item, queued_at: new Date().toISOString() }];
    saveOfflineQueue(queue);
    return queue;
  }

  // ---- Flush offline queue when online ----
  async function flushOfflineQueue() {
    if (!supabase || syncingRef.current) return;
    const queue = getOfflineQueue();
    if (queue.length === 0) return;

    syncingRef.current = true;
    setSyncing(true);
    setToast(`Syncing ${queue.length} offline reading(s)...`);

    const failed = [];
    for (const item of queue) {
      try {
        if (item.type === 'reading') {
          // Check for duplicate before inserting
          const { data: existing } = await supabase
            .from('meter_readings')
            .select('id')
            .eq('session_id', item.payload.session_id)
            .eq('pitch_id', item.payload.pitch_id)
            .limit(1);
          if (!existing || existing.length === 0) {
            await supabase.from('meter_readings').insert({ ...item.payload, org_id: getOrgId() });
          }
        } else if (item.type === 'session_update') {
          await supabase.from('reading_sessions').update({
            status: item.status,
            completed_at: item.completed_at || null,
          }).eq('id', item.session_id);
        } else if (item.type === 'dormant') {
          const { data: existing } = await supabase
            .from('meter_readings')
            .select('id')
            .eq('session_id', item.payload.session_id)
            .eq('pitch_id', item.payload.pitch_id)
            .limit(1);
          if (!existing || existing.length === 0) {
            await supabase.from('meter_readings').insert({ ...item.payload, org_id: getOrgId() });
          }
        }
      } catch {
        failed.push(item);
      }
    }

    saveOfflineQueue(failed);
    syncingRef.current = false;
    setSyncing(false);

    if (failed.length === 0) {
      setToast(`All ${queue.length} offline reading(s) synced successfully`);
    } else {
      setToast(`${queue.length - failed.length} synced, ${failed.length} still pending`);
    }
    setTimeout(() => setToast(''), 4000);

    // Refresh data after sync
    loadData();
    loadSessions();
  }

  // ---- Network status detection ----
  useEffect(() => {
    setIsOnline(navigator.onLine);
    setOfflineQueue(getOfflineQueue());

    function goOnline() {
      setIsOnline(true);
      setToast('Back online — syncing...');
      setTimeout(() => setToast(''), 2000);
      setTimeout(() => flushOfflineQueue(), 500);
    }
    function goOffline() {
      setIsOnline(false);
      setToast('You are offline — readings will be saved locally and synced when back online');
      setTimeout(() => setToast(''), 5000);
    }
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  useEffect(() => {
    const saved = sessionStorage.getItem('pm_user');
    if (!saved) { router.push('/login'); return; }
    setUser(JSON.parse(saved));
    loadData();
    loadSessions();
  }, [router]);

  // Auto-select pitch from QR URL param
  useEffect(() => {
    const pitchId = searchParams.get('pitch');
    if (pitchId && pitches.length > 0) {
      const found = pitches.find(p => p.id === pitchId);
      if (found) {
        setSelectedPitch(pitchId);
        setShowForm(true);
        setToast(`Pitch ${found.pitch_number} selected via QR scan`);
        setTimeout(() => setToast(''), 3000);
      }
    }
  }, [searchParams, pitches]);

  // ---- Multi-device sync polling ----
  useEffect(() => {
    if (!session || session.status !== 'active' || !supabase) return;
    const sessionId = session.id;

    const interval = setInterval(async () => {
      try {
        const { data } = await supabase
          .from('meter_readings')
          .select('*, pitches(pitch_number, customer_name, meter_id)')
          .eq('session_id', sessionId);

        if (!data) return;
        const readingsMap = buildReadingsMap(data);
        const newCount = Object.keys(readingsMap).length;

        if (newCount > pollCountRef.current) {
          const diff = newCount - pollCountRef.current;
          pollCountRef.current = newCount;

          setSession(prev => {
            if (!prev || prev.id !== sessionId) return prev;
            const updated = { ...prev, readings: readingsMap };
            const totalPitches = pitches.length;
            if (newCount >= totalPitches && prev.status === 'active') {
              updated.status = 'complete';
              updated.completed_at = new Date().toISOString();
              supabase.from('reading_sessions').update({
                status: 'complete', completed_at: updated.completed_at,
              }).eq('id', sessionId);
            }
            return updated;
          });
          setPastSessions(prev => prev.map(s =>
            s.id === sessionId ? { ...s, readings: readingsMap } : s
          ));
          setToast(`${diff} reading(s) synced from another device`);
          setTimeout(() => setToast(''), 3000);
        }
      } catch (err) {
        console.error('Polling error:', err);
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [session?.id, session?.status]);

  // Keep polling count in sync with local session changes
  useEffect(() => {
    pollCountRef.current = session ? Object.keys(session.readings).length : 0;
  }, [session]);

  // ---- Load data ----
  async function loadData() {
    setLoading(true);
    if (!supabase) {
      try {
        const saved = JSON.parse(localStorage.getItem('pm_settings') || '[]');
        saved.forEach(s => { if (s.key === 'electricity_unit_rate') setUnitRate(parseFloat(s.value) || 0.34); });
      } catch {}
      setPitches([
        { id: '1', pitch_number: 'A1', customer_name: 'John Smith', meter_id: 'M001' },
        { id: '2', pitch_number: 'A2', customer_name: 'Jane Doe', meter_id: 'M002' },
        { id: '3', pitch_number: 'A3', customer_name: 'Bob Wilson', meter_id: 'M003' },
        { id: '4', pitch_number: 'B1', customer_name: 'Mary Jones', meter_id: 'M004' },
        { id: '5', pitch_number: 'B2', customer_name: '', meter_id: 'M005' },
      ]);
      setReadings([
        { id: '1', pitch_id: '1', reading: 15234, previous_reading: 14890, usage_kwh: 344, read_at: '2026-03-01T10:00:00', pitch: { pitch_number: 'A1', customer_name: 'John Smith' } },
        { id: '2', pitch_id: '2', reading: 8921, previous_reading: 8650, usage_kwh: 271, read_at: '2026-03-01T10:15:00', pitch: { pitch_number: 'A2', customer_name: 'Jane Doe' } },
      ]);
      setLoading(false);
      return;
    }

    try {
      const [pitchRes, readingRes, settingsRes] = await Promise.all([
        supabase.from('pitches').select('*').order('created_at'),
        supabase.from('meter_readings').select('*, pitches(pitch_number, customer_name)').order('read_at', { ascending: false }).limit(50),
        supabase.from('site_settings').select('*'),
      ]);
      const pitchData = pitchRes.data || [];
      const readingData = (readingRes.data || []).map(r => ({ ...r, pitch: r.pitches }));
      const settingsData = settingsRes.data || [];

      setPitches(pitchData);
      setReadings(readingData);
      settingsData.forEach(s => {
        if (s.key === 'electricity_unit_rate') setUnitRate(parseFloat(s.value) || 0.34);
      });

      // Cache for offline use
      cacheToLocal('pitches', pitchData);
      cacheToLocal('readings', readingData);
      cacheToLocal('settings', settingsData);
    } catch (err) {
      console.warn('Network error loading data, using cache:', err);
      // Fall back to cached data
      const cachedPitches = getFromCache('pitches');
      const cachedReadings = getFromCache('readings');
      const cachedSettings = getFromCache('settings');

      if (cachedPitches?.data) setPitches(cachedPitches.data);
      if (cachedReadings?.data) setReadings(cachedReadings.data);
      if (cachedSettings?.data) {
        cachedSettings.data.forEach(s => {
          if (s.key === 'electricity_unit_rate') setUnitRate(parseFloat(s.value) || 0.34);
        });
      }

      if (cachedPitches?.data) {
        setToast('Loaded from cache — some data may be outdated');
        setTimeout(() => setToast(''), 4000);
      }
    }
    setLoading(false);
  }

  // ---- Sessions persistence ----
  async function loadSessions() {
    if (!supabase) {
      // Demo/offline: keep localStorage fallback
      try {
        const saved = localStorage.getItem('pm_reading_sessions');
        if (saved) {
          const all = JSON.parse(saved);
          setPastSessions(all);
          const active = all.find(s => s.status === 'active');
          if (active) {
            setSession(active);
            goToSessionIndex(0);
            setTab('session');
          }
        }
      } catch {}
      return;
    }

    // Load from Supabase
    try {
      const { data: sessions } = await supabase
        .from('reading_sessions')
        .select('*')
        .order('started_at', { ascending: false });

      if (!sessions || sessions.length === 0) { setPastSessions([]); cacheToLocal('sessions', []); return; }

      // Load all readings for all sessions in one query
      const allSessionIds = sessions.map(s => s.id);
      const { data: allReadings } = await supabase
        .from('meter_readings')
        .select('*, pitches(pitch_number, customer_name, meter_id)')
        .in('session_id', allSessionIds);

      // Group readings by session_id
      const readingsBySession = {};
      (allReadings || []).forEach(r => {
        if (!readingsBySession[r.session_id]) readingsBySession[r.session_id] = [];
        readingsBySession[r.session_id].push(r);
      });

      const sessionsWithReadings = sessions.map(s => ({
        ...s,
        readings: buildReadingsMap(readingsBySession[s.id] || []),
      }));

      setPastSessions(sessionsWithReadings);
      cacheToLocal('sessions', sessionsWithReadings);

      // Resume active session if exists
      const active = sessionsWithReadings.find(s => s.status === 'active');
      if (active) {
        setSession(active);
        goToSessionIndex(0);
        setTab('session');
        loadGasCylindersForSession();
      }
    } catch (err) {
      console.warn('Network error loading sessions, using cache:', err);
      // Fall back to cached sessions
      const cached = getFromCache('sessions');
      if (cached?.data) {
        setPastSessions(cached.data);
        const active = cached.data.find(s => s.status === 'active');
        if (active) {
          setSession(active);
          goToSessionIndex(0);
          setTab('session');
        }
      }
    }
  }

  function saveSessions(allSessions) {
    // Only used for demo/offline mode
    try { localStorage.setItem('pm_reading_sessions', JSON.stringify(allSessions)); } catch {}
    setPastSessions(allSessions);
  }

  function pitchesForSession() {
    // Session covers all pitches — meter_id is optional
    return pitches;
  }

  function goToSessionIndex(idx) {
    setSessionPitchIndex(idx);
    const sPitches = pitchesForSession();
    if (sPitches[idx]) sessionPitchIdRef.current = sPitches[idx].id;
  }

  // ---- Save / Update reading ----
  async function saveReading() {
    if (!selectedPitch || !newReading) return;
    setSaving(true);

    const pitch = pitches.find(p => p.id === selectedPitch);
    const readingVal = parseFloat(newReading);

    if (editingReading) {
      const usage = Math.max(0, readingVal - Number(editingReading.previous_reading));
      const updatePayload = { reading: readingVal, usage_kwh: usage, updated_at: new Date().toISOString() };

      if (!supabase) {
        setReadings(prev => prev.map(r => r.id === editingReading.id ? { ...r, ...updatePayload } : r));
      } else {
        await supabase.from('meter_readings').update(updatePayload).eq('id', editingReading.id);
        loadData();
      }
      setToast(`Reading updated: ${usage} kWh usage`);
    } else {
      let prevReading = 0;
      if (supabase) {
        const { data: prev } = await supabase
          .from('meter_readings').select('reading').eq('pitch_id', selectedPitch)
          .order('read_at', { ascending: false }).limit(1);
        if (prev && prev.length > 0) prevReading = Number(prev[0].reading);
      } else {
        const prev = readings.filter(r => r.pitch_id === selectedPitch);
        if (prev.length > 0) prevReading = prev[0].reading;
      }

      const usage = Math.max(0, readingVal - prevReading);
      const payload = { pitch_id: selectedPitch, reading: readingVal, previous_reading: prevReading, usage_kwh: usage };

      if (!supabase) {
        const newR = {
          id: String(Date.now()), ...payload,
          read_at: new Date().toISOString(),
          pitch: { pitch_number: pitch?.pitch_number, customer_name: pitch?.customer_name },
        };
        setReadings(prev => [newR, ...prev]);
      } else {
        try {
          const { error: insertErr } = await supabase.from('meter_readings').insert({ ...payload, org_id: getOrgId() });
          if (insertErr) throw insertErr;
          loadData();
        } catch (err) {
          // Queue for offline sync
          addToOfflineQueue({ type: 'reading', payload, pitch_number: pitch?.pitch_number });
          // Add to local state so it shows immediately
          const newR = {
            id: 'offline_' + Date.now(), ...payload,
            read_at: new Date().toISOString(),
            pitch: { pitch_number: pitch?.pitch_number, customer_name: pitch?.customer_name },
          };
          setReadings(prev => [newR, ...prev]);
          setToast(`Saved offline — will sync when back online`);
          setTimeout(() => setToast(''), 4000);
          resetForm();
          setSaving(false);
          return;
        }
      }
      setToast(`Reading saved: ${usage} kWh usage`);
    }

    setTimeout(() => setToast(''), 3000);
    resetForm();
    setSaving(false);
  }

  function resetForm() {
    setShowForm(false);
    setSelectedPitch('');
    setNewReading('');
    setEditingReading(null);
    setCapturedImage(null);
    setOcrConfidence(null);
  }

  function startEdit(reading) {
    setEditingReading(reading);
    setSelectedPitch(reading.pitch_id);
    setNewReading(String(reading.reading));
    setCapturedImage(null);
    setOcrConfidence(null);
    setShowForm(true);
  }

  async function deleteReading(reading) {
    if (!confirm(`Delete reading ${fmtReading(reading.reading)} for ${reading.pitch?.pitch_number || 'this pitch'}?`)) return;
    if (!supabase) {
      setReadings(prev => prev.filter(r => r.id !== reading.id));
    } else {
      await supabase.from('meter_readings').delete().eq('id', reading.id);
      loadData();
    }
    setToast('Reading deleted');
    setTimeout(() => setToast(''), 3000);
  }

  // ---- Session functions ----
  function hasIncompleteSession() {
    return pastSessions.some(s => s.status === 'active');
  }

  function getIncompleteSession() {
    return pastSessions.find(s => s.status === 'active');
  }

  async function startNewSession() {
    // Block if there's an incomplete session
    const incomplete = getIncompleteSession();
    if (incomplete) {
      const sPitchCount = pitches.length;
      const sReadCount = Object.keys(incomplete.readings).length;
      setToast(`Complete the current session first (${sReadCount}/${sPitchCount} done). Resuming...`);
      setTimeout(() => setToast(''), 4000);
      resumeSession(incomplete);
      return;
    }

    const sessionName = `Reading Session — ${new Date().toLocaleDateString('en-GB')}`;

    if (!supabase) {
      // Demo/offline: localStorage
      const newSession = {
        id: 'ses_' + Date.now(),
        started_at: new Date().toISOString(),
        readings: {},
        status: 'active',
        name: sessionName,
      };
      setSession(newSession);
      goToSessionIndex(0);
      setNewReading('');
      setCapturedImage(null);
      setOcrConfidence(null);
      setTab('session');
      const all = [...pastSessions.filter(s => s.id !== newSession.id), newSession];
      saveSessions(all);
      setToast('Reading session started');
      setTimeout(() => setToast(''), 3000);
      return;
    }

    // Create in Supabase
    const u = JSON.parse(sessionStorage.getItem('pm_user') || '{}');
    let newSession;
    try {
      const { data, error } = await supabase.from('reading_sessions').insert({
        name: sessionName,
        status: 'active',
        started_by: u.full_name || u.email || 'Unknown',
        org_id: getOrgId(),
      }).select().single();

      if (error) throw error;
      newSession = { ...data, readings: {} };
    } catch {
      // Offline: create local-only session with temp ID
      newSession = {
        id: 'offline_ses_' + Date.now(),
        name: sessionName,
        status: 'active',
        started_at: new Date().toISOString(),
        started_by: u.full_name || u.email || 'Unknown',
        readings: {},
        _offline: true,
      };
      setToast('Session started offline — will sync when back online');
      setTimeout(() => setToast(''), 4000);
    }
    setSession(newSession);
    goToSessionIndex(0);
    setNewReading('');
    setCapturedImage(null);
    setOcrConfidence(null);
    setTab('session');
    setPastSessions(prev => [newSession, ...prev]);
    loadGasCylindersForSession();
    setToast('Reading session started — other devices can join this session');
    setTimeout(() => setToast(''), 4000);
  }

  // ---- Baseline readings (first-time setup) ----
  async function saveBaselineReadings() {
    const entries = Object.entries(baselineReadings).filter(([, v]) => v && String(v).trim());
    if (entries.length === 0) return;
    setSavingBaseline(true);

    for (const [pitchId, readingVal] of entries) {
      const val = parseFloat(readingVal);
      if (isNaN(val)) continue;
      const payload = { pitch_id: pitchId, reading: val, previous_reading: 0, usage_kwh: 0 };

      if (supabase) {
        await supabase.from('meter_readings').insert({ ...payload, org_id: getOrgId() });
      } else {
        const pitch = pitches.find(p => p.id === pitchId);
        const newR = {
          id: String(Date.now()) + pitchId,
          ...payload,
          read_at: new Date().toISOString(),
          pitch: { pitch_number: pitch?.pitch_number, customer_name: pitch?.customer_name },
        };
        setReadings(prev => [newR, ...prev]);
      }
    }

    setSavingBaseline(false);
    setShowBaseline(false);
    setBaselineReadings({});
    loadData();
    setToast(`Baseline readings saved for ${entries.length} pitches`);
    setTimeout(() => setToast(''), 3000);
  }

  // ---- Load gas cylinders for all pitches (rehydrate sessionGasCylinders from DB) ----
  async function loadGasCylindersForSession() {
    if (!supabase) return;
    try {
      const { data } = await supabase
        .from('gas_cylinders')
        .select('id, collar_number, size, type, pitch_id, status')
        .eq('status', 'with_customer')
        .order('created_at', { ascending: false });
      if (data && data.length > 0) {
        const map = {};
        data.forEach(c => {
          if (!c.pitch_id) return;
          if (!map[c.pitch_id]) map[c.pitch_id] = [];
          map[c.pitch_id].push({ id: c.id, collar_number: c.collar_number, size: c.size, type: c.type });
        });
        setSessionGasCylinders(map);
      }
    } catch (err) {
      console.error('Failed to load gas cylinders:', err);
    }
  }

  // ---- Gas cylinder entry during session ----
  async function addSessionGasCylinder(pitchId) {
    if (!gasCollarInput || gasCollarInput.trim().length < 1) return;
    const pitch = pitches.find(p => p.id === pitchId);
    const collar = gasCollarInput.trim();

    // Save to Supabase or localStorage
    if (supabase) {
      try {
        // Check if collar already exists
        const { data: existing } = await supabase.from('gas_cylinders').select('id').eq('collar_number', collar).limit(1);
        let cylinderId;
        if (existing && existing.length > 0) {
          cylinderId = existing[0].id;
          await supabase.from('gas_cylinders').update({
            status: 'with_customer', pitch_id: pitchId,
            pitch_number: pitch?.pitch_number || null, customer_name: pitch?.customer_name || null,
            size: gasSize, type: gasType, updated_at: new Date().toISOString(),
          }).eq('id', cylinderId);
        } else {
          const { data: inserted } = await supabase.from('gas_cylinders').insert({
            collar_number: collar, size: gasSize, type: gasType,
            status: 'with_customer', pitch_id: pitchId,
            pitch_number: pitch?.pitch_number || null, customer_name: pitch?.customer_name || null,
            org_id: getOrgId(),
          }).select('id').single();
          cylinderId = inserted?.id;
        }
        // Log to gas_logs
        if (cylinderId) {
          await supabase.from('gas_logs').insert({
            cylinder_id: cylinderId, collar_number: collar,
            action: 'given_to_customer',
            pitch_id: pitchId,
            pitch_number: pitch?.pitch_number || null,
            customer_name: pitch?.customer_name || null,
            notes: `${gasSize} ${gasType} — added during meter reading session`,
            org_id: getOrgId(),
          });
        }
      } catch (err) {
        console.error('Gas cylinder save error:', err);
        setToast('Failed to save cylinder — try again');
        setTimeout(() => setToast(''), 3000);
        return;
      }
    } else {
      try {
        const cyl = { collar_number: collar, size: gasSize, type: gasType, status: 'with_customer', pitch_id: pitchId, pitch_number: pitch?.pitch_number || null, customer_name: pitch?.customer_name || null };
        const saved = JSON.parse(localStorage.getItem('pm_gas_cylinders') || '[]');
        const idx = saved.findIndex(c => c.collar_number === collar);
        if (idx >= 0) {
          saved[idx] = { ...saved[idx], ...cyl, updated_at: new Date().toISOString() };
        } else {
          saved.unshift({ id: 'cyl_' + Date.now(), ...cyl, created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
        }
        localStorage.setItem('pm_gas_cylinders', JSON.stringify(saved));
      } catch {}
    }

    // Track in session state
    setSessionGasCylinders(prev => ({
      ...prev,
      [pitchId]: [...(prev[pitchId] || []), { collar_number: collar, size: gasSize, type: gasType }],
    }));

    setGasCollarInput('');
    setToast(`Cylinder ${collar} added — ${pitch?.pitch_number || 'pitch'}`);
    setTimeout(() => setToast(''), 3000);
  }

  async function updateSessionGasCylinder(pitchId, index) {
    if (!editGasCollar.trim()) return;
    const cyl = (sessionGasCylinders[pitchId] || [])[index];
    const updatedCyl = { ...cyl, collar_number: editGasCollar.trim(), size: editGasSize, type: editGasType };

    if (supabase && cyl) {
      try {
        if (cyl.id) {
          await supabase.from('gas_cylinders').update({
            collar_number: updatedCyl.collar_number, size: updatedCyl.size, type: updatedCyl.type,
            updated_at: new Date().toISOString(),
          }).eq('id', cyl.id);
        } else if (cyl.collar_number) {
          await supabase.from('gas_cylinders').update({
            collar_number: updatedCyl.collar_number, size: updatedCyl.size, type: updatedCyl.type,
            updated_at: new Date().toISOString(),
          }).eq('collar_number', cyl.collar_number).eq('pitch_id', pitchId);
        }
      } catch (err) {
        console.error('Gas cylinder update error:', err);
        setToast('Failed to update cylinder — try again');
        setTimeout(() => setToast(''), 3000);
        return;
      }
    }

    setSessionGasCylinders(prev => {
      const updated = [...(prev[pitchId] || [])];
      updated[index] = updatedCyl;
      return { ...prev, [pitchId]: updated };
    });
    setEditingGasCylIndex(null);
    setToast(`Cylinder updated to ${updatedCyl.collar_number}`);
    setTimeout(() => setToast(''), 3000);
  }

  async function removeSessionGasCylinder(pitchId, index) {
    const cyl = (sessionGasCylinders[pitchId] || [])[index];
    // Remove from DB if it has an id or collar_number
    if (supabase && cyl) {
      try {
        if (cyl.id) {
          await supabase.from('gas_cylinders').update({ status: 'returned', pitch_id: null, updated_at: new Date().toISOString() }).eq('id', cyl.id);
        } else if (cyl.collar_number) {
          await supabase.from('gas_cylinders').update({ status: 'returned', pitch_id: null, updated_at: new Date().toISOString() }).eq('collar_number', cyl.collar_number).eq('pitch_id', pitchId);
        }
      } catch (err) {
        console.error('Failed to remove cylinder from DB:', err);
      }
    }
    setSessionGasCylinders(prev => {
      const updated = [...(prev[pitchId] || [])];
      updated.splice(index, 1);
      return { ...prev, [pitchId]: updated };
    });
  }

  async function markDormant(pitch) {
    if (!session || !pitch) return;
    if (!confirm(`Mark ${pitch.pitch_number} as dormant (no reading needed)?`)) return;

    // Save a dormant reading marker to DB
    const payload = {
      pitch_id: pitch.id,
      reading: 0,
      previous_reading: 0,
      usage_kwh: 0,
      session_id: session.id,
    };

    if (supabase) {
      try {
        // Check no existing reading for this pitch in this session
        const { data: existing } = await supabase
          .from('meter_readings')
          .select('id')
          .eq('session_id', session.id)
          .eq('pitch_id', pitch.id)
          .limit(1);
        if (existing && existing.length > 0) {
          setToast(`${pitch.pitch_number} already has a reading in this session`);
          setTimeout(() => setToast(''), 3000);
          return;
        }
        const { error: insertErr } = await supabase.from('meter_readings').insert({ ...payload, org_id: getOrgId() });
        if (insertErr) throw insertErr;
      } catch {
        addToOfflineQueue({ type: 'dormant', payload, pitch_number: pitch.pitch_number });
        setToast(`Saved offline — dormant status will sync when back online`);
        setTimeout(() => setToast(''), 4000);
      }
    } else {
      const newR = {
        id: String(Date.now()), ...payload,
        read_at: new Date().toISOString(),
        pitch: { pitch_number: pitch.pitch_number, customer_name: pitch.customer_name },
      };
      setReadings(prev => [newR, ...prev]);
    }

    // Update session locally
    const updatedSession = {
      ...session,
      readings: {
        ...session.readings,
        [pitch.id]: {
          reading: 0,
          previous_reading: 0,
          usage_kwh: 0,
          dormant: true,
          read_at: new Date().toISOString(),
          pitch_number: pitch.pitch_number,
          customer_name: pitch.customer_name,
          meter_id: pitch.meter_id,
        },
      },
    };

    const sPitches = pitchesForSession();
    const completedCount = Object.keys(updatedSession.readings).length;
    if (completedCount >= sPitches.length) {
      updatedSession.status = 'complete';
      updatedSession.completed_at = new Date().toISOString();
    }

    updateSession(updatedSession);
    setToast(`${pitch.pitch_number} marked as dormant`);
    setTimeout(() => setToast(''), 3000);

    // Auto advance
    setNewReading('');
    setCapturedImage(null);
    setOcrConfidence(null);

    if (updatedSession.status === 'complete') {
      setToast('All readings complete! Session finished.');
      setTimeout(() => setToast(''), 4000);
    } else {
      const nextIdx = sPitches.findIndex((p, i) => i > sessionPitchIndex && !updatedSession.readings[p.id]);
      if (nextIdx >= 0) goToSessionIndex(nextIdx);
      else {
        const wrap = sPitches.findIndex(p => !updatedSession.readings[p.id]);
        if (wrap >= 0) goToSessionIndex(wrap);
      }
    }
  }

  async function unmarkDormant(pitch) {
    if (!session || !pitch) return;

    // Remove the dormant reading from DB
    if (supabase) {
      try {
        await supabase.from('meter_readings')
          .delete()
          .eq('session_id', session.id)
          .eq('pitch_id', pitch.id);
      } catch {
        setToast('Offline — dormant status will be updated when back online');
        setTimeout(() => setToast(''), 3000);
      }
    }

    // Remove from session locally
    const updatedReadings = { ...session.readings };
    delete updatedReadings[pitch.id];
    const updatedSession = { ...session, readings: updatedReadings, status: 'active', completed_at: null };
    updateSession(updatedSession);
    setToast(`${pitch.pitch_number} marked as live — ready for reading`);
    setTimeout(() => setToast(''), 3000);
  }

  async function editCompletedSession(sess) {
    // Re-open a completed session for editing all readings and gas cylinders
    const editSession = { ...sess, status: 'active', completed_at: null, _editing: true };

    // Update status in DB
    if (supabase) {
      try {
        await supabase.from('reading_sessions').update({
          status: 'active', completed_at: null,
        }).eq('id', sess.id);
      } catch (err) {
        console.error('Failed to reopen session:', err);
      }
    }

    setSession(editSession);
    setPastSessions(prev => prev.map(s => s.id === sess.id ? editSession : s));
    goToSessionIndex(0);
    setNewReading('');
    setCapturedImage(null);
    setOcrConfidence(null);
    setTab('session');
    loadGasCylindersForSession();
    setToast('Session reopened for editing — navigate to any pitch to edit readings or gas cylinders');
    setTimeout(() => setToast(''), 5000);
  }

  function resumeSession(sess) {
    setSession(sess);
    const sPitches = pitchesForSession(sess);
    const idx = sPitches.findIndex(p => !sess.readings[p.id]);
    goToSessionIndex(idx >= 0 ? idx : 0);
    setNewReading('');
    setCapturedImage(null);
    setOcrConfidence(null);
    setTab('session');
    loadGasCylindersForSession();
    setToast('Session resumed');
    setTimeout(() => setToast(''), 3000);
  }

  async function updateSession(updatedSession) {
    setSession(updatedSession);

    if (!supabase) {
      const all = pastSessions.map(s => s.id === updatedSession.id ? updatedSession : s);
      if (!all.find(s => s.id === updatedSession.id)) all.push(updatedSession);
      saveSessions(all);
      return;
    }

    // Update session row in Supabase (status, completed_at only — readings are in meter_readings)
    try {
      await supabase.from('reading_sessions').update({
        status: updatedSession.status,
        completed_at: updatedSession.completed_at || null,
      }).eq('id', updatedSession.id);
    } catch {
      addToOfflineQueue({
        type: 'session_update',
        session_id: updatedSession.id,
        status: updatedSession.status,
        completed_at: updatedSession.completed_at,
      });
    }

    // Cache session locally
    cacheToLocal('sessions', pastSessions.map(s => s.id === updatedSession.id ? updatedSession : s));

    setPastSessions(prev => {
      const all = prev.map(s => s.id === updatedSession.id ? updatedSession : s);
      if (!all.find(s => s.id === updatedSession.id)) all.push(updatedSession);
      return all;
    });
  }

  async function saveSessionReading() {
    if (!session || !newReading) return;
    setSaving(true);

    const sPitches = pitchesForSession();
    // Use ref pitch ID for safety — prevents saving to wrong pitch if index drifts
    let pitch = sPitches[sessionPitchIndex];
    if (sessionPitchIdRef.current) {
      const refPitch = sPitches.find(p => p.id === sessionPitchIdRef.current);
      if (refPitch) pitch = refPitch;
    }
    if (!pitch) { setSaving(false); return; }

    // Duplicate check — another device may have already read this pitch
    if (session.readings[pitch.id]) {
      setToast(`${pitch.pitch_number} already read (possibly by another device). Skipping to next.`);
      setTimeout(() => setToast(''), 3000);
      setSaving(false);
      const nextIdx = sPitches.findIndex((p, i) => i > sessionPitchIndex && !session.readings[p.id]);
      if (nextIdx >= 0) goToSessionIndex(nextIdx);
      return;
    }

    const readingVal = parseFloat(newReading);
    let prevReading = 0;

    if (supabase) {
      try {
        // Get previous reading EXCLUDING current session readings
        const { data: prev } = await supabase
          .from('meter_readings').select('reading').eq('pitch_id', pitch.id)
          .or(`session_id.is.null,session_id.neq.${session.id}`)
          .order('read_at', { ascending: false }).limit(1);
        if (prev && prev.length > 0) prevReading = Number(prev[0].reading);
      } catch {
        // Offline: use cached readings for previous reading
        const cachedReadings = getFromCache('readings');
        if (cachedReadings?.data) {
          const prev = cachedReadings.data.filter(r => r.pitch_id === pitch.id);
          if (prev.length > 0) prevReading = Number(prev[0].reading);
        }
      }
    } else {
      const prev = readings.filter(r => r.pitch_id === pitch.id);
      if (prev.length > 0) prevReading = prev[0].reading;
    }

    const usage = Math.max(0, readingVal - prevReading);
    const payload = {
      pitch_id: pitch.id,
      reading: readingVal,
      previous_reading: prevReading,
      usage_kwh: usage,
      session_id: session.id, // Link reading to session for multi-device sync
    };

    // Save to DB
    if (!supabase) {
      const newR = {
        id: String(Date.now()), ...payload,
        read_at: new Date().toISOString(),
        pitch: { pitch_number: pitch.pitch_number, customer_name: pitch.customer_name },
      };
      setReadings(prev => [newR, ...prev]);
    } else {
      try {
        // Double-check no duplicate in DB (race condition guard)
        const { data: existing } = await supabase
          .from('meter_readings')
          .select('id')
          .eq('session_id', session.id)
          .eq('pitch_id', pitch.id)
          .limit(1);
        if (existing && existing.length > 0) {
          setToast(`${pitch.pitch_number} was just read by another device. Moving on.`);
          setTimeout(() => setToast(''), 3000);
          setSaving(false);
          // Refresh session readings
          const { data: freshReadings } = await supabase
            .from('meter_readings')
            .select('*, pitches(pitch_number, customer_name, meter_id)')
            .eq('session_id', session.id);
          if (freshReadings) {
            const map = buildReadingsMap(freshReadings);
            setSession(prev => prev ? { ...prev, readings: map } : prev);
          }
          return;
        }

        const { error: insertErr } = await supabase.from('meter_readings').insert({ ...payload, org_id: getOrgId() });
        if (insertErr) throw insertErr;
      } catch (err) {
        // Queue for offline sync instead of failing
        addToOfflineQueue({ type: 'reading', payload, pitch_number: pitch.pitch_number });
        setToast(`Saved offline — ${pitch.pitch_number} will sync when back online`);
        setTimeout(() => setToast(''), 4000);
        // Continue to update session locally (don't return)
      }
    }

    // Update session locally
    const updatedSession = {
      ...session,
      readings: {
        ...session.readings,
        [pitch.id]: {
          reading: readingVal,
          previous_reading: prevReading,
          usage_kwh: usage,
          read_at: new Date().toISOString(),
          pitch_number: pitch.pitch_number,
          customer_name: pitch.customer_name,
          meter_id: pitch.meter_id,
        },
      },
    };

    // Check if all done
    const totalPitches = sPitches.length;
    const completedCount = Object.keys(updatedSession.readings).length;
    if (completedCount >= totalPitches) {
      updatedSession.status = 'complete';
      updatedSession.completed_at = new Date().toISOString();
    }

    updateSession(updatedSession);

    const cost = (usage * unitRate).toFixed(2);
    setToast(`${pitch.pitch_number}: ${fmtReading(readingVal)} saved (${usage} kWh = £${cost})`);
    setTimeout(() => setToast(''), 3000);

    // Auto advance to next unread pitch
    setNewReading('');
    setCapturedImage(null);
    setOcrConfidence(null);

    if (updatedSession.status === 'complete') {
      setToast('All readings complete! Session finished.');
      setTimeout(() => setToast(''), 4000);
    } else {
      // Find next unread
      let nextIdx = sessionPitchIndex + 1;
      while (nextIdx < totalPitches && updatedSession.readings[sPitches[nextIdx]?.id]) {
        nextIdx++;
      }
      if (nextIdx >= totalPitches) {
        nextIdx = sPitches.findIndex(p => !updatedSession.readings[p.id]);
      }
      if (nextIdx >= 0) goToSessionIndex(nextIdx);
    }

    setSaving(false);
    if (!supabase) loadData();
  }

  // ---- Edit an already-saved session reading ----
  async function updateSessionReading() {
    if (!session || !editingSessionPitchId || !editSessionValue) return;
    setSaving(true);

    const pitch = pitches.find(p => p.id === editingSessionPitchId);
    const cr = session.readings[editingSessionPitchId];
    const newVal = parseFloat(editSessionValue);
    const prevReading = cr?.previous_reading || 0;
    const usage = Math.max(0, newVal - prevReading);

    if (supabase) {
      try {
        const { error } = await supabase.from('meter_readings')
          .update({ reading: newVal, usage_kwh: usage, updated_at: new Date().toISOString() })
          .eq('session_id', session.id)
          .eq('pitch_id', editingSessionPitchId);
        if (error) throw error;
      } catch (err) {
        console.error('Update reading error:', err);
        setToast('Failed to update reading — try again');
        setTimeout(() => setToast(''), 3000);
        setSaving(false);
        return;
      }
    }

    // Update session state
    const updatedSession = {
      ...session,
      readings: {
        ...session.readings,
        [editingSessionPitchId]: {
          ...cr,
          reading: newVal,
          usage_kwh: usage,
          read_at: new Date().toISOString(),
        },
      },
    };
    updateSession(updatedSession);
    setEditingSessionPitchId(null);
    setEditSessionValue('');
    setSaving(false);

    const cost = (usage * unitRate).toFixed(2);
    setToast(`${pitch?.pitch_number || 'Pitch'} updated: ${fmtReading(newVal)} (${usage} kWh = £${cost})`);
    setTimeout(() => setToast(''), 3000);
  }

  function sessionSkipPitch() {
    if (!session) return;
    const sPitches = pitchesForSession();
    let nextIdx = sessionPitchIndex + 1;
    if (nextIdx >= sPitches.length) nextIdx = 0;
    goToSessionIndex(nextIdx);
    setNewReading('');
    setCapturedImage(null);
    setOcrConfidence(null);
  }

  function sessionGoToPitch(idx) {
    setSessionPitchIndex(idx);
    const sPitches = pitchesForSession();
    if (sPitches[idx]) sessionPitchIdRef.current = sPitches[idx].id;
    setNewReading('');
    setCapturedImage(null);
    setOcrConfidence(null);
  }

  function pauseSession() {
    setSession(null);
    setTab('session');
    setToast('Session paused — you can resume anytime from the list');
    setTimeout(() => setToast(''), 3000);
  }

  async function cancelSession(sessId) {
    if (!confirm('Cancel this session? Any readings saved will be deleted.')) return;

    if (supabase) {
      await supabase.from('meter_readings').delete().eq('session_id', sessId);
      await supabase.from('reading_sessions').delete().eq('id', sessId);
      setPastSessions(prev => prev.filter(s => s.id !== sessId));
    } else {
      const all = pastSessions.filter(s => s.id !== sessId);
      saveSessions(all);
    }

    setSession(null);
    setTab('session');
    setToast('Session cancelled');
    setTimeout(() => setToast(''), 3000);
  }

  async function deleteSession(sessId) {
    if (!confirm('Delete this session and all its readings?')) return;

    if (supabase) {
      // Delete readings first, then session
      await supabase.from('meter_readings').delete().eq('session_id', sessId);
      await supabase.from('reading_sessions').delete().eq('id', sessId);
      setPastSessions(prev => prev.filter(s => s.id !== sessId));
    } else {
      const all = pastSessions.filter(s => s.id !== sessId);
      saveSessions(all);
    }

    if (session?.id === sessId) { setSession(null); setTab('readings'); }
    setToast('Session deleted');
    setTimeout(() => setToast(''), 3000);
  }

  // ---- Session Export ----
  async function exportSessionPdf(sess, recipient) {
    // Reload latest readings from DB so edits are reflected in the PDF
    if (supabase && sess.id) {
      try {
        const { data: freshReadings } = await supabase
          .from('meter_readings')
          .select('*, pitches(pitch_number, customer_name, meter_id)')
          .eq('session_id', sess.id);
        if (freshReadings && freshReadings.length > 0) {
          sess = { ...sess, readings: buildReadingsMap(freshReadings) };
        }
      } catch {}
    }

    const { default: jsPDF } = await import('jspdf');
    const doc = new jsPDF();

    // Load settings
    let siteName = 'Park Manager AI', hoName = '', managerEmail = '', rateStr = '0.34';
    if (supabase) {
      try {
        const { data } = await supabase.from('site_settings').select('*');
        (data || []).forEach(s => {
          if (s.key === 'site_name') siteName = s.value;
          if (s.key === 'ho_name') hoName = s.value;
          if (s.key === 'manager_email') managerEmail = s.value;
          if (s.key === 'electricity_unit_rate') rateStr = s.value;
        });
      } catch {}
    } else {
      try {
        const saved = localStorage.getItem('pm_settings');
        if (saved) {
          JSON.parse(saved).forEach(s => {
            if (s.key === 'site_name') siteName = s.value;
            if (s.key === 'ho_name') hoName = s.value;
            if (s.key === 'manager_email') managerEmail = s.value;
            if (s.key === 'electricity_unit_rate') rateStr = s.value;
          });
        }
      } catch {}
    }

    const rate = parseFloat(rateStr) || 0.34;
    const sPitches = pitches;

    // Header
    doc.setFontSize(18);
    doc.setTextColor(16, 185, 129); // emerald
    doc.text(siteName, 14, 20);
    doc.setFontSize(12);
    doc.setTextColor(0);
    doc.text('Meter Reading Session Report', 14, 28);
    doc.setFontSize(9);
    doc.setTextColor(100);
    doc.text(`Session: ${sess.name || 'Reading Session'}`, 14, 35);
    doc.text(`Date: ${new Date(sess.started_at).toLocaleDateString('en-GB')} ${sess.completed_at ? '(Completed)' : '(In Progress)'}`, 14, 40);
    if (recipient === 'head_office' && hoName) doc.text(`To: ${hoName}`, 14, 45);
    if (recipient === 'manager' && managerEmail) doc.text(`To: Site Manager (${managerEmail})`, 14, 45);

    const completedReadings = Object.entries(sess.readings);
    const totalUsage = completedReadings.reduce((sum, [, r]) => sum + (r.usage_kwh || 0), 0);
    const totalCost = totalUsage * rate;
    const showCost = recipient !== 'head_office';

    // Period
    const readDates = completedReadings.map(([, r]) => r.read_at).filter(Boolean).sort();
    const periodStr = readDates.length > 0 ? `${new Date(readDates[0]).toLocaleDateString('en-GB')} — ${new Date(readDates[readDates.length - 1]).toLocaleDateString('en-GB')}` : new Date(sess.started_at).toLocaleDateString('en-GB');

    // Summary
    let y = 55;
    doc.setFontSize(10);
    doc.setTextColor(0);
    doc.text(`Pitches Read: ${completedReadings.length} / ${sPitches.length}`, 14, y);
    doc.text(`Total Usage: ${totalUsage.toLocaleString()} kWh`, 100, y);
    y += 6;
    doc.text(`Period: ${periodStr}`, 14, y);
    if (showCost) doc.text(`Total Cost: £${totalCost.toFixed(2)} @ £${rate}/kWh`, 100, y);

    // Table header
    y += 12;
    doc.setFillColor(241, 245, 249);
    doc.rect(14, y - 4, 182, 8, 'F');
    doc.setFontSize(8);
    doc.setTextColor(100);
    doc.text('Pitch', 16, y);
    doc.text('Customer', 36, y);
    doc.text('Meter ID', 86, y);
    doc.text('Previous (From)', 108, y);
    doc.text('Current (To)', 138, y);
    doc.text('Usage (kWh)', 166, y);
    if (showCost) doc.text('Cost', 190, y);

    // Table rows
    y += 6;
    doc.setTextColor(0);

    const dormantCount = completedReadings.filter(([, r]) => r.dormant).length;

    for (const p of sPitches) {
      if (y > 275) { doc.addPage(); y = 20; }
      const r = sess.readings[p.id];
      doc.setFontSize(8);

      if (r && r.dormant) {
        doc.setTextColor(150);
        doc.text(p.pitch_number, 16, y);
        doc.text((r.customer_name || p.customer_name || 'Vacant').substring(0, 25), 36, y);
        doc.text(r.meter_id || p.meter_id || '', 86, y);
        doc.text('DORMANT', 134, y);
        doc.setTextColor(0);
      } else if (r) {
        doc.text(p.pitch_number, 16, y);
        doc.text((r.customer_name || p.customer_name || 'Vacant').substring(0, 25), 36, y);
        doc.text(r.meter_id || p.meter_id || '', 86, y);
        doc.text(fmtReading(r.previous_reading || 0), 112, y);
        doc.text(fmtReading(r.reading), 142, y);
        doc.setTextColor(16, 185, 129);
        doc.text(String(r.usage_kwh || 0), 170, y);
        if (showCost) doc.text(`£${((r.usage_kwh || 0) * rate).toFixed(2)}`, 190, y);
        doc.setTextColor(0);
      } else {
        doc.setTextColor(180);
        doc.text(p.pitch_number, 16, y);
        doc.text((p.customer_name || 'Vacant').substring(0, 25), 36, y);
        doc.text('— not read —', 134, y);
        doc.setTextColor(0);
      }
      y += 5;
    }

    // Dormant summary
    if (dormantCount > 0) {
      y += 4;
      doc.setFontSize(8);
      doc.setTextColor(120);
      doc.text(`${dormantCount} pitch${dormantCount !== 1 ? 'es' : ''} marked as dormant (no meter reading taken)`, 14, y);
    }

    // Footer
    y += 8;
    if (y > 270) { doc.addPage(); y = 20; }
    const u = JSON.parse(sessionStorage.getItem('pm_user') || '{}');
    doc.setFontSize(8);
    doc.setTextColor(80);
    doc.text(`Carried out by: ${u.full_name || u.email || ''}`, 14, y);
    y += 5;
    doc.setFontSize(7);
    doc.setTextColor(150);
    doc.text(`Generated by ${siteName} on ${new Date().toLocaleString('en-GB')}`, 14, y);

    const filename = `MeterReadings-${new Date(sess.started_at).toISOString().slice(0, 10)}-${recipient}.pdf`;
    doc.save(filename);
    setToast(`PDF exported: ${filename}`);
    setTimeout(() => setToast(''), 3000);
    setShowExportModal(false);
  }

  async function emailSessionReport(sess, recipientType) {
    setSendingEmail(recipientType);

    // Reload latest readings from DB so edits are reflected in the email report
    if (supabase && sess.id) {
      try {
        const { data: freshReadings } = await supabase
          .from('meter_readings')
          .select('*, pitches(pitch_number, customer_name, meter_id)')
          .eq('session_id', sess.id);
        if (freshReadings && freshReadings.length > 0) {
          sess = { ...sess, readings: buildReadingsMap(freshReadings) };
        }
      } catch {}
    }

    // Load settings from Supabase or localStorage
    let recipientEmail = '', siteName = 'Park Manager AI', hoName = '', rate = unitRate;
    if (supabase) {
      try {
        const { data } = await supabase.from('site_settings').select('*');
        (data || []).forEach(s => {
          if (s.key === 'site_name') siteName = s.value;
          if (s.key === 'ho_name') hoName = s.value;
          if (s.key === 'electricity_unit_rate') rate = parseFloat(s.value) || 0.34;
          if (recipientType === 'manager' && s.key === 'manager_email') recipientEmail = s.value;
          if (recipientType === 'head_office' && s.key === 'ho_email') recipientEmail = s.value;
        });
      } catch {}
    } else {
      try {
        const saved = JSON.parse(localStorage.getItem('pm_settings') || '[]');
        saved.forEach(s => {
          if (s.key === 'site_name') siteName = s.value;
          if (s.key === 'ho_name') hoName = s.value;
          if (s.key === 'electricity_unit_rate') rate = parseFloat(s.value) || 0.34;
          if (recipientType === 'manager' && s.key === 'manager_email') recipientEmail = s.value;
          if (recipientType === 'head_office' && s.key === 'ho_email') recipientEmail = s.value;
        });
      } catch {}
    }

    if (!recipientEmail) {
      setToast(`No ${recipientType === 'manager' ? 'manager' : 'head office'} email configured. Set it in Settings.`);
      setTimeout(() => setToast(''), 4000);
      setSendingEmail(null);
      return;
    }

    // Generate PDF in memory
    const { default: jsPDF } = await import('jspdf');
    const doc = new jsPDF();
    const sPitches = pitches;
    const completedReadings = Object.entries(sess.readings);
    const totalUsage = completedReadings.reduce((sum, [, r]) => sum + (r.usage_kwh || 0), 0);
    const totalCost = (totalUsage * rate).toFixed(2);
    const showCost = recipientType !== 'head_office';

    // Period from reading dates
    const readDates = completedReadings.map(([, r]) => r.read_at).filter(Boolean).sort();
    const periodStr = readDates.length > 0 ? `${new Date(readDates[0]).toLocaleDateString('en-GB')} — ${new Date(readDates[readDates.length - 1]).toLocaleDateString('en-GB')}` : new Date(sess.started_at).toLocaleDateString('en-GB');

    // Header
    doc.setFontSize(18);
    doc.setTextColor(16, 185, 129);
    doc.text(siteName, 14, 20);
    doc.setFontSize(12);
    doc.setTextColor(0);
    doc.text('Meter Reading Session Report', 14, 28);
    doc.setFontSize(9);
    doc.setTextColor(100);
    doc.text(`Session: ${sess.name || 'Reading Session'}`, 14, 35);
    doc.text(`Date: ${new Date(sess.started_at).toLocaleDateString('en-GB')} ${sess.completed_at ? '(Completed)' : '(In Progress)'}`, 14, 40);
    if (recipientType === 'head_office' && hoName) doc.text(`To: ${hoName}`, 14, 45);
    if (recipientType === 'manager' && recipientEmail) doc.text(`To: Site Manager (${recipientEmail})`, 14, 45);

    // Summary
    let y = 55;
    doc.setFontSize(10);
    doc.setTextColor(0);
    doc.text(`Pitches Read: ${completedReadings.length} / ${sPitches.length}`, 14, y);
    doc.text(`Total Usage: ${totalUsage.toLocaleString()} kWh`, 100, y);
    y += 6;
    doc.text(`Period: ${periodStr}`, 14, y);
    if (showCost) doc.text(`Total Cost: £${totalCost} @ £${rate}/kWh`, 100, y);

    // Table header
    y += 12;
    doc.setFillColor(241, 245, 249);
    doc.rect(14, y - 4, 182, 8, 'F');
    doc.setFontSize(8);
    doc.setTextColor(100);
    doc.text('Pitch', 16, y);
    doc.text('Customer', 36, y);
    doc.text('Meter ID', 86, y);
    doc.text('Previous (From)', 108, y);
    doc.text('Current (To)', 138, y);
    doc.text('Usage (kWh)', 166, y);
    if (showCost) doc.text('Cost', 190, y);

    // Table rows
    y += 6;
    doc.setTextColor(0);
    const emailDormantCount = completedReadings.filter(([, r]) => r.dormant).length;

    for (const p of sPitches) {
      if (y > 275) { doc.addPage(); y = 20; }
      const r = sess.readings[p.id];
      doc.setFontSize(8);
      if (r && r.dormant) {
        doc.setTextColor(150);
        doc.text(p.pitch_number, 16, y);
        doc.text((r.customer_name || p.customer_name || 'Vacant').substring(0, 25), 36, y);
        doc.text(r.meter_id || p.meter_id || '', 86, y);
        doc.text('DORMANT', 134, y);
        doc.setTextColor(0);
      } else if (r) {
        doc.text(p.pitch_number, 16, y);
        doc.text((r.customer_name || p.customer_name || 'Vacant').substring(0, 25), 36, y);
        doc.text(r.meter_id || p.meter_id || '', 86, y);
        doc.text(fmtReading(r.previous_reading || 0), 112, y);
        doc.text(fmtReading(r.reading), 142, y);
        doc.setTextColor(16, 185, 129);
        doc.text(String(r.usage_kwh || 0), 170, y);
        if (showCost) doc.text(`£${((r.usage_kwh || 0) * rate).toFixed(2)}`, 190, y);
        doc.setTextColor(0);
      } else {
        doc.setTextColor(180);
        doc.text(p.pitch_number, 16, y);
        doc.text((p.customer_name || 'Vacant').substring(0, 25), 36, y);
        doc.text('— not read —', 134, y);
        doc.setTextColor(0);
      }
      y += 5;
    }

    if (emailDormantCount > 0) {
      y += 4;
      doc.setFontSize(8);
      doc.setTextColor(120);
      doc.text(`${emailDormantCount} pitch${emailDormantCount !== 1 ? 'es' : ''} marked as dormant (no meter reading taken)`, 14, y);
    }

    // Footer
    y += 8;
    if (y > 270) { doc.addPage(); y = 20; }
    const eu = JSON.parse(sessionStorage.getItem('pm_user') || '{}');
    doc.setFontSize(8);
    doc.setTextColor(80);
    doc.text(`Carried out by: ${eu.full_name || eu.email || ''}`, 14, y);
    y += 5;
    doc.setFontSize(7);
    doc.setTextColor(150);
    doc.text(`Generated by ${siteName} on ${new Date().toLocaleString('en-GB')}`, 14, y);

    // Convert PDF to base64
    const pdfBase64 = doc.output('datauristring').split(',')[1];
    const fileName = `MeterReadings-${new Date(sess.started_at).toISOString().slice(0, 10)}.pdf`;

    // Build email body (summary HTML) — head office: no cost, just usage/period
    const emailBody = `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
        <div style="background:#059669;padding:20px;border-radius:12px 12px 0 0;">
          <h1 style="color:#fff;margin:0;font-size:20px;">Meter Reading Report</h1>
        </div>
        <div style="background:#fff;padding:24px;border:1px solid #e2e8f0;border-top:0;border-radius:0 0 12px 12px;">
          <p style="font-size:14px;color:#1e293b;margin:0 0 8px;">
            <strong>Session:</strong> ${sess.name || 'Reading Session'}<br/>
            <strong>Period:</strong> ${periodStr}<br/>
            <strong>Status:</strong> ${sess.completed_at ? 'Completed' : 'In Progress'}
          </p>
          <table style="width:100%;border-collapse:collapse;margin:16px 0;">
            <tr><td style="padding:8px 0;color:#64748b;font-size:13px;">Pitches Read</td><td style="padding:8px 0;font-weight:700;font-size:13px;">${completedReadings.length} / ${sPitches.length}</td></tr>
            <tr><td style="padding:8px 0;color:#64748b;font-size:13px;">Total Usage</td><td style="padding:8px 0;font-weight:700;font-size:13px;">${totalUsage.toLocaleString()} kWh</td></tr>
            ${showCost ? `<tr><td style="padding:8px 0;color:#64748b;font-size:13px;">Unit Rate</td><td style="padding:8px 0;font-size:13px;">£${rate.toFixed(2)}/kWh</td></tr>
            <tr><td style="padding:8px 0;color:#64748b;font-size:13px;">Total Cost</td><td style="padding:8px 0;font-weight:700;font-size:15px;color:#059669;">£${totalCost}</td></tr>` : ''}
          </table>
          <p style="font-size:13px;color:#475569;">Please find the full meter reading report attached as a PDF.</p>
          <p style="font-size:11px;color:#94a3b8;margin-top:20px;">Generated by ${siteName} — ParkManagerAI</p>
        </div>
      </div>
    `;

    try {
      const res = await fetch('/api/send-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: recipientEmail,
          subject: `Meter Reading Report — ${sess.name || 'Session'} — ${new Date(sess.started_at).toLocaleDateString('en-GB')}`,
          body: emailBody,
          pdfBase64,
          fileName,
        }),
      });
      const result = await res.json();
      if (res.ok) {
        setToast(result.demo ? `Demo mode — email would be sent to ${recipientEmail}` : `Report emailed to ${recipientEmail} with PDF attached`);
        setShowExportModal(false);
      } else {
        setToast(`Failed: ${result.error || 'Unknown error'}`);
      }
    } catch {
      setToast('Email sending not available. Use PDF export instead.');
    }
    setTimeout(() => setToast(''), 5000);
    setSendingEmail(null);
  }

  // ---- Render ----
  if (!user) return null;

  const selectedPitchObj = pitches.find(p => p.id === selectedPitch);

  // Session helpers
  const sessionPitches = session ? pitchesForSession() : [];
  const sessionCompleted = session ? Object.keys(session.readings).length : 0;
  const sessionTotal = sessionPitches.length;
  const sessionPercent = sessionTotal > 0 ? Math.round((sessionCompleted / sessionTotal) * 100) : 0;
  const currentSessionPitch = sessionPitches[sessionPitchIndex];
  const currentPitchDone = session && currentSessionPitch ? !!session.readings[currentSessionPitch.id] : false;

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 px-4 py-3 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/dashboard" className="text-slate-400 hover:text-slate-700 text-sm">&larr; Dashboard</Link>
            <h1 className="text-lg font-bold text-slate-900">Meter Readings</h1>
          </div>
          <div className="flex items-center gap-2">
            {tab === 'readings' && (
              <button
                onClick={() => { resetForm(); setShowForm(true); }}
                className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-500 transition-colors"
              >
                + New Reading
              </button>
            )}
          </div>
        </div>
      </header>

      {toast && (
        <div className={`fixed top-4 right-4 z-50 text-white px-4 py-2 rounded-lg shadow-lg text-sm max-w-sm ${!isOnline ? 'bg-amber-600' : syncing ? 'bg-blue-600' : 'bg-emerald-600'}`}>{toast}</div>
      )}

      {/* Offline banner */}
      {!isOnline && (
        <div className="bg-amber-500 text-white px-4 py-2 text-center text-sm font-medium flex items-center justify-center gap-2">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 5.636a9 9 0 010 12.728M5.636 18.364a9 9 0 010-12.728m2.829 9.9a5 5 0 010-7.072m7.072 7.072a5 5 0 000-7.072" />
          </svg>
          Offline Mode — readings saved locally, will sync when reconnected
          {offlineQueue.length > 0 && (
            <span className="bg-white/20 px-2 py-0.5 rounded-full text-xs font-bold">{offlineQueue.length} queued</span>
          )}
        </div>
      )}

      {/* Syncing indicator */}
      {syncing && (
        <div className="bg-blue-500 text-white px-4 py-1.5 text-center text-xs font-medium flex items-center justify-center gap-2">
          <div className="animate-spin w-3 h-3 border-2 border-white border-t-transparent rounded-full" />
          Syncing offline readings...
        </div>
      )}

      {/* Offline queue badge (when online but queue exists) */}
      {isOnline && !syncing && offlineQueue.length > 0 && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 text-center text-sm flex items-center justify-center gap-2">
          <span className="text-amber-700">{offlineQueue.length} reading(s) waiting to sync</span>
          <button onClick={flushOfflineQueue} className="px-3 py-1 bg-amber-600 text-white rounded-lg text-xs font-medium hover:bg-amber-500">
            Sync Now
          </button>
        </div>
      )}

      {/* Tab bar */}
      <div className="max-w-7xl mx-auto px-4 pt-4">
        <div className="flex items-center gap-1 bg-white rounded-xl border p-1 mb-4">
          <button
            onClick={() => setTab('readings')}
            className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === 'readings' ? 'bg-emerald-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`}
          >
            Individual Readings
          </button>
          <button
            onClick={() => setTab('session')}
            className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2 ${tab === 'session' ? 'bg-emerald-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`}
          >
            Reading Session
            {session && session.status === 'active' && (
              <span className={`text-xs px-1.5 py-0.5 rounded-full ${tab === 'session' ? 'bg-white/20' : 'bg-amber-100 text-amber-700'}`}>
                {sessionPercent}%
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Export Modal */}
      {showExportModal && exportSession && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <h3 className="text-base font-bold text-slate-900 mb-1">Export Session Data</h3>
            <p className="text-xs text-slate-400 mb-4">{exportSession.name}</p>
            <div className="space-y-2">
              <button onClick={() => exportSessionPdf(exportSession, 'customer')} className="w-full text-left px-4 py-3 bg-slate-50 hover:bg-slate-100 rounded-xl text-sm transition-colors">
                <span className="font-medium text-slate-800">Customer Report (PDF)</span>
                <p className="text-xs text-slate-400">Individual usage and cost per pitch</p>
              </button>
              <button onClick={() => exportSessionPdf(exportSession, 'manager')} className="w-full text-left px-4 py-3 bg-slate-50 hover:bg-slate-100 rounded-xl text-sm transition-colors">
                <span className="font-medium text-slate-800">Site Manager Report (PDF)</span>
                <p className="text-xs text-slate-400">Full session summary with all readings</p>
              </button>
              <button onClick={() => exportSessionPdf(exportSession, 'head_office')} className="w-full text-left px-4 py-3 bg-slate-50 hover:bg-slate-100 rounded-xl text-sm transition-colors">
                <span className="font-medium text-slate-800">Head Office Report (PDF)</span>
                <p className="text-xs text-slate-400">Complete report addressed to head office</p>
              </button>
              <hr className="my-2" />
              <button onClick={() => emailSessionReport(exportSession, 'manager')} disabled={!!sendingEmail} className="w-full text-left px-4 py-3 bg-teal-50 hover:bg-teal-100 rounded-xl text-sm transition-colors disabled:opacity-50">
                <span className="font-medium text-teal-800">{sendingEmail === 'manager' ? 'Sending...' : 'Email to Site Manager'}</span>
                <p className="text-xs text-teal-600">{sendingEmail === 'manager' ? 'Generating PDF and sending email...' : 'Send report with PDF attachment'}</p>
              </button>
              <button onClick={() => emailSessionReport(exportSession, 'head_office')} disabled={!!sendingEmail} className="w-full text-left px-4 py-3 bg-teal-50 hover:bg-teal-100 rounded-xl text-sm transition-colors disabled:opacity-50">
                <span className="font-medium text-teal-800">{sendingEmail === 'head_office' ? 'Sending...' : 'Email to Head Office'}</span>
                <p className="text-xs text-teal-600">{sendingEmail === 'head_office' ? 'Generating PDF and sending email...' : 'Send report with PDF attachment'}</p>
              </button>
            </div>
            <button onClick={() => setShowExportModal(false)} className="w-full mt-4 py-2 text-sm text-slate-500 hover:text-slate-700">Close</button>
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto px-4 pb-8">
        {/* ======= INDIVIDUAL READINGS TAB ======= */}
        {tab === 'readings' && (
          <>
            {/* New / Edit Reading Form */}
            {showForm && (
              <div className="bg-white rounded-xl border p-5 mb-4">
                <h3 className="text-sm font-semibold text-slate-800 mb-4">
                  {editingReading ? 'Edit Reading' : 'Record New Reading'}
                </h3>
                <div className="mb-3">
                  <label className="block text-xs font-medium text-slate-500 mb-1">Select Pitch *</label>
                  <select value={selectedPitch} onChange={e => setSelectedPitch(e.target.value)} disabled={!!editingReading}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:bg-slate-50 disabled:text-slate-500">
                    <option value="">Choose pitch...</option>
                    {pitches.map(p => <option key={p.id} value={p.id}>{p.pitch_number} — {p.customer_name || 'Vacant'} ({p.meter_id || 'No meter'})</option>)}
                  </select>
                </div>
                {selectedPitchObj && (
                  <div className="bg-teal-50 border border-teal-200 rounded-lg p-3 mb-3 flex items-center gap-3">
                    <div className="w-10 h-10 bg-teal-600 rounded-lg flex items-center justify-center text-white font-bold text-sm flex-shrink-0">{selectedPitchObj.pitch_number}</div>
                    <div>
                      <p className="text-sm font-semibold text-teal-900">{selectedPitchObj.customer_name || 'Vacant'}</p>
                      <p className="text-xs text-teal-700">Meter: {selectedPitchObj.meter_id || 'N/A'}</p>
                    </div>
                  </div>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Meter Reading (kWh) *</label>
                    <input type="number" value={newReading} onChange={e => setNewReading(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono text-lg" placeholder="e.g. 15234" autoFocus />
                    {editingReading && (
                      <p className="text-xs text-slate-400 mt-1">Previous: {fmtReading(editingReading.previous_reading)} | Original: {fmtReading(editingReading.reading)}</p>
                    )}
                  </div>
                  <div className="flex items-end gap-2">
                    <button onClick={resetForm} className="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg text-sm">Cancel</button>
                    <button onClick={saveReading} disabled={!selectedPitch || !newReading || saving}
                      className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium disabled:opacity-50">
                      {saving ? 'Saving...' : editingReading ? 'Update Reading' : 'Save Reading'}
                    </button>
                  </div>
                </div>
                {/* Formatted reading preview */}
                {newReading && (
                  <div className="mt-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 flex items-center justify-between">
                    <span className="text-xs text-slate-500">Will save as:</span>
                    <span className="text-lg font-mono font-bold text-slate-800 tracking-wider">{fmtReading(newReading)}</span>
                  </div>
                )}
              </div>
            )}

            {/* Readings List */}
            {loading ? (
              <div className="flex justify-center py-12"><div className="animate-spin w-8 h-8 border-2 border-emerald-400 border-t-transparent rounded-full" /></div>
            ) : readings.length === 0 ? (
              <div className="bg-white rounded-xl border p-8 text-center">
                <p className="text-sm text-slate-400">No readings yet. Click &quot;New Reading&quot; to record one.</p>
              </div>
            ) : (
              <div className="bg-white rounded-xl border overflow-hidden">
                <table className="w-full">
                  <thead className="bg-slate-50 border-b">
                    <tr>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500">Pitch</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500">Customer</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500">Last Reading</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500">Current Reading</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500">Period kWh</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500">Cost</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 hidden sm:table-cell">Date</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {readings.map(r => (
                      <tr key={r.id} className="hover:bg-slate-50">
                        <td className="px-4 py-3 text-sm font-semibold text-slate-900">{r.pitch?.pitch_number || '—'}</td>
                        <td className="px-4 py-3 text-sm text-slate-600">{r.pitch?.customer_name || '—'}</td>
                        <td className="px-4 py-3 text-sm text-right font-mono text-slate-400">{fmtReading(r.previous_reading)}</td>
                        <td className="px-4 py-3 text-sm text-right font-mono">{fmtReading(r.reading)}</td>
                        <td className="px-4 py-3 text-sm text-right font-bold text-emerald-600">{Number(r.usage_kwh).toLocaleString()}</td>
                        <td className="px-4 py-3 text-sm text-right font-bold text-blue-600">&pound;{(Number(r.usage_kwh || 0) * unitRate).toFixed(2)}</td>
                        <td className="px-4 py-3 text-xs text-right text-slate-400 hidden sm:table-cell">{r.read_at ? new Date(r.read_at).toLocaleDateString() : '—'}</td>
                        <td className="px-4 py-3 text-right">
                          <button onClick={() => startEdit(r)} className="text-xs text-teal-600 hover:text-teal-800 font-medium mr-2">Edit</button>
                          <button onClick={() => deleteReading(r)} className="text-xs text-red-400 hover:text-red-600 font-medium">Delete</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {/* ======= SESSION TAB ======= */}
        {tab === 'session' && (
          <>
            {/* No active session */}
            {!session || session.status === 'complete' ? (
              <div className="space-y-4">
                {/* Incomplete session warning — must finish before starting new */}
                {hasIncompleteSession() && (() => {
                  const inc = getIncompleteSession();
                  const sPitchCount = pitches.length;
                  const sReadCount = Object.keys(inc.readings).length;
                  const remaining = sPitchCount - sReadCount;
                  return (
                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                      <div className="flex items-start gap-3">
                        <svg className="w-6 h-6 text-amber-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                        <div className="flex-1">
                          <p className="text-sm font-semibold text-amber-800">Incomplete Session — {remaining} meter{remaining !== 1 ? 's' : ''} remaining</p>
                          <p className="text-xs text-amber-600 mt-0.5">{inc.name} — {sReadCount}/{sPitchCount} readings done. All pitches must be read before starting a new session.</p>
                          <button onClick={() => resumeSession(inc)} className="mt-2 px-4 py-2 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-500">
                            Resume Session
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {/* Baseline readings — first-time setup */}
                {!showBaseline ? (
                  <div className="bg-white rounded-xl border p-6 text-center">
                    <div className="w-16 h-16 bg-emerald-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                      <svg className="w-8 h-8 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                      </svg>
                    </div>
                    <h3 className="text-base font-bold text-slate-900 mb-1">Meter Reading Session</h3>
                    <p className="text-sm text-slate-500 mb-4">
                      Walk around the park and record every meter in one session.<br />
                      {pitches.length} meters to read. Saves progress automatically.
                    </p>
                    <div className="flex flex-col items-center gap-2">
                      <button onClick={startNewSession} disabled={hasIncompleteSession()} className="px-6 py-3 bg-emerald-600 text-white rounded-xl text-sm font-semibold hover:bg-emerald-500 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                        Start New Session
                      </button>
                      {/* Only show baseline option if no sessions have ever been completed */}
                      {pitches.length > 0 && !pastSessions.some(s => s.status === 'complete') && pastSessions.length === 0 && (
                        <button onClick={() => setShowBaseline(true)} className="px-4 py-2 text-teal-600 text-xs font-medium hover:text-teal-800">
                          Set baseline meter readings (first time only) &rarr;
                        </button>
                      )}
                    </div>
                  </div>
                ) : (
                  /* Baseline entry form */
                  <div className="bg-white rounded-xl border p-5">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <h3 className="text-sm font-bold text-slate-900">Set Baseline Meter Readings</h3>
                        <p className="text-xs text-slate-400">Enter the current reading on each meter so usage can be calculated from your next session.</p>
                      </div>
                      <button onClick={() => { setShowBaseline(false); setBaselineReadings({}); }} className="text-xs text-slate-400 hover:text-slate-600">Cancel</button>
                    </div>
                    <div className="space-y-2 max-h-[50vh] overflow-y-auto">
                      {pitches.map(p => {
                        const lastReading = readings.find(r => r.pitch_id === p.id || r.pitch?.id === p.id);
                        return (
                        <div key={p.id} className="flex items-center gap-3 py-2 border-b border-slate-100 last:border-0">
                          <div className={`w-10 h-10 ${lastReading ? 'bg-slate-300' : 'bg-teal-600'} rounded-lg flex items-center justify-center text-white font-bold text-xs flex-shrink-0`}>{p.pitch_number}</div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-slate-800 truncate">{p.customer_name || 'Vacant'}</p>
                            <p className="text-xs text-slate-400">Meter: {p.meter_id}</p>
                            {lastReading && <p className="text-xs text-emerald-600">Has reading: {fmtReading(lastReading.reading)}</p>}
                          </div>
                          <input
                            type="number"
                            value={baselineReadings[p.id] || ''}
                            onChange={e => setBaselineReadings(prev => ({ ...prev, [p.id]: e.target.value }))}
                            className="w-28 px-2 py-1.5 border border-slate-200 rounded-lg text-sm font-mono text-right focus:outline-none focus:ring-2 focus:ring-teal-500"
                            placeholder={lastReading ? 'Override' : 'e.g. 15234'}
                          />
                        </div>
                        );
                      })}
                    </div>
                    <div className="flex gap-2 mt-4">
                      <button onClick={() => { setShowBaseline(false); setBaselineReadings({}); }} className="flex-1 py-2 bg-slate-100 text-slate-700 rounded-lg text-sm">Cancel</button>
                      <button
                        onClick={saveBaselineReadings}
                        disabled={savingBaseline || Object.values(baselineReadings).filter(v => v && String(v).trim()).length === 0}
                        className="flex-1 py-2 bg-teal-600 text-white rounded-lg text-sm font-medium disabled:opacity-50 hover:bg-teal-500"
                      >
                        {savingBaseline ? 'Saving...' : `Save ${Object.values(baselineReadings).filter(v => v && String(v).trim()).length} Baselines`}
                      </button>
                    </div>
                  </div>
                )}

                {/* Past sessions */}
                {pastSessions.length > 0 && (
                  <div className="bg-white rounded-xl border overflow-hidden">
                    <div className="px-4 py-3 border-b bg-slate-50">
                      <h3 className="text-sm font-semibold text-slate-700">Past Sessions</h3>
                    </div>
                    <div className="divide-y divide-slate-100">
                      {pastSessions.sort((a, b) => new Date(b.started_at) - new Date(a.started_at)).map(s => {
                        const sPitchCount = pitches.length;
                        const sReadCount = Object.keys(s.readings).length;
                        const sPercent = sPitchCount > 0 ? Math.round((sReadCount / sPitchCount) * 100) : 0;
                        return (
                          <div key={s.id} className="px-4 py-3 flex items-center justify-between">
                            <div>
                              <p className="text-sm font-medium text-slate-800">{s.name}</p>
                              <p className="text-xs text-slate-400">
                                {sReadCount}/{sPitchCount} readings ({sPercent}%) —
                                {s.status === 'complete' ? ' Completed' : (
                                  <span className="text-amber-600 font-medium"> In Progress — {sPitchCount - sReadCount} remaining</span>
                                )}
                              </p>
                            </div>
                            <div className="flex items-center gap-2">
                              {s.status === 'active' && (
                                <button onClick={() => resumeSession(s)} className="px-3 py-1.5 bg-amber-100 text-amber-700 rounded-lg text-xs font-medium hover:bg-amber-200">
                                  Resume
                                </button>
                              )}
                              {s.status === 'complete' && (
                                <button onClick={() => editCompletedSession(s)} className="px-3 py-1.5 bg-amber-100 text-amber-700 rounded-lg text-xs font-medium hover:bg-amber-200 flex items-center gap-1">
                                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                  </svg>
                                  Edit
                                </button>
                              )}
                              <button onClick={() => { setExportSession(s); setShowExportModal(true); }} className="px-3 py-1.5 bg-teal-100 text-teal-700 rounded-lg text-xs font-medium hover:bg-teal-200">
                                Export
                              </button>
                              <button onClick={() => deleteSession(s.id)} className="px-2 py-1.5 text-red-400 hover:text-red-600 text-xs">
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              /* Active session */
              <div className="space-y-4">
                {/* Session progress header */}
                <div className="bg-white rounded-xl border p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <h3 className="text-sm font-bold text-slate-900">{session.name}</h3>
                      <p className="text-xs text-slate-400">
                        {sessionCompleted} of {sessionTotal} meters read
                        {session.started_by && <span className="ml-1 text-teal-500">· Started by {session.started_by}</span>}
                      </p>
                      {sessionCompleted > 0 && (() => {
                        const totalUsage = Object.values(session.readings).reduce((sum, r) => sum + (r.usage_kwh || 0), 0);
                        const totalCost = (totalUsage * unitRate).toFixed(2);
                        return <p className="text-xs font-medium text-blue-600 mt-0.5">{totalUsage.toLocaleString()} kWh &middot; &pound;{totalCost}</p>;
                      })()}
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => { setExportSession(session); setShowExportModal(true); }} className="px-3 py-1.5 bg-teal-100 text-teal-700 rounded-lg text-xs font-medium hover:bg-teal-200">
                        Export
                      </button>
                      <button onClick={() => {
                        const completed = { ...session, status: 'complete', completed_at: session.completed_at || new Date().toISOString(), _editing: false };
                        updateSession(completed);
                        setSession(null);
                        setTab('session');
                        setToast('Session saved');
                        setTimeout(() => setToast(''), 3000);
                      }} className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-medium hover:bg-emerald-500">
                        Save & Close
                      </button>
                      <button onClick={pauseSession} className="px-3 py-1.5 bg-slate-100 text-slate-600 rounded-lg text-xs font-medium hover:bg-slate-200">
                        Pause
                      </button>
                      <button onClick={() => cancelSession(session.id)} className="px-3 py-1.5 bg-red-100 text-red-600 rounded-lg text-xs font-medium hover:bg-red-200">
                        Cancel
                      </button>
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div className="relative h-3 bg-slate-100 rounded-full overflow-hidden mb-1">
                    <div className="absolute inset-y-0 left-0 bg-emerald-500 rounded-full transition-all" style={{ width: `${sessionPercent}%` }} />
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-emerald-600 font-bold">{sessionPercent}% complete</span>
                    <span className="text-slate-400">{sessionTotal - sessionCompleted} remaining</span>
                  </div>
                </div>

                {/* Full pitch list — green/red live status */}
                <div className="bg-white rounded-xl border overflow-hidden">
                  <div className="px-4 py-2.5 bg-slate-50 border-b flex items-center justify-between">
                    <h4 className="text-xs font-semibold text-slate-600">All Pitches</h4>
                    <div className="flex items-center gap-3">
                      <span className="flex items-center gap-1 text-xs text-emerald-600 font-medium">
                        <span className="w-2 h-2 bg-emerald-500 rounded-full inline-block" />
                        {sessionCompleted} done
                      </span>
                      <span className="flex items-center gap-1 text-xs text-red-500 font-medium">
                        <span className="w-2 h-2 bg-red-400 rounded-full inline-block" />
                        {sessionTotal - sessionCompleted} remaining
                      </span>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-px bg-slate-100 max-h-[40vh] overflow-y-auto">
                    {sessionPitches.map((p, idx) => {
                      const done = !!session.readings[p.id];
                      const active = idx === sessionPitchIndex;
                      const r = session.readings[p.id];
                      const isDormant = r?.dormant;
                      return (
                        <button
                          key={p.id}
                          onClick={() => sessionGoToPitch(idx)}
                          className={`p-3 text-left transition-colors ${
                            active ? 'bg-emerald-50 ring-2 ring-inset ring-emerald-500' :
                            isDormant ? 'bg-slate-50' :
                            done ? 'bg-emerald-50/50' : 'bg-white hover:bg-slate-50'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                              isDormant ? 'bg-slate-400 text-white' :
                              done ? 'bg-emerald-500 text-white' : 'bg-red-100 text-red-500 border border-red-200'
                            }`}>
                              {isDormant ? '\u2014' : done ? '\u2713' : '\u2717'}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-bold text-slate-800 truncate">{p.pitch_number}</p>
                              <p className="text-xs text-slate-400 truncate">{p.customer_name || 'Vacant'}</p>
                            </div>
                          </div>
                          {isDormant ? (
                            <p className="text-xs text-slate-400 italic mt-1">Dormant</p>
                          ) : done && r ? (
                            <p className="text-xs text-emerald-600 font-mono mt-1 truncate">
                              {fmtReading(r.reading)} &mdash; {r.usage_kwh} kWh
                            </p>
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Current pitch card + reading form */}
                {currentSessionPitch && (
                  <div className="bg-white rounded-xl border p-5">
                    {/* Pitch info */}
                    <div className="flex items-center gap-3 mb-4">
                      <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-white font-bold text-sm flex-shrink-0 ${currentPitchDone ? 'bg-emerald-500' : 'bg-teal-600'}`}>
                        {currentSessionPitch.pitch_number}
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-semibold text-slate-900">
                          {currentSessionPitch.customer_name || 'Vacant'}
                          {currentPitchDone && <span className="ml-2 text-xs text-emerald-600 font-medium">&#10003; Done</span>}
                        </p>
                        <p className="text-xs text-slate-500">Meter: {currentSessionPitch.meter_id || 'N/A'}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-slate-400">Pitch {sessionPitchIndex + 1} of {sessionTotal}</p>
                      </div>
                    </div>

                    {/* Already recorded info */}
                    {currentPitchDone && (() => {
                      const cr = session.readings[currentSessionPitch.id];
                      const isDormant = cr?.dormant;
                      return isDormant ? (
                        <div className="bg-slate-100 border border-slate-300 rounded-lg p-3 mb-4">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-sm text-slate-600 font-medium italic">Marked as Dormant — no reading taken</p>
                              <p className="text-xs text-slate-400">
                                Marked at {new Date(cr.read_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                              </p>
                            </div>
                            <button onClick={() => unmarkDormant(currentSessionPitch)}
                              className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-medium hover:bg-emerald-500">
                              Mark Live
                            </button>
                          </div>
                        </div>
                      ) : editingSessionPitchId === currentSessionPitch.id ? (
                        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4">
                          <p className="text-xs text-amber-700 font-medium mb-2">Edit Reading for {currentSessionPitch.pitch_number}</p>
                          <div className="flex items-end gap-2">
                            <div className="flex-1">
                              <label className="block text-xs text-slate-500 mb-1">New Reading (kWh)</label>
                              <input type="number" value={editSessionValue} onChange={e => setEditSessionValue(e.target.value)}
                                className="w-full px-3 py-2 border border-amber-200 rounded-lg text-sm font-mono text-lg focus:outline-none focus:ring-2 focus:ring-amber-500" autoFocus />
                            </div>
                            <button onClick={updateSessionReading} disabled={!editSessionValue || saving}
                              className="px-4 py-2 bg-amber-600 text-white rounded-lg text-sm font-medium disabled:opacity-50 hover:bg-amber-500">
                              {saving ? 'Saving...' : 'Update'}
                            </button>
                            <button onClick={() => { setEditingSessionPitchId(null); setEditSessionValue(''); }}
                              className="px-3 py-2 text-sm text-slate-500 hover:text-slate-700">Cancel</button>
                          </div>
                          <p className="text-xs text-slate-400 mt-1">Previous reading: {fmtReading(cr.previous_reading || 0)}</p>
                        </div>
                      ) : (
                        <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 mb-4">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-sm text-emerald-800 font-medium">
                                Reading: <span className="font-mono">{fmtReading(cr.reading)}</span>
                                <span className="text-emerald-600 ml-2">({cr.usage_kwh} kWh)</span>
                                <span className="text-blue-600 ml-2 font-bold">&pound;{((cr.usage_kwh || 0) * unitRate).toFixed(2)}</span>
                              </p>
                              <p className="text-xs text-emerald-600">
                                Recorded at {new Date(cr.read_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                                <span className="text-slate-400 ml-2">@ &pound;{unitRate.toFixed(2)}/kWh</span>
                              </p>
                            </div>
                            <button onClick={() => { setEditingSessionPitchId(currentSessionPitch.id); setEditSessionValue(String(cr.reading)); }}
                              className="px-3 py-1.5 bg-amber-100 text-amber-700 rounded-lg text-xs font-medium hover:bg-amber-200 transition-colors flex items-center gap-1">
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                              </svg>
                              Edit
                            </button>
                          </div>
                        </div>
                      );
                    })()}

                    {/* Last reading info (for pitches not yet done) */}
                    {!currentPitchDone && (() => {
                      const prevR = readings.find(r => r.pitch_id === currentSessionPitch.id);
                      return prevR ? (
                        <div className="bg-slate-50 border border-slate-200 rounded-lg p-2.5 mb-3 flex items-center justify-between">
                          <span className="text-xs text-slate-500">Last reading:</span>
                          <span className="text-sm font-mono font-medium text-slate-700">{fmtReading(prevR.reading)}</span>
                          <span className="text-xs text-slate-400">{prevR.read_at ? new Date(prevR.read_at).toLocaleDateString('en-GB') : ''}</span>
                        </div>
                      ) : (
                        <div className="bg-amber-50 border border-amber-200 rounded-lg p-2.5 mb-3 text-center">
                          <p className="text-xs text-amber-700">No previous reading — this will be the baseline (first reading) for this pitch</p>
                        </div>
                      );
                    })()}

                    {/* Reading input — manual entry is the primary method */}
                    {!currentPitchDone && (
                      <div className="space-y-3">
                        <div className="flex items-end gap-2">
                          <div className="flex-1">
                            <label className="block text-xs font-medium text-slate-500 mb-1">Reading (kWh)</label>
                            <input type="number" value={newReading} onChange={e => setNewReading(e.target.value)}
                              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono text-lg" placeholder="e.g. 07686.00" autoFocus />
                          </div>
                          <button onClick={saveSessionReading} disabled={!newReading || saving}
                            className="px-5 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium disabled:opacity-50 hover:bg-emerald-500 transition-colors">
                            {saving ? 'Saving...' : 'Save'}
                          </button>
                        </div>
                        {/* Formatted reading preview */}
                        {newReading && (
                          <div className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 flex items-center justify-between">
                            <span className="text-xs text-slate-500">Will save as:</span>
                            <span className="text-lg font-mono font-bold text-slate-800 tracking-wider">{fmtReading(newReading)}</span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Dormant button */}
                    {!currentPitchDone && (
                      <button onClick={() => markDormant(currentSessionPitch)}
                        className="w-full mt-3 py-2 bg-slate-100 text-slate-500 rounded-lg text-xs font-medium hover:bg-slate-200 transition-colors flex items-center justify-center gap-1.5">
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                        </svg>
                        Mark as Dormant — no reading needed
                      </button>
                    )}

                    {/* Gas Cylinder Entry */}
                    <div className="mt-3 border-t border-slate-100 pt-3">
                      <button onClick={() => setShowGasEntry(prev => prev === currentSessionPitch.id ? null : currentSessionPitch.id)}
                        className="text-xs text-orange-600 hover:text-orange-800 font-medium flex items-center gap-1">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                        </svg>
                        {showGasEntry === currentSessionPitch.id ? 'Hide' : 'Manage'} Gas Cylinders for this Pitch
                      </button>
                      {showGasEntry === currentSessionPitch.id && (
                        <div className="mt-2 bg-orange-50 border border-orange-200 rounded-lg p-3">
                          <p className="text-xs text-orange-700 mb-2">Enter collar numbers for cylinders at this pitch (max 2)</p>
                          {/* Show existing cylinders for this pitch */}
                          {(() => {
                            const pitchCyls = (sessionGasCylinders[currentSessionPitch.id] || []);
                            return pitchCyls.length > 0 && (
                              <div className="mb-2 space-y-1">
                                {pitchCyls.map((gc, i) => (
                                  editingGasCylIndex?.pitchId === currentSessionPitch.id && editingGasCylIndex?.index === i ? (
                                    <div key={i} className="bg-white rounded px-2 py-2 border border-amber-300 space-y-1">
                                      <div className="flex items-end gap-1">
                                        <input type="text" value={editGasCollar} onChange={e => setEditGasCollar(e.target.value)}
                                          className="flex-1 px-2 py-1 border border-amber-200 rounded text-sm font-mono focus:outline-none focus:ring-1 focus:ring-amber-500" placeholder="Collar no." autoFocus />
                                        <select value={editGasSize} onChange={e => setEditGasSize(e.target.value)} className="px-1 py-1 border border-amber-200 rounded text-xs">
                                          <option>13kg</option><option>6kg</option><option>19kg</option><option>47kg</option>
                                        </select>
                                        <select value={editGasType} onChange={e => setEditGasType(e.target.value)} className="px-1 py-1 border border-amber-200 rounded text-xs">
                                          <option>Propane</option><option>Butane</option><option>Patio Gas</option>
                                        </select>
                                      </div>
                                      <div className="flex gap-1">
                                        <button onClick={() => updateSessionGasCylinder(currentSessionPitch.id, i)}
                                          className="px-2 py-1 bg-amber-600 text-white rounded text-xs font-medium hover:bg-amber-500">Save</button>
                                        <button onClick={() => setEditingGasCylIndex(null)}
                                          className="px-2 py-1 text-xs text-slate-500 hover:text-slate-700">Cancel</button>
                                      </div>
                                    </div>
                                  ) : (
                                    <div key={i} className="flex items-center justify-between bg-white rounded px-2 py-1 border border-orange-100">
                                      <span className="text-sm font-mono font-medium text-slate-800">{gc.collar_number}</span>
                                      <span className="text-xs text-slate-400">{gc.size} {gc.type}</span>
                                      <div className="flex items-center gap-2">
                                        <button onClick={() => { setEditingGasCylIndex({ pitchId: currentSessionPitch.id, index: i }); setEditGasCollar(gc.collar_number); setEditGasSize(gc.size); setEditGasType(gc.type); }}
                                          className="text-xs text-amber-500 hover:text-amber-700">Edit</button>
                                        <button onClick={() => removeSessionGasCylinder(currentSessionPitch.id, i)} className="text-xs text-red-400 hover:text-red-600">Remove</button>
                                      </div>
                                    </div>
                                  )
                                ))}
                              </div>
                            );
                          })()}
                          {(sessionGasCylinders[currentSessionPitch.id] || []).length < 2 && (
                            <div className="flex items-end gap-2">
                              <div className="flex-1">
                                <input type="text" value={gasCollarInput}
                                  onChange={e => setGasCollarInput(e.target.value)}
                                  className="w-full px-2 py-1.5 border border-orange-200 rounded-lg text-sm font-mono text-center tracking-widest focus:outline-none focus:ring-2 focus:ring-orange-500"
                                  placeholder="Collar no." />
                              </div>
                              <select value={gasSize} onChange={e => setGasSize(e.target.value)} className="px-2 py-1.5 border border-orange-200 rounded-lg text-xs">
                                <option>13kg</option><option>6kg</option><option>19kg</option><option>47kg</option>
                              </select>
                              <select value={gasType} onChange={e => setGasType(e.target.value)} className="px-2 py-1.5 border border-orange-200 rounded-lg text-xs">
                                <option>Propane</option><option>Butane</option><option>Patio Gas</option>
                              </select>
                              <button onClick={() => addSessionGasCylinder(currentSessionPitch.id)}
                                disabled={!gasCollarInput || !gasCollarInput.trim()}
                                className="px-3 py-1.5 bg-orange-600 text-white rounded-lg text-xs font-medium disabled:opacity-50 hover:bg-orange-500">
                                Add
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Navigation */}
                    <div className="flex items-center justify-between mt-4 pt-3 border-t border-slate-100">
                      <button
                        onClick={() => sessionGoToPitch(Math.max(0, sessionPitchIndex - 1))}
                        disabled={sessionPitchIndex === 0}
                        className="px-3 py-1.5 text-sm text-slate-500 hover:text-slate-700 disabled:opacity-30"
                      >
                        &larr; Previous
                      </button>

                      {!currentPitchDone && (
                        <button onClick={sessionSkipPitch} className="px-3 py-1.5 text-xs text-slate-400 hover:text-slate-600">
                          Skip for now
                        </button>
                      )}

                      <button
                        onClick={() => {
                          // Go to next unread, or just next
                          const nextUnread = sessionPitches.findIndex((p, i) => i > sessionPitchIndex && !session.readings[p.id]);
                          if (nextUnread >= 0) sessionGoToPitch(nextUnread);
                          else if (sessionPitchIndex < sessionTotal - 1) sessionGoToPitch(sessionPitchIndex + 1);
                        }}
                        disabled={sessionPitchIndex >= sessionTotal - 1 && !sessionPitches.some((p, i) => i > sessionPitchIndex && !session.readings[p.id])}
                        className="px-4 py-1.5 bg-teal-600 text-white rounded-lg text-sm font-medium hover:bg-teal-500 disabled:opacity-30 transition-colors"
                      >
                        Next Meter &rarr;
                      </button>
                    </div>
                  </div>
                )}

                {/* Session readings summary */}
                {sessionCompleted > 0 && (
                  <div className="bg-white rounded-xl border overflow-hidden">
                    <div className="px-4 py-3 bg-slate-50 border-b flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-slate-700">Session Readings</h3>
                      <span className="text-xs text-slate-400">{sessionCompleted} recorded</span>
                    </div>
                    <div className="divide-y divide-slate-100">
                      {sessionPitches.filter(p => session.readings[p.id]).map(p => {
                        const r = session.readings[p.id];
                        const isDormant = r?.dormant;
                        return (
                          <div key={p.id} className={`px-4 py-2.5 flex items-center justify-between ${isDormant ? 'bg-slate-50' : ''}`}>
                            <div className="flex items-center gap-2">
                              <span className={`text-xs font-bold ${isDormant ? 'text-slate-400' : 'text-emerald-600'}`}>
                                {isDormant ? '\u2014' : '\u2713'}
                              </span>
                              <span className="text-sm font-medium text-slate-800">{p.pitch_number}</span>
                              <span className="text-xs text-slate-400">{r.customer_name || p.customer_name || 'Vacant'}</span>
                            </div>
                            <div className="text-right">
                              {isDormant ? (
                                <span className="text-xs text-slate-400 italic">Dormant</span>
                              ) : (
                                <>
                                  <span className="text-sm font-mono text-slate-700">{fmtReading(r.reading)}</span>
                                  <span className="text-xs text-emerald-600 ml-2">{r.usage_kwh} kWh</span>
                                  <span className="text-xs text-blue-600 font-bold ml-1">&pound;{((r.usage_kwh || 0) * unitRate).toFixed(2)}</span>
                                </>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
