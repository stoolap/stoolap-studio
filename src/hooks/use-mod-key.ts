"use client";

import { useSyncExternalStore } from "react";
import { modKey } from "@/lib/utils";

const subscribe = () => () => {};
const getSnapshot = () => modKey();
const getServerSnapshot = () => "Ctrl";

/** SSR-safe modifier key label. Returns "Ctrl" during SSR, then the correct platform value on the client. */
export function useModKey(): string {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
