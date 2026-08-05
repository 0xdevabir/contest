import nodemailer from "nodemailer";
import { BRAND } from "@/lib/brand";

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

function escapeHtml(value: string) {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;",
      })[character]!
  );
}

export async function sendVerifyEmail(to: string, name: string, token: string) {
  const link = appUrl(`/verify-email?token=${encodeURIComponent(token)}`);
  const safeName = escapeHtml(name);
  const safeLink = escapeHtml(link);
  await sendMail({
    to,
    subject: `Verify your ${BRAND.name} account`,
    text: `Hi ${name},\n\nVerify your email: ${link}\n\nThis link expires in 24 hours.\n\n— ${BRAND.name}`,
    html: `<p>Hi ${safeName},</p><p>Confirm your ${BRAND.name} account:</p><p><a href="${safeLink}">Verify email</a></p><p>This link expires in 24 hours.</p>`,
  });
}

export async function sendPasswordResetCode(to: string, name: string, code: string) {
  const safeName = escapeHtml(name);
  const safeCode = escapeHtml(code);
  await sendMail({
    to,
    subject: `Your ${BRAND.name} password reset code`,
    text: `Hi ${name},\n\nYour password reset code is: ${code}\n\nThis code expires in 10 minutes. If you did not request this, ignore the email.\n\n— ${BRAND.name}`,
    html: `<p>Hi ${safeName},</p><p>Use this code to reset your ${BRAND.name} password:</p><p style="font-size:28px;font-weight:700;letter-spacing:6px">${safeCode}</p><p>This code expires in 10 minutes. If you did not request this, ignore the email.</p>`,
  });
}


