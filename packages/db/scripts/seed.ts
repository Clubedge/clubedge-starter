import { createDb } from "../src/client";
import { users } from "../src/schema";
import { requireDatabaseUrl } from "./load-env";

const db = createDb({ url: requireDatabaseUrl("seed the database") });
try {
  await db
    .insert(users)
    .values({ email: "hello@example.com", displayName: "Starter User" })
    .onConflictDoNothing();
  console.info("Seed complete.");
} finally {
  await db.$client.end();
}
