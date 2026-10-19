import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import type { User } from "@clubedge/contract";
import { Button, buttonVariants } from "@clubedge/ui/components/button";
import { authClient } from "@/lib/auth";

type AccountButtonProps = { user: User | null; className?: string };

export function AccountButton({ user, className }: AccountButtonProps) {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  if (!user)
    return (
      <Link
        className={buttonVariants({ size: "sm", variant: "outline", className })}
        to={"/login" as never}
      >
        Sign in
      </Link>
    );
  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        className={className}
        onClick={async () => {
          setError(null);
          if (!authClient.configured) {
            setError("Sign out is unavailable because authentication is not configured.");
            return;
          }
          try {
            await authClient.signOut();
          } catch {
            setError("Sign out failed. Please try again.");
            return;
          }
          await navigate({ to: "/login" as never });
        }}
        size="sm"
        variant="outline"
      >
        Sign out
      </Button>
      {error && (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
