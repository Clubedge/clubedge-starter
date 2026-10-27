// The account settings page, as the Next.js and TanStack Start apps have it: the display name
// and account deletion go through the API, which keeps the app's data; the password changes with
// the auth provider (its browser SDK, or Better Auth's server), like sign-in.
import {
  ArrowLeft,
  ArrowRight,
  CircleAlert,
  CircleCheck,
  Eye,
  EyeOff,
  Loader2,
} from "lucide-react";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Link, useNavigate } from "@tanstack/react-router";

import { Button, buttonVariants } from "@clubedge/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@clubedge/ui/components/card";
import { Input } from "@clubedge/ui/components/input";
import { Label } from "@clubedge/ui/components/label";
import { api } from "@/lib/api";
import { authClient } from "@/lib/auth";
import { AccountError } from "@/lib/auth-client";

const results: Record<string, { tone: "info" | "error"; text: string }> = {
  "profile-saved": { tone: "info", text: "Your profile was saved." },
  "password-changed": { tone: "info", text: "Your password was changed." },
  "invalid-password": { tone: "error", text: "That password is not correct." },
  "invalid-input": {
    tone: "error",
    text: "Check the form: names have up to 80 characters, and passwords at least 8.",
  },
  "rate-limited": { tone: "error", text: "Too many attempts. Wait a minute and try again." },
  unavailable: {
    tone: "error",
    text: "Password checks are unavailable right now. Try again in a few minutes.",
  },
  "active-subscription": {
    tone: "error",
    text: "Cancel your subscription with Manage billing on the dashboard before deleting your account.",
  },
  "delete-unavailable": {
    tone: "error",
    text: "Deleting an account is not set up for this app yet.",
  },
  failed: { tone: "error", text: "Something went wrong. Try again in a moment." },
};

// The API's error codes, as the result keys above.
const apiErrors: Record<string, string> = {
  invalid_input: "invalid-input",
  invalid_password: "invalid-password",
  rate_limited: "rate-limited",
  unavailable: "unavailable",
  active_subscription: "active-subscription",
  not_configured: "delete-unavailable",
};

type Settings =
  | { state: "loading" }
  | { state: "unconfigured" }
  | {
      state: "ready";
      email: string;
      displayName: string | null;
      /** False when the API has no account endpoints (one that does not implement them yet). */
      profiles: boolean;
      canDeleteAccount: boolean;
    };

const toLogin = "/login?next=%2Fsettings";

