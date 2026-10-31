"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { addDays, weekStart } from "../src/model.js";
import {
  localDate,
  activityTotals,
  paceLabel,
  periodActivities,
  volumeSeries,
} from "../src/activity-stats.js";
import type {
  Activity,
  ImportedHistory,
  RunningWorkout,
  Tab,
} from "../lib/types";
import Connections from "./Connections";
const dates = (iso: string, options: Intl.DateTimeFormatOptions = {}) =>
  new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
    ...options,
  }).format(new Date(iso + "T12:00:00Z"));
const minutes = (n: number) =>
  `${Math.floor(Math.round(n) / 60) ? `${Math.floor(Math.round(n) / 60)}h ` : ""}${Math.round(n) % 60} min`;
const tabs = [
  { id: "today", href: "/", label: "Today", symbol: "☀" },
  { id: "calendar", href: "/calendar", label: "Calendar", symbol: "▦" },
  {
    id: "performance",
    href: "/performance",
    label: "Performance",
    symbol: "↗",
  },
];
function ActivityCard({ activity }: { activity: Activity }) {
  return (
    <article className="workout-card">
      <span className="activity-icon">↗</span>
      <span className="workout-info">
        <span className="card-category">
          {activity.sport} · Completed · {dates(localDate(activity.start))}
        </span>
        <strong>{activity.name}</strong>
        <span className="card-meta">
          {(activity.meters / 1000).toFixed(2)} km ·{" "}
          {minutes(activity.seconds / 60)}
          {activity.sport === "run" && activity.meters > 0
            ? ` · ${paceLabel(activity.seconds / (activity.meters / 1000))} /km`
            : ""}
        </span>
      </span>
      <span className="card-end">✓</span>
    </article>
  );
}
function PlanCard({ plan }: { plan: RunningWorkout }) {
  return (
    <article className="workout-card">
      <span className="activity-icon lavender">◇</span>
      <span className="workout-info">
        <span className="card-category">
          Running workout · Planned · {dates(plan.date)}
        </span>
        <strong>{plan.title}</strong>
        <span className="card-meta">
          {minutes(plan.steps.reduce((n, s) => n + s.seconds, 0) / 60)} ·{" "}
          {plan.steps.length} steps
        </span>
      </span>
    </article>
  );
}
export default function AthleteApp({ tab }: { tab: Tab }) {
  // Dates are initialized after hydration using the athlete's browser timezone.
  const [today, setToday] = useState(""),
    [week, setWeek] = useState(""),
    [period, setPeriod] = useState<"week" | "month">("week");
  const [activities, setActivities] = useState<Activity[]>([]),
    [plans, setPlans] = useState<RunningWorkout[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  useEffect(() => {
    const update = () => {
      const date = localDate();
      setToday(date);
      setWeek((current) => current || weekStart(date));
    };
    update();
    const timer = setInterval(update, 60000);
    return () => clearInterval(timer);
  }, []);
  const receiveData = useCallback(
    (history: ImportedHistory, workouts: RunningWorkout[]) => {
      setActivities(history.activities);
      setPlans(workouts);
      setLoading(false);
      setError("");
    },
    [],
  );
  const receiveError = useCallback(() => {
    setActivities([]);
    setPlans([]);
    setLoading(false);
    setError("Activity data could not be loaded. Refresh to retry.");
  }, []);
  const weekly = today
    ? periodActivities(
        activities,
        weekStart(today),
        addDays(weekStart(today), 7),
      )
    : [];
  const stats = activityTotals(weekly);
  const series = today ? volumeSeries(activities, today, period) : [];
  const totals = series.at(-1) || activityTotals([]);
  const todayActivities = today
    ? periodActivities(activities, today, addDays(today, 1))
    : [];
  const upcoming = plans
    .filter((p) => p.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date));
  const nav = tabs.map((t) => (
    <Link
      key={t.id}
      href={t.href}
      className={`nav-link ${tab === t.id ? "active" : ""}`}
      aria-current={tab === t.id ? "page" : undefined}
    >
      <span aria-hidden="true">{t.symbol}</span>
      <span>{t.label}</span>
    </Link>
  ));
  const empty = loading
    ? "Loading your training…"
    : error ||
      "No imported activities in this period. Connect a provider or import older history below.";
  const metrics = (value: ReturnType<typeof activityTotals>) => (
    <div className="stats-row">
      <div>
        <strong>
          {value.km.toFixed(1)}
          <span>km</span>
        </strong>
        <small>RUNNING DISTANCE</small>
      </div>
      <div>
        <strong>{minutes(value.minutes)}</strong>
        <small>RUNNING TIME</small>
      </div>
      <div>
        <strong>{value.runs}</strong>
        <small>RUNS</small>
      </div>
      <div>
        <strong>{paceLabel(value.pace)}</strong>
        <small>AVERAGE PACE /KM</small>
      </div>
    </div>
  );
  return (
    <div className="shell">
      <aside className="sidebar">
        <Link href="/" className="brand">
          <span className="brand-mark">↗</span>runninggem
          <span className="pilot">PILOT</span>
        </Link>
        <p className="sidebar-note">
          Less noise.
          <br />
          More running.
        </p>
        <nav aria-label="Main navigation">{nav}</nav>
        <div className="sidebar-footer">Your connected training</div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <Link className="mobile-brand" href="/">
            runninggem<span className="pilot">PILOT</span>
          </Link>
          <span className="top-label">YOUR TRAINING, IN FOCUS</span>
          <span className="demo-tag">Connected activity data</span>
        </header>
        <main id="app">
          <div className="page-heading">
            <div>
              <p className="eyebrow">
                {today ? dates(today, { year: "numeric" }) : "YOUR TRAINING"}
              </p>
              <h1>
                {tab === "today"
                  ? "One day at a time."
                  : tab === "calendar"
                    ? "Your week, laid out."
                    : "Progress, at your pace."}
              </h1>
              <p className="subtitle">
                Your imported training, in your local timezone.
              </p>
            </div>
          </div>
          {loading || error ? <p role="status">{empty}</p> : null}
          {tab === "today" ? (
            <>
              <section className="panel performance-panel">
                <div className="section-top">
                  <h2>Your week</h2>
                  <span>
                    {today
                      ? `${dates(weekStart(today))} – ${dates(addDays(weekStart(today), 6))}`
                      : ""}
                  </span>
                </div>
                {metrics(stats)}
                <Link href="/calendar">See calendar →</Link>
              </section>
              <div className="section-top upcoming-heading">
                <h2>Completed today</h2>
              </div>
              {todayActivities.length ? (
                todayActivities.map((a) => (
                  <ActivityCard key={a.id} activity={a} />
                ))
              ) : (
                <p>{loading ? "Loading…" : "No activities recorded today."}</p>
              )}
              <div className="section-top upcoming-heading">
                <h2>Planned workouts</h2>
              </div>
              {upcoming.length ? (
                upcoming
                  .slice(0, 3)
                  .map((p) => <PlanCard key={p.id} plan={p} />)
              ) : (
                <p>
                  No upcoming workouts saved. Create one in Connections &amp;
                  sync.
                </p>
              )}
            </>
          ) : null}
          {tab === "calendar" && week ? (
            <section className="panel calendar-panel">
              <div className="calendar-toolbar">
                <h2>
                  {dates(week)} – {dates(addDays(week, 6))}
                </h2>
                <div className="week-controls">
                  <button
                    className="icon-button"
                    aria-label="Previous week"
                    onClick={() => setWeek(addDays(week, -7))}
                  >
                    ←
                  </button>
                  <button
                    className="text-button"
                    onClick={() => setWeek(weekStart(today))}
                  >
                    This week
                  </button>
                  <button
                    className="icon-button"
                    aria-label="Next week"
                    onClick={() => setWeek(addDays(week, 7))}
                  >
                    →
                  </button>
                </div>
              </div>
              <div className="agenda">
                {Array.from({ length: 7 }, (_, i) => {
                  const day = addDays(week, i),
                    items = periodActivities(activities, day, addDays(day, 1)),
                    scheduled = plans.filter((p) => p.date === day);
                  return (
                    <div
                      key={day}
                      className={`agenda-row ${day === today ? "is-today" : ""}`}
                    >
                      <div className="agenda-date">
                        <small>{dates(day, { weekday: "short" })}</small>
                        <strong>{Number(day.slice(-2))}</strong>
                      </div>
                      <div className="agenda-sessions">
                        {items.map((a) => (
                          <ActivityCard key={a.id} activity={a} />
                        ))}
                        {scheduled.map((p) => (
                          <PlanCard key={p.id} plan={p} />
                        ))}
                        {!items.length && !scheduled.length ? (
                          <span className="rest-label">
                            No activity or workout recorded.
                          </span>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          ) : null}
          {tab === "performance" ? (
            <>
              <section className="panel performance-panel">
                <div className="section-top">
                  <div>
                    <span className="eyebrow">RUNNING VOLUME</span>
                    <h2>{period === "week" ? "This week" : "This month"}</h2>
                  </div>
                  <div
                    className="segmented"
                    role="group"
                    aria-label="Performance period"
                  >
                    {(["week", "month"] as const).map((p) => (
                      <button
                        key={p}
                        className={period === p ? "active" : ""}
                        aria-pressed={period === p}
                        onClick={() => setPeriod(p)}
                      >
                        {p === "week" ? "Week" : "Month"}
                      </button>
                    ))}
                  </div>
                </div>
                {metrics(totals)}
                <div
                  className="bar-chart"
                  role="img"
                  aria-label={series
                    .map((s) => `${s.start}: ${s.km.toFixed(1)} km`)
                    .join("; ")}
                >
                  {series.map((s, i) => (
                    <div key={s.start} className="chart-column">
                      <span className="bar-value">{s.km.toFixed(1)}</span>
                      <div
                        className={`bar ${i === series.length - 1 ? "current" : ""}`}
                        style={{
                          height: Math.max(
                            (s.km / Math.max(...series.map((v) => v.km), 1)) *
                              155,
                            2,
                          ),
                        }}
                      />
                      <small>
                        {dates(
                          s.start,
                          period === "month"
                            ? { day: undefined, month: "short" }
                            : {},
                        )}
                      </small>
                    </div>
                  ))}
                </div>
                {totals.runs === 0 ? <p>{empty}</p> : null}
                <p className="local-note">
                  Running totals use imported history only. Average pace is
                  total running time divided by total distance. Import older
                  history for a fuller chart.
                </p>
              </section>
              <div className="section-top upcoming-heading">
                <h2>Recent activities</h2>
              </div>
              {activities.length ? (
                activities
                  .slice(0, 5)
                  .map((a) => <ActivityCard key={a.id} activity={a} />)
              ) : (
                <p>{empty}</p>
              )}
            </>
          ) : null}
          <Connections tab={tab} onData={receiveData} onError={receiveError} />
          <p className="footnote">
            Matching activities from Strava and Garmin count once. Planned
            workouts are separate from completed activity totals.
          </p>
        </main>
      </div>
      <nav className="bottom-nav" aria-label="Mobile navigation">
        {nav}
      </nav>
    </div>
  );
}
