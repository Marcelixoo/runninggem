"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  workouts as fixture,
  DEMO_TODAY,
  addDays,
  weekStart,
  inWeek,
  summarize,
  isComplete,
  loadLogs,
  history,
} from "../src/model.js";
import type { Tab, Session, FeedbackMap } from "../lib/types";
import Connections from "./Connections";
const workouts: Session[] = fixture;
const dates = (iso: string, options: Intl.DateTimeFormatOptions = {}) =>
  new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
    ...options,
  }).format(new Date(iso + "T12:00:00Z"));
const minutes = (n: number) =>
  n >= 60
    ? `${Math.floor(n / 60)}h ${Math.round(n % 60)}m`
    : `${Math.round(n)} min`;
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
function Heading({
  title,
  kicker,
  children,
}: {
  title: string;
  kicker: string;
  children: React.ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <p className="eyebrow">{kicker}</p>
        <h1>{title}</h1>
        <p className="subtitle">{children}</p>
      </div>
    </div>
  );
}
function Card({
  workout,
  logs,
  onOpen,
}: {
  workout: Session;
  logs: FeedbackMap;
  onOpen: (w: Session) => void;
}) {
  return (
    <button className="workout-card" onClick={() => onOpen(workout)}>
      <span
        className={`activity-icon ${workout.type === "Strength" ? "lavender" : ""}`}
      >
        {workout.type === "Strength" ? "◇" : "↗"}
      </span>
      <span className="workout-info">
        <span className="card-category">
          {workout.type} ·{" "}
          {isComplete(workout, logs) ? "Completed" : "Scheduled"}
        </span>
        <strong>{workout.title}</strong>
        <span className="card-meta">
          {workout.km ? `${workout.km.toFixed(1)} km · ` : ""}
          {minutes(workout.minutes)}
          {workout.pace ? ` · ${workout.pace} /km` : ""}
        </span>
      </span>
      <span className="card-end">{isComplete(workout, logs) ? "✓" : "→"}</span>
    </button>
  );
}
export default function AthleteApp({ tab }: { tab: Tab }) {
  const [logs, setLogs] = useState<FeedbackMap>({}),
    [week, setWeek] = useState(weekStart(DEMO_TODAY)),
    [period, setPeriod] = useState<"week" | "month">("week"),
    [selected, setSelected] = useState<Session | null>(null),
    [message, setMessage] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    try {
      setLogs(loadLogs(window.localStorage));
    } catch {
      setMessage("Browser storage is unavailable.");
    }
    if (
      location.hash &&
      ["#today", "#calendar", "#performance"].includes(location.hash)
    ) {
      const target =
        location.hash === "#today" ? "/" : `/${location.hash.slice(1)}`;
      if (location.pathname !== target)
        location.replace(target + location.search);
    }
  }, []);
  useEffect(() => {
    if (selected) dialog.current?.showModal();
    else dialog.current?.close();
  }, [selected]);
  const card = (w: Session) => (
    <Card key={w.id} workout={w} logs={logs} onOpen={setSelected} />
  );
  const weekly = inWeek(workouts, weekStart(DEMO_TODAY));
  const stats = summarize(weekly, logs);
  const today = workouts.find((w) => w.date === DEMO_TODAY)!;
  const list =
    period === "week"
      ? weekly
      : workouts.filter((w) => w.date.startsWith("2026-10"));
  const totals = summarize(list, logs);
  const bars =
    period === "week"
      ? [...history, totals.km]
      : [42, 58, 64, 78, 86, totals.km];
  const labels =
    period === "week"
      ? ["Sep 14", "Sep 21", "Sep 28", "Oct 5", "Oct 12", "Oct 19", "Oct 26"]
      : ["May", "Jun", "Jul", "Aug", "Sep", "Oct"];
  const nav = (
    <>
      {tabs.map((t) => (
        <Link
          key={t.id}
          href={t.href}
          className={`nav-link ${tab === t.id ? "active" : ""}`}
          aria-current={tab === t.id ? "page" : undefined}
        >
          <span aria-hidden="true">{t.symbol}</span>
          <span>{t.label}</span>
        </Link>
      ))}
    </>
  );
  function saveFeedback(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    const f = new FormData(event.currentTarget);
    const next = {
      ...logs,
      [selected.id]: {
        completed: f.get("completed") === "on",
        effort: Number(f.get("effort")),
        note: String(f.get("note") || "").trim(),
      },
    };
    try {
      localStorage.setItem("runninggem.logs.v1", JSON.stringify(next));
      setLogs(next);
      setSelected(null);
      setMessage("Session feedback saved on this browser.");
    } catch {
      setMessage("Could not save. Browser storage may be unavailable.");
    }
  }
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
        <div className="sidebar-footer">
          <span className="avatar">M</span>
          <div>
            Athlete pilot<small>São Paulo, BR</small>
          </div>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <Link className="mobile-brand" href="/">
            runninggem<span className="pilot">PILOT</span>
          </Link>
          <span className="top-label">YOUR TRAINING, IN FOCUS</span>
          <span className="demo-tag">Sample training plan</span>
        </header>
        <main id="app">
          {tab === "today" ? (
            <>
              <Heading
                kicker="YOUR SAMPLE PLAN · OCTOBER 30"
                title="One day at a time."
              >
                A little consistency goes a long way.
              </Heading>
              <div className="today-grid">
                <section className="hero-card">
                  <div className="hero-top">
                    <span className="pill">
                      {isComplete(today, logs)
                        ? "SESSION COMPLETE"
                        : "TODAY’S SESSION"}
                    </span>
                    <span className="hero-sport">◇ Strength</span>
                  </div>
                  <div className="hero-art" aria-hidden="true">
                    <span />
                    <span />
                    <span />
                  </div>
                  <div className="hero-content">
                    <h2>
                      Build your
                      <br />
                      foundation.
                    </h2>
                    <p>
                      Strong legs. Steady strides.
                      <br />A little work that goes a long way.
                    </p>
                    <div className="hero-metrics">
                      <div>
                        <strong>
                          35<span>min</span>
                        </strong>
                        <small>DURATION</small>
                      </div>
                      <div>
                        <strong>5</strong>
                        <small>MOVEMENTS</small>
                      </div>
                      <div>
                        <strong>Easy</strong>
                        <small>INTENSITY</small>
                      </div>
                    </div>
                    <button
                      className="primary"
                      onClick={() => setSelected(today)}
                    >
                      View session →
                    </button>
                  </div>
                </section>
                <section className="week-card panel">
                  <div className="section-top">
                    <h2>Your week</h2>
                    <span>Oct 26 – Nov 1</span>
                  </div>
                  <div className="week-strip">
                    {Array.from({ length: 7 }, (_, i) => {
                      const d = addDays(weekStart(DEMO_TODAY), i);
                      return (
                        <Link
                          key={d}
                          href="/calendar"
                          className={`day-dot ${d === DEMO_TODAY ? "selected" : ""}`}
                          aria-label={`View ${dates(d)} in calendar`}
                        >
                          <small>
                            {dates(d, { weekday: "short" }).slice(0, 1)}
                          </small>
                          <strong>{Number(d.slice(-2))}</strong>
                          <span>•</span>
                        </Link>
                      );
                    })}
                  </div>
                  <div className="week-distance">
                    <strong>
                      {stats.km}
                      <span> / {weekly.reduce((n, w) => n + w.km, 0)} km</span>
                    </strong>
                  </div>
                  <div className="progress-track">
                    <span
                      style={{
                        width: `${(stats.km / weekly.reduce((n, w) => n + w.km, 0)) * 100}%`,
                      }}
                    />
                  </div>
                  <div className="week-bottom">
                    <span>
                      {stats.activities} of {weekly.length} sessions done
                    </span>
                    <Link href="/calendar">See calendar →</Link>
                  </div>
                </section>
              </div>
              <div className="section-top upcoming-heading">
                <h2>Coming up</h2>
              </div>
              {workouts
                .filter((w) => w.date > DEMO_TODAY)
                .slice(0, 2)
                .map(card)}
            </>
          ) : null}
          {tab === "calendar" ? (
            <>
              <Heading
                kicker="MAKE ROOM FOR YOURSELF"
                title="Your week, laid out."
              >
                A rhythm you can return to.
              </Heading>
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
                      onClick={() => setWeek(weekStart(DEMO_TODAY))}
                    >
                      Sample week
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
                    const d = addDays(week, i),
                      items = workouts.filter((w) => w.date === d);
                    return (
                      <div
                        key={d}
                        className={`agenda-row ${d === DEMO_TODAY ? "is-today" : ""}`}
                      >
                        <div className="agenda-date">
                          <small>
                            {dates(d, { weekday: "short" }).split(",")[0]}
                          </small>
                          <strong>{Number(d.slice(-2))}</strong>
                        </div>
                        <div className="agenda-sessions">
                          {items.length ? (
                            items.map(card)
                          ) : (
                            <span className="rest-label">
                              Rest & recharge <span>Room to recover.</span>
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            </>
          ) : null}
          {tab === "performance" ? (
            <>
              <Heading
                kicker="THE BIGGER PICTURE"
                title="Progress, at your pace."
              >
                Your imported activities appear below; the chart and records
                here are sample data.
              </Heading>
              <section className="panel performance-panel">
                <div className="section-top">
                  <div>
                    <span className="eyebrow">SAMPLE RUNNING VOLUME</span>
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
                <div className="stats-row">
                  <div>
                    <strong>
                      {totals.km.toFixed(1)}
                      <span>km</span>
                    </strong>
                    <small>DISTANCE</small>
                  </div>
                  <div>
                    <strong>{minutes(totals.minutes)}</strong>
                    <small>ACTIVE TIME</small>
                  </div>
                  <div>
                    <strong>{totals.activities}</strong>
                    <small>SESSIONS</small>
                  </div>
                </div>
                <div
                  className="bar-chart"
                  role="img"
                  aria-label={bars
                    .map((n, i) => `${labels[i]}: ${n} km`)
                    .join("; ")}
                >
                  {bars.map((n, i) => (
                    <div key={labels[i]} className="chart-column">
                      <span className="bar-value">{n}</span>
                      <div
                        className={`bar ${i === bars.length - 1 ? "current" : ""}`}
                        style={{
                          height: Math.max((n / Math.max(...bars, 1)) * 155, 2),
                        }}
                      />
                      <small>{labels[i]}</small>
                    </div>
                  ))}
                </div>
              </section>
              <div className="section-top upcoming-heading">
                <h2>Personal bests · sample records</h2>
              </div>
              <section className="records">
                {[
                  {
                    label: "5 KILOMETERS",
                    time: "28:42",
                    date: "September 12, 2026",
                  },
                  {
                    label: "10 KILOMETERS",
                    time: "59:18",
                    date: "October 4, 2026",
                  },
                  {
                    label: "HALF MARATHON",
                    time: "2:12:06",
                    date: "October 18, 2026",
                  },
                ].map((r) => (
                  <div className="record" key={r.label}>
                    <span>↗</span>
                    <small>{r.label}</small>
                    <strong>{r.time}</strong>
                    <p>{r.date}</p>
                  </div>
                ))}
              </section>
              <div className="section-top upcoming-heading">
                <h2>Recent sample sessions</h2>
              </div>
              {workouts
                .filter((w) => isComplete(w, logs))
                .slice()
                .reverse()
                .slice(0, 3)
                .map(card)}
            </>
          ) : null}
          <Connections tab={tab} />
          <p className="footnote">
            The sample plan is frozen at October 30, 2026. Imported activities
            and your saved workouts are kept separate.
          </p>
          <p role="status" aria-live="polite">
            {message}
          </p>
        </main>
      </div>
      <nav className="bottom-nav" aria-label="Mobile navigation">
        {nav}
      </nav>
      <dialog
        aria-label="Session details"
        ref={dialog}
        onCancel={() => setSelected(null)}
        onClick={(e) => {
          if (e.target === e.currentTarget) {
            const r = e.currentTarget.getBoundingClientRect();
            if (
              e.clientX < r.left ||
              e.clientX > r.right ||
              e.clientY < r.top ||
              e.clientY > r.bottom
            )
              setSelected(null);
          }
        }}
      >
        <div id="dialog-content">
          {selected ? (
            <>
              <div className="modal-top">
                <span className="eyebrow">
                  {dates(selected.date)} · {selected.type}
                </span>
                <button
                  className="icon-button"
                  aria-label="Close workout"
                  onClick={() => setSelected(null)}
                >
                  ×
                </button>
              </div>
              <h2>{selected.title}</h2>
              <p>
                {selected.description ||
                  "Keep the effort comfortable and consistent."}
              </p>
              <ol className="session-steps">
                {(
                  selected.steps || [
                    `${selected.minutes} min · ${selected.type}`,
                  ]
                ).map((step, i) => (
                  <li key={i}>{step}</li>
                ))}
              </ol>
              <form key={selected.id} onSubmit={saveFeedback}>
                <label htmlFor="effort">Effort (1–10)</label>
                <input
                  id="effort"
                  name="effort"
                  type="range"
                  min="1"
                  max="10"
                  defaultValue={logs[selected.id]?.effort || 5}
                />
                <label htmlFor="note">Your notes</label>
                <textarea
                  id="note"
                  name="note"
                  rows={3}
                  maxLength={1000}
                  defaultValue={logs[selected.id]?.note || ""}
                />
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    name="completed"
                    defaultChecked={isComplete(selected, logs)}
                  />
                  Mark session completed
                </label>
                <button className="primary">Save session</button>
                <p className="local-note">
                  Feedback is saved on this browser only.
                </p>
              </form>
            </>
          ) : null}
        </div>
      </dialog>
    </div>
  );
}
