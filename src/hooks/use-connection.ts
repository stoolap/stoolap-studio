"use client";

import { useCallback } from "react";
import { useConnectionStore } from "@/stores/connection-store";
import { useHistoryStore } from "@/stores/history-store";
import * as api from "@/lib/api-client";

export function useConnection() {
  const connections = useConnectionStore((s) => s.connections);
  const activeId = useConnectionStore((s) => s.activeId);
  const addConnection = useConnectionStore((s) => s.addConnection);
  const removeConnection = useConnectionStore((s) => s.removeConnection);
  const setActiveId = useConnectionStore((s) => s.setActiveId);
  const addRecent = useHistoryStore((s) => s.addRecent);

  const connect = useCallback(
    async (path: string, name?: string) => {
      const meta = await api.openConnection(path, name);
      addConnection(meta);
      addRecent({ path: meta.path, name: meta.name, type: meta.type });
      return meta;
    },
    [addConnection, addRecent],
  );

  const disconnect = useCallback(
    async (id: string) => {
      try {
        await api.closeConnection(id);
      } catch {
        // Still remove locally even if server call fails
      }
      removeConnection(id);
    },
    [removeConnection],
  );

  return {
    connections,
    activeId,
    setActiveId,
    connect,
    disconnect,
  };
}
