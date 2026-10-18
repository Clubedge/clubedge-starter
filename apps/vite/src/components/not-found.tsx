import { Link } from "@tanstack/react-router";
import { buttonVariants } from "@clubedge/ui/components/button";

/** Shown for a URL that matches no route. */
export function NotFound() {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-4 bg-background px-4 text-center">
      <h1 className="text-xl font-semibold">Page not found</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        This page does not exist. Check the address, or go back to the home page.
      </p>
      <Link to="/" className={buttonVariants()}>
        Go home
      </Link>
    </main>
  );
}
