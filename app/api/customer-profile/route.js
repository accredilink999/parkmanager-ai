import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

// GET - fetch customer profile
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get('user_id');
  if (!userId) return NextResponse.json({ error: 'user_id required' }, { status: 400 });

  const sb = getSupabaseAdmin();
  const { data, error } = await sb.from('customer_profiles').select('*').eq('user_id', userId).single();

  if (error && error.code !== 'PGRST116') {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ profile: data || null });
}

// POST - create or update customer profile
export async function POST(request) {
  try {
    const body = await request.json();
    const { user_id, pitch_id, org_id, ...profileData } = body;

    if (!user_id) return NextResponse.json({ error: 'user_id required' }, { status: 400 });

    const sb = getSupabaseAdmin();

    const { data, error } = await sb.from('customer_profiles').upsert({
      user_id,
      pitch_id: pitch_id || null,
      org_id: org_id || null,
      ...profileData,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' }).select().single();

    if (error) {
      console.error('Customer profile save error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Also update pitch with customer details if pitch_id provided
    if (pitch_id && profileData.lead_occupier) {
      await sb.from('pitches').update({
        customer_name: profileData.lead_occupier,
        customer_email: profileData.email || null,
        customer_phone: profileData.phone || null,
      }).eq('id', pitch_id);
    }

    return NextResponse.json({ profile: data });
  } catch (err) {
    console.error('Customer profile error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
