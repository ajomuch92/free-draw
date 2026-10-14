import { reactive, computed } from "vue";

// World units are millimetres. Shapes live in their own bbox (x, y, w, h) and
// rotate around its centre; point lists are normalised to 0..1 inside the bbox.

export type Tool = "pick" | "freehand" | "line" | "rect" | "ellipse" | "polygon" | "text" | "zoom" | "pan";
export type ShapeType = "rect" | "ellipse" | "polygon" | "line" | "freehand" | "text";
export type Dash = "solid" | "dash" | "dot";
export type P = { x: number; y: number };

export interface Style {
  fill: string; // css colour or "none"
  stroke: string;
  strokeWidth: number;
  dash: Dash;
  opacity: number;
}

export interface Shape extends Style {
  id: string;
  type: ShapeType;
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number; // degrees, clockwise (SVG)
  flipX: boolean;
  flipY: boolean;
  visible: boolean;
  locked: boolean;
  radius?: number;
  sides?: number;
  points?: [number, number][];
  text?: string;
  fontSize?: number; // mm
  fontFamily?: string;
  natW?: number; // unscaled text size, used to stretch text to its bbox
  natH?: number;
}

export interface Frame {
  cx: number;
  cy: number;
  w: number;
  h: number;
  rotation: number;
}

export const PT = 0.3528; // mm per point
export const PAGE_SIZES: Record<string, [number, number]> = {
  A4: [210, 297],
  A3: [297, 420],
  A5: [148, 210],
  Carta: [215.9, 279.4],
  Oficio: [215.9, 355.6],
};
export const FONTS = ["Arial", "Times New Roman", "Courier New", "Georgia", "Verdana", "Segoe UI", "Impact"];
export const TYPE_NAMES: Record<ShapeType, string> = {
  rect: "Rectángulo",
  ellipse: "Elipse",
  polygon: "Polígono",
  line: "Línea",
  freehand: "Curva",
  text: "Texto artístico",
};

export const state = reactive({
  shapes: [] as Shape[],
  selection: [] as string[],
  tool: "pick" as Tool,
  lastTool: "rect" as Tool,
  rotateMode: false,
  editingText: null as string | null,
  defaults: { fill: "none", stroke: "#000000", strokeWidth: 0.2, dash: "solid", opacity: 1 } as Style,
  textDefaults: { fontFamily: "Arial", fontSize: 24 * PT },
  page: { size: "A4", w: 210, h: 297 },
  zoom: 2, // screen px per mm
  panX: 0,
  panY: 0,
  viewW: 800,
  viewH: 600,
  cursor: { x: 0, y: 0 } as P,
  fileName: "Sin título",
  dirty: false,
});

export const selected = computed(() => state.shapes.filter((s) => state.selection.includes(s.id)));

let counter = 0;
export const uid = () => `s${Date.now().toString(36)}${(counter++).toString(36)}`;

export function makeShape(type: ShapeType, init: Partial<Shape>): Shape {
  const style = type === "text" ? { ...state.defaults, fill: "#000000", stroke: "none" } : { ...state.defaults };
  if (type === "line" || type === "freehand") style.fill = "none";
  const n = state.shapes.filter((s) => s.type === type).length + 1;
  return {
    id: uid(), type, name: `${TYPE_NAMES[type]} ${n}`,
    x: 0, y: 0, w: 0, h: 0, rotation: 0, flipX: false, flipY: false, visible: true, locked: false,
    ...style, ...init,
  };
}

// ---------- geometry ----------

export function polygonPoints(sides: number): [number, number][] {
  return Array.from({ length: sides }, (_, i) => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / sides;
    return [0.5 + 0.5 * Math.cos(a), 0.5 + 0.5 * Math.sin(a)] as [number, number];
  });
}

