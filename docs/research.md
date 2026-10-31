# Training software opportunity research

Research memo date: October 30, 2026. This captures the initial research conversation, with facts separated from assumptions. Prices and API conditions require rechecking before commercial commitments.

## Decision

Test a small paid pilot alongside the founder's existing work. Athlete-only UI first. Avoid committing to a full TrainingPeaks replacement until coaches demonstrate willingness to migrate and pay.

Initial problem: training information feels cluttered. The athlete needs a clear answer to three questions: What do I do today? What is coming up? Am I making progress?

## Published pricing observed

| Offering | Published price observed | Primary source |
| --- | --- | --- |
| TrainingPeaks Premium athlete, monthly | US$19.95/month | [Athlete pricing](https://www.trainingpeaks.com/pricing/for-athletes/) |
| TrainingPeaks Premium athlete, annual | US$134.99/year | [Athlete pricing](https://www.trainingpeaks.com/pricing/for-athletes/) |
| Brazilian iOS recurring subscription listings | R$99.90/month; R$699.90/year | [Brazil App Store](https://apps.apple.com/br/app/trainingpeaks/id408047715) |
| Coach base, four Basic athlete accounts | US$21.99/month | [Coach pricing](https://www.trainingpeaks.com/pricing/for-coaches/) |
| Coach base, five or more Basic athlete accounts | US$54.99/month | [Coach pricing](https://www.trainingpeaks.com/pricing/for-coaches/) |
| Coach-funded Premium athletes | US$9 down to US$4.50/athlete/month by volume | [Coach pricing](https://www.trainingpeaks.com/pricing/for-coaches/) |
| Final Surge athlete | Free published personal account | [Pricing](https://www.finalsurge.com/pricing) |
| Final Surge coach, up to 100 athletes | US$39/month | [Pricing](https://www.finalsurge.com/pricing) |
| Intervals.icu Patreon supporter membership | US$4/month | [Membership](https://www.patreon.com/intervalsicu/membership) |

App Store listings contain multiple purchase options; actual offers vary. Do not double-count direct athlete and coach-funded subscriptions for one athlete. Low pricing alone is not differentiation because inexpensive and free alternatives exist.

## Source code and integrations

- [TrainingPeaks official GitHub](https://github.com/TrainingPeaks): public API documentation, OAuth sample and assorted supporting tools were found. No core app source code was identified. Public supporting repositories do not reveal the production architecture or cost structure.
- [TrainingPeaks API policy](https://help.trainingpeaks.com/hc/en-us/articles/234441128-TrainingPeaks-API): commercial application required; page excludes personal use. Approval, permissions, pricing and competitive use must be established before relying on it.
- [Partner API wiki](https://github.com/TrainingPeaks/PartnersAPI/wiki): inspect for integration feasibility, not as evidence that unrestricted API access is available.
- [OAuth example](https://github.com/TrainingPeaks/tp-public-api-auth): integration reference, not the product source.
- [GoldenCheetah source](https://github.com/GoldenCheetah/GoldenCheetah): useful reference for training models, file import and analytics. Repository labels the project GPL; inspect exact files and terms before incorporating code. No code has been copied into Runninggem.
- [Garmin developer overview](https://developer.garmin.com/gc-developer-program/overview/): personal access and business Starter/Enterprise access are documented. Starter includes Activity and Training APIs, but not historical data in the observed overview.
- [Garmin Training API](https://developer.garmin.com/gc-developer-program/enterprise/training-api/): publishing structured workouts to Garmin Connect is a distinct capability from importing completed activities.
- [Garmin FAQ](https://developer.garmin.com/gc-developer-program/enterprise/program-faq/): approvals and integration process. Confirm actual limits, commercial terms, permitted use and access in writing before promising sync.

## Ownership and financial evidence

[Garmin's July 22, 2026 announcement](https://investors.garmin.com/news-and-events/news/news-details/2026/Garmin-acquires-TrainingPeaks-and-TrainHeroic-leading-endurance-and-strength-training-platforms-for-athletes-and-coaches/default.aspx) states that Garmin acquired TrainingPeaks and TrainHeroic; 120 combined associates would join Garmin, and financial terms were not disclosed. This is combined headcount, not TrainingPeaks standalone staffing.

No verified standalone TrainingPeaks revenue, payroll, cloud bill, EBITDA or operating profit was established in the research. [Garmin's October 28, 2026 earnings release](https://investors.garmin.com/news-and-events/news/news-details/2026/Garmin-announces-third-quarter-2026-results/default.aspx) reports broader segments and cannot establish TrainingPeaks standalone margins.

Third-party estimates conflict and should not anchor valuation: [Apps Run The World](https://www.appsruntheworld.com/customers-database/customers/view/trainingpeaks-usa) claims US$10m revenue for 2024; [The5krunner](https://the5krunner.com/2026/07/22/garmin-trainingpeaks-acquisition-price/) models approximately US$36.5m for TrainingPeaks and TrainHeroic combined from assumed subscriber counts. Neither is an audited standalone result. Their scopes differ.

## Interpretation and hypotheses

1. Coaches may determine platform adoption for an entire roster. Validate through interviews; not established quantitatively here.
2. A cleaner athlete experience may help engagement, but coaches need concrete time savings to justify migration.
3. Brazil-specific billing, onboarding and support could differentiate. Portuguese alone cannot: TrainingPeaks already lists Portuguese support.
4. Watch reliability, workout semantics and migration may be harder than basic UI development.
5. Garmin ownership introduces strategic dependency when building on Garmin APIs. This is a risk assessment, not evidence of discriminatory access.

## Next evidence to gather

- Interview 8–12 coaches; observe actual weekly planning.
- Document current software spend, athlete count, repetitive work and migration constraints.
- Compare current Runna, Final Surge, Intervals.icu and local coaching products directly before fixing positioning.
- Confirm device API scope and commercial access; do not infer it from public docs alone.
- Secure three paying pilot coaches before expanding scope.
