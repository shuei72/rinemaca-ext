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

const ADD_SESSION_COMMAND = "rinemaca.addSessionLineMarker";
const ADD_WORKSPACE_COMMAND = "rinemaca.addWorkspaceLineMarker";
const TOGGLE_SESSION_COMMAND = "rinemaca.toggleSessionLineMarker";
const TOGGLE_WORKSPACE_COMMAND = "rinemaca.toggleWorkspaceLineMarker";
const REMOVE_COMMAND = "rinemaca.removeLineMarker";
const OPEN_COMMAND = "rinemaca.openMarker";
const CLEAR_SESSION_COMMAND = "rinemaca.clearSessionMarkers";
const CLEAR_WORKSPACE_COMMAND = "rinemaca.clearWorkspaceMarkers";
const EXPORT_SESSION_CSV_COMMAND = "rinemaca.exportSessionMarkersCsv";
const EXPORT_WORKSPACE_CSV_COMMAND = "rinemaca.exportWorkspaceMarkersCsv";
const NEXT_MARKER_COMMAND = "rinemaca.nextMarker";
const PREVIOUS_MARKER_COMMAND = "rinemaca.previousMarker";
const NEXT_SESSION_MARKER_COMMAND = "rinemaca.nextSessionMarker";
const PREVIOUS_SESSION_MARKER_COMMAND = "rinemaca.previousSessionMarker";
const NEXT_WORKSPACE_MARKER_COMMAND = "rinemaca.nextWorkspaceMarker";
const PREVIOUS_WORKSPACE_MARKER_COMMAND = "rinemaca.previousWorkspaceMarker";
const VIEW_ID = "rinemacaMarkersView";

export function activate(context: vscode.ExtensionContext): void {
  const provider = new LineMarkerProvider();
  const refresh = (): void => {
    renderMarkersForVisibleEditors();
    provider.refresh();
  };

  context.subscriptions.push(
    ...initializeMarkers(context),
    vscode.window.registerTreeDataProvider(VIEW_ID, provider),
    vscode.commands.registerCommand(ADD_SESSION_COMMAND, async () => {
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
      const resolvedMarker = resolveMarker(target);
      if (!resolvedMarker) {
        return;
      }

      await revealMarker(resolvedMarker);
    }),
    vscode.commands.registerCommand(CLEAR_SESSION_COMMAND, async () => {
      await clearMarkers(context, "session");
      refresh();
    }),
    vscode.commands.registerCommand(CLEAR_WORKSPACE_COMMAND, async () => {
      await clearMarkers(context, "workspace");
      refresh();
    }),
    vscode.commands.registerCommand(EXPORT_SESSION_CSV_COMMAND, async () => {
      await exportMarkersToCsv("session");
    }),
    vscode.commands.registerCommand(EXPORT_WORKSPACE_CSV_COMMAND, async () => {
      await exportMarkersToCsv("workspace");
    }),
    vscode.commands.registerCommand(NEXT_MARKER_COMMAND, async () => {
      await revealRelativeMarker(1);
    }),
    vscode.commands.registerCommand(PREVIOUS_MARKER_COMMAND, async () => {
      await revealRelativeMarker(-1);
    }),
    vscode.commands.registerCommand(NEXT_SESSION_MARKER_COMMAND, async () => {
      await revealRelativeMarker(1, "session");
    }),
    vscode.commands.registerCommand(PREVIOUS_SESSION_MARKER_COMMAND, async () => {
      await revealRelativeMarker(-1, "session");
    }),
    vscode.commands.registerCommand(NEXT_WORKSPACE_MARKER_COMMAND, async () => {
      await revealRelativeMarker(1, "workspace");
    }),
    vscode.commands.registerCommand(PREVIOUS_WORKSPACE_MARKER_COMMAND, async () => {
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

function getActiveLineMarker() {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    return undefined;
  }

  const uri = editor.document.uri.toString();
  const line = editor.selection.active.line;
  return getMarkers().find((item) => item.uri === uri && item.line === line);
}

function resolveMarkerId(target: unknown): string | undefined {
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

function resolveMarker(target: unknown) {
  const markerId = resolveMarkerId(target);
  if (!markerId) {
    return undefined;
  }

  return findMarkerById(markerId);
}

async function revealRelativeMarker(direction: 1 | -1, scope?: MarkerScope): Promise<void> {
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

function getWrappedIndex(index: number, length: number): number {
  return ((index % length) + length) % length;
}

function getNearestMarkerIndex(
  markers: ReturnType<typeof getSortedUniqueMarkers>,
  activeUri: string | undefined,
  activeLine: number,
  direction: 1 | -1
): number {
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
