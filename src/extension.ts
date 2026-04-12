import * as vscode from "vscode";

import { LineMarkerProvider } from "./LineMarkerProvider";
import {
  addMarkersForSelection,
  clearMarkers,
  exportMarkersToCsv,
  findMarkerById,
  getMarkers,
  MarkerScope,
  getSortedUniqueMarkers,
  initializeMarkers,
  removeMarkersAtLocation,
  revealMarker,
  renderMarkersForVisibleEditors,
  toggleMarkersForSelection
} from "./markers";

const ADD_SESSION_COMMAND = "rinemaka.addSessionMarker";
const ADD_WORKSPACE_COMMAND = "rinemaka.addWorkspaceMarker";
const TOGGLE_SESSION_COMMAND = "rinemaka.toggleSessionMarker";
const TOGGLE_WORKSPACE_COMMAND = "rinemaka.toggleWorkspaceMarker";
const REMOVE_COMMAND = "rinemaka.removeMarker";
const OPEN_COMMAND = "rinemaka.openMarker";
const CLEAR_SESSION_COMMAND = "rinemaka.clearSessionMarkers";
const CLEAR_WORKSPACE_COMMAND = "rinemaka.clearWorkspaceMarkers";
const EXPORT_SESSION_CSV_COMMAND = "rinemaka.exportSessionCsv";
const EXPORT_WORKSPACE_CSV_COMMAND = "rinemaka.exportWorkspaceCsv";
const NEXT_MARKER_COMMAND = "rinemaka.nextMarker";
const PREV_MARKER_COMMAND = "rinemaka.prevMarker";
const NEXT_SESSION_MARKER_COMMAND = "rinemaka.nextSessionMarker";
const PREV_SESSION_MARKER_COMMAND = "rinemaka.prevSessionMarker";
const NEXT_WORKSPACE_MARKER_COMMAND = "rinemaka.nextWorkspaceMarker";
const PREV_WORKSPACE_MARKER_COMMAND = "rinemaka.prevWorkspaceMarker";
const VIEW_ID = "rinemakaMarkersView";

export function activate(context: vscode.ExtensionContext): void {
  // Register the tree view, commands, and marker listeners together at startup.
  const provider = new LineMarkerProvider();
  const refresh = (): void => {
    renderMarkersForVisibleEditors();
    provider.refresh();
  };

  context.subscriptions.push(
    ...initializeMarkers(context),
    vscode.window.registerTreeDataProvider(VIEW_ID, provider),
    vscode.commands.registerCommand(ADD_SESSION_COMMAND, async () => {
      // Session markers live only for the current VS Code session.
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        return;
      }

      const created = await addMarkersForSelection(context, editor, "session");
      refresh();
      if (created.length === 0) {
        void vscode.window.showInformationMessage("Selected lines are already marked for this session.");
      }
    }),
    vscode.commands.registerCommand(ADD_WORKSPACE_COMMAND, async () => {
      // Workspace markers are persisted to workspace state.
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        return;
      }

      const created = await addMarkersForSelection(context, editor, "workspace");
      refresh();
      if (created.length === 0) {
        void vscode.window.showInformationMessage("Selected lines are already saved as workspace markers.");
      }
    }),
    vscode.commands.registerCommand(TOGGLE_SESSION_COMMAND, async () => {
      // Toggle lets the same command both add and remove markers.
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        return;
      }

      const result = await toggleMarkersForSelection(context, editor, "session");
      refresh();
      if (result.added.length === 0 && result.removed === 0) {
        void vscode.window.showInformationMessage("No session markers were toggled.");
      }
    }),
    vscode.commands.registerCommand(TOGGLE_WORKSPACE_COMMAND, async () => {
      // Workspace toggle mirrors the session toggle, but persists changes.
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        return;
      }

      const result = await toggleMarkersForSelection(context, editor, "workspace");
      refresh();
      if (result.added.length === 0 && result.removed === 0) {
        void vscode.window.showInformationMessage("No workspace markers were toggled.");
      }
    }),
    vscode.commands.registerCommand(REMOVE_COMMAND, async (target?: unknown) => {
      // Resolve the marker from the tree item or fall back to the active line.
      const resolvedMarker = resolveMarker(target) ?? getActiveLineMarker();
      if (!resolvedMarker) {
        void vscode.window.showInformationMessage("No marked line was found.");
        return;
      }

      const removed = await removeMarkersAtLocation(context, resolvedMarker.uri, resolvedMarker.line);
      refresh();
      if (!removed) {
        void vscode.window.showInformationMessage("No marked line was found.");
      }
    }),
    vscode.commands.registerCommand(OPEN_COMMAND, async (target?: unknown) => {
      // Open the selected marker in the editor and reveal its line.
      const resolvedMarker = resolveMarker(target);
      if (!resolvedMarker) {
        return;
      }

      await revealMarker(resolvedMarker);
    }),
    vscode.commands.registerCommand(CLEAR_SESSION_COMMAND, async () => {
      // Keep the refresh path identical after every mutation.
      await clearMarkers(context, "session");
      refresh();
    }),
    vscode.commands.registerCommand(CLEAR_WORKSPACE_COMMAND, async () => {
      // Workspace markers are stored separately from session markers.
      await clearMarkers(context, "workspace");
      refresh();
    }),
    vscode.commands.registerCommand(EXPORT_SESSION_CSV_COMMAND, async () => {
      // Export session markers without touching workspace state.
      await exportMarkersToCsv("session");
    }),
    vscode.commands.registerCommand(EXPORT_WORKSPACE_CSV_COMMAND, async () => {
      // Export workspace markers as a separate CSV set.
      await exportMarkersToCsv("workspace");
    }),
    vscode.commands.registerCommand(NEXT_MARKER_COMMAND, async () => {
      // Move through markers across all scopes in file order.
      await revealRelativeMarker(1);
    }),
    vscode.commands.registerCommand(PREV_MARKER_COMMAND, async () => {
      // Reverse direction uses the same navigation logic.
      await revealRelativeMarker(-1);
    }),
    vscode.commands.registerCommand(NEXT_SESSION_MARKER_COMMAND, async () => {
      await revealRelativeMarker(1, "session");
    }),
    vscode.commands.registerCommand(PREV_SESSION_MARKER_COMMAND, async () => {
      await revealRelativeMarker(-1, "session");
    }),
    vscode.commands.registerCommand(NEXT_WORKSPACE_MARKER_COMMAND, async () => {
      await revealRelativeMarker(1, "workspace");
    }),
    vscode.commands.registerCommand(PREV_WORKSPACE_MARKER_COMMAND, async () => {
      await revealRelativeMarker(-1, "workspace");
    }),
    vscode.workspace.onDidChangeTextDocument(() => {
      provider.refresh();
    }),
    vscode.window.onDidChangeActiveTextEditor(() => {
      provider.refresh();
    }),
    vscode.window.onDidChangeVisibleTextEditors(() => {
      provider.refresh();
    })
  );

  refresh();
}

