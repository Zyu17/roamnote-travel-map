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

export const accounts = sqliteTable("accounts", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  // Client-side PBKDF2 proof, hashed again with a server-side random salt.
  passwordHash: text("password_hash"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

export const emailCodes = sqliteTable("email_codes", {
  email: text("email").primaryKey(),
  codeHash: text("code_hash").notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
  sentAt: integer("sent_at", { mode: "timestamp_ms" }).notNull(),
  attempts: integer("attempts").notNull().default(0),
});

export const authSessions = sqliteTable("auth_sessions", {
  tokenHash: text("token_hash").primaryKey(),
  accountId: text("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [index("auth_sessions_account_idx").on(table.accountId)]);

export const authRateLimits = sqliteTable("auth_rate_limits", {
  key: text("key").primaryKey(),
  windowStart: integer("window_start", { mode: "timestamp_ms" }).notNull(),
  count: integer("count").notNull().default(0),
});
