// The routes, declared in code: this app has no router plugin or generated route tree.
// It renders in the browser only; the API serves everything that needs a server.
import { Outlet, createRootRoute, createRoute, createRouter } from "@tanstack/react-router";
import { TooltipProvider } from "@clubedge/ui/components/tooltip";
import { NotFound } from "@/components/not-found";
import { RouteError } from "@/components/route-error";
import { ThemeProvider } from "@/components/theme/theme-provider";
import { DashboardPage, loadDashboard } from "@/routes/dashboard";
import { LandingPage } from "@/routes/index";

const rootRoute = createRootRoute({
  component: RootComponent,
  errorComponent: RouteError,
  notFoundComponent: NotFound,
});

function RootComponent() {
  return (
    <ThemeProvider>
      <TooltipProvider>
        <Outlet />
      </TooltipProvider>
    </ThemeProvider>
  );
}

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: LandingPage,
});

export const dashboardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/dashboard",
  loader: loadDashboard,
  component: DashboardPage,
});

const routeTree = rootRoute.addChildren([indexRoute, dashboardRoute]);

export const router = createRouter({
  routeTree,
  scrollRestoration: true,
  defaultPreload: "intent",
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
