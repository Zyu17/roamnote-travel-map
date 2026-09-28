import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { accounts } from "@/db/schema";
import { normalizeEmail, sha256 } from "@/lib/auth";
import { clientSaltFromHash } from "@/lib/password";

export async function GET(request: Request) {
  const email = normalizeEmail(new URL(request.url).searchParams.get("email"));
  if (!email) return Response.json({ error: "请输入有效邮箱" }, { status: 400 });
  try {
    const row = await getDb().select({ passwordHash: accounts.passwordHash }).from(accounts).where(eq(accounts.email, email)).get();
    // Return a stable fake salt for unknown accounts, without revealing whether
    // this email exists. The login endpoint gives the same failure either way.
    const salt = clientSaltFromHash(row?.passwordHash ?? null) ?? (await sha256(`roamnote-unknown-email:${email}`)).slice(0, 32);
    return Response.json({ salt }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return Response.json({ error: "登录服务暂不可用，请稍后再试" }, { status: 503 });
  }
}
