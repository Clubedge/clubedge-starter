import { Settings2 } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import type { User } from "@clubedge/contract";
import { Button, buttonVariants } from "@clubedge/ui/components/button";
import { api } from "@/lib/api"; // clubedge:only push=native && shell!=none
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
      <div className="flex items-center gap-1">
        <Link
          aria-label="Settings"
          className={buttonVariants({ size: "icon-sm", variant: "ghost" })}
          title="Settings"
          to={"/settings" as never}
        >
          <Settings2 aria-hidden="true" />
        </Link>
        <Button
          className={className}
          onClick={async () => {
            setError(null);
            if (!authClient.configured) {
              setError("Sign out is unavailable because authentication is not configured.");
              return;
            }
            try {
              // clubedge:if push=native && shell!=none
              // A signed-out device gets no more of the account's notifications.
              if (import.meta.env.MODE === "app") {
                await import("@clubedge/mobile/push").then(({ disablePush }) => disablePush(api));
              }
              // clubedge:end
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
      </div>
      {error && (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
