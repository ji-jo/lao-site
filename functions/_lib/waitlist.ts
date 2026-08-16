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
  "oni", "official", "puchum", "root", "security",
  "staff", "support", "system", "team", "waitlist", "www",
]);

// Substring filter after leetspeak normalization. Terms are kept long enough
// to avoid common false positives (christ → christopher, ass → classic).
// The matched term is never shown back to the visitor.
const BLOCKED_USERNAME_TERMS = [
  // Curse / abusive
  "abuse", "asshole", "arsehole", "bastard", "bitch", "bollocks", "cunt",
  "dickhead", "dumbass", "faggot", "fck", "fuck", "fuk", "homo", "idiot",
  "jackass", "moron", "motherfuck", "nigga", "nigger", "pedo", "pedophile",
  "paedophile", "piss", "pussy", "rape", "rapist", "retard", "shit", "slut",
  "thot", "twat", "wanker", "whore",
  // Hate / derogatory / racial slurs
  "aryan", "beaner", "bigot", "chink", "cracker", "cuck", "darkie", "dago",
  "dyke", "gook", "hate", "heil", "hitler", "honky", "incel", "jihad", "kaffir",
  "kike", "kkk", "lynch", "mongoloid", "mulatto", "muzzie", "nazi", "negro",
  "racist", "raghead", "redskin", "spastic", "spic", "squaw", "terrorist",
  "towelhead", "tranny", "wetback", "wog", "wop", "zipperhead",
  // Religion names and identifiers (not short stems like christ)
  "allah", "bible", "buddha", "buddhist", "buddhism", "catholicism", "catholic",
  "christianity", "christian", "hinduism", "hindu", "islam", "islamic", "jesus",
  "jewish", "judaism", "koran", "mohammed", "muhammad", "muslim", "protestant",
  "quran", "sikhism", "sikh",
];

function usernameModerationKey(username: string) {
  return username.toLowerCase()
    .replace(/[01345@$!]/g, (character) => ({
      "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "@": "a", "$": "s", "!": "i",
    })[character] || character)
    .replace(/[_-]/g, "");
}

const EMAIL_POLICY_MESSAGE = "We allow known and company email only.";

const KNOWN_MAIL_DOMAINS = new Set([
  "gmail.com", "googlemail.com", "outlook.com", "outlook.co.id", "hotmail.com",
  "hotmail.co.uk", "live.com", "msn.com", "yahoo.com", "yahoo.co.uk",
  "yahoo.co.jp", "ymail.com", "rocketmail.com", "icloud.com", "me.com", "mac.com",
  "proton.me", "protonmail.com", "hey.com", "fastmail.com", "aol.com",
  "zoho.com", "gmx.com", "gmx.net", "mail.com",
]);

// Static fallback only. temp-mail.org rotates mailbox domains (not @temp-mail.org),
// so validateEmail also loads their live domain list plus a public disposable blocklist.
const DISPOSABLE_MAIL_DOMAINS = new Set([
  "10minutemail.com", "10minutemail.net", "33mail.com", "any.pink", "bltiwd.com",
  "bwmyga.com", "chitthi.in", "dispostable.com", "emailfake.com", "emailondeck.com",
  "fakeinbox.com", "fexbox.org", "fexpost.com", "fextemp.com", "generator.email",
  "getnada.com", "gmeenramy.com", "guerrillamail.com", "guerrillamail.net",
  "guerrillamail.org", "lnovic.com", "maildrop.cc", "mailinator.com", "mailbox.in.ua",
  "mailto.plus", "mailnesia.com", "merepost.com", "mintemail.com", "moakt.com",
  "mohmal.com", "olipii.com", "ozsaip.com", "rover.info", "ruutukf.com",
  "sharklasers.com", "temp-mail.io", "temp-mail.org", "tempail.com", "tempmail.com",
  "tempmail.net", "tempmail.plus", "throwawaymail.com", "tmpeml.com", "tmpmail.net",
  "tmpmail.org", "trashmail.com", "yopmail.com", "yopmail.fr", "yopmail.net",
  "yzcalo.com",
]);

const TEMP_MAIL_ORG_DOMAINS_URL = "https://api.internal.temp-mail.io/api/v3/domains";
const DISPOSABLE_BLOCKLIST_URL =
  "https://raw.githubusercontent.com/disposable-email-domains/disposable-email-domains/master/disposable_email_blocklist.conf";

