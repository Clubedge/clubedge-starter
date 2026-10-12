"use client";

// clubedge:if observability!=none
import { useEffect } from "react";
// clubedge:end
import { Button } from "@clubedge/ui/components/button";
// clubedge:if observability!=none
import { reportBrowserError } from "@/components/error-reporting";
// clubedge:end

/** Shown in place of a page that failed to render. */
export default function PageError({
  // clubedge:if observability!=none
  error,
  // clubedge:end
  reset,
}: Readonly<{ error: Error & { digest?: string }; reset: () => void }>) {
  // clubedge:if observability!=none
  // Error boundaries stop render errors before they reach the window, so report them here.
  useEffect(() => {
    reportBrowserError(error);
  }, [error]);
  // clubedge:end
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-4 bg-background px-4 text-center">
      <h1 className="text-xl font-semibold">Something went wrong</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        This page could not be shown. Try again, or come back in a moment.
      </p>
      <Button onClick={reset}>Try again</Button>
    </main>
  );
}
