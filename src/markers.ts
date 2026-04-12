import * as vscode from "vscode";

export type MarkerScope = "session" | "workspace";

export type LineMarker = {
  id: string;
  scope: MarkerScope;
  uri: string;
  line: number;
  createdAt: number;
};

const WORKSPACE_STATE_KEY = "rinemaka.workspaceLineMarkers";

let sessionMarkers: LineMarker[] = [];
let workspaceMarkers: LineMarker[] = [];
let sessionDecorationType: vscode.TextEditorDecorationType | undefined;
let workspaceDecorationType: vscode.TextEditorDecorationType | undefined;

export function initializeMarkers(context: vscode.ExtensionContext): vscode.Disposable[] {
  // Load persisted workspace markers once, then paint markers for anything already open.
  workspaceMarkers = normalizeMarkers(
    context.workspaceState.get<LineMarker[]>(WORKSPACE_STATE_KEY, []).map((entry) => ({
      ...entry,
      scope: "workspace" as const
    }))
  );
  sessionMarkers = [];

  recreateDecorationTypes();
  renderMarkersForVisibleEditors();

  return [
    vscode.workspace.onDidChangeTextDocument(() => {
      renderMarkersForVisibleEditors();
    }),
    vscode.window.onDidChangeVisibleTextEditors(() => {
      renderMarkersForVisibleEditors();
    }),
    vscode.workspace.onDidCloseTextDocument(() => {
      renderMarkersForVisibleEditors();
    }),
    vscode.workspace.onDidRenameFiles(async (event) => {
      // Keep stored marker URIs in sync when files are renamed.
      const renameMap = new Map(event.files.map((item) => [item.oldUri.toString(), item.newUri.toString()]));
      let changed = false;

      const rewrite = (items: LineMarker[]): LineMarker[] =>
        items.map((item) => {
          const nextUri = renameMap.get(item.uri);
          if (!nextUri) {
            return item;
          }

          changed = true;
          return {
            ...item,
            uri: nextUri
          };
        });

      sessionMarkers = rewrite(sessionMarkers);
      workspaceMarkers = rewrite(workspaceMarkers);

      if (changed) {
        await saveWorkspaceMarkers(context);
        renderMarkersForVisibleEditors();
      }
    }),
    vscode.workspace.onDidDeleteFiles(async (event) => {
      // Drop markers that point at files that no longer exist.
      const deleted = new Set(event.files.map((item) => item.toString()));
      const nextSession = sessionMarkers.filter((item) => !deleted.has(item.uri));
      const nextWorkspace = workspaceMarkers.filter((item) => !deleted.has(item.uri));

      if (nextSession.length === sessionMarkers.length && nextWorkspace.length === workspaceMarkers.length) {
        return;
      }

      sessionMarkers = nextSession;
      workspaceMarkers = nextWorkspace;
      await saveWorkspaceMarkers(context);
      renderMarkersForVisibleEditors();
    }),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (!event.affectsConfiguration("rinemaka")) {
        return;
      }

      recreateDecorationTypes();
      renderMarkersForVisibleEditors();
    }),
    vscode.window.onDidChangeActiveColorTheme(() => {
      recreateDecorationTypes();
      renderMarkersForVisibleEditors();
    }),
    {
      dispose: () => {
        disposeDecorationTypes();
      }
    }
  ];
}

export function getMarkers(scope?: MarkerScope): LineMarker[] {
  if (scope === "session") {
    return [...sessionMarkers];
  }

  if (scope === "workspace") {
    return [...workspaceMarkers];
  }

  return [...sessionMarkers, ...workspaceMarkers];
}

export function getSortedUniqueMarkers(scope?: MarkerScope): LineMarker[] {
  const unique = new Map<string, LineMarker>();

  for (const marker of getMarkers(scope)) {
    const key = `${marker.uri}:${marker.line}`;
    if (!unique.has(key)) {
      unique.set(key, marker);
    }
  }

  return sortMarkers([...unique.values()]);
}

