import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { Button } from "@clubedge/ui/components/button";
import { Input } from "@clubedge/ui/components/input";
import { Label } from "@clubedge/ui/components/label";
import { authClient } from "@/lib/auth";
import { publicOrigin } from "@/lib/public-origin";

export function ForgotPasswordPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (!authClient.configured) {
      return setError("Configure the selected authentication provider first.");
    }
    setBusy(true);
    try {
      // The emailed link opens the website, wherever this page was loaded from.
      await authClient.requestPasswordReset(email, `${publicOrigin}/reset-password`);
      setBusy(false);
      await navigate({ href: "/login?notice=reset-sent" });
    } catch {
      setBusy(false);
      setError("We could not send a reset email. Try again later.");
    }
  }

  return (
    <main className="mx-auto grid min-h-svh w-full max-w-md content-center gap-6 px-4 py-12">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Reset your password</h1>
        <p className="text-sm text-muted-foreground">
          We will email you a link if that address has an account.
        </p>
      </header>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <form className="grid gap-4" onSubmit={submit}>
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
        <Button disabled={busy} type="submit">
          {busy ? "Sending…" : "Send reset link"}
        </Button>
      </form>
      <Link className="text-sm underline underline-offset-4" to={"/login" as never}>
        Back to sign in
      </Link>
    </main>
  );
}
