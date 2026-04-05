# Rinemaka

Rinemakaは、行マーカーをセッション単位またはワークスペース単位で管理できるVS Code拡張機能です。  
サイドバーでマーカーの一覧表示とCSV出力ができます。

## コマンド
<!-- コマンド行の最後には空白を2ついれること -->

`Rinemaka: Add Session Marker`  
選択行をセッションマーカーとして追加します。

`Rinemaka: Add Workspace Marker`  
選択行をワークスペースマーカーとして追加します。

`Rinemaka: Toggle Session Marker`  
選択行のセッションマーカーを追加または削除します。

`Rinemaka: Toggle Workspace Marker`  
選択行のワークスペースマーカーを追加または削除します。

`Rinemaka: Remove Marker`  
選択行のマーカーを削除します。

`Rinemaka: Clear Session Markers`  
セッションマーカーをすべて削除します。

`Rinemaka: Clear Workspace Markers`  
ワークスペースマーカーをすべて削除します。

`Rinemaka: Export Session Markers`  
セッションマーカーをCSVに出力します。

`Rinemaka: Export Workspace Markers`  
ワークスペースマーカーをCSVに出力します。

`Rinemaka: Next Marker`  
セッションマーカーとワークスペースマーカーの両方を対象に、次のマーカーへ移動します。

`Rinemaka: Previous Marker`  
セッションマーカーとワークスペースマーカーの両方を対象に、前のマーカーへ移動します。

`Rinemaka: Next Session Marker`  
次のセッションマーカーへ移動します。

`Rinemaka: Previous Session Marker`  
前のセッションマーカーへ移動します。

`Rinemaka: Next Workspace Marker`  
次のワークスペースマーカーへ移動します。

`Rinemaka: Previous Workspace Marker`  
前のワークスペースマーカーへ移動します。

## 特徴

- 行全体にマーカーを付けてブックマークのように使えます。
- スクロールバー上にもマーカーが反映されます。
- セッション専用とワークスペース保存の2種類を使い分けられます。
- サイドバーから一覧表示とジャンプができます。
- マーカー一覧はCSVとして書き出せます。

### SessionとWorkspaceの違い

| 種類 | 用途 |
| --- | --- |
| Session | VS Codeを開いている間だけ使う一時的なマーカー |
| Workspace | ワークスペースに保存して、再起動後も確認可能なマーカー |

## サイドバー

- サイドバーに`Rinemaka`を追加します。
- サイドバーには`Session Markers`と`Workspace Markers`の2つに分けてマーカー一覧を表示します。

## 設定

マーカーの色を`rgba(R, G, B, A)`形式で指定します。オーバービューに設定した色はスクロールバーに反映されます。

`rinemaka.sessionMarkerBackground`  
セッションマーカーの背景色  

`rinemaka.sessionMarkerBorder`  
セッションマーカーの枠線色

`rinemaka.sessionMarkerOverviewRuler`  
セッションマーカーのオーバービュー色

`rinemaka.workspaceMarkerBackground`  
ワークスペースマーカーの背景色

`rinemaka.workspaceMarkerBorder`  
ワークスペースマーカーの枠線色

`rinemaka.workspaceMarkerOverviewRuler`  
ワークスペースマーカーのオーバービュー色

## デフォルト値

```json
{
  "rinemaka.sessionMarkerBackground": "rgba(255, 215, 0, 0.22)",
  "rinemaka.sessionMarkerBorder": "rgba(255, 215, 0, 0.85)",
  "rinemaka.sessionMarkerOverviewRuler": "rgba(255, 215, 0, 0.9)",
  "rinemaka.workspaceMarkerBackground": "rgba(64, 156, 255, 0.18)",
  "rinemaka.workspaceMarkerBorder": "rgba(64, 156, 255, 0.85)",
  "rinemaka.workspaceMarkerOverviewRuler": "rgba(64, 156, 255, 0.9)"
}
```

## 開発用

### PowerShell

```powershell
npm.cmd install
npm.cmd run compile
npm.cmd run package
```

### Command Prompt

```cmd
npm install
npm run compile
npm run package
```

## その他

- この拡張機能の作成にはCodexを利用しています。

## ライセンス

MIT License

