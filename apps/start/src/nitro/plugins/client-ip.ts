import { definePlugin } from "nitro";
import { getClientIpSettings } from "@/env/server";

/**
 * Checks CLIENT_IP_HEADER and TRUSTED_PROXY_HOPS when the server starts, so a value that cannot
 * be right stops it there rather than at the first rate-limited request.
 */
export default definePlugin(() => {
  getClientIpSettings();
});