export function SettingsPage() {
  const navigate = useNavigate();
  const [settings, setSettings] = useState<Settings>({ state: "loading" });
  const [result, setResult] = useState<string | null>(null);

  useEffect(() => {
    if (!authClient.configured) {
      setSettings({ state: "unconfigured" });
      return;
    }
    let active = true;
    void Promise.all([
      api.GET("/api/session").catch(() => null),
      api.GET("/api/account").catch(() => null),
    ]).then(([session, account]) => {
      if (!active) return;
      const user = session?.data?.user;
      if (!user) {
        void navigate({ href: toLogin });
        return;
      }
      setSettings({
        state: "ready",
        email: user.email,
        displayName: account?.data?.displayName ?? null,
        profiles: Boolean(account?.data),
        canDeleteAccount: account?.data?.canDeleteAccount ?? false,
      });
    });
    return () => {
      active = false;
    };
  }, [navigate]);

  if (settings.state !== "ready") {
    return (
      <main className="mx-auto grid w-full max-w-2xl gap-6 px-4 py-10">
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">
          {settings.state === "loading"
            ? "Loading your account…"
            : "Sign-in is not configured yet, so there is no account to manage."}
        </p>
      </main>
    );
  }

  const shown = result ? results[result] : undefined;

  async function saveProfile(form: HTMLFormElement) {
    const displayName = String(new FormData(form).get("displayName") ?? "");
    try {
      const { response, error } = await api.POST("/api/account/profile", {
        body: { displayName },
      });
      if (response.status === 401) return navigate({ href: toLogin });
      // A gateway's HTML page or an empty body arrives as text, without an error code.
      setResult(response.ok ? "profile-saved" : (apiErrors[error?.error?.code ?? ""] ?? "failed"));
    } catch {
      setResult("failed");
    }
  }

  async function changePassword(form: HTMLFormElement) {
    const data = new FormData(form);
    try {
      await authClient.changePassword(
        String(data.get("currentPassword") ?? ""),
        String(data.get("newPassword") ?? ""),
      );
    } catch (error) {
      setResult(error instanceof AccountError ? error.code : "failed");
      return;
    }
    form.reset();
    setResult("password-changed");
  }

  async function deleteAccount(form: HTMLFormElement) {
    const password = String(new FormData(form).get("password") ?? "");
    try {
      const { response, error } = await api.POST("/api/account/delete", { body: { password } });
      if (response.status === 401) return navigate({ href: toLogin });
      if (!response.ok) {
        setResult(apiErrors[error?.error?.code ?? ""] ?? "failed");
        return;
      }
    } catch {
      setResult("failed");
      return;
    }
    // The account is gone, and its sessions with it; this clears what the browser kept.
    await authClient.signOut().catch(() => {});
    await navigate({ href: "/login?notice=account-deleted" });
  }

  return (
    <main className="mx-auto grid w-full max-w-2xl gap-6 px-4 py-10">
      <div className="grid gap-2">
        <Link
          to="/dashboard"
          className={buttonVariants({ className: "w-fit", size: "sm", variant: "ghost" })}
        >
          <ArrowLeft aria-hidden="true" /> Dashboard
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">Signed in as {settings.email}.</p>
      </div>
      {shown && <Notice tone={shown.tone}>{shown.text}</Notice>}
      <Card id="profile">
        <CardHeader>
          <CardTitle>Profile</CardTitle>
          <CardDescription>The name shown in the app.</CardDescription>
        </CardHeader>
        <CardContent>
          {settings.profiles ? (
            <SettingsForm onSubmit={saveProfile} onStart={() => setResult(null)}>
              <div className="grid gap-2">
                <Label htmlFor="displayName">Display name</Label>
                <Input
                  autoComplete="name"
                  className="h-11"
                  defaultValue={settings.displayName ?? ""}
                  id="displayName"
                  maxLength={80}
                  name="displayName"
                />
              </div>
              <SubmitButton>Save profile</SubmitButton>
            </SettingsForm>
          ) : (
            <p className="text-sm text-muted-foreground">
              This app&apos;s API does not keep profiles yet.
            </p>
          )}
        </CardContent>
      </Card>
      <AppPushSettings /> {/* clubedge:only push=native && shell!=none */}
      <Card id="change-password">
        <CardHeader>
          <CardTitle>Password</CardTitle>
          <CardDescription>Confirm your current password to choose a new one.</CardDescription>
        </CardHeader>
        <CardContent>
          <SettingsForm onSubmit={changePassword} onStart={() => setResult(null)}>
            <PasswordField
              isNew={false}
              label="Current password"
              name="currentPassword"
              minLength={1}
            />
            <PasswordField isNew label="New password" name="newPassword" />
            <SubmitButton>Change password</SubmitButton>
          </SettingsForm>
        </CardContent>
      </Card>
      <Card id="delete-account">
        <CardHeader>
          <CardTitle>Delete account</CardTitle>
          <CardDescription>
            Deletes your account and the data the app keeps for it. This cannot be undone.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {settings.canDeleteAccount ? (
            <SettingsForm onSubmit={deleteAccount} onStart={() => setResult(null)}>
              <PasswordField isNew={false} label="Password" name="password" minLength={1} />
              <SubmitButton variant="destructive">Delete my account</SubmitButton>
            </SettingsForm>
          ) : (
            <p className="text-sm text-muted-foreground">
              Deleting an account is not set up for this app yet.
            </p>
          )}
        </CardContent>
      </Card>
    </main>
  );
}

