import { ArrowLeft, CircleAlert, CircleCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { getDisplayName } from "@clubedge/db";
import { Button } from "@clubedge/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@clubedge/ui/components/card";
import { Input } from "@clubedge/ui/components/input";
import { Label } from "@clubedge/ui/components/label";
import { PasswordField, SubmitButton } from "@/app/login/_components/auth-form-controls";
import { Notice } from "@/app/login/_components/notice";
import { getAuth, getPageUser } from "@/server/auth";
import { getDb } from "@/server/db";
import { getUserProfileId } from "@/server/users";
import { changePassword, deleteAccount, updateProfile } from "./actions";

export const metadata: Metadata = { title: "Settings" };

const results: Record<string, { tone: "info" | "error"; text: string }> = {
  "profile-saved": { tone: "info", text: "Your profile was saved." },
  "password-changed": { tone: "info", text: "Your password was changed." },
  "invalid-password": { tone: "error", text: "That password is not correct." },
  "invalid-input": {
    tone: "error",
    text: "Check the form: names have up to 80 characters, and passwords at least 8.",
  },
  "rate-limited": { tone: "error", text: "Too many attempts. Wait a minute and try again." },
  "active-subscription": {
    tone: "error",
    text: "Cancel your subscription with Manage billing on the dashboard before deleting your account.",
  },
  "delete-unavailable": {
    tone: "error",
    text: "Deleting an account is not set up for this app yet.",
  },
};

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; error?: string }>;
}) {
  const user = await getPageUser("/settings");
  const { status, error } = await searchParams;
  const result = results[error ?? status ?? ""];

  if (!user?.email) {
    return (
      <main className="mx-auto grid w-full max-w-2xl gap-6 px-4 py-10">
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Sign-in is not configured yet, so there is no account to manage.
        </p>
      </main>
    );
  }
  const displayName = await getDisplayName(
    getDb(),
    await getUserProfileId({ ...user, email: user.email }),
  );
  const canDeleteAccount = (await getAuth()).canDeleteAccount;

  return (
    <main className="mx-auto grid w-full max-w-2xl gap-6 px-4 py-10">
      <div className="grid gap-2">
        <Button className="w-fit" render={<Link href="/dashboard" />} size="sm" variant="ghost">
          <ArrowLeft aria-hidden="true" /> Dashboard
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">Signed in as {user.email}.</p>
      </div>

      {result && (
        <Notice
          icon={result.tone === "error" ? <CircleAlert /> : <CircleCheck />}
          role={result.tone === "error" ? "alert" : "status"}
          tone={result.tone}
        >
          {result.text}
        </Notice>
      )}

      <Card id="profile">
        <CardHeader>
          <CardTitle>Profile</CardTitle>
          <CardDescription>The name shown in the app.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={updateProfile} className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="displayName">Display name</Label>
              <Input
                autoComplete="name"
                className="h-11"
                defaultValue={displayName ?? ""}
                id="displayName"
                maxLength={80}
                name="displayName"
              />
            </div>
            <SubmitButton>Save profile</SubmitButton>
          </form>
        </CardContent>
      </Card>

      <Card id="change-password">
        <CardHeader>
          <CardTitle>Password</CardTitle>
          <CardDescription>Confirm your current password to choose a new one.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={changePassword} className="grid gap-4">
            <PasswordField isSignUp={false} label="Current password" name="currentPassword" />
            <PasswordField isSignUp label="New password" name="newPassword" />
            <SubmitButton>Change password</SubmitButton>
          </form>
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
          {canDeleteAccount ? (
            <form action={deleteAccount} className="grid gap-4">
              <PasswordField isSignUp={false} label="Password" name="password" />
              <SubmitButton variant="destructive">Delete my account</SubmitButton>
            </form>
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
