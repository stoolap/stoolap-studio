import { create } from "zustand";
import { persist } from "zustand/middleware";
import { v4 as uuidv4 } from "uuid";

export interface Bookmark {
  id: string;
  name: string;
  sql: string;
  createdAt: number;
}

interface BookmarkState {
  bookmarks: Bookmark[];
  addBookmark: (name: string, sql: string) => void;
  removeBookmark: (id: string) => void;
  renameBookmark: (id: string, name: string) => void;
}

export const useBookmarkStore = create<BookmarkState>()(
  persist(
    (set) => ({
      bookmarks: [],

      addBookmark: (name, sql) =>
        set((s) => {
          // Prevent duplicate SQL bookmarks
          if (s.bookmarks.some((b) => b.sql === sql)) return s;
          return {
            bookmarks: [
              { id: uuidv4(), name, sql, createdAt: Date.now() },
              ...s.bookmarks,
            ],
          };
        }),

      removeBookmark: (id) =>
        set((s) => ({
          bookmarks: s.bookmarks.filter((b) => b.id !== id),
        })),

      renameBookmark: (id, name) =>
        set((s) => ({
          bookmarks: s.bookmarks.map((b) => (b.id === id ? { ...b, name } : b)),
        })),
    }),
    { name: "stoolap-bookmarks", version: 1 },
  ),
);
