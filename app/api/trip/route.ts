import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { travelPlans } from "@/db/schema";

const MAX_SNAPSHOT_BYTES = 900_000;

type TripSnapshotInput = {
  title?: unknown;
  dateRange?: { start?: unknown; end?: unknown };
  plans?: unknown;
  favoriteIds?: unknown;
  comments?: unknown;
};

function isTripId(value: string | null): value is string {
  return Boolean(value && /^[A-Za-z0-9_-]{12,80}$/.test(value));
}

function isOwnerId(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{12,80}$/.test(value);
}

function validDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function validSnapshot(value: unknown): value is TripSnapshotInput & { dateRange: { start: string; end: string }; plans: Record<string, unknown[]> } {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const snapshot = value as TripSnapshotInput;
  return Boolean(
    snapshot.dateRange &&
    validDate(snapshot.dateRange.start) &&
    validDate(snapshot.dateRange.end) &&
    snapshot.plans &&
    typeof snapshot.plans === "object" &&
    !Array.isArray(snapshot.plans),
  );
}

export async function GET(request: Request) {
  const tripId = new URL(request.url).searchParams.get("id");
  if (!isTripId(tripId)) return Response.json({ error: "无效的行程标识" }, { status: 400 });

  try {
    const row = await getDb().select({ title: travelPlans.title, snapshot: travelPlans.snapshot, updatedAt: travelPlans.updatedAt })
      .from(travelPlans)
      .where(eq(travelPlans.id, tripId))
      .get();
    if (!row) return Response.json({ error: "行程不存在" }, { status: 404 });
    return Response.json({ title: row.title, snapshot: JSON.parse(row.snapshot), updatedAt: row.updatedAt });
  } catch {
    return Response.json({ error: "暂时无法读取云端行程" }, { status: 503 });
  }
}

export async function PUT(request: Request) {
  let payload: { id?: unknown; ownerId?: unknown; title?: unknown; snapshot?: unknown };
  try { payload = await request.json(); }
  catch { return Response.json({ error: "请求格式不正确" }, { status: 400 }); }

  if (!isTripId(typeof payload.id === "string" ? payload.id : null) || !isOwnerId(payload.ownerId) || !validSnapshot(payload.snapshot)) {
    return Response.json({ error: "行程数据不完整" }, { status: 400 });
  }

  const snapshotText = JSON.stringify(payload.snapshot);
  if (new TextEncoder().encode(snapshotText).byteLength > MAX_SNAPSHOT_BYTES) {
    return Response.json({ error: "行程数据过大，请精简后再保存" }, { status: 413 });
  }

  const now = new Date();
  const title = typeof payload.title === "string" && payload.title.trim() ? payload.title.trim().slice(0, 60) : "我的旅行";
  try {
    const existing = await getDb().select({ ownerId: travelPlans.ownerId }).from(travelPlans).where(eq(travelPlans.id, payload.id)).get();
    const ownerId = !existing || existing.ownerId === "link-owner" ? payload.ownerId : existing.ownerId;
    await getDb().insert(travelPlans).values({
      id: payload.id,
      ownerId,
      title,
      startDate: payload.snapshot.dateRange.start,
      endDate: payload.snapshot.dateRange.end,
      shareCode: payload.id,
      snapshot: snapshotText,
      createdAt: now,
      updatedAt: now,
    }).onConflictDoUpdate({
      target: travelPlans.id,
      set: {
        ownerId,
        title,
        startDate: payload.snapshot.dateRange.start,
        endDate: payload.snapshot.dateRange.end,
        snapshot: snapshotText,
        updatedAt: now,
      },
    });
    return Response.json({ ok: true, updatedAt: now.toISOString() });
  } catch {
    return Response.json({ error: "暂时无法保存到云端" }, { status: 503 });
  }
}
