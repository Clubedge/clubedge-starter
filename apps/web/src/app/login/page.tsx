import { CircleAlert, Info, MailCheck } from "lucide-react";
import Link from "next/link";

import { signIn, signUp } from "@/app/actions/auth";
import { ClubedgeMark } from "@/components/branding/clubedge-mark";
import { siteConfig } from "@/config/site";
import { safeRedirectPath } from "@clubedge/core";
import { loginUrl } from "@/lib/login-url";
import { getAuth, isAuthConfigured } from "@/server/auth";
import { Card, CardContent } from "@clubedge/ui/components/card";

import { EmailField, PasswordField, SubmitButton } from "./_components/auth-form-controls";
import { Notice } from "./_components/notice";

type LoginPageProps = {
  searchParams: Promise<{
    error?: string;
    mode?: string;
    "check-email"?: string;
    notice?: string;
    next?: string;
  }>;
};

const errorMessages: Record<string, string> = {
  "invalid-input": "Enter a valid email and a password with at least 8 characters.",
  "invalid-credentials": "Those credentials could not be verified. Check your email and password.",
  "signup-failed": "We could not create your account. Please check your details and try again.",
  "auth-callback": "That sign-in link could not be verified. Request a new one.",
  "rate-limited": "Too many attempts. Wait a minute and try again.",
  "email-not-verified":
    "Confirm your email address first: open the link we sent when you signed up.",
};

const notices: Record<string, string> = {
  "reset-sent": "If an account uses that email, we sent it a link to choose a new password.",
  "password-updated": "Password updated. Sign in with your new password.",
  "account-deleted": "Your account was deleted.",
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const isSignUp = params.mode === "signup";
  const error = params.error ? errorMessages[params.error] : undefined;
  const checkEmail = Boolean(params["check-email"]);
  const next = safeRedirectPath(params.next);
  const hasAuthConfig = isAuthConfigured();
  const notice = params.notice ? notices[params.notice] : undefined;
  const canResetPassword = hasAuthConfig && (await getAuth()).canResetPassword;

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
            {!hasAuthConfig && (
              <Notice icon={<Info />} role="status" tone="warning">
                Authentication is not configured yet. Add your auth provider's settings to{" "}
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
            {notice && (
              <Notice icon={<MailCheck />} role="status" tone="info">
                {notice}
              </Notice>
            )}
            {checkEmail && (
              <Notice icon={<MailCheck />} role="status" tone="info">
                Account created. Check your inbox for the confirmation link to finish signing up.
              </Notice>
            )}

            <form action={isSignUp ? signUp : signIn} className="grid gap-5">
              <input name="next" type="hidden" value={next} />
              <EmailField />
              <PasswordField isSignUp={isSignUp} />
              {!isSignUp && canResetPassword && (
                <Link
                  className="-mt-3 justify-self-end text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  href="/forgot-password"
                >
                  Forgot password?
                </Link>
              )}
              <SubmitButton disabled={!hasAuthConfig}>
                {isSignUp ? "Create account" : "Sign in"}
              </SubmitButton>
            </form>
          </CardContent>
        </Card>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          {isSignUp ? "Already have an account?" : "Don't have an account?"}{" "}
          <Link
            className="font-medium text-foreground underline-offset-4 hover:underline focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            href={loginUrl({ mode: isSignUp ? "signin" : "signup", next })}
          >
            {isSignUp ? "Sign in" : "Create one"}
          </Link>
        </p>
      </div>

      <footer className="mt-10 text-center text-xs text-muted-foreground sm:absolute sm:bottom-6">
        <Link className="underline-offset-4 hover:underline" href="/">
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
