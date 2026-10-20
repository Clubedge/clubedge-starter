import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve } from "node:path";

const baseUrl = process.env.APP_BASE_URL ?? "http://127.0.0.1:3000";
const timeout = Date.now() + 60_000;

// Run from the generated project; its package.json records the selected modules.
const { clubedge } = JSON.parse(await readFile("package.json", "utf8"));
const hasAuth = clubedge?.modules?.auth !== "none";

async function get(path) {
  let lastError;

  while (Date.now() < timeout) {
    try {
      return await fetch(new URL(path, baseUrl), {
        signal: AbortSignal.timeout(5_000),
      });
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 1_000));
    }
  }

  throw new Error(`The generated app did not respond at ${baseUrl}: ${lastError}`);
}

async function getOnceUp(path) {
  let response = await get(path);
  while (response.status >= 500 && Date.now() < timeout) {
    await new Promise((resolve) => setTimeout(resolve, 1_000));
    response = await get(path);
  }
  return response;
}

const landing = await get("/");
assert.equal(landing.status, 200, "the landing page should render");
const landingHtml = await landing.text();
assert.match(landingHtml, /Generated App/, "the generated project name should be rendered");

if (hasAuth) {
  const login = await get("/login?mode=signup");
  assert.equal(login.status, 200, "the sign-up page should render");
  const loginHtml = await login.text();
  if (loginHtml.includes('id="root"')) {
    // Vite serves the SPA shell for every path, so verify that the client router renders /login.
    assert.match(loginHtml, /<script[^>]+type="module"[^>]+src=/);
    const require = createRequire(resolve(process.cwd(), "package.json"));
    const { chromium } = require("@playwright/test");
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage();
      await page.goto(new URL("/login?mode=signup", baseUrl).href);
      await page.getByRole("heading", { name: "Create your account" }).waitFor();
    } finally {
      await browser.close();
    }
  } else {
    assert.match(loginHtml, /Create your account/, "the sign-up view should be available");
  }
} else {
  const login = await get("/login");
  if (login.status !== 404) {
    assert.equal(login.status, 200, "projects without auth should have no login page");
    const loginHtml = await login.text();
    if (loginHtml.includes('id="root"')) {
      // A Vite SPA returns its shell even for unknown routes; verify /login reaches its 404 view.
      assert.match(loginHtml, /<script[^>]+type="module"[^>]+src=/);
      const require = createRequire(resolve(process.cwd(), "package.json"));
      const { chromium } = require("@playwright/test");
      const browser = await chromium.launch();
      try {
        const page = await browser.newPage();
        await page.goto(new URL("/login", baseUrl).href);
        await page.getByRole("heading", { name: "Page not found" }).waitFor();
      } finally {
        await browser.close();
      }
    } else {
      assert.doesNotMatch(
        loginHtml,
        /Create your account|Sign in/,
        "projects without auth should have no login page",
      );
    }
  }
}

const dashboard = await get("/dashboard");
assert.equal(dashboard.status, 200, "the dashboard should render");

const health = await getOnceUp("/api/health");
assert.equal(health.status, 200, "the health endpoint should respond");
assert.equal((await health.json()).status, "ok", "the health endpoint should report success");

const logo = await get("/.well-known/logo.svg");
assert.equal(logo.status, 200, "the Clubedge logo should be served");
assert.match(logo.headers.get("content-type") ?? "", /image\/svg\+xml/);

const favicon = await get("/favicon.ico");
assert.equal(favicon.status, 200, "the favicon should be served");

console.log("Generated app smoke checks passed: pages, health endpoint, logo, and favicon");
