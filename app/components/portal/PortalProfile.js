'use client';
import { useState } from 'react';
import { supabase } from '@/lib/supabase';

export default function PortalProfile({ user, pitch, customerProfile, onUpdate }) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');

  const [leadName, setLeadName] = useState(customerProfile?.lead_occupier_name || '');
  const [email, setEmail] = useState(customerProfile?.email || user?.email || '');
  const [phone, setPhone] = useState(customerProfile?.phone || '');
  const [homeAddress, setHomeAddress] = useState(customerProfile?.home_address || '');
  const [occupants, setOccupants] = useState(customerProfile?.other_occupants || []);
  const [ecName, setEcName] = useState(customerProfile?.emergency_contact_name || '');
  const [ecPhone, setEcPhone] = useState(customerProfile?.emergency_contact_phone || '');
  const [ecRel, setEcRel] = useState(customerProfile?.emergency_contact_relationship || '');

  const [occName, setOccName] = useState('');
  const [occRel, setOccRel] = useState('');

  function addOccupant() {
    if (!occName.trim()) return;
    setOccupants(prev => [...prev, { name: occName.trim(), relationship: occRel.trim() || 'Family' }]);
    setOccName('');
    setOccRel('');
  }

  async function handleSave() {
    setSaving(true);
    const updated = {
      user_id: user.id,
      lead_occupier_name: leadName.trim(),
      other_occupants: occupants,
      email: email.trim(),
      phone: phone.trim(),
      home_address: homeAddress.trim(),
      emergency_contact_name: ecName.trim(),
      emergency_contact_phone: ecPhone.trim(),
      emergency_contact_relationship: ecRel.trim(),
      updated_at: new Date().toISOString(),
    };

    if (supabase) {
      try {
        const { error } = await supabase.from('customer_profiles').update(updated).eq('user_id', user.id);
        if (error) throw error;
        // Also update pitch
        if (pitch?.id) {
          await supabase.from('pitches').update({
            customer_name: leadName.trim(),
            customer_email: email.trim(),
            customer_phone: phone.trim(),
          }).eq('id', pitch.id);
        }
      } catch (err) {
        console.error('Save error:', err);
        setToast('Failed to save — try again');
        setTimeout(() => setToast(''), 3000);
        setSaving(false);
        return;
      }
    }

    setSaving(false);
    setEditing(false);
    setToast('Profile updated');
    setTimeout(() => setToast(''), 3000);
    if (onUpdate) onUpdate({ ...customerProfile, ...updated });
  }

  const cp = customerProfile;

  return (
    <div className="space-y-3 mt-1">
      {toast && (
        <div className="bg-emerald-600 text-white text-center py-2 rounded-xl text-sm font-medium">{toast}</div>
      )}

      {/* Profile Card */}
      <div className="bg-white rounded-2xl border overflow-hidden">
        <div className="px-4 py-3 bg-emerald-50 border-b border-emerald-100 flex items-center justify-between">
          <p className="text-xs font-semibold text-emerald-700 uppercase tracking-wider">My Profile</p>
          <button onClick={() => setEditing(!editing)}
            className="text-xs font-medium text-emerald-600 hover:text-emerald-800">
            {editing ? 'Cancel' : 'Edit'}
          </button>
        </div>

        {editing ? (
          <div className="p-4 space-y-3">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Lead Occupier Name</label>
              <input type="text" value={leadName} onChange={e => setLeadName(e.target.value)}
                className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Phone</label>
              <input type="tel" value={phone} onChange={e => setPhone(e.target.value)}
                className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Home Address</label>
              <textarea value={homeAddress} onChange={e => setHomeAddress(e.target.value)} rows={2}
                className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none" />
            </div>

            <div className="border-t pt-3">
              <label className="block text-xs font-medium text-slate-500 mb-2">Other Occupants</label>
              {occupants.map((o, i) => (
                <div key={i} className="flex items-center justify-between bg-slate-50 rounded-lg px-3 py-2 mb-1">
                  <span className="text-sm text-slate-700">{o.name} <span className="text-slate-400">({o.relationship})</span></span>
                  <button onClick={() => setOccupants(prev => prev.filter((_, j) => j !== i))} className="text-xs text-red-400">Remove</button>
                </div>
              ))}
              <div className="flex gap-2 mt-1">
                <input type="text" value={occName} onChange={e => setOccName(e.target.value)} placeholder="Name"
                  className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                <input type="text" value={occRel} onChange={e => setOccRel(e.target.value)} placeholder="Relation"
                  className="w-24 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                <button onClick={addOccupant} disabled={!occName.trim()} className="px-3 py-2 bg-emerald-600 text-white rounded-lg text-xs font-medium disabled:opacity-50">Add</button>
              </div>
            </div>

            <div className="border-t pt-3">
              <label className="block text-xs font-medium text-slate-500 mb-2">Emergency Contact</label>
              <input type="text" value={ecName} onChange={e => setEcName(e.target.value)} placeholder="Name"
                className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm mb-2 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
              <input type="tel" value={ecPhone} onChange={e => setEcPhone(e.target.value)} placeholder="Phone"
                className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm mb-2 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
              <input type="text" value={ecRel} onChange={e => setEcRel(e.target.value)} placeholder="Relationship"
                className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
            </div>

            <button onClick={handleSave} disabled={saving || !leadName.trim()}
              className="w-full py-3 bg-emerald-600 text-white rounded-xl text-sm font-bold disabled:opacity-50 hover:bg-emerald-500">
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        ) : (
          <div className="divide-y">
            {[
              ['Name', cp?.lead_occupier_name || user?.full_name || '\u2014'],
              ['Email', cp?.email || user?.email || '\u2014'],
              ['Phone', cp?.phone || '\u2014'],
              ['Home Address', cp?.home_address || '\u2014'],
            ].map(([label, val]) => (
              <div key={label} className="flex items-center justify-between px-4 py-3">
                <p className="text-sm text-slate-500">{label}</p>
                <p className="text-sm font-medium text-slate-900 text-right max-w-[60%]">{val}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Pitch Details */}
      {pitch && (
        <div className="bg-white rounded-2xl border overflow-hidden">
          <div className="px-4 py-3 bg-teal-50 border-b border-teal-100">
            <p className="text-xs font-semibold text-teal-700 uppercase tracking-wider">Pitch Details</p>
          </div>
          <div className="divide-y">
            {[
              ['Pitch Number', pitch.pitch_number],
              ['Status', pitch.status],
              ['Meter ID', pitch.meter_id || '\u2014'],
            ].map(([label, val]) => (
              <div key={label} className="flex items-center justify-between px-4 py-3">
                <p className="text-sm text-slate-500">{label}</p>
                <p className="text-sm font-semibold text-slate-900 capitalize">{val}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Other Occupants */}
      {!editing && cp?.other_occupants?.length > 0 && (
        <div className="bg-white rounded-2xl border overflow-hidden">
          <div className="px-4 py-3 bg-blue-50 border-b border-blue-100">
            <p className="text-xs font-semibold text-blue-700 uppercase tracking-wider">Other Occupants</p>
          </div>
          <div className="divide-y">
            {cp.other_occupants.map((o, i) => (
              <div key={i} className="flex items-center justify-between px-4 py-3">
                <p className="text-sm font-medium text-slate-800">{o.name}</p>
                <p className="text-xs text-slate-400">{o.relationship}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Emergency Contact */}
      {!editing && cp?.emergency_contact_name && (
        <div className="bg-white rounded-2xl border overflow-hidden">
          <div className="px-4 py-3 bg-red-50 border-b border-red-100">
            <p className="text-xs font-semibold text-red-700 uppercase tracking-wider">Emergency Contact</p>
          </div>
          <div className="divide-y">
            <div className="flex items-center justify-between px-4 py-3">
              <p className="text-sm text-slate-500">Name</p>
              <p className="text-sm font-medium text-slate-900">{cp.emergency_contact_name}</p>
            </div>
            <div className="flex items-center justify-between px-4 py-3">
              <p className="text-sm text-slate-500">Phone</p>
              <a href={`tel:${cp.emergency_contact_phone}`} className="text-sm font-medium text-emerald-600">{cp.emergency_contact_phone}</a>
            </div>
            {cp.emergency_contact_relationship && (
              <div className="flex items-center justify-between px-4 py-3">
                <p className="text-sm text-slate-500">Relationship</p>
                <p className="text-sm font-medium text-slate-900">{cp.emergency_contact_relationship}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
