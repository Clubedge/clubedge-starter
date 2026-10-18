import site from "./site.json";

/**
 * Project identity. Values live in site.json so create-clubedge-app can name the project by
 * editing data; the API reports serviceId from /api/health.
 */
export interface SiteConfig {
  name: string;
  shortName: string;
  description: string;
  serviceId: string;
}

export const siteConfig: SiteConfig = site;
