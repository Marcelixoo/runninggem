# Architecture and implementation decisions

## v0.1

Dependency-free browser ES modules, CSS, semantic HTML and a small Node static development server. This keeps the first iteration runnable without package installation and avoids committing to an application framework before the pilot's requirements are clearer.

`model.js` owns the workout fixture and pure date/summary helpers. `app.js` renders views and stores explicit per-workout feedback. `styles.css` owns the visual system. All user-provided note content is HTML-escaped before rendering.

Browser persistence key: `runninggem.logs.v1`. Stored shape:

```json
{
  "strength-30": {
    "completed": true,
    "effort": 5,
    "note": "Felt steady today."
  }
}
```

Notes are local to the current browser and origin. No synchronization, backup, user identity or server API exists. Invalid stored records are ignored. Saving failure is surfaced to the athlete. This is unsuitable for real multi-athlete data or sensitive training notes until a protected backend is implemented.

Dates use UTC noon for fixture arithmetic and explicit UTC formatting so host timezone/DST does not shift the displayed calendar date. The application date is intentionally fixed in the sample; production needs an athlete timezone and a clock abstraction.

The displayed historical volume bars and personal bests are illustrative, not inferred from the fixture. Current-week/month totals and completion are calculated. A production version needs raw activity imports, deduplication, planned/completed activity linking, units, timezone rules and handling for warm-up/cool-down/multiple files.

## Integration direction

Keep the future internal workout representation independent of TrainingPeaks. Treat device providers as adapters. Completed-activity ingestion and structured-workout export are separate flows with different permissions and failure modes. Do not build on private endpoint scraping.

Suggested next architecture: relational workout, assignment, activity and feedback tables; coach-to-athlete authorization; a small API; idempotent background import; provider token encryption; explicit sync status and retries. Choose framework and hosting after confirming integration scope and pilot needs.

## Verification

`npm run check` checks JavaScript syntax. `npm test` covers week boundaries, timezone-safe date arithmetic, completion overrides, summary consistency and corrupt storage. Browser QA should cover the three tabs, week navigation, modal focus/escape, feedback persistence, chart period switching and narrow-width layout.

The local server is a development convenience, not a production auth boundary. Do not expose the checkout server for real athlete data. Serve only application assets with a production host when deploying.

## v0.2 integration pilot

The static athlete UI now calls a Node serverless API for owner authentication, Strava OAuth/refresh/import, history and saved plans. A Python serverless adapter uses python-garminconnect for login/MFA, history/health imports, structured running workout upload and date scheduling.

Upstash Redis persists encrypted provider credentials, normalized activities, health and plans. AES-256-GCM ciphertext is interoperable between Node and Python; a 32-byte environment key stays server-side. No Vercel variable is used as mutable athlete storage. The owner session uses an HMAC-signed HttpOnly cookie; mutations enforce the configured origin. OAuth uses a short-lived signed state cookie and single-use Redis nonce.

Provider imports use locks and source IDs. Export stores an upload receipt before scheduling and blocks ambiguous retries. Provider/network errors are redacted; no raw provider response, credential or health trace is logged. This is deliberately single-owner, with a fixed Redis namespace per isolated deployment database. Multi-athlete authorization requires a separate identity model.

## v0.3 Next.js migration

Next.js 16 App Router serves the three athlete pages with React client components inside a server-rendered shared layout. TypeScript interfaces define sessions, activity history, health records, feedback, connection state and workout steps. React owns rendering, form state, dialogs and client-side navigation; the previous document-level listeners and innerHTML rendering were removed.

The TypeScript sync route accepts Web Request/Response objects and adapts the existing tested provider service. It rejects oversized/malformed JSON and lets Next.js reject unsupported HTTP methods. Model, crypto and provider utilities retain their tested JavaScript implementations; pure model declaration files provide typed contracts to the React application. The Python Garmin function remains separate at the root API directory.

Builds use the Next.js preset and a committed npm lockfile. GitHub main is the deployment path. Vercel variables and existing Redis records retain their names and formats, so reconnecting providers is not required solely because of the framework migration.

## Social authentication and provider consent

A Strava authorization callback now creates a version-2 signed athlete session instead of accepting a shared password. The same grant stores activity access. AsyncLocalStorage binds each Node request to a validated Strava subject; Python uses a request-local ContextVar for the same namespace. Private tokens, history, plans, locks and delivery receipts are separated by that identity. The old shared pilot session and namespace are not accepted or implicitly migrated.

OAuth state is random, browser-bound, provider-bound, single use and time limited. Pending records and Garmin PKCE verifiers are encrypted. A provider link is bound to the athlete signed in when the flow started, and a changed session is rejected before exchanging credentials. Token responses stay server-side. Garmin’s stable user ID has a binding to one Strava account, preventing silent reassignment across app users. Multiple Set-Cookie headers are preserved by the Next.js route.

Official Garmin authorization and unofficial Garmin sync are separate credentials and capabilities. The former uses developer OAuth and exposes granted permissions; the latter remains an opt-in Python experiment and is not automatically enabled by official consent. Official data-plane adapters remain contingent on registered API products and schemas.
