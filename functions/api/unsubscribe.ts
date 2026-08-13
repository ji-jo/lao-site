import { type WaitlistEnv } from "../_lib/waitlist";

export async function onRequestGet(context: { request: Request; env: WaitlistEnv }) {
  const url = new URL(context.request.url);
  const id = url.searchParams.get("id") || "";
  const tokenHash = url.searchParams.get("token") || "";
  let changed = false;

  if (context.env.WAITLIST_DB && id && tokenHash) {
    const result = await context.env.WAITLIST_DB.prepare(
      `UPDATE waitlist_entries SET status = 'unsubscribed', unsubscribed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND unsubscribe_token_hash = ? AND status != 'unsubscribed'`,
    ).bind(id, tokenHash).run();
    changed = Boolean(result.meta?.changes);
  }

  return new Response(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>LAO waitlist</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0b0b0b;color:#f4f1eb;font-family:Arial,sans-serif}.card{text-align:center;padding:32px;max-width:520px}h1{font:48px Georgia,serif;margin:0 0 16px}p{color:#aeb5c1;line-height:1.6}a{color:#fff}</style></head><body><main class="card"><h1>${changed ? "You’re off the list." : "This link is no longer active."}</h1><p>${changed ? "We won’t send you waitlist updates." : "You may already have left the waitlist."}</p><a href="/">Back to LAO</a></main></body></html>`, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}
