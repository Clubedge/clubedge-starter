// Runs PostgreSQL in this process with PGlite and serves it over the PostgreSQL protocol, so the
// app, migrations, and Drizzle Kit connect with an ordinary DATABASE_URL. For development only:
// PGlite has a single session, so clients take turns (see src/server.ts).
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { connect } from "node:net";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { serveLocalPostgres } from "../src/server";

const host = "127.0.0.1";
const port = Number(process.env.LOCAL_DB_PORT ?? 5433);
const root = resolve(import.meta.dirname, "../../..");
const dataDir = resolve(root, ".data/pglite");
const url = `postgresql://postgres:postgres@${host}:${port}/postgres`;

/** Resolves true when something already accepts connections on the port. */
function isPortInUse(): Promise<boolean> {
  return new Promise((done) => {
    const socket = connect({ host, port });
    socket.once("connect", () => {
      socket.end();
      done(true);
    });
    socket.once("error", () => done(false));
  });
}

/** Applies every package's migrations, like `pnpm db:migrate`, against this server. */
function migrate(): Promise<boolean> {
  return new Promise((done) => {
    const child = spawn("pnpm", ["run", "db:migrate"], {
      cwd: root,
      env: { ...process.env, DATABASE_URL: url },
      shell: process.platform === "win32",
      stdio: "inherit",
    });
    child.once("error", () => done(false));
    child.once("exit", (code) => done(code === 0));
  });
}

// Check the port before opening the data directory: two processes must never open it at once.
if (await isPortInUse()) {
  console.info(`Port ${port} is in use; the local database is probably already running.`);
  process.exit(0);
}

mkdirSync(dataDir, { recursive: true });
const db = await PGlite.create(dataDir);
const server = await serveLocalPostgres(db, { host, port });
console.info(`Local PostgreSQL (PGlite) on ${url}, data in .data/pglite`);

let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  // Close PGlite cleanly so its data directory stays consistent.
  await server.close();
  await db.close();
  process.exit(0);
}
for (const signal of ["SIGINT", "SIGTERM", "SIGBREAK"] as const) process.on(signal, stop);

if (await migrate()) console.info("Local database ready.");
else console.error("Migrations failed; the database is still running.");
