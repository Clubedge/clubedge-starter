import { CircleAlert, Info, MailCheck } from "lucide-react";
import { Link, createFileRoute } from "@tanstack/react-router";
import type { ReactNode } from "react";

import {
  AuthForm,
  EmailField,
  PasswordField,
  SubmitButton,
} from "@/components/auth/auth-form-controls";
import { ClubedgeMark } from "@/components/branding/clubedge-mark";
import { siteConfig } from "@/config/site";
import { safeRedirectPath } from "@clubedge/core";
import { loginUrl } from "@/lib/login-url";
import { getAuthStatus } from "@/server/auth.functions";
import { Card, CardContent } from "@clubedge/ui/components/card";

type LoginSearch = {
  error?: string;
  mode?: string;
  "check-email"?: string;
  next?: string;
};

const asString = (value: unknown) => (typeof value === "string" ? value : undefined);

export const Route = createFileRoute("/login")({
  validateSearch: (search: Record<string, unknown>): LoginSearch => ({
    error: asString(search.error),
    mode: asString(search.mode),
    "check-email": asString(search["check-email"]),
    next: asString(search.next),
  }),
  loader: () => getAuthStatus(),
  component: LoginPage,
});

const errorMessages: Record<string, string> = {
  "invalid-input": "Enter a valid email and a password with at least 8 characters.",
  "invalid-credentials": "Those credentials could not be verified. Check your email and password.",
  "signup-failed": "We could not create your account. Please check your details and try again.",
  "auth-callback": "That sign-in link could not be verified. Request a new one.",
  "rate-limited": "Too many attempts. Wait a minute and try again.",
};

type NoticeTone = "error" | "info" | "warning";

const noticeStyles: Record<NoticeTone, string> = {
  error: "border-destructive/30 bg-destructive/5 text-destructive",
  info: "border-primary/30 bg-primary/5 text-foreground",
  warning: "border-amber-500/30 bg-amber-500/5 text-foreground",
};

function Notice({
  children,
  icon,
  role,
  tone,
}: {
  children: ReactNode;
  icon: ReactNode;
  role: "alert" | "status";
  tone: NoticeTone;
}) {
  return (
    <div
      className={`flex items-start gap-2.5 rounded-lg border px-3.5 py-3 text-sm leading-5 ${noticeStyles[tone]}`}
      role={role}
    >
      <span aria-hidden="true" className="mt-0.5 shrink-0 [&>svg]:size-4">
        {icon}
      </span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function LoginPage() {
  const params = Route.useSearch();
  const { configured: hasSupabaseAuthConfig } = Route.useLoaderData();
  const isSignUp = params.mode === "signup";
  const error = params.error ? errorMessages[params.error] : undefined;
  const checkEmail = Boolean(params["check-email"]);
  const next = safeRedirectPath(params.next);

  return (
    <main className="flex min-h-svh flex-col items-center bg-background px-4 py-10 sm:justify-center">
      <div className="w-full max-w-[26rem]">
        <header className="mb-8 flex flex-col items-center gap-4 text-center">
          <Link
            aria-label={`${siteConfig.name} home`}
            className="rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            to="/"
          >
            <ClubedgeMark className="size-12 rounded-xl" />
          </Link>
          <div className="grid gap-1.5">
            <h1 className="text-2xl font-semibold tracking-tight">
              {isSignUp ? "Create your account" : `Sign in to ${siteConfig.shortName}`}
            </h1>
            <p className="text-sm text-muted-foreground">
              {isSignUp
                ? "Enter your email and choose a password."
                : "Welcome back. Enter your details to continue."}
            </p>
          </div>
        </header>

        <Card className="rounded-xl border-border/70 p-0 shadow-sm">
          <CardContent className="grid gap-5 p-6 sm:p-8">
            {!hasSupabaseAuthConfig && (
              <Notice icon={<Info />} role="status" tone="warning">
                Authentication is not configured yet. Add your Supabase URL and publishable key to{" "}
                <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
                  apps/web/.env.local
                </code>
                .
              </Notice>
            )}
            {error && (
              <Notice icon={<CircleAlert />} role="alert" tone="error">
                {error}
              </Notice>
            )}
            {checkEmail && (
              <Notice icon={<MailCheck />} role="status" tone="info">
                Account created. Check your inbox for the confirmation link to finish signing up.
              </Notice>
            )}

            <AuthForm action={isSignUp ? "/auth/sign-up" : "/auth/sign-in"}>
              <input name="next" type="hidden" value={next} />
              <EmailField />
              <PasswordField isSignUp={isSignUp} />
              <SubmitButton disabled={!hasSupabaseAuthConfig}>
                {isSignUp ? "Create account" : "Sign in"}
              </SubmitButton>
            </AuthForm>
          </CardContent>
        </Card>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          {isSignUp ? "Already have an account?" : "Don't have an account?"}{" "}
          <a
            className="font-medium text-foreground underline-offset-4 hover:underline focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            href={loginUrl({ mode: isSignUp ? "signin" : "signup", next })}
          >
            {isSignUp ? "Sign in" : "Create one"}
          </a>
        </p>
      </div>

      <footer className="mt-10 text-center text-xs text-muted-foreground sm:absolute sm:bottom-6">
        <Link className="underline-offset-4 hover:underline" to="/">
          Back to home
        </Link>
        <span aria-hidden="true" className="mx-2">
          |
        </span>
        {siteConfig.name}, Apache-2.0
      </footer>
    </main>
  );
}
