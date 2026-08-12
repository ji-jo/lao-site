import { cleanExpiredReservations, json, normalizeUsername, validateUsername, type WaitlistEnv } from "../_lib/waitlist";

export async function onRequestGet(context: { request: Request; env: WaitlistEnv }) {
  const username = normalizeUsername(new URL(context.request.url).searchParams.get("username"));
  const validationMessage = validateUsername(username);
  if (validationMessage) {
    return json({ available: false, code: "USERNAME_INVALID", message: validationMessage }, 400);
  }
  if (!context.env.WAITLIST_DB) {
    return json({ available: false, code: "NOT_CONFIGURED", message: "Username checking isn’t configured yet." }, 503);
  }

  await cleanExpiredReservations(context.env.WAITLIST_DB);
  const match = await context.env.WAITLIST_DB.prepare(
    "SELECT 1 AS found FROM waitlist_entries WHERE lower(username) = lower(?) LIMIT 1",
  ).bind(username).first();

  if (match) {
    return json({ available: false, code: "USERNAME_TAKEN", message: "That username is taken. Try another." }, 409);
  }
  return json({ available: true, username, message: `@${username} is available.` });
}
