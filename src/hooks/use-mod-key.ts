import { useSyncExternalStore } from "react";
import { modKey } from "@/lib/utils";

const subscribe = () => () => {};
const getSnapshot = () => modKey();

export function useModKey(): string {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
