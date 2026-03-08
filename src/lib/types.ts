export interface ConnectionMeta {
  id: string;
  name: string;
  path: string;
  type: "memory" | "file";
  createdAt: number;
}

export interface QueryResult {
  columns: string[];
  rows: unknown[][];
  time: number;
  totalRows?: number;
  error?: undefined;
}

export interface ExecResult {
  changes: number;
  time: number;
  error?: undefined;
}

export interface DdlResult {
  ddl: string;
  time: number;
  error?: undefined;
}

export interface ErrorResult {
  error: string;
}

export type ApiResult = QueryResult | ExecResult | DdlResult | ErrorResult;

export interface ColumnInfo {
  field: string;
  type: string;
  nullable: boolean;
  key: string;
  defaultValue: string;
  extra: string;
}

export interface IndexInfo {
  tableName: string;
  indexName: string;
  columnName: string;
  indexType: string;
  isUnique: boolean;
}

export interface ForeignKeyInfo {
  columnName: string;
  referencedTable: string;
  referencedColumn: string;
  onDelete: string;
  onUpdate: string;
}

export interface TableSchema {
  name: string;
  columns: ColumnInfo[];
  indexes: IndexInfo[];
}

export interface FilterCondition {
  column: string;
  operator: string;
  value: string;
}

export interface EditorTab {
  id: string;
  title: string;
  sql: string;
  result: ApiResult | null;
  isRunning: boolean;
  mode: "query" | "data";
  tableName?: string;
  lastExecutedSql?: string;
  initialFilter?: { column: string; value: string };
}
