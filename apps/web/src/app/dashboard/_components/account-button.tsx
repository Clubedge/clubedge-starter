import Link from "next/link";

import { signOut } from "@/app/actions/auth";
import type { AuthUser } from "@/server/auth";
import { Button, buttonVariants } from "@clubedge/ui/components/button";

type AccountButtonProps = {
  user: AuthUser | null;
  className?: string;
};

export function AccountButton({ user, className }: AccountButtonProps) {
  if (!user) {
    return (
      <Link href="/login" className={buttonVariants({ className, size: "sm", variant: "outline" })}>
        Sign in
      </Link>
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
