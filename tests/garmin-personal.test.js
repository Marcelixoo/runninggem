import test from "node:test";
import assert from "node:assert/strict";
import handler from "../lib/sync-core.js";
import { sign, decrypt } from "../lib/security.js";
import { normalizeHealth } from "../lib/garmin-personal.js";
const origin = "https://runninggem.test";
const jwt = () =>
  "header." +
  Buffer.from(JSON.stringify({ exp: Date.now() / 1000 + 86400 })).toString(
    "base64url",
  ) +
  ".signature";
async function harness(fn) {
  const saved = { ...process.env },
    original = global.fetch,
    values = new Map(),
    hashes = new Map();
  Object.assign(process.env, {
    APP_URL: origin,
    SESSION_SECRET: "ab".repeat(32),
    UPSTASH_REDIS_REST_URL: "https://redis.test",
    UPSTASH_REDIS_REST_TOKEN: "redis-secret",
    GARMIN_CONNECT_API_KEY: "private-api-key",
    GARMIN_PERSONAL_STRAVA_ID: "123",
  });
  const state = {
    exchanges: 0,
    reads: 0,
    healthFailure: false,
    unauthorized: false,
    nextPage: false,
    invalidKey: false,
    invalidToken: false,
  };
  global.fetch = async (url, options) => {
    if (url === "https://redis.test") {
      const [cmd, k, ...args] = JSON.parse(options.body);
      let result = null;
      if (cmd === "GET") result = values.get(k) || null;
      if (cmd === "SET") {
        if (!args.includes("NX") || !values.has(k)) {
          values.set(k, args[0]);
          result = "OK";
        }
      }
      if (cmd === "DEL") {
        for (const name of [k, ...args]) values.delete(name);
        result = 1;
      }
      if (cmd === "EXISTS") result = values.has(k) ? 1 : 0;
      if (cmd === "EVAL") {
        values.delete(args[1]);
        result = 1;
      }
      if (cmd === "HSET") {
        if (!hashes.has(k)) hashes.set(k, new Map());
        for (let i = 0; i < args.length; i += 2)
          hashes.get(k).set(args[i], args[i + 1]);
        result = 1;
      }
      if (cmd === "HGETALL") result = [...(hashes.get(k) || [])].flat();
      if (cmd === "HDEL") result = hashes.get(k)?.delete(args[0]);
      if (cmd === "HVALS") result = [...(hashes.get(k)?.values() || [])];
      return { ok: true, json: async () => ({ result }) };
    }
    assert.ok(
      String(url).startsWith("https://personal.connectapi.garmin.com/"),
    );
    assert.equal(options.redirect, "error");
    if (String(url).includes("personal-api-key/token")) {
      state.exchanges++;
      assert.equal(options.headers.Authorization, "ApiKey private-api-key");
      return {
        ok: !state.invalidKey,
        status: state.invalidKey ? 401 : 200,
        text: async () => (state.invalidToken ? "malformed-token" : jwt()),
      };
    }
    state.reads++;
    assert.ok(options.headers.Authorization.startsWith("Bearer header."));
    if (state.unauthorized) {
      state.unauthorized = false;
      return { ok: false, status: 401 };
    }
    if (String(url).includes("dailysummaries"))
      return {
        ok: !state.healthFailure,
        status: state.healthFailure ? 503 : 200,
        json: async () => ({
          data: [
            {
              calendarDate: "2026-10-31",
              movement: { steps: { value: 10000 } },
              heartRate: { restingValue: 50 },
              bodyBattery: { minValue: 20, maxValue: 90 },
            },
          ],
        }),
      };
    assert.ok(
      String(url).includes("start=") && String(url).includes("limit=100"),
    );
    const activity = {
      activityId: 42,
      activityName: "Morning run",
      startTimeGMT: "2026-10-31 12:00:00",
      distance: 5000,
      duration: 1800,
      activityType: { typeKey: "running" },
    };
    return {
      ok: true,
      status: 200,
      json: async () =>
        state.nextPage
          ? Array.from({ length: 100 }, (_, i) => ({
              ...activity,
              activityId: i + 1,
            }))
          : [activity],
    };
  };
  async function invoke(
    route,
    { id = 123, method = "POST", body = {}, requestOrigin = origin } = {},
  ) {
    let code, text;
    const token = sign({
      v: 2,
      sub: `strava:${id}`,
      exp: Date.now() / 1000 + 600,
    });
    await handler(
      {
        url: `/api/sync?route=${route}`,
        method,
        body,
        headers: {
          origin: requestOrigin,
          cookie: id ? `rg_session=${token}` : "",
        },
      },
      {
        writeHead(s) {
          code = s;
        },
        end(s) {
          text = s;
        },
      },
    );
    return { status: code, data: JSON.parse(text) };
  }
  try {
    await fn({ state, values, hashes, invoke });
  } finally {
    global.fetch = original;
    for (const k of Object.keys(process.env))
      if (!(k in saved)) delete process.env[k];
    Object.assign(process.env, saved);
  }
}
test("personal sync is owner-only, requires configured binding, session and matching origin", () =>
  harness(async ({ state, invoke }) => {
    assert.equal(
      (await invoke("garmin-personal-import", { id: 456 })).status,
      403,
    );
    assert.equal(
      (await invoke("garmin-personal-import", { id: 0 })).status,
      401,
    );
    assert.equal(
      (
        await invoke("garmin-personal-import", {
          requestOrigin: "https://evil.test",
        })
      ).status,
      403,
    );
    delete process.env.GARMIN_PERSONAL_STRAVA_ID;
    assert.equal((await invoke("garmin-personal-import")).status, 403);
    assert.equal(state.exchanges, 0);
    assert.equal(state.reads, 0);
  }));
