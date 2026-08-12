export interface WaitlistEnv {
  WAITLIST_DB: any;
  RESEND_API_KEY?: string;
  WAITLIST_FROM_EMAIL?: string;
  PUBLIC_SITE_URL?: string;
  WAITLIST_DEBUG?: string;
}

export const USERNAME_PATTERN = /^[a-z0-9_]{3,20}$/;

const RESERVED_USERNAMES = new Set([
  "admin", "administrator", "api", "billing", "contact", "cursor", "help",
  "diana", "jijo", "joji", "lao", "lao_so", "login", "moderator", "nik",
  "oni", "official", "root", "security",
  "staff", "support", "system", "team", "waitlist", "www",
]);

// This is a deliberately conservative first-pass filter. It blocks common
// abusive / hate slurs and their obvious leetspeak variants without exposing
// the matched term back to the visitor. A full production moderation service
// can be layered on later, but the database always applies this baseline.
const BLOCKED_USERNAME_TERMS = [
  "abuse", "aryan", "bastard", "bigot", "chink", "cracker", "cunt", "dyke",
  "faggot", "gook", "hate", "heil", "hitler", "homo", "jihad", "kkk", "kike",
  "lynch", "nazi", "negro", "pedo", "racist", "rape", "rapist", "retard",
  "slut", "spic", "terrorist", "tranny", "whore",
];

function usernameModerationKey(username: string) {
  return username.toLowerCase()
    .replace(/[01345@$!]/g, (character) => ({
      "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "@": "a", "$": "s", "!": "i",
    })[character] || character)
    .replace(/[_-]/g, "");
}

const KNOWN_MAIL_DOMAINS = new Set([
  "gmail.com", "googlemail.com", "outlook.com", "hotmail.com", "live.com",
  "msn.com", "yahoo.com", "ymail.com", "icloud.com", "me.com", "mac.com",
  "proton.me", "protonmail.com", "hey.com", "fastmail.com", "aol.com",
  "zoho.com", "gmx.com", "gmx.net", "mail.com",
]);

const DISPOSABLE_MAIL_DOMAINS = new Set([
  "10minutemail.com", "10minutemail.net", "33mail.com", "dispostable.com",
  "emailondeck.com", "fakeinbox.com", "getnada.com", "guerrillamail.com",
  "guerrillamail.net", "guerrillamail.org", "maildrop.cc", "mailinator.com",
  "mailnesia.com", "mintemail.com", "moakt.com", "mohmal.com", "sharklasers.com",
  "temp-mail.org", "tempail.com", "tempmail.com", "tempmail.net", "throwawaymail.com",
  "trashmail.com", "yopmail.com", "yopmail.fr", "yopmail.net",
]);

export function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

export function normalizeUsername(value: unknown) {
  return String(value ?? "").trim().replace(/^@+/, "").toLowerCase();
}

export function validateUsername(username: string) {
  if (!USERNAME_PATTERN.test(username)) {
    return "Use 3–20 letters, numbers, or underscores.";
  }
  if (RESERVED_USERNAMES.has(username)) {
    return "That username is reserved. Try another.";
  }
  const moderationKey = usernameModerationKey(username);
  if (BLOCKED_USERNAME_TERMS.some((term) => moderationKey.includes(term))) {
    return "Choose a different username.";
  }
  return null;
}

export function normalizeEmail(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

export async function validateEmail(email: string) {
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return "Enter a valid email address.";
  }

  const domain = email.split("@").pop()!;
  if (DISPOSABLE_MAIL_DOMAINS.has(domain) || [...DISPOSABLE_MAIL_DOMAINS].some((item) => domain.endsWith(`.${item}`))) {
    return "Temporary email addresses aren’t accepted. Use your regular email.";
  }
  if (KNOWN_MAIL_DOMAINS.has(domain)) return null;

  try {
    const dnsResponse = await fetch(
      `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(domain)}&type=MX`,
      { headers: { Accept: "application/dns-json" } },
    );
    if (!dnsResponse.ok) throw new Error("DNS lookup failed");
    const dns = await dnsResponse.json() as { Status?: number; Answer?: Array<{ type?: number }> };
    if (dns.Status !== 0 || !dns.Answer?.some((answer) => answer.type === 15)) {
      return "Use an email from a real mail provider or business domain.";
    }
  } catch {
    return "We couldn’t verify that email domain. Try again in a moment.";
  }

  return null;
}

