# RemDec Judge Call — Render edition

A standalone version of the tournament judge-call app, adapted for a Node.js web service and PostgreSQL. This package is source code, not a deployed service.

Included: player QR pages, the practice table picker, staff queues, claim/release/resolve controls, round clock, public tournament screen, announcements, QR sign printing, copyable invitations, and links that fill in staff keys. BCP time remains manually matched, not automatically synchronized. SMS controls remain removed.

## Deployment

1. Create a separate **private** GitHub repository for this code (suggested name: `remdec-judge-call`). Upload the contents of this folder at the repository root, including package.json and package-lock.json. Do not upload the outer ZIP as the only file. Do not use the scheduler repository.
2. Grant the ChatGPT GitHub connection and Render access to this repository.
3. Create a Node web service in the confirmed RemDec Creations Render workspace, region Oregon, branch main.
4. Build command: `npm ci --include=dev && npm run build`
5. Start command: `npm start`
6. Health-check path: `/healthz`
7. Configure the environment variables below, then deploy. Review Render's current plan limits before running a live tournament. No plan or resource has been provisioned by this package.

## Environment variables

| Variable | Purpose |
| --- | --- |
| DATABASE_URL | PostgreSQL connection string, configured privately in Render. For an external provider use its documented TLS URL. |
| SESSION_SECRET | A unique random secret of at least 32 characters; keep stable across redeploys. Generate with `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`. |
| ADMIN_USERNAME | Organizer account name; keep separate from the practice account. |
| ADMIN_PASSWORD | Organizer password; configure privately, not in this repository. |
| TEST_ADMIN_USERNAME | Set to TestAdmin to preserve the practice account name. |
| TEST_ADMIN_PASSWORD | Set privately to the agreed practice password; blank disables practice login. |
| TEST_STAFF_KEY | Optional fixed practice access code. If omitted, derived from the session secret and practice password. |
| APP_ORIGIN | The actual service's public HTTPS origin, without a trailing slash. Set after Render supplies its URL. |
| NODE_ENV | Set to production for secure organizer-session cookies. |
| PORT | Render supplies this; the app defaults to 10000 and binds to 0.0.0.0. |

The app creates only `judging_events`, `judging_calls`, and `judging_login_attempts` tables and related indexes. Use a separate database or provision dedicated credentials where possible. Scheduler database credentials have not been read, copied, or changed. Do not paste database passwords into chat or commit a populated .env file.

## Organizer versus judge access

The Render version uses its own organizer login configured by ADMIN_USERNAME and ADMIN_PASSWORD; it does not depend on ChatGPT authentication. Successful organizer sign-in issues an 8-hour signed HttpOnly session cookie. Only the organizer can create their own events and rotate their event keys. Shared staff access keys can manage judge calls and public screen controls for that event. The test account opens only the isolated 50-table practice event.

## Data and existing links

This package starts with a fresh PostgreSQL data store. It does **not** contain the existing hosted app's database, accounts, real staff keys, or event history. Existing invitations and QR signs still point to the original host. Do not switch a live event until the Render service is verified and event data has either been migrated or recreated deliberately. Nothing in this package changes the current live website or the scheduler.

## Website address

Render supplies a public service address after deployment. This package does not configure Bluehost DNS or the Shopify `/judging` shortcut. Those are separate steps after a working deployment. No promised custom URL is live merely because this ZIP exists.

## Local verification

Use Node.js 22.13 or newer (tested here with Node 24):

```
npm ci --include=dev
npm run build
npm test
```

Integration tests run against an embedded PostgreSQL engine (PGlite) using fixture-only credentials. They exercise the actual Express HTTP application, SQL adapter, organizer sessions, practice authentication, authorization, duplicate calls, single-claim behavior, request status, round clock concurrency, announcements, QR generation, persistence initialization, and malformed/cross-origin writes. The source builds successfully. Remote Render connectivity and deployment cannot be verified until the GitHub repository and a database connection are configured.

For local interactive use, set the required environment variables in your shell or an untracked .env file. Node 22 can load it using `node --env-file=.env server/start.mjs` after a build. Use NODE_ENV=development locally so HTTP session cookies work.

## Sign-in email notifications

Successful practice and organizer sign-ins can send a plain-text email through Resend. Failed logins and ordinary dashboard views do not send email. Test notices explicitly identify the shared test account. Normal notices include `ADMIN_EMAIL`, or `ADMIN_USERNAME` when it is already an email address. A username-only account without `ADMIN_EMAIL` is reported honestly as having no configured sign-in email; no arbitrary email supplied by the client is trusted.

Set `RESEND_API_KEY`, `LOGIN_NOTIFY_FROM` (an authorized Resend sender), and `LOGIN_NOTIFY_TO` in Render. Set `ADMIN_EMAIL` to the email belonging to the normal organizer account. Never commit these values. Resend sender/domain restrictions apply; production senders must be authorized with the provider.

`/healthz` reports whether notification configuration is present; this does not prove delivery. Test both successful login paths and check the recipient inbox and Render logs after setup. Sending has a five-second timeout; an email-provider failure is logged without credentials and does not block a valid login. These immediate notifications are best effort, with no durable retry queue.

## Public organizer accounts

Anyone can create an account at `/?view=signup` with an email address and a 12–128 character password. Registration signs them in; subsequent sign-ins use `/?view=login`. Passwords use salted scrypt hashes stored in the dedicated `judging_users` table. Registration and login have independent per-IP rate limits. Accounts have stable IDs and can list and manage only the events they own, while staff keys continue to grant judge access. Existing configured organizer credentials remain supported for existing events.

Successful registration (which signs the user in) and subsequent sign-ins trigger the non-test usage notification to the configured owner recipient. Registered email addresses are not ownership-verified; notices state this explicitly. This feature does not send verification email to registrants, and does not include a password-reset flow. Do not treat a registered email address as verified identity.
