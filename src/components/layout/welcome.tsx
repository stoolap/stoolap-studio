import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Database, FolderOpen, Sparkles, Zap } from "lucide-react";
import { StoolapLogo } from "@/components/common/stoolap-logo";
import { useConnection } from "@/hooks/use-connection";
import { useHistoryStore } from "@/stores/history-store";
import { errorMessage } from "@/lib/utils";

/** Ask the headless Toolbar to run one of its actions (it owns the dialogs). */
function requestAction(name: "open-database" | "new-memory-db" | "load-example") {
  window.dispatchEvent(new Event(`stoolap:${name}`));
}

/** Shown in place of the editor while no database is open. */
export function Welcome() {
  const { t } = useTranslation("layout");
  const { connect } = useConnection();
  const recentConnections = useHistoryStore((s) => s.recentConnections);
  const recent = recentConnections.filter((e) => e.type === "file");
  const [opening, setOpening] = useState<string | null>(null);

  const openRecent = async (path: string, name: string) => {
    setOpening(path);
    try {
      await connect(path, name);
    } catch (e) {
      toast.error(t("welcome.openFailed", { name }), { description: errorMessage(e) });
    } finally {
      setOpening(null);
    }
  };

  const actions = [
    {
      label: t("welcome.openDatabase"),
      hint: "",
      icon: FolderOpen,
      run: () => requestAction("open-database"),
    },
    {
      label: t("welcome.newMemory"),
      hint: "",
      icon: Zap,
      run: () => requestAction("new-memory-db"),
    },
    {
      label: t("welcome.loadExample"),
      hint: "",
      icon: Sparkles,
      run: () => requestAction("load-example"),
    },
  ];

  return (
    <div className="flex-1 overflow-auto bg-background">
      <div className="mx-auto flex max-w-md flex-col gap-8 px-6 py-16">
        <div className="flex flex-col items-center gap-2 text-center">
          <img src="/icon.png" alt="" width={208} height={208} className="rounded-[3rem]" draggable={false} />
          <StoolapLogo height={36} className="text-foreground" />
        </div>

        <div className="flex flex-col gap-1">
          {actions.map((a) => (
            <button
              key={a.label}
              type="button"
              onClick={a.run}
              className="flex items-center gap-3 rounded-md px-3 py-2 text-left text-sm hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
            >
              <a.icon className="h-4 w-4 text-primary shrink-0" />
              <span className="flex-1">{a.label}</span>
              {a.hint && (
                <kbd className="font-data text-xs text-muted-foreground">{a.hint}</kbd>
              )}
            </button>
          ))}
        </div>

        {recent.length > 0 && (
          <div className="flex flex-col gap-1">
            <h2 className="px-3 text-xs font-semibold text-muted-foreground">
              {t("welcome.recent")}
            </h2>
            {recent.map((entry) => (
              <button
                key={entry.path}
                type="button"
                disabled={opening !== null}
                onClick={() => openRecent(entry.path, entry.name)}
                className="flex items-center gap-3 rounded-md px-3 py-2 text-left hover:bg-accent focus-visible:bg-accent focus-visible:outline-none disabled:opacity-60"
              >
                <Database className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm">{entry.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {entry.path}
                  </span>
                </span>
                {opening === entry.path && (
                  <span className="text-xs text-muted-foreground">{t("welcome.opening")}</span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
