"use client";

import { useState } from "react";
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
      setError(e instanceof Error ? e.message : "Connection failed");
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
      setError(e instanceof Error ? e.message : "Connection failed");
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
            Open Database
          </DialogTitle>
        </DialogHeader>

        <form
          className="space-y-4 py-2"
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
              In-Memory
            </Button>
            <Button
              variant={mode === "file" ? "default" : "outline"}
              size="sm"
              onClick={() => setMode("file")}
              className="flex-1"
            >
              <FolderOpen className="h-4 w-4 mr-1" />
              File-Based
            </Button>
          </div>

          <div className="space-y-2">
            <Label htmlFor="conn-name">Connection Name (optional)</Label>
            <Input
              id="conn-name"
              placeholder={mode === "memory" ? "My Scratch DB" : "My Database"}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          {mode === "file" && (
            <div className="space-y-2">
              <Label htmlFor="conn-path">Database Path</Label>
              <Input
                id="conn-path"
                placeholder="./mydata or /absolute/path/to/db"
                value={path}
                onChange={(e) => setPath(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Relative or absolute path. The directory will be created if it
                does not exist.
              </p>
            </div>
          )}

          {/* Recent connections */}
          {mode === "file" && fileHistory.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="flex items-center gap-1.5 text-muted-foreground">
                  <Clock className="h-3.5 w-3.5" />
                  Recent
                </Label>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={clearHistory}
                      aria-label="Clear history"
                    >
                      <Trash2 className="h-3 w-3 text-muted-foreground" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Clear history</TooltipContent>
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
                          aria-label="Remove from history"
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Remove from history</TooltipContent>
                    </Tooltip>
                  </div>
                ))}
              </div>
            </div>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={loading || (mode === "file" && !path)}
            >
              {loading ? "Connecting..." : "Connect"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
