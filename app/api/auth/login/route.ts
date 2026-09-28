import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { accounts, authSessions } from "@/db/schema";
import { authRateLimited, isSameOrigin, normalizeEmail, randomToken, SESSION_AGE_MS, setSessionCookie, sha256 } from "@/lib/auth";
import { validPasswordProof, verifyPasswordProof } from "@/lib/password";

const DUMMY_HASH = `client-pbkdf2-sha256$600000$${"0".repeat(32)}$${"0".repeat(32)}$${"0".repeat(64)}`;

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ error: "请求来源不正确" }, { status: 403 });
  const payload = await request.json().catch(() => null) as { email?: unknown; proof?: unknown } | null;
  const email = normalizeEmail(payload?.email);
  if (!email || !validPasswordProof(payload?.proof)) return Response.json({ error: "邮箱或密码不正确" }, { status: 401 });

  try {
    if (await authRateLimited(request, "login", email)) return Response.json({ error: "登录尝试过于频繁，请 15 分钟后再试" }, { status: 429 });
    const row = await getDb().select({ id: accounts.id, email: accounts.email, passwordHash: accounts.passwordHash })
      .from(accounts).where(eq(accounts.email, email)).get();
    const passwordMatches = await verifyPasswordProof(payload.proof, row?.passwordHash ?? DUMMY_HASH);
    if (!row || !passwordMatches) {
      return Response.json({ error: "邮箱或密码不正确" }, { status: 401 });
    }
    const now = new Date();
    const token = randomToken();
    await getDb().insert(authSessions).values({ tokenHash: await sha256(token), accountId: row.id, expiresAt: new Date(now.getTime() + SESSION_AGE_MS), createdAt: now });
    return setSessionCookie(Response.json({ account: { id: row.id, email: row.email } }), token, request);
  } catch {
    return Response.json({ error: "登录服务暂不可用，请稍后再试" }, { status: 503 });
  }
}
