"use client";

import { useState, useMemo } from "react";
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
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { CircleHelp } from "lucide-react";
import { useConnectionStore } from "@/stores/connection-store";
import { quoteId } from "@/lib/utils";
import * as api from "@/lib/api-client";
import type { ColumnInfo } from "@/lib/types";

interface CreateIndexDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  table: string;
  columns: ColumnInfo[];
  onCreated: () => void;
}

export function CreateIndexDialog({
  open,
  onOpenChange,
  table,
  columns,
  onCreated,
}: CreateIndexDialogProps) {
  const activeId = useConnectionStore((s) => s.activeId);
  const [indexName, setIndexName] = useState("");
  const [selectedColumns, setSelectedColumns] = useState<string[]>([]);
  const [isUnique, setIsUnique] = useState(false);
  const [indexType, setIndexType] = useState<"standard" | "hnsw">("standard");
  const [metric, setMetric] = useState("l2");
  const [hnswM, setHnswM] = useState("");
  const [hnswEfConstruction, setHnswEfConstruction] = useState("");
  const [hnswEfSearch, setHnswEfSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Check if selected column is a vector column
  const canUseHnsw = useMemo(() => {
    if (selectedColumns.length !== 1) return false;
    const col = columns.find((c) => c.field === selectedColumns[0]);
    return col?.type.toUpperCase().startsWith("VECTOR") ?? false;
  }, [selectedColumns, columns]);

  const resetAndClose = () => {
    setIndexName("");
    setSelectedColumns([]);
    setIsUnique(false);
    setIndexType("standard");
    setMetric("l2");
    setHnswM("");
    setHnswEfConstruction("");
    setHnswEfSearch("");
    setError("");
    setLoading(false);
    onOpenChange(false);
  };

  const toggleColumn = (col: string) => {
    setSelectedColumns((prev) =>
      prev.includes(col) ? prev.filter((c) => c !== col) : [...prev, col],
    );
  };

  const generateSQL = () => {
    const cols = selectedColumns.map(quoteId).join(", ");

    if (indexType === "hnsw") {
      let sql = `CREATE INDEX ${quoteId(indexName)} ON ${quoteId(table)} (${cols}) USING HNSW`;
      const params: string[] = [];
      if (metric) params.push(`metric = '${metric}'`);
      if (hnswM) params.push(`m = ${hnswM}`);
      if (hnswEfConstruction)
        params.push(`ef_construction = ${hnswEfConstruction}`);
      if (hnswEfSearch) params.push(`ef_search = ${hnswEfSearch}`);
      if (params.length > 0) {
        sql += ` WITH (${params.join(", ")})`;
      }
      return sql;
    }

    const unique = isUnique ? "UNIQUE " : "";
    return `CREATE ${unique}INDEX ${quoteId(indexName)} ON ${quoteId(table)} (${cols})`;
  };

  const handleCreate = async () => {
    if (!activeId || !indexName.trim() || selectedColumns.length === 0) return;
    setLoading(true);
    setError("");
    try {
      await api.executeQuery(activeId, generateSQL());
      onCreated();
      resetAndClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Create index failed");
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
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create Index on {table}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Index Name</Label>
            <Input
              placeholder={`idx_${table}_`}
              value={indexName}
              onChange={(e) => setIndexName(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>Columns</Label>
            <div className="space-y-1 max-h-[200px] overflow-y-auto border rounded-md p-2">
              {columns.map((col) => (
                <label
                  key={col.field}
                  className="flex items-center gap-2 py-1 px-1 rounded hover:bg-muted/50 cursor-pointer text-sm"
                >
                  <Checkbox
                    checked={selectedColumns.includes(col.field)}
                    onCheckedChange={() => toggleColumn(col.field)}
                  />
                  <span>{col.field}</span>
                  <span className="ml-auto text-xs text-muted-foreground">
                    {col.type}
                  </span>
                </label>
              ))}
            </div>
          </div>

          {/* Index type */}
          <div className="space-y-2">
            <Label>Index Type</Label>
            <Select
              value={indexType}
              onValueChange={(v) => {
                setIndexType(v as "standard" | "hnsw");
                if (v === "hnsw") setIsUnique(false);
              }}
            >
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="standard">Standard (BTree/Hash)</SelectItem>
                <SelectItem value="hnsw" disabled={!canUseHnsw}>
                  HNSW (Vector Search)
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* HNSW parameters */}
          {indexType === "hnsw" && (
            <div className="space-y-3 p-3 border rounded-md bg-muted/20">
              <Label className="text-xs font-medium text-muted-foreground">
                HNSW Parameters
              </Label>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <div className="w-28 shrink-0 flex items-center gap-1">
                    <Label className="text-sm">Metric</Label>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <CircleHelp className="h-3.5 w-3.5 text-muted-foreground" />
                      </TooltipTrigger>
                      <TooltipContent side="right" className="max-w-[280px]">
                        L2 = Euclidean distance (general purpose). Cosine =
                        angle-based (text embeddings). IP = dot product (max
                        inner product search).
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  <Select value={metric} onValueChange={setMetric}>
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="l2">L2 (Euclidean)</SelectItem>
                      <SelectItem value="cosine">Cosine</SelectItem>
                      <SelectItem value="ip">Inner Product</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-28 shrink-0 flex items-center gap-1">
                    <Label className="text-sm">M</Label>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <CircleHelp className="h-3.5 w-3.5 text-muted-foreground" />
                      </TooltipTrigger>
                      <TooltipContent side="right" className="max-w-[280px]">
                        Max connections per node (4-64). Higher = better recall,
                        more memory.
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  <Input
                    placeholder="auto"
                    value={hnswM}
                    onChange={(e) =>
                      setHnswM(e.target.value.replace(/\D/g, ""))
                    }
                    className="h-8 text-sm font-data"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-28 shrink-0 flex items-center gap-1">
                    <Label className="text-sm">ef_construction</Label>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <CircleHelp className="h-3.5 w-3.5 text-muted-foreground" />
                      </TooltipTrigger>
                      <TooltipContent side="right" className="max-w-[280px]">
                        Search width during build (50-1000). Higher = better
                        index quality, slower build.
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  <Input
                    placeholder="auto"
                    value={hnswEfConstruction}
                    onChange={(e) =>
                      setHnswEfConstruction(e.target.value.replace(/\D/g, ""))
                    }
                    className="h-8 text-sm font-data"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-28 shrink-0 flex items-center gap-1">
                    <Label className="text-sm">ef_search</Label>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <CircleHelp className="h-3.5 w-3.5 text-muted-foreground" />
                      </TooltipTrigger>
                      <TooltipContent side="right" className="max-w-[280px]">
                        Search width during queries (10-1000). Higher = better
                        recall, slower queries.
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  <Input
                    placeholder="auto"
                    value={hnswEfSearch}
                    onChange={(e) =>
                      setHnswEfSearch(e.target.value.replace(/\D/g, ""))
                    }
                    className="h-8 text-sm font-data"
                  />
                </div>
              </div>
            </div>
          )}

          {indexType === "standard" && (
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={isUnique}
                onCheckedChange={(v) => setIsUnique(!!v)}
              />
              Unique Index
            </label>
          )}

          {indexName && selectedColumns.length > 0 && (
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">
                Generated SQL
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
            Cancel
          </Button>
          <Button
            onClick={handleCreate}
            disabled={
              loading || !indexName.trim() || selectedColumns.length === 0
            }
          >
            {loading ? "Creating..." : "Create Index"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
