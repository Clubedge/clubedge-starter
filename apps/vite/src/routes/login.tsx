import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { Button } from "@clubedge/ui/components/button";
import { Input } from "@clubedge/ui/components/input";
import { Label } from "@clubedge/ui/components/label";
import { siteConfig } from "@/config/site";
import { authClient } from "@/lib/auth";
import { publicOrigin } from "@/lib/public-origin";

function safeNext(value: string | null): string {
  if (!value) return "/dashboard";
  try {
    const url = new URL(value, window.location.origin);
    return url.origin === window.location.origin
      ? `${url.pathname}${url.search}${url.hash}`
      : "/dashboard";
  } catch {
    return "/dashboard";
  }
}

const notices: Record<string, string> = {
  "reset-sent": "If that email has an account, we sent it a link to reset the password.",
  "password-updated": "Password updated. Sign in with your new password.",
  "password-reset": "Your password has been reset. Sign in with your new password.",
  "account-deleted": "Your account was deleted.",
};

const checkEmailNotice = "Check your email to confirm your account, then sign in.";

export function LoginPage() {
  const navigate = useNavigate();
  // Read on each render: signing up moves to /login?check-email=1 on the same page.
  const search = useRouterState({ select: (state) => state.location.searchStr });
  const params = new URLSearchParams(search);
  const next = safeNext(params.get("next"));
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const signup = params.get("mode") === "signup";
  const [message, setMessage] = useState(
    params.has("check-email") ? checkEmailNotice : (notices[params.get("notice") ?? ""] ?? ""),
  );
  const [error, setError] = useState(
    params.get("error") === "rate-limited"
      ? "Too many attempts. Wait a moment, then try again."
      : "",
  );
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!authClient.completeEmailVerification) return;
    const verificationParams = new URLSearchParams(window.location.search);
    void authClient
      .completeEmailVerification(verificationParams)
      .then(() => {
        if (
          verificationParams.has("oobCode") ||
          (verificationParams.has("userId") && verificationParams.has("secret")) ||
          verificationParams.has("code")
        ) {
          setMessage("Email confirmed. You can now sign in.");
          window.history.replaceState({}, "", "/login");
        }
      })
      .catch(() => setError("That email confirmation link is invalid or has expired."));
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setError("");
    if (!authClient.configured) {
      setError("Configure the selected authentication provider before signing in.");
      return;
    }
    setBusy(true);
    try {
      if (signup) {
        // The confirmation link opens the website, wherever this page was loaded from.
        const result = await authClient.signUp(
          email,
          password,
          `${publicOrigin}/login?next=${encodeURIComponent(next)}`,
        );
        if (result.needsConfirmation) {
          setMessage(checkEmailNotice);
          setPassword("");
          setBusy(false);
          const query = new URLSearchParams({ "check-email": "1" });
          if (next !== "/dashboard") query.set("next", next);
          await navigate({ href: `/login?${query}` });
          return;
        }
      } else {
        await authClient.signIn(email, password);
      }
      setBusy(false);
      await navigate({ href: next });
    } catch (cause) {
      setBusy(false);
      if (cause instanceof Error && cause.name === "EmailVerificationRequiredError") {
        setError("Confirm your email address first: open the link in the email we sent you.");
      } else if (cause instanceof Error && cause.name === "EmailVerificationDeliveryError") {
        setError(
          "Your account was created, but we could not send the verification email. Sign in to request another link.",
        );
      } else {
        setError(
          signup ? "We could not create that account." : "Email or password could not be verified.",
        );
      }
    }
  }

  const signupHref = `/login?${new URLSearchParams({ mode: "signup", next })}`;
  const signinHref = `/login?${new URLSearchParams({ next })}`;

  return (
    <main className="mx-auto grid min-h-svh w-full max-w-md content-center gap-6 px-4 py-12">
      <header className="space-y-2">
        <Link className="text-sm text-muted-foreground hover:text-foreground" to="/">
          {siteConfig.name}
        </Link>
        <h1 className="text-3xl font-semibold tracking-tight">
          {signup ? "Create your account" : "Sign in"}
        </h1>
        <p className="text-sm text-muted-foreground">Continue to your dashboard.</p>
      </header>
      {error && (
        <p
          role="alert"
          className="rounded-md border border-destructive/40 p-3 text-sm text-destructive"
        >
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="rounded-md border p-3 text-sm">
          {message}
        </p>
      )}
      <form className="grid gap-4" onSubmit={submit}>
        <input name="next" type="hidden" value={next} />
        <div className="grid gap-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            autoComplete={signup ? "new-password" : "current-password"}
            minLength={signup ? 8 : undefined}
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </div>
        <Button disabled={busy} type="submit">
          {busy ? "Please wait…" : signup ? "Create account" : "Sign in"}
        </Button>
      </form>
      {!signup && (
        <Link
          className="text-sm text-muted-foreground underline underline-offset-4"
          to={"/forgot-password" as never}
        >
          Forgot password?
        </Link>
      )}
      <p className="text-sm text-muted-foreground">
        {signup ? "Already have an account? " : "New here? "}
        <a
          className="font-medium text-foreground underline underline-offset-4"
          href={signup ? signinHref : signupHref}
        >
          {signup ? "Sign in" : "Create one"}
        </a>
      </p>
    </main>
  );
}
