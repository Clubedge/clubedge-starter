import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

// Runs the steps of .github/workflows/clubedge-upgrade.yml, which every generated project gets,
// as GitHub runs them (`shell: bash` is `bash --noprofile --norc -eo pipefail`). The project
// pushes to a local bare repository, and `pnpm` and `gh` are replaced by scripts that record
// their calls: `pnpm dlx` stands in for the CLI's `upgrade --json`, writing the files and
// printing the report of the outcome FAKE_UPGRADE names.

const workflow = readFileSync(".github/workflows/clubedge-upgrade.yml", "utf8");

/** Each named step's `run` script, from the workflow's own text. */
function runScripts(text: string) {
  const scripts = new Map<string, string>();
  const lines = text.split("\n");
  let name = "";
  for (let i = 0; i < lines.length; i++) {
    name = /^ {6}- name: (.+)$/.exec(lines[i]!)?.[1] ?? name;
    if (!/^ {8}run: \|$/.test(lines[i]!)) continue;
    const body: string[] = [];
    while (
      i + 1 < lines.length &&
      (lines[i + 1]!.startsWith(" ".repeat(10)) || !lines[i + 1]!.trim())
    ) {
      body.push(lines[++i]!.slice(10));
    }
    scripts.set(name, body.join("\n"));
  }
  return scripts;
}

const steps = runScripts(workflow);
const upgradeStep = steps.get("Upgrade to the newest Starter release")!;
const pullRequestStep = steps.get("Open the pull request")!;

const manifest = (ref: string, version = "1.0.0") =>
  `{\n  "name": "my-app",\n  "version": "${version}",\n  "clubedge": { "starterRepository": "Clubedge/clubedge-starter", "starterRef": "${ref}" }\n}\n`;

// The package.json files the fake upgrade writes. When the version line both sides changed, it
// does not parse; the CLI saves the Starter's version in .clubedge/incoming and exits with 2
// under --detailed-exit-code.
const upgradedFiles = {
  "conflicted.json": manifest("v0.25.0").replace(
    '  "version": "1.0.0",\n',
    '<<<<<<< yours\n  "version": "1.0.0",\n=======\n  "version": "0.25.0",\n>>>>>>> clubedge\n',
  ),
  "incoming.json": manifest("v0.25.0", "0.25.0"),
  "clean.json": manifest("v0.25.0"),
};

// The reports the CLI prints with --json (reportVersion 1) for each outcome.
const starter = (ref: string) => ({
  repository: "Clubedge/clubedge-starter",
  ref,
  stacks: { framework: "next" },
  modules: { auth: "supabase" },
});
const report = (fields: Record<string, unknown>) =>
  JSON.stringify({
    reportVersion: 1,
    cli: "0.49.0",
    command: "upgrade",
    outcome: "changed",
    dryRun: false,
    summary: "Starter v0.24.2 -> v0.25.0",
    from: starter("v0.24.2"),
    to: starter("v0.25.0"),
    files: [{ path: "package.json", action: "update" }],
    lockfile: "install",
    envFiles: [],
    conflicts: { files: 0, blocks: 0 },
    install: { mode: "lockfile-only", status: "done" },
    releases: [
      {
        tag: "v0.25.0",
        name: "v0.25.0",
        url: "https://github.com/Clubedge/clubedge-starter/releases/tag/v0.25.0",
        headings: ["Payments", "Tests"],
      },
    ],
    introduced: [],
    warnings: [],
    notes: ["Release notes: https://github.com/Clubedge/clubedge-starter/releases/tag/v0.25.0"],
    ...fields,
  });
const skippedInstall =
  "Skipped `pnpm install`: package.json has conflict markers, which pnpm cannot read, so pnpm commands, `pnpm clubedge` among them, fail until it is resolved. Then run `pnpm install`.";
