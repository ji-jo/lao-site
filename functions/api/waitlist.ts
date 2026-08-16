import {
  cleanExpiredReservations, hashToken, json, normalizeEmail, normalizeUsername,
  randomToken, sendVerificationEmail, siteOrigin, validateEmail, validateUsername,
  type WaitlistEnv,
} from "../_lib/waitlist";

async function readPayload(request: Request) {
  if (request.headers.get("content-type")?.includes("application/json")) return request.json() as Promise<Record<string, unknown>>;
  const form = await request.formData();
  return Object.fromEntries(form.entries());
}

export async function onRequestPost(context: { request: Request; env: WaitlistEnv }) {
  const { request, env } = context;
  if (!env.WAITLIST_DB) return json({ code: "NOT_CONFIGURED", message: "The waitlist database isn’t configured yet." }, 503);

  try {
    const payload = await readPayload(request);
    if (String(payload.company || "").trim()) return json({ success: true });

    const username = normalizeUsername(payload.username);
    const email = normalizeEmail(payload.email);
    const description = String(payload.first_animation ?? payload.description ?? "").trim().slice(0, 280);
    const usernameError = validateUsername(username);
    if (usernameError) return json({ code: "USERNAME_INVALID", field: "username", message: usernameError }, 400);
    const emailError = await validateEmail(email);
    if (emailError) return json({ code: "EMAIL_INVALID", field: "email", message: emailError }, 400);

    await cleanExpiredReservations(env.WAITLIST_DB);
    const existingEmail = await env.WAITLIST_DB.prepare(
      "SELECT id, username, status FROM waitlist_entries WHERE lower(email) = lower(?) LIMIT 1",
    ).bind(email).first() as { id: string; username: string; status: string } | null;
    if (existingEmail) {
      const message = existingEmail.status === "confirmed"
        ? `You’re already on the waitlist as @${existingEmail.username}.`
        : `Check your inbox. @${existingEmail.username} is already being held for this email.`;
      return json({ code: "EMAIL_EXISTS", field: "email", id: existingEmail.id, status: existingEmail.status, username: existingEmail.username, message }, 409);
    }

    const existingUsername = await env.WAITLIST_DB.prepare(
      "SELECT 1 AS found FROM waitlist_entries WHERE lower(username) = lower(?) LIMIT 1",
    ).bind(username).first();
    if (existingUsername) return json({ code: "USERNAME_TAKEN", field: "username", message: "That username is taken. Try another." }, 409);

    const verificationToken = randomToken();
    const unsubscribeToken = randomToken();
    const verificationHash = await hashToken(verificationToken);
    const unsubscribeHash = await hashToken(unsubscribeToken);
    const id = crypto.randomUUID();

    await env.WAITLIST_DB.prepare(
      `INSERT INTO waitlist_entries
       (id, email, username, description, status, verification_token_hash, unsubscribe_token_hash, reservation_expires_at)
       VALUES (?, ?, ?, ?, 'pending', ?, ?, datetime('now', '+24 hours'))`,
    ).bind(id, email, username, description, verificationHash, unsubscribeHash).run();

    const confirmationUrl = `${siteOrigin(request, env)}/api/confirm?token=${encodeURIComponent(verificationToken)}`;
    try {
      await sendVerificationEmail(env, { email, username, confirmationUrl });
    } catch (error) {
      await env.WAITLIST_DB.prepare("DELETE FROM waitlist_entries WHERE id = ? AND status = 'pending'").bind(id).run();
      console.error(error);
      return json({ code: "EMAIL_DELIVERY_FAILED", message: "We couldn’t send the confirmation email. Try again in a moment." }, 502);
    }

    return json({
      success: true,
      status: "pending",
      id,
      username,
      email,
      message: `Check your inbox. We’re holding @${username} for 24 hours.`,
      ...(env.WAITLIST_DEBUG === "true" ? { confirmationUrl } : {}),
    }, 201);
  } catch (error) {
    console.error(error);
    const isUniqueConflict = String(error).includes("UNIQUE constraint failed");
    return json({ code: isUniqueConflict ? "RESERVATION_CONFLICT" : "SERVER_ERROR", message: isUniqueConflict ? "That email or username was just reserved. Try another." : "Something went wrong. Try again." }, isUniqueConflict ? 409 : 500);
  }
}
