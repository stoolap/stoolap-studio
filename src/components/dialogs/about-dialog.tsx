import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import * as native from "@/lib/native";

/**
 * `SELECT VERSION()` returns "stoolap 0.5.1 (commit: <sha>, built: <time>)".
 * A build from a registry reports "commit: unknown", so the commit is shown
 * only when it is a real hash.
 */
function engineLabel(raw: string): string {
  const match = raw.match(/^stoolap\s+(\S+)\s+\(commit:\s*([^,]+),/i);
  if (!match) return raw;
  const [, version, commit] = match;
  return /^[0-9a-f]{7,}$/i.test(commit) ? `Stoolap ${version} · ${commit.slice(0, 7)}` : `Stoolap ${version}`;
}

/** The icon, the name and the versions, which can be selected and copied for a bug report */
export function AboutDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { t } = useTranslation("dialogs");
  const [version, setVersion] = useState("");
  const [engine, setEngine] = useState("");

  useEffect(() => {
    if (!open) return;
    native.getVersion().then(setVersion).catch(() => {});
    native.getStoolapVersion().then(setEngine).catch(() => {});
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton className="sm:max-w-xs">
        <div className="flex flex-col items-center text-center">
          <img src="/icon.png" alt="" width={64} height={64} className="rounded-[14px] shadow-sm" draggable={false} />
          <DialogTitle className="mt-3 text-base">Stoolap Studio</DialogTitle>
          <p className="mt-0.5 text-xs text-muted-foreground">{t("native:aboutTagline")}</p>
          <div className="allow-select mt-4 select-text text-xs leading-relaxed text-muted-foreground">
            <p>
              {t("about.version")} {version}
            </p>
            {engine && <p>{t("native:poweredBy", { engine: engineLabel(engine) })}</p>}
          </div>
          <p className="mt-4 text-[11px] text-muted-foreground">
            © 2025–{new Date().getFullYear()} Stoolap · Apache License 2.0
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