export function fromPoints(pts: P[]) {
  const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
  const x = Math.min(...xs), y = Math.min(...ys);
  const w = Math.max(...xs) - x, h = Math.max(...ys) - y;
  const points = pts.map((p) => [w ? (p.x - x) / w : 0, h ? (p.y - y) / h : 0] as [number, number]);
  return { x, y, w, h, points };
}

const rot = (x: number, y: number, deg: number): P => {
  const r = (deg * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r);
  return { x: x * c - y * s, y: x * s + y * c };
};

export function corners(f: Frame): P[] {
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => {
    const p = rot((a * f.w) / 2, (b * f.h) / 2, f.rotation);
    return { x: f.cx + p.x, y: f.cy + p.y };
  });
}

export const shapeFrame = (s: Shape): Frame => ({ cx: s.x + s.w / 2, cy: s.y + s.h / 2, w: s.w, h: s.h, rotation: s.rotation });

export function bounds(list: Shape[]) {
  const pts = list.flatMap((s) => corners(shapeFrame(s)));
  return fromPoints(pts);
}

export function selectionFrame(): Frame | null {
  const sel = selected.value;
  if (!sel.length) return null;
  if (sel.length === 1) return shapeFrame(sel[0]);
  const b = bounds(sel);
  return { cx: b.x + b.w / 2, cy: b.y + b.h / 2, w: b.w, h: b.h, rotation: 0 };
}

const snapshot = (list: Shape[]) => list.map((s) => ({ ...s }));

// Scale every shape of `list` (from its `orig` copy) inside frame f, keeping the
// local anchor (ax, ay) fixed.
// ponytail: rotated shapes inside a multi-selection are scaled along their own axes
// (no skew); a full affine matrix per shape would be needed for exact results.
export function scaleShapes(list: Shape[], orig: Shape[], f: Frame, sx: number, sy: number, ax: number, ay: number) {
  list.forEach((s, i) => {
    const o = orig[i];
    const q = rot(o.x + o.w / 2 - f.cx, o.y + o.h / 2 - f.cy, -f.rotation);
    const n = rot(ax + (q.x - ax) * sx, ay + (q.y - ay) * sy, f.rotation);
    s.w = o.w * sx;
    s.h = o.h * sy;
    s.x = f.cx + n.x - s.w / 2;
    s.y = f.cy + n.y - s.h / 2;
  });
}

export function rotateShapes(list: Shape[], orig: Shape[], cx: number, cy: number, deg: number) {
  list.forEach((s, i) => {
    const o = orig[i];
    const n = rot(o.x + o.w / 2 - cx, o.y + o.h / 2 - cy, deg);
    s.x = cx + n.x - o.w / 2;
    s.y = cy + n.y - o.h / 2;
    s.rotation = (((o.rotation + deg) % 360) + 360) % 360;
  });
}

// Property-bar edits: set frame centre/size directly.
export function setFrame(next: Partial<Frame>) {
  const f = selectionFrame();
  if (!f) return;
  const list = selected.value, orig = snapshot(list);
  const sx = next.w !== undefined && f.w > 1e-6 ? Math.max(next.w, 0.01) / f.w : 1;
  const sy = next.h !== undefined && f.h > 1e-6 ? Math.max(next.h, 0.01) / f.h : 1;
  scaleShapes(list, orig, f, sx, sy, 0, 0);
  const dx = (next.cx ?? f.cx) - f.cx, dy = (next.cy ?? f.cy) - f.cy;
  list.forEach((s) => ((s.x += dx), (s.y += dy)));
  if (next.rotation !== undefined) rotateShapes(list, snapshot(list), f.cx + dx, f.cy + dy, next.rotation - f.rotation);
  commit();
}

let measureCtx: CanvasRenderingContext2D | null = null;
export function measureText(s: Shape) {
  measureCtx ??= document.createElement("canvas").getContext("2d");
  const fs = s.fontSize ?? 10, lines = (s.text ?? "").split("\n");
  measureCtx!.font = `${fs}px "${s.fontFamily}"`;
  const natW = Math.max(fs * 0.3, ...lines.map((l) => measureCtx!.measureText(l).width));
  const natH = lines.length * fs * 1.2;
  const kx = s.natW ? s.w / s.natW : 1, ky = s.natH ? s.h / s.natH : 1;
  s.natW = natW;
  s.natH = natH;
  s.w = natW * kx;
  s.h = natH * ky;
}

