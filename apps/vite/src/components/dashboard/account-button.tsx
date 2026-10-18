import type { User } from "@clubedge/contract";

type AccountButtonProps = {
  user: User | null;
  className?: string;
};

/** This project has no authentication, so there is no account to show. */
export const AccountButton: (props: AccountButtonProps) => null = () => null;
