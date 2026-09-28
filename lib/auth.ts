import { and, eq, gt, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { accounts, authRateLimits, authSessions } from "@/db/schema";

export const SESSION_COOKIE = "roamnote_session";
export const SESSION_AGE_MS = 30 * 24 * 60 * 60 * 1000;

export function normalizeEmail(value: unknown) {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

export function isLegacyId(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{12,80}$/.test(value);
}

export function isSameOrigin(request: Request) {
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "none") return false;
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(request.url).origin;
}

export function randomToken(bytes = 32) {
  const array = crypto.getRandomValues(new Uint8Array(bytes));
  return Array.from(array, (part) => part.toString(16).padStart(2, "0")).join("");
}

export async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (part) => part.toString(16).padStart(2, "0")).join("");
}

export async function authRateLimited(request: Request, action: "login" | "register" | "invite", email: string) {
  const now = Date.now();
  const windowMs = action === "register" ? 60 * 60_000 : 15 * 60_000;
  const ip = request.headers.get("cf-connecting-ip") ?? "unknown";
  // Count invitation attempts before comparison. Changing the email must not
  // bypass the short-code guessing limit for the same network address.
  const checks = action === "invite" ? [
    { key: `invite:ip:${await sha256(ip)}`, limit: 5 },
  ] : [
    { key: `${action}:email:${await sha256(email)}`, limit: action === "login" ? 12 : 3 },
    { key: `${action}:ip:${await sha256(ip)}`, limit: action === "login" ? 60 : 20 },
  ];
  const db = getDb();
  for (const { key, limit } of checks) {
    await db.insert(authRateLimits).values({ key, windowStart: new Date(now), count: 1 }).onConflictDoUpdate({
      target: authRateLimits.key,
      set: {
        windowStart: sql`CASE WHEN ${authRateLimits.windowStart} < ${now - windowMs} THEN ${now} ELSE ${authRateLimits.windowStart} END`,
        count: sql`CASE WHEN ${authRateLimits.windowStart} < ${now - windowMs} THEN 1 ELSE ${authRateLimits.count} + 1 END`,
      },
    });
    const row = await db.select({ count: authRateLimits.count }).from(authRateLimits).where(eq(authRateLimits.key, key)).get();
    if (row && row.count > limit) return true;
  }
  return false;
}

function sessionToken(request: Request) {
  const match = request.headers.get("cookie")?.match(/(?:^|;\s*)roamnote_session=([a-f0-9]{64})(?:;|$)/);
  return match?.[1] ?? null;
}

export async function getAccount(request: Request) {
  const token = sessionToken(request);
  if (!token) return null;
  const tokenHash = await sha256(token);
  const row = await getDb().select({ id: accounts.id, email: accounts.email })
    .from(authSessions).innerJoin(accounts, eq(authSessions.accountId, accounts.id))
    .where(and(eq(authSessions.tokenHash, tokenHash), gt(authSessions.expiresAt, new Date())))
    .get();
  return row ?? null;
}

export async function revokeSession(request: Request) {
  const token = sessionToken(request);
  if (token) await getDb().delete(authSessions).where(eq(authSessions.tokenHash, await sha256(token)));
}

export function setSessionCookie(response: Response, token: string, request: Request) {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  response.headers.append("Set-Cookie", `${SESSION_COOKIE}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_AGE_MS / 1000}${secure}`);
  return response;
}

export function clearSessionCookie(response: Response, request: Request) {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  response.headers.append("Set-Cookie", `${SESSION_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${secure}`);
  return response;
}

export function unauthorized() {
  return Response.json({ error: "请先登录邮箱账户" }, { status: 401, headers: { "Cache-Control": "private, no-store" } });
}
