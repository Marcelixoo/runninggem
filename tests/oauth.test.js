import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import handler from "../lib/sync-core.js";
import { sign, verify, decrypt, session } from "../lib/security.js";
import { key, withUser } from "../lib/store.js";
const origin = "https://runninggem.test";
const workout = {
  title: "Easy",
  date: "2026-11-05",
  steps: [{ kind: "interval", seconds: 1200, target: "open" }],
};
const signed = (id) =>
  sign({ v: 2, sub: "strava:" + id, exp: Date.now() / 1000 + 600 });
async function harness(fn) {
  Object.assign(process.env, {
    SESSION_SECRET: "ab".repeat(32),
    APP_URL: origin,
    UPSTASH_REDIS_REST_URL: "https://redis.test",
    UPSTASH_REDIS_REST_TOKEN: "test",
    STRAVA_CLIENT_ID: "client",
    STRAVA_CLIENT_SECRET: "secret",
    GARMIN_CLIENT_ID: "g-client",
    GARMIN_CLIENT_SECRET: "g-secret",
  });
  delete process.env.PILOT_PASSWORD;
  const original = global.fetch,
    values = new Map(),
    hashes = new Map(),
    calls = [];
  let stravaId = 123;
  global.fetch = async (url, opts = {}) => {
    calls.push({ url: String(url), opts });
    if (String(url) === "https://redis.test") {
      const [command, k, ...args] = JSON.parse(opts.body);
      let result = null;
      if (command === "GET") result = values.get(k) || null;
      if (command === "GETDEL") {
        result = values.get(k) || null;
        values.delete(k);
      }
      if (command === "EXISTS") result = values.has(k) ? 1 : 0;
      if (command === "INCR") {
        result = Number(values.get(k) || 0) + 1;
        values.set(k, result);
      }
      if (command === "EXPIRE") result = 1;
      if (command === "SET") {
        if (args.includes("NX") && values.has(k)) result = null;
        else {
          values.set(k, args[0]);
          result = "OK";
        }
      }
      if (command === "DEL") {
        for (const item of [k, ...args]) values.delete(item);
        result = 1;
      }
      if (command === "HSET") {
        if (!hashes.has(k)) hashes.set(k, new Map());
        hashes.get(k).set(args[0], args[1]);
        result = 1;
      }
      if (command === "HVALS") result = [...(hashes.get(k)?.values() || [])];
      if (command === "HGETALL")
        result = [...(hashes.get(k)?.entries() || [])].flat();
      return { ok: true, json: async () => ({ result }) };
    }
    let result;
    if (String(url) === "https://www.strava.com/oauth/token")
      result = {
        athlete: { id: stravaId, firstname: "Athlete" },
        access_token: "private-access",
        refresh_token: "private-refresh",
        expires_at: Date.now() / 1000 + 3600,
      };
    else if (String(url).includes("di-oauth2-service/oauth/token"))
      result = {
        access_token: "garmin-access",
        refresh_token: "garmin-refresh",
        expires_in: 86400,
      };
    else if (String(url).endsWith("/user/id"))
      result = { userId: "garmin-user" };
    else if (String(url).endsWith("/user/permissions"))
      result = ["ACTIVITY_EXPORT", "WORKOUT_IMPORT"];
    else if (String(url).endsWith("/user/registration"))
      return { ok: true, status: 204 };
    else throw new Error("Unexpected remote URL " + url);
    return { ok: true, status: 200, json: async () => result };
  };
  async function invoke(
    route,
    { method = "GET", body, token, cookie = "" } = {},
  ) {
    let status = 200,
      headers = {},
      text = "";
    const req = {
      url: "/api/sync?route=" + route,
      method,
      body,
      headers: {
        origin,
        cookie: [token ? "rg_session=" + token : "", cookie]
          .filter(Boolean)
          .join("; "),
        "x-forwarded-for": "test",
      },
    };
    const res = {
      setHeader(k, v) {
        headers[k] = v;
      },
      writeHead(s, h) {
        status = s;
        Object.assign(headers, h);
      },
      end(t) {
        text = t || "";
      },
    };
    await handler(req, res);
    return { status, headers, data: text ? JSON.parse(text) : null };
  }
  try {
    await fn({
      invoke,
      values,
      hashes,
      calls,
      setStravaId: (id) => (stravaId = id),
    });
  } finally {
    global.fetch = original;
  }
}
function authCookie(result) {
  return result.headers["Set-Cookie"].split(";")[0];
}
function callbackRoute(provider, state) {
  return `${provider}-callback&state=${state}&code=test-code&scope=read,activity:read_all`;
}
test("Strava social login works without pilot password and derives identity from provider response", async () =>
  harness(async ({ invoke, values }) => {
    const start = await invoke("strava-connect");
    assert.equal(start.status, 302);
    const target = new URL(start.headers.Location);
    assert.equal(target.origin, "https://www.strava.com");
    assert.ok(target.searchParams.get("scope").includes("activity:read_all"));
    const state = target.searchParams.get("state"),
      cookie = authCookie(start);
    const done = await invoke(
      callbackRoute("strava", state) + "&athlete_id=999",
      { cookie },
    );
    assert.equal(done.status, 302);
    const sessionCookie = done.headers["Set-Cookie"].find((c) =>
      c.startsWith("rg_session="),
    );
    const token = sessionCookie.split(";")[0].split("=")[1];
    assert.equal(verify(token).sub, "strava:123");
    assert.match(sessionCookie, /HttpOnly/);
    assert.match(sessionCookie, /Secure/);
    assert.equal(
      decrypt(values.get("runninggem:users:strava:123:strava")).access_token,
      "private-access",
    );
    assert.ok(!JSON.stringify(done).includes("private-access"));
    assert.ok(!values.has("runninggem:pilot:strava"));
    const replay = await invoke(callbackRoute("strava", state), { cookie });
    assert.equal(replay.status, 400);
  }));