export async function exportMarkersToCsv(scope: MarkerScope): Promise<boolean> {
  // Export the current marker set as a simple CSV file for external tools.
  const markers = getMarkers(scope);
  if (markers.length === 0) {
    vscode.window.showInformationMessage(`There are no ${scope} markers to export.`);
    return false;
  }

  const defaultUri = getDefaultCsvUri(scope);
  const targetUri = await vscode.window.showSaveDialog({
    defaultUri,
    filters: {
      "CSV Files": ["csv"]
    },
    saveLabel: `Export ${scope === "session" ? "Session" : "Workspace"} Markers`
  });
  if (!targetUri) {
    return false;
  }

  const lines = ["File,Line,Text"];
  for (const marker of markers) {
    lines.push(await buildCsvRow(marker));
  }

  const content = `${lines.join("\r\n")}\r\n`;
  await vscode.workspace.fs.writeFile(targetUri, Buffer.from(`\uFEFF${content}`, "utf8"));
  vscode.window.showInformationMessage(`Exported ${markers.length} ${scope} markers to CSV.`);
  return true;
}

export async function addMarkersForSelection(
  context: vscode.ExtensionContext,
  editor: vscode.TextEditor,
  scope: MarkerScope
): Promise<LineMarker[]> {
  // Turn the current selection into one marker per line, skipping duplicates.
  const targetLines = collectTargetLines(editor);
  const targetUri = editor.document.uri.toString();
  const store = scope === "session" ? sessionMarkers : workspaceMarkers;
  const created: LineMarker[] = [];

  for (const line of targetLines) {
    const candidate: LineMarker = {
      id: createMarkerId(targetUri, line, scope),
      scope,
      uri: targetUri,
      line,
      createdAt: Date.now()
    };

    if (store.some((item) => item.id === candidate.id)) {
      continue;
    }

    store.push(candidate);
    created.push(candidate);
  }

  sortMarkers(store);

  if (scope === "workspace") {
    await saveWorkspaceMarkers(context);
  }

  renderMarkersForVisibleEditors();
  return created;
}

export async function toggleMarkersForSelection(
  context: vscode.ExtensionContext,
  editor: vscode.TextEditor,
  scope: MarkerScope
): Promise<{ added: LineMarker[]; removed: number }> {
  // Toggle each selected line independently so mixed add/remove selections work naturally.
  const targetLines = collectTargetLines(editor);
  const targetUri = editor.document.uri.toString();
  const store = scope === "session" ? sessionMarkers : workspaceMarkers;
  const added: LineMarker[] = [];
  let removed = 0;

  for (const line of targetLines) {
    const markerId = createMarkerId(targetUri, line, scope);
    const index = store.findIndex((item) => item.id === markerId);

    if (index >= 0) {
      store.splice(index, 1);
      removed += 1;
      continue;
    }

    const candidate: LineMarker = {
      id: markerId,
      scope,
      uri: targetUri,
      line,
      createdAt: Date.now()
    };

    store.push(candidate);
    added.push(candidate);
  }

  sortMarkers(store);

  if (scope === "workspace") {
    await saveWorkspaceMarkers(context);
  }

  renderMarkersForVisibleEditors();
  return { added, removed };
}

export async function removeMarkerById(context: vscode.ExtensionContext, id: string): Promise<boolean> {
  // Try session markers first, then workspace markers.
  const nextSession = sessionMarkers.filter((item) => item.id !== id);
  if (nextSession.length !== sessionMarkers.length) {
    sessionMarkers = nextSession;
    renderMarkersForVisibleEditors();
    return true;
  }

  const nextWorkspace = workspaceMarkers.filter((item) => item.id !== id);
  if (nextWorkspace.length !== workspaceMarkers.length) {
    workspaceMarkers = nextWorkspace;
    await saveWorkspaceMarkers(context);
    renderMarkersForVisibleEditors();
    return true;
  }

  return false;
}

export async function removeMarkersAtLocation(
  context: vscode.ExtensionContext,
  uri: string,
  line: number
): Promise<boolean> {
  // Remove any marker that points at the requested file line.
  const nextSession = sessionMarkers.filter((item) => !(item.uri === uri && item.line === line));
  const nextWorkspace = workspaceMarkers.filter((item) => !(item.uri === uri && item.line === line));
  const changed =
    nextSession.length !== sessionMarkers.length ||
    nextWorkspace.length !== workspaceMarkers.length;

  if (!changed) {
    return false;
  }

  sessionMarkers = nextSession;
  workspaceMarkers = nextWorkspace;
  await saveWorkspaceMarkers(context);
  renderMarkersForVisibleEditors();
  return true;
}