function Notice({ tone, children }: { tone: "info" | "error"; children: ReactNode }) {
  return (
    <div
      className={`flex items-start gap-2.5 rounded-lg border px-3.5 py-3 text-sm leading-5 ${
        tone === "error"
          ? "border-destructive/30 bg-destructive/5 text-destructive"
          : "border-primary/30 bg-primary/5 text-foreground"
      }`}
      role={tone === "error" ? "alert" : "status"}
    >
      <span aria-hidden="true" className="mt-0.5 shrink-0 [&>svg]:size-4">
        {tone === "error" ? <CircleAlert /> : <CircleCheck />}
      </span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/** A form that runs `onSubmit` once at a time, showing its button as pending meanwhile. */
function SettingsForm({
  children,
  onStart,
  onSubmit,
}: {
  children: ReactNode;
  onStart(): void;
  onSubmit(form: HTMLFormElement): Promise<unknown>;
}) {
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const form = event.currentTarget;
    setPending(true);
    onStart();
    try {
      await onSubmit(form);
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="grid gap-5" data-pending={pending || undefined} onSubmit={submit}>
      <fieldset className="contents" disabled={pending}>
        {children}
      </fieldset>
    </form>
  );
}

function PasswordField({
  isNew,
  label,
  name,
  minLength = 8,
}: {
  isNew: boolean;
  label: string;
  /** The field's name and id; the page has more than one password field. */
  name: string;
  /** 1 for fields that confirm an existing password, which may predate the current rules. */
  minLength?: number;
}) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="grid gap-2">
      <Label htmlFor={name}>{label}</Label>
      <div className="relative">
        <Input
          aria-describedby={isNew ? `${name}-hint` : undefined}
          autoComplete={isNew ? "new-password" : "current-password"}
          className="h-11 pr-11"
          id={name}
          maxLength={128}
          minLength={minLength}
          name={name}
          required
          type={visible ? "text" : "password"}
        />
        <button
          aria-label={visible ? "Hide password" : "Show password"}
          aria-pressed={visible}
          className="absolute inset-y-0 right-0 grid w-11 place-items-center rounded-r-md text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          onClick={() => setVisible((value) => !value)}
          type="button"
        >
          {visible ? (
            <EyeOff aria-hidden="true" className="size-4" />
          ) : (
            <Eye aria-hidden="true" className="size-4" />
          )}
        </button>
      </div>
      {isNew && (
        <p className="text-xs text-muted-foreground" id={`${name}-hint`}>
          Use at least 8 characters.
        </p>
      )}
    </div>
  );
}

function SubmitButton({
  children,
  variant,
}: {
  children: ReactNode;
  variant?: "default" | "destructive";
}) {
  return (
    <Button className="h-11 w-full justify-center group" type="submit" variant={variant}>
      <Loader2
        aria-hidden="true"
        className="hidden animate-spin group-disabled:block motion-reduce:animate-none"
      />
      {children}
      <ArrowRight aria-hidden="true" className="group-disabled:hidden" />
    </Button>
  );
}
// clubedge:if push=native && shell!=none

/**
 * The mobile app's notifications (packages/mobile, push-settings.tsx), a card only the app's build
 * loads, so the website never has Capacitor.
 */
function AppPushSettings() {
  type PushSettings = typeof import("@clubedge/mobile/push-settings").PushSettings;
  const [PushSettings, setPushSettings] = useState<PushSettings | null>(null);
  useEffect(() => {
    if (import.meta.env.MODE !== "app") return;
    void import("@clubedge/mobile/push-settings").then((module) =>
      setPushSettings(() => module.PushSettings),
    );
  }, []);
  return PushSettings ? <PushSettings api={api} /> : null;
}
// clubedge:end
