// Builds the production migrator: `node scripts/build-migrator.mjs <out-dir>` writes
// <out-dir>/migrate.mjs, a single file with its dependencies, and <out-dir>/migrations with the
// migrations of every workspace package that declares them in package.json:
//   "clubedge": { "migrations": { "folder": "drizzle", "table": "__drizzle_migrations" } }
// Packages a project leaves out are not in the workspace, so their migrations are not either.
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { build } from "esbuild";

const root = resolve(import.meta.dirname, "..");
const out = resolve(process.argv[2] ?? ".migrator");
rmSync(out, { recursive: true, force: true });
mkdirSync(join(out, "migrations"), { recursive: true });

const sets = [];
for (const name of readdirSync(join(root, "packages")).sort()) {
  const manifestPath = join(root, "packages", name, "package.json");
  if (!existsSync(manifestPath)) continue;
  const migrations = JSON.parse(readFileSync(manifestPath, "utf8")).clubedge?.migrations;
  if (!migrations) continue;
  cpSync(join(root, "packages", name, migrations.folder), join(out, "migrations", name), {
    recursive: true,
  });
  sets.push({ name, table: migrations.table });
}
// The app's own tables first: other packages' tables may reference them.
sets.sort((a, b) => (a.name === "db" ? -1 : b.name === "db" ? 1 : a.name.localeCompare(b.name)));
writeFileSync(join(out, "migrations", "manifest.json"), `${JSON.stringify(sets, null, 2)}\n`);

await build({
  entryPoints: [join(root, "scripts", "migrate.mjs")],
  outfile: join(out, "migrate.mjs"),
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  // Resolve postgres and drizzle-orm from the database package, which depends on them.
  nodePaths: [join(root, "packages", "db", "node_modules")],
  logLevel: "warning",
});
console.info(
  `Migrator written to ${out} (${sets.map((set) => set.name).join(", ") || "no migrations"}).`,
);
