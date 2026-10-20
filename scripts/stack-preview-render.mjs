#!/usr/bin/env node

const apiBase = "https://api.render.com/v1";
const token = process.env.RENDER_API_KEY;
const pr = process.env.PR_NUMBER;
const apiKind = process.env.API_KIND;

if (!token) throw new Error("RENDER_API_KEY is required.");
if (!pr || !/^\d+$/.test(pr)) throw new Error("PR_NUMBER must be a pull request number.");
if (!new Set(["hono", "fastapi"]).has(apiKind))
  throw new Error("API_KIND must be hono or fastapi.");

const serviceNames = {
  api: `clubedge-starter-vite-${apiKind}-pr-${pr}-api`,
  web: `clubedge-starter-vite-${apiKind}-pr-${pr}-web`,
};

async function render(path, init = {}) {
  const maxRateLimitWaitMs = 30_000;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await fetch(`${apiBase}${path}`, {
      ...init,
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...init.headers,
      },
    });
    const body = await response.text();
    if (response.ok) return body ? JSON.parse(body) : undefined;

    const reset = response.headers.get("ratelimit-reset");
    const resetSeconds = reset === null ? Number.NaN : Number(reset);
    const waitMs = resetSeconds * 1000 - Date.now() + 1_000;
    if (
      response.status === 429 &&
      attempt === 0 &&
      Number.isFinite(waitMs) &&
      waitMs > 0 &&
      waitMs <= maxRateLimitWaitMs
    ) {
      console.warn(
        `Render API rate-limited ${init.method ?? "GET"} ${path}; retrying once shortly.`,
      );
      await new Promise((resolve) => setTimeout(resolve, waitMs));
      continue;
    }

    const detail = body ? `: ${body}` : "";
    const resetAt =
      response.status === 429 && Number.isFinite(resetSeconds)
        ? ` Rate limit resets at ${new Date(resetSeconds * 1000).toISOString()}.`
        : "";
    throw new Error(
      `Render API ${init.method ?? "GET"} ${path} returned ${response.status}${detail}.${resetAt}`,
    );
  }
  throw new Error(`Render API ${init.method ?? "GET"} ${path} retry limit exceeded.`);
}

async function serviceEnvVars(serviceId) {
  const result = [];
  let cursor;
  do {
    const params = new URLSearchParams({ limit: "100" });
    if (cursor) params.set("cursor", cursor);
    const page = await render(`/services/${encodeURIComponent(serviceId)}/env-vars?${params}`);
    const entries = page ?? [];
    result.push(...entries);
    cursor = entries.length === 100 ? entries.at(-1)?.cursor : undefined;
  } while (cursor);
  return result;
}

async function ownerId() {
  if (process.env.RENDER_OWNER_ID) return process.env.RENDER_OWNER_ID;
  const owners = await render("/owners?limit=100");
  const ids = [...new Set(owners.map((entry) => entry.owner?.id ?? entry.id).filter(Boolean))];
  if (ids.length !== 1) {
    throw new Error(
      `RENDER_API_KEY can access ${ids.length} workspaces. Add the intended workspace ID as the GitHub Actions variable RENDER_OWNER_ID.`,
    );
  }
  return ids[0];
}

async function servicesNamed(owner, name) {
  const params = new URLSearchParams({ ownerId: owner, name, limit: "100" });
  const records = await render(`/services?${params}`);
  return records.map((entry) => entry.service ?? entry).filter((service) => service.name === name);
}

async function deleteServices(owner) {
  for (const name of Object.values(serviceNames)) {
    for (const service of await servicesNamed(owner, name)) {
      await render(`/services/${encodeURIComponent(service.id)}`, {
        method: "DELETE",
      });
      console.log(`Deleted Render service ${name}.`);
    }
  }
}

function envVars(entries) {
  return Object.entries(entries)
    .filter(([, value]) => value !== undefined && value !== null)
    .map(([key, value]) => ({ key, value: String(value) }));
}