export function cleanExpiredReservations(db: any) {
  return db.prepare(
    `DELETE FROM waitlist_entries
     WHERE status = 'pending'
       AND reservation_expires_at IS NOT NULL
       AND reservation_expires_at <= datetime('now')`,
  ).run();
}

export function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function hashToken(token: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function siteOrigin(request: Request, env: WaitlistEnv) {
  return (env.PUBLIC_SITE_URL || new URL(request.url).origin).replace(/\/$/, "");
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
  })[character]!);
}

async function sendEmail(env: WaitlistEnv, payload: { to: string; subject: string; html: string; text: string }) {
  if (!env.RESEND_API_KEY) {
    if (env.WAITLIST_DEBUG === "true") return;
    throw new Error("RESEND_API_KEY is not configured");
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: env.WAITLIST_FROM_EMAIL || "LAO <waitlist@lao.lt>",
      to: [payload.to],
      subject: payload.subject,
      html: payload.html,
      text: payload.text,
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Email delivery failed (${response.status}): ${detail.slice(0, 160)}`);
  }
}

export function sendVerificationEmail(env: WaitlistEnv, details: { email: string; username: string; confirmationUrl: string }) {
  const username = escapeHtml(details.username);
  const url = escapeHtml(details.confirmationUrl);
  return sendEmail(env, {
    to: details.email,
    subject: `Confirm @${details.username} for LAO`,
    text: `Confirm your email to reserve @${details.username} on the LAO waitlist. This link expires in 24 hours: ${details.confirmationUrl}`,
    html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;padding:32px;color:#171717"><p style="font:12px monospace;letter-spacing:.14em">LAO WAITLIST</p><h1 style="font:40px Georgia,serif;margin:32px 0 12px">Make @${username} yours.</h1><p style="font-size:17px;line-height:1.6">Confirm your email within 24 hours. Then the username is locked and you’re officially on the waitlist.</p><a href="${url}" style="display:inline-block;margin-top:20px;padding:15px 24px;border-radius:999px;background:#111;color:#fff;text-decoration:none;font:13px monospace;letter-spacing:.08em">CONFIRM @${username}</a><p style="margin-top:28px;color:#687080;font-size:13px;line-height:1.5">If you didn’t request this, ignore this email and the reservation will expire.</p></div>`,
  });
}

export function sendWelcomeEmail(env: WaitlistEnv, details: { email: string; username: string; unsubscribeUrl: string }) {
  const username = escapeHtml(details.username);
  const unsubscribeUrl = escapeHtml(details.unsubscribeUrl);
  return sendEmail(env, {
    to: details.email,
    subject: `@${details.username} is yours — you’re on the LAO waitlist`,
    text: `It’s yours. @${details.username} is locked and you’re on the LAO waitlist. We’ll email you when early access is ready. Leave the list: ${details.unsubscribeUrl}`,
    html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;padding:32px;color:#171717"><p style="font:12px monospace;letter-spacing:.14em">LAO WAITLIST</p><h1 style="font:44px Georgia,serif;margin:32px 0 12px">It’s yours.</h1><p style="font-size:18px;line-height:1.6"><strong>@${username}</strong> is locked. You’re on the LAO waitlist, and we’ll email you when early access is ready.</p><p style="margin-top:32px;color:#687080;font-size:13px"><a href="${unsubscribeUrl}" style="color:#687080">Leave the waitlist</a></p></div>`,
  });
}