export async function clearMarkers(context: vscode.ExtensionContext, scope: MarkerScope): Promise<void> {
  // Clear only the requested marker scope so session and workspace state stay independent.
  if (scope === "session") {
    sessionMarkers = [];
    renderMarkersForVisibleEditors();
    return;
  }

  workspaceMarkers = [];
  await saveWorkspaceMarkers(context);
  renderMarkersForVisibleEditors();
}

export function findMarkerById(id: string): LineMarker | undefined {
  return getMarkers().find((item) => item.id === id);
}

export async function revealMarker(marker: LineMarker): Promise<void> {
  // Open the target file, move the cursor to the marker, and center it in view.
  const uri = vscode.Uri.parse(marker.uri);
  const document = await vscode.workspace.openTextDocument(uri);
  const editor = await vscode.window.showTextDocument(document, { preview: false });
  const targetLine = Math.min(marker.line, Math.max(document.lineCount - 1, 0));
  const lineRange = document.lineAt(targetLine).range;
  editor.selection = new vscode.Selection(lineRange.start, lineRange.start);
  editor.revealRange(lineRange, vscode.TextEditorRevealType.InCenter);
}

export function renderMarkersForVisibleEditors(): void {
  // Refresh every visible editor whenever marker data changes.
  for (const editor of vscode.window.visibleTextEditors) {
    renderMarkersForEditor(editor);
  }
}

export function getMarkerPreview(marker: LineMarker): string {
  const document = vscode.workspace.textDocuments.find((item) => item.uri.toString() === marker.uri);
  if (!document) {
    return "(file not open)";
  }

  if (marker.line < 0 || marker.line >= document.lineCount) {
    return "(line unavailable)";
  }

  return document.lineAt(marker.line).text.trim() || "(blank line)";
}

export function getMarkerLocationLabel(marker: LineMarker): string {
  const uri = vscode.Uri.parse(marker.uri);
  return `${vscode.workspace.asRelativePath(uri, false)}:${marker.line + 1}`;
}

export function getMarkerDisplayLabel(marker: LineMarker): string {
  return `${marker.line + 1}: ${getMarkerPreview(marker)}`;
}

export function getMarkerFileGroupLabel(marker: LineMarker): string {
  return getCondensedRelativePath(marker);
}

function renderMarkersForEditor(editor: vscode.TextEditor): void {
  // Apply line decorations only to markers that belong to the current document.
  const uri = editor.document.uri.toString();
  const sessionRanges = sessionMarkers
    .filter((item) => item.uri === uri && item.line < editor.document.lineCount)
    .map((item) => editor.document.lineAt(item.line).range);
  const workspaceRanges = workspaceMarkers
    .filter((item) => item.uri === uri && item.line < editor.document.lineCount)
    .map((item) => editor.document.lineAt(item.line).range);

  if (sessionDecorationType) {
    editor.setDecorations(sessionDecorationType, sessionRanges);
  }

  if (workspaceDecorationType) {
    editor.setDecorations(workspaceDecorationType, workspaceRanges);
  }
}

function recreateDecorationTypes(): void {
  // Recreate decorations when settings or theme changes so colors stay in sync.
  disposeDecorationTypes();

  const configuration = vscode.workspace.getConfiguration("rinemaka");
  sessionDecorationType = vscode.window.createTextEditorDecorationType({
    isWholeLine: true,
    backgroundColor: configuration.get<string>("sessionMarkerBackground", "rgba(255, 215, 0, 0.22)"),
    borderWidth: "0 0 0 2px",
    borderStyle: "solid",
    borderColor: configuration.get<string>("sessionMarkerBorder", "rgba(255, 215, 0, 0.85)"),
    overviewRulerColor: configuration.get<string>("sessionMarkerOverviewRuler", "rgba(255, 215, 0, 0.9)")
  });
  workspaceDecorationType = vscode.window.createTextEditorDecorationType({
    isWholeLine: true,
    backgroundColor: configuration.get<string>("workspaceMarkerBackground", "rgba(64, 156, 255, 0.18)"),
    borderWidth: "0 0 0 2px",
    borderStyle: "solid",
    borderColor: configuration.get<string>("workspaceMarkerBorder", "rgba(64, 156, 255, 0.85)"),
    overviewRulerColor: configuration.get<string>("workspaceMarkerOverviewRuler", "rgba(64, 156, 255, 0.9)")
  });
}

