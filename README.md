# Tilemap Editor

A browser-based tile map editor for building game levels. Built with vanilla JavaScript and HTML5 Canvas.

## Features

- **Multi-layer editing** — Background, middle, foreground, and custom layers (up to 10)
- **Drawing tools** — Pencil, eraser, flood fill, fill erase, row fill, column fill
- **Custom tilesets** — Load any tileset image via URL
- **Zoom & pan** — Mouse wheel zoom (25%–400%), middle-click panning
- **Undo/redo** — Full history with Ctrl+Z / Ctrl+Y
- **Collision & object layers** — Place collision blocks and named objects
- **Grid toggle** — Show/hide grid, layer transparency controls
- **Export** — Save map data as structured level arrays, export layers as PNG
- **Keyboard shortcuts** — Tool selection (P/E/F/X/R/C), layer switching (1–9)

## Getting Started

Open `index.html` in a browser. The editor loads with a default 50x30 tile grid and a basic tileset.

### Loading a Custom Tileset

1. Go to **File > Change Tileset**
2. Enter the URL of your tileset PNG
3. Click **Apply**

The tileset appears in the right sidebar. Click tiles to select them, then draw on the canvas.

### Map Data Format

Maps are stored as JavaScript arrays:

```js
var levels = [[[cellSize, 0, width, height], [tiles...], [collisions...], [objects...]]];
```

Each tile entry is `[tileIndex, gridX, gridY]`.

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| P | Pencil tool |
| E | Eraser tool |
| F | Flood fill |
| X | Fill erase |
| R | Row fill |
| C | Column fill |
| 1–9 | Switch layer |
| Ctrl+Z | Undo |
| Ctrl+Y | Redo |
| Ctrl+S | Save |
| Mouse wheel | Zoom in/out |
| Middle click + drag | Pan |
| Right click | Quick erase |

## Project Structure

```
├── index.html       # Main application (UI, CSS, menu system)
├── js/
│   ├── main.js      # Core editor engine (canvas, tools, save/load)
│   ├── inputs.js    # Mouse and keyboard input handling
│   ├── resources.js # Image and audio resource loader
│   └── utils.js     # Utility functions
├── res/
│   ├── tileset.png  # Default tileset
│   └── logo.png     # App logo
└── icon.svg         # App icon
```

## License

This project is licensed under the GNU General Public License v3.0 — see the [LICENSE](LICENSE) file for details.
