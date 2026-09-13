import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { travelPlans } from "@/db/schema";

function isOwnerId(value: string | null): value is string {
  return Boolean(value && /^[A-Za-z0-9_-]{12,80}$/.test(value));
}

export async function GET(request: Request) {
  const ownerId = new URL(request.url).searchParams.get("owner");
  if (!isOwnerId(ownerId)) return Response.json({ error: "无效的行程库标识" }, { status: 400 });

  try {
    const rows = await getDb().select({
      id: travelPlans.id,
      title: travelPlans.title,
      startDate: travelPlans.startDate,
      endDate: travelPlans.endDate,
      snapshot: travelPlans.snapshot,
      updatedAt: travelPlans.updatedAt,
    }).from(travelPlans).where(eq(travelPlans.ownerId, ownerId)).orderBy(desc(travelPlans.updatedAt)).limit(50);

    const trips = rows.map((row) => {
      let planCount = 0;
      let coverUrl: string | null = null;
      try {
        const snapshot = JSON.parse(row.snapshot) as { plans?: Record<string, unknown[]>; coverUrl?: unknown };
        planCount = Object.values(snapshot.plans ?? {}).reduce((sum, items) => sum + (Array.isArray(items) ? items.length : 0), 0);
        coverUrl = typeof snapshot.coverUrl === "string" ? snapshot.coverUrl : null;
      } catch { /* A malformed legacy snapshot should not hide the whole library. */ }
      return { id: row.id, title: row.title, startDate: row.startDate, endDate: row.endDate, coverUrl, planCount, updatedAt: row.updatedAt };
    });
    return Response.json({ trips });
  } catch {
    return Response.json({ error: "暂时无法读取行程库" }, { status: 503 });
  }
}
