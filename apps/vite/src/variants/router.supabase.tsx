// The routes, declared in code: this app has no router plugin or generated route tree.
import { Outlet, createRootRoute, createRoute, createRouter } from "@tanstack/react-router";
import { TooltipProvider } from "@clubedge/ui/components/tooltip";
import { NotFound } from "@/components/not-found";
import { RouteError } from "@/components/route-error";
import { ThemeProvider } from "@/components/theme/theme-provider";
import { DashboardPage, loadDashboard } from "@/routes/dashboard";
import { LandingPage } from "@/routes/index";
import { LoginPage } from "@/routes/login";
import { ForgotPasswordPage } from "@/routes/forgot-password";
import { ResetPasswordPage } from "@/routes/reset-password";
import { SettingsPage } from "@/routes/settings";

const rootRoute = createRootRoute({
  component: () => (
    <ThemeProvider>
      <TooltipProvider>
        <Outlet />
      </TooltipProvider>
    </ThemeProvider>
  ),
  errorComponent: RouteError,
  notFoundComponent: NotFound,
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: LandingPage,
});
const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/login",
  component: LoginPage,
});
const forgotPasswordRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/forgot-password",
  component: ForgotPasswordPage,
});
const resetPasswordRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/reset-password",
  component: ResetPasswordPage,
});
export const dashboardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/dashboard",
  loader: loadDashboard,
  component: DashboardPage,
});

const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/settings",
  component: SettingsPage,
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  loginRoute,
  forgotPasswordRoute,
  resetPasswordRoute,
  dashboardRoute,
  settingsRoute,
]);
export const router = createRouter({
  routeTree,
  scrollRestoration: true,
  defaultPreload: "intent",
});
