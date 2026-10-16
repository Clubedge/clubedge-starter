import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

/** App-owned profile data. Credentials stay with the auth provider. */
export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  // The auth provider's user id: a UUID for Supabase and Better Auth, other strings elsewhere.
  authUserId: text("auth_user_id").unique(),
  email: text("email").notNull().unique(),
  displayName: text("display_name"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
