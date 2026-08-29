# Only Files 📂💗
<img src="https://raw.githubusercontent.com/maxoiduss/only-files/main/resources/banner.png" />

### 🚀 _Use only files that you really need!_

![vscode](https://img.shields.io/badge/VS%20Code-1.95+-blue) [![Version](https://vsmarketplacebadges.dev/version-short/maxoiduss.dark-synthwave.png)](https://marketplace.visualstudio.com/items?itemName=maxoiduss.dark-synthwave) ![github](https://img.shields.io/badge/github-only--files-purple?style=flat&logo=github&link=https%3A%2F%2Fgithub.com%2Fmaxoiduss%2Fonly-files)
##
#### Wasting too much time looking for a file or folder among a ton of files and directories? **Only Files** helps you work with only the ones you need right now.

<img src="https://raw.githubusercontent.com/maxoiduss/only-files/main/resources/difference.png" />

##
>#### ***Only Files** keeps your focus strictly on the files and folders you add to the view while preserving their original hierarchy. It automatically updates when you change the structure or manipulate files and it fully supports drag-n-drop.*
>#### 🎯 *It is the perfect choice if you want a clean productive environment that saves valuable screen space in VS Code.*

## What the extension can do?
### Only Files has **3** views you can manage:
  - #### **Folder** View: this *treeview* replicates the standard Explorer view but adds enhanced capabilities and a streamlined short context menu, also making project navigation much easier.
  - #### **Only** View: this *treeview* displays only the items you manually add to it. So it behaves like a container. It includes advanced features and turns it into a comfortable tool for managing your projects.
  - #### **Preview** View: a *webview* that lets you load and preview HTML, PDF, TXT, LOG and MD files. It fully supports zooming and drag-n-drop.

## ✨Key Features
### `Folder View`  (**FILES**)
<table width="100%" cellpadding="0" cellspacing="0">
  <tr>
    <td width="40%" valign="top">
    🔸Switching <u>ON</u> <b><i>use ignore-files</i></b> hides the folders and files listed in your chosen ignore-file.
    </td>
    <td valign="top" rowspan="3">
      <img src="https://raw.githubusercontent.com/maxoiduss/only-files/main/resources/folders.gif">
    </td>
  </tr>
  <tr>
    <td valign="top">
    🔸Switching <u>ON</u> <b><i>plain view</i></b> shows all folder and file names as paths relative to the workspace folder. Once <u>ON</u> you can <b><i>uncollapse</i></b> any folder.
    </td>
  </tr>
  <tr>
    <td valign="top">
    🔸<b><i>Uncollapsing all to plain view</i></b> switches <u>ON</u> <b><i>plain view</i></b>, displaying all files decoupled from their folders.
    </td>
  </tr>
</table>

### `Only Files View`  (**ONLY**)
<table width="100%" cellpadding="0" cellspacing="0">
  <tr>
    <td width="34%" valign="top">
    🔹Drag-n-drop or inline <b><i>Send to Only Files</i></b> sends an item or selected items with its content to this view from anywhere.
    </td>
    <td valign="top" rowspan="3">
      <img src="https://raw.githubusercontent.com/maxoiduss/only-files/main/resources/only.gif">
    </td>
  </tr>
  <tr>
    <td valign="top">
    🔹Drag-n-drop from this view or inline <b><i>Remove from Only Files</i></b> removes the item with its content from the view.
    </td>
  </tr>
  <tr>
    <td valign="top">
    🔹<b><i>Marked</i></b> items can be used anytime you want to collect them here.
    </td>
  </tr>
</table>

### `Preview View`
<table width="100%" cellpadding="0" cellspacing="0">
  <tr>
    <td width="36%" valign="top">
    <font size="1">♦️ </font>Drag-n-drop-with-Shift or inline <b><i>Preivew in Only Files</i></b> sends an item from <b><i>Only Files View</i></b> to be previewed.
    </td>
    <td valign="top" rowspan="3">
      <img src="https://raw.githubusercontent.com/maxoiduss/only-files/main/resources/preview.gif">
    </td>
  </tr>
  <tr>
    <td valign="top">
    <font size="1">♦️ </font><b><i>Preivew in Only Files</i></b> context menu item does the same from anywhere. The view keeps it state.
    </td>
  </tr>
  <tr>
    <td valign="top">
    <font size="1">♦️ </font>Holding Ctrl by using scroll changes zoom, holding Shift - scrolls horizontally. Context menu shows file name and options.
    </td>
  </tr>
</table>

### **Specs**
- #### All Built-in Explorer-like feautures, e.g. *rename*, *copy*, *delete*, *cut*, *paste* are supported in both treeviews.

- #### Rename file from the opened tab is supported.

- #### Context menu call on an empty Preview View suggests to open settings.

- #### Use commands:

  - Rename file/folder: `F2`
  - Rename opened file: `Shift+F2`
  - Send/Add from the Explorer, an editor tab, or a selected tree item:
    `Shift+Space`, then `C` (macOS: `Shift+Space`, then `C`)
  - Remove from an editor tab or selected tree item:
    `Shift+Space`, then `X` (macOS: `Shift+Space`, then `X`)
  - Preview the selected file or active editor:
    `Shift+Space`, then `V`
  - Refresh the `Files` view: `Shift+Space`, then `A`
  - Refresh the `Only Files` view: `Shift+Space`, then `Z`
  - Switch between classic and plain views: `Shift+Space` twice

## 📽️Demo
### How to use
```mermaid
flowchart TD
  Start([Install Only Files]) --> Workspace[Open one or more workspace folders]
  Workspace --> Explorer[Open the Only Files Explorer]
  Explorer --> FilesView[Files view<br/>Browse workspace folders and files]
  Explorer --> OnlyView[Only Files view<br/>Browse selected items]
  Explorer --> PreviewView[Preview view<br/>View supported files]

  FilesView --> Select[Select a file or folder]
  Select --> Add[Add to Only Files]
  Tab[Open editor tab] --> AddFromTab[Add active tab to Only Files]
  Command[Run Add shortcut<br/>Shift+Space, C] --> Add
  AddFromTab --> Add
  Add --> OnlyView

  OnlyView --> Open[Open a selected file]
  Open --> Edit[Edit in the VS Code editor]
  Open --> Preview[Show preview]
  Preview --> PreviewView

  OnlyView --> Remove[Remove from Only Files]
  Remove --> Keep[File remains on disk]

  Workspace --> Changes[Workspace changes]
  Changes --> Sync[Files and Only Files refresh automatically]
  Sync --> FilesView
  Sync --> OnlyView
```

### All-in-one
<img src="https://raw.githubusercontent.com/maxoiduss/only-files/main/resources/allin.gif" />

## 📑Menu
<table width="100%" cellpadding="0" cellspacing="0">
  <tr>
    <td>
      <img src="https://raw.githubusercontent.com/maxoiduss/only-files/main/resources/menu1.png" />
    </td>
    <td>
      <img src="https://raw.githubusercontent.com/maxoiduss/only-files/main/resources/menu2.png" />
    </td>
    <td>
      <img src="https://raw.githubusercontent.com/maxoiduss/only-files/main/resources/menu3.png" />
    </td>
  </tr>
</table>

## All Keyboard Shortcuts
#### The extension uses the following default shortcuts.
`Ctrl` is mapped to `Cmd` on macOS. **Send(Add)**/**Remove** chords intentionally use `Shift` on both platforms.

| Action | Windows/Linux | macOS |
| --- | --- | --- |
| Rename selected item | `F2` | `F2` |
| Rename active tab | `Shift+F2` | `Shift+F2` |
| Delete selected item | `Delete` | `Delete` |
| Permanently delete selected item | `Shift+Delete` | `Shift+Delete` |
| Copy selected item | `Ctrl+C` | `Cmd+C` |
| Cut selected item | `Ctrl+X` | `Cmd+X` |
| Paste into a view | `Ctrl+V` | `Cmd+V` |
| Copy file path | `Ctrl+Shift+C` | `Cmd+Shift+C` |
| Send item | `Shift+Space`, then `C` | `Shift+Space`, then `C` |
| Remove item | `Shift+Space`, then `X` | `Shift+Space`, then `X` |
| Preview item | `Shift+Space`, then `V` | `Shift+Space`, then `V` |
| Refresh `Files` | `Shift+Space`, then `A` | `Shift+Space`, then `A` |
| Refresh `Only Files` | `Shift+Space`, then `Z` | `Shift+Space`, then `Z` |
| Switch classic/plain mode | `Shift+Space` twice | `Shift+Space` twice |

All changes made in your workspace are reflected in the `Files` and `Only Files` views in real time 🚀
## License

MIT
