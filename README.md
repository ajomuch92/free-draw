# Free Draw

**English** · [Español](README.es.md)

A lightweight CorelDRAW clone built with Tauri + Vue 3 + Tailwind CSS v4. Vector drawing on native SVG, units in millimeters.

```bash
bun install
bun run dev          # browser at http://localhost:1420
bun run tauri dev    # desktop app
```

In the desktop app, open, save and export use the native Windows dialogs, and it warns before closing with unsaved changes; in the browser files are downloaded. **File** lists recently opened documents (desktop only). A document can have **multiple pages** (tabs below the canvas), with rulers, guides and a grid.

The interface is in **Spanish and English** (ES/EN selector in the menu bar; it starts in the system language). Strings live in `src/i18n.ts`: the Spanish text is the key, and `bun run check:i18n` fails if any of them is missing its translation.

**Rectangles** can have rounded corners, with one radius for all of them or a different one per corner (lock button in the property bar).

The **Shaping** operations (weld, trim, intersect, simplify, front/back minus) use [paper.js](http://paperjs.org) for the maths only and keep the curves. The target is the backmost object of the selection. **Dimensions** (parallel, horizontal/vertical, angular) snap to object nodes while drawing; **Break apart** (Ctrl+K) turns one into editable lines, arrowheads and text.

## Shortcuts (CorelDRAW style)

| Action | Key |
|---|---|
| Pick / toggle tool | Space |
| Freehand, Rectangle, Ellipse, Text | F5, F6, F7, F8 |
| Polygon, Zoom, Pan | Y, Z, H |
| Shape (edit nodes) | F10 |
| Shape: double-click a node / a segment | Delete node / add node |
| Shape: drag a segment | Bend it (straight lines become curves) |
| Convert to curves (text too, desktop only), Combine, Break apart (curves and dimensions) | Ctrl+Q, Ctrl+L, Ctrl+K |
| Group, Ungroup | Ctrl+G, Ctrl+U |
| Ctrl+click | Select an object inside a group |
| Align left, right, top, bottom | L, R, T, B |
| Align centers (same row / same column), center to page | E, C, P |
| Previous / next page | PgUp / PgDn |
| Drag from a ruler / drop onto it | Create guide / delete guide |
| Alt while moving | No snapping to guides, grid or objects |
| Snap to objects | Alt+Z |
| Click an already selected object | Toggle scale / rotate |
| Ctrl while drawing / moving / rotating | Square-circle / locked axis / 15° steps |
| Alt while scaling from a corner | Don't keep proportions |
| Shift while drawing or scaling | From the center |
| Palette: click / right click | Fill / outline |
| Palette: "+" / Shift+click a custom color | Add / remove custom color |
| Duplicate, Duplicate in place | Ctrl+D, + (numeric keypad) |
| Order | Ctrl/Shift + PgUp/PgDn |
| Zoom to objects / page | F4 / Shift+F4 |
| New, Open, Save, Save As, Import image, Export SVG | Ctrl+N, Ctrl+O, Ctrl+S, Ctrl+Shift+S, Ctrl+I, Ctrl+E |
