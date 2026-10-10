import type { AuthUser } from "@/server/auth";

type AccountButtonProps = {
  user: AuthUser | null;
  className?: string;
};

/** This project has no authentication, so there is no account to show. */
export const AccountButton: (props: AccountButtonProps) => null = () => null;
