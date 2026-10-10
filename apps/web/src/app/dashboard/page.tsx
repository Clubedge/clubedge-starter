import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  Blocks,
  Check,
  CircleDashed,
  Database,
  Github,
  // clubedge:if auth!=none
  LockKeyhole,
  // clubedge:end
  Settings2,
  ShieldCheck,
  // clubedge:if storage!=none
  Workflow,
  // clubedge:end
} from "lucide-react";
import Link from "next/link";

import { Badge } from "@clubedge/ui/components/badge";
import { Button } from "@clubedge/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@clubedge/ui/components/card";
import { Separator } from "@clubedge/ui/components/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@clubedge/ui/components/table";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@clubedge/ui/components/breadcrumb";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@clubedge/ui/components/sidebar";
import { siteConfig } from "@/config/site";
import { getPageUser } from "@/server/auth";
import { AccountButton } from "./_components/account-button";
import { AppSidebar } from "./_components/app-sidebar";
import { ThemeToggle } from "../theme-toggle";

const modules = [
  {
    name: "PostgreSQL + Drizzle",
    description: "Typed schema and migrations for application data.",
    icon: Database,
    status: "Configure",
    variant: "secondary" as const,
  },
  // clubedge:if auth!=none
  {
    name: "Authentication",
    description: "Cookie-based sessions and server-validated users.",
    icon: LockKeyhole,
    status: "Optional setup",
    variant: "outline" as const,
  },
  // clubedge:end
  // clubedge:if storage!=none
  {
    name: "File storage",
    description: "One storage interface for uploads, downloads, and signed URLs.",
    icon: Workflow,
    status: "Ready to configure",
    variant: "secondary" as const,
  },
  // clubedge:end
  {
    name: "Cache and rate limits",
    description: "A key-value cache and fixed-window rate limiting.",
    icon: CircleDashed,
    status: "Ready",
    variant: "outline" as const,
  },
];

const setupRows = [
  {
    item: "Shared UI workspace",
    detail: "shadcn/ui components with Base UI primitives",
    status: "Ready",
  },
  {
    item: "Database connection",
    detail: "Set DATABASE_URL in apps/web/.env.local",
    status: "Configure",
  },
  // clubedge:if auth!=none
  {
    item: "Authentication provider",
    detail: "Add your provider's keys when you need sign-in",
    status: "Optional",
  },
  // clubedge:end
];

