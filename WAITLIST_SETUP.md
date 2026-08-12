# LAO waitlist setup

The waitlist runs on Cloudflare Pages Functions + D1. Resend sends the confirmation and locked-username emails.

## 1. Create and migrate D1

```sh
npx wrangler d1 create lao-waitlist
```

Add the returned `[[d1_databases]]` block to `wrangler.toml` with the binding name `WAITLIST_DB`, then run:

```sh
npx wrangler d1 migrations apply lao-waitlist --remote
```

If the Pages project is configured in the Cloudflare dashboard instead, bind the same database as `WAITLIST_DB` under **Settings → Functions → D1 database bindings**.

## 2. Configure email

Verify `lao.lt` in Resend and add the DNS records it provides. In Cloudflare Pages, add this encrypted secret:

```sh
npx wrangler pages secret put RESEND_API_KEY
```

`PUBLIC_SITE_URL` and `WAITLIST_FROM_EMAIL` are already declared in `wrangler.toml`. For local Pages testing, copy `.dev.vars.example` to `.dev.vars` and add a real test key. `.dev.vars` is git-ignored.

## 3. Deploy

Build and deploy `dist` to Cloudflare Pages. Keep `functions/` in the project root so Pages deploys the API routes with the site.

## Flow

1. Username availability is checked when the visitor leaves the field.
2. Submission holds the username for 24 hours and emails a confirmation link.
3. Clicking the link permanently locks the username, adds the confirmed waitlist entry, and sends the “It’s yours” email.
4. The email’s leave link marks the entry unsubscribed; records are retained so a username cannot silently be reclaimed.

Known disposable domains are rejected. Common consumer domains are accepted directly; custom domains must publish MX records. The confirmation click—not the domain check—is what proves email ownership.
