import { Link, useNavigate } from "@tanstack/react-router";
import type { User } from "@clubedge/contract";
import { Button, buttonVariants } from "@clubedge/ui/components/button";
import { supabase } from "@/lib/auth";

type AccountButtonProps = { user: User | null; className?: string };

export function AccountButton({ user, className }: AccountButtonProps) {
  const navigate = useNavigate();
  if (!user) return <Link className={buttonVariants({ size: "sm", variant: "outline", className })} to={"/login" as never}>Sign in</Link>;
  return <Button className={className} onClick={async () => { await supabase?.auth.signOut(); await navigate({ to: "/login" as never }); }} size="sm" variant="outline">Sign out</Button>;
}
