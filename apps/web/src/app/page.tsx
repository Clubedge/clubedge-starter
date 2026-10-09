import {
  ArrowRight,
  ArrowUpRight,
  Blocks,
  Github,
  LayoutDashboard,
  ShieldCheck,
  Terminal,
} from "lucide-react";
import Link from "next/link";

import { Button } from "@clubedge/ui/components/button";
import { ThemeToggle } from "./theme-toggle";

const stack = ["Next.js", "TypeScript", "Drizzle", "PostgreSQL", "Supabase Auth", "Base UI"];

export default function LandingPage() {
  return (
    <div className="flex min-h-svh flex-col overflow-hidden">
      <header className="sticky top-0 z-20 border-b bg-background/85 backdrop-blur-xl">
        <nav
          aria-label="Main navigation"
          className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8"
        >
          <Link
            className="flex shrink-0 items-center gap-2.5"
            href="/"
            aria-label="Clubedge Starter home"
          >
            <span className="grid size-9 place-items-center rounded-xl bg-primary text-primary-foreground shadow-sm">
              <Blocks aria-hidden="true" className="size-5" />
            </span>
            <span className="hidden text-sm font-semibold tracking-tight min-[380px]:inline">
              Clubedge Starter
            </span>
          </Link>

          <div className="hidden items-center gap-6 text-sm text-muted-foreground md:flex">
            <a className="transition-colors hover:text-foreground" href="#stack">
              Stack
            </a>
            <Link
              className="inline-flex items-center gap-1 transition-colors hover:text-foreground"
              href="https://github.com/yassine-ahmed/clubedge-starter/blob/main/SETUP.md"
              target="_blank"
              rel="noreferrer"
            >
              Documentation <ArrowUpRight aria-hidden="true" className="size-3.5" />
            </Link>
            <Link
              className="transition-colors hover:text-foreground"
              href="https://github.com/yassine-ahmed/clubedge-starter"
              target="_blank"
              rel="noreferrer"
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
            <Button render={<Link href="/login" />} size="sm">
              Sign in
            </Button>
          </div>
        </nav>
      </header>

      <main className="relative flex flex-1 flex-col">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 -z-10 mx-auto h-[34rem] max-w-5xl bg-[radial-gradient(ellipse_at_top,rgba(37,99,235,0.12),transparent_65%)]"
        />
        <section className="mx-auto flex w-full max-w-5xl flex-1 flex-col items-center justify-center px-4 py-20 text-center sm:px-6 sm:py-28">
          <div className="mb-7 inline-flex items-center gap-2 rounded-full border bg-background/80 px-3.5 py-1.5 text-xs font-medium text-muted-foreground shadow-sm">
            <ShieldCheck aria-hidden="true" className="size-3.5 text-primary" />
            An open-source foundation for your next app
          </div>

          <h1 className="max-w-4xl text-balance text-4xl font-semibold tracking-tight sm:text-6xl lg:text-7xl">
            Start with the foundation.
            <span className="mt-2 block text-primary">Build what matters.</span>
          </h1>

          <p className="mt-6 max-w-2xl text-pretty text-base leading-7 text-muted-foreground sm:text-lg sm:leading-8">
            A modular Next.js starter with a shared Base UI design system, typed data access, and
            replaceable infrastructure. Spend your time on the product, not the setup.
          </p>

          <div className="mt-9 flex w-full flex-col justify-center gap-3 sm:w-auto sm:flex-row">
            <Button className="h-11 px-5" render={<Link href="/dashboard" />}>
              Explore the dashboard <ArrowRight aria-hidden="true" />
            </Button>
            <Button
              className="h-11 px-5"
              render={
                <Link
                  href="https://github.com/yassine-ahmed/clubedge-starter/blob/main/SETUP.md"
                  target="_blank"
                  rel="noreferrer"
                />
              }
              variant="outline"
            >
              Read the setup guide <ArrowUpRight aria-hidden="true" />
            </Button>
          </div>

          <div className="mt-12 w-full max-w-xl rounded-xl border bg-card/90 p-4 text-start shadow-lg shadow-blue-950/5 sm:p-5">
            <div className="mb-3 flex items-center gap-2 text-xs text-muted-foreground">
              <Terminal aria-hidden="true" className="size-4 text-primary" />
              Create a project
            </div>
            <code className="block overflow-x-auto text-xs text-foreground sm:text-sm">
              <span className="select-none text-primary">$ </span>
              pnpm dlx @clubedge/create-clubedge-app my-app
            </code>
          </div>

          <div
            className="mt-12 flex max-w-3xl flex-wrap items-center justify-center gap-x-6 gap-y-3 text-xs font-medium text-muted-foreground sm:gap-x-8"
            id="stack"
            aria-label="Included technology"
          >
            {stack.map((item) => (
              <span key={item}>{item}</span>
            ))}
          </div>
        </section>
      </main>

      <footer className="border-t">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-3 px-4 py-5 text-xs text-muted-foreground sm:flex-row sm:px-6 lg:px-8">
          <span>© {new Date().getFullYear()} Clubedge Starter · Apache-2.0</span>
          <Link
            className="inline-flex items-center gap-1.5 transition-colors hover:text-foreground"
            href="https://github.com/yassine-ahmed/clubedge-starter"
            target="_blank"
            rel="noreferrer"
          >
            <Github aria-hidden="true" className="size-3.5" />
            Contribute on GitHub <ArrowUpRight aria-hidden="true" className="size-3" />
          </Link>
        </div>
      </footer>
    </div>
  );
}
