"use client";

import { useState, useEffect } from "react";
import { useConnection } from "@/hooks/use-connection";
import { useEditorStore } from "@/stores/editor-store";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ConnectDialog } from "@/components/dialogs/connect-dialog";
import { ShortcutsHelpDialog } from "@/components/dialogs/shortcuts-help";
import { BackupDialog } from "@/components/dialogs/backup-dialog";
import { RestoreDialog } from "@/components/dialogs/restore-dialog";
import { ThemeSelector } from "@/components/common/theme-selector";
import { StoolapLogo } from "@/components/common/stoolap-logo";
import { ConfirmDialog } from "@/components/dialogs/confirm-dialog";
import {
  Plus,
  FlaskConical,
  Loader2,
  Database,
  Unplug,
  Keyboard,
  Download,
  Upload,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { toast } from "sonner";
import * as api from "@/lib/api-client";
import { splitStatements } from "@/lib/sql-utils";

const EXAMPLE_SQL = `-- Create tables
CREATE TABLE customers (
  id INTEGER PRIMARY KEY AUTO_INCREMENT,
  name TEXT NOT NULL,
  email TEXT UNIQUE,
  city TEXT,
  joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE products (
  id INTEGER PRIMARY KEY AUTO_INCREMENT,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  price FLOAT NOT NULL CHECK(price > 0),
  in_stock BOOLEAN DEFAULT true
);

CREATE TABLE orders (
  id INTEGER PRIMARY KEY AUTO_INCREMENT,
  customer_id INTEGER NOT NULL,
  product_id INTEGER NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  total FLOAT NOT NULL,
  status TEXT DEFAULT 'pending',
  ordered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_orders_customer ON orders(customer_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_products_category ON products(category);

-- Insert customers
INSERT INTO customers (name, email, city) VALUES ('Alice Johnson', 'alice@example.com', 'New York');
INSERT INTO customers (name, email, city) VALUES ('Bob Smith', 'bob@example.com', 'San Francisco');
INSERT INTO customers (name, email, city) VALUES ('Charlie Brown', 'charlie@example.com', 'Chicago');
INSERT INTO customers (name, email, city) VALUES ('Diana Prince', 'diana@example.com', 'Seattle');
INSERT INTO customers (name, email, city) VALUES ('Eve Wilson', 'eve@example.com', 'Austin');

-- Insert products
INSERT INTO products (name, category, price) VALUES ('Laptop Pro', 'Electronics', 1299.99);
INSERT INTO products (name, category, price) VALUES ('Wireless Mouse', 'Electronics', 29.99);
INSERT INTO products (name, category, price) VALUES ('Desk Lamp', 'Home Office', 49.99);
INSERT INTO products (name, category, price) VALUES ('Ergonomic Chair', 'Furniture', 599.99);
INSERT INTO products (name, category, price) VALUES ('USB-C Hub', 'Electronics', 39.99);
INSERT INTO products (name, category, price) VALUES ('Notebook Pack', 'Stationery', 12.99);
INSERT INTO products (name, category, price) VALUES ('Standing Desk', 'Furniture', 449.99);
INSERT INTO products (name, category, price) VALUES ('Webcam HD', 'Electronics', 79.99);

-- Insert orders
INSERT INTO orders (customer_id, product_id, quantity, total, status) VALUES (1, 1, 1, 1299.99, 'delivered');
INSERT INTO orders (customer_id, product_id, quantity, total, status) VALUES (1, 2, 2, 59.98, 'delivered');
INSERT INTO orders (customer_id, product_id, quantity, total, status) VALUES (2, 4, 1, 599.99, 'shipped');
INSERT INTO orders (customer_id, product_id, quantity, total, status) VALUES (3, 3, 3, 149.97, 'pending');
INSERT INTO orders (customer_id, product_id, quantity, total, status) VALUES (3, 5, 1, 39.99, 'delivered');
INSERT INTO orders (customer_id, product_id, quantity, total, status) VALUES (4, 7, 1, 449.99, 'shipped');
INSERT INTO orders (customer_id, product_id, quantity, total, status) VALUES (4, 8, 2, 159.98, 'pending');
INSERT INTO orders (customer_id, product_id, quantity, total, status) VALUES (5, 6, 5, 64.95, 'delivered');
INSERT INTO orders (customer_id, product_id, quantity, total, status) VALUES (5, 1, 1, 1299.99, 'pending');
INSERT INTO orders (customer_id, product_id, quantity, total, status) VALUES (2, 3, 1, 49.99, 'delivered');

-- Create a view
CREATE VIEW order_summary AS
SELECT
  c.name AS customer,
  p.name AS product,
  o.quantity,
  o.total,
  o.status
FROM orders o
JOIN customers c ON o.customer_id = c.id
JOIN products p ON o.product_id = p.id;

-- Vector search: knowledge base with semantic embeddings
CREATE TABLE knowledge_base (
  id INTEGER PRIMARY KEY AUTO_INCREMENT,
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  content TEXT NOT NULL,
  author TEXT,
  embedding VECTOR(16)
);

-- Security cluster (dims 0-3 high)
INSERT INTO knowledge_base (title, category, content, author, embedding) VALUES ('Password Reset Guide', 'Support', 'How to reset your account password and recover access to your account', 'Alice', '[0.42, 0.38, 0.35, 0.40, 0.05, 0.08, 0.03, 0.06, 0.02, 0.04, 0.01, 0.03, 0.10, 0.12, 0.08, 0.11]');
INSERT INTO knowledge_base (title, category, content, author, embedding) VALUES ('Account Security Tips', 'Support', 'Best practices to keep your account safe including strong passwords', 'Alice', '[0.40, 0.42, 0.33, 0.38, 0.06, 0.07, 0.04, 0.05, 0.03, 0.03, 0.02, 0.04, 0.11, 0.10, 0.09, 0.12]');
INSERT INTO knowledge_base (title, category, content, author, embedding) VALUES ('Two-Factor Authentication', 'Support', 'Enable 2FA to add an extra layer of security to your login', 'Bob', '[0.39, 0.40, 0.36, 0.41, 0.04, 0.06, 0.05, 0.04, 0.02, 0.05, 0.01, 0.02, 0.09, 0.11, 0.10, 0.13]');
INSERT INTO knowledge_base (title, category, content, author, embedding) VALUES ('Login Troubleshooting', 'Support', 'Common login issues and how to resolve them quickly', 'Alice', '[0.41, 0.36, 0.37, 0.39, 0.07, 0.09, 0.02, 0.07, 0.04, 0.03, 0.03, 0.05, 0.12, 0.13, 0.07, 0.10]');

-- Onboarding cluster (dims 4-7 high)
INSERT INTO knowledge_base (title, category, content, author, embedding) VALUES ('Getting Started Tutorial', 'Onboarding', 'Step by step guide for new users to set up their workspace', 'Carol', '[0.05, 0.08, 0.03, 0.06, 0.42, 0.38, 0.40, 0.35, 0.04, 0.02, 0.06, 0.03, 0.07, 0.05, 0.11, 0.09]');
INSERT INTO knowledge_base (title, category, content, author, embedding) VALUES ('Workspace Setup', 'Onboarding', 'Configure your workspace with themes, layouts and preferences', 'Carol', '[0.06, 0.07, 0.04, 0.05, 0.40, 0.42, 0.38, 0.33, 0.03, 0.03, 0.05, 0.04, 0.08, 0.06, 0.10, 0.12]');
INSERT INTO knowledge_base (title, category, content, author, embedding) VALUES ('First Project Guide', 'Onboarding', 'Create your first project and invite team members to collaborate', 'Dave', '[0.04, 0.06, 0.05, 0.04, 0.39, 0.40, 0.41, 0.36, 0.05, 0.02, 0.04, 0.02, 0.06, 0.09, 0.12, 0.11]');

-- Billing cluster (dims 8-11 high)
INSERT INTO knowledge_base (title, category, content, author, embedding) VALUES ('Pricing Plans', 'Finance', 'Compare our Free, Pro, and Enterprise pricing tiers', 'Eve', '[0.03, 0.04, 0.02, 0.05, 0.06, 0.03, 0.04, 0.07, 0.42, 0.38, 0.40, 0.35, 0.08, 0.05, 0.09, 0.06]');
INSERT INTO knowledge_base (title, category, content, author, embedding) VALUES ('Invoice FAQ', 'Finance', 'How to view, download and understand your monthly invoices', 'Eve', '[0.04, 0.03, 0.03, 0.06, 0.05, 0.04, 0.03, 0.08, 0.40, 0.42, 0.38, 0.33, 0.07, 0.06, 0.10, 0.05]');
INSERT INTO knowledge_base (title, category, content, author, embedding) VALUES ('Refund Policy', 'Finance', 'Our refund and cancellation policy for all subscription plans', 'Eve', '[0.05, 0.02, 0.04, 0.04, 0.04, 0.05, 0.02, 0.06, 0.39, 0.40, 0.41, 0.36, 0.06, 0.04, 0.08, 0.07]');

-- Developer cluster (dims 0-3 moderate + dims 12-15 high)
INSERT INTO knowledge_base (title, category, content, author, embedding) VALUES ('API Authentication', 'Developer', 'Authenticate API requests using OAuth tokens and API keys', 'Frank', '[0.25, 0.20, 0.18, 0.22, 0.08, 0.05, 0.06, 0.04, 0.03, 0.06, 0.04, 0.02, 0.40, 0.42, 0.38, 0.35]');
INSERT INTO knowledge_base (title, category, content, author, embedding) VALUES ('Webhooks Guide', 'Developer', 'Set up webhooks to receive real-time event notifications', 'Frank', '[0.22, 0.18, 0.20, 0.24, 0.06, 0.07, 0.04, 0.05, 0.04, 0.05, 0.03, 0.03, 0.38, 0.40, 0.42, 0.33]');
INSERT INTO knowledge_base (title, category, content, author, embedding) VALUES ('Data Export API', 'Developer', 'Export data in CSV, JSON, and Parquet formats via the REST API', 'Grace', '[0.24, 0.22, 0.16, 0.20, 0.07, 0.04, 0.05, 0.06, 0.05, 0.03, 0.02, 0.04, 0.42, 0.38, 0.40, 0.36]');
INSERT INTO knowledge_base (title, category, content, author, embedding) VALUES ('SDK Quick Start', 'Developer', 'Get started with our Python and JavaScript SDKs in minutes', 'Frank', '[0.23, 0.21, 0.19, 0.21, 0.05, 0.06, 0.07, 0.03, 0.02, 0.04, 0.05, 0.03, 0.39, 0.41, 0.37, 0.34]');

-- Admin cluster (moderate across dims 0-3 and 8-11)
INSERT INTO knowledge_base (title, category, content, author, embedding) VALUES ('User Management', 'Admin', 'Add, remove and manage user accounts and permissions', 'Grace', '[0.28, 0.25, 0.22, 0.20, 0.10, 0.08, 0.06, 0.09, 0.25, 0.22, 0.20, 0.18, 0.12, 0.10, 0.08, 0.14]');
INSERT INTO knowledge_base (title, category, content, author, embedding) VALUES ('Role Permissions', 'Admin', 'Configure role-based access control for your organization', 'Grace', '[0.26, 0.28, 0.20, 0.22, 0.08, 0.10, 0.07, 0.08, 0.22, 0.25, 0.22, 0.16, 0.14, 0.08, 0.10, 0.12]');

-- Product Updates cluster (dims 12-15 high, dims 4-7 moderate)
INSERT INTO knowledge_base (title, category, content, author, embedding) VALUES ('Release Notes v2.0', 'News', 'New features including dark mode, real-time collaboration and vector search', 'Dave', '[0.08, 0.06, 0.10, 0.05, 0.20, 0.18, 0.22, 0.15, 0.06, 0.04, 0.08, 0.05, 0.38, 0.35, 0.40, 0.42]');
INSERT INTO knowledge_base (title, category, content, author, embedding) VALUES ('Product Roadmap 2025', 'News', 'Upcoming features: AI assistant, advanced analytics, and mobile app', 'Dave', '[0.10, 0.05, 0.08, 0.07, 0.18, 0.22, 0.20, 0.16, 0.05, 0.06, 0.07, 0.04, 0.40, 0.38, 0.42, 0.39]');

CREATE INDEX idx_kb_embedding ON knowledge_base(embedding) USING HNSW WITH (metric = 'cosine');
CREATE INDEX idx_kb_category ON knowledge_base(category);
CREATE INDEX idx_kb_author ON knowledge_base(author);`;

export function Toolbar() {
  const [connectOpen, setConnectOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [backupOpen, setBackupOpen] = useState(false);
  const [restoreOpen, setRestoreOpen] = useState(false);
  const [loadingExample, setLoadingExample] = useState(false);
  const [disconnectConfirm, setDisconnectConfirm] = useState(false);
  const { connections, activeId, setActiveId, disconnect, connect } =
    useConnection();
  const addTab = useEditorStore((s) => s.addTab);
  const setActiveTab = useEditorStore((s) => s.setActiveTab);
  const queryClient = useQueryClient();

  const activeConn = connections.find((c) => c.id === activeId);

  // Listen for keyboard shortcut to open shortcuts help
  useEffect(() => {
    const handler = () => setShortcutsOpen(true);
    window.addEventListener("stoolap:shortcuts-help", handler);
    return () => window.removeEventListener("stoolap:shortcuts-help", handler);
  }, []);

  const handleLoadExample = async () => {
    // If an Example DB already exists, just switch to it
    const existing = connections.find((c) => c.name === "Example DB");
    if (existing) {
      setActiveId(existing.id);
      return;
    }

    setLoadingExample(true);
    try {
      // Open a new in-memory database
      const meta = await connect(":memory:", "Example DB");

      // Execute all the DDL/DML statements one by one
      const statements = splitStatements(EXAMPLE_SQL);

      for (const stmt of statements) {
        await api.executeQuery(meta.id, stmt);
      }

      // Refresh schema (scoped to the new connection)
      queryClient.invalidateQueries({ queryKey: ["tables", meta.id] });
      queryClient.invalidateQueries({ queryKey: ["views", meta.id] });

      // Open a tab with a sample query
      const sampleQuery = `-- Try these queries:

-- All orders with customer and product names
SELECT * FROM order_summary;

-- Revenue by product category
SELECT p.category, COUNT(*) AS orders, SUM(o.total) AS revenue
FROM orders o
JOIN products p ON o.product_id = p.id
GROUP BY p.category
ORDER BY revenue DESC;

-- Customers with total spending
SELECT c.name, c.city, COUNT(o.id) AS orders, SUM(o.total) AS total_spent
FROM customers c
JOIN orders o ON o.customer_id = c.id
GROUP BY c.name, c.city
ORDER BY total_spent DESC;

-- Pending orders
SELECT c.name AS customer, p.name AS product, o.total
FROM orders o
JOIN customers c ON o.customer_id = c.id
JOIN products p ON o.product_id = p.id
WHERE o.status = 'pending';

-- === Vector Search Examples ===

-- k-NN: find articles similar to "login help" (uses HNSW index)
SELECT title, category, author,
       VEC_DISTANCE_COSINE(embedding, '[0.41, 0.37, 0.36, 0.40, 0.06, 0.08, 0.03, 0.05, 0.03, 0.04, 0.02, 0.04, 0.11, 0.12, 0.08, 0.10]') AS distance
FROM knowledge_base
ORDER BY distance
LIMIT 5;

-- Hybrid search: similar articles within Developer category only
SELECT title, content,
       VEC_DISTANCE_COSINE(embedding, '[0.24, 0.20, 0.18, 0.22, 0.06, 0.05, 0.05, 0.04, 0.03, 0.05, 0.03, 0.03, 0.40, 0.40, 0.39, 0.35]') AS distance
FROM knowledge_base
WHERE category = 'Developer'
ORDER BY distance
LIMIT 5;

-- Metric comparison: cosine vs L2 distance side by side
SELECT title,
       VEC_DISTANCE_COSINE(embedding, '[0.41, 0.37, 0.36, 0.40, 0.06, 0.08, 0.03, 0.05, 0.03, 0.04, 0.02, 0.04, 0.11, 0.12, 0.08, 0.10]') AS cosine_dist,
       VEC_DISTANCE_L2(embedding, '[0.41, 0.37, 0.36, 0.40, 0.06, 0.08, 0.03, 0.05, 0.03, 0.04, 0.02, 0.04, 0.11, 0.12, 0.08, 0.10]') AS l2_dist
FROM knowledge_base
ORDER BY cosine_dist
LIMIT 5;

-- Vector utilities: inspect embedding dimensions and norms
SELECT title, category, VEC_DIMS(embedding) AS dims, VEC_NORM(embedding) AS norm
FROM knowledge_base
ORDER BY norm DESC;

-- Self-join: find the closest pairs of articles
SELECT a.title AS article_1, b.title AS article_2,
       VEC_DISTANCE_COSINE(a.embedding, b.embedding) AS distance
FROM knowledge_base a
CROSS JOIN knowledge_base b
WHERE a.id < b.id
ORDER BY distance
LIMIT 10;`;

      const tabId = addTab("Examples", sampleQuery);
      setActiveTab(tabId);
      toast.success("Example database loaded");
    } catch (e) {
      toast.error("Failed to load example", {
        description: e instanceof Error ? e.message : "Unknown error",
      });
    } finally {
      setLoadingExample(false);
    }
  };

  return (
    <>
      <div className="flex items-center gap-2 px-3 h-11 border-b bg-background shrink-0">
        <StoolapLogo height={28} />

        <div className="toolbar-separator" />

        {/* Connection selector */}
        {connections.length > 0 ? (
          <Select value={activeId ?? ""} onValueChange={setActiveId}>
            <SelectTrigger className="w-[200px] h-8 text-sm">
              <div className="flex items-center gap-2">
                <Database className="h-4 w-4 text-primary shrink-0" />
                <SelectValue placeholder="Select connection" />
              </div>
            </SelectTrigger>
            <SelectContent>
              {connections.map((conn) => (
                <SelectItem key={conn.id} value={conn.id}>
                  <div className="flex items-center gap-2">
                    <span>{conn.name}</span>
                    <Badge
                      variant="outline"
                      className="text-[10px] px-1 py-0 leading-tight"
                    >
                      {conn.type}
                    </Badge>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <span className="text-sm text-muted-foreground">No connections</span>
        )}

        {activeConn && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => setDisconnectConfirm(true)}
                aria-label="Disconnect"
              >
                <Unplug className="h-4 w-4 text-muted-foreground hover:text-destructive" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Disconnect</TooltipContent>
          </Tooltip>
        )}

        <div className="toolbar-separator" />

        <Button
          variant="outline"
          size="sm"
          onClick={() => setConnectOpen(true)}
          className="gap-1.5"
        >
          <Plus className="h-3.5 w-3.5" />
          Open DB
        </Button>

        <Button
          variant="outline"
          size="sm"
          onClick={handleLoadExample}
          disabled={loadingExample}
          className="gap-1.5"
        >
          {loadingExample ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <FlaskConical className="h-3.5 w-3.5" />
          )}
          Example
        </Button>

        <div className="toolbar-separator" />

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setBackupOpen(true)}
              disabled={!activeConn}
              className="gap-1.5"
            >
              <Download className="h-3.5 w-3.5" />
              Backup
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            Export database as SQL dump
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setRestoreOpen(true)}
              disabled={!activeConn}
              className="gap-1.5"
            >
              <Upload className="h-3.5 w-3.5" />
              Restore
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Import SQL dump file</TooltipContent>
        </Tooltip>

        <div className="flex-1" />

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setShortcutsOpen(true)}
              aria-label="Keyboard shortcuts"
            >
              <Keyboard className="h-4 w-4 text-muted-foreground" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Keyboard shortcuts</TooltipContent>
        </Tooltip>
        <ThemeSelector />
      </div>

      {activeConn && (
        <ConfirmDialog
          open={disconnectConfirm}
          onOpenChange={setDisconnectConfirm}
          title="Disconnect"
          description={`Disconnect from "${activeConn.name}"? Unsaved queries and in-memory data will be lost.`}
          confirmLabel="Disconnect"
          destructive
          onConfirm={() => {
            disconnect(activeConn.id);
            setDisconnectConfirm(false);
          }}
        />
      )}
      <ConnectDialog open={connectOpen} onOpenChange={setConnectOpen} />
      <ShortcutsHelpDialog
        open={shortcutsOpen}
        onOpenChange={setShortcutsOpen}
      />
      <BackupDialog open={backupOpen} onOpenChange={setBackupOpen} />
      <RestoreDialog open={restoreOpen} onOpenChange={setRestoreOpen} />
    </>
  );
}