// ---------- history ----------

const history: string[] = [JSON.stringify([])];
let hIndex = 0;

export function commit() {
  history.splice(hIndex + 1);
  history.push(JSON.stringify(state.shapes));
  if (history.length > 200) history.shift();
  hIndex = history.length - 1;
  state.dirty = true;
}

function restore() {
  state.shapes = JSON.parse(history[hIndex]);
  state.selection = state.selection.filter((id) => state.shapes.some((s) => s.id === id));
}

export function undo() {
  if (hIndex > 0) (hIndex--, restore());
}
export function redo() {
  if (hIndex < history.length - 1) (hIndex++, restore());
}

function resetHistory() {
  history.length = 0;
  history.push(JSON.stringify(state.shapes));
  hIndex = 0;
  state.dirty = false;
}

// ---------- edit ----------

let clipboard: Shape[] = [];

function insertCopies(src: Shape[], offset: number) {
  const copies = src.map((s) => ({ ...s, id: uid(), x: s.x + offset, y: s.y + offset }));
  state.shapes.push(...copies);
  state.selection = copies.map((s) => s.id);
  commit();
}

export function del() {
  if (!state.selection.length) return;
  state.shapes = state.shapes.filter((s) => !state.selection.includes(s.id));
  state.selection = [];
  commit();
}
export const copy = () => (clipboard = snapshot(selected.value));
export const cut = () => (copy(), del());
export const paste = () => clipboard.length && insertCopies(clipboard, 0);
export const duplicate = () => selected.value.length && insertCopies(selected.value, 5);
export const duplicateInPlace = () => selected.value.length && insertCopies(selected.value, 0);
export const selectAll = () => (state.selection = state.shapes.filter((s) => s.visible && !s.locked).map((s) => s.id));

export function applyStyle(patch: Partial<Shape>) {
  if (!state.selection.length) {
    Object.assign(state.defaults, patch);
    return;
  }
  selected.value.forEach((s) => Object.assign(s, patch));
  commit();
}

export function flip(axis: "x" | "y") {
  const f = selectionFrame();
  if (!f) return;
  const list = selected.value;
  scaleShapes(list, snapshot(list), { ...f, rotation: 0 }, axis === "x" ? -1 : 1, axis === "y" ? -1 : 1, 0, 0);
  list.forEach((s) => {
    // a negative scale above turned w/h negative: normalise and mirror the content instead
    if (s.w < 0) (s.x += s.w, s.w = -s.w);
    if (s.h < 0) (s.y += s.h, s.h = -s.h);
    if (axis === "x") s.flipX = !s.flipX;
    else s.flipY = !s.flipY;
    s.rotation = (360 - s.rotation) % 360;
  });
  commit();
}

// ---------- order ----------

const isSel = (s: Shape) => state.selection.includes(s.id);

export function toFront() {
  state.shapes = [...state.shapes.filter((s) => !isSel(s)), ...state.shapes.filter(isSel)];
  commit();
}
export function toBack() {
  state.shapes = [...state.shapes.filter(isSel), ...state.shapes.filter((s) => !isSel(s))];
  commit();
}
export function forward() {
  const a = state.shapes;
  for (let i = a.length - 2; i >= 0; i--) if (isSel(a[i]) && !isSel(a[i + 1])) [a[i], a[i + 1]] = [a[i + 1], a[i]];
  commit();
}
export function backward() {
  const a = state.shapes;
  for (let i = 1; i < a.length; i++) if (isSel(a[i]) && !isSel(a[i - 1])) [a[i], a[i - 1]] = [a[i - 1], a[i]];
  commit();
}

