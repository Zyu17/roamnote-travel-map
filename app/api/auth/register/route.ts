import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { accounts, authSessions } from "@/db/schema";
import { authRateLimited, isSameOrigin, normalizeEmail, randomToken, SESSION_AGE_MS, setSessionCookie, sha256 } from "@/lib/auth";
import { hashPasswordProof, validPasswordProof, validPasswordSalt } from "@/lib/password";

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ error: "请求来源不正确" }, { status: 403 });
  const payload = await request.json().catch(() => null) as { email?: unknown; proof?: unknown; clientSalt?: unknown; registrationCode?: unknown } | null;
  const email = normalizeEmail(payload?.email);
  if (!email || !validPasswordProof(payload?.proof) || !validPasswordSalt(payload?.clientSalt)) {
    return Response.json({ error: "邮箱或密码参数不正确" }, { status: 400 });
  }

  try {
    const expectedCode = process.env.REGISTRATION_CODE;
    if (!expectedCode || expectedCode.length < 24) {
      return Response.json({ error: "邀请注册尚未启用，请先配置注册码" }, { status: 503 });
    }
    if (typeof payload?.registrationCode !== "string" || payload.registrationCode.length > 256 ||
      !constantTimeEqual(await sha256(payload.registrationCode), await sha256(expectedCode))) {
      return Response.json({ error: "注册码不正确" }, { status: 403 });
    }
    if (await authRateLimited(request, "register", email)) return Response.json({ error: "注册尝试过于频繁，请稍后再试" }, { status: 429 });
    const db = getDb();
    const existing = await db.select({ id: accounts.id }).from(accounts).where(eq(accounts.email, email)).get();
    if (existing) return Response.json({ error: "该邮箱已注册，请直接登录" }, { status: 409 });
    const now = new Date();
    const account = { id: crypto.randomUUID(), email };
    const passwordHash = await hashPasswordProof(payload.proof, payload.clientSalt);
    const inserted = await db.insert(accounts).values({ ...account, passwordHash, createdAt: now, updatedAt: now }).onConflictDoNothing().run();
    if (!inserted.meta.changes) return Response.json({ error: "该邮箱已注册，请直接登录" }, { status: 409 });
    const token = randomToken();
    await db.insert(authSessions).values({ tokenHash: await sha256(token), accountId: account.id, expiresAt: new Date(now.getTime() + SESSION_AGE_MS), createdAt: now });
    return setSessionCookie(Response.json({ account }, { status: 201 }), token, request);
  } catch {
    return Response.json({ error: "注册服务暂不可用，请稍后再试" }, { status: 503 });
  }
}

function constantTimeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index++) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}
