import * as vscode from "vscode";

import {
  MarkerScope,
  LineMarker,
  getMarkerDisplayLabel,
  getMarkerFileGroupLabel,
  getMarkerLocationLabel,
  getMarkerPreview,
  getMarkers
} from "./markers";

type TreeNode =
  | { kind: "section"; scope: MarkerScope; label: string }
  | { kind: "file"; scope: MarkerScope; uri: string; label: string }
  | { kind: "marker"; marker: LineMarker };

export class LineMarkerProvider implements vscode.TreeDataProvider<TreeNode> {
  private readonly onDidChangeTreeDataEmitter = new vscode.EventEmitter<TreeNode | undefined | null | void>();

  readonly onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event;

  refresh(): void {
    this.onDidChangeTreeDataEmitter.fire();
  }

  getTreeItem(element: TreeNode): vscode.TreeItem {
    if (element.kind === "section") {
      const item = new vscode.TreeItem(element.label, vscode.TreeItemCollapsibleState.Expanded);
      item.contextValue = element.scope === "session" ? "rinemakaSessionSection" : "rinemakaWorkspaceSection";
      return item;
    }

    if (element.kind === "file") {
      const item = new vscode.TreeItem(element.label, vscode.TreeItemCollapsibleState.Expanded);
      item.resourceUri = vscode.Uri.parse(element.uri);
      return item;
    }

    const preview = getMarkerPreview(element.marker);
    const item = new vscode.TreeItem(getMarkerDisplayLabel(element.marker), vscode.TreeItemCollapsibleState.None);
    item.tooltip = new vscode.MarkdownString(
      `**${getMarkerLocationLabel(element.marker)}**\n\n${escapeMarkdown(preview)}`
    );
    item.contextValue = element.marker.scope === "session" ? "rinemakaSessionMarker" : "rinemakaWorkspaceMarker";
    item.command = {
      command: "rinemaka.openMarker",
      title: "Open Marker",
      arguments: [element.marker.id]
    };
    item.resourceUri = vscode.Uri.parse(element.marker.uri);
    return item;
  }

  getChildren(element?: TreeNode): Thenable<TreeNode[]> {
    if (!element) {
      return Promise.resolve([
        { kind: "section", scope: "session", label: "Session Markers" },
        { kind: "section", scope: "workspace", label: "Workspace Markers" }
      ]);
    }

    if (element.kind === "section") {
      const fileNodes = new Map<string, TreeNode>();
      for (const marker of getMarkers(element.scope)) {
        if (!fileNodes.has(marker.uri)) {
          fileNodes.set(marker.uri, {
            kind: "file",
            scope: element.scope,
            uri: marker.uri,
            label: getMarkerFileGroupLabel(marker)
          });
        }
      }

      return Promise.resolve([...fileNodes.values()]);
    }

    if (element.kind === "file") {
      return Promise.resolve(
        getMarkers(element.scope)
          .filter((marker) => marker.uri === element.uri)
          .map((marker) => ({ kind: "marker" as const, marker }))
      );
    }

    return Promise.resolve([]);
  }
}

function escapeMarkdown(value: string): string {
  return value.replace(/[\\`*_{}[\]()#+\-.!]/g, "\\$&");
}

