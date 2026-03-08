"use client";

import { useEffect, useState, useCallback } from "react";
import { Moon, Sun, Monitor, Palette, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

const ACCENT_THEMES = [
  { id: "zinc", label: "Zinc", color: "#71717a" },
  { id: "blue", label: "Blue", color: "#3b82f6" },
  { id: "green", label: "Green", color: "#10b981" },
  { id: "violet", label: "Violet", color: "#8b5cf6" },
  { id: "orange", label: "Orange", color: "#f97316" },
  { id: "rose", label: "Rose", color: "#f43f5e" },
] as const;

const IDE_THEMES = [
  { id: "dracula", label: "Dracula", color: "#bd93f9", bg: "#282a36" },
  { id: "nord", label: "Nord", color: "#88c0d0", bg: "#2e3440" },
  { id: "catppuccin", label: "Catppuccin", color: "#cba6f7", bg: "#1e1e2e" },
  { id: "github-dark", label: "GitHub Dark", color: "#58a6ff", bg: "#0d1117" },
] as const;

type AccentThemeId = (typeof ACCENT_THEMES)[number]["id"];
type IdeThemeId = (typeof IDE_THEMES)[number]["id"];
type ThemeId = AccentThemeId | IdeThemeId;
type Mode = "light" | "dark" | "system";

const IDE_THEME_IDS = new Set<string>(IDE_THEMES.map((t) => t.id));

function isIdeTheme(id: string): id is IdeThemeId {
  return IDE_THEME_IDS.has(id);
}

function getSystemDark() {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function ThemeSelector() {
  const [theme, setThemeState] = useState<ThemeId>(() => {
    if (typeof window === "undefined") return "green";
    return (localStorage.getItem("stoolap-theme-id") ?? "green") as ThemeId;
  });
  const [mode, setModeState] = useState<Mode>(() => {
    if (typeof window === "undefined") return "system";
    return (localStorage.getItem("stoolap-theme-mode") ?? "system") as Mode;
  });

  // Apply theme + mode to DOM
  const apply = useCallback((t: ThemeId, m: Mode) => {
    const root = document.documentElement;

    // Set data-theme
    if (t === "zinc") {
      root.removeAttribute("data-theme");
    } else {
      root.setAttribute("data-theme", t);
    }

    // Determine dark mode
    let dark: boolean;
    if (isIdeTheme(t)) {
      dark = true; // IDE themes are always dark
    } else if (m === "system") {
      dark = getSystemDark();
    } else {
      dark = m === "dark";
    }

    root.classList.toggle("dark", dark);
  }, []);

  // Apply theme on mount and listen for system preference changes
  useEffect(() => {
    apply(theme, mode);

    // Listen for system preference changes
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => {
      const currentTheme = (localStorage.getItem("stoolap-theme-id") ??
        "green") as ThemeId;
      const currentMode = (localStorage.getItem("stoolap-theme-mode") ??
        "system") as Mode;
      if (currentMode === "system" && !isIdeTheme(currentTheme)) {
        apply(currentTheme, currentMode);
      }
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only run on mount
  }, [apply]);

  const setTheme = (t: ThemeId) => {
    setThemeState(t);
    localStorage.setItem("stoolap-theme-id", t);
    apply(t, mode);
  };

  const setMode = (m: Mode) => {
    setModeState(m);
    localStorage.setItem("stoolap-theme-mode", m);
    apply(theme, m);
  };

  const isIde = isIdeTheme(theme);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" title="Theme" aria-label="Theme">
          <Palette className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 p-3">
        {/* Light / Dark / System toggle */}
        <div className="flex items-center gap-1 mb-3">
          {[
            { m: "light" as Mode, icon: Sun, label: "Light" },
            { m: "dark" as Mode, icon: Moon, label: "Dark" },
            { m: "system" as Mode, icon: Monitor, label: "System" },
          ].map(({ m, icon: Icon, label }) => (
            <button
              key={m}
              className={cn(
                "flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-xs font-medium transition-colors",
                mode === m && !isIde
                  ? "bg-primary text-primary-foreground"
                  : "hover:bg-muted text-muted-foreground",
                isIde && "opacity-40 cursor-not-allowed",
              )}
              onClick={() => !isIde && setMode(m)}
              disabled={isIde}
              title={isIde ? "IDE themes use dark mode" : label}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          ))}
        </div>

        {/* Color accent themes */}
        <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-1.5">
          Accent Colors
        </div>
        <div className="grid grid-cols-3 gap-1.5 mb-3">
          {ACCENT_THEMES.map((t) => (
            <button
              key={t.id}
              className={cn(
                "flex items-center gap-1.5 px-2 py-1.5 rounded-md text-xs transition-colors",
                theme === t.id
                  ? "bg-primary/10 ring-1 ring-primary"
                  : "hover:bg-muted",
              )}
              onClick={() => setTheme(t.id)}
            >
              <span
                className="h-3.5 w-3.5 rounded-full shrink-0 ring-1 ring-black/10"
                style={{ backgroundColor: t.color }}
              />
              <span className="truncate">{t.label}</span>
              {theme === t.id && (
                <Check className="h-3 w-3 ml-auto shrink-0 text-primary" />
              )}
            </button>
          ))}
        </div>

        {/* IDE themes */}
        <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-1.5">
          IDE Themes
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          {IDE_THEMES.map((t) => (
            <button
              key={t.id}
              className={cn(
                "flex items-center gap-1.5 px-2 py-1.5 rounded-md text-xs transition-colors",
                theme === t.id
                  ? "bg-primary/10 ring-1 ring-primary"
                  : "hover:bg-muted",
              )}
              onClick={() => setTheme(t.id)}
            >
              <span
                className="h-3.5 w-3.5 rounded-full shrink-0 ring-1 ring-white/20"
                style={{
                  background: `linear-gradient(135deg, ${t.bg} 50%, ${t.color} 50%)`,
                }}
              />
              <span className="truncate">{t.label}</span>
              {theme === t.id && (
                <Check className="h-3 w-3 ml-auto shrink-0 text-primary" />
              )}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
