import test from "node:test";
import assert from "node:assert/strict";
import {
  normalize,
  mergeActivities,
  validateWorkout,
  garminWorkout,
} from "../src/sync-model.js";
import { sign, verify, encrypt, decrypt } from "../lib/security.js";
import handler from "../lib/sync-core.js";
process.env.SESSION_SECRET = "ab".repeat(32);
const w = {
  title: "Intervals",
  date: "2026-11-05",
  steps: [
    { kind: "warmup", seconds: 600, target: "open" },
    { kind: "interval", seconds: 120, target: "pace", low: 270, high: 300 },
    { kind: "recovery", seconds: 120, target: "hr", low: 100, high: 130 },
    { kind: "cooldown", seconds: 600, target: "open" },
  ],
};
test("cross-provider history merges one run and retains source identities", () => {
  const s = normalize("strava", {
    id: 1,
    name: "Morning run",
    start_date: "2026-10-30T08:00:00Z",
    distance: 5000,
    moving_time: 1800,
    sport_type: "Run",
  });
  const g = normalize("garmin", {
    activityId: 2,
    activityName: "Run",
    startTimeGMT: "2026-10-30 08:00:05",
    distance: 5004,
    duration: 1810,
    activityType: { typeKey: "running" },
  });
  const merged = mergeActivities([s, g]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].sources.length, 2);
  assert.equal(
    mergeActivities([s, { ...g, start: "2026-10-30T09:00:00Z" }]).length,
    2,
  );
  assert.equal(mergeActivities([s, { ...s, id: "strava:3" }]).length, 2);
});
test("malformed activity data is rejected", () => {
  assert.equal(
    normalize("strava", {
      id: 1,
      start_date: "bad",
      distance: 12,
      moving_time: 5,
    }),
    null,
  );
  assert.equal(
    normalize("strava", {
      id: 1,
      start_date: "2026-10-30",
      distance: -1,
      moving_time: 5,
    }),
    null,
  );
});
test("workout targets use Garmin units without reversing fast and slow bounds", () => {
  const payload = garminWorkout(w),
    s = payload.workoutSegments[0].workoutSteps;
  assert.equal(s.length, 4);
  assert.equal(s[0].stepType.stepTypeId, 1);
  assert.equal(s[1].endConditionValue, 120);
  assert.equal(s[1].targetValueOne, 1000 / 300);
  assert.equal(s[1].targetValueTwo, 1000 / 270);
  assert.equal(s[2].targetValueOne, 100);
  assert.equal(s[2].targetValueTwo, 130);
});
test("invalid dates and inverted target ranges cannot be exported", () => {
  assert.throws(() => validateWorkout({ ...w, date: "2026-02-30" }));
  assert.throws(() =>
    validateWorkout({
      ...w,
      steps: [
        { kind: "interval", seconds: 120, target: "pace", low: 300, high: 270 },
      ],
    }),
  );
  assert.throws(() => validateWorkout({ ...w, steps: [] }));
  assert.throws(() =>
    validateWorkout({
      ...w,
      steps: [{ kind: "interval", seconds: Infinity, target: "open" }],
    }),
  );
});
test("sessions expire and tampering with sessions or stored tokens is rejected", () => {
  const s = sign({
    role: "owner",
    v: 2,
    sub: "strava:123",
    exp: Date.now() / 1000 + 60,
  });
  assert.equal(verify(s).role, "owner");
  assert.equal(verify(s + "x"), null);
  assert.equal(verify(sign({ role: "owner", exp: 1 })), null);
  const ciphertext = encrypt({ refresh_token: "test-only" });
  assert.deepEqual(decrypt(ciphertext), { refresh_token: "test-only" });
  const raw = Buffer.from(ciphertext, "base64");
  raw[15] ^= 1;
  assert.throws(() => decrypt(raw.toString("base64")));
});
async function invoke(route, { method = "GET", body, session, origin } = {}) {
  let status,
    headers = {},
    bytes;
  const req = {
    url: "/api/sync?route=" + route,
    method,
    body,
    headers: {
      ...(session ? { cookie: "rg_session=" + session } : {}),
      ...(origin ? { origin } : {}),
      "x-forwarded-for": "test",
    },
  };
  const res = {
    setHeader(k, v) {
      headers[k] = v;
    },
    writeHead(code, h) {
      status = code;
      Object.assign(headers, h);
    },
    end(v) {
      bytes = v;
    },
  };
  await handler(req, res);
  return { status, headers, data: JSON.parse(bytes) };
}
test("API blocks unauthenticated and cross-origin requests, persists plans encrypted", async () => {
  Object.assign(process.env, {
    APP_URL: "https://pilot.test",
    PILOT_PASSWORD: "test-password",
    UPSTASH_REDIS_REST_URL: "https://redis.test",
    UPSTASH_REDIS_REST_TOKEN: "test-token",
  });
  const original = global.fetch,
    store = new Map();
  global.fetch = async (url, options) => {
    assert.equal(String(url), "https://redis.test");
    const [cmd, k, ...args] = JSON.parse(options.body);
    let result = null;
    if (cmd === "HSET") {
      store.set(k + ":" + args[0], args[1]);
      result = 1;
    }
    if (cmd === "HVALS")
      result = [...store]
        .filter(([v]) => v.startsWith(k + ":"))
        .map(([, v]) => v);
    return { ok: true, json: async () => ({ result }) };
  };
  try {
    assert.equal((await invoke("history")).status, 401);
    const session = sign({
      role: "owner",
      v: 2,
      sub: "strava:123",
      exp: Date.now() / 1000 + 60,
    });
    assert.equal(
      (
        await invoke("workouts", {
          method: "POST",
          session,
          origin: "https://evil.test",
          body: w,
        })
      ).status,
      403,
    );
    const saved = await invoke("workouts", {
      method: "POST",
      session,
      origin: process.env.APP_URL,
      body: w,
    });
    assert.equal(saved.status, 200);
    assert.equal([...store.values()][0].includes("Intervals"), false);
    const read = await invoke("workouts", { session });
    assert.equal(read.data.workouts[0].title, "Intervals");
  } finally {
    global.fetch = original;
  }
});
test("Strava history import refreshes token, persists activities and does not duplicate repeated pages", async () => {
  const original = global.fetch;
  const values = new Map([
      [
        "runninggem:users:strava:123:strava",
        encrypt({ expires_at: 1, refresh_token: "old" }),
      ],
    ]),
    hash = new Map();
  let refreshed = 0;
  global.fetch = async (url, options) => {
    if (String(url) === "https://redis.test") {
      const [cmd, k, ...args] = JSON.parse(options.body);
      let result = null;
      if (cmd === "GET") result = values.get(k) || null;
      if (cmd === "SET") {
        values.set(k, args[0]);
        result = "OK";
      }
      if (cmd === "HSET") {
        hash.set(args[0], args[1]);
        result = 1;
      }
      if (cmd === "EVAL") {
        values.delete(k);
        result = 1;
      }
      return { ok: true, json: async () => ({ result }) };
    }
    if (String(url).endsWith("/oauth/token")) {
      refreshed++;
      return {
        ok: true,
        json: async () => ({
          access_token: "new",
          refresh_token: "rotated",
          expires_at: Date.now() / 1000 + 3600,
        }),
      };
    }
    assert.match(String(url), /athlete\/activities/);
    assert.equal(options.headers.Authorization, "Bearer new");
    return {
      ok: true,
      json: async () => [
        {
          id: 12,
          start_date: "2026-10-30T08:00:00Z",
          distance: 5000,
          moving_time: 1800,
          type: "Run",
        },
      ],
    };
  };
  try {
    const session = sign({
      role: "owner",
      v: 2,
      sub: "strava:123",
      exp: Date.now() / 1000 + 60,
    });
    for (let i = 0; i < 2; i++) {
      const r = await invoke("strava-import", {
        method: "POST",
        session,
        origin: "https://pilot.test",
        body: { page: 1 },
      });
      assert.equal(r.status, 200);
      assert.equal(r.data.imported, 1);
    }
    assert.equal(refreshed, 1);
    assert.equal(hash.size, 1);
    assert.equal(
      decrypt(values.get("runninggem:users:strava:123:strava")).refresh_token,
      "rotated",
    );
  } finally {
    global.fetch = original;
  }
});
