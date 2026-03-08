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
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import type { ColumnInfo } from "@/lib/types";

interface RowEditorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  columns: ColumnInfo[];
  onSave: (row: Record<string, unknown>) => Promise<void>;
}

function isAutoIncrement(col: ColumnInfo): boolean {
  return col.extra?.toLowerCase().includes("auto_increment") || false;
}

export function RowEditorDialog({
  open,
  onOpenChange,
  columns,
  onSave,
}: RowEditorDialogProps) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [boolValues, setBoolValues] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const editableColumns = columns.filter((col) => !isAutoIncrement(col));

  const handleSave = async () => {
    setLoading(true);
    setError("");
    try {
      const row: Record<string, unknown> = {};
      for (const col of editableColumns) {
        const upper = col.type.toUpperCase();

        if (upper === "BOOLEAN") {
          const boolVal = boolValues[col.field];
          if (boolVal !== undefined) {
            row[col.field] = boolVal;
          } else if (!col.nullable && !col.defaultValue) {
            row[col.field] = false;
          }
          continue;
        }

        const val = values[col.field];
        if (val === undefined || val === "") {
          if (!col.nullable && !col.defaultValue && col.key !== "PRI") {
            throw new Error(`${col.field} is required`);
          }
          continue;
        }
        if (upper === "INTEGER" || upper === "INT") {
          const parsed = parseInt(val, 10);
          if (isNaN(parsed)) throw new Error(`${col.field}: invalid integer`);
          row[col.field] = parsed;
        } else if (upper === "FLOAT") {
          const parsed = parseFloat(val);
          if (isNaN(parsed)) throw new Error(`${col.field}: invalid number`);
          row[col.field] = parsed;
        } else if (upper.startsWith("VECTOR")) {
          // Pass vector as string — the database parses the [0.1, 0.2, ...] format
          row[col.field] = val;
        } else {
          row[col.field] = val;
        }
      }
      await onSave(row);
      handleOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setLoading(false);
    }
  };

  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      setValues({});
      setBoolValues({});
      setError("");
      setLoading(false);
    }
    onOpenChange(isOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Insert Row</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-3 py-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!loading) handleSave();
          }}
        >
          {editableColumns.map((col) => {
            const upper = col.type.toUpperCase();
            const isBool = upper === "BOOLEAN";
            const isVector = upper.startsWith("VECTOR");
            return (
              <div key={col.field} className="space-y-1">
                <div className="flex items-center gap-2">
                  <Label htmlFor={`col-${col.field}`} className="text-xs">
                    {col.field}
                  </Label>
                  <Badge variant="outline" className="text-[10px] px-1 py-0">
                    {col.type}
                  </Badge>
                  {col.key === "PRI" && (
                    <Badge className="text-[10px] px-1 py-0">PK</Badge>
                  )}
                  {!col.nullable && (
                    <Badge
                      variant="destructive"
                      className="text-[10px] px-1 py-0"
                    >
                      NOT NULL
                    </Badge>
                  )}
                </div>
                {isBool ? (
                  <div className="flex items-center gap-2 h-8">
                    <Switch
                      id={`col-${col.field}`}
                      checked={boolValues[col.field] ?? false}
                      onCheckedChange={(v) =>
                        setBoolValues({ ...boolValues, [col.field]: v })
                      }
                    />
                    <span className="text-xs text-muted-foreground">
                      {boolValues[col.field] ? "true" : "false"}
                    </span>
                  </div>
                ) : (
                  <Input
                    id={`col-${col.field}`}
                    placeholder={
                      isVector
                        ? "[0.1, 0.2, 0.3, ...]"
                        : col.defaultValue
                          ? `Default: ${col.defaultValue}`
                          : col.nullable
                            ? "NULL"
                            : ""
                    }
                    value={values[col.field] ?? ""}
                    onChange={(e) =>
                      setValues({ ...values, [col.field]: e.target.value })
                    }
                    className={
                      isVector ? "h-8 text-sm font-mono" : "h-8 text-sm"
                    }
                  />
                )}
              </div>
            );
          })}
          {columns.length > editableColumns.length && (
            <p className="text-xs text-muted-foreground">
              Auto-increment columns are automatically generated.
            </p>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Inserting..." : "Insert"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
