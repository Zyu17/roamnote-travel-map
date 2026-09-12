import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

// The application starts with one JSON snapshot per journey so the current
// planner can be persisted without losing any locally-created fields. These
// tables are isolated to Roamnote's own D1 database.
export const travelPlans = sqliteTable("travel_plans", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id").notNull(),
  title: text("title").notNull(),
  startDate: text("start_date"),
  endDate: text("end_date"),
  shareCode: text("share_code").notNull(),
  snapshot: text("snapshot").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [
  uniqueIndex("travel_plans_share_code_unique").on(table.shareCode),
  index("travel_plans_owner_updated_idx").on(table.ownerId, table.updatedAt),
]);

export const travelPlanMembers = sqliteTable("travel_plan_members", {
  id: text("id").primaryKey(),
  planId: text("plan_id").notNull().references(() => travelPlans.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull(),
  role: text("role", { enum: ["owner", "editor", "viewer"] }).notNull().default("viewer"),
  joinedAt: integer("joined_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [
  uniqueIndex("travel_plan_members_plan_user_unique").on(table.planId, table.userId),
]);

export const travelComments = sqliteTable("travel_comments", {
  id: text("id").primaryKey(),
  planId: text("plan_id").notNull().references(() => travelPlans.id, { onDelete: "cascade" }),
  authorId: text("author_id").notNull(),
  body: text("body").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [index("travel_comments_plan_created_idx").on(table.planId, table.createdAt)]);
