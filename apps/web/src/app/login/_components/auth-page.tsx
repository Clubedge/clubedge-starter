import Link from "next/link";
import type { ReactNode } from "react";

import { ClubedgeMark } from "@/components/branding/clubedge-mark";
import { siteConfig } from "@/config/site";
import { Card, CardContent } from "@clubedge/ui/components/card";

/** The centered card layout shared by the forgot-password and reset-password pages. */
export function AuthPage({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <main className="flex min-h-svh flex-col items-center bg-background px-4 py-10 sm:justify-center">
      <div className="w-full max-w-[26rem]">
        <header className="mb-8 flex flex-col items-center gap-4 text-center">
          <Link
            aria-label={`${siteConfig.name} home`}
            className="rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            href="/"
          >
            <ClubedgeMark className="size-12" />
          </Link>
          <div className="grid gap-1.5">
            <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
            <p className="text-sm text-muted-foreground">{description}</p>
          </div>
        </header>

        <Card className="rounded-xl border-border/70 p-0 shadow-sm">
          <CardContent className="grid gap-5 p-6 sm:p-8">{children}</CardContent>
        </Card>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          <Link
            className="font-medium text-foreground underline-offset-4 hover:underline focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            href="/login"
          >
            Back to sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