export function deactivate(): void {
}

/**
 * Returns the marker that exists on the active editor line, if any.
 */
function getActiveLineMarker() {
  // Look up the marker directly under the cursor, if one exists.
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    return undefined;
  }

  const uri = editor.document.uri.toString();
  const line = editor.selection.active.line;
  return getMarkers().find((item) => item.uri === uri && item.line === line);
}

/**
 * Extracts a marker id from tree view items or direct string arguments.
 */
function resolveMarkerId(target: unknown): string | undefined {
  // Tree view items can hand us either a raw string id or an object wrapper.
  if (typeof target === "string") {
    return target;
  }

  if (!target || typeof target !== "object") {
    return undefined;
  }

  if ("marker" in target) {
    const marker = (target as { marker?: { id?: unknown } }).marker;
    return typeof marker?.id === "string" ? marker.id : undefined;
  }

  if ("id" in target) {
    const id = (target as { id?: unknown }).id;
    return typeof id === "string" ? id : undefined;
  }

  return undefined;
}

/**
 * Resolves a command target into a concrete marker record.
 */
function resolveMarker(target: unknown) {
  // Convert arbitrary command payloads back into the concrete marker record.
  const markerId = resolveMarkerId(target);
  if (!markerId) {
    return undefined;
  }

  return findMarkerById(markerId);
}

/**
 * Navigates to the next or previous marker, wrapping across files when needed.
 */
async function revealRelativeMarker(direction: 1 | -1, scope?: MarkerScope): Promise<void> {
  // Walk the sorted marker list and wrap at the ends so navigation feels continuous.
  const markers = getSortedUniqueMarkers(scope);
  if (markers.length === 0) {
    const label = scope ? `${scope} markers` : "markers";
    void vscode.window.showInformationMessage(`There are no ${label} to navigate.`);
    return;
  }

  const activeEditor = vscode.window.activeTextEditor;
  const activeUri = activeEditor?.document.uri.toString();
  const activeLine = activeEditor?.selection.active.line ?? -1;

  const currentIndex = markers.findIndex((marker) => marker.uri === activeUri && marker.line === activeLine);
  const targetIndex = currentIndex >= 0
    ? getWrappedIndex(currentIndex + direction, markers.length)
    : getNearestMarkerIndex(markers, activeUri, activeLine, direction);

  await revealMarker(markers[targetIndex]);
}

/**
 * Wraps an index into the valid bounds of the marker list.
 */
function getWrappedIndex(index: number, length: number): number {
  // Normal modulo that also handles negative offsets.
  return ((index % length) + length) % length;
}

/**
 * Chooses the nearest marker when the current cursor position is not already marked.
 */
function getNearestMarkerIndex(
  markers: ReturnType<typeof getSortedUniqueMarkers>,
  activeUri: string | undefined,
  activeLine: number,
  direction: 1 | -1
): number {
  // If the cursor is not already on a marker, jump to the nearest sensible one.
  if (!activeUri) {
    return direction === 1 ? 0 : markers.length - 1;
  }

  if (direction === 1) {
    const nextIndex = markers.findIndex((marker) =>
      marker.uri > activeUri || (marker.uri === activeUri && marker.line > activeLine)
    );
    return nextIndex >= 0 ? nextIndex : 0;
  }

  for (let index = markers.length - 1; index >= 0; index -= 1) {
    const marker = markers[index];
    if (marker.uri < activeUri || (marker.uri === activeUri && marker.line < activeLine)) {
      return index;
    }
  }

  return markers.length - 1;
}
