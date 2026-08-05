import nodemailer from "nodemailer";

function transporter() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) {
    throw new Error("SMTP is not configured (SMTP_HOST / SMTP_USER / SMTP_PASS)");
  }
  return nodemailer.createTransport({
    host,
    port,
    secure: process.env.SMTP_SECURE === "true",
    auth: { user, pass },
  });
}

export async function sendMail(opts: {
  to: string;
  subject: string;
  html: string;
  text?: string;
}) {
  const from = process.env.SMTP_FROM || process.env.SMTP_USER!;
  const tx = transporter();
  await tx.sendMail({
    from,
    to: opts.to,
    subject: opts.subject,
    html: opts.html,
    text: opts.text,
  });
}

export function appUrl(path = "") {
  const base = (process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "");
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

export async function sendVerifyEmail(to: string, name: string, token: string) {
  const link = appUrl(`/verify-email?token=${encodeURIComponent(token)}`);
  await sendMail({
    to,
    subject: "Verify your Contest Hub account",
    text: `Hi ${name},\n\nVerify your email: ${link}\n\nThis link expires in 24 hours.`,
    html: `<p>Hi ${name},</p><p>Confirm your Contest Hub account:</p><p><a href="${link}">Verify email</a></p><p>This link expires in 24 hours.</p>`,
  });
}

export async function sendPasswordResetEmail(to: string, name: string, token: string) {
  const link = appUrl(`/reset-password?token=${encodeURIComponent(token)}`);
  await sendMail({
    to,
    subject: "Reset your Contest Hub password",
    text: `Hi ${name},\n\nReset your password: ${link}\n\nThis link expires in 1 hour. If you did not request this, ignore the email.`,
    html: `<p>Hi ${name},</p><p>Reset your password:</p><p><a href="${link}">Reset password</a></p><p>This link expires in 1 hour. If you did not request this, ignore the email.</p>`,
  });
}
