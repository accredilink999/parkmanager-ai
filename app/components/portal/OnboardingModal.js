'use client';
import { useState } from 'react';
import { supabase } from '@/lib/supabase';

export default function OnboardingModal({ user, pitch, onComplete }) {
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);

  // Step 1
  const [leadName, setLeadName] = useState(user?.full_name || '');
  const [email, setEmail] = useState(user?.email || '');
  const [phone, setPhone] = useState('');

  // Step 2
  const [occupants, setOccupants] = useState([]);
  const [occName, setOccName] = useState('');
  const [occRel, setOccRel] = useState('');
  const [homeAddress, setHomeAddress] = useState('');

  // Step 3
  const [ecName, setEcName] = useState('');
  const [ecPhone, setEcPhone] = useState('');
  const [ecRelationship, setEcRelationship] = useState('');

  function addOccupant() {
    if (!occName.trim()) return;
    setOccupants(prev => [...prev, { name: occName.trim(), relationship: occRel.trim() || 'Family' }]);
    setOccName('');
    setOccRel('');
  }

  function removeOccupant(idx) {
    setOccupants(prev => prev.filter((_, i) => i !== idx));
  }

  async function handleSubmit() {
    if (!leadName.trim()) return;
    setSaving(true);

    const profile = {
      user_id: user.id,
      pitch_id: pitch?.id || null,
      org_id: user.org_id || null,
      lead_occupier: leadName.trim(),
      other_occupants: occupants,
      email: email.trim(),
      phone: phone.trim(),
      home_address: homeAddress.trim(),
      emergency_contact_name: ecName.trim(),
      emergency_contact_phone: ecPhone.trim(),
      emergency_contact_relationship: ecRelationship.trim(),
      onboarding_complete: true,
      updated_at: new Date().toISOString(),
    };

    if (supabase) {
      try {
        const { error } = await supabase.from('customer_profiles').upsert(profile, { onConflict: 'user_id' });
        if (error) throw error;
      } catch (err) {
        console.error('Save profile error:', err);
        setSaving(false);
        return;
      }
    }

    // Also update pitch with customer details
    if (supabase && pitch?.id) {
      try {
        await supabase.from('pitches').update({
          customer_name: leadName.trim(),
          customer_email: email.trim(),
          customer_phone: phone.trim(),
        }).eq('id', pitch.id);
      } catch {}
    }

    setSaving(false);
    onComplete(profile);
  }

  return (
    <div className="fixed inset-0 z-50 bg-white flex flex-col">
      {/* Progress */}
      <div className="bg-emerald-600 px-4 pt-8 pb-6 text-white">
        <h1 className="text-xl font-bold mb-1">Welcome to ParkManagerAI</h1>
        <p className="text-sm text-white/80">Let&apos;s set up your profile</p>
        <div className="flex gap-2 mt-4">
          {[1, 2, 3].map(s => (
            <div key={s} className={`flex-1 h-1.5 rounded-full ${s <= step ? 'bg-white' : 'bg-white/30'}`} />
          ))}
        </div>
        <p className="text-xs text-white/60 mt-2">Step {step} of 3</p>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 py-6 max-w-lg mx-auto w-full">
        {step === 1 && (
          <div className="space-y-4">
            <h2 className="text-lg font-bold text-slate-900">Personal Details</h2>
            <p className="text-sm text-slate-500">Tell us about the lead occupier of this pitch.</p>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Lead Occupier Name *</label>
              <input type="text" value={leadName} onChange={e => setLeadName(e.target.value)}
                className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                placeholder="Full name" autoFocus />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Email Address</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                placeholder="email@example.com" />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Phone Number</label>
              <input type="tel" value={phone} onChange={e => setPhone(e.target.value)}
                className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                placeholder="07700 000000" />
            </div>

            {pitch && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3">
                <p className="text-xs text-emerald-700 font-medium">Your pitch: {pitch.pitch_number}</p>
                {pitch.meter_id && <p className="text-xs text-emerald-600">Meter: {pitch.meter_id}</p>}
              </div>
            )}
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <h2 className="text-lg font-bold text-slate-900">Household Details</h2>
            <p className="text-sm text-slate-500">Who else is staying on your pitch?</p>

            {occupants.length > 0 && (
              <div className="space-y-2">
                {occupants.map((o, i) => (
                  <div key={i} className="flex items-center justify-between bg-slate-50 rounded-xl px-4 py-2.5 border">
                    <div>
                      <p className="text-sm font-medium text-slate-800">{o.name}</p>
                      <p className="text-xs text-slate-400">{o.relationship}</p>
                    </div>
                    <button onClick={() => removeOccupant(i)} className="text-xs text-red-400 hover:text-red-600">Remove</button>
                  </div>
                ))}
              </div>
            )}

            <div className="flex gap-2">
              <input type="text" value={occName} onChange={e => setOccName(e.target.value)}
                className="flex-1 px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                placeholder="Name" />
              <input type="text" value={occRel} onChange={e => setOccRel(e.target.value)}
                className="w-28 px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                placeholder="Relation" />
              <button onClick={addOccupant} disabled={!occName.trim()}
                className="px-4 py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-medium disabled:opacity-50">
                Add
              </button>
            </div>

            <div className="pt-2">
              <label className="block text-xs font-medium text-slate-600 mb-1">Permanent Home Address</label>
              <textarea value={homeAddress} onChange={e => setHomeAddress(e.target.value)} rows={3}
                className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none"
                placeholder="Your home address (not the pitch address)" />
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <h2 className="text-lg font-bold text-slate-900">Emergency Contact</h2>
            <p className="text-sm text-slate-500">Someone we can contact in an emergency.</p>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Contact Name *</label>
              <input type="text" value={ecName} onChange={e => setEcName(e.target.value)}
                className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                placeholder="Full name" autoFocus />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Contact Phone *</label>
              <input type="tel" value={ecPhone} onChange={e => setEcPhone(e.target.value)}
                className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                placeholder="07700 000000" />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Relationship</label>
              <select value={ecRelationship} onChange={e => setEcRelationship(e.target.value)}
                className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500">
                <option value="">Select...</option>
                <option>Spouse / Partner</option>
                <option>Parent</option>
                <option>Child</option>
                <option>Sibling</option>
                <option>Friend</option>
                <option>Other</option>
              </select>
            </div>
          </div>
        )}
      </div>

      {/* Footer nav */}
      <div className="px-4 py-4 border-t bg-white max-w-lg mx-auto w-full">
        <div className="flex gap-3">
          {step > 1 && (
            <button onClick={() => setStep(step - 1)}
              className="px-6 py-3 border border-slate-200 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-50">
              Back
            </button>
          )}
          {step < 3 ? (
            <button onClick={() => setStep(step + 1)}
              disabled={step === 1 && !leadName.trim()}
              className="flex-1 py-3 bg-emerald-600 text-white rounded-xl text-sm font-bold disabled:opacity-50 hover:bg-emerald-500">
              Continue
            </button>
          ) : (
            <button onClick={handleSubmit} disabled={saving || !leadName.trim()}
              className="flex-1 py-3 bg-emerald-600 text-white rounded-xl text-sm font-bold disabled:opacity-50 hover:bg-emerald-500">
              {saving ? 'Saving...' : 'Complete Setup'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
