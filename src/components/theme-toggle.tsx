"use client";

import { MoonIcon, SunIcon } from "lucide-react";
import type { FC } from "react";
import { useTheme } from "src/hooks/useTheme";
import { cn } from "src/lib/utils";

export const ThemeToggle: FC<{ className?: string }> = ({ className }) => {
  const { theme, toggleTheme } = useTheme();

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className={cn(
        "group/theme-toggle flex h-8 w-full items-center gap-2 rounded-lg px-3 text-sm transition-all duration-200",
        "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring",
        className,
      )}
      aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
    >
      <div className="relative flex size-4 shrink-0 items-center justify-center">
        <SunIcon
          className={cn(
            "size-4 transition-all duration-300",
            theme === "dark" ? "rotate-90 scale-0 opacity-0" : "rotate-0 scale-100 opacity-100",
          )}
        />
        <MoonIcon
          className={cn(
            "absolute size-4 transition-all duration-300",
            theme === "dark" ? "rotate-0 scale-100 opacity-100" : "-rotate-90 scale-0 opacity-0",
          )}
        />
      </div>
      <span className="text-sm">{theme === "dark" ? "Light Mode" : "Dark Mode"}</span>
      <div className="ml-auto flex h-5 w-9 shrink-0 items-center rounded-full bg-sidebar-border p-0.5 transition-colors duration-200 group-hover/theme-toggle:bg-sidebar-accent-foreground/20">
        <div
          className={cn(
            "size-4 rounded-full bg-sidebar-foreground shadow-sm transition-transform duration-200",
            theme === "dark" ? "translate-x-4" : "translate-x-0",
          )}
        />
      </div>
    </button>
  );
};
