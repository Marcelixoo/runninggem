"use client";
import { useEffect, useRef, useState } from "react";
import type {
  ConnectionStatus,
  ImportedHistory,
  RunningWorkout,
  WorkoutStep,
  Tab,
} from "../lib/types";
import { validateWorkout } from "../src/sync-model.js";
const initial: ConnectionStatus = {
  configured: false,
  authenticated: false,
  stravaConfigured: false,
};
async function api<T>(
  route: string,
  data?: unknown,
  garmin = false,
): Promise<T> {
  const r = await fetch(garmin ? "/api/garmin" : `/api/sync?route=${route}`, {
    credentials: "same-origin",
    cache: "no-store",
    ...(data !== undefined
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        }
      : {}),
  });
  let value;
  try {
    value = await r.json();
  } catch {
    throw new Error("Sync service is unavailable.");
  }
  if (!r.ok) throw new Error(value.error || "Sync failed.");
  return value as T;
}
function newWorkout(): RunningWorkout {
  return {
    title: "Easy run",
    date: new Date().toLocaleDateString("en-CA", {
      timeZone: "America/Sao_Paulo",
    }),
    steps: [
      { kind: "warmup", seconds: 300, target: "open" },
      { kind: "interval", seconds: 1800, target: "open" },
      { kind: "cooldown", seconds: 300, target: "open" },
    ],
  };
}
export default function Connections({ tab }: { tab: Tab }) {
  const [status, setStatus] = useState(initial),
    [history, setHistory] = useState<ImportedHistory>({
      activities: [],
      health: null,
    }),
    [plans, setPlans] = useState<RunningWorkout[]>([]),
    [message, setMessage] = useState("Checking connections…"),
    [busy, setBusy] = useState(false),
    [page, setPage] = useState<number | null>(2),
    [offset, setOffset] = useState<number | null>(100),
    [mode, setMode] = useState<"workout" | "garmin" | null>(null),
    [mfa, setMfa] = useState(false),
    [draft, setDraft] = useState<RunningWorkout>(newWorkout),
    [reviewed, setReviewed] = useState(false),
    [modalMessage, setModalMessage] = useState("");
  const dialog = useRef<HTMLDialogElement>(null),
    running = useRef(false);
  async function refresh() {
    const s = await api<ConnectionStatus>("status");
    setStatus(s);
    if (s.authenticated) {
      const [h, p] = await Promise.all([
        api<ImportedHistory>("history"),
        api<{ workouts: RunningWorkout[] }>("workouts"),
      ]);
      setHistory(h);
      setPlans(p.workouts);
    } else {
      setHistory({ activities: [], health: null });
      setPlans([]);
    }
    return s;
  }
  useEffect(() => {
    let active = true;
    api<ConnectionStatus>("status")
      .then(async (s) => {
        if (!active) return;
        setStatus(s);
        setMessage(
          s.configured
            ? "Connect your accounts to bring your training together."
            : "Demo mode · Configure the server to enable account connections.",
        );
        if (s.authenticated) {
          const [h, p] = await Promise.all([
            api<ImportedHistory>("history"),
            api<{ workouts: RunningWorkout[] }>("workouts"),
          ]);
          if (active) {
            setHistory(h);
            setPlans(p.workouts);
          }
        }
      })
      .catch(() => {
        if (active) setMessage("Connections are temporarily unavailable.");
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (mode) dialog.current?.showModal();
    else dialog.current?.close();
  }, [mode]);
  async function perform(action: () => Promise<void>) {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setMessage("Working…");
    setModalMessage("");
    try {
      await action();
    } catch (e) {
      const text = e instanceof Error ? e.message : "Sync failed.";
      setMessage(text);
      setModalMessage(text);
    } finally {
      running.current = false;
      setBusy(false);
    }
  }
  function openWorkout(w?: RunningWorkout) {
    setDraft(structuredClone(w || newWorkout()));
    setReviewed(false);
    setModalMessage("");
    setMode("workout");
  }
  function updateStep(index: number, patch: Partial<WorkoutStep>) {
    setDraft((w) => ({
      ...w,
      steps: w.steps.map((s, i) => (i === index ? { ...s, ...patch } : s)),
    }));
    setReviewed(false);
  }
  function close() {
    if (!busy) setMode(null);
  }
  async function importHistory(provider: "strava" | "garmin", older = false) {
    const isStrava = provider === "strava";
    const data = await api<{
      imported: number;
      nextPage?: number | null;
      nextStart?: number | null;
      warning?: string;
    }>(
      isStrava ? "strava-import" : "",
      isStrava
        ? { page: older ? page : 1 }
        : { action: "import", start: older ? offset : 0 },
      !isStrava,
    );
    if (isStrava) setPage(data.nextPage ?? null);
    else setOffset(data.nextStart ?? null);
    await refresh();
    setMessage(`${data.imported} activities imported. ${data.warning || ""}`);
  }
  const runs = history.activities.filter((a) => a.sport === "run");
  return (
    <>
      <section className="panel sync-panel">
        <div className="section-top">
          <div>
            <p className="eyebrow">YOUR CONNECTED TRAINING</p>
            <h2>Connections & sync</h2>
          </div>
          {status.authenticated ? (
            <button
              className="text-button"
              disabled={busy}
              onClick={() =>
                perform(async () => {
                  await api("logout", {});
                  await refresh();
                  setMessage("Pilot locked.");
                })
              }
            >
              Lock pilot
            </button>
          ) : null}
        </div>
        <p role="status" aria-live="polite">
          {message}
        </p>
        {!status.authenticated ? (
          <form
            className="pilot-unlock"
            onSubmit={(e) => {
              e.preventDefault();
              const f = e.currentTarget,
                password = String(new FormData(f).get("password"));
              void perform(async () => {
                await api("login", { password });
                f.reset();
                await refresh();
                setMessage("Pilot unlocked.");
              });
            }}
          >
            <label>
              Pilot password
              <input
                type="password"
                name="password"
                autoComplete="current-password"
                required
              />
            </label>
            <button className="primary" disabled={busy || !status.configured}>
              Unlock connections
            </button>
          </form>
        ) : (
          <>
            <div className="sync-connections">
              {(["strava", "garmin"] as const).map((provider) => {
                const connected =
                    provider === "strava"
                      ? status.stravaConnected
                      : status.garminConnected,
                  last =
                    provider === "strava"
                      ? history.stravaLast
                      : history.garminLast;
                return (
                  <article key={provider}>
                    <h3>
                      {provider === "strava" ? "Strava" : "Garmin Connect"}{" "}
                      {provider === "garmin" ? (
                        <span className="pilot">EXPERIMENTAL</span>
                      ) : null}
                    </h3>
                    <p>
                      {connected ? "Connected" : "Not connected"} ·{" "}
                      {provider === "strava"
                        ? "Activity history"
                        : "Activities, health & workout delivery"}
                    </p>
                    {connected ? (
                      <>
                        <button
                          className="primary"
                          disabled={busy}
                          onClick={() => perform(() => importHistory(provider))}
                        >
                          Import latest{" "}
                          {provider === "strava" ? "Strava" : "Garmin"}
                        </button>
                        <button
                          className="text-button"
                          disabled={busy}
                          onClick={() =>
                            perform(async () => {
                              await api("disconnect", { provider });
                              await refresh();
                              setMessage(
                                `${provider} disconnected; local imports cleared.`,
                              );
                            })
                          }
                        >
                          Disconnect & clear imports
                        </button>
                      </>
                    ) : provider === "strava" ? (
                      status.stravaConfigured ? (
                        <a
                          className="primary"
                          href="/api/sync?route=strava-connect"
                        >
                          Connect Strava
                        </a>
                      ) : (
                        <p>
                          Strava application credentials are not configured.
                        </p>
                      )
                    ) : (
                      <button
                        className="primary"
                        disabled={busy}
                        onClick={() => {
                          setMfa(false);
                          setModalMessage("");
                          setMode("garmin");
                        }}
                      >
                        Connect Garmin
                      </button>
                    )}
                    <small>
                      {last
                        ? `Last import: ${new Date(last).toLocaleString()}`
                        : "No activity import yet."}
                    </small>
                  </article>
                );
              })}
            </div>
            <div className="sync-actions">
              <button
                className="text-button"
                disabled={busy}
                onClick={() => openWorkout()}
              >
                Create running workout →
              </button>
            </div>
          </>
        )}
      </section>
      {tab === "calendar" && status.authenticated ? (
        <section className="panel sync-panel">
          <div className="section-top">
            <h2>Your running workouts</h2>
            <button className="text-button" onClick={() => openWorkout()}>
              New workout
            </button>
          </div>
          {plans.length ? (
            plans.map((p) => (
              <article className="imported-row" key={p.id}>
                <div>
                  <strong>{p.title}</strong>
                  <small>
                    {p.date} · {p.steps.length} steps
                  </small>
                </div>
                <button className="text-button" onClick={() => openWorkout(p)}>
                  Review & send
                </button>
              </article>
            ))
          ) : (
            <p>No workouts saved yet.</p>
          )}
        </section>
      ) : null}
      {tab === "performance" && status.authenticated ? (
        <>
          <section className="panel sync-panel">
            <p className="eyebrow">IMPORTED DATA</p>
            <h2>Your activity history</h2>
            <p>
              {runs.length} runs ·{" "}
              {runs.reduce((n, a) => n + a.meters / 1000, 0).toFixed(1)} km
              across imported history
            </p>
            {history.activities.length ? (
              history.activities.slice(0, 100).map((a) => (
                <article className="imported-row" key={a.id}>
                  <div>
                    <strong>{a.name}</strong>
                    <small>
                      {new Date(a.start).toLocaleString()} ·{" "}
                      {a.sources.map((s) => s.source).join(" + ")}
                    </small>
                  </div>
                  <span>
                    {(a.meters / 1000).toFixed(2)} km ·{" "}
                    {Math.round(a.seconds / 60)} min
                  </span>
                </article>
              ))
            ) : (
              <p>No imported activities yet.</p>
            )}
            <div className="sync-actions">
              {status.stravaConnected && page !== null ? (
                <button
                  disabled={busy}
                  className="text-button"
                  onClick={() => perform(() => importHistory("strava", true))}
                >
                  Load older Strava history
                </button>
              ) : null}
              {status.garminConnected && offset !== null ? (
                <button
                  disabled={busy}
                  className="text-button"
                  onClick={() => perform(() => importHistory("garmin", true))}
                >
                  Load older Garmin history
                </button>
              ) : null}
            </div>
            <p className="local-note">
              Matching activities from different providers appear once. Matches
              use sport, time, distance and duration.
            </p>
          </section>
          {history.health?.length ? (
            <section className="panel sync-panel">
              <h2>Garmin health · last 7 days</h2>
              {history.health.map((h) => (
                <article className="imported-row" key={h.date}>
                  <strong>{h.date}</strong>
                  <span>
                    {h.steps ?? "—"} steps · Resting HR{" "}
                    {h.restingHeartRate ?? "—"} bpm · Body Battery{" "}
                    {h.bodyBatteryLow ?? "—"}–{h.bodyBatteryHigh ?? "—"}
                  </span>
                </article>
              ))}
            </section>
          ) : null}
        </>
      ) : null}
      <dialog
        aria-label="Connections and workout builder"
        ref={dialog}
        onCancel={(e) => {
          if (busy) e.preventDefault();
          else close();
        }}
      >
        <div id="dialog-content">
          <div className="modal-top">
            <h2>{mode === "workout" ? "Running workout" : "Connect Garmin"}</h2>
            <button
              className="icon-button"
              disabled={busy}
              onClick={close}
              aria-label="Close connection dialog"
            >
              ×
            </button>
          </div>
          {mode === "garmin" ? (
            <>
              <p>
                Experimental connection through an unofficial open-source
                client. Credentials go through the server to Garmin and are not
                retained.
              </p>
              <form
                key={mfa ? "mfa" : "credentials"}
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = e.currentTarget,
                    fields = Object.fromEntries(new FormData(f));
                  void perform(async () => {
                    const data = await api<{
                      needsMfa?: boolean;
                      connected?: boolean;
                    }>(
                      "",
                      { action: mfa ? "mfa" : "connect", ...fields },
                      true,
                    );
                    f.reset();
                    if (data.needsMfa) {
                      setMfa(true);
                      setModalMessage("Enter the Garmin verification code.");
                    } else {
                      setMode(null);
                      await refresh();
                      setMessage("Garmin connected.");
                    }
                  });
                }}
              >
                {mfa ? (
                  <label>
                    Verification code
                    <input name="code" autoComplete="one-time-code" required />
                  </label>
                ) : (
                  <>
                    <label>
                      Email
                      <input
                        name="email"
                        type="email"
                        autoComplete="username"
                        required
                      />
                    </label>
                    <label>
                      Password
                      <input
                        name="password"
                        type="password"
                        autoComplete="current-password"
                        required
                      />
                    </label>
                  </>
                )}
                <button className="primary" disabled={busy}>
                  {mfa ? "Verify" : "Connect"}
                </button>
              </form>
            </>
          ) : mode === "workout" ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void perform(async () => {
                  const w = validateWorkout(draft);
                  await api("workout-preview", w);
                  setReviewed(true);
                  setModalMessage(
                    `${w.title} · ${w.date} · ${w.steps.length} steps · ${Math.round(w.steps.reduce((n: number, s: WorkoutStep) => n + s.seconds, 0) / 60)} min. Reviewed and ready.`,
                  );
                });
              }}
            >
              <label>
                Title
                <input
                  maxLength={100}
                  value={draft.title}
                  required
                  onChange={(e) => {
                    setDraft((w) => ({ ...w, title: e.target.value }));
                    setReviewed(false);
                  }}
                />
              </label>
              <label>
                Date
                <input
                  type="date"
                  value={draft.date}
                  required
                  onChange={(e) => {
                    setDraft((w) => ({ ...w, date: e.target.value }));
                    setReviewed(false);
                  }}
                />
              </label>
              <p className="local-note">
                Pace targets use seconds/km (300 = 5:00/km). Heart rate uses
                bpm. Repeat intervals by adding steps.
              </p>
              <div id="builder-steps">
                {draft.steps.map((s, i) => (
                  <fieldset key={i}>
                    <legend>Step {i + 1}</legend>
                    <label>
                      Type
                      <select
                        value={s.kind}
                        onChange={(e) =>
                          updateStep(i, {
                            kind: e.target.value as WorkoutStep["kind"],
                          })
                        }
                      >
                        {["warmup", "interval", "recovery", "cooldown"].map(
                          (k) => (
                            <option key={k}>{k}</option>
                          ),
                        )}
                      </select>
                    </label>
                    <label>
                      Seconds
                      <input
                        type="number"
                        min={10}
                        max={14400}
                        required
                        value={s.seconds}
                        onChange={(e) =>
                          updateStep(i, { seconds: Number(e.target.value) })
                        }
                      />
                    </label>
                    <label>
                      Target
                      <select
                        value={s.target}
                        onChange={(e) =>
                          updateStep(i, {
                            target: e.target.value as WorkoutStep["target"],
                          })
                        }
                      >
                        <option value="open">No target</option>
                        <option value="pace">Pace (seconds/km)</option>
                        <option value="hr">Heart rate (bpm)</option>
                      </select>
                    </label>
                    {s.target !== "open" ? (
                      <>
                        <label>
                          Lower / faster
                          <input
                            type="number"
                            required
                            value={s.low ?? ""}
                            onChange={(e) =>
                              updateStep(i, { low: Number(e.target.value) })
                            }
                          />
                        </label>
                        <label>
                          Upper / slower
                          <input
                            type="number"
                            required
                            value={s.high ?? ""}
                            onChange={(e) =>
                              updateStep(i, { high: Number(e.target.value) })
                            }
                          />
                        </label>
                      </>
                    ) : null}
                    <button
                      type="button"
                      className="text-button"
                      onClick={() => {
                        setDraft((w) => ({
                          ...w,
                          steps: w.steps.filter((_, n) => n !== i),
                        }));
                        setReviewed(false);
                      }}
                    >
                      Remove step
                    </button>
                  </fieldset>
                ))}
              </div>
              <button
                type="button"
                className="text-button"
                disabled={draft.steps.length >= 50}
                onClick={() => {
                  setDraft((w) => ({
                    ...w,
                    steps: [
                      ...w.steps,
                      { kind: "interval", seconds: 120, target: "open" },
                    ],
                  }));
                  setReviewed(false);
                }}
              >
                + Add step
              </button>
              <div className="sync-actions">
                <button className="primary" disabled={busy}>
                  Review workout
                </button>
                <button
                  type="button"
                  className="text-button"
                  disabled={busy}
                  onClick={() =>
                    perform(async () => {
                      await api("workouts", validateWorkout(draft));
                      await refresh();
                      setModalMessage("Saved to your calendar.");
                    })
                  }
                >
                  Save as new workout
                </button>
                <button
                  type="button"
                  className="primary"
                  disabled={busy || !reviewed || !status.garminConnected}
                  onClick={() =>
                    perform(async () => {
                      const result = await api<{ status: string }>(
                        "",
                        { action: "export", workout: validateWorkout(draft) },
                        true,
                      );
                      setModalMessage(result.status);
                    })
                  }
                >
                  Send to Garmin Connect
                </button>
              </div>
              <p className="local-note">
                Delivery means scheduled in Garmin Connect. Sync your compatible
                watch to receive the session.
              </p>
            </form>
          ) : null}
          <p role="status" aria-live="polite">
            {modalMessage}
          </p>
        </div>
      </dialog>
    </>
  );
}
