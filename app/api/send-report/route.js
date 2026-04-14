import { NextResponse } from 'next/server';
import nodemailer from 'nodemailer';

const SMTP_HOST = process.env.SMTP_HOST || 'smtp.ionos.co.uk';
const SMTP_PORT = parseInt(process.env.SMTP_PORT || '587');
const SMTP_USER = process.env.SMTP_USER || 'info@accredilinkcare.co.uk';
const SMTP_PASS = process.env.SMTP_PASS;
const FROM_EMAIL = process.env.FROM_EMAIL || 'info@accredilinkcare.co.uk';

export async function POST(request) {
  try {
    const { to, subject, body, pdfBase64, fileName, cc } = await request.json();

    if (!to) return NextResponse.json({ error: 'Recipient email required' }, { status: 400 });

    if (!SMTP_PASS) {
      return NextResponse.json({ success: true, message: `Email would be sent to ${to} (demo mode — configure SMTP_PASS)`, demo: true });
    }

    const transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_PORT === 465,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    });

    const mailOptions = {
      from: `"ParkManagerAI" <${FROM_EMAIL}>`,
      to,
      subject: subject || 'ParkManagerAI Report',
      html: body || '<p>Please find the attached report.</p>',
    };

    if (cc) mailOptions.cc = cc;

    if (pdfBase64 && fileName) {
      mailOptions.attachments = [{
        filename: fileName,
        content: Buffer.from(pdfBase64, 'base64'),
        contentType: 'application/pdf',
      }];
    }

    await transporter.sendMail(mailOptions);
    return NextResponse.json({ success: true, message: `Report sent to ${to}` });
  } catch (err) {
    console.error('Send report error:', err);
    return NextResponse.json({ error: err.message || 'Failed to send report' }, { status: 500 });
  }
}
