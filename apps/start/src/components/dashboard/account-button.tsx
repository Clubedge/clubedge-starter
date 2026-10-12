import { LogIn, LogOut, Settings2 } from "lucide-react";
import { Link } from "@tanstack/react-router";

import type { AuthUser } from "@/server/auth";
import { cn } from "@clubedge/ui/lib/utils";

type AccountButtonProps = {
  user: AuthUser | null;
  className?: string;
};

// The account card at the bottom of the dashboard sidebar, styled like its section switcher.
const card = "flex items-center rounded-xl border bg-secondary/50 text-sm";
const iconButton =
  "inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring [&_svg]:size-4";

export function AccountButton({ user, className }: AccountButtonProps) {
  if (!user) {
    return (
      <Link
        to="/login"
        className={cn(
          card,
          "h-10 justify-center gap-2 font-medium outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring [&_svg]:size-4",
          className,
        )}
      >
        <LogIn aria-hidden="true" />
        Sign in
      </Link>
    );
  }

  const email = user.email ?? "Signed in";

  return (
    <div className={cn(card, "h-12 gap-2.5 ps-2 pe-1.5", className)}>
      <span
        aria-hidden="true"
        className="grid size-7 shrink-0 place-items-center rounded-full bg-primary/15 text-xs font-semibold uppercase text-primary"
      >
        {email.charAt(0)}
      </span>
      <span className="min-w-0 flex-1 truncate font-medium" title={email}>
        {email}
      </span>
      <Link to="/settings" aria-label="Settings" title="Settings" className={iconButton}>
        <Settings2 aria-hidden="true" />
      </Link>
      <form action="/auth/sign-out" method="post">
        <button type="submit" aria-label="Sign out" title="Sign out" className={iconButton}>
          <LogOut aria-hidden="true" />
        </button>
      </form>
    </div>
  );
}
