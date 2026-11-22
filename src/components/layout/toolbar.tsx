
import { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { errorMessage } from "@/lib/utils";
import { useConnection } from "@/hooks/use-connection";
import { useEditorStore } from "@/stores/editor-store";
import { useQueryClient } from "@tanstack/react-query";
import { ConnectDialog } from "@/components/dialogs/connect-dialog";
import { ShortcutsHelpDialog } from "@/components/dialogs/shortcuts-help";
import { BackupDialog } from "@/components/dialogs/backup-dialog";
import { RestoreDialog } from "@/components/dialogs/restore-dialog";
import { AboutDialog } from "@/components/dialogs/about-dialog";
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
  customer_id INTEGER NOT NULL REFERENCES customers(id),
  product_id INTEGER NOT NULL REFERENCES products(id),
  quantity INTEGER NOT NULL DEFAULT 1,
  total FLOAT NOT NULL,
  status TEXT DEFAULT 'pending',
  ordered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

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

/**
 * Headless: no UI of its own. It holds the dialogs, and answers the app
 * menu, keyboard shortcuts and the welcome screen.
 */
export function Toolbar() {
  const { t } = useTranslation("layout");
  const [connectOpen, setConnectOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [backupOpen, setBackupOpen] = useState(false);
  const [restoreOpen, setRestoreOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const { connections, activeId, setActiveId, connect } = useConnection();
  const addTab = useEditorStore((s) => s.addTab);
  const setActiveTab = useEditorStore((s) => s.setActiveTab);
  const queryClient = useQueryClient();

  // Listen for in-app requests: the app menu, the shortcuts help key and
  // the welcome screen's actions
  useEffect(() => {
    const handlers: Array<[string, () => void]> = [
      ["stoolap:shortcuts-help", () => setShortcutsOpen(true)],
      ["stoolap:open-database", () => setConnectOpen(true)],
      ["stoolap:new-memory-db", () => newMemoryRef.current()],
      ["stoolap:load-example", () => loadExampleRef.current()],
      ["stoolap:backup", () => setBackupOpen(true)],
      ["stoolap:restore", () => setRestoreOpen(true)],
      ["stoolap:about", () => setAboutOpen(true)],
    ];
    for (const [name, h] of handlers) window.addEventListener(name, h);
    return () => {
      for (const [name, h] of handlers) window.removeEventListener(name, h);
    };
  }, []);

  const handleLoadExample = async () => {
    const existing = connections.find((c) => c.name === "Example DB");
    if (existing) {
      setActiveId(existing.id);
      return;
    }

    try {
      const meta = await connect(":memory:", "Example DB");
      const statements = splitStatements(EXAMPLE_SQL);
      for (const stmt of statements) {
        await api.runSql(meta.id, stmt);
      }
      queryClient.invalidateQueries({ queryKey: ["tables", meta.id] });
      queryClient.invalidateQueries({ queryKey: ["views", meta.id] });

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
LIMIT 5;`;

      // One Examples tab, not saved across launches (the example database
      // itself is closed at every start)
      const editor = useEditorStore.getState();
      const existing = editor.tabs.find((tab) => tab.transient && tab.title === t("toolbar.examplesTab"));
      if (existing) {
        editor.updateTabSql(existing.id, sampleQuery);
        setActiveTab(existing.id);
      } else {
        setActiveTab(addTab(t("toolbar.examplesTab"), sampleQuery, { transient: true }));
      }
    } catch (e) {
      toast.error(t("toolbar.loadExampleFailed"), {
        description: errorMessage(e),
      });
    }
  };

  const handleNewMemory = async () => {
    try {
      await connect(":memory:");
    } catch (e) {
      toast.error(t("toolbar.createFailed"), { description: errorMessage(e) });
    }
  };

  // The listeners are registered once; read the latest handlers (and the
  // connections list they close over) through refs.
  const loadExampleRef = useRef(handleLoadExample);
  loadExampleRef.current = handleLoadExample;
  const newMemoryRef = useRef(handleNewMemory);
  newMemoryRef.current = handleNewMemory;

  return (
    <>
      <ConnectDialog open={connectOpen} onOpenChange={setConnectOpen} />
      <ShortcutsHelpDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
      <BackupDialog open={backupOpen} onOpenChange={setBackupOpen} />
      <RestoreDialog open={restoreOpen} onOpenChange={setRestoreOpen} />
      <AboutDialog open={aboutOpen} onOpenChange={setAboutOpen} />
    </>
  );
}
