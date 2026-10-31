import {
  personalAccess,
  importPersonal,
  clearPersonal,
} from "./garmin-personal.js";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import {
  authenticated,
  cookie,
  session,
  encrypt,
  decrypt,
} from "./security.js";
import { redis, redisConfig, key, withUser } from "./store.js";
import {
  providerConfigured,
  startOAuth,
  finishOAuth,
  disconnectGarminOAuth,
} from "./oauth.js";
import {
  normalize,
  mergeActivities,
  garminWorkout,
  validateWorkout,
} from "../src/sync-model.js";
const configured = () =>
  process.env.APP_URL && process.env.SESSION_SECRET && redisConfig();
function reply(res, status, data) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  res.end(JSON.stringify(data));
}
async function body(req) {
  if (req.body && typeof req.body === "object") return req.body;
  let text = "";
  for await (const chunk of req) {
    text += chunk;
    if (text.length > 32000) throw new Error("Request too large");
  }
  return JSON.parse(text || "{}");
}
async function strava(path, options = {}) {
  const r = await fetch("https://www.strava.com" + path, {
    ...options,
    signal: AbortSignal.timeout(20000),
  });
  if (!r.ok) {
    const e = new Error(
      r.status === 429
        ? "Strava rate limit reached. Try later."
        : "Strava request failed. Reconnect if access expired.",
    );
    e.status = r.status === 429 ? 429 : 502;
    throw e;
  }
  return r.json();
}
async function token() {
  const raw = await redis("GET", key("strava"));
  if (!raw) throw new Error("Connect Strava first");
  let t = decrypt(raw);
  if (t.expires_at < Date.now() / 1000 + 120) {
    t = await strava("/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: process.env.STRAVA_CLIENT_ID,
        client_secret: process.env.STRAVA_CLIENT_SECRET,
        grant_type: "refresh_token",
        refresh_token: t.refresh_token,
      }),
    });
    await redis("SET", key("strava"), encrypt(t));
  }
  return t.access_token;
}
async function handleRequest(req, res) {
  try {
    const url = new URL(req.url, "http://localhost"),
      route = url.searchParams.get("route") || "status";
    if (route === "status") {
      const actor = session(req);
      const official =
        actor && configured() ? await redis("GET", key("garmin-oauth")) : null;
      return reply(res, 200, {
        configured: !!configured(),
        authenticated: !!actor,
        stravaConfigured: providerConfigured("strava"),
        garminOAuthConfigured: providerConfigured("garmin"),
        garminPersonalAvailable: personalAccess(actor?.sub),
        garminPersonalSetupRequired:
          !!actor &&
          !!process.env.GARMIN_CONNECT_API_KEY &&
          !process.env.GARMIN_PERSONAL_STRAVA_ID,
        experimentalGarminEnabled:
          process.env.ENABLE_EXPERIMENTAL_GARMIN === "true",
        ...(actor && configured()
          ? {
              athlete: actor.sub,
              stravaConnected: !!(await redis("EXISTS", key("strava"))),
              garminConnected: !!(await redis("EXISTS", key("garmin"))),
              garminAuthorized: !!official,
              garminPermissions: official
                ? decrypt(official).permissions
                : null,
            }
          : {}),
      });
    }
    if (!configured())
      return reply(res, 503, {
        error:
          "Account connections need server configuration. There is no pilot password.",
      });
    if (
      req.method !== "GET" &&
      req.headers.origin !== new URL(process.env.APP_URL).origin
    )
      return reply(res, 403, { error: "Request origin rejected" });
    if (
      req.method === "GET" &&
      [
        "strava-connect",
        "garmin-connect",
        "strava-callback",
        "garmin-callback",
      ].includes(route)
    ) {
      const provider = route.startsWith("strava") ? "strava" : "garmin";
      const result = route.endsWith("callback")
        ? await finishOAuth(provider, req, res, url)
        : await startOAuth(provider, req, res);
      if (result) return reply(res, result.status, { error: result.error });
      return;
    }
    if (route === "login")
      return reply(res, 410, {
        error: "Password login has been removed. Continue with Strava.",
      });
    if (!authenticated(req))
      return reply(res, 401, { error: "Sign in with Strava first" });
    if (route === "garmin-personal-import" && req.method === "POST")
      return reply(
        res,
        200,
        await importPersonal(session(req).sub, await body(req)),
      );
    if (route === "garmin-personal-clear" && req.method === "POST") {
      await clearPersonal(session(req).sub);
      return reply(res, 200, { ok: true });
    }
    if (route === "logout" && req.method === "POST") {
      res.setHeader("Set-Cookie", cookie("rg_session", "", 0));
      return reply(res, 200, { ok: true });
    }
    if (route === "strava-import" && req.method === "POST") {
      const lock = key("strava-lock"),
        lockId = randomBytes(16).toString("hex");
      if (!(await redis("SET", lock, lockId, "NX", "EX", 90)))
        return reply(res, 409, { error: "Strava sync is already running" });
      try {
        const b = await body(req),
          page = Number(b.page || 1);
        if (!Number.isInteger(page) || page < 1 || page > 1000)
          return reply(res, 400, { error: "Invalid history page" });
        const access = await token();
        const rows = await strava(
          `/api/v3/athlete/activities?per_page=100&page=${page}`,
          { headers: { Authorization: `Bearer ${access}` } },
        );
        for (const a of rows) {
          const n = normalize("strava", a);
          if (n) await redis("HSET", key("activities"), n.id, encrypt(n));
        }
        await redis("SET", key("strava-last"), new Date().toISOString());
        return reply(res, 200, {
          imported: rows.length,
          nextPage: rows.length === 100 ? page + 1 : null,
        });
      } finally {
        await redis(
          "EVAL",
          "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end",
          1,
          lock,
          lockId,
        );
      }
    }
    if (route === "history" && req.method === "GET") {
      const raw = await redis("HVALS", key("activities"));
      return reply(res, 200, {
        activities: mergeActivities((raw || []).map(decrypt)),
        health: (await redis("GET", key("health")))
          ? decrypt(await redis("GET", key("health")))
          : null,
        stravaLast: await redis("GET", key("strava-last")),
        garminLast: await redis("GET", key("garmin-last")),
      });
    }
    if (route === "disconnect" && req.method === "POST") {
      const b = await body(req);
      if (!["strava", "garmin"].includes(b.provider))
        return reply(res, 400, { error: "Invalid provider" });
      if (b.provider === "strava") {
        const raw = await redis("GET", key("strava"));
        if (raw) {
          const t = decrypt(raw);
          await strava("/oauth/deauthorize", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ access_token: t.access_token }),
          });
        }
      }
      await redis("DEL", key(b.provider), key(b.provider + "-last"));
      const raw = await redis("HGETALL", key("activities"));
      for (let i = 0; i < (raw || []).length; i += 2)
        if (raw[i].startsWith(b.provider + ":"))
          await redis("HDEL", key("activities"), raw[i]);
      if (b.provider === "garmin") {
        await disconnectGarminOAuth();
        await redis("DEL", key("health"), key("garmin-mfa"));
      }
      return reply(res, 200, { ok: true });
    }
    if (route === "workouts" && req.method === "GET") {
      const rows = await redis("HVALS", key("plans"));
      return reply(res, 200, {
        workouts: (rows || [])
          .map(decrypt)
          .sort((a, b) => a.date.localeCompare(b.date)),
      });
    }
    if (route === "workouts" && req.method === "POST") {
      const w = validateWorkout(await body(req)),
        id = randomUUID();
      await redis("HSET", key("plans"), id, encrypt({ ...w, id }));
      return reply(res, 200, { id });
    }
    if (route === "workout-preview" && req.method === "POST") {
      const b = validateWorkout(await body(req));
      return reply(res, 200, { workout: b, payload: garminWorkout(b) });
    }
    return reply(res, 404, { error: "Unknown sync operation" });
  } catch (e) {
    return reply(res, e.status || 502, {
      error:
        e.publicMessage ||
        (["Request too large"].includes(e.message)
          ? e.message
          : "Sync could not finish. Check connection and server configuration, then retry."),
    });
  }
}

export default async function handler(req, res) {
  return withUser(session(req)?.sub || null, () => handleRequest(req, res));
}
