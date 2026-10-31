import { AsyncLocalStorage } from "node:async_hooks";
const userContext = new AsyncLocalStorage();
export const withUser = (subject, fn) => userContext.run(subject, fn);
export const globalKey = (name) => `runninggem:auth:v2:${name}`;
export async function redis(...command) {
  const url = process.env.UPSTASH_REDIS_REST_URL,
    token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token)
    throw new Error("Persistent sync storage is not configured");
  const r = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(command),
    signal: AbortSignal.timeout(12000),
  });
  if (!r.ok) throw new Error("Sync storage unavailable");
  const data = await r.json();
  if (data.error) throw new Error("Sync storage failed");
  return data.result;
}
export function key(name) {
  const subject = userContext.getStore();
  if (!/^strava:[1-9][0-9]*$/.test(subject || ""))
    throw new Error("Authenticated athlete scope required");
  return `runninggem:users:${subject}:${name}`;
}
