import type { ReactNode } from "react";

type NoticeTone = "error" | "info" | "warning";

const noticeStyles: Record<NoticeTone, string> = {
  error: "border-destructive/30 bg-destructive/5 text-destructive",
  info: "border-primary/30 bg-primary/5 text-foreground",
  warning: "border-amber-500/30 bg-amber-500/5 text-foreground",
};

export function Notice({
  children,
  icon,
  role,
  tone,
}: {
  children: ReactNode;
  icon: ReactNode;
  role: "alert" | "status";
  tone: NoticeTone;
}) {
  return (
    <div
      className={`flex items-start gap-2.5 rounded-lg border px-3.5 py-3 text-sm leading-5 ${noticeStyles[tone]}`}
      role={role}
    >
      <span aria-hidden="true" className="mt-0.5 shrink-0 [&>svg]:size-4">
        {icon}
      </span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