export default async function DashboardPage() {
  const user = await getPageUser("/dashboard");

  return (
    <SidebarProvider defaultOpen>
      <AppSidebar user={user} />
      <SidebarInset>
        <header className="sticky top-0 z-10 border-b bg-background/90 backdrop-blur">
          <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <SidebarTrigger aria-label="Toggle navigation sidebar" />
              <Breadcrumb>
                <BreadcrumbList>
                  <BreadcrumbItem>
                    <BreadcrumbLink render={<Link href="/" />}>Home</BreadcrumbLink>
                  </BreadcrumbItem>
                  <BreadcrumbSeparator />
                  <BreadcrumbItem>
                    <BreadcrumbPage>Dashboard</BreadcrumbPage>
                  </BreadcrumbItem>
                </BreadcrumbList>
              </Breadcrumb>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <Badge className="hidden sm:inline-flex" variant="outline">
                <span className="size-1.5 rounded-full bg-primary" aria-hidden="true" />
                Starter ready
              </Badge>
              <ThemeToggle />
              <Button
                aria-label="Open GitHub repository"
                render={
                  <Link href={siteConfig.links.repository} target="_blank" rel="noreferrer" />
                }
                size="icon"
                variant="ghost"
              >
                <Github aria-hidden="true" />
              </Button>
              <AccountButton user={user} />
            </div>
          </div>
        </header>

        <main
          className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-4 py-8 sm:px-6 lg:px-8 lg:py-10"
          id="overview"
        >
          <section className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
            <div className="max-w-2xl space-y-3">
              <div className="flex items-center gap-2 text-sm font-medium text-primary">
                <ShieldCheck aria-hidden="true" className="size-4" />
                Production-minded application foundation
              </div>
              <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                A better place to start building.
              </h1>
              <p className="max-w-xl text-sm leading-6 text-muted-foreground sm:text-base">
                Your workspace is ready. Connect the services you need, then build your product on
                top of a consistent, replaceable foundation.
              </p>
            </div>
            <Button
              render={<Link href={siteConfig.links.setupGuide} target="_blank" rel="noreferrer" />}
            >
              Read setup guide <ArrowRight aria-hidden="true" />
            </Button>
          </section>

          <section
            aria-label="Starter summary"
            className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
          >
            <Card className="gap-4 py-5">
              <CardHeader className="flex-row items-center justify-between gap-2 px-5">
                <CardDescription>Workspace packages</CardDescription>
                <span className="grid size-9 place-items-center rounded-lg bg-primary/10 text-primary">
                  <Blocks aria-hidden="true" className="size-4" />
                </span>
              </CardHeader>
              <CardContent className="px-5">
                <CardTitle className="text-2xl">3</CardTitle>
                <p className="mt-1 text-xs text-muted-foreground">
                  Web, shared UI, and root tooling
                </p>
              </CardContent>
            </Card>
            <Card className="gap-4 py-5">
              <CardHeader className="flex-row items-center justify-between gap-2 px-5">
                <CardDescription>Database</CardDescription>
                <span className="grid size-9 place-items-center rounded-lg bg-primary/10 text-primary">
                  <Database aria-hidden="true" className="size-4" />
                </span>
              </CardHeader>
              <CardContent className="px-5">
                <CardTitle className="text-2xl">PostgreSQL</CardTitle>
                <p className="mt-1 text-xs text-muted-foreground">Drizzle manages app data</p>
              </CardContent>
            </Card>
            <Card className="gap-4 py-5">
              <CardHeader className="flex-row items-center justify-between gap-2 px-5">
                <CardDescription>Shared UI</CardDescription>
                <span className="grid size-9 place-items-center rounded-lg bg-primary/10 text-primary">
                  <Blocks aria-hidden="true" className="size-4" />
                </span>
              </CardHeader>
              <CardContent className="px-5">
                <CardTitle className="text-2xl">shadcn/ui</CardTitle>
                <p className="mt-1 text-xs text-muted-foreground">
                  Base UI primitives in @clubedge/ui
                </p>
              </CardContent>
            </Card>
            <Card className="gap-4 py-5">
              <CardHeader className="flex-row items-center justify-between gap-2 px-5">
                <CardDescription>Health endpoint</CardDescription>
                <span className="grid size-9 place-items-center rounded-lg bg-primary/10 text-primary">
                  <Activity aria-hidden="true" className="size-4" />
                </span>
              </CardHeader>
              <CardContent className="px-5">
                <CardTitle className="text-2xl">Available</CardTitle>
                <p className="mt-1 text-xs text-muted-foreground">
                  <Link
                    className="inline-flex items-center gap-1 text-primary hover:underline"
                    href="/api/health"
                  >
                    Check liveness <ArrowUpRight aria-hidden="true" className="size-3" />
                  </Link>
                </p>
              </CardContent>
            </Card>
          </section>

          <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]" id="modules">
            <Card className="gap-0 py-0">
              <CardHeader className="flex-row items-start justify-between gap-3 border-b px-5 py-5 sm:px-6">
                <div className="space-y-1.5">
                  <CardTitle className="text-base">Application modules</CardTitle>
                  <CardDescription>
                    Provider boundaries are ready for your project configuration.
                  </CardDescription>
                </div>
                <Badge variant="secondary">{modules.length} modules</Badge>
              </CardHeader>
              <CardContent className="px-5 py-2 sm:px-6">
                {modules.map(({ name, description, icon: Icon, status, variant }, index) => (
                  <div key={name}>
                    {index > 0 && <Separator />}
                    <div className="flex items-center gap-3 py-4">
                      <span className="grid size-9 shrink-0 place-items-center rounded-lg border bg-muted/60 text-muted-foreground">
                        <Icon aria-hidden="true" className="size-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{name}</p>
                        <p className="mt-1 text-xs leading-5 text-muted-foreground">
                          {description}
                        </p>
                      </div>
                      <Badge className="shrink-0" variant={variant}>
                        {status}
                      </Badge>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card className="gap-0 py-0" id="activity">
              <CardHeader className="border-b px-5 py-5 sm:px-6">
                <CardTitle className="text-base">Project setup</CardTitle>
                <CardDescription>Recommended first steps for a new application.</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="ps-5 sm:ps-6">Item</TableHead>
                      <TableHead className="pe-5 text-end sm:pe-6">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {setupRows.map((row) => (
                      <TableRow key={row.item}>
                        <TableCell className="whitespace-normal py-4 ps-5 sm:ps-6">
                          <span className="block font-medium">{row.item}</span>
                          <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                            {row.detail}
                          </span>
                        </TableCell>
                        <TableCell className="pe-5 text-end sm:pe-6">
                          <Badge variant={row.status === "Ready" ? "default" : "outline"}>
                            {row.status === "Ready" && <Check aria-hidden="true" />}
                            {row.status}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
              <Separator />
              <CardContent className="flex items-center justify-between gap-4 px-5 py-4 sm:px-6">
                <p className="text-xs text-muted-foreground">Need help connecting a provider?</p>
                <Button
                  render={
                    <Link href={siteConfig.links.setupGuide} target="_blank" rel="noreferrer" />
                  }
                  size="sm"
                  variant="ghost"
                >
                  Setup docs <ArrowUpRight aria-hidden="true" />
                </Button>
              </CardContent>
            </Card>
          </section>

          <Card className="gap-4 border-dashed bg-muted/30 py-5 shadow-none">
            <CardContent className="flex flex-col gap-4 px-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
              <div className="flex items-start gap-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-background text-primary shadow-sm">
                  <Settings2 aria-hidden="true" className="size-4" />
                </span>
                <div>
                  <p className="text-sm font-medium">Make this foundation yours</p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    Configure environment values, review the architecture, and add only the UI
                    components your product needs.
                  </p>
                </div>
              </div>
              <Button
                render={
                  <Link href={siteConfig.links.setupGuide} target="_blank" rel="noreferrer" />
                }
                size="sm"
                variant="outline"
              >
                Get started <ArrowRight aria-hidden="true" />
              </Button>
            </CardContent>
          </Card>

          <footer className="flex flex-col gap-2 border-t pt-5 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
            <span>{siteConfig.name} · Next.js application foundation</span>
            <span className="inline-flex items-center gap-2">
              <Check aria-hidden="true" className="size-3.5 text-primary" /> Built to be extended
            </span>
          </footer>
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
