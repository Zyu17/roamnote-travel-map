import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { travelPlans } from "@/db/schema";
import { getAccount, isSameOrigin, unauthorized } from "@/lib/auth";

const MAX_SNAPSHOT_BYTES = 900_000;

type TripSnapshotInput = {
  title?: unknown;
  coverUrl?: unknown;
  dateRange?: { start?: unknown; end?: unknown };
  plans?: unknown;
  favoriteIds?: unknown;
  comments?: unknown;
};

function isTripId(value: string | null): value is string {
  return Boolean(value && /^[A-Za-z0-9_-]{12,80}$/.test(value));
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
    const account = await getAccount(request);
    const row = await getDb().select({ title: travelPlans.title, snapshot: travelPlans.snapshot, updatedAt: travelPlans.updatedAt, ownerId: travelPlans.ownerId, shareCode: travelPlans.shareCode })
      .from(travelPlans)
      .where(eq(travelPlans.id, tripId))
      .get();
    if (!row) return Response.json({ error: "行程不存在" }, { status: 404 });
    const canEdit = Boolean(account && account.id === row.ownerId);
    const share = new URL(request.url).searchParams.get("share");
    if (!canEdit && share !== row.shareCode) return Response.json({ error: "无权查看此行程" }, { status: 403 });
    return Response.json({ title: row.title, snapshot: JSON.parse(row.snapshot), updatedAt: row.updatedAt, canEdit }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return Response.json({ error: "暂时无法读取云端行程" }, { status: 503 });
  }
}

export async function PUT(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ error: "请求来源不正确" }, { status: 403 });
  let payload: { id?: unknown; title?: unknown; snapshot?: unknown };
  try { payload = await request.json(); }
  catch { return Response.json({ error: "请求格式不正确" }, { status: 400 }); }

  if (!isTripId(typeof payload.id === "string" ? payload.id : null) || !validSnapshot(payload.snapshot)) {
    return Response.json({ error: "行程数据不完整" }, { status: 400 });
  }
  const tripId = payload.id as string;

  const snapshotText = JSON.stringify(payload.snapshot);
  if (new TextEncoder().encode(snapshotText).byteLength > MAX_SNAPSHOT_BYTES) {
    return Response.json({ error: "行程数据过大，请精简后再保存" }, { status: 413 });
  }

  const now = new Date();
  const title = typeof payload.title === "string" && payload.title.trim() ? payload.title.trim().slice(0, 60) : "我的旅行";
  try {
    const account = await getAccount(request);
    if (!account) return unauthorized();
    const existing = await getDb().select({ ownerId: travelPlans.ownerId }).from(travelPlans).where(eq(travelPlans.id, tripId)).get();
    if (existing && existing.ownerId !== account.id) return Response.json({ error: "无权修改此行程" }, { status: 403 });
    const values = { title, startDate: payload.snapshot.dateRange.start, endDate: payload.snapshot.dateRange.end, snapshot: snapshotText, updatedAt: now };
    if (existing) {
      await getDb().update(travelPlans).set(values).where(and(eq(travelPlans.id, tripId), eq(travelPlans.ownerId, account.id)));
    } else {
      await getDb().insert(travelPlans).values({ id: tripId, ownerId: account.id, shareCode: crypto.randomUUID(), createdAt: now, ...values });
    }
    return Response.json({ ok: true, updatedAt: now.toISOString() });
  } catch {
    return Response.json({ error: "暂时无法保存到云端" }, { status: 503 });
  }
}

export async function DELETE(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ error: "请求来源不正确" }, { status: 403 });
  const url = new URL(request.url);
  const tripId = url.searchParams.get("id");
  if (!isTripId(tripId)) return Response.json({ error: "无效的行程标识" }, { status: 400 });

  try {
    const account = await getAccount(request);
    if (!account) return unauthorized();
    const result = await getDb().delete(travelPlans).where(and(eq(travelPlans.id, tripId), eq(travelPlans.ownerId, account.id))).run();
    if (!result.meta.changes) return Response.json({ error: "行程不存在或无权删除" }, { status: 404 });
    return Response.json({ ok: true });
  } catch {
    return Response.json({ error: "暂时无法删除云端行程" }, { status: 503 });
  }
}
