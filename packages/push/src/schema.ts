import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "@clubedge/db";

/**
 * The devices each user gets notifications on: one row per push token. A token belongs to one
 * installed app, so signing in as someone else on that device moves it to them, and deleting the
 * user deletes their devices.
 */
export const pushDevices = pgTable(
  "push_devices",
  {
    token: text("token").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // expo, fcm, or apns: the service that delivers to the token.
    service: text("service").notNull(),
    // ios or android.
    platform: text("platform").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index("push_devices_user_id_idx").on(table.userId)],
);

export type PushDeviceRow = typeof pushDevices.$inferSelect;
