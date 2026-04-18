import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export async function POST() {
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const tables = [];

  // Check and create customer_profiles
  const { error: e1 } = await sb.from('customer_profiles').select('id').limit(0);
  if (e1) {
    tables.push('customer_profiles needs creating via SQL Editor');
  } else {
    tables.push('customer_profiles exists');
  }

  // Check gas_orders
  const { error: e2 } = await sb.from('gas_orders').select('id').limit(0);
  if (e2) {
    tables.push('gas_orders needs creating via SQL Editor');
  } else {
    tables.push('gas_orders exists');
  }

  // Check site_reports
  const { error: e3 } = await sb.from('site_reports').select('id').limit(0);
  if (e3) {
    tables.push('site_reports needs creating via SQL Editor');
  } else {
    tables.push('site_reports exists');
  }

  // Check certificates
  const { error: e4 } = await sb.from('certificates').select('id').limit(0);
  if (e4) {
    tables.push('certificates needs creating via SQL Editor');
  } else {
    tables.push('certificates exists');
  }

  return NextResponse.json({ tables });
}
