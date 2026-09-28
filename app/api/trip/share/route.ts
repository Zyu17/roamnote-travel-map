import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { travelPlans } from "@/db/schema";
import { getAccount, unauthorized } from "@/lib/auth";

export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get("id");
  if (!id || !/^[A-Za-z0-9_-]{12,80}$/.test(id)) return Response.json({ error: "无效的行程标识" }, { status: 400 });
  try {
    const account = await getAccount(request);
    if (!account) return unauthorized();
    const row = await getDb().select({ shareCode: travelPlans.shareCode }).from(travelPlans)
      .where(and(eq(travelPlans.id, id), eq(travelPlans.ownerId, account.id))).get();
    if (!row) return Response.json({ error: "行程尚未保存或无权分享" }, { status: 404 });
    return Response.json({ shareCode: row.shareCode });
  } catch {
    return Response.json({ error: "暂时无法生成分享链接" }, { status: 503 });
  }
}
