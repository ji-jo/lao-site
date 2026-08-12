import { hashToken, sendWelcomeEmail, siteOrigin, type WaitlistEnv } from "../_lib/waitlist";

export async function onRequestGet(context: { request: Request; env: WaitlistEnv }) {
  const { request, env } = context;
  const origin = siteOrigin(request, env);
  const token = new URL(request.url).searchParams.get("token") || "";
  if (!env.WAITLIST_DB || !token) return Response.redirect(`${origin}/?waitlist=invalid#waitlist`, 302);

  const tokenHash = await hashToken(token);
  const entry = await env.WAITLIST_DB.prepare(
    `SELECT id, email, username, unsubscribe_token_hash,
            reservation_expires_at > datetime('now') AS reservation_valid
     FROM waitlist_entries
     WHERE verification_token_hash = ? AND status = 'pending' LIMIT 1`,
  ).bind(tokenHash).first() as { id: string; email: string; username: string; unsubscribe_token_hash: string; reservation_valid: number } | null;

  if (!entry || !entry.reservation_valid) {
    if (entry) await env.WAITLIST_DB.prepare("DELETE FROM waitlist_entries WHERE id = ? AND status = 'pending'").bind(entry.id).run();
    return Response.redirect(`${origin}/?waitlist=expired#waitlist`, 302);
  }

  await env.WAITLIST_DB.prepare(
    `UPDATE waitlist_entries
     SET status = 'confirmed', confirmed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP,
         verification_token_hash = NULL, reservation_expires_at = NULL
     WHERE id = ? AND status = 'pending'`,
  ).bind(entry.id).run();

  const unsubscribeUrl = `${origin}/api/unsubscribe?id=${encodeURIComponent(entry.id)}&token=${encodeURIComponent(entry.unsubscribe_token_hash)}`;
  try {
    await sendWelcomeEmail(env, { email: entry.email, username: entry.username, unsubscribeUrl });
  } catch (error) {
    console.error("Waitlist confirmation succeeded, but welcome email failed", error);
  }

  return Response.redirect(`${origin}/?waitlist=confirmed&username=${encodeURIComponent(entry.username)}#waitlist`, 302);
}
