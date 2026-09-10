# Tilemap Editor

A browser-based tile map editor for building game levels. Vanilla JavaScript and HTML5 Canvas, no build step.

## Features

- **Layers**: background, middle, foreground and up to 10 in all, with the other layers faded while you draw
- **Tools**: pencil, eraser, fill, fill erase, row fill, column fill. Fill replaces a connected run of the same tile, or floods an empty area
- **Custom tilesets**: paste an image URL or choose an image file; the palette zooms so small tiles stay pickable
- **Map and tile size** changes keep every tile on its grid cell
- **Zoom and pan**: wheel zooms toward the pointer (25% to 400%), Space+drag or middle-drag pans
- **Undo and redo** across drawing, layer changes, resizes and tileset swaps
- **Hover preview**: a ghost of the picked tile shows where it will land
- **Solid cells**: mark walls the game should not let the player through, saved with the map
- **Layers** can be hidden and named
- **Export**: the project as a JSON file, any set of layers as a transparent PNG, or a GameBuilder project

## Getting Started

Open `index.html` in a browser. The editor starts with a 50 x 30 grid of 16 px tiles and a three-tile sample tileset.

### Loading a Custom Tileset

1. File, then **Change Tileset...**
2. Paste the URL of a tileset PNG, or click **Choose an image...**
3. Set the tile size under Edit, then **Tile Size...** to match the image

Click a tile in the palette on the right, then draw on the map.

### Project Files

**Save** (Ctrl+S) downloads `tilemap-project.json`; **Open Project File...** loads one back. The file holds the
tileset URL and the level text:

```js
levels[1] = [[cellSize, 0, width, height], [layer, layer, ...], [collisions], [objects]];
```

Each layer is a list of `[tileIndex, gridX, gridY]`. Tile indexes count across the tileset image left to right, top to
bottom, at the current tile size.

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| P, E, F, X, R, C | Pencil, Eraser, Fill, Fill Erase, Row Fill, Column Fill |
| 1 to 9 | Switch layer |
| S | Solid |
| G | Show or hide the grid |
| H | Hide or show the current layer |
| + / - / 0 | Zoom in, zoom out, reset to 100% |
| Space + drag | Pan |
| Ctrl+Z / Ctrl+Y | Undo / Redo |
| Ctrl+S | Save |
| Esc | Close menus and dialogs |
| Right click | Erase |

## Embedding

The page is self-contained. A host that stores projects itself can listen for cancelable events on `window`
and call `preventDefault()` to take them over:

- `tilemapeditor:save` with `detail.data`, the project JSON string
- `tilemapeditor:exportImage` with `detail.dataUrl` and `detail.filename`
- `tilemapeditor:pickTileset` with `detail.library` (true for "Browse the library"), after which the host calls
  `applyTilesetUrl(url)`
- `tilemapeditor:exportToGameBuilder` with `detail.projectData`, a GameBuilder project (save format 3.1) whose
  first level is the map: layer 1 as terrain, other visible layers flattened to decoration, solid cells voting on
  which terrain tiles collide
- `tilemapeditor:hello`, sent once at startup with `detail.features`; a host that cancels it and pushes
  `'library'` or `'gamebuilder'` into the array unhides the matching buttons and menu items

`window.serializeProjectData()` and `window.loadProjectData(json)` round-trip the whole project.

## Project Structure

```
index.html       # UI, styles, menus, dialogs, status bar
js/main.js       # Editor engine: canvas, tools, history, save format
js/utils.js      # Startup
res/tileset.png  # Sample tileset
icon.svg         # App icon
```

## License

GNU General Public License v3.0, see [LICENSE](LICENSE).
