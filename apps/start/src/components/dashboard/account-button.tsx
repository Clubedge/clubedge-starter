import { Link } from "@tanstack/react-router";

import type { AuthUser } from "@/server/auth";
import { Button, buttonVariants } from "@clubedge/ui/components/button";
import { cn } from "@clubedge/ui/lib/utils";

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
    <div className={cn("flex items-center gap-2", className)}>
      <Link to="/settings" className={buttonVariants({ size: "sm", variant: "ghost" })}>
        Settings
      </Link>
      <form action="/auth/sign-out" className="flex-1" method="post">
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
    </div>
  );
}