test("personal import encrypts and isolates data, caches tokens and deduplicates repeated imports", () =>
  harness(async ({ state, values, hashes, invoke }) => {
    const first = await invoke("garmin-personal-import");
    assert.equal(first.status, 200);
    assert.equal(first.data.imported, 1);
    assert.equal(first.data.nextStart, null);
    const scope = "runninggem:users:strava:123:";
    assert.equal(decrypt(values.get(scope + "health"))[0].steps, 10000);
    assert.equal(decrypt(values.get(scope + "health"))[0].restingHeartRate, 50);
    assert.ok(!values.get(scope + "garmin-personal-token").includes("header."));
    await invoke("garmin-personal-import");
    assert.equal(state.exchanges, 1);
    assert.equal(hashes.get(scope + "activities").size, 1);
    const history = await invoke("history", { method: "GET" });
    assert.equal(history.data.activities.length, 1);
    const other = await invoke("history", { method: "GET", id: 456 });
    assert.equal(other.data.activities.length, 0);
    const status = await invoke("status", { method: "GET", id: 456 });
    assert.equal(status.data.garminPersonalAvailable, false);
    assert.ok(!JSON.stringify(status).includes("private-api-key"));
  }));
test("expired/rejected tokens renew once, pagination is validated, health failures preserve old data", () =>
  harness(async ({ state, values, invoke }) => {
    assert.equal(
      (await invoke("garmin-personal-import", { body: { start: -1 } })).status,
      400,
    );
    assert.equal(
      (await invoke("garmin-personal-import", { body: { start: 1 } })).status,
      400,
    );
    await invoke("garmin-personal-import");
    const health = values.get("runninggem:users:strava:123:health");
    state.unauthorized = true;
    state.healthFailure = true;
    const next = await invoke("garmin-personal-import");
    assert.equal(next.status, 200);
    assert.ok(next.data.warning);
    assert.equal(values.get("runninggem:users:strava:123:health"), health);
    assert.equal(state.exchanges, 2);
    state.nextPage = true;
    assert.equal(
      (await invoke("garmin-personal-import", { body: { start: 100 } })).data
        .nextStart,
      200,
    );
  }));
test("invalid tokens and expired API keys return safe errors and release import locks", () =>
  harness(async ({ state, values, invoke }) => {
    state.invalidKey = true;
    let result = await invoke("garmin-personal-import");
    assert.equal(result.status, 502);
    assert.ok(!JSON.stringify(result).includes("private-api-key"));
    assert.equal(
      values.has("runninggem:users:strava:123:garmin-personal-lock"),
      false,
    );
    state.invalidKey = false;
    state.invalidToken = true;
    result = await invoke("garmin-personal-import");
    assert.equal(result.status, 502);
  }));
test("clearing personal imports preserves Strava data and removes cached Garmin tokens", () =>
  harness(async ({ hashes, values, invoke }) => {
    await invoke("garmin-personal-import");
    const scope = "runninggem:users:strava:123:";
    hashes.get(scope + "activities").set("strava:1", "retained");
    assert.equal((await invoke("garmin-personal-clear")).status, 200);
    assert.deepEqual(
      [...hashes.get(scope + "activities").keys()],
      ["strava:1"],
    );
    assert.equal(values.has(scope + "garmin-personal-token"), false);
    assert.equal(values.has(scope + "health"), false);
  }));
test("health fields follow Garmin v2 nested schema and preserve missing values", () => {
  const day = normalizeHealth({
    data: [{ calendarDate: "2026-10-31", movement: { steps: { value: 0 } } }],
  })[0];
  assert.equal(day.steps, 0);
  assert.equal(day.restingHeartRate, null);
  assert.equal(day.bodyBatteryHigh, null);
  assert.throws(() => normalizeHealth([]));
});
