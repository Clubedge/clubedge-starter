import {
  boolean,
  index,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { users } from "@clubedge/db";

// Provider-neutral: every row names its provider, so another provider's adapter writes the same
// tables. Plans are the app's own ids, never a provider's price ids.

export const subscriptions = pgTable(
  "subscriptions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    providerCustomerId: text("provider_customer_id").notNull(),
    providerSubscriptionId: text("provider_subscription_id").notNull(),
    planId: text("plan_id"),
    status: text("status").notNull(),
    currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
    cancelAtPeriodEnd: boolean("cancel_at_period_end").default(false).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    // Ids are unique per provider, so two providers can never collide.
    unique("subscriptions_provider_subscription_unique").on(
      table.provider,
      table.providerSubscriptionId,
    ),
    index("subscriptions_user_id_idx").on(table.userId),
  ],
);

/** Webhook events already applied, so a redelivered event changes nothing. */
export const paymentEvents = pgTable(
  "payment_events",
  {
    provider: text("provider").notNull(),
    eventId: text("event_id").notNull(),
    processedAt: timestamp("processed_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [primaryKey({ columns: [table.provider, table.eventId] })],
);

export type Subscription = typeof subscriptions.$inferSelect;
