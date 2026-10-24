import type { User } from "@clubedge/contract";
import { ensureUserId } from "@clubedge/db";
import { getDb } from "./db";

/** The app-owned users row id for a signed-in user, creating the row if needed. */
export async function getUserProfileId(user: Pick<User, "id" | "email">): Promise<string> {
  return ensureUserId(getDb(), { authUserId: user.id, email: user.email });
}
