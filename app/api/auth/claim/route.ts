import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { accounts, travelPlans } from "@/db/schema";
import { getAccount, isLegacyId, isSameOrigin, unauthorized } from "@/lib/auth";

// A legacy device ID is a bearer capability stored in that browser. Claim once;
// subsequent account ownership cannot be changed by presenting the same ID.
export async function POST(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ error: "请求来源不正确" }, { status: 403 });
  const payload = await request.json().catch(() => null) as { deviceId?: unknown; legacyTripId?: unknown } | null;
  if (!isLegacyId(payload?.deviceId)) return Response.json({ error: "无效的旧设备标识" }, { status: 400 });
  try {
    const account = await getAccount(request);
    if (!account) return unauthorized();
    const existingAccount = await getDb().select({ id: accounts.id }).from(accounts).where(eq(accounts.id, payload.deviceId)).get();
    if (existingAccount) return Response.json({ error: "该标识已属于账户，不能作为旧设备认领" }, { status: 403 });
    const result = await getDb().update(travelPlans).set({ ownerId: account.id }).where(eq(travelPlans.ownerId, payload.deviceId)).run();
    let claimed = result.meta.changes;
    // Very early plans had a placeholder owner. The old browser's saved trip ID
    // is the only surviving capability for these legacy rows.
    if (isLegacyId(payload.legacyTripId)) {
      const legacy = await getDb().update(travelPlans).set({ ownerId: account.id })
        .where(and(eq(travelPlans.id, payload.legacyTripId), eq(travelPlans.ownerId, "link-owner"))).run();
      claimed += legacy.meta.changes;
    }
    return Response.json({ ok: true, claimed });
  } catch {
    return Response.json({ error: "旧行程迁移失败，请稍后重试" }, { status: 503 });
  }
}
