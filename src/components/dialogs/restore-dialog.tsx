"use client";

import { useState, useRef, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useConnectionStore } from "@/stores/connection-store";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Upload, FileUp } from "lucide-react";
import { toast } from "sonner";
import * as api from "@/lib/api-client";
import { splitStatements } from "@/lib/sql-utils";

interface RestoreDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function RestoreDialog({ open, onOpenChange }: RestoreDialogProps) {
  const activeId = useConnectionStore((s) => s.activeId);
  const connections = useConnectionStore((s) => s.connections);
  const activeConn = connections.find((c) => c.id === activeId);
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [fileName, setFileName] = useState("");
  const [fileContent, setFileContent] = useState("");
  const [statementCount, setStatementCount] = useState(0);
  const [useTransaction, setUseTransaction] = useState(true);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [error, setError] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const abortRef = useRef(false);

  const resetAndClose = () => {
    setFileName("");
    setFileContent("");
    setStatementCount(0);
    setUseTransaction(true);
    setLoading(false);
    setProgress({ current: 0, total: 0 });
    setError("");
    abortRef.current = false;
    onOpenChange(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleFileSelect = () => {
    fileInputRef.current?.click();
  };

  const loadFile = useCallback((file: File) => {
    setError("");
    const reader = new FileReader();
    reader.onload = () => {
      const content = reader.result as string;
      setFileName(file.name);
      setFileContent(content);
      setStatementCount(splitStatements(content).length);
    };
    reader.onerror = () => {
      setError("Failed to read file");
    };
    reader.readAsText(file);
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    loadFile(file);
  };

  const handleRestore = async () => {
    if (!activeId || !fileContent) return;
    setLoading(true);
    setError("");
    abortRef.current = false;

    const statements = splitStatements(fileContent);
    setProgress({ current: 0, total: statements.length });

    // DDL (CREATE/DROP/ALTER) auto-commits in stoolap and breaks any active
    // transaction, so we must NOT wrap DDL+DML in a single BEGIN/COMMIT.
    // Instead, batch consecutive DML statements into their own transactions.
    let inDmlBatch = false;

    try {
      const BATCH_SIZE = 50;
      let dmlBatch: string[] = [];

      const flushBatch = async () => {
        if (dmlBatch.length === 0) return;
        await api.executeQuery(activeId, dmlBatch.join(";\n"));
        dmlBatch = [];
      };

      for (let i = 0; i < statements.length; i++) {
        if (abortRef.current) {
          if (inDmlBatch) {
            try {
              await api.executeQuery(activeId, "ROLLBACK");
            } catch {
              /* ignore */
            }
            inDmlBatch = false;
          }
          throw new Error("Restore cancelled by user");
        }
        setProgress({ current: i + 1, total: statements.length });

        const trimmed = statements[i].trimStart().toUpperCase();
        const isDml =
          trimmed.startsWith("INSERT") ||
          trimmed.startsWith("UPDATE") ||
          trimmed.startsWith("DELETE");

        if (isDml && !inDmlBatch && useTransaction) {
          await api.executeQuery(activeId, "BEGIN");
          inDmlBatch = true;
        } else if (!isDml && inDmlBatch) {
          await flushBatch();
          await api.executeQuery(activeId, "COMMIT");
          inDmlBatch = false;
        }

        if (isDml) {
          dmlBatch.push(statements[i]);
          if (dmlBatch.length >= BATCH_SIZE) {
            await flushBatch();
          }
        } else {
          await api.executeQuery(activeId, statements[i]);
        }
      }

      // Flush remaining batch
      await flushBatch();

      // Commit any remaining DML batch
      if (inDmlBatch) {
        await api.executeQuery(activeId, "COMMIT");
      }

      queryClient.invalidateQueries({ queryKey: ["tables", activeId] });
      queryClient.invalidateQueries({ queryKey: ["views", activeId] });
      queryClient.invalidateQueries({ queryKey: ["columns", activeId] });
      queryClient.invalidateQueries({ queryKey: ["indexes", activeId] });
      queryClient.invalidateQueries({ queryKey: ["fks", activeId] });
      queryClient.invalidateQueries({ queryKey: ["rowcount", activeId] });
      queryClient.invalidateQueries({ queryKey: ["ddl", activeId] });

      toast.success(
        `Restore complete: ${statements.length} statements executed`,
      );
      resetAndClose();
    } catch (e) {
      if (inDmlBatch) {
        try {
          await api.executeQuery(activeId, "ROLLBACK");
        } catch {
          /* ignore */
        }
      }
      setError(e instanceof Error ? e.message : "Restore failed");
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    if (loading) {
      abortRef.current = true;
    } else {
      resetAndClose();
    }
  };

  const pct =
    progress.total > 0
      ? Math.round((progress.current / progress.total) * 100)
      : 0;

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen && !loading) resetAndClose();
        else if (isOpen) onOpenChange(true);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Restore Database
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {activeConn && (
            <p className="text-sm text-muted-foreground">
              Import a SQL dump into{" "}
              <span className="font-medium text-foreground">
                {activeConn.name}
              </span>
              .
            </p>
          )}

          <div className="space-y-2">
            <Label>SQL File</Label>
            <div
              className={`flex items-center justify-center border-2 border-dashed rounded-lg p-6 cursor-pointer transition-colors ${dragOver ? "border-primary bg-primary/10" : "hover:border-primary/50 hover:bg-muted/30"}`}
              onClick={!loading ? handleFileSelect : undefined}
              onDragOver={(e) => {
                e.preventDefault();
                if (!loading) setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                if (loading) return;
                const file = e.dataTransfer.files?.[0];
                if (file) loadFile(file);
              }}
            >
              {fileName ? (
                <div className="text-center">
                  <FileUp className="h-8 w-8 mx-auto mb-2 text-primary" />
                  <p className="text-sm font-medium">{fileName}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {statementCount} statement
                    {statementCount !== 1 ? "s" : ""} detected
                  </p>
                </div>
              ) : (
                <div className="text-center">
                  <FileUp className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">
                    Click or drag and drop a .sql file
                  </p>
                </div>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".sql,text/plain"
              className="hidden"
              onChange={handleFileChange}
            />
          </div>

          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <Checkbox
              checked={useTransaction}
              onCheckedChange={(v) => setUseTransaction(!!v)}
              disabled={loading}
            />
            Wrap in transaction (rollback on error)
          </label>

          {loading && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Executing statements...
                </span>
                <span className="text-muted-foreground tabular-nums">
                  {progress.current}/{progress.total} ({pct}%)
                </span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary transition-all duration-150"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleCancel}>
            {loading ? "Cancel" : "Close"}
          </Button>
          <Button
            onClick={handleRestore}
            disabled={loading || !fileContent || !activeId}
          >
            {loading ? "Restoring..." : "Restore"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
