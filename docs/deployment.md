# Deployment, social sign-in and provider authorization

Vercel project: runninggem (`prj_SxuZRDsNj5ZZtNWXzNWyiE8pRJ7Z`), team `team_51pKEZXqDadKaobNZil2P2Ba`. GitHub main triggers the production deployment; feature PRs get previews where enabled. Use Next.js, Node 22, `npm ci`, `npm run build` and the default Next.js output. Root `api/garmin.py` is the optional Python function.

## No pilot password

Continue with Strava signs the athlete into Runninggem and requests profile/activity authorization. PILOT_PASSWORD is no longer used. Users do not need a separate Runninggem password.

Set these in Vercel Settings → Environment Variables and redeploy. Use Secret type for keys, tokens and client secrets. Use separate stores/credentials for production and previews.

| Variable | Purpose |
| --- | --- |
| APP_URL | Stable exact HTTPS app origin, no trailing slash |
| SESSION_SECRET | 32 cryptographically random bytes encoded as 64 hexadecimal characters; encrypts provider/user records and signs sessions |
| UPSTASH_REDIS_REST_URL | Persistent Redis REST endpoint |
| UPSTASH_REDIS_REST_TOKEN | Redis credential |
| STRAVA_CLIENT_ID | Strava application ID |
| STRAVA_CLIENT_SECRET | Strava application secret |
| GARMIN_CLIENT_ID | Official Garmin developer application client ID |
| GARMIN_CLIENT_SECRET | Official Garmin developer application secret |
| ENABLE_EXPERIMENTAL_GARMIN | Optional, false/unset by default; true explicitly enables the unofficial Python adapter |

Changing SESSION_SECRET invalidates sessions and makes existing encrypted records unreadable. Preserve it across deployments.

Vercel's Upstash integration may supply `KV_REST_API_URL` and `KV_REST_API_TOKEN` instead. Both the Next.js backend and optional Python adapter accept that complete pair; a complete `UPSTASH_REDIS_REST_*` pair takes precedence. Credentials from different pairs are never mixed. `KV_REST_API_READ_ONLY_TOKEN` is insufficient because OAuth needs to write and consume one-time state. Set production `APP_URL` to `https://run.criticalmars.me`; configuration changes require a new deployment.

## Strava app registration

Register Runninggem at https://www.strava.com/settings/api. Configure its authorization callback domain to the deployed hostname. Runninggem uses `APP_URL/api/sync?route=strava-callback`. Users follow Continue with Strava and approve activity access. The web flow lets Strava handle login and consent; opening the native Strava app is not guaranteed on every mobile browser.

Request scopes: read and activity:read_all. Denied activity access does not establish a session. The identity is taken from the server-side token exchange response, never from query parameters. Sign out before switching Strava accounts.

## Garmin official consent

Apply/register through https://developer.garmin.com/gc-developer-program/overview/ and configure the application's redirect URI as `APP_URL/api/sync?route=garmin-callback`. App registration and API access are required; a user’s approval cannot replace the application's client credentials.

After Strava sign-in, Authorize Garmin Connect redirects the athlete to https://connect.garmin.com/oauth2Confirm. Runninggem uses SHA-256 PKCE, single-use state, the signed browser nonce and a server-only encrypted verifier. After consent it exchanges the code, reads the Garmin user ID and granted permissions, and stores encrypted tokens. Revoke Garmin access calls Garmin’s registration deletion endpoint.

This is an authorization implementation, not a conversion of the existing unofficial sync adapter to the official APIs. Official activity/health ingestion, callbacks and structured-workout delivery require the registered app's API schemas and enabled products. The UI explicitly distinguishes an authorized official account from an operational experimental sync connection. No official OAuth token is sent to the private Python client. Garmin Starter access may not include historical backfill; verify the plan/access against the pilot's history requirements.

Official OAuth reference: https://developerportal.garmin.com/sites/default/files/OAuth2PKCE.pdf. User identity and permissions endpoints follow that specification. Permission lists are displayed as granted rather than assuming every product was approved.

## Optional experimental Garmin adapter

When explicitly enabled, the preexisting unofficial python-garminconnect adapter retains login/MFA, paginated activity import, seven recent health summaries and workout upload/scheduling. It is separate from official consent, clearly marked experimental, and disabled by default. Its credentials go through the backend to Garmin; session/MFA state is encrypted, temporary MFA state expires, and plaintext credentials are not retained.

## Data isolation and migration

Version-2 signed sessions identify the verified Strava athlete. Redis keys use `runninggem:users:strava:<id>:` and never the old shared `runninggem:pilot:` prefix. Existing shared-pilot sessions are rejected. Old pilot records are not automatically attributed to the first social-login user; reconnect and reimport instead. Keep old records for a deliberate owner-reviewed migration or deletion.

A Garmin identity may be linked to one Strava athlete at a time. Revoke it from the original Runninggem account before linking another. Sign out clears the browser's app session; disconnect/revoke removes provider access. These are different actions.

## Verification

Run `npm run check`, `npm test`, `npm run test:python`, `npm run build` and `npm run test:web`. OAuth tests mock the providers and Redis, checking replay/CSRF defenses, consent denial, PKCE, provider identities, permission storage, revocation and concurrent user-data isolation. Production HTTP checks verify pages and the Next.js API boundaries. Live OAuth, device receipt and new React interactions require verification after app credentials and storage are provisioned.
