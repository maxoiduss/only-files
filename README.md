# Only Files 📂💗
<img src="https://raw.githubusercontent.com/maxoiduss/only-files/main/resources/banner.png" />

### 🗂️ _Use only files that you really need!_ 🗂️
##
#### Wasting too much time looking for a file or folder among a ton of files and directories? **Only Files** helps you work with only the ones you need right now.

<img src="https://raw.githubusercontent.com/maxoiduss/only-files/main/resources/FromThisToThis.png" />

>#### ***Only Files** focus you only on the files and folders you add to the view preserving the original files hierarchy, it reflects to the hierarchy changes and file manipulations and supports drag-n-drop.*
>#### *It is the best choice if you want to have a clean production environment look and strive to save the space to interact with in VS Code.*

## What the extension can do?
### Only Files has **3** views you can manage:
  - #### **Folder** View - the tree-view duplicates the Explorer view with enchanced abilities and short context menu. Using it can make navigation much easer.
  - #### **Only** View - the tree-view shows only the items you added to it. It supports several features making it an advanced tool to work with projects.
  - #### **Preview** View - the webview where you can load the content of *html*, *pdf*, *txt* and *md* files to preview it. Supports zooming and drag-n-drop.

## How does it work?
- Install the extension
- Open one or more folders in your workspace
- Open the Only Files Explorer
- Three views are available:
  - `Files` displays the folders and files discovered in your workspace
  - `Only Files` displays the files and folders you selected for quick access
  - `Preview` displays the selected file when its format is supported
- Add files to Only Files (review <a href="#addFiles">Add files section</a>):
  - In your explorer, right click on item and click on 'Add to Only Files'
- In the `Files` view, click the show icon to add the file to `Only Files`
- In an editor tab, right click the item and click on 'Add to Only Files'
- Use the add shortcut: `Ctrl+Space`, then `C` (`Ctrl+Space`, then `C` on macOS too)
- Open a file from `Only Files` to preview it or continue editing it
- Remove an item from the view with the hide icon or `Ctrl+Space`, then `X`; the file is not deleted
- ✨ Enjoy your files ✨

## Demo

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
  Command[Run Add shortcut<br/>Ctrl+Space, C] --> Add
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

<img src="https://raw.githubusercontent.com/maxoiduss/only-files/main/resources/example.gif" />

## Views

<img src="https://raw.githubusercontent.com/maxoiduss/only-files/main/resources/package-explorer.png" />

## <p id="addFiles">Add files</p>
Apart of using the icons, you have many options for add or remove files from Only Files View:

- Add files from Explorer

<img src="https://raw.githubusercontent.com/maxoiduss/only-files/main/resources/addFileFromExplorer.png"/>

- Select multiple files and select the menu (You can click on one icon too):

<img src="https://raw.githubusercontent.com/maxoiduss/only-files/main/resources/multipleFiles.png" width="50%" height="50%"/>

- From tab menu:

<img src="https://raw.githubusercontent.com/maxoiduss/only-files/main/resources/menu.png" width="50%" height="50%"/>

- Use commands:

  - Add from the Explorer, an editor tab, or a selected tree item:
    `Ctrl+Space`, then `C` (macOS: `Ctrl+Space`, then `C`)
  - Remove from an editor tab or selected tree item:
    `Ctrl+Space`, then `X` (macOS: `Ctrl+Space`, then `X`)
  - Preview the selected file or active editor:
    `Shift+Space`, then `V`
  - Refresh the `Files` view: `Shift+Space`, then `Z`
  - Refresh the `Only Files` view: `Shift+Space`, then `X`
  - Switch between classic and plain views: `Shift+Z`

## Keyboard shortcuts

The extension uses the following default shortcuts. `Ctrl` is mapped to `Cmd` on macOS
where configured in `package.json`; the add/remove chords intentionally use `Ctrl`
on both platforms.

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
| Add item | `Ctrl+Space`, then `C` | `Ctrl+Space`, then `C` |
| Remove item | `Ctrl+Space`, then `X` | `Ctrl+Space`, then `X` |
| Preview item | `Shift+Space`, then `V` | `Shift+Space`, then `V` |
| Refresh `Files` | `Shift+Space`, then `Z` | `Shift+Space`, then `Z` |
| Refresh `Only Files` | `Shift+Space`, then `X` | `Shift+Space`, then `X` |
| Switch classic/plain mode | `Shift+Z` | `Shift+Z` |

All changes made in your workspace are reflected in the `Files` and `Only Files` views in real time 🚀
## License

MIT
