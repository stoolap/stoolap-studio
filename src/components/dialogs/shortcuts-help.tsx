
import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation("dialogs");
  const [mod, setMod] = useState("Ctrl");

  useEffect(() => {
    // Hydration-safe: navigator not available during SSR
    setMod(isMac() ? "\u2318" : "Ctrl"); // eslint-disable-line react-hooks/set-state-in-effect
  }, []);

  const shortcuts = [
    { keys: [mod, "Enter"], desc: t("shortcuts.execute") },
    { keys: [mod, "E"], desc: t("shortcuts.explain") },
    { keys: [mod, "Shift", "F"], desc: t("shortcuts.format") },
    { keys: [mod, "T"], desc: t("shortcuts.newTab") },
    { keys: [mod, "W"], desc: t("shortcuts.closeTab") },
    { keys: ["Ctrl", "Tab"], desc: t("shortcuts.nextTab") },
    { keys: ["Ctrl", "Shift", "Tab"], desc: t("shortcuts.previousTab") },
    { keys: [mod, "B"], desc: t("shortcuts.toggleSidebar") },
    { keys: [mod, "F"], desc: t("shortcuts.search") },
    { keys: [mod, "C"], desc: t("shortcuts.copy") },
    { keys: [mod, "?"], desc: t("shortcuts.help") },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" showCloseButton>
        <DialogHeader>
          <DialogTitle>{t("shortcuts.title")}</DialogTitle>
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
          {t("shortcuts.hint")}
        </p>
      </DialogContent>
    </Dialog>
  );
}
