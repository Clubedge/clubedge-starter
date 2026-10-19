import { useState, type FormEvent } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Button } from "@clubedge/ui/components/button";
import { Input } from "@clubedge/ui/components/input";
import { Label } from "@clubedge/ui/components/label";
import { supabase } from "@/lib/auth";

export function ResetPasswordPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (!supabase) return setError("Configure Supabase Auth before updating your password.");
    setBusy(true);
    const { error: result } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (result) setError("That reset link could not be verified. Request a new one.");
    else await navigate({ href: "/login?notice=password-updated" });
  }

  return (
    <main className="mx-auto grid min-h-svh w-full max-w-md content-center gap-6 px-4 py-12">
      <header className="space-y-2"><h1 className="text-3xl font-semibold tracking-tight">Choose a new password</h1><p className="text-sm text-muted-foreground">Use at least eight characters.</p></header>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <form className="grid gap-4" onSubmit={submit}>
        <div className="grid gap-2"><Label htmlFor="password">New password</Label><Input id="password" type="password" autoComplete="new-password" minLength={8} required value={password} onChange={(event) => setPassword(event.target.value)} /></div>
        <Button disabled={busy} type="submit">{busy ? "Updating…" : "Update password"}</Button>
      </form>
    </main>
  );
}
