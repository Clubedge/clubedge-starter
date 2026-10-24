import "@tanstack/react-start/server-only";
import { getRequestIP } from "@tanstack/react-start/server";
import { getClientIp } from "@clubedge/core";
import { getClientIpSettings } from "@/env/server";

/**
 * The address of the client that sent `request`, for rate limits: where CLIENT_IP_HEADER and
 * TRUSTED_PROXY_HOPS say (SETUP.md, "Client addresses"), else the connection's address as the
 * server runtime reports it.
 */
export function clientIp(request: Request): string {
  return getClientIp(request.headers, { ...getClientIpSettings(), socketAddress: getRequestIP() });
}
