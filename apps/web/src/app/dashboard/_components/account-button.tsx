import Link from "next/link";

import { signOut } from "@/app/actions/auth";
import type { AuthUser } from "@/server/auth";
import { Button } from "@clubedge/ui/components/button";

type AccountButtonProps = {
  user: AuthUser | null;
  className?: string;
};

export function AccountButton({ user, className }: AccountButtonProps) {
  if (!user) {
    return (
      <Button className={className} render={<Link href="/login" />} size="sm" variant="outline">
        Sign in
      </Button>
    );
  }

  return (
    <form action={signOut} className={className}>
      <Button
        className="w-full"
        size="sm"
        title={user.email ?? undefined}
        type="submit"
        variant="outline"
      >
        Sign out
      </Button>
    </form>
  );
}
