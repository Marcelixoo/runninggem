import { randomBytes, createHash } from "node:crypto";
import {
  cookies,
  cookie,
  sign,
  verify,
  encrypt,
  decrypt,
  equal,
  session,
} from "./security.js";
import { redis, key, globalKey, withUser } from "./store.js";
export function providerConfigured(provider) {
  return !!(
    process.env[provider.toUpperCase() + "_CLIENT_ID"] &&
    process.env[provider.toUpperCase() + "_CLIENT_SECRET"]
  );
}
export const callback = (provider) =>
  process.env.APP_URL + `/api/sync?route=${provider}-callback`;
const cookieName = (provider) => "rg_oauth_" + provider;
export async function startOAuth(provider, req, res) {
  if (!providerConfigured(provider))
    return {
      status: 503,
      error: `${provider === "strava" ? "Strava" : "Garmin"} application credentials are not configured.`,
    };
  const actor = session(req)?.sub || null;
  if (provider === "garmin" && !actor)
    return { status: 401, error: "Sign in with Strava before linking Garmin." };
  const ip = createHash("sha256")
    .update(String(req.headers["x-forwarded-for"] || "unknown"))
    .digest("hex");
  const limit = globalKey("start:" + ip);
  const count = await redis("INCR", limit);
  if (count === 1) await redis("EXPIRE", limit, 600);
  if (count > 30)
    return {
      status: 429,
      error: "Too many sign-in attempts. Try again in a few minutes.",
    };
  const state = randomBytes(24).toString("hex"),
    verifier = randomBytes(32).toString("base64url");
  await redis(
    "SET",
    globalKey("oauth:" + state),
    encrypt({ provider, actor, verifier }),
    "EX",
    600,
  );
  res.setHeader(
    "Set-Cookie",
    cookie(
      cookieName(provider),
      sign({ state, provider, exp: Date.now() / 1000 + 600 }),
      600,
    ),
  );
  const target = new URL(
    provider === "strava"
      ? "https://www.strava.com/oauth/authorize"
      : "https://connect.garmin.com/oauth2Confirm",
  );
  const params = {
    client_id: process.env[provider.toUpperCase() + "_CLIENT_ID"],
    redirect_uri: callback(provider),
    response_type: "code",
    state,
    ...(provider === "strava"
      ? { scope: "read,activity:read_all", approval_prompt: "auto" }
      : {
          code_challenge: createHash("sha256")
            .update(verifier)
            .digest("base64url"),
          code_challenge_method: "S256",
        }),
  };
  for (const [k, v] of Object.entries(params)) target.searchParams.set(k, v);
  res.writeHead(302, { Location: target.href, "Cache-Control": "no-store" });
  res.end();
  return null;
}
async function remote(url, options = {}) {
  const r = await fetch(url, {
    ...options,
    signal: AbortSignal.timeout(20000),
  });
  if (!r.ok) {
    const e = new Error(
      "Provider authorization request failed. Please try again.",
    );
    e.status = r.status === 429 ? 429 : 502;
    throw e;
  }
  return r.status === 204 ? {} : r.json();
}
export async function finishOAuth(provider, req, res, url) {
  const state = url.searchParams.get("state"),
    saved = verify(cookies(req)[cookieName(provider)] || "");
  if (
    !state ||
    !saved ||
    saved.provider !== provider ||
    !equal(state, saved.state)
  )
    return {
      status: 400,
      error: "Authorization session expired or invalid. Start again.",
    };
  const raw = await redis("GETDEL", globalKey("oauth:" + state));
  if (!raw)
    return {
      status: 400,
      error: "Authorization link was already used or expired.",
    };
  const pending = decrypt(raw),
    actor = session(req)?.sub || null;
  if (pending.provider !== provider || pending.actor !== actor)
    return {
      status: 400,
      error: "Your sign-in session changed. Start authorization again.",
    };
  const headers = [cookie(cookieName(provider), "", 0)];
  if (url.searchParams.get("error")) {
    res.setHeader("Set-Cookie", headers);
    res.writeHead(302, {
      Location: "/performance?auth=denied",
      "Cache-Control": "no-store",
    });
    res.end();
    return null;
  }
  const code = url.searchParams.get("code");
  if (!code) return { status: 400, error: "Authorization code is missing." };
  if (provider === "strava") {
    const scopes = (url.searchParams.get("scope") || "").split(",");
    if (!scopes.includes("activity:read_all"))
      return {
        status: 400,
        error: "Approve activity access to connect Strava.",
      };
    const t = await remote("https://www.strava.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.STRAVA_CLIENT_ID,
        client_secret: process.env.STRAVA_CLIENT_SECRET,
        code,
        grant_type: "authorization_code",
        redirect_uri: callback("strava"),
      }).toString(),
    });
    if (
      !Number.isSafeInteger(t.athlete?.id) ||
      t.athlete.id < 1 ||
      !t.access_token ||
      !t.refresh_token
    )
      throw new Error("Invalid Strava token response");
    const subject = "strava:" + t.athlete.id;
    if (actor && actor !== subject)
      return {
        status: 409,
        error:
          "This Strava account is different from your signed-in account. Sign out before switching accounts.",
      };
    // Athlete identity comes from Strava's server response, never from the callback query.
    const profile = {
      id: subject,
      name: String(t.athlete.firstname || "Athlete").slice(0, 80),
    };
    await withUser(subject, async () => {
      await redis("SET", key("strava"), encrypt({ ...t, scope: scopes }));
      await redis("SET", key("profile"), encrypt(profile));
    });
    headers.push(
      cookie(
        "rg_session",
        sign({ v: 2, sub: subject, exp: Date.now() / 1000 + 604800 }),
      ),
    );
  } else {
    const t = await remote(
      "https://connectapi.garmin.com/di-oauth2-service/oauth/token",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          client_id: process.env.GARMIN_CLIENT_ID,
          client_secret: process.env.GARMIN_CLIENT_SECRET,
          code,
          code_verifier: pending.verifier,
          redirect_uri: callback("garmin"),
        }).toString(),
      },
    );
    if (
      !t.access_token ||
      !t.refresh_token ||
      !Number.isFinite(Number(t.expires_in))
    )
      throw new Error("Invalid Garmin token response");
    const auth = { Authorization: `Bearer ${t.access_token}` };
    const [identity, permissions] = await Promise.all([
      remote("https://apis.garmin.com/wellness-api/rest/user/id", {
        headers: auth,
      }),
      remote("https://apis.garmin.com/wellness-api/rest/user/permissions", {
        headers: auth,
      }),
    ]);
    if (typeof identity.userId !== "string" || !identity.userId)
      throw new Error("Invalid Garmin identity");
    // Prevent the same Garmin account being linked to different Strava identities.
    const binding = globalKey(
      "garmin-owner:" +
        createHash("sha256").update(identity.userId).digest("hex"),
    );
    const owner = await redis("GET", binding);
    if (owner && owner !== actor)
      return {
        status: 409,
        error: "This Garmin account is linked to another Runninggem account.",
      };
    if (!owner && !(await redis("SET", binding, actor, "NX")))
      return {
        status: 409,
        error: "Garmin account linking is already in progress. Try again.",
      };
    await withUser(actor, () =>
      redis(
        "SET",
        key("garmin-oauth"),
        encrypt({
          ...t,
          userId: identity.userId,
          permissions: (Array.isArray(permissions)
            ? permissions
            : Array.isArray(permissions?.permissions)
              ? permissions.permissions
              : []
          ).filter((p) => typeof p === "string"),
          expires_at: Date.now() / 1000 + Number(t.expires_in),
        }),
      ),
    );
  }
  res.setHeader("Set-Cookie", headers);
  res.writeHead(302, {
    Location: "/performance?auth=connected",
    "Cache-Control": "no-store",
  });
  res.end();
  return null;
}
export async function garminAccess() {
  let t = decrypt(await redis("GET", key("garmin-oauth")));
  if (t.expires_at < Date.now() / 1000 + 600) {
    const refreshed = await remote(
      "https://connectapi.garmin.com/di-oauth2-service/oauth/token",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          client_id: process.env.GARMIN_CLIENT_ID,
          client_secret: process.env.GARMIN_CLIENT_SECRET,
          refresh_token: t.refresh_token,
        }).toString(),
      },
    );
    if (!refreshed.access_token || !refreshed.refresh_token)
      throw new Error("Invalid Garmin refresh response");
    t = {
      ...t,
      ...refreshed,
      expires_at: Date.now() / 1000 + Number(refreshed.expires_in),
    };
    await redis("SET", key("garmin-oauth"), encrypt(t));
  }
  return t;
}
export async function disconnectGarminOAuth() {
  const saved = await redis("GET", key("garmin-oauth"));
  if (!saved) return;
  const t = await garminAccess();
  await remote("https://apis.garmin.com/wellness-api/rest/user/registration", {
    method: "DELETE",
    headers: { Authorization: `Bearer ${t.access_token}` },
  });
  await redis(
    "DEL",
    key("garmin-oauth"),
    globalKey(
      "garmin-owner:" + createHash("sha256").update(t.userId).digest("hex"),
    ),
  );
}
