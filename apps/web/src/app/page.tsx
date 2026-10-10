import { ArrowRight, ArrowUpRight, Github, LayoutDashboard } from "lucide-react";
import Link from "next/link";

import { Button } from "@clubedge/ui/components/button";
import { ClubedgeMark } from "@/components/branding/clubedge-mark";
import { CopyCommand } from "@/components/landing/copy-command";
import { siteConfig } from "@/config/site";
import { ThemeToggle } from "./theme-toggle";

const REPO_URL = siteConfig.links.repository;
const SETUP_URL = siteConfig.links.setupGuide;
const CREATE_COMMAND = "pnpm dlx @clubedge/create-clubedge-app my-app";

const included = [
  {
    name: "Next.js",
    detail: "An App Router web app in apps/web, with server components by default.",
  },
  // clubedge:if auth!=none
  {
    name: "Authentication",
    detail:
      "Email and password sign-in, with sessions verified on the server and stored in secure cookies.",
  },
  // clubedge:end
  {
    name: "Drizzle and PostgreSQL",
    detail: "Typed data access that you can extend or swap for your own infrastructure.",
  },
  {
    name: "Base UI design system",
    detail: "Shared, accessible components in @clubedge/ui, used across the whole repo.",
  },
  {
    name: "TypeScript",
    detail: "Typed from the database layer through to the UI.",
  },
  {
    name: "Dashboard",
    detail: "A starting point for your product, ready to open at /dashboard.",
  },
];

const steps = [
  "Create your project with the command above.",
  "Set DATABASE_URL and your providers' keys in apps/web/.env.local, as SETUP.md describes.",
  "Start the app and open the dashboard.",
];

export default function LandingPage() {
  return (
    <div className="flex min-h-svh flex-col">
      <header className="sticky top-0 z-20 border-b bg-background/85 backdrop-blur-xl">
        <nav
          aria-label="Main navigation"
          className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8"
        >
          <Link
            aria-label={`${siteConfig.name} home`}
            className="flex shrink-0 items-center gap-2.5 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
            href="/"
          >
            <ClubedgeMark alt="" className="size-9 rounded-xl" priority />
            <span className="hidden text-sm font-semibold tracking-tight min-[380px]:inline">
              {siteConfig.name}
            </span>
          </Link>

          <div className="hidden items-center gap-6 text-sm text-muted-foreground md:flex">
            <a className="transition-colors hover:text-foreground" href="#stack">
              Stack
            </a>
            <Link
              className="inline-flex items-center gap-1 transition-colors hover:text-foreground"
              href={SETUP_URL}
              rel="noreferrer"
              target="_blank"
            >
              Documentation <ArrowUpRight aria-hidden="true" className="size-3.5" />
            </Link>
            <Link
              className="transition-colors hover:text-foreground"
              href={REPO_URL}
              rel="noreferrer"
              target="_blank"
            >
              GitHub
            </Link>
          </div>

          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            <ThemeToggle />
            <Button
              aria-label="Go to dashboard"
              className="sm:hidden"
              render={<Link href="/dashboard" />}
              size="icon"
              variant="ghost"
            >
              <LayoutDashboard aria-hidden="true" />
            </Button>
            <Button
              className="hidden sm:inline-flex"
              render={<Link href="/dashboard" />}
              size="sm"
              variant="ghost"
            >
              Dashboard
            </Button>
            {/* clubedge:if auth!=none */}
            <Button render={<Link href="/login" />} size="sm">
              Sign in
            </Button>
            {/* clubedge:end */}
          </div>
        </nav>
      </header>

      <main className="flex-1">
        <section className="mx-auto w-full max-w-6xl px-4 pb-16 pt-16 sm:px-6 sm:pb-24 sm:pt-24 lg:px-8">
          <div className="max-w-3xl">
            <h1 className="text-balance text-4xl font-semibold tracking-tight sm:text-5xl lg:text-6xl">
              Start with the foundation. Build what matters.
            </h1>
            <p className="mt-6 max-w-2xl text-pretty text-base leading-7 text-muted-foreground sm:text-lg sm:leading-8">
              A modular Next.js starter with a shared Base UI design system, typed data access, and
              replaceable infrastructure. Spend your time on the product, not the setup.
            </p>

            <div className="mt-8 max-w-xl">
              <CopyCommand command={CREATE_COMMAND} />
            </div>

            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <Button className="h-11 px-5" render={<Link href="/dashboard" />}>
                Explore the dashboard <ArrowRight aria-hidden="true" />
              </Button>
              <Button
                className="h-11 px-5"
                render={<Link href={SETUP_URL} rel="noreferrer" target="_blank" />}
                variant="outline"
              >
                Read the setup guide <ArrowUpRight aria-hidden="true" />
              </Button>
            </div>
          </div>
        </section>

        <section
          aria-labelledby="stack-heading"
          className="scroll-mt-16 border-t bg-muted/30"
          id="stack"
        >
          <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
            <h2 className="text-2xl font-semibold tracking-tight" id="stack-heading">
              What you get
            </h2>
            <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
              Every layer is wired together and replaceable, so you can keep what fits and change
              the rest.
            </p>

            <dl className="mt-10 grid gap-px overflow-hidden rounded-xl border bg-border sm:grid-cols-2 lg:grid-cols-3">
              {included.map((item) => (
                <div className="bg-background p-6" key={item.name}>
                  <dt className="text-sm font-semibold">{item.name}</dt>
                  <dd className="mt-2 text-sm leading-6 text-muted-foreground">{item.detail}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        <section
          aria-labelledby="start-heading"
          className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8"
        >
          <h2 className="text-2xl font-semibold tracking-tight" id="start-heading">
            Up and running in three steps
          </h2>
          <ol className="mt-8 grid max-w-2xl gap-5">
            {steps.map((step, index) => (
              <li className="flex items-start gap-4" key={step}>
                <span
                  aria-hidden="true"
                  className="grid size-7 shrink-0 place-items-center rounded-full border text-xs font-medium text-muted-foreground"
                >
                  {index + 1}
                </span>
                <p className="pt-0.5 text-sm leading-6">{step}</p>
              </li>
            ))}
          </ol>
          <div className="mt-8">
            <Button
              render={<Link href={SETUP_URL} rel="noreferrer" target="_blank" />}
              variant="outline"
            >
              Read the full setup guide <ArrowUpRight aria-hidden="true" />
            </Button>
          </div>
        </section>
      </main>

      <footer className="border-t">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-4 py-5 text-xs text-muted-foreground sm:flex-row sm:px-6 lg:px-8">
          <span>
            © {new Date().getFullYear()} {siteConfig.name}. Licensed under Apache-2.0.
          </span>
          <div className="flex items-center gap-5">
            <Link
              className="transition-colors hover:text-foreground"
              href={SETUP_URL}
              rel="noreferrer"
              target="_blank"
            >
              Documentation
            </Link>
            <Link
              className="inline-flex items-center gap-1.5 transition-colors hover:text-foreground"
              href={REPO_URL}
              rel="noreferrer"
              target="_blank"
            >
              <Github aria-hidden="true" className="size-3.5" />
              Contribute on GitHub
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