const reports = {
  "conflict.report.json": report({
    outcome: "conflicts",
    files: [
      {
        path: "package.json",
        action: "conflict",
        conflicts: 1,
        incoming: ".clubedge/incoming/package.json",
      },
    ],
    conflicts: { files: 1, blocks: 1 },
    install: { mode: "lockfile-only", status: "skipped", reason: skippedInstall },
    warnings: [skippedInstall],
  }),
  "clean.report.json": report({
    introduced: [{ module: "cache", option: "none" }],
    warnings: ["This choice is not Stable yet:\n• Beta: Resend (email resend)."],
    notes: [
      'Cache is new since Starter v0.24.2; the project uses "none". Choose another option with: pnpm clubedge add cache <option>',
      "Release notes: https://github.com/Clubedge/clubedge-starter/releases/tag/v0.25.0",
    ],
  }),
  "lockfile-failed.report.json": report({
    outcome: "failed",
    install: { mode: "lockfile-only", status: "failed", reason: "pnpm exited with code 1." },
    error: {
      message:
        "The files were updated, but `pnpm install --lockfile-only` did not complete: pnpm exited with code 1. Fix that, then run `pnpm install`.",
    },
  }),
  "current.report.json": report({
    outcome: "unchanged",
    summary: undefined,
    to: undefined,
    files: [],
    lockfile: "unchanged",
    install: { mode: "none", status: "off" },
    releases: [],
    notes: ["The project is already on Starter v0.24.2."],
  }),
  "failed.report.json": report({
    outcome: "failed",
    summary: undefined,
    to: undefined,
    files: [],
    install: { mode: "none", status: "off" },
    releases: [],
    notes: [],
    error: { message: 'Could not resolve Starter "v0.25.0" to a commit.' },
  }),
};

// The log goes to stderr and the report to stdout, as with --json.
const fakePnpm = `#!/usr/bin/env bash
echo "pnpm $*" >>"$FAKE_LOG"
case "$FAKE_UPGRADE" in
  conflict)
    cp "$FAKE_FILES/conflicted.json" package.json
    mkdir -p .clubedge/incoming
    printf '*\\n' >.clubedge/.gitignore
    cp "$FAKE_FILES/incoming.json" .clubedge/incoming/package.json
    echo "conflict package.json" >&2
    cat "$FAKE_FILES/conflict.report.json"
    exit 2 ;;
  clean)
    cp "$FAKE_FILES/clean.json" package.json
    echo "update   package.json" >&2
    cat "$FAKE_FILES/clean.report.json"
    exit 0 ;;
  lockfile-failed)
    cp "$FAKE_FILES/clean.json" package.json
    echo " ERR_PNPM_FETCH_404  GET https://registry.npmjs.org/nope: Not Found - 404" >&2
    cat "$FAKE_FILES/lockfile-failed.report.json"
    exit 1 ;;
  current)
    echo "The project is already on Starter v0.24.2." >&2
    cat "$FAKE_FILES/current.report.json"
    exit 0 ;;
  old-cli)
    echo "Unknown option '--json'. Run with --help to see available options." >&2
    exit 1 ;;
  *)
    echo 'Could not resolve Starter "v0.25.0" to a commit.' >&2
    cat "$FAKE_FILES/failed.report.json"
    exit 1 ;;
esac
`;

const fakeGh = `#!/usr/bin/env bash
echo "gh $*" >>"$FAKE_LOG"
if [ "$1 $2" = "pr create" ]; then
  while [ $# -gt 0 ]; do
    if [ "$1" = --body-file ]; then cp "$2" "$FAKE_BODY"; fi
    shift
  done
  exit "\${FAKE_GH_STATUS:-0}"
fi
`;

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

const git = (cwd: string, ...args: string[]) =>
  spawnSync("git", ["-c", "user.name=CI", "-c", "user.email=ci@example.com", ...args], {
    cwd,
    encoding: "utf8",
  });

/** A project on main, pushed to a bare `origin`, with the fake pnpm and gh first on PATH. */
function project(packageJson = manifest("v0.24.2")) {
  const root = mkdtempSync(join(tmpdir(), "clubedge-upgrade-"));
  roots.push(root);
  const paths = {
    root,
    remote: join(root, "remote.git"),
    project: join(root, "project"),
    temp: join(root, "temp"),
    bin: join(root, "bin"),
    files: join(root, "files"),
    log: join(root, "calls.log"),
    body: join(root, "body.md"),
  };
  for (const folder of [paths.project, paths.temp, paths.bin, paths.files]) mkdirSync(folder);
  for (const [name, script] of Object.entries({ pnpm: fakePnpm, gh: fakeGh })) {
    writeFileSync(join(paths.bin, name), script);
    chmodSync(join(paths.bin, name), 0o755);
  }
  for (const [name, content] of Object.entries({ ...upgradedFiles, ...reports })) {
    writeFileSync(join(paths.files, name), content);
  }
  writeFileSync(paths.log, "");
  git(root, "init", "--quiet", "--bare", "-b", "main", paths.remote);
  git(paths.project, "init", "--quiet", "-b", "main");
  writeFileSync(join(paths.project, "package.json"), packageJson);
  git(paths.project, "add", "-A");
  git(paths.project, "commit", "--quiet", "-m", "Generated project");
  git(paths.project, "remote", "add", "origin", paths.remote);
  git(paths.project, "push", "--quiet", "-u", "origin", "main");
  return paths;
}

