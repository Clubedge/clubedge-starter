/**
 * Where a server finds the client's address: CLIENT_IP_HEADER and TRUSTED_PROXY_HOPS, as
 * `parseClientIpSettings` reads them. With neither, it is the connection's own address.
 */
export interface ClientIpSettings {
  /** A header the host sets to the client's address, replacing any copy the client sent. */
  header?: string;
  /** How many reverse proxies you run in front of the server that append to x-forwarded-for. */
  trustedHops?: number;
}

export interface ClientIpOptions extends ClientIpSettings {
  /** The connection's own peer address, where the runtime exposes it. */
  socketAddress?: string;
}

// The characters of an HTTP token (RFC 9110), which header names are made of.
const headerName = /^[!#$%&'*+.^_`|~0-9a-z-]+$/;
const maxTrustedHops = 10;

/**
 * The client's address, for rate limiting. With `header`, that header's value (its first entry,
 * should it hold a list). With `trustedHops`, the x-forwarded-for entry that many places from the
 * end: the one the outermost of your proxies added; entries before it are whatever the client
 * sent, so they never count. Without either, or when the request lacks what they name, the
 * connection's own address, else "unknown". A runtime that gives no connection address, such as
 * Next.js, runs behind a host's edge or a proxy: without either setting, it trusts the nearest
 * one, whose entry is the last.
 */
export function getClientIp(headers: Pick<Headers, "get">, options: ClientIpOptions = {}): string {
  const { header, socketAddress } = options;
  const trustedHops = options.trustedHops || (header || socketAddress !== undefined ? 0 : 1);
  let address: string | undefined;
  if (header) {
    address = headers.get(header)?.split(",")[0];
  } else if (trustedHops > 0) {
    const entries = headers.get("x-forwarded-for")?.split(",") ?? [];
    address = entries[entries.length - trustedHops];
  }
  return (address?.trim() || socketAddress || "unknown").slice(0, 64);
}

/**
 * Reads CLIENT_IP_HEADER and TRUSTED_PROXY_HOPS, where unset or empty means neither. Throws on a
 * value that cannot be right, so a server set up wrongly stops at startup instead of limiting
 * requests by the wrong address.
 */
export function parseClientIpSettings(env: Record<string, string | undefined>): ClientIpSettings {
  const header = env.CLIENT_IP_HEADER?.trim() ?? "";
  const hops = env.TRUSTED_PROXY_HOPS?.trim() ?? "";
  if (header && !headerName.test(header.toLowerCase())) {
    throw new Error(`CLIENT_IP_HEADER must be a header name, such as x-real-ip, not "${header}"`);
  }
  if (hops && !(/^\d+$/.test(hops) && Number(hops) <= maxTrustedHops)) {
    throw new Error(
      `TRUSTED_PROXY_HOPS must be a whole number from 0 to ${maxTrustedHops}, not "${hops}"`,
    );
  }
  return { ...(header ? { header: header.toLowerCase() } : {}), trustedHops: Number(hops) };
}
