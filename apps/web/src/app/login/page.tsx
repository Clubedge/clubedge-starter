import { ArrowLeft, ArrowUpRight, ShieldCheck } from "lucide-react";
import Link from "next/link";

import { signIn, signUp } from "@/app/actions/auth";
import { hasSupabaseAuthConfig } from "@/env/client";
import { Button } from "@clubedge/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@clubedge/ui/components/card";
import { Input } from "@clubedge/ui/components/input";
import { Label } from "@clubedge/ui/components/label";
import { Separator } from "@clubedge/ui/components/separator";

type LoginPageProps = {
  searchParams: Promise<{ error?: string; "check-email"?: string }>;
};

const errorMessages: Record<string, string> = {
  "invalid-input": "Enter a valid email and a password with at least 8 characters.",
  "invalid-credentials": "Those credentials could not be verified. Try again.",
  "signup-failed": "We could not create the account. Check your details and try again.",
  "auth-callback": "That sign-in link could not be verified. Request a new one.",
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const error = params.error ? errorMessages[params.error] : undefined;

  return (
    <main className="grid min-h-svh place-items-center bg-muted/40 p-4 sm:p-8">
      <div className="w-full max-w-md space-y-5">
        <Link
          className="inline-flex items-center gap-2 text-sm font-semibold tracking-tight"
          href="/"
        >
          <span className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground">
            <ShieldCheck aria-hidden="true" className="size-4" />
          </span>
          Clubedge Starter
        </Link>

        <Card className="gap-0 overflow-hidden py-0">
          <CardHeader className="gap-2 border-b px-6 py-6">
            <CardTitle className="text-xl">Welcome back</CardTitle>
            <CardDescription>
              Sign in to your application or create an account to get started.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5 px-6 py-6">
            {!hasSupabaseAuthConfig && (
              <div
                className="rounded-lg border bg-muted/50 p-3 text-sm leading-5 text-muted-foreground"
                role="status"
              >
                Add your Supabase URL and publishable key to{" "}
                <code className="rounded bg-background px-1 py-0.5 font-mono text-xs">
                  apps/web/.env.local
                </code>{" "}
                to enable authentication.
              </div>
            )}
            {error && (
              <div
                className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm leading-5 text-destructive"
                role="alert"
              >
                {error}
              </div>
            )}
            {params["check-email"] && (
              <div
                className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm leading-5 text-foreground"
                role="status"
              >
                Check your email to confirm your new account.
              </div>
            )}

            <form action={signIn} className="grid gap-3">
              <div className="grid gap-2">
                <Label htmlFor="email">Email address</Label>
                <Input id="email" name="email" type="email" autoComplete="email" required />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  minLength={8}
                  maxLength={128}
                  required
                />
              </div>
              <Button className="mt-2 w-full" type="submit" disabled={!hasSupabaseAuthConfig}>
                Sign in <ArrowUpRight aria-hidden="true" />
              </Button>
            </form>

            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <Separator className="flex-1" />
              <span>New to the workspace?</span>
              <Separator className="flex-1" />
            </div>

            <form action={signUp} className="grid gap-3">
              <div className="grid gap-2">
                <Label htmlFor="signup-email">Email address</Label>
                <Input id="signup-email" name="email" type="email" autoComplete="email" required />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="signup-password">Create a password</Label>
                <Input
                  id="signup-password"
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  minLength={8}
                  maxLength={128}
                  required
                />
              </div>
              <Button
                className="w-full"
                type="submit"
                variant="outline"
                disabled={!hasSupabaseAuthConfig}
              >
                Create account
              </Button>
            </form>
          </CardContent>
          <CardFooter className="border-t bg-muted/30 px-6 py-4 text-xs text-muted-foreground">
            Sessions are verified server side and stored in secure cookies.
          </CardFooter>
        </Card>

        <Button className="px-0 text-muted-foreground" render={<Link href="/" />} variant="link">
          <ArrowLeft aria-hidden="true" /> Back to the starter
        </Button>
      </div>
    </main>
  );
}
