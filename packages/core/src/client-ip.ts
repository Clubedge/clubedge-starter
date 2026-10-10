/**
 * Best-effort client address for rate limiting. Forwarded headers are only trustworthy
 * behind a proxy that overwrites them (Vercel, Cloudflare, most load balancers).
 */
export function getClientIp(headers: Pick<Headers, "get">): string {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (forwarded) return forwarded.slice(0, 64);
  const realIp = headers.get("x-real-ip")?.trim();
  if (realIp) return realIp.slice(0, 64);
  return "unknown";
}
