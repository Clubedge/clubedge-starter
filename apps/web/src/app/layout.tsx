import type { Metadata } from "next";
import Script from "next/script";
import "@clubedge/ui/globals.css";
import { TooltipProvider } from "@clubedge/ui/components/tooltip";
import { ThemeProvider } from "./theme-provider";

const themeBootstrap = `try {
  const saved = localStorage.getItem("clubedge-theme");
  const theme = saved === "light" || saved === "dark"
    ? saved
    : window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  document.documentElement.classList.toggle("dark", theme === "dark");
  document.documentElement.style.colorScheme = theme;
} catch {}
`;

export const metadata: Metadata = {
  title: { default: "Clubedge Starter", template: "%s · Clubedge Starter" },
  description: "A production-minded foundation for Clubedge applications.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <Script id="theme-bootstrap" strategy="beforeInteractive">
          {themeBootstrap}
        </Script>
        <ThemeProvider>
          <TooltipProvider>{children}</TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
