// What the website's Worker (./website.ts) asks the API every few minutes, apart from Cloudflare's
// runtime.

/**
 * The API's health check at `apiUrl`, the address the website calls the API at (its VITE_API_URL),
 * joined to it as the website joins its requests; undefined when there is no address. An address
 * that is not a web address is a mistake, which throws.
 */
export function healthUrl(apiUrl: string | undefined): string | undefined {
  const base = apiUrl?.trim().replace(/\/$/, "");
  if (!base) return undefined;
  const url = URL.parse(`${base}/api/health`);
  if (url?.protocol !== "https:" && url?.protocol !== "http:") {
    throw new Error(`API_URL is not a web address such as https://api.example.com: ${apiUrl}`);
  }
  return url.toString();
}