test("OAuth rejects missing state, wrong cookies, and changed signed-in account before token exchange", async () =>
  harness(async ({ invoke, calls }) => {
    assert.equal((await invoke("strava-callback&code=test")).status, 400);
    const start = await invoke("strava-connect", { token: signed(123) }),
      state = new URL(start.headers.Location).searchParams.get("state");
    assert.equal(
      (
        await invoke(callbackRoute("strava", state), {
          token: signed(456),
          cookie: authCookie(start),
        })
      ).status,
      400,
    );
    assert.equal(
      calls.filter((c) => c.url === "https://www.strava.com/oauth/token")
        .length,
      0,
    );
  }));
test("denied and incomplete consent do not establish app sessions", async () =>
  harness(async ({ invoke }) => {
    let start = await invoke("strava-connect"),
      state = new URL(start.headers.Location).searchParams.get("state");
    let done = await invoke(
      "strava-callback&state=" + state + "&error=access_denied",
      { cookie: authCookie(start) },
    );
    assert.equal(done.headers.Location, "/performance?auth=denied");
    assert.ok(
      !done.headers["Set-Cookie"].some((c) => c.startsWith("rg_session=")),
    );
    start = await invoke("strava-connect");
    state = new URL(start.headers.Location).searchParams.get("state");
    done = await invoke(
      "strava-callback&state=" + state + "&code=test&scope=read",
      { cookie: authCookie(start) },
    );
    assert.equal(done.status, 400);
  }));
test("Garmin consent uses PKCE and stores official tokens separately from the private adapter", async () =>
  harness(async ({ invoke, values, calls }) => {
    assert.equal((await invoke("garmin-connect")).status, 401);
    const token = signed(123),
      start = await invoke("garmin-connect", { token });
    assert.equal(start.status, 302);
    const target = new URL(start.headers.Location),
      state = target.searchParams.get("state");
    assert.equal(target.origin, "https://connect.garmin.com");
    assert.equal(target.searchParams.get("code_challenge_method"), "S256");
    assert.equal(target.searchParams.has("code_verifier"), false);
    const pending = decrypt(values.get("runninggem:auth:v2:oauth:" + state));
    assert.equal(
      target.searchParams.get("code_challenge"),
      createHash("sha256").update(pending.verifier).digest("base64url"),
    );
    const done = await invoke(callbackRoute("garmin", state), {
      token,
      cookie: authCookie(start),
    });
    assert.equal(done.status, 302);
    const exchange = calls.find((c) =>
      c.url.includes("di-oauth2-service/oauth/token"),
    );
    assert.equal(
      new URLSearchParams(exchange.opts.body).get("code_verifier"),
      pending.verifier,
    );
    const saved = decrypt(
      values.get("runninggem:users:strava:123:garmin-oauth"),
    );
    assert.equal(saved.userId, "garmin-user");
    assert.deepEqual(saved.permissions, ["ACTIVITY_EXPORT", "WORKOUT_IMPORT"]);
    assert.equal(values.has("runninggem:users:strava:123:garmin"), false);
    const status = await invoke("status", { token });
    assert.equal(status.data.garminAuthorized, true);
    assert.equal(status.data.garminConnected, false);
    assert.equal(
      (
        await invoke("disconnect", {
          method: "POST",
          token,
          body: { provider: "garmin" },
        })
      ).status,
      200,
    );
    assert.ok(
      calls.some(
        (c) =>
          c.url.endsWith("/user/registration") && c.opts.method === "DELETE",
      ),
    );
    assert.equal(values.has("runninggem:users:strava:123:garmin-oauth"), false);
  }));
test("athlete data is isolated across simultaneous requests and old shared pilot sessions are rejected", async () =>
  harness(async ({ invoke }) => {
    const [a, b] = await Promise.all([
      invoke("workouts", { method: "POST", token: signed(123), body: workout }),
      invoke("workouts", {
        method: "POST",
        token: signed(456),
        body: { ...workout, title: "Other athlete" },
      }),
    ]);
    assert.equal(a.status, 200);
    assert.equal(b.status, 200);
    const [first, second] = await Promise.all([
      invoke("workouts", { token: signed(123) }),
      invoke("workouts", { token: signed(456) }),
    ]);
    assert.deepEqual(
      first.data.workouts.map((w) => w.title),
      ["Easy"],
    );
    assert.deepEqual(
      second.data.workouts.map((w) => w.title),
      ["Other athlete"],
    );
    const old = sign({ role: "owner", exp: Date.now() / 1000 + 60 });
    assert.equal(session({ headers: { cookie: "rg_session=" + old } }), null);
    assert.equal((await invoke("workouts", { token: old })).status, 401);
    assert.throws(() => key("strava"));
    assert.equal(
      await withUser("strava:123", async () => key("strava")),
      "runninggem:users:strava:123:strava",
    );
  }));
test("switching Strava accounts cannot overwrite the current account connection", async () =>
  harness(async ({ invoke, setStravaId, values }) => {
    const token = signed(123),
      start = await invoke("strava-connect", { token }),
      state = new URL(start.headers.Location).searchParams.get("state");
    setStravaId(456);
    const done = await invoke(callbackRoute("strava", state), {
      token,
      cookie: authCookie(start),
    });
    assert.equal(done.status, 409);
    assert.ok(!values.has("runninggem:users:strava:123:strava"));
    assert.ok(!values.has("runninggem:users:strava:456:strava"));
  }));