function disposeDecorationTypes(): void {
  sessionDecorationType?.dispose();
  workspaceDecorationType?.dispose();
  sessionDecorationType = undefined;
  workspaceDecorationType = undefined;
}

function collectTargetLines(editor: vscode.TextEditor): number[] {
  // Expand selections to full covered lines before creating markers.
  const lines = new Set<number>();

  for (const selection of editor.selections) {
    const startLine = selection.start.line;
    const endLine = selection.isEmpty ? selection.active.line : selection.end.character === 0 ? Math.max(selection.end.line - 1, startLine) : selection.end.line;

    for (let line = startLine; line <= endLine; line += 1) {
      lines.add(line);
    }
  }

  return [...lines].sort((left, right) => left - right);
}

function normalizeMarkers(items: LineMarker[]): LineMarker[] {
  // Filter out malformed data and dedupe on the generated marker id.
  const unique = new Map<string, LineMarker>();

  for (const item of items) {
    if (!item || typeof item.uri !== "string" || typeof item.line !== "number") {
      continue;
    }

    const scope = item.scope === "session" ? "session" : "workspace";
    const normalized: LineMarker = {
      id: item.id || createMarkerId(item.uri, item.line, scope),
      scope,
      uri: item.uri,
      line: item.line,
      createdAt: typeof item.createdAt === "number" ? item.createdAt : Date.now()
    };
    unique.set(normalized.id, normalized);
  }

  return sortMarkers([...unique.values()]);
}

function sortMarkers<T extends LineMarker[]>(items: T): T {
  // Keep markers ordered by file path and then by line number.
  items.sort((left, right) => {
    if (left.uri !== right.uri) {
      return left.uri.localeCompare(right.uri);
    }

    return left.line - right.line;
  });

  return items;
}

function createMarkerId(uri: string, line: number, scope: MarkerScope): string {
  return `${scope}:${uri}:${line}`;
}

async function saveWorkspaceMarkers(context: vscode.ExtensionContext): Promise<void> {
  // Persist workspace markers only; session markers stay in memory.
  await context.workspaceState.update(WORKSPACE_STATE_KEY, workspaceMarkers.map((item) => ({
    id: item.id,
    scope: "workspace" as const,
    uri: item.uri,
    line: item.line,
    createdAt: item.createdAt
  })));
}

async function buildCsvRow(marker: LineMarker): Promise<string> {
  // Read the file line so the export includes the actual marker text.
  const document = await vscode.workspace.openTextDocument(vscode.Uri.parse(marker.uri));
  const lineNumber = Math.min(marker.line, Math.max(document.lineCount - 1, 0));
  const filePath = toCsvField(getMarkerFilePath(marker));
  const displayLineNumber = toCsvField(String(lineNumber + 1));
  const lineText = toCsvField(normalizeMarkerLineText(document.lineAt(lineNumber).text));
  return `${filePath},${displayLineNumber},${lineText}`;
}

function getDefaultCsvUri(scope: MarkerScope): vscode.Uri {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  const fileName = scope === "session" ? "session-markers.csv" : "workspace-markers.csv";

  if (workspaceFolder) {
    return vscode.Uri.joinPath(workspaceFolder.uri, fileName);
  }

  return vscode.Uri.file(fileName);
}

function getMarkerFilePath(marker: LineMarker): string {
  const uri = vscode.Uri.parse(marker.uri);
  return uri.scheme === "file" ? uri.fsPath : uri.toString();
}

function getCondensedRelativePath(marker: LineMarker): string {
  // Shorten long paths so the tree view stays readable.
  const uri = vscode.Uri.parse(marker.uri);
  const relativePath = vscode.workspace.asRelativePath(uri, false);
  const segments = relativePath.split(/[\\/]+/u).filter(Boolean);

  if (segments.length <= 2) {
    return segments.join("/");
  }

  return segments.slice(-2).join("/");
}

function normalizeMarkerLineText(value: string): string {
  return value.replace(/\t/g, "  ").replace(/^[ \t]+/u, "");
}

function toCsvField(value: string): string {
  const escaped = value.replace(/"/g, """");
  return `"${escaped}"`;
}
