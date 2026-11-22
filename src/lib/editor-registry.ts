import type { EditorView } from "@codemirror/view";

/** The mounted SQL editor (only the active tab's editor is mounted). */
let activeView: EditorView | null = null;

export function setActiveEditorView(view: EditorView): void {
  activeView = view;
}

/** Forget `view` if it is still the registered one (on unmount). */
export function clearActiveEditorView(view: EditorView | undefined): void {
  if (view && activeView === view) activeView = null;
}

/** The text selected in the active editor, if any. */
export function getEditorSelection(): string {
  if (!activeView) return "";
  const { from, to } = activeView.state.selection.main;
  return activeView.state.sliceDoc(from, to);
}
