import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import webpush from 'web-push';

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

// Send push notifications to all users in an org (except the sender)
export async function POST(request) {
  try {
    const { title, body, convId, orgId, excludeUserId } = await request.json();

    if (!orgId) {
      return NextResponse.json({ error: 'Missing orgId' }, { status: 400 });
    }

    // Configure web-push with VAPID keys
    webpush.setVapidDetails(
      'mailto:hello@carecallai.co.uk',
      process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
      process.env.VAPID_PRIVATE_KEY
    );

    const supabase = getSupabaseAdmin();

    // Get all push subscriptions for this org
    let query = supabase.from('push_subscriptions').select('*').eq('org_id', orgId);
    if (excludeUserId) {
      query = query.neq('user_id', excludeUserId);
    }
    const { data: subs, error } = await query;

    if (error) {
      console.error('Push notify query error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!subs || subs.length === 0) {
      return NextResponse.json({ sent: 0, message: 'No subscriptions found' });
    }

    const payload = JSON.stringify({
      title: title || '🚨 EMERGENCY ON SITE',
      body: body || 'Emergency alert — open the app immediately',
      convId: convId || null,
    });

    // Send to all subscriptions in parallel
    const results = await Promise.allSettled(
      subs.map(async (sub) => {
        try {
          const subscription = JSON.parse(sub.subscription);
          await webpush.sendNotification(subscription, payload);
          return { success: true, userId: sub.user_id };
        } catch (err) {
          // If subscription is expired/invalid, remove it
          if (err.statusCode === 404 || err.statusCode === 410) {
            await supabase.from('push_subscriptions').delete().eq('id', sub.id);
          }
          return { success: false, userId: sub.user_id, error: err.message };
        }
      })
    );

    const sent = results.filter(r => r.status === 'fulfilled' && r.value.success).length;
    return NextResponse.json({ sent, total: subs.length });
  } catch (err) {
    console.error('Push notify error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
