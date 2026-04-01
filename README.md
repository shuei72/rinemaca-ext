# Rinemaca

VS Code extension for whole-line marking.

## Features

- Mark the current line, or all selected lines, across the full editor width
- Session markers are available only for the current VS Code session
- Workspace markers are saved in workspace state and restored when the workspace is reopened
- Show markers in the `Rinemaca` sidebar
- Export session markers and workspace markers to CSV

## Commands

- `Rinemaca: Add Session Marker`
- `Rinemaca: Add Workspace Marker`
- `Rinemaca: Toggle Session Marker`
- `Rinemaca: Toggle Workspace Marker`
- `Rinemaca: Remove Marker`
- `Rinemaca: Clear Session Markers`
- `Rinemaca: Clear Workspace Markers`
- `Rinemaca: Export Session Markers`
- `Rinemaca: Export Workspace Markers`
- `Rinemaca: Next Marker`
- `Rinemaca: Previous Marker`
- `Rinemaca: Next Session Marker`
- `Rinemaca: Previous Session Marker`
- `Rinemaca: Next Workspace Marker`
- `Rinemaca: Previous Workspace Marker`

## Editor Context Menu

The editor right-click menu groups commands under a `Rinemaca` submenu.

Available actions:

- `Toggle Session Marker`
- `Toggle Workspace Marker`

## Sidebar

The `Rinemaca` sidebar shows two sections:

- `Session Markers`
- `Workspace Markers`

Clicking a marker jumps to that file and line.

The sidebar title buttons provide:

- `Clear Session Markers`
- `Clear Workspace Markers`
- `Export Session Markers`
- `Export Workspace Markers`

## CSV Export

Session markers and workspace markers can be exported separately to CSV.

Format:

- Header: `File,Line,Text`
- Tabs in the text are replaced with two spaces
- Leading tabs and spaces are removed from the text
- Files are written as UTF-8 with BOM

## Notes

- Session markers live only until VS Code reloads.
- Workspace markers are stored per workspace using VS Code workspace state.
- If you select multiple lines, each selected line is registered as a marker.
- `Toggle Session Marker` adds or removes session markers only.
- `Toggle Workspace Marker` adds or removes workspace markers only.
- Removing a marker removes both the session marker and workspace marker at the same file and line, if both exist.

## Development

### PowerShell

```powershell
npm.cmd install
npm.cmd run compile
```

### Command Prompt

```cmd
npm install
npm run compile
```

Press `F5` to launch an Extension Development Host for testing.

To build a VSIX package:

```powershell
npm.cmd run package
```

## License

MIT
