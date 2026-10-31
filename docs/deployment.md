# Deployment and account setup

## Deploy

Vercel project: `runninggem` (`prj_SxuZRDsNj5ZZtNWXzNWyiE8pRJ7Z`). Team: `team_51pKEZXqDadKaobNZil2P2Ba`.

Use the Next.js framework preset, Node.js 22, `npm ci`, `npm run build`, and the default Next.js output directory (no public override). The App Router serves `/`, `/calendar`, `/performance`, and `/api/sync`; Vercel also deploys root `api/garmin.py`. Python dependencies are in requirements.txt. Push to GitHub main to trigger the linked project autodeploy. Secrets stay in server modules and environment variables; no public-prefixed secret variables are used.

Vercel team authorization and GitHub write access are granted, and the repository is linked. This version is proposed on a feature branch; merging into main triggers the production autodeploy. Live provider connectivity has not yet been verified.

## Environment variables

Set in Vercel Settings → Environment Variables; redeploy after changes. Use separate production/preview stores and keys. Never paste credentials into chat or commit them.

| Variable | Purpose | Type |
| --- | --- | --- |
| APP_URL | Exact origin, no trailing slash, e.g. the deployed HTTPS origin | Config |
| SESSION_SECRET | 32 cryptographically random bytes, hex encoded (64 characters) | Secret |
| PILOT_PASSWORD | Long random owner-only pilot password; enter it in the app to unlock | Secret |
| UPSTASH_REDIS_REST_URL | Persistent Redis REST endpoint, provision through Vercel Marketplace | Config |
| UPSTASH_REDIS_REST_TOKEN | Redis credential | Secret |
| STRAVA_CLIENT_ID | Registered Strava application ID | Config |
| STRAVA_CLIENT_SECRET | Registered Strava application secret | Secret |

Do not rotate SESSION_SECRET casually: it encrypts stored provider tokens, history, health and plans. Rotation requires reconnecting providers and reimporting/recreating encrypted records; otherwise the old records are unreadable.

## First connection

1. Connect an Upstash Redis database through Vercel Marketplace to this project.
2. Set the application variables above directly in Vercel and redeploy.
3. Register a Strava application at https://www.strava.com/settings/api and set its authorization callback domain to the deployed hostname. The actual callback route is `/api/sync?route=strava-callback` (handled by the Next.js route).
4. Open Performance, unlock the owner pilot, and connect Strava. Approve activity access. Import latest and load older history one page at a time (100 activities/page).
5. Connect Garmin with account credentials and MFA if requested. Credentials are sent to Garmin via the backend and not retained. The encrypted session persists in Redis. Garmin is an unofficial adapter pinned to python-garminconnect 0.3.19.
6. Import Garmin activities and up to seven recent daily health summaries. Use older history paging for earlier activities.
7. In Calendar, create a running session, add timed steps and optional pace/HR ranges, review, save, then send to Garmin Connect. Sync the compatible watch through Garmin Connect afterward.

## Limits

This is a single-owner integration pilot, not multi-athlete SaaS. Sessions use a signed HttpOnly SameSite cookie and a pilot password, with Redis-backed login attempt throttling and exact-origin checks for mutations. Use HTTPS.

Real imports are shown separately from the synthetic sample plan and performance records. Imported history is encrypted server-side and not put into localStorage; sample feedback remains browser-local. Account disconnect clears that provider’s local imports and session. Strava disconnect also calls Strava deauthorization. Garmin logout removes local session access only; revoke sessions through Garmin account settings if required.

Imports are manual, bounded, and idempotent by source ID. Cross-provider duplicate detection uses sport, start time within 60 seconds, distance within 1%/50m, and duration within 3%/30s. This is a heuristic: pause-time differences may leave duplicates, and very similar simultaneous activities may merge. Raw provider identities remain in the stored records. Reconnecting a different provider account requires disconnecting the old account first.

Garmin delivery uses a payload/date hash and persistent upload receipts to avoid duplicate workouts. Ambiguous network failures are marked for manual verification rather than blindly retried. Workout scheduling success means Garmin Connect accepted it, not that the watch received it. Unofficial Garmin endpoints can change or block cloud sessions.

## Local work and verification

`npm ci` then `npm run dev` runs Next.js, React and the TypeScript sync route. `npm start` serves the production build. Use Vercel CLI `vercel dev` to also run Python routes. Install `requirements.txt` for `npm run test:python`.

`npm run check`, `npm test`, `npm run test:python`, `npm run build`, `npm run test:web`. All three pages and API error/HTTP boundaries are checked against a real production Next.js server. The provider tests use mocked remote responses and a fake Redis; they do not prove live account connectivity. Live OAuth consent, Redis connectivity, Garmin MFA and watch receipt remain to be checked after provisioning. The available cloud browser could not reach the local preview (connection refused), so the new UI has not been browser-verified.
