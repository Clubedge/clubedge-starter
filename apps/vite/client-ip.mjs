// The client's address, for rate limits, by the rules of getClientIp in @clubedge/core: the
// production image runs server.mjs without the workspace packages, so they are repeated here.
// SETUP.md ("Client addresses") explains CLIENT_IP_HEADER and TRUSTED_PROXY_HOPS.

// The characters of an HTTP token (RFC 9110), which header names are made of.
const headerName = /^[!#$%&'*+.^_`|~0-9a-z-]+$/;
const maxTrustedHops = 10;

/**
 * Reads CLIENT_IP_HEADER and TRUSTED_PROXY_HOPS, where unset or empty means neither. Throws on a
 * value that cannot be right.
 */
export function parseClientIpSettings(env) {
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

/** A header's value in Node.js's request headers, where a repeated header may come as a list. */
function headerValue(headers, name) {
  const value = headers[name];
  return Array.isArray(value) ? value.join(",") : value;
}

/**
 * The client's address, from Node.js's request headers. With `header`, that header's value
 * (its first entry, should it hold a list). With `trustedHops`, the x-forwarded-for entry that
 * many places from the end: the one the outermost of your proxies added; entries before it are
 * whatever the client sent, so they never count. Without either, or when the request lacks what
 * they name, the connection's own address, else "unknown". Without a connection address and
 * either setting, it trusts the nearest proxy, whose entry is the last.
 */
export function getClientIp(headers, options = {}) {
  const { header, socketAddress } = options;
  const trustedHops = options.trustedHops || (header || socketAddress !== undefined ? 0 : 1);
  let address;
  if (header) {
    address = headerValue(headers, header)?.split(",")[0];
  } else if (trustedHops > 0) {
    const entries = headerValue(headers, "x-forwarded-for")?.split(",") ?? [];
    address = entries[entries.length - trustedHops];
  }
  return (address?.trim() || socketAddress || "unknown").slice(0, 64);
}

/** This server's settings, read as it starts: a value that cannot be right stops it there. */
export const clientIpSettings = parseClientIpSettings(process.env);

/** The address of the client that sent `request`, a Node.js request, by this server's settings. */
export function clientIp(request) {
  return getClientIp(request.headers, {
    ...clientIpSettings,
    socketAddress: request.socket?.remoteAddress,
  });
}
