import type { Metadata } from "next";
import "@clubedge/ui/globals.css";
import { TooltipProvider } from "@clubedge/ui/components/tooltip";

export const metadata: Metadata = {
  title: { default: "Clubedge Starter", template: "%s · Clubedge Starter" },
  description: "A production-minded foundation for Clubedge applications.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <TooltipProvider>{children}</TooltipProvider>
      </body>
    </html>
  );
}
