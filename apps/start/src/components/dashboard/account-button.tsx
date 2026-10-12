import { Link } from "@tanstack/react-router";

import type { AuthUser } from "@/server/auth";
import { Button, buttonVariants } from "@clubedge/ui/components/button";

type AccountButtonProps = {
  user: AuthUser | null;
  className?: string;
};

export function AccountButton({ user, className }: AccountButtonProps) {
  if (!user) {
    return (
      <Link to="/login" className={buttonVariants({ className, size: "sm", variant: "outline" })}>
        Sign in
      </Link>
    );
  }

  return (
    <form action="/auth/sign-out" className={className} method="post">
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
