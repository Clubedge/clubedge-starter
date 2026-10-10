import site from "./site.json";

/**
 * Project identity. Values live in site.json so tooling such as create-clubedge-app
 * can rename a project by editing data instead of rewriting source files.
 */
export interface SiteConfig {
  name: string;
  shortName: string;
  description: string;
  /** Machine-readable service name reported by health checks and logs. */
  serviceId: string;
  workspaceLabel: string;
  links: {
    repository: string;
    setupGuide: string;
  };
}

export const siteConfig: SiteConfig = site;
