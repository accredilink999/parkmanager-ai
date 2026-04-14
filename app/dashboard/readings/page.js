'use client';
import { useState, useEffect, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

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

  // QR Scanner
  const [showScanner, setShowScanner] = useState(false);
  const [scanError, setScanError] = useState('');
  const scannerRef = useRef(null);
  const html5QrCodeRef = useRef(null);

  // Camera / Live OCR
  const [showCamera, setShowCamera] = useState(false);
  const [capturedImage, setCapturedImage] = useState(null);
  const [ocrConfidence, setOcrConfidence] = useState(null);
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const workerRef = useRef(null);
  const scanIntervalRef = useRef(null);
  const [liveDigits, setLiveDigits] = useState('');
  const [liveConfidence, setLiveConfidence] = useState(0);
  const [matchCount, setMatchCount] = useState(0);
  const [readingLocked, setReadingLocked] = useState(false);
  const lastDetectedRef = useRef('');
  const matchCountRef = useRef(0);
  const LOCK_THRESHOLD = 3;

  // ---- Reading Session ----
  const [session, setSession] = useState(null); // { id, started_at, readings: { [pitchId]: { reading, usage_kwh, previous_reading, read_at } }, status: 'active'|'complete' }
  const [sessionPitchIndex, setSessionPitchIndex] = useState(0);
  const [pastSessions, setPastSessions] = useState([]);
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportSession, setExportSession] = useState(null);

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

  // ---- Load data ----
  async function loadData() {
    setLoading(true);
    if (!supabase) {
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
    const [pitchRes, readingRes] = await Promise.all([
      supabase.from('pitches').select('*').order('pitch_number'),
      supabase.from('meter_readings').select('*, pitches(pitch_number, customer_name)').order('read_at', { ascending: false }).limit(50),
    ]);
    setPitches(pitchRes.data || []);
    setReadings((readingRes.data || []).map(r => ({ ...r, pitch: r.pitches })));
    setLoading(false);
  }

  // ---- Sessions persistence ----
  function loadSessions() {
    try {
      const saved = localStorage.getItem('pm_reading_sessions');
      if (saved) {
        const all = JSON.parse(saved);
        setPastSessions(all);
        // Resume active session if exists
        const active = all.find(s => s.status === 'active');
        if (active) {
          setSession(active);
          // Find next incomplete pitch
          const idx = pitchesForSession().findIndex(p => !active.readings[p.id]);
          setSessionPitchIndex(idx >= 0 ? idx : 0);
          setTab('session');
        }
      }
    } catch {}
  }

  function saveSessions(allSessions) {
    try { localStorage.setItem('pm_reading_sessions', JSON.stringify(allSessions)); } catch {}
    setPastSessions(allSessions);
  }

  function pitchesForSession() {
    // Session covers all pitches with meters
    return pitches.filter(p => p.meter_id);
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
          await supabase.from('meter_readings').insert(payload);
          loadData();
        } catch (err) {
          setToast('Error: ' + err.message);
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

  // ---- QR Scanner ----
  async function startScanner() {
    setShowScanner(true);
    setScanError('');
    try {
      const { Html5Qrcode } = await import('html5-qrcode');
      await new Promise(r => setTimeout(r, 200));
      const scanner = new Html5Qrcode('qr-reader');
      html5QrCodeRef.current = scanner;

      await scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (decodedText) => {
          try {
            const url = new URL(decodedText);
            const pitchId = url.searchParams.get('pitch');
            if (pitchId) {
              const found = pitches.find(p => p.id === pitchId);
              if (found) {
                handleQrPitchFound(found);
              } else {
                setToast('Pitch not found for this QR code');
                setTimeout(() => setToast(''), 3000);
              }
            }
          } catch {
            const found = pitches.find(p => decodedText.includes(p.id) || decodedText.includes(p.pitch_number));
            if (found) handleQrPitchFound(found);
          }
          stopScanner();
        },
        () => {}
      );
    } catch (err) {
      setScanError(err.message || 'Camera access denied. Please allow camera permissions.');
    }
  }

  function handleQrPitchFound(found) {
    if (session && session.status === 'active') {
      // In session mode: jump to this pitch and switch to session tab
      setTab('session');
      const sPitches = pitchesForSession();
      const idx = sPitches.findIndex(p => p.id === found.id);
      const alreadyDone = !!session.readings[found.id];
      if (idx >= 0) {
        setSessionPitchIndex(idx);
        setNewReading('');
        setCapturedImage(null);
        setOcrConfidence(null);
      }
      setToast(`Pitch ${found.pitch_number} — ${found.customer_name || 'Vacant'} — Meter: ${found.meter_id || 'N/A'}${alreadyDone ? ' (already read)' : ''}`);
      // Auto-open camera if not already read
      if (!alreadyDone && idx >= 0) {
        setTimeout(() => openCamera(), 600);
      }
    } else {
      // Individual mode: select pitch, show form, auto-open camera
      setTab('readings');
      setSelectedPitch(found.id);
      setShowForm(true);
      setToast(`Pitch ${found.pitch_number} — ${found.customer_name || 'Vacant'} — Meter: ${found.meter_id || 'N/A'}`);
      setTimeout(() => openCamera(), 600);
    }
    setTimeout(() => setToast(''), 4000);
  }

  async function stopScanner() {
    setShowScanner(false);
    if (html5QrCodeRef.current) {
      try { await html5QrCodeRef.current.stop(); html5QrCodeRef.current.clear(); } catch {}
      html5QrCodeRef.current = null;
    }
  }

  // ---- Camera & Live OCR Scanning ----
  async function initOcrWorker() {
    if (workerRef.current) return;
    try {
      const { createWorker } = await import('tesseract.js');
      const worker = await createWorker('eng');
      await worker.setParameters({ tessedit_char_whitelist: '0123456789.', tessedit_pageseg_mode: '7' });
      workerRef.current = worker;
    } catch (err) { console.error('Failed to init OCR worker:', err); }
  }

  async function openCamera() {
    setShowCamera(true);
    setCapturedImage(null);
    setOcrConfidence(null);
    setLiveDigits('');
    setLiveConfidence(0);
    setMatchCount(0);
    setReadingLocked(false);
    lastDetectedRef.current = '';
    matchCountRef.current = 0;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } },
      });
      streamRef.current = stream;
      await new Promise(r => setTimeout(r, 300));
      if (videoRef.current) videoRef.current.srcObject = stream;
      await initOcrWorker();
      startLiveScan();
    } catch {
      setToast('Camera access denied. Please allow camera permissions.');
      setTimeout(() => setToast(''), 3000);
      setShowCamera(false);
    }
  }

  function preprocessImage(canvas) {
    const ctx = canvas.getContext('2d');
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const d = imgData.data;
    for (let i = 0; i < d.length; i += 4) {
      const gray = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      const c = gray < 128 ? Math.max(0, gray * 0.5) : Math.min(255, gray * 1.5 + 30);
      const bw = c > 140 ? 255 : 0;
      d[i] = bw; d[i + 1] = bw; d[i + 2] = bw;
    }
    ctx.putImageData(imgData, 0, 0);
    return canvas;
  }

  function cropGuideArea() {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return null;
    const vw = video.videoWidth, vh = video.videoHeight;
    const boxW = Math.round(vw * 0.7), boxH = Math.round(vh * 0.15);
    const boxX = Math.round((vw - boxW) / 2), boxY = Math.round((vh - boxH) / 2);
    const canvas = document.createElement('canvas');
    canvas.width = boxW; canvas.height = boxH;
    canvas.getContext('2d').drawImage(video, boxX, boxY, boxW, boxH, 0, 0, boxW, boxH);
    const scaled = document.createElement('canvas');
    scaled.width = boxW * 2; scaled.height = boxH * 2;
    const sCtx = scaled.getContext('2d');
    sCtx.imageSmoothingEnabled = false;
    sCtx.drawImage(canvas, 0, 0, boxW * 2, boxH * 2);
    return preprocessImage(scaled);
  }

  function startLiveScan() {
    if (scanIntervalRef.current) clearInterval(scanIntervalRef.current);
    let scanning = false;
    scanIntervalRef.current = setInterval(async () => {
      if (scanning || !workerRef.current || !videoRef.current) return;
      scanning = true;
      try {
        const cropped = cropGuideArea();
        if (!cropped) { scanning = false; return; }
        const dataUrl = cropped.toDataURL('image/png');
        const { data } = await workerRef.current.recognize(dataUrl);
        let digits = data.text.replace(/[^0-9.]/g, '').replace(/^\.+|\.+$/g, '').trim();
        digits = digits.replace(/\.{2,}/g, '.');

        if (digits && digits.length >= 3) {
          setLiveDigits(digits);
          setLiveConfidence(Math.round(data.confidence));
          if (digits === lastDetectedRef.current) { matchCountRef.current += 1; }
          else { matchCountRef.current = 1; lastDetectedRef.current = digits; }
          setMatchCount(matchCountRef.current);
          if (matchCountRef.current >= LOCK_THRESHOLD && !readingLocked) {
            setReadingLocked(true);
            setNewReading(digits);
            setOcrConfidence(Math.round(data.confidence));
            if (scanIntervalRef.current) clearInterval(scanIntervalRef.current);
          }
        } else {
          setLiveDigits(''); setLiveConfidence(0);
          matchCountRef.current = 0; lastDetectedRef.current = ''; setMatchCount(0);
        }
      } catch (err) { console.error('Live scan error:', err); }
      scanning = false;
    }, 1500);
  }

  function stopCameraStream() {
    if (scanIntervalRef.current) { clearInterval(scanIntervalRef.current); scanIntervalRef.current = null; }
    if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null; }
  }

  async function terminateWorker() {
    if (workerRef.current) { try { await workerRef.current.terminate(); } catch {} workerRef.current = null; }
  }

  function acceptReading() {
    if (videoRef.current && videoRef.current.videoWidth) {
      const canvas = document.createElement('canvas');
      canvas.width = videoRef.current.videoWidth; canvas.height = videoRef.current.videoHeight;
      canvas.getContext('2d').drawImage(videoRef.current, 0, 0);
      setCapturedImage(canvas.toDataURL('image/jpeg', 0.85));
    }
    stopCameraStream();
    terminateWorker();
    setShowCamera(false);
    setToast(`Reading confirmed: ${newReading}`);
    setTimeout(() => setToast(''), 3000);
  }

  function closeCamera() {
    stopCameraStream(); terminateWorker(); setShowCamera(false);
    setLiveDigits(''); setReadingLocked(false);
  }

  function retryLiveScan() {
    setReadingLocked(false); setLiveDigits(''); setLiveConfidence(0);
    setMatchCount(0); matchCountRef.current = 0; lastDetectedRef.current = '';
    setNewReading(''); setOcrConfidence(null);
    startLiveScan();
  }

  // ---- Session functions ----
  function startNewSession() {
    const newSession = {
      id: 'ses_' + Date.now(),
      started_at: new Date().toISOString(),
      readings: {},
      status: 'active',
      name: `Reading Session — ${new Date().toLocaleDateString('en-GB')}`,
    };
    setSession(newSession);
    setSessionPitchIndex(0);
    setNewReading('');
    setCapturedImage(null);
    setOcrConfidence(null);
    setTab('session');

    // Save to localStorage
    const all = [...pastSessions.filter(s => s.id !== newSession.id), newSession];
    saveSessions(all);
    setToast('Reading session started');
    setTimeout(() => setToast(''), 3000);
  }

  function resumeSession(sess) {
    setSession(sess);
    const sPitches = pitchesForSession(sess);
    const idx = sPitches.findIndex(p => !sess.readings[p.id]);
    setSessionPitchIndex(idx >= 0 ? idx : 0);
    setNewReading('');
    setCapturedImage(null);
    setOcrConfidence(null);
    setTab('session');
    setToast('Session resumed');
    setTimeout(() => setToast(''), 3000);
  }

  function updateSession(updatedSession) {
    setSession(updatedSession);
    const all = pastSessions.map(s => s.id === updatedSession.id ? updatedSession : s);
    if (!all.find(s => s.id === updatedSession.id)) all.push(updatedSession);
    saveSessions(all);
  }

  async function saveSessionReading() {
    if (!session || !newReading) return;
    setSaving(true);

    const sPitches = pitchesForSession();
    const pitch = sPitches[sessionPitchIndex];
    if (!pitch) { setSaving(false); return; }

    const readingVal = parseFloat(newReading);
    let prevReading = 0;

    if (supabase) {
      const { data: prev } = await supabase
        .from('meter_readings').select('reading').eq('pitch_id', pitch.id)
        .order('read_at', { ascending: false }).limit(1);
      if (prev && prev.length > 0) prevReading = Number(prev[0].reading);
    } else {
      const prev = readings.filter(r => r.pitch_id === pitch.id);
      if (prev.length > 0) prevReading = prev[0].reading;
    }

    const usage = Math.max(0, readingVal - prevReading);
    const payload = { pitch_id: pitch.id, reading: readingVal, previous_reading: prevReading, usage_kwh: usage };

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
        await supabase.from('meter_readings').insert(payload);
      } catch (err) {
        setToast('Error: ' + err.message);
        setSaving(false);
        return;
      }
    }

    // Update session
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

    setToast(`${pitch.pitch_number}: ${readingVal} saved (${usage} kWh)`);
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
        // Wrap around to find any skipped
        nextIdx = sPitches.findIndex(p => !updatedSession.readings[p.id]);
      }
      if (nextIdx >= 0) setSessionPitchIndex(nextIdx);
    }

    setSaving(false);
    if (!supabase) loadData();
  }

  function sessionSkipPitch() {
    if (!session) return;
    const sPitches = pitchesForSession();
    let nextIdx = sessionPitchIndex + 1;
    if (nextIdx >= sPitches.length) nextIdx = 0;
    setSessionPitchIndex(nextIdx);
    setNewReading('');
    setCapturedImage(null);
    setOcrConfidence(null);
  }

  function sessionGoToPitch(idx) {
    setSessionPitchIndex(idx);
    setNewReading('');
    setCapturedImage(null);
    setOcrConfidence(null);
  }

  function pauseSession() {
    setTab('readings');
    setToast('Session paused — you can resume anytime');
    setTimeout(() => setToast(''), 3000);
  }

  function deleteSession(sessId) {
    const all = pastSessions.filter(s => s.id !== sessId);
    saveSessions(all);
    if (session?.id === sessId) { setSession(null); setTab('readings'); }
  }

  // ---- Session Export ----
  async function exportSessionPdf(sess, recipient) {
    const { default: jsPDF } = await import('jspdf');
    const doc = new jsPDF();

    // Load settings
    let siteName = 'Park Manager AI', hoName = '', managerEmail = '', unitRate = '0.34';
    try {
      const saved = localStorage.getItem('pm_settings');
      if (saved) {
        JSON.parse(saved).forEach(s => {
          if (s.key === 'site_name') siteName = s.value;
          if (s.key === 'ho_name') hoName = s.value;
          if (s.key === 'manager_email') managerEmail = s.value;
          if (s.key === 'electricity_unit_rate') unitRate = s.value;
        });
      }
    } catch {}

    const rate = parseFloat(unitRate) || 0.34;
    const sPitches = pitches.filter(p => p.meter_id);

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

    // Summary
    let y = 55;
    doc.setFontSize(10);
    doc.setTextColor(0);
    doc.text(`Pitches Read: ${completedReadings.length} / ${sPitches.length}`, 14, y);
    doc.text(`Total Usage: ${totalUsage.toLocaleString()} kWh`, 100, y);
    doc.text(`Total Cost: £${totalCost.toFixed(2)} @ £${rate}/kWh`, 14, y + 6);

    // Table header
    y += 16;
    doc.setFillColor(241, 245, 249);
    doc.rect(14, y - 4, 182, 8, 'F');
    doc.setFontSize(8);
    doc.setTextColor(100);
    doc.text('Pitch', 16, y);
    doc.text('Customer', 36, y);
    doc.text('Meter ID', 86, y);
    doc.text('Previous', 112, y);
    doc.text('Reading', 134, y);
    doc.text('Usage (kWh)', 156, y);
    doc.text('Cost', 182, y);

    // Table rows
    y += 6;
    doc.setTextColor(0);

    for (const p of sPitches) {
      if (y > 275) { doc.addPage(); y = 20; }
      const r = sess.readings[p.id];
      doc.setFontSize(8);

      if (r) {
        doc.text(p.pitch_number, 16, y);
        doc.text((r.customer_name || p.customer_name || 'Vacant').substring(0, 25), 36, y);
        doc.text(r.meter_id || p.meter_id || '', 86, y);
        doc.text(String(r.previous_reading || 0), 112, y);
        doc.text(String(r.reading), 134, y);
        doc.setTextColor(16, 185, 129);
        doc.text(String(r.usage_kwh || 0), 160, y);
        doc.text(`£${((r.usage_kwh || 0) * rate).toFixed(2)}`, 182, y);
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

    // Footer
    y += 8;
    if (y > 270) { doc.addPage(); y = 20; }
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
    let recipientEmail = '';
    try {
      const saved = localStorage.getItem('pm_settings');
      if (saved) {
        JSON.parse(saved).forEach(s => {
          if (recipientType === 'manager' && s.key === 'manager_email') recipientEmail = s.value;
          if (recipientType === 'head_office' && s.key === 'ho_email') recipientEmail = s.value;
        });
      }
    } catch {}

    if (!recipientEmail) {
      setToast(`No ${recipientType === 'manager' ? 'manager' : 'head office'} email configured. Set it in Settings.`);
      setTimeout(() => setToast(''), 4000);
      return;
    }

    // Build readings HTML
    const sPitches = pitches.filter(p => p.meter_id);
    const completedReadings = Object.entries(sess.readings);
    let unitRate = 0.34;
    try {
      const saved = localStorage.getItem('pm_settings');
      if (saved) JSON.parse(saved).forEach(s => { if (s.key === 'electricity_unit_rate') unitRate = parseFloat(s.value); });
    } catch {}

    const totalUsage = completedReadings.reduce((sum, [, r]) => sum + (r.usage_kwh || 0), 0);
    let rows = '';
    for (const p of sPitches) {
      const r = sess.readings[p.id];
      if (r) {
        rows += `<tr><td style="padding:6px;border-bottom:1px solid #e2e8f0">${p.pitch_number}</td><td style="padding:6px;border-bottom:1px solid #e2e8f0">${r.customer_name || p.customer_name || 'Vacant'}</td><td style="padding:6px;border-bottom:1px solid #e2e8f0;text-align:right">${r.previous_reading}</td><td style="padding:6px;border-bottom:1px solid #e2e8f0;text-align:right">${r.reading}</td><td style="padding:6px;border-bottom:1px solid #e2e8f0;text-align:right;font-weight:bold;color:#10b981">${r.usage_kwh} kWh</td><td style="padding:6px;border-bottom:1px solid #e2e8f0;text-align:right">£${(r.usage_kwh * unitRate).toFixed(2)}</td></tr>`;
      }
    }

    const html = `<div style="font-family:sans-serif;max-width:700px"><h2 style="color:#10b981">Meter Reading Report</h2><p><strong>Session:</strong> ${sess.name}</p><p><strong>Date:</strong> ${new Date(sess.started_at).toLocaleDateString('en-GB')}</p><p><strong>Readings:</strong> ${completedReadings.length}/${sPitches.length} | <strong>Total Usage:</strong> ${totalUsage.toLocaleString()} kWh | <strong>Total Cost:</strong> £${(totalUsage * unitRate).toFixed(2)}</p><table style="width:100%;border-collapse:collapse;font-size:13px"><thead><tr style="background:#f1f5f9"><th style="padding:6px;text-align:left">Pitch</th><th style="padding:6px;text-align:left">Customer</th><th style="padding:6px;text-align:right">Previous</th><th style="padding:6px;text-align:right">Reading</th><th style="padding:6px;text-align:right">Usage</th><th style="padding:6px;text-align:right">Cost</th></tr></thead><tbody>${rows}</tbody></table><p style="color:#94a3b8;font-size:11px;margin-top:20px">Generated by Park Manager AI</p></div>`;

    try {
      const res = await fetch('/api/send-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: recipientEmail,
          subject: `Meter Reading Report — ${new Date(sess.started_at).toLocaleDateString('en-GB')}`,
          html,
        }),
      });
      if (res.ok) {
        setToast(`Report emailed to ${recipientEmail}`);
      } else {
        setToast('Failed to send email. Check server config.');
      }
    } catch {
      setToast('Email sending not available in demo mode. Use PDF export.');
    }
    setTimeout(() => setToast(''), 4000);
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
            <button
              onClick={startScanner}
              className="px-3 py-2 bg-teal-600 text-white rounded-lg text-sm font-medium hover:bg-teal-500 transition-colors flex items-center gap-1.5"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
              </svg>
              Scan QR
            </button>
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
        <div className="fixed top-4 right-4 z-50 bg-emerald-600 text-white px-4 py-2 rounded-lg shadow-lg text-sm max-w-sm">{toast}</div>
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

      {/* QR Scanner Modal */}
      {showScanner && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-5">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">Scan Meter QR Code</h3>
                {session && session.status === 'active' && (
                  <p className="text-xs text-teal-600 font-medium">Session active — {sessionCompleted}/{sessionTotal} read</p>
                )}
              </div>
              <button onClick={stopScanner} className="text-slate-400 hover:text-slate-600">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div id="qr-reader" ref={scannerRef} className="rounded-xl overflow-hidden" />
            {scanError && <div className="mt-3 bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">{scanError}</div>}
            <p className="text-xs text-slate-400 text-center mt-3">
              {session && session.status === 'active'
                ? 'Scan QR to jump to that pitch in your session — camera opens automatically'
                : 'Scan the QR label on the meter — identifies pitch and opens camera for reading'}
            </p>
          </div>
        </div>
      )}

      {/* Camera Overlay — Live Scanning */}
      {showCamera && (
        <div className="fixed inset-0 z-50 bg-black flex flex-col">
          <div className="flex items-center justify-between p-4">
            <div>
              <h3 className="text-white font-bold text-sm">Live Meter Scanner</h3>
              {(selectedPitchObj || currentSessionPitch) && (
                <p className="text-white/60 text-xs">
                  Pitch {(selectedPitchObj || currentSessionPitch)?.pitch_number} — {(selectedPitchObj || currentSessionPitch)?.customer_name || 'Vacant'}
                </p>
              )}
            </div>
            <button onClick={closeCamera} className="text-white/70 hover:text-white">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div className="flex-1 flex items-center justify-center relative">
            <video ref={videoRef} autoPlay playsInline className="max-w-full max-h-full" />
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className={`w-[70%] h-[15%] border-2 rounded-lg flex items-center justify-center transition-colors ${
                readingLocked ? 'border-green-400 bg-green-500/10' :
                liveDigits ? 'border-amber-400 bg-amber-500/5' : 'border-white/60'
              }`}>
                {!liveDigits && !readingLocked && <span className="text-white/40 text-xs">Align meter digits here</span>}
              </div>
            </div>
          </div>
          <div className="p-4 flex flex-col items-center gap-3">
            <div className="bg-slate-900/80 backdrop-blur rounded-xl px-6 py-3 min-w-[250px] text-center">
              {readingLocked ? (
                <div>
                  <div className="flex items-center justify-center gap-2 mb-1">
                    <svg className="w-5 h-5 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span className="text-green-400 text-xs font-semibold uppercase tracking-wider">Reading Confirmed</span>
                  </div>
                  <p className="text-white font-mono text-3xl font-bold tracking-wider">{liveDigits}</p>
                  <p className="text-white/50 text-xs mt-1">{liveConfidence}% confidence — matched {matchCount}x</p>
                </div>
              ) : liveDigits ? (
                <div>
                  <p className="text-amber-400 text-xs font-semibold uppercase tracking-wider mb-1">Scanning... ({matchCount}/{LOCK_THRESHOLD})</p>
                  <p className="text-white font-mono text-3xl font-bold tracking-wider">{liveDigits}</p>
                  <p className="text-white/40 text-xs mt-1">Hold steady — confirming reading...</p>
                </div>
              ) : (
                <div>
                  <div className="flex items-center justify-center gap-2">
                    <div className="animate-spin w-4 h-4 border-2 border-teal-400 border-t-transparent rounded-full" />
                    <span className="text-teal-400 text-xs font-semibold uppercase tracking-wider">Scanning</span>
                  </div>
                  <p className="text-white/40 text-xs mt-2">Point camera at meter digits inside the box</p>
                </div>
              )}
            </div>
            {readingLocked ? (
              <div className="flex items-center gap-3">
                <button onClick={retryLiveScan} className="px-5 py-2.5 bg-slate-700 text-white rounded-xl text-sm font-medium hover:bg-slate-600 transition-colors">Rescan</button>
                <button onClick={acceptReading} className="px-6 py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-bold hover:bg-emerald-500 transition-colors flex items-center gap-2">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                  Accept Reading
                </button>
              </div>
            ) : (
              <button onClick={closeCamera} className="px-5 py-2.5 bg-slate-700/80 text-white/70 rounded-xl text-xs hover:bg-slate-600 transition-colors">
                Cancel — enter manually instead
              </button>
            )}
          </div>
        </div>
      )}

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
              <button onClick={() => emailSessionReport(exportSession, 'manager')} className="w-full text-left px-4 py-3 bg-teal-50 hover:bg-teal-100 rounded-xl text-sm transition-colors">
                <span className="font-medium text-teal-800">Email to Site Manager</span>
                <p className="text-xs text-teal-600">Send report via email</p>
              </button>
              <button onClick={() => emailSessionReport(exportSession, 'head_office')} className="w-full text-left px-4 py-3 bg-teal-50 hover:bg-teal-100 rounded-xl text-sm transition-colors">
                <span className="font-medium text-teal-800">Email to Head Office</span>
                <p className="text-xs text-teal-600">Send report via email</p>
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
                {selectedPitch && !editingReading && (
                  <div className="mb-3">
                    <label className="block text-xs font-medium text-slate-500 mb-1">Live Scan Meter (optional)</label>
                    {!capturedImage ? (
                      <button onClick={openCamera} className="w-full py-8 border-2 border-dashed border-slate-300 rounded-xl text-sm text-slate-500 hover:border-teal-400 hover:text-teal-600 transition-colors flex flex-col items-center gap-2">
                        <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                        <span className="font-medium">Tap to scan meter display</span>
                        <span className="text-xs text-slate-400">Camera reads digits automatically — hold steady to confirm</span>
                      </button>
                    ) : (
                      <div>
                        <img src={capturedImage} className="w-full rounded-xl border max-h-48 object-cover" alt="Meter photo" />
                        <div className="flex items-center gap-2 mt-2">
                          {ocrConfidence !== null && ocrConfidence > 0 && (
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ocrConfidence > 80 ? 'bg-green-100 text-green-700' : ocrConfidence > 50 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}`}>
                              OCR: {ocrConfidence}% confidence
                            </span>
                          )}
                          <button onClick={() => { setCapturedImage(null); setOcrConfidence(null); openCamera(); }} className="text-xs text-teal-600 hover:text-teal-800 font-medium">Rescan</button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Meter Reading (kWh) *</label>
                    <input type="number" value={newReading} onChange={e => setNewReading(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono text-lg" placeholder="e.g. 15234" />
                    {editingReading && (
                      <p className="text-xs text-slate-400 mt-1">Previous: {Number(editingReading.previous_reading).toLocaleString()} | Original: {Number(editingReading.reading).toLocaleString()}</p>
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
              </div>
            )}

            {/* Readings List */}
            {loading ? (
              <div className="flex justify-center py-12"><div className="animate-spin w-8 h-8 border-2 border-emerald-400 border-t-transparent rounded-full" /></div>
            ) : readings.length === 0 ? (
              <div className="bg-white rounded-xl border p-8 text-center">
                <p className="text-sm text-slate-400">No readings yet. Click &quot;New Reading&quot; or scan a QR code to record one.</p>
              </div>
            ) : (
              <div className="bg-white rounded-xl border overflow-hidden">
                <table className="w-full">
                  <thead className="bg-slate-50 border-b">
                    <tr>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500">Pitch</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500">Customer</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500">Reading</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500">Previous</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500">Usage (kWh)</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 hidden sm:table-cell">Date</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {readings.map(r => (
                      <tr key={r.id} className="hover:bg-slate-50">
                        <td className="px-4 py-3 text-sm font-semibold text-slate-900">{r.pitch?.pitch_number || '—'}</td>
                        <td className="px-4 py-3 text-sm text-slate-600">{r.pitch?.customer_name || '—'}</td>
                        <td className="px-4 py-3 text-sm text-right font-mono">{Number(r.reading).toLocaleString()}</td>
                        <td className="px-4 py-3 text-sm text-right font-mono text-slate-400">{Number(r.previous_reading).toLocaleString()}</td>
                        <td className="px-4 py-3 text-sm text-right font-bold text-emerald-600">{Number(r.usage_kwh).toLocaleString()}</td>
                        <td className="px-4 py-3 text-xs text-right text-slate-400 hidden sm:table-cell">{r.read_at ? new Date(r.read_at).toLocaleDateString() : '—'}</td>
                        <td className="px-4 py-3 text-right">
                          <button onClick={() => startEdit(r)} className="text-xs text-teal-600 hover:text-teal-800 font-medium">Edit</button>
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
                {/* Start new session */}
                <div className="bg-white rounded-xl border p-6 text-center">
                  <div className="w-16 h-16 bg-emerald-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                    <svg className="w-8 h-8 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                    </svg>
                  </div>
                  <h3 className="text-base font-bold text-slate-900 mb-1">Meter Reading Session</h3>
                  <p className="text-sm text-slate-500 mb-4">
                    Walk around the park and record every meter in one session.<br />
                    {pitches.filter(p => p.meter_id).length} meters to read. Saves progress automatically.
                  </p>
                  <button onClick={startNewSession} className="px-6 py-3 bg-emerald-600 text-white rounded-xl text-sm font-semibold hover:bg-emerald-500 transition-colors">
                    Start New Session
                  </button>
                </div>

                {/* Past sessions */}
                {pastSessions.length > 0 && (
                  <div className="bg-white rounded-xl border overflow-hidden">
                    <div className="px-4 py-3 border-b bg-slate-50">
                      <h3 className="text-sm font-semibold text-slate-700">Past Sessions</h3>
                    </div>
                    <div className="divide-y divide-slate-100">
                      {pastSessions.sort((a, b) => new Date(b.started_at) - new Date(a.started_at)).map(s => {
                        const sPitchCount = pitches.filter(p => p.meter_id).length;
                        const sReadCount = Object.keys(s.readings).length;
                        const sPercent = sPitchCount > 0 ? Math.round((sReadCount / sPitchCount) * 100) : 0;
                        return (
                          <div key={s.id} className="px-4 py-3 flex items-center justify-between">
                            <div>
                              <p className="text-sm font-medium text-slate-800">{s.name}</p>
                              <p className="text-xs text-slate-400">
                                {sReadCount}/{sPitchCount} readings ({sPercent}%) —
                                {s.status === 'complete' ? ' Completed' : ' In Progress'}
                              </p>
                            </div>
                            <div className="flex items-center gap-2">
                              {s.status === 'active' && (
                                <button onClick={() => resumeSession(s)} className="px-3 py-1.5 bg-amber-100 text-amber-700 rounded-lg text-xs font-medium hover:bg-amber-200">
                                  Resume
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
                      <p className="text-xs text-slate-400">{sessionCompleted} of {sessionTotal} meters read</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => { setExportSession(session); setShowExportModal(true); }} className="px-3 py-1.5 bg-teal-100 text-teal-700 rounded-lg text-xs font-medium hover:bg-teal-200">
                        Export
                      </button>
                      <button onClick={pauseSession} className="px-3 py-1.5 bg-slate-100 text-slate-600 rounded-lg text-xs font-medium hover:bg-slate-200">
                        Pause
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

                {/* Pitch scroll list (mini pills) */}
                <div className="flex gap-1.5 overflow-x-auto pb-1 px-0.5">
                  {sessionPitches.map((p, idx) => {
                    const done = !!session.readings[p.id];
                    const active = idx === sessionPitchIndex;
                    return (
                      <button
                        key={p.id}
                        onClick={() => sessionGoToPitch(idx)}
                        className={`flex-shrink-0 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                          active ? 'bg-emerald-600 text-white border-emerald-600' :
                          done ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                          'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        {done && !active && <span className="mr-0.5">&#10003;</span>}
                        {p.pitch_number}
                      </button>
                    );
                  })}
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
                    {currentPitchDone && (
                      <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 mb-4">
                        <p className="text-sm text-emerald-800 font-medium">
                          Reading: <span className="font-mono">{session.readings[currentSessionPitch.id].reading}</span>
                          <span className="text-emerald-600 ml-2">({session.readings[currentSessionPitch.id].usage_kwh} kWh)</span>
                        </p>
                        <p className="text-xs text-emerald-600">
                          Recorded at {new Date(session.readings[currentSessionPitch.id].read_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                    )}

                    {/* Camera button */}
                    {!currentPitchDone && (
                      <div className="mb-3">
                        {!capturedImage ? (
                          <button onClick={openCamera} className="w-full py-6 border-2 border-dashed border-slate-300 rounded-xl text-sm text-slate-500 hover:border-teal-400 hover:text-teal-600 transition-colors flex flex-col items-center gap-2">
                            <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                            <span className="font-medium">Scan Meter Display</span>
                            <span className="text-xs text-slate-400">Camera reads digits live — hold steady to confirm</span>
                          </button>
                        ) : (
                          <div>
                            <img src={capturedImage} className="w-full rounded-xl border max-h-36 object-cover" alt="Meter" />
                            <div className="flex items-center gap-2 mt-2">
                              {ocrConfidence !== null && ocrConfidence > 0 && (
                                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ocrConfidence > 80 ? 'bg-green-100 text-green-700' : ocrConfidence > 50 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}`}>
                                  {ocrConfidence}% confidence
                                </span>
                              )}
                              <button onClick={() => { setCapturedImage(null); setOcrConfidence(null); openCamera(); }} className="text-xs text-teal-600 hover:text-teal-800 font-medium">Rescan</button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Reading input */}
                    {!currentPitchDone && (
                      <div className="flex items-end gap-2">
                        <div className="flex-1">
                          <label className="block text-xs font-medium text-slate-500 mb-1">Reading (kWh)</label>
                          <input type="number" value={newReading} onChange={e => setNewReading(e.target.value)}
                            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono text-lg" placeholder="e.g. 15234" />
                        </div>
                        <button onClick={saveSessionReading} disabled={!newReading || saving}
                          className="px-5 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium disabled:opacity-50 hover:bg-emerald-500 transition-colors">
                          {saving ? 'Saving...' : 'Save'}
                        </button>
                      </div>
                    )}

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
                        return (
                          <div key={p.id} className="px-4 py-2.5 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold text-emerald-600">&#10003;</span>
                              <span className="text-sm font-medium text-slate-800">{p.pitch_number}</span>
                              <span className="text-xs text-slate-400">{r.customer_name || p.customer_name || 'Vacant'}</span>
                            </div>
                            <div className="text-right">
                              <span className="text-sm font-mono text-slate-700">{r.reading}</span>
                              <span className="text-xs text-emerald-600 ml-2">{r.usage_kwh} kWh</span>
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
