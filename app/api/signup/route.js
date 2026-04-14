import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function POST(request) {
  try {
    const { email, password, fullName, orgName } = await request.json();

    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password required' }, { status: 400 });
    }

    // Create user with admin API (auto-confirms email)
    const { data: userData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (authError) {
      return NextResponse.json({ error: authError.message }, { status: 400 });
    }

    // Create profile as super_admin
    await supabaseAdmin.from('profiles').upsert({
      id: userData.user.id,
      email,
      full_name: fullName || email,
      role: 'super_admin',
      org_name: orgName || '',
    }, { onConflict: 'id' });

    // Set site name if provided
    if (orgName) {
      await supabaseAdmin.from('site_settings').upsert(
        { key: 'site_name', value: orgName, updated_at: new Date().toISOString() },
        { onConflict: 'key' }
      );
    }

    return NextResponse.json({
      success: true,
      userId: userData.user.id,
      message: 'Account created. You can now sign in.',
    });
  } catch (err) {
    return NextResponse.json({ error: err.message || 'Signup failed' }, { status: 500 });
  }
}
