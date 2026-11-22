
import { useState } from "react";
import { useTranslation } from "react-i18next";
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
import { useConnectionStore } from "@/stores/connection-store";
import { errorMessage, quoteId } from "@/lib/utils";
import * as api from "@/lib/api-client";

interface CreateViewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}

export function CreateViewDialog({
  open,
  onOpenChange,
  onCreated,
}: CreateViewDialogProps) {
  const { t } = useTranslation("dialogs");
  const activeId = useConnectionStore((s) => s.activeId);
  const [viewName, setViewName] = useState("");
  const [selectSql, setSelectSql] = useState("SELECT ");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const resetAndClose = () => {
    setViewName("");
    setSelectSql("SELECT ");
    setError("");
    setLoading(false);
    onOpenChange(false);
  };

  const generateSQL = () => {
    return `CREATE VIEW ${quoteId(viewName)} AS\n${selectSql}`;
  };

  const hasSelectBody = selectSql.trim().replace(/^SELECT\s*/i, "").length > 0;

  const handleCreate = async () => {
    if (!activeId || !viewName.trim() || !hasSelectBody) return;
    setLoading(true);
    setError("");
    try {
      await api.runSql(activeId, generateSQL());
      onCreated();
      resetAndClose();
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
        if (!isOpen) resetAndClose();
        else onOpenChange(true);
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("createView.title")}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>{t("createView.name")}</Label>
            <Input
              placeholder="my_view"
              value={viewName}
              onChange={(e) => setViewName(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>{t("createView.select")}</Label>
            <textarea
              className="w-full min-h-[120px] rounded-md border bg-background px-3 py-2 text-sm font-mono resize-y focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="SELECT col1, col2 FROM table WHERE ..."
              value={selectSql}
              onChange={(e) => setSelectSql(e.target.value)}
            />
          </div>

          {viewName && hasSelectBody && (
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">
                {t("actions.generatedSql")}
              </Label>
              <pre className="text-xs p-2 rounded bg-muted font-mono whitespace-pre-wrap">
                {generateSQL()}
              </pre>
            </div>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={resetAndClose}>
            {t("actions.cancel")}
          </Button>
          <Button
            data-default
            onClick={handleCreate}
            disabled={loading || !viewName.trim() || !hasSelectBody}
          >
            {loading ? t("actions.creating") : t("createView.title")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
