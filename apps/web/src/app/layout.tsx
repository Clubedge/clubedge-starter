import type { Metadata } from "next";
import "@clubedge/ui/globals.css";

export const metadata: Metadata = {
  title: { default: "Clubedge Starter", template: "%s · Clubedge Starter" },
  description: "A production-minded foundation for Clubedge applications.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