// ---------- view ----------

export function fit(x: number, y: number, w: number, h: number) {
  const m = 40;
  const z = Math.min((state.viewW - m * 2) / Math.max(w, 1), (state.viewH - m * 2) / Math.max(h, 1));
  state.zoom = Math.min(400, Math.max(0.05, z));
  state.panX = state.viewW / 2 - (x + w / 2) * state.zoom;
  state.panY = state.viewH / 2 - (y + h / 2) * state.zoom;
}
export const zoomPage = () => fit(0, 0, state.page.w, state.page.h);
export function zoomObjects() {
  const list = state.shapes.filter((s) => s.visible);
  if (!list.length) return zoomPage();
  const b = bounds(list);
  fit(b.x, b.y, b.w, b.h);
}
export function zoomBy(k: number, sx = state.viewW / 2, sy = state.viewH / 2) {
  const wx = (sx - state.panX) / state.zoom, wy = (sy - state.panY) / state.zoom;
  state.zoom = Math.min(400, Math.max(0.05, state.zoom * k));
  state.panX = sx - wx * state.zoom;
  state.panY = sy - wy * state.zoom;
}

export function setPage(size: string, landscape: boolean) {
  const [w, h] = PAGE_SIZES[size];
  state.page = { size, w: landscape ? h : w, h: landscape ? w : h };
  zoomPage();
}

// ---------- files ----------

function download(blob: Blob, name: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export function newDoc() {
  if (state.dirty && !confirm("¿Descartar los cambios del documento actual?")) return;
  state.shapes = [];
  state.selection = [];
  state.fileName = "Sin título";
  resetHistory();
  zoomPage();
}

export function saveDoc() {
  const doc = { app: "free-draw", version: 1, page: state.page, shapes: state.shapes };
  download(new Blob([JSON.stringify(doc)], { type: "application/json" }), `${state.fileName}.fdraw`);
  state.dirty = false;
}

export function openDoc() {
  if (state.dirty && !confirm("¿Descartar los cambios del documento actual?")) return;
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".fdraw,.json";
  input.onchange = async () => {
    const file = input.files?.[0];
    if (!file) return;
    try {
      const doc = JSON.parse(await file.text());
      if (doc.app !== "free-draw" || !Array.isArray(doc.shapes)) throw new Error("formato");
      state.page = doc.page;
      state.shapes = doc.shapes;
      state.selection = [];
      state.fileName = file.name.replace(/\.(fdraw|json)$/, "");
      resetHistory();
      zoomPage();
    } catch {
      alert("El archivo no es un documento de Free Draw válido.");
    }
  };
  input.click();
}

function pageSVG() {
  state.editingText = null;
  const g = document.getElementById("fd-shapes")!.cloneNode(true) as Element;
  g.querySelectorAll(".fd-hit").forEach((n) => n.remove());
  g.querySelectorAll("[data-id]").forEach((n) => n.removeAttribute("data-id"));
  g.querySelectorAll("[pointer-events]").forEach((n) => n.removeAttribute("pointer-events"));
  const { w, h } = state.page;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}mm" height="${h}mm" viewBox="0 0 ${w} ${h}">${g.innerHTML}</svg>`;
}

export function exportSVG() {
  download(new Blob([pageSVG()], { type: "image/svg+xml" }), `${state.fileName}.svg`);
}

export async function exportPNG(dpi = 300) {
  const img = new Image();
  img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(pageSVG());
  await img.decode();
  const k = dpi / 25.4, canvas = document.createElement("canvas");
  canvas.width = Math.round(state.page.w * k);
  canvas.height = Math.round(state.page.h * k);
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  canvas.toBlob((b) => b && download(b, `${state.fileName}.png`));
}

export function setTool(t: Tool) {
  if (state.tool !== "pick") state.lastTool = state.tool;
  state.tool = t;
  state.rotateMode = false;
  state.editingText = null;
}
