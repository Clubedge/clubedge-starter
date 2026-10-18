import { Moon, Sun } from "lucide-react";

import { Switch } from "@clubedge/ui/components/switch";
import { useTheme } from "./theme-provider";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  return (
    <div className="flex items-center gap-2">
      <Sun aria-hidden="true" className="size-4 text-muted-foreground" />
      <Switch
        aria-label="Toggle dark theme"
        checked={theme === "dark"}
        onCheckedChange={(checked) => setTheme(checked ? "dark" : "light")}
      />
      <Moon aria-hidden="true" className="size-4 text-muted-foreground" />
      <span className="sr-only">Theme: {theme}</span>
    </div>
  );
}
