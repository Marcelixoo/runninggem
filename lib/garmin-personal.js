import { createHash, randomBytes } from "node:crypto";
import { redis, key } from "./store.js";
import { encrypt, decrypt } from "./security.js";
import { normalize } from "../src/sync-model.js";
const base = "https://personal.connectapi.garmin.com";
const failure = (status, message) =>
  Object.assign(new Error(message), { status, publicMessage: message });
export function personalAccess(subject) {
  const owner = process.env.GARMIN_PERSONAL_STRAVA_ID;
  return !!(
    process.env.GARMIN_CONNECT_API_KEY &&
    /^[1-9][0-9]*$/.test(owner || "") &&
    subject === `strava:${owner}`
  );
}
function requireOwner(subject) {
  if (!personalAccess(subject))
    throw failure(
      403,
      "Garmin personal sync is only available to its configured owner.",
    );
}
async function accessToken(force = false) {
  const apiKey = process.env.GARMIN_CONNECT_API_KEY;
  const fingerprint = createHash("sha256").update(apiKey).digest("hex");
  const raw = await redis("GET", key("garmin-personal-token"));
  if (raw && !force) {
    const cached = decrypt(raw);
    if (
      cached.fingerprint === fingerprint &&
      cached.expiresAt > Date.now() / 1000 + 3600
    )
      return cached.token;
  }
  const response = await fetch(
    base + "/personalapitoken-service/personal-api/personal-api-key/token",
    {
      method: "POST",
      headers: { Authorization: `ApiKey ${apiKey}` },
      signal: AbortSignal.timeout(20000),
      redirect: "error",
      cache: "no-store",
    },
  );
  if (!response.ok)
    throw failure(
      response.status === 429 ? 429 : 502,
      "Garmin could not authorize personal sync. Check the API key’s expiry and retry later.",
    );
  // Garmin's official client documents a raw JWT response, not an OAuth JSON object.
  const token = (await response.text()).trim();
  let expiresAt;
  try {
    expiresAt = JSON.parse(
      Buffer.from(token.split(".")[1], "base64url").toString(),
    ).exp;
  } catch {
    /* Reject malformed token without logging it. */
  }
  if (
    typeof expiresAt !== "number" ||
    !Number.isFinite(expiresAt) ||
    expiresAt <= Date.now() / 1000
  )
    throw failure(502, "Garmin returned an invalid access token.");
  expiresAt = Math.min(expiresAt, Date.now() / 1000 + 86400);
  await redis(
    "SET",
    key("garmin-personal-token"),
    encrypt({ token, expiresAt, fingerprint }),
    "EX",
    Math.ceil(expiresAt - Date.now() / 1000),
  );
  return token;
}
async function get(path, token, retry = true) {
  const response = await fetch(base + path, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    signal: AbortSignal.timeout(20000),
    redirect: "error",
    cache: "no-store",
  });
  if (response.status === 401 && retry)
    return get(path, await accessToken(true), false);
  if (!response.ok)
    throw failure(
      response.status === 429 ? 429 : 502,
      "Garmin data sync failed. Check your personal API access and retry later.",
    );
  return response.json();
}
const number = (value) =>
  typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : null;
export function normalizeHealth(payload) {
  if (!payload || !Array.isArray(payload.data))
    throw failure(502, "Garmin health data was unavailable.");
  return payload.data
    .filter((day) => /^\d{4}-\d{2}-\d{2}$/.test(day.calendarDate || ""))
    .map((day) => ({
      date: day.calendarDate,
      steps: number(
        day.movement?.steps?.value ?? day.movement?.steps ?? day.totalSteps,
      ),
      restingHeartRate: number(
        day.heartRate?.restingValue ?? day.restingHeartRate,
      ),
      bodyBatteryLow: number(
        day.bodyBattery?.minValue ?? day.bodyBatteryLowestValue,
      ),
      bodyBatteryHigh: number(
        day.bodyBattery?.maxValue ?? day.bodyBatteryHighestValue,
      ),
    }))
    .sort((a, b) => b.date.localeCompare(a.date));
}
export async function importPersonal(subject, input) {
  requireOwner(subject);
  const start = input.start ?? 0;
  if (
    !Number.isInteger(start) ||
    start < 0 ||
    start > 100000 ||
    start % 100 !== 0
  )
    throw failure(400, "Invalid Garmin history offset.");
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const begin = new Date(today + "T12:00:00Z");
  begin.setUTCDate(begin.getUTCDate() - 6);
  const lock = key("garmin-personal-lock"),
    lockId = randomBytes(16).toString("hex");
  if (!(await redis("SET", lock, lockId, "NX", "EX", 90)))
    throw failure(409, "Garmin sync is already running.");
  try {
    const token = await accessToken();
    const rows = await get(
      `/activitylist-service/activities/search/activities?start=${start}&limit=100`,
      token,
    );
    if (!Array.isArray(rows))
      throw failure(502, "Garmin returned an invalid activity list.");
    const activities = rows
      .map((row) => normalize("garmin", row))
      .filter(Boolean);
    if (activities.length)
      await redis(
        "HSET",
        key("activities"),
        ...activities.flatMap((activity) => [activity.id, encrypt(activity)]),
      );
    const imported = activities.length;
    let warning;
    if (start === 0) {
      try {
        const health = normalizeHealth(
          await get(
            `/usersummary-service/v2/dailysummaries?startDate=${begin.toISOString().slice(0, 10)}&endDate=${today}`,
            token,
          ),
        );
        await redis("SET", key("health"), encrypt(health));
      } catch {
        warning =
          "Activities imported, but health summaries could not refresh. Previously imported health data is preserved.";
      }
    }
    await redis("SET", key("garmin-last"), new Date().toISOString());
    return {
      imported,
      nextStart: rows.length === 100 ? start + 100 : null,
      ...(warning ? { warning } : {}),
    };
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
export async function clearPersonal(subject) {
  requireOwner(subject);
  await redis(
    "DEL",
    key("garmin-personal-token"),
    key("health"),
    key("garmin-last"),
  );
  const rows = await redis("HGETALL", key("activities"));
  for (let i = 0; i < (rows || []).length; i += 2)
    if (rows[i].startsWith("garmin:"))
      await redis("HDEL", key("activities"), rows[i]);
}
