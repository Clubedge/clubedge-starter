import { Link } from "@tanstack/react-router";

import type { AuthUser } from "@/server/auth";
import { Button } from "@clubedge/ui/components/button";

type AccountButtonProps = {
  user: AuthUser | null;
  className?: string;
};

export function AccountButton({ user, className }: AccountButtonProps) {
  if (!user) {
    return (
      <Button className={className} render={<Link to="/login" />} size="sm" variant="outline">
        Sign in
      </Button>
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
