"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { isMac } from "@/lib/utils";

interface ShortcutsHelpDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function Kbd({ children }: { children: string }) {
  return (
    <kbd className="inline-flex items-center justify-center min-w-[24px] h-6 px-1.5 rounded border bg-muted text-xs font-mono font-medium text-foreground/80">
      {children}
    </kbd>
  );
}

export function ShortcutsHelpDialog({
  open,
  onOpenChange,
}: ShortcutsHelpDialogProps) {
  const [mod, setMod] = useState("Ctrl");

  useEffect(() => {
    // Hydration-safe: navigator not available during SSR
    setMod(isMac() ? "\u2318" : "Ctrl"); // eslint-disable-line react-hooks/set-state-in-effect
  }, []);

  const shortcuts = [
    { keys: [mod, "Enter"], desc: "Execute query" },
    { keys: [mod, "E"], desc: "Explain query" },
    { keys: [mod, "Shift", "F"], desc: "Format SQL" },
    { keys: [mod, "T"], desc: "New tab" },
    { keys: [mod, "W"], desc: "Close tab" },
    { keys: ["Ctrl", "Tab"], desc: "Next tab" },
    { keys: ["Ctrl", "Shift", "Tab"], desc: "Previous tab" },
    { keys: [mod, "B"], desc: "Toggle sidebar" },
    { keys: [mod, "F"], desc: "Search in results" },
    { keys: [mod, "C"], desc: "Copy results" },
    { keys: [mod, "?"], desc: "Show this help" },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Keyboard Shortcuts</DialogTitle>
        </DialogHeader>
        <div className="space-y-2 py-2">
          {shortcuts.map((s) => (
            <div
              key={s.desc}
              className="flex items-center justify-between py-1.5"
            >
              <span className="text-sm text-foreground/80">{s.desc}</span>
              <div className="flex items-center gap-1">
                {s.keys.map((k, i) => (
                  <span key={i} className="flex items-center gap-1">
                    {i > 0 && (
                      <span className="text-xs text-muted-foreground">+</span>
                    )}
                    <Kbd>{k}</Kbd>
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          Right-click cells to copy values. Double-click a table in the sidebar
          to open the data browser.
        </p>
      </DialogContent>
    </Dialog>
  );
}