async function createService(owner, name, dockerfilePath, variables, healthCheckPath) {
  const existing = (await servicesNamed(owner, name))[0];
  const desiredEnvVars = envVars(variables);
  if (existing) {
    const currentEnvVars = await serviceEnvVars(existing.id);
    const current = (currentEnvVars ?? [])
      .map((entry) => entry.envVar ?? entry)
      .map(({ key, value }) => ({ key, value: String(value) }))
      .sort((a, b) => a.key.localeCompare(b.key));
    const desired = [...desiredEnvVars].sort((a, b) => a.key.localeCompare(b.key));
    const envChanged = JSON.stringify(current) !== JSON.stringify(desired);
    if (envChanged) {
      await render(`/services/${encodeURIComponent(existing.id)}/env-vars`, {
        method: "PUT",
        body: JSON.stringify(desiredEnvVars),
      });
    }

    const updates = { autoDeployTrigger: "commit" };
    if (existing.repo !== `https://github.com/${process.env.REPOSITORY}`)
      updates.repo = `https://github.com/${process.env.REPOSITORY}`;
    if (existing.branch !== process.env.BRANCH) updates.branch = process.env.BRANCH;
    const serviceNeedsUpdate =
      existing.autoDeployTrigger !== "commit" || updates.repo || updates.branch;
    if (serviceNeedsUpdate) {
      await render(`/services/${encodeURIComponent(existing.id)}`, {
        method: "PATCH",
        body: JSON.stringify(updates),
      });
    }

    if (envChanged || serviceNeedsUpdate) {
      await render(`/services/${encodeURIComponent(existing.id)}/deploys`, {
        method: "POST",
        body: JSON.stringify({}),
      });
    }

    const url = existing.serviceDetails?.url;
    if (!url) throw new Error(`Existing Render service ${name} has no public URL.`);
    console.log(`Reusing Render service ${name}: ${url}`);
    return { ...existing, url };
  }

  const payload = {
    type: "web_service",
    name,
    ownerId: owner,
    repo: `https://github.com/${process.env.REPOSITORY}`,
    branch: process.env.BRANCH,
    autoDeployTrigger: "commit",
    envVars: envVars(variables),
    serviceDetails: {
      runtime: "docker",
      plan: "free",
      region: "frankfurt",
      healthCheckPath,
      envSpecificDetails: { dockerfilePath, dockerContext: "." },
    },
  };
  const result = await render("/services", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  const service = result.service ?? result;
  if (!service.id) throw new Error(`Render created ${name} without returning a service ID.`);
  const url = service.serviceDetails?.url;
  if (!url) throw new Error(`Render created ${name} without returning its public URL.`);
  console.log(`Created Render service ${name}: ${url}`);
  return { ...service, url };
}

async function waitForHealth(url, name) {
  const deadline = Date.now() + 20 * 60_000;
  let lastStatus = "no response";
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${url}/api/health`, {
        signal: AbortSignal.timeout(10_000),
      });
      lastStatus = `HTTP ${response.status}`;
      if (response.ok) {
        const health = await response.json();
        if (health.status === "ok") return;
      }
    } catch (error) {
      lastStatus = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 10_000));
  }
  throw new Error(
    `${name} did not pass /api/health within 20 minutes (last result: ${lastStatus}).`,
  );
}

async function output(name, value) {
  if (process.env.GITHUB_OUTPUT) {
    const fs = await import("node:fs/promises");
    await fs.appendFile(process.env.GITHUB_OUTPUT, `${name}=${value}\n`);
  }
}

const owner = await ownerId();

if (process.argv[2] === "cleanup") {
  await deleteServices(owner);
} else if (process.argv[2] === "deploy") {
  if (!process.env.REPOSITORY || !process.env.BRANCH) {
    throw new Error("REPOSITORY and BRANCH are required to create Render services.");
  }
  const apiName = serviceNames.api;
  const webName = serviceNames.web;
  // The CLI-generated preview normalizes either API stack to apps/api and React + Vite to
  // apps/web, while moving their Dockerfiles to apps/api/Dockerfile and Dockerfile.
  const apiImageDir = "apps/api";
  const apiPackage = apiKind === "hono" ? "@clubedge/api" : undefined;
  const apiUrlFallback = `https://${apiName}.onrender.com`;
  const webUrlFallback = `https://${webName}.onrender.com`;
  const auth = process.env.AUTH_KIND === "supabase";

  const backend = await createService(
    owner,
    apiName,
    `${apiImageDir}/Dockerfile`,
    {
      APP_DIR: apiImageDir,
      ...(apiPackage ? { APP_PACKAGE: apiPackage } : {}),
      HOST: "0.0.0.0",
      PORT: "10000",
      FRONTEND_URL: "*",
      DATABASE_URL: process.env.DATABASE_URL,
      DATABASE_URL_DIRECT: process.env.DATABASE_URL_DIRECT,
      ...(auth
        ? {
            SUPABASE_URL: process.env.SUPABASE_URL,
            SUPABASE_PUBLISHABLE_KEY: process.env.SUPABASE_PUBLISHABLE_KEY,
          }
        : {}),
    },
    "/api/health",
  );
  const apiUrl = backend.url || apiUrlFallback;
  await waitForHealth(apiUrl, `The ${apiKind} API`);

  const frontend = await createService(
    owner,
    webName,
    "Dockerfile",
    {
      APP_DIR: "apps/web",
      APP_PACKAGE: "@clubedge/web",
      API_URL: apiUrl,
      PORT: "10000",
      ...(auth
        ? {
            VITE_SUPABASE_URL: process.env.SUPABASE_URL,
            VITE_SUPABASE_PUBLISHABLE_KEY: process.env.SUPABASE_PUBLISHABLE_KEY,
          }
        : {}),
    },
    "/api/health",
  );
  await waitForHealth(frontend.url || webUrlFallback, "The React + Vite frontend");
  await output("url", frontend.url || webUrlFallback);
  await output("api_url", apiUrl);
} else {
  throw new Error("Usage: node scripts/stack-preview-render.mjs <deploy|cleanup>");
}