type Project = ReturnType<typeof project>;

/** Runs a step's script in the project; resolves its exit code, output, and step outputs. */
function run(paths: Project, script: string, env: Record<string, string> = {}) {
  const file = join(paths.temp, "step.sh");
  writeFileSync(file, script);
  const outputFile = join(paths.temp, "github-output");
  writeFileSync(outputFile, "");
  const result = spawnSync("bash", ["--noprofile", "--norc", "-eo", "pipefail", file], {
    cwd: paths.project,
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: [paths.bin, process.env.PATH].join(delimiter),
      RUNNER_TEMP: paths.temp,
      GITHUB_OUTPUT: outputFile,
      FAKE_LOG: paths.log,
      FAKE_BODY: paths.body,
      FAKE_FILES: paths.files,
      ...env,
    },
  });
  const outputs = Object.fromEntries(
    readFileSync(outputFile, "utf8")
      .split("\n")
      .filter(Boolean)
      .map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1)]),
  );
  return { status: result.status, output: `${result.stdout}${result.stderr}`, outputs };
}

/** The pull request step, with the environment the workflow gives it. */
function openPullRequest(paths: Project, outputs: Record<string, string>, env = {}) {
  return run(paths, pullRequestStep, {
    GH_TOKEN: "token",
    OWN_TOKEN: "true",
    BEFORE: outputs.before!,
    AFTER: outputs.after!,
    REPOSITORY: outputs.repository!,
    BRANCH: outputs.branch!,
    INSTALL: outputs.install!,
    DEFAULT_BRANCH: "main",
    RUN_URL: "https://github.com/acme/my-app/actions/runs/1",
    ...env,
  });
}

const calls = (paths: Project) =>
  readFileSync(paths.log, "utf8").trim().split("\n").filter(Boolean);
const remoteBranches = (paths: Project) =>
  git(paths.project, "ls-remote", "--heads", "origin").stdout.trim().split("\n").filter(Boolean);

