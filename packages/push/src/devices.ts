import { eq, inArray } from "drizzle-orm";
import type { Database } from "@clubedge/db";
import { pushDevices } from "./schema";
import type {
  PushDevice,
  PushMessage,
  PushPlatform,
  PushProvider,
  PushResult,
  PushService,
} from "./types";

/** The push tokens of the app's users, in the push_devices table. */
export function createPushDevices(db: Database) {
  return {
    /** Saves the token for the user; a token saved for someone else moves to this user. */
    async register(userId: string, device: PushDevice): Promise<void> {
      const { token, service, platform } = device;
      await db
        .insert(pushDevices)
        .values({ token, userId, service, platform })
        .onConflictDoUpdate({
          target: pushDevices.token,
          set: { userId, service, platform, updatedAt: new Date() },
        });
    },

    /** Forgets a token, such as when the app signs out or turns notifications off. */
    async remove(token: string): Promise<void> {
      await db.delete(pushDevices).where(eq(pushDevices.token, token));
    },

    /** The user's devices, oldest first. */
    async forUser(userId: string): Promise<PushDevice[]> {
      const rows = await db
        .select({
          token: pushDevices.token,
          service: pushDevices.service,
          platform: pushDevices.platform,
        })
        .from(pushDevices)
        .where(eq(pushDevices.userId, userId))
        .orderBy(pushDevices.createdAt);
      return rows.map((row) => ({
        token: row.token,
        service: row.service as PushService,
        platform: row.platform as PushPlatform,
      }));
    },

    /** Forgets tokens a push service refused for good. */
    async removeTokens(tokens: string[]): Promise<void> {
      if (tokens.length === 0) return;
      await db.delete(pushDevices).where(inArray(pushDevices.token, tokens));
    },
  };
}

export type PushDevices = ReturnType<typeof createPushDevices>;

/**
 * Sends a notification to each of the user's devices the provider reaches, then forgets the
 * tokens the push service says will never work again.
 */
export async function sendToUser(
  devices: PushDevices,
  provider: PushProvider,
  userId: string,
  message: PushMessage,
): Promise<PushResult> {
  const reachable = (await devices.forUser(userId)).filter((device) =>
    provider.services.includes(device.service),
  );
  if (reachable.length === 0) return { sent: 0, invalidTokens: [] };
  const result = await provider.send(reachable, message);
  await devices.removeTokens(result.invalidTokens);
  return result;
}
