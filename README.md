# Runninggem

**Your training, in focus.** A small, athlete-first running app pilot.

Working product name: **Runninggem**. Repository slug: `runninggem`.

## Run locally

Node.js 22+ and Python 3.12+ for the Garmin adapter.

```sh
npm ci
npm run dev
# http://localhost:3000
```

`next dev` serves the React UI and TypeScript sync route. The root Python function is deployed by Vercel; use `vercel dev` to exercise both runtimes locally.

```sh
npm run check
npm test
pip install -r requirements.txt
npm run test:python
npm run build
npm run test:web
```

## Social sign-in and provider consent

Continue with Strava replaces the shared pilot password. OAuth consent creates a signed athlete session; imported history, credentials, workouts and delivery receipts are stored in separate per-athlete namespaces. Garmin authorization uses its official OAuth 2.0 PKCE consent flow and stores the granted permissions. Garmin credentials are never entered into Runninggem for this flow.

Provider client credentials, the session/encryption key and persistent Redis are still required. The official Garmin OAuth grant is separate from the existing unofficial Python sync adapter: it does not make private Garmin endpoints accept official developer tokens. Official data delivery remains pending the registered application's API contracts/access. The optional experimental adapter is disabled by default and can be enabled explicitly. Apple Health remains excluded.

## Next.js migration (v0.3)

Next.js App Router + React + TypeScript own the app shell, Today (`/`), Calendar (`/calendar`), Performance (`/performance`), workout feedback, connections, history and workout builder. The TypeScript `/api/sync` route exposes the existing tested provider service; reusable model, encryption and storage utilities remain JavaScript with typed model contracts. Garmin stays in `api/garmin.py`.

GitHub `main` is the deployment source for Vercel. The production build must pass before publishing. No manual Drop deployments are used for this version.

## Integration pilot (v0.2)

Strava OAuth import, experimental Garmin login/MFA and history/health import, encrypted server-side storage, duplicate detection, and a timed running-workout builder with pace/HR targets and Garmin calendar delivery are implemented. Connection controls stay within Today, Calendar, and Performance. Apple Health is excluded.

See [deployment and account setup](docs/deployment.md) for required Vercel variables and provider configuration. Live provider access is not yet verified. Provider-backed data is isolated by Strava athlete identity; broader paid-service identity and account-management work remains out of scope.

## Original athlete view

- **Today** — today's session, weekly progress, next workout.
- **Calendar** — previous/next week navigation, rest days, completed and scheduled sessions.
- **Performance** — week/month volume, time, session totals, illustrative historical chart and personal bests.
- **Session details** — structured workout steps, effort rating, notes, and completion status.
- Responsive mobile/desktop layouts; keyboard-accessible navigation and native modal dialog.
- Completion and notes persist in browser localStorage. Current-period totals derive from the same workout fixture and completion records.

This is an interactive prototype, **not a production paid service**. The original training plan and record cards are synthetic. Real imported history is shown separately. Billing, coach tools and activity recording are not implemented. The demo date is frozen at October 30, 2026; historical chart bars are illustrative. No uploaded screenshots or personal activity files are committed.

Runna screenshots supplied by the project owner inform the three-tab information architecture, workout cards, calendar agenda and performance summaries. Runninggem uses its own visual treatment and code; it does not include Runna branding, icons, source code or proprietary assets.

## Structure

- `app/`: server-rendered pages, shared layout, TypeScript sync API route.
- `components/`: React athlete views and connection/workout workflows.
- `lib/`: shared types, authentication, encrypted storage and provider service.
- `src/`: styles, fixtures and portable model helpers.
- `api/garmin.py`: experimental Python Garmin adapter.
- `tests/`: model, security and provider regression tests.
- `checks/web.mjs`: production HTTP checks against the built Next.js server.
- `docs/`: research, pilot plan and deployment guidance.

## Documentation

- [Research and sources](docs/research.md)
- [Paid pilot plan](docs/pilot.md)
- [Product brief and next steps](docs/product.md)
- [Architecture](docs/architecture.md)

## Project status

Bootstrapped October 30, 2026. First milestone: validate athlete usability before adding coach workflows. Research hypotheses and infrastructure budgets are explicitly assumptions, not company financial disclosures.

## Rights

Licensed under the MIT license already selected for this repository; see LICENSE. Third-party trademarks belong to their respective owners. System fonts are available as fallback if the optional Google Fonts stylesheet is unavailable.