// GitHub runs the workflow on Linux; Windows has no bash of its own to run it with.
describe.skipIf(process.platform === "win32")("the Starter upgrade workflow", () => {
  it("opens a pull request when the upgrade leaves conflicts in package.json", () => {
    const paths = project();
    const upgrade = run(paths, upgradeStep, { FAKE_UPGRADE: "conflict" });

    expect(upgrade.status, upgrade.output).toBe(0);
    expect(upgrade.outputs).toEqual({
      before: "v0.24.2",
      after: "v0.25.0",
      repository: "Clubedge/clubedge-starter",
      branch: "clubedge/upgrade-v0.25.0",
      install: "skipped",
      incoming: "true",
    });
    expect(calls(paths)).toEqual([
      "pnpm dlx @clubedge/create-clubedge-app@latest upgrade --json --lockfile-only --detailed-exit-code",
    ]);
    // The log went to stderr, and the step shows it.
    expect(upgrade.output).toContain("conflict package.json");

    const pullRequest = openPullRequest(paths, upgrade.outputs);
    expect(pullRequest.status, pullRequest.output).toBe(0);
    expect(calls(paths)).toContain(
      "gh pr create --base main --head clubedge/upgrade-v0.25.0 --title chore: upgrade to Clubedge Starter v0.25.0 --body-file " +
        `${paths.temp}/body.md`,
    );
    const body = readFileSync(paths.body, "utf8");
    expect(body).toContain(
      "from Clubedge Starter `v0.24.2` to [`v0.25.0`](https://github.com/Clubedge/clubedge-starter/releases/tag/v0.25.0)",
    );
    expect(body).toContain("### Conflicts to resolve");
    expect(body).toContain("- `package.json`\n");
    expect(body).toContain(
      "`pnpm-lock.yaml` is not updated: pnpm cannot read a `package.json` with conflict markers",
    );
    // The install's reason is said once, in its own section.
    expect(body).not.toContain("### Warnings");
    expect(body).toContain(
      "### Starter releases in this upgrade\n\n- [`v0.25.0`](https://github.com/Clubedge/clubedge-starter/releases/tag/v0.25.0): Payments, Tests\n",
    );
    expect(remoteBranches(paths)).toEqual([
      expect.stringMatching(/\trefs\/heads\/clubedge\/upgrade-v0\.25\.0$/),
      expect.stringMatching(/\trefs\/heads\/main$/),
    ]);
  });

  it("deletes the pushed branch when the pull request cannot be opened, so the next run tries again", () => {
    const paths = project();
    const upgrade = run(paths, upgradeStep, { FAKE_UPGRADE: "conflict" });
    const pullRequest = openPullRequest(paths, upgrade.outputs, { FAKE_GH_STATUS: "1" });

    expect(pullRequest.status).toBe(1);
    expect(pullRequest.output).toContain(
      "clubedge/upgrade-v0.25.0 is deleted and the next run tries again",
    );
    expect(remoteBranches(paths)).toEqual([expect.stringMatching(/\trefs\/heads\/main$/)]);

    // The next run starts from a fresh checkout of main and finds no branch in its way.
    git(paths.project, "switch", "--quiet", "--force", "main");
    git(paths.project, "clean", "-fdxq");
    const retry = run(paths, upgradeStep, { FAKE_UPGRADE: "conflict" });
    expect(retry.status, retry.output).toBe(0);
    expect(retry.outputs.branch).toBe("clubedge/upgrade-v0.25.0");
  });

  it("reads the new release from the report after a clean upgrade, whose lockfile the CLI updated", () => {
    const paths = project();
    const upgrade = run(paths, upgradeStep, { FAKE_UPGRADE: "clean" });

    expect(upgrade.status, upgrade.output).toBe(0);
    expect(upgrade.outputs).toMatchObject({ after: "v0.25.0", install: "updated" });
    expect(upgrade.outputs.incoming).toBeUndefined();
    // --lockfile-only: nothing else installs, and nothing from the project runs.
    expect(calls(paths)).toEqual([
      "pnpm dlx @clubedge/create-clubedge-app@latest upgrade --json --lockfile-only --detailed-exit-code",
    ]);

    const pullRequest = openPullRequest(paths, upgrade.outputs);
    expect(pullRequest.status, pullRequest.output).toBe(0);
    const body = readFileSync(paths.body, "utf8");
    expect(body).not.toContain("### Conflicts to resolve");
    expect(body).not.toContain("### pnpm-lock.yaml");
    expect(body).toContain(
      "### Warnings\n\n- This choice is not Stable yet:\n  • Beta: Resend (email resend).\n",
    );
    expect(body).toContain(
      '### Notes\n\n- Cache is new since Starter v0.24.2; the project uses "none".',
    );
    expect(body).not.toContain("- Release notes: ");
  });

  it("opens a pull request that says the lockfile could not follow, when only the install failed", () => {
    const paths = project();
    const upgrade = run(paths, upgradeStep, { FAKE_UPGRADE: "lockfile-failed" });

    expect(upgrade.status, upgrade.output).toBe(0);
    expect(upgrade.outputs).toMatchObject({ after: "v0.25.0", install: "failed" });
    const pullRequest = openPullRequest(paths, upgrade.outputs);
    expect(pullRequest.status, pullRequest.output).toBe(0);
    expect(readFileSync(paths.body, "utf8")).toContain(
      "`pnpm-lock.yaml` could not follow the upgrade: pnpm exited with code 1. Run `pnpm install` to see why",
    );
  });

  it("stops without a branch when the project is on the newest release", () => {
    const paths = project();
    const upgrade = run(paths, upgradeStep, { FAKE_UPGRADE: "current" });
    expect(upgrade.status, upgrade.output).toBe(0);
    expect(upgrade.output).toContain("Already on the newest Starter release, v0.24.2.");
    expect(upgrade.outputs).toEqual({});
  });

  it("fails without pushing anything when the upgrade fails", () => {
    const paths = project();
    const upgrade = run(paths, upgradeStep, { FAKE_UPGRADE: "fail" });
    expect(upgrade.status).toBe(1);
    expect(upgrade.output).toContain(
      'The upgrade failed: Could not resolve Starter "v0.25.0" to a commit. Nothing was pushed.',
    );
    expect(upgrade.outputs).toEqual({});
    expect(remoteBranches(paths)).toEqual([expect.stringMatching(/\trefs\/heads\/main$/)]);
  });

  it("says when the CLI printed no report, as one from before --json would", () => {
    const paths = project();
    const upgrade = run(paths, upgradeStep, { FAKE_UPGRADE: "old-cli" });
    expect(upgrade.status).toBe(1);
    expect(upgrade.output).toContain("Unknown option '--json'.");
    expect(upgrade.output).toContain(
      "The upgrade printed no report (exit code 1); nothing was pushed.",
    );
    expect(upgrade.outputs).toEqual({});
  });
});
