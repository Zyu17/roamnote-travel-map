import { getAccount } from "@/lib/auth";

export async function GET(request: Request) {
  try { return Response.json({ account: await getAccount(request) }, { headers: { "Cache-Control": "private, no-store" } }); }
  catch { return Response.json({ error: "登录状态暂不可用" }, { status: 503 }); }
}
