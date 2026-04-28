'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { getOrgId } from '@/lib/org';

function fmtReading(val) {
  const num = parseFloat(val);
  if (isNaN(num)) return String(val || '');
  const str = String(val);
  const dotIdx = str.indexOf('.');
  let whole, dec;
  if (dotIdx >= 0) { whole = str.slice(0, dotIdx); dec = str.slice(dotIdx + 1).slice(0, 2).padEnd(2, '0'); }
  else { whole = String(Math.floor(num)); dec = '00'; }
  return `${whole.padStart(5, '0')}.${dec}`;
}

export default function InitialReadingsPage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [pitches, setPitches] = useState([]);
  const [firstReadings, setFirstReadings] = useState({}); // { pitchId: { id, reading, read_at, previous_reading, usage_kwh } }
  const [initialValues, setInitialValues] = useState({}); // { pitchId: string input value }
  const [initialRecords, setInitialRecords] = useState({}); // { pitchId: { id, reading } } — existing initial reading DB records
  const [initialDate, setInitialDate] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedPitches, setSavedPitches] = useState(new Set());
  const [editingPitches, setEditingPitches] = useState(new Set()); // pitchIds currently being edited
  const [toast, setToast] = useState('');
  const [unitRate, setUnitRate] = useState(0.34);

  useEffect(() => {
    const saved = localStorage.getItem('pm_user');
    if (!saved) { router.push('/login'); return; }
    const u = JSON.parse(saved);
    if (u.role === 'customer') { router.push('/portal'); return; }
    setUser(u);
    loadData();
  }, [router]);

  async function loadData() {
    setLoading(true);
    if (!supabase) { setLoading(false); return; }

    try {
      const { data: pitchData } = await supabase
        .from('pitches')
        .select('id, pitch_number, customer_name, customer_email, meter_id, status')
        .order('pitch_number');
      setPitches(pitchData || []);

      const { data: settings } = await supabase
        .from('site_settings')
        .select('key, value')
        .eq('key', 'electricity_unit_rate');
      if (settings?.[0]?.value) setUnitRate(parseFloat(settings[0].value));

      const { data: allReadings } = await supabase
        .from('meter_readings')
        .select('id, pitch_id, reading, previous_reading, usage_kwh, read_at, is_initial')
        .order('read_at', { ascending: true });

      const firstMap = {};
      const alreadySaved = new Set();
      const initialRecs = {};
      const readingsByPitch = {};

      (allReadings || []).forEach(r => {
        if (!readingsByPitch[r.pitch_id]) readingsByPitch[r.pitch_id] = [];
        readingsByPitch[r.pitch_id].push(r);
      });

      Object.entries(readingsByPitch).forEach(([pitchId, readings]) => {
        const initial = readings.find(r => r.is_initial);
        if (initial) {
          alreadySaved.add(pitchId);
          initialRecs[pitchId] = { id: initial.id, reading: initial.reading };
          const firstSession = readings.find(r => !r.is_initial);
          if (firstSession) firstMap[pitchId] = firstSession;
        } else {
          if (readings.length > 0) firstMap[pitchId] = readings[0];
        }
      });

      setFirstReadings(firstMap);
      setSavedPitches(alreadySaved);
      setInitialRecords(initialRecs);
      setEditingPitches(new Set());

      // Pre-fill values
      const prefill = {};
      Object.entries(initialRecs).forEach(([pitchId, rec]) => {
        prefill[pitchId] = String(rec.reading);
      });
      setInitialValues(prefill);

    } catch (err) {
      console.error('Load error:', err);
    }
    setLoading(false);
  }

  // Save or update a single pitch's initial reading
  async function saveOrUpdate(pitchId) {
    const rawVal = initialValues[pitchId];
    if (!rawVal || !String(rawVal).trim()) return;

    const initialVal = parseFloat(rawVal);
    if (isNaN(initialVal)) return;

    const first = firstReadings[pitchId];
    if (!first) return;

    const firstReading = Number(first.reading);
    if (initialVal > firstReading) {
      setToast('Initial reading cannot be higher than the first app reading');
      setTimeout(() => setToast(''), 3000);
      return;
    }

    setSaving(true);
    const orgId = getOrgId();
    const isUpdate = savedPitches.has(pitchId) && initialRecords[pitchId];

    try {
      if (isUpdate) {
        // UPDATE existing initial reading record
        await supabase.from('meter_readings').update({
          reading: initialVal,
        }).eq('id', initialRecords[pitchId].id);
      } else {
        // INSERT new initial reading
        const initialReadAt = new Date(new Date(first.read_at).getTime() - 1000).toISOString();
        await supabase.from('meter_readings').insert({
          pitch_id: pitchId,
          reading: initialVal,
          previous_reading: 0,
          usage_kwh: 0,
          read_at: initialDate || initialReadAt,
          is_initial: true,
          org_id: orgId,
        });
      }

      // Recalculate the first session reading
      const correctedUsage = Math.max(0, firstReading - initialVal);
      await supabase.from('meter_readings').update({
        previous_reading: initialVal,
        usage_kwh: correctedUsage,
      }).eq('id', first.id);

      // Recalculate any bills referencing this reading
      const { data: bills } = await supabase
        .from('bills')
        .select('id, unit_rate')
        .eq('reading_id', first.id);

      if (bills && bills.length > 0) {
        for (const bill of bills) {
          const billRate = Number(bill.unit_rate) || unitRate;
          const billAmount = Math.round(correctedUsage * billRate * 100) / 100;
          await supabase.from('bills').update({
            start_reading: initialVal,
            usage_kwh: correctedUsage,
            amount_gbp: billAmount,
          }).eq('id', bill.id);
        }
      }

      setToast(`${isUpdate ? 'Updated' : 'Saved'} — usage corrected to ${correctedUsage.toLocaleString()} kWh`);
      setTimeout(() => setToast(''), 4000);
      loadData();
    } catch (err) {
      console.error('Save error:', err);
      setToast('Failed to save initial reading');
      setTimeout(() => setToast(''), 3000);
    }
    setSaving(false);
  }

  // Save all unsaved readings
  async function saveAll() {
    const entries = Object.entries(initialValues).filter(([pitchId, val]) => {
      if (!val || !String(val).trim()) return false;
      if (savedPitches.has(pitchId)) return false;
      return true;
    });

    if (entries.length === 0) {
      setToast('No new readings to save');
      setTimeout(() => setToast(''), 3000);
      return;
    }

    setSaving(true);
    const orgId = getOrgId();
    let savedCount = 0;

    for (const [pitchId, rawVal] of entries) {
      const initialVal = parseFloat(rawVal);
      if (isNaN(initialVal)) continue;
      const first = firstReadings[pitchId];
      if (!first) continue;
      const firstReading = Number(first.reading);
      if (initialVal > firstReading) continue;

      try {
        const initialReadAt = new Date(new Date(first.read_at).getTime() - 1000).toISOString();
        await supabase.from('meter_readings').insert({
          pitch_id: pitchId, reading: initialVal, previous_reading: 0, usage_kwh: 0,
          read_at: initialDate || initialReadAt, is_initial: true, org_id: orgId,
        });

        const correctedUsage = Math.max(0, firstReading - initialVal);
        await supabase.from('meter_readings').update({
          previous_reading: initialVal, usage_kwh: correctedUsage,
        }).eq('id', first.id);

        const { data: bills } = await supabase.from('bills').select('id, unit_rate').eq('reading_id', first.id);
        if (bills && bills.length > 0) {
          for (const bill of bills) {
            const billRate = Number(bill.unit_rate) || unitRate;
            await supabase.from('bills').update({
              start_reading: initialVal, usage_kwh: correctedUsage,
              amount_gbp: Math.round(correctedUsage * billRate * 100) / 100,
            }).eq('id', bill.id);
          }
        }
        savedCount++;
      } catch (err) {
        console.error(`Error saving pitch ${pitchId}:`, err);
      }
    }

    setSaving(false);
    setToast(`Saved ${savedCount} initial reading${savedCount !== 1 ? 's' : ''} — usage recalculated`);
    setTimeout(() => setToast(''), 4000);
    loadData();
  }

  function toggleEdit(pitchId) {
    setEditingPitches(prev => {
      const next = new Set(prev);
      if (next.has(pitchId)) next.delete(pitchId);
      else next.add(pitchId);
      return next;
    });
  }

  if (!user) return null;

  const pitchesWithReadings = pitches.filter(p => firstReadings[p.id]);
  const unsavedCount = Object.entries(initialValues).filter(([pid, v]) =>
    v && String(v).trim() && !savedPitches.has(pid) && firstReadings[pid]
  ).length;

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 px-4 py-3 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto flex items-center gap-3">
          <Link href="/dashboard" className="p-2 -ml-2 rounded-xl hover:bg-slate-100 transition-colors">
            <svg className="w-5 h-5 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <div>
            <h1 className="text-lg font-bold text-slate-900">Initial Meter Readings</h1>
            <p className="text-xs text-slate-400">Enter or edit pre-app readings to correct first period usage</p>
          </div>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-4 space-y-4">
        <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-xl p-4">
          <div className="flex gap-3">
            <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <h3 className="text-sm font-bold text-amber-900">Why is this needed?</h3>
              <p className="text-xs text-amber-700 mt-1">
                Enter the meter values from <strong>before</strong> the app was used so that the first period&apos;s
                usage is calculated correctly. You can edit saved readings at any time — usage, bills, and reports
                will be recalculated automatically.
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border p-4">
          <label className="block text-sm font-semibold text-slate-700 mb-1">Date initial readings were taken</label>
          <p className="text-xs text-slate-400 mb-2">When were the meters read before the app? Leave blank to auto-set.</p>
          <input
            type="date"
            value={initialDate}
            onChange={e => setInitialDate(e.target.value)}
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin w-8 h-8 border-2 border-emerald-400 border-t-transparent rounded-full" />
          </div>
        ) : pitchesWithReadings.length === 0 ? (
          <div className="bg-white rounded-xl border p-8 text-center">
            <svg className="w-12 h-12 text-slate-300 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            <p className="text-sm text-slate-500">No readings found yet.</p>
            <p className="text-xs text-slate-400 mt-1">Complete a reading session first, then come back here to set initial values.</p>
          </div>
        ) : (
          <>
            <div className="space-y-3">
              {pitchesWithReadings.map(pitch => {
                const first = firstReadings[pitch.id];
                const firstVal = Number(first.reading);
                const inputVal = initialValues[pitch.id] || '';
                const parsedInput = parseFloat(inputVal);
                const isValid = !isNaN(parsedInput) && parsedInput <= firstVal;
                const correctedUsage = isValid ? Math.max(0, firstVal - parsedInput) : null;
                const estimatedCost = correctedUsage !== null ? Math.round(correctedUsage * unitRate * 100) / 100 : null;
                const isSaved = savedPitches.has(pitch.id);
                const isEditing = editingPitches.has(pitch.id);
                const tooHigh = !isNaN(parsedInput) && parsedInput > firstVal;
                const savedVal = initialRecords[pitch.id]?.reading;
                const hasChanged = isSaved && inputVal !== String(savedVal);

                return (
                  <div key={pitch.id} className={`bg-white rounded-xl border p-4 transition-all ${isSaved && !isEditing ? 'border-emerald-200 bg-emerald-50/30' : ''} ${isEditing ? 'border-blue-300 bg-blue-50/20 ring-1 ring-blue-200' : ''}`}>
                    <div className="flex items-start gap-3">
                      <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-white font-bold text-sm flex-shrink-0 ${isSaved && !isEditing ? 'bg-emerald-500' : isEditing ? 'bg-blue-500' : 'bg-slate-600'}`}>
                        {isSaved && !isEditing ? (
                          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                        ) : isEditing ? (
                          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        ) : pitch.pitch_number}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-900 text-sm">{pitch.pitch_number}</span>
                            {isSaved && !isEditing && <span className="text-[10px] font-bold text-emerald-600 bg-emerald-100 px-2 py-0.5 rounded-full">SAVED</span>}
                            {isEditing && <span className="text-[10px] font-bold text-blue-600 bg-blue-100 px-2 py-0.5 rounded-full">EDITING</span>}
                          </div>
                          {isSaved && !isEditing && (
                            <button
                              onClick={() => toggleEdit(pitch.id)}
                              className="text-xs text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                              </svg>
                              Edit
                            </button>
                          )}
                        </div>
                        <p className="text-xs text-slate-500 truncate">{pitch.customer_name || 'Vacant'}</p>
                        {pitch.meter_id && <p className="text-[10px] text-slate-400">Meter: {pitch.meter_id}</p>}

                        <div className="mt-2 flex items-center gap-4 text-xs">
                          <div>
                            <span className="text-slate-400">First app reading:</span>
                            <span className="ml-1 font-mono font-bold text-slate-700">{fmtReading(firstVal)}</span>
                          </div>
                          <div>
                            <span className="text-slate-400">Date:</span>
                            <span className="ml-1 text-slate-600">{new Date(first.read_at).toLocaleDateString('en-GB')}</span>
                          </div>
                        </div>

                        {!isSaved && Number(first.previous_reading) === 0 && (
                          <p className="text-[10px] text-red-500 mt-1">
                            Current usage shows {firstVal.toLocaleString()} kWh (no baseline set)
                          </p>
                        )}

                        {/* Input — shown for unsaved OR editing */}
                        {(!isSaved || isEditing) && (
                          <>
                            <div className="mt-3 flex items-end gap-2">
                              <div className="flex-1">
                                <label className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">Pre-app reading</label>
                                <input
                                  type="number"
                                  step="0.01"
                                  value={inputVal}
                                  onChange={e => setInitialValues(prev => ({ ...prev, [pitch.id]: e.target.value }))}
                                  disabled={saving}
                                  className="w-full mt-0.5 px-3 py-2 border border-slate-200 rounded-lg text-sm font-mono text-right focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:bg-slate-50 disabled:text-slate-400"
                                  placeholder="e.g. 14890"
                                />
                              </div>
                              <button
                                onClick={() => saveOrUpdate(pitch.id)}
                                disabled={saving || !isValid || !inputVal || (isSaved && !hasChanged)}
                                className="px-3 py-2 bg-emerald-600 text-white rounded-lg text-xs font-medium disabled:opacity-40 hover:bg-emerald-500 transition-colors flex-shrink-0"
                              >
                                {isSaved ? 'Update' : 'Save'}
                              </button>
                              {isEditing && (
                                <button
                                  onClick={() => {
                                    toggleEdit(pitch.id);
                                    // Reset to saved value
                                    setInitialValues(prev => ({ ...prev, [pitch.id]: String(savedVal) }));
                                  }}
                                  className="px-3 py-2 bg-slate-100 text-slate-600 rounded-lg text-xs font-medium hover:bg-slate-200 transition-colors flex-shrink-0"
                                >
                                  Cancel
                                </button>
                              )}
                            </div>

                            {tooHigh && (
                              <p className="text-[10px] text-red-500 mt-1 flex items-center gap-1">
                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                                </svg>
                                Initial reading cannot be higher than the first app reading ({fmtReading(firstVal)})
                              </p>
                            )}

                            {isValid && inputVal && (
                              <div className={`mt-2 ${hasChanged || !isSaved ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 border-slate-200'} border rounded-lg p-2`}>
                                <div className="flex items-center gap-4 text-xs">
                                  <div>
                                    <span className="text-emerald-600">{hasChanged ? 'New usage:' : 'Corrected usage:'}</span>
                                    <span className="ml-1 font-bold text-emerald-800">{correctedUsage.toLocaleString()} kWh</span>
                                  </div>
                                  <div>
                                    <span className="text-emerald-600">Est. cost:</span>
                                    <span className="ml-1 font-bold text-emerald-800">£{estimatedCost.toFixed(2)}</span>
                                  </div>
                                </div>
                                <p className="text-[10px] text-emerald-500 mt-0.5">
                                  {fmtReading(firstVal)} &minus; {fmtReading(parsedInput)} = {correctedUsage.toLocaleString()} kWh @ £{unitRate}/kWh
                                </p>
                              </div>
                            )}
                          </>
                        )}

                        {/* Saved display (not editing) */}
                        {isSaved && !isEditing && (
                          <div className="mt-2 bg-emerald-50 border border-emerald-200 rounded-lg p-2">
                            <p className="text-xs text-emerald-700">
                              Initial reading: <span className="font-mono font-bold">{fmtReading(savedVal)}</span>
                              {' — '}Usage: <span className="font-bold">{Number(first.usage_kwh).toLocaleString()} kWh</span>
                              {' — '}Cost: <span className="font-bold">£{(Number(first.usage_kwh) * unitRate).toFixed(2)}</span>
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {unsavedCount > 0 && (
              <div className="sticky bottom-[72px] bg-white/90 backdrop-blur border rounded-xl p-3 shadow-lg">
                <button
                  onClick={saveAll}
                  disabled={saving}
                  className="w-full py-3 bg-emerald-600 text-white rounded-xl text-sm font-bold hover:bg-emerald-500 disabled:opacity-50 transition-colors"
                >
                  {saving ? (
                    <span className="flex items-center justify-center gap-2">
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Saving & recalculating...
                    </span>
                  ) : (
                    `Save All ${unsavedCount} Initial Reading${unsavedCount !== 1 ? 's' : ''} & Recalculate Usage`
                  )}
                </button>
              </div>
            )}

            <div className="bg-white rounded-xl border p-4">
              <h3 className="text-sm font-semibold text-slate-700 mb-2">Summary</h3>
              <div className="grid grid-cols-3 gap-3 text-center">
                <div>
                  <p className="text-2xl font-bold text-slate-900">{pitchesWithReadings.length}</p>
                  <p className="text-[10px] text-slate-400">Total Pitches</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-emerald-600">{savedPitches.size}</p>
                  <p className="text-[10px] text-slate-400">Initial Set</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-amber-600">{pitchesWithReadings.length - savedPitches.size}</p>
                  <p className="text-[10px] text-slate-400">Remaining</p>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {toast && (
        <div className="fixed top-4 left-4 right-4 z-[9999] max-w-lg mx-auto bg-emerald-600 text-white rounded-xl px-4 py-3 shadow-lg">
          <p className="text-sm font-medium text-center">{toast}</p>
        </div>
      )}
    </div>
  );
}
