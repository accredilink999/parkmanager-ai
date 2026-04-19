import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

// Save or update a push subscription for a user
export async function POST(request) {
  try {
    const { subscription, userId, orgId } = await request.json();
    if (!subscription || !userId) {
      return NextResponse.json({ error: 'Missing subscription or userId' }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();

    // Upsert by endpoint (each browser/device has a unique endpoint)
    const { error } = await supabase.from('push_subscriptions').upsert({
      user_id: userId,
      org_id: orgId || null,
      endpoint: subscription.endpoint,
      subscription: JSON.stringify(subscription),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'endpoint' });

    if (error) {
      console.error('Push subscribe error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('Push subscribe error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
