
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { errorMessage } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useConnection } from "@/hooks/use-connection";
import { useHistoryStore } from "@/stores/history-store";
import { Database, FolderOpen, Zap, Clock, X, Trash2 } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface ConnectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ConnectDialog({ open, onOpenChange }: ConnectDialogProps) {
  const { t } = useTranslation("dialogs");
  const [mode, setMode] = useState<"memory" | "file">("file");
  const [name, setName] = useState("");
  const [path, setPath] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const { connect } = useConnection();
  const { recentConnections, removeRecent, clearHistory } = useHistoryStore();

  const fileHistory = recentConnections.filter((e) => e.type === "file");

  const handleConnect = async () => {
    setLoading(true);
    setError("");
    try {
      const dbPath = mode === "memory" ? ":memory:" : path;
      await connect(dbPath, name || undefined);
      onOpenChange(false);
      setName("");
      setPath("");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  const handleConnectRecent = async (entry: { path: string; name: string }) => {
    setLoading(true);
    setError("");
    try {
      await connect(entry.path, entry.name);
      onOpenChange(false);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) {
          setName("");
          setPath("");
          setError("");
          setLoading(false);
        }
        onOpenChange(isOpen);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            {t("connect.title")}
          </DialogTitle>
        </DialogHeader>

        <form
          className="space-y-4 pt-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!loading && (mode === "memory" || path)) handleConnect();
          }}
        >
          <div className="flex gap-2">
            <Button
              variant={mode === "memory" ? "default" : "outline"}
              size="sm"
              onClick={() => setMode("memory")}
              className="flex-1"
            >
              <Zap className="h-4 w-4 mr-1" />
              {t("connect.memory")}
            </Button>
            <Button
              variant={mode === "file" ? "default" : "outline"}
              size="sm"
              onClick={() => setMode("file")}
              className="flex-1"
            >
              <FolderOpen className="h-4 w-4 mr-1" />
              {t("connect.file")}
            </Button>
          </div>

          <div className="space-y-2">
            <Label htmlFor="conn-name">{t("connect.name")}</Label>
            <Input
              id="conn-name"
              placeholder={mode === "memory" ? t("connect.memoryPlaceholder") : t("connect.filePlaceholder")}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          {mode === "file" && (
            <div className="space-y-2">
              <Label htmlFor="conn-path">{t("connect.path")}</Label>
              <div className="flex gap-2">
                <Input
                  id="conn-path"
                  placeholder={t("connect.pathPlaceholder")}
                  value={path}
                  onChange={(e) => setPath(e.target.value)}
                  className="flex-1"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                {t("connect.pathHint")}
              </p>
            </div>
          )}

          {/* Recent connections */}
          {mode === "file" && fileHistory.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="flex items-center gap-1.5 text-muted-foreground">
                  <Clock className="h-3.5 w-3.5" />
                  {t("connect.recent")}
                </Label>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={clearHistory}
                      aria-label={t("connect.clearHistory")}
                    >
                      <Trash2 className="h-3 w-3 text-muted-foreground" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{t("connect.clearHistory")}</TooltipContent>
                </Tooltip>
              </div>
              <div className="space-y-1 max-h-[140px] overflow-y-auto">
                {fileHistory.map((entry) => (
                  <div
                    key={entry.path}
                    className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-accent cursor-pointer group text-sm"
                    onClick={() => handleConnectRecent(entry)}
                  >
                    <Database className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{entry.name}</div>
                      <div className="text-xs text-muted-foreground truncate">
                        {entry.path}
                      </div>
                    </div>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 opacity-0 group-hover:opacity-100 shrink-0"
                          onClick={(e) => {
                            e.stopPropagation();
                            removeRecent(entry.path);
                          }}
                          aria-label={t("connect.removeRecent")}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>{t("connect.removeRecent")}</TooltipContent>
                    </Tooltip>
                  </div>
                ))}
              </div>
            </div>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              {t("actions.cancel")}
            </Button>
            <Button
              type="submit"
              disabled={loading || (mode === "file" && !path)}
            >
              {loading ? t("connect.connecting") : t("connect.connect")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
