import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import nodemailer from 'nodemailer';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SMTP_HOST = process.env.SMTP_HOST || 'smtp.ionos.co.uk';
const SMTP_PORT = parseInt(process.env.SMTP_PORT || '587');
const SMTP_USER = process.env.SMTP_USER || 'hello@carecallai.co.uk';
const SMTP_PASS = process.env.SMTP_PASS;
const FROM_EMAIL = process.env.FROM_EMAIL || 'hello@carecallai.co.uk';

export async function POST(request) {
  try {
    const { email, name, role, pitch, orgId, orgName } = await request.json();

    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }
    if (!orgId) {
      return NextResponse.json({ error: 'Organization ID is required' }, { status: 400 });
    }

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://parkmanager-ai.vercel.app';
    const siteName = orgName || 'ParkManagerAI';
    const tempPassword = generatePassword();

    // Create user in Supabase auth
    const { data: userData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true,
    });

    if (authError) {
      // If user already exists, return friendly error
      if (authError.message.includes('already been registered') || authError.message.includes('already exists')) {
        return NextResponse.json({ error: 'This email is already registered. They can log in with their existing credentials.' }, { status: 400 });
      }
      return NextResponse.json({ error: authError.message }, { status: 400 });
    }

    // Create profile linked to the same org
    const mappedRole = role === 'admin' ? 'admin' : role === 'developer' ? 'developer' : role === 'accounts' ? 'accounts' : 'customer';
    await supabaseAdmin.from('profiles').upsert({
      id: userData.user.id,
      email,
      full_name: name || email.split('@')[0],
      role: mappedRole,
      org_name: orgName || '',
      org_id: orgId,
    }, { onConflict: 'id' });

    // Send invite email
    const html = buildInviteEmail({ name, email, role: mappedRole, pitch, siteUrl, siteName, tempPassword });
    const subject = `You're invited to ${siteName}`;

    if (SMTP_PASS) {
      const transporter = nodemailer.createTransport({
        host: SMTP_HOST,
        port: SMTP_PORT,
        secure: SMTP_PORT === 465,
        auth: { user: SMTP_USER, pass: SMTP_PASS },
      });

      await transporter.sendMail({
        from: `"${siteName}" <${FROM_EMAIL}>`,
        to: email,
        subject,
        html,
      });

      return NextResponse.json({ success: true, message: `Invite sent to ${email}`, userId: userData.user.id });
    }

    // No SMTP — still created user, just couldn't email
    return NextResponse.json({
      success: true,
      message: `Account created for ${email}. Temp password: ${tempPassword} (email not sent — configure SMTP_PASS)`,
      userId: userData.user.id,
      tempPassword,
      demo: true,
    });
  } catch (err) {
    console.error('Invite error:', err);
    return NextResponse.json({ error: err.message || 'Failed to send invite' }, { status: 500 });
  }
}

function generatePassword() {
  const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let pw = '';
  for (let i = 0; i < 10; i++) pw += chars[Math.floor(Math.random() * chars.length)];
  return pw + '!';
}

function buildInviteEmail({ name, email, role, pitch, siteUrl, siteName, tempPassword }) {
  const displayName = name || email.split('@')[0];
  const roleLabels = { super_admin: 'Super Admin', admin: 'Site Manager', developer: 'Developer', accounts: 'Accounts', customer: 'Customer' };
  const roleLabel = roleLabels[role] || 'Team Member';
  const loginUrl = `${siteUrl}/login`;

  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: linear-gradient(135deg, #059669, #0d9488); padding: 32px; border-radius: 16px 16px 0 0; text-align: center;">
        <div style="width: 64px; height: 64px; background: rgba(255,255,255,0.2); border-radius: 16px; margin: 0 auto 16px; display: flex; align-items: center; justify-content: center;">
          <span style="color: white; font-size: 32px; font-weight: bold;">P</span>
        </div>
        <h1 style="color: white; margin: 0; font-size: 24px; font-weight: bold;">${siteName}</h1>
        <p style="color: rgba(255,255,255,0.8); margin: 8px 0 0; font-size: 14px;">Caravan Park Management</p>
      </div>

      <div style="background: #f8fafc; padding: 32px; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 16px 16px;">
        <h2 style="color: #1e293b; margin: 0 0 8px; font-size: 20px;">Hello ${displayName}!</h2>
        <p style="color: #475569; font-size: 15px; line-height: 1.6;">
          You've been invited to join <strong>${siteName}</strong> as a <strong>${roleLabel}</strong>.
          ${pitch ? `Your assigned pitch is <strong>${pitch}</strong>.` : ''}
        </p>

        <div style="background: white; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; margin: 24px 0;">
          <p style="margin: 0 0 8px; font-weight: bold; color: #64748b; font-size: 12px; text-transform: uppercase;">Your Login Details</p>
          <table style="width: 100%;">
            <tr>
              <td style="padding: 4px 0; color: #64748b; font-size: 13px; width: 80px;">Email:</td>
              <td style="padding: 4px 0; color: #1e293b; font-size: 14px; font-weight: 600;">${email}</td>
            </tr>
            <tr>
              <td style="padding: 4px 0; color: #64748b; font-size: 13px;">Password:</td>
              <td style="padding: 4px 0; color: #1e293b; font-size: 14px; font-family: monospace; font-weight: 600;">${tempPassword}</td>
            </tr>
          </table>
        </div>

        <div style="text-align: center; margin: 24px 0;">
          <a href="${loginUrl}" style="display: inline-block; background: #059669; color: white; padding: 14px 32px; border-radius: 12px; text-decoration: none; font-size: 16px; font-weight: 700;">
            Open ${siteName}
          </a>
        </div>

        <div style="background: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 12px; padding: 16px; margin-top: 24px;">
          <p style="margin: 0; color: #065f46; font-size: 13px; font-weight: 600;">Install as an App</p>
          <p style="margin: 6px 0 0; color: #047857; font-size: 13px; line-height: 1.5;">
            For the best experience, install on your phone:
          </p>
          <ul style="margin: 8px 0 0; padding-left: 20px; color: #047857; font-size: 13px; line-height: 1.8;">
            <li><strong>Android:</strong> Open in Chrome, tap "Install App"</li>
            <li><strong>iPhone:</strong> Open in Safari, tap Share, then "Add to Home Screen"</li>
          </ul>
        </div>

        <p style="margin-top: 24px; text-align: center; color: #94a3b8; font-size: 11px;">
          ${siteName} &middot; Smart Caravan Park Management
        </p>
      </div>
    </div>
  `;
}
