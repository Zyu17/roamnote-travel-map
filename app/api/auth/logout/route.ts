import { clearSessionCookie, isSameOrigin, revokeSession } from "@/lib/auth";

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ error: "请求来源不正确" }, { status: 403 });
  try { await revokeSession(request); }
  catch { return Response.json({ error: "退出登录失败，请稍后再试" }, { status: 503 }); }
  return clearSessionCookie(Response.json({ ok: true }), request);
}
