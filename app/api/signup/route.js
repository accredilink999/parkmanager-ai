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

    // Create organization for this park
    const { data: orgData, error: orgError } = await supabaseAdmin
      .from('organizations')
      .insert({ name: orgName || 'My Park' })
      .select('id')
      .single();

    if (orgError) {
      return NextResponse.json({ error: 'Failed to create organization: ' + orgError.message }, { status: 500 });
    }

    const orgId = orgData.id;

    // Create profile as super_admin linked to org
    await supabaseAdmin.from('profiles').upsert({
      id: userData.user.id,
      email,
      full_name: fullName || email,
      role: 'super_admin',
      org_name: orgName || '',
      org_id: orgId,
    }, { onConflict: 'id' });

    // Set site name for this org
    if (orgName) {
      await supabaseAdmin.from('site_settings').upsert(
        { key: 'site_name', value: orgName, org_id: orgId, updated_at: new Date().toISOString() },
        { onConflict: 'key,org_id' }
      );
    }

    return NextResponse.json({
      success: true,
      userId: userData.user.id,
      orgId,
      message: 'Account created. You can now sign in.',
    });
  } catch (err) {
    return NextResponse.json({ error: err.message || 'Signup failed' }, { status: 500 });
  }
}