type DomainCache = { domains: Set<string>; expiresAt: number };

let tempMailOrgCache: DomainCache | null = null;
let disposableBlocklistCache: DomainCache | null = null;

function domainOrParentInSet(domain: string, list: Set<string>) {
  let current = domain;
  while (current.includes(".")) {
    if (list.has(current)) return true;
    current = current.slice(current.indexOf(".") + 1);
  }
  return list.has(current);
}

async function readEdgeCache(url: string) {
  try {
    return await caches.default.match(url);
  } catch {
    return undefined;
  }
}

async function writeEdgeCache(url: string, body: string, ttlSeconds: number) {
  try {
    await caches.default.put(url, new Response(body, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": `public, max-age=${ttlSeconds}`,
      },
    }));
  } catch {
    // Cache is unavailable in some local runtimes; in-memory cache still applies.
  }
}

async function loadDomainSet(url: string, ttlMs: number, parse: (body: string) => Set<string>) {
  const cachedResponse = await readEdgeCache(url);
  if (cachedResponse) {
    const domains = parse(await cachedResponse.text());
    if (domains.size) return domains;
  }

  const response = await fetch(url, {
    headers: {
      Accept: "application/json, text/plain",
      "User-Agent": "lao-waitlist/1.0",
    },
    signal: AbortSignal.timeout(2500),
  });
  if (!response.ok) throw new Error(`Lookup failed (${response.status})`);
  const body = await response.text();
  const domains = parse(body);
  if (domains.size) await writeEdgeCache(url, body, Math.ceil(ttlMs / 1000));
  return domains;
}

async function getTempMailOrgDomains() {
  if (tempMailOrgCache && tempMailOrgCache.expiresAt > Date.now()) return tempMailOrgCache.domains;
  try {
    const domains = await loadDomainSet(TEMP_MAIL_ORG_DOMAINS_URL, 60 * 60 * 1000, (body) => {
      const payload = JSON.parse(body) as { domains?: Array<{ name?: string }> };
      return new Set(
        (payload.domains ?? [])
          .map((item) => String(item.name || "").trim().toLowerCase())
          .filter(Boolean),
      );
    });
    tempMailOrgCache = { domains, expiresAt: Date.now() + 60 * 60 * 1000 };
    return domains;
  } catch {
    return tempMailOrgCache?.domains ?? new Set<string>();
  }
}

async function getDisposableBlocklist() {
  if (disposableBlocklistCache && disposableBlocklistCache.expiresAt > Date.now()) {
    return disposableBlocklistCache.domains;
  }
  try {
    const domains = await loadDomainSet(DISPOSABLE_BLOCKLIST_URL, 24 * 60 * 60 * 1000, (body) => {
      return new Set(
        body.split(/\r?\n/)
          .map((line) => line.trim().toLowerCase())
          .filter((line) => line && !line.startsWith("#")),
      );
    });
    disposableBlocklistCache = { domains, expiresAt: Date.now() + 24 * 60 * 60 * 1000 };
    return domains;
  } catch {
    return disposableBlocklistCache?.domains ?? new Set<string>();
  }
}

async function isDisposableDomain(domain: string) {
  if (domainOrParentInSet(domain, DISPOSABLE_MAIL_DOMAINS)) return true;
  const [tempMailOrgDomains, blocklist] = await Promise.all([
    getTempMailOrgDomains(),
    getDisposableBlocklist(),
  ]);
  return domainOrParentInSet(domain, tempMailOrgDomains) || domainOrParentInSet(domain, blocklist);
}

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
  if (domainOrParentInSet(domain, KNOWN_MAIL_DOMAINS)) return null;
  if (await isDisposableDomain(domain)) return EMAIL_POLICY_MESSAGE;

  try {
    const dnsResponse = await fetch(
      `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(domain)}&type=MX`,
      { headers: { Accept: "application/dns-json" } },
    );
    if (!dnsResponse.ok) throw new Error("DNS lookup failed");
    const dns = await dnsResponse.json() as { Status?: number; Answer?: Array<{ type?: number }> };
    if (dns.Status !== 0 || !dns.Answer?.some((answer) => answer.type === 15)) {
      return EMAIL_POLICY_MESSAGE;
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
