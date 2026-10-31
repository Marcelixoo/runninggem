import {
  createHmac,
  timingSafeEqual,
  createHash,
  randomBytes,
  createCipheriv,
  createDecipheriv,
} from "node:crypto";
export const equal = (a, b) =>
  timingSafeEqual(
    createHash("sha256").update(String(a)).digest(),
    createHash("sha256").update(String(b)).digest(),
  );
export function secret() {
  const k = process.env.SESSION_SECRET;
  if (!/^[a-f0-9]{64}$/i.test(k || ""))
    throw new Error("SESSION_SECRET must be 32 random bytes encoded as hex");
  return Buffer.from(k, "hex");
}
export function sign(data) {
  const body = Buffer.from(JSON.stringify(data)).toString("base64url");
  return (
    body + "." + createHmac("sha256", secret()).update(body).digest("base64url")
  );
}
export function verify(value) {
  try {
    const [body, mac] = value.split(".");
    if (
      !equal(
        mac,
        createHmac("sha256", secret()).update(body).digest("base64url"),
      )
    )
      return null;
    const data = JSON.parse(Buffer.from(body, "base64url"));
    return data.exp > Date.now() / 1000 ? data : null;
  } catch {
    return null;
  }
}
export function encrypt(data) {
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", secret(), iv);
  const bytes = Buffer.concat([
    cipher.update(JSON.stringify(data)),
    cipher.final(),
  ]);
  return Buffer.concat([iv, bytes, cipher.getAuthTag()]).toString("base64");
}
export function decrypt(value) {
  const bytes = Buffer.from(value, "base64"),
    cipher = createDecipheriv("aes-256-gcm", secret(), bytes.subarray(0, 12));
  cipher.setAuthTag(bytes.subarray(-16));
  return JSON.parse(
    Buffer.concat([cipher.update(bytes.subarray(12, -16)), cipher.final()]),
  );
}
export function cookies(req) {
  return Object.fromEntries(
    (req.headers.cookie || "")
      .split(";")
      .map((s) => s.trim().split("="))
      .filter((a) => a.length === 2),
  );
}
export function cookie(name, value, age = 604800) {
  return `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${age}${process.env.APP_URL?.startsWith("https:") ? "; Secure" : ""}`;
}
export function session(req) {
  const s = verify(cookies(req).rg_session || "");
  return s?.v === 2 && /^strava:[1-9][0-9]*$/.test(s.sub || "") ? s : null;
}
export const authenticated = (req) => !!session(req);
