import { reactive, computed, ref } from "vue";
import { t } from "./i18n";

// World units are millimetres. Shapes live in their own bbox (x, y, w, h) and
// rotate around its centre; point lists are normalised to 0..1 inside the bbox.

export type Tool = "pick" | "shape" | "eyedropper" | "freehand" | "line" | "dimension" | "rect" | "ellipse" | "polygon" | "text" | "zoom" | "pan";
export type ShapeType = "rect" | "ellipse" | "polygon" | "path" | "text" | "dimension" | "image";
export type DimKind = "parallel" | "h" | "v" | "angular";
export type Dash = "solid" | "dash" | "dot";
export type Cap = "butt" | "round" | "square";
export type Join = "miter" | "round" | "bevel";
export type Arrow = "none" | "triangle" | "open" | "dot";
export type P = { x: number; y: number };
export type NodeKind = "cusp" | "smooth" | "symmetric";
export interface PNode {
  x: number;
  y: number;
  ix: number; // handle in, relative to the node
  iy: number;
  ox: number; // handle out, relative to the node
  oy: number;
  kind: NodeKind;
}
export interface SubPath {
  closed: boolean;
  nodes: PNode[];
}
export interface Gradient {
  type: "linear" | "radial";
  from: string;
  to: string;
  angle: number; // degrees, counter-clockwise like CorelDRAW (linear only)
}
// A dimension end attached to an object: a curve node (si/ni) or a normalised bbox point (nx/ny).
export interface Link {
  id: string;
  si?: number;
  ni?: number;
  nx?: number;
  ny?: number;
}

export interface Style {
  fill: string; // css colour or "none"
  gradient?: Gradient; // overrides fill when set
  stroke: string;
  strokeWidth: number;
  dash: Dash;
  cap?: Cap;
  join?: Join;
  arrowStart?: Arrow;
  arrowEnd?: Arrow;
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
  groups?: string[]; // enclosing group ids, outermost first
  radius?: number | number[]; // mm; [top-left, top-right, bottom-right, bottom-left] when corners differ
  sides?: number;
  paths?: SubPath[]; // "path": normalised nodes, handles relative to their node
  dim?: { kind: DimKind; pts: [number, number][]; decimals: number; units: boolean; links?: (Link | null)[] };
  text?: string;
  fontSize?: number; // mm
  fontFamily?: string;
  natW?: number; // unscaled text size, used to stretch text to its bbox
  natH?: number;
  src?: string; // image data URL
}

export interface Page {
  id: string;
  name: string;
  shapes: Shape[];
}
export interface Guide {
  axis: "x" | "y"; // "x": vertical line at x = pos
  pos: number;
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
  path: "Curva",
  dimension: "Cota",
  text: "Texto artístico",
  image: "Mapa de bits",
};

let counter = 0;
export const uid = () => `s${Date.now().toString(36)}${(counter++).toString(36)}`;

export const state = reactive({
  pages: [{ id: uid(), name: t("Página {n}", { n: 1 }), shapes: [] }] as Page[],
  pageIndex: 0,
  // shapes of the current page; everything else works on this
  get shapes(): Shape[] {
    return this.pages[this.pageIndex].shapes;
  },
  set shapes(v: Shape[]) {
    this.pages[this.pageIndex].shapes = v;
  },
  selection: [] as string[],
  tool: "pick" as Tool,
  lastTool: "rect" as Tool,
  rotateMode: false,
  editingText: null as string | null,
  nodeSel: [] as string[], // "subpath:index" of selected nodes (shape tool)
  dimMode: "parallel" as "parallel" | "hv" | "angular",
  sampled: null as string | null, // last colour taken with the eyedropper
  dimDefaults: { decimals: 2, units: true },
  defaults: {
    fill: "none", stroke: "#000000", strokeWidth: 0.2, dash: "solid", cap: "butt", join: "round",
    arrowStart: "none", arrowEnd: "none", opacity: 1,
  } as Style,
  textDefaults: { fontFamily: "Arial", fontSize: 24 * PT },
  page: { size: "A4", w: 210, h: 297 },
  guides: [] as Guide[],
  grid: { show: false, spacing: 5 },
  snapTo: { grid: false, guides: true, objects: true },
  zoom: 2, // screen px per mm
  panX: 0,
  panY: 0,
  viewW: 800,
  viewH: 600,
  cursor: { x: 0, y: 0 } as P,
  fileName: t("Sin título"),
  filePath: null as string | null,
  dirty: false,
});

export const selected = computed(() => state.shapes.filter((s) => state.selection.includes(s.id)));

export function makeShape(type: ShapeType, init: Partial<Shape>): Shape {
  const style: Style = type === "text" ? { ...state.defaults, fill: "#000000", stroke: "none" } : { ...state.defaults };
  if (type === "dimension") style.fill = "none";
  if (type === "image") style.stroke = "none";
  if (type !== "path") (style.arrowStart = "none", style.arrowEnd = "none");
  const n = state.shapes.filter((s) => s.type === type).length + 1;
  return {
    id: uid(), type, name: `${t(TYPE_NAMES[type])} ${n}`,
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

export const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));
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

// ---------- groups ----------

// Outermost group (or the shape itself): what a click selects and z-order moves.
export const unitKey = (s: Shape) => s.groups?.[0] ?? s.id;

// Add every member of the outermost groups touched by ids.
export function expandGroups(ids: string[]) {
  const keys = new Set(state.shapes.filter((s) => ids.includes(s.id)).map(unitKey));
  return state.shapes.filter((s) => keys.has(unitKey(s))).map((s) => s.id);
}

// Consecutive shapes sharing an outermost group; groups are kept contiguous in z-order.
export function units(list = state.shapes): Shape[][] {
  const out: Shape[][] = [];
  for (const s of list) {
    const last = out[out.length - 1];
    if (last && s.groups?.length && unitKey(last[0]) === s.groups[0]) last.push(s);
    else out.push([s]);
  }
  return out;
}

// ---------- history ----------

// Hooks run before every snapshot (linked dimensions refresh themselves here).
export const beforeCommit: (() => void)[] = [];

const docSnapshot = () => JSON.stringify({ pages: state.pages, pageIndex: state.pageIndex });
const history: string[] = [docSnapshot()];
let hIndex = 0;

export function commit() {
  beforeCommit.forEach((fn) => fn());
  history.splice(hIndex + 1);
  history.push(docSnapshot());
  if (history.length > 200) history.shift();
  hIndex = history.length - 1;
  state.dirty = true;
}

function restore() {
  const snap = JSON.parse(history[hIndex]);
  state.pages = snap.pages;
  state.pageIndex = Math.min(snap.pageIndex, state.pages.length - 1);
  state.selection = state.selection.filter((id) => state.shapes.some((s) => s.id === id));
}

export function undo() {
  if (hIndex > 0) (hIndex--, restore());
}
export function redo() {
  if (hIndex < history.length - 1) (hIndex++, restore());
}

export function resetHistory() {
  history.length = 0;
  history.push(docSnapshot());
  hIndex = 0;
  state.dirty = false;
}

// ---------- pages ----------

export function gotoPage(i: number) {
  if (i < 0 || i >= state.pages.length || i === state.pageIndex) return;
  state.editingText = null;
  state.selection = [];
  state.nodeSel = [];
  state.pageIndex = i;
}

export function addPage(at = state.pageIndex + 1) {
  state.pages.splice(at, 0, { id: uid(), name: t("Página {n}", { n: state.pages.length + 1 }), shapes: [] });
  state.selection = [];
  state.pageIndex = at;
  commit();
}

export function deletePage(i = state.pageIndex) {
  if (state.pages.length < 2) return;
  state.pages.splice(i, 1);
  state.selection = [];
  state.pageIndex = Math.min(state.pageIndex, state.pages.length - 1);
  commit();
}

export function renamePage(i: number, name: string) {
  if (!name.trim() || state.pages[i].name === name) return;
  state.pages[i].name = name.trim();
  commit();
}

// ---------- edit ----------

let clipboard: Shape[] = [];

function insertCopies(src: Shape[], offset: number) {
  // copies get fresh group ids so they do not join the originals' groups
  const remap = new Map<string, string>();
  const gid = (g: string) => remap.get(g) ?? (remap.set(g, uid()), remap.get(g)!);
  const copies = clone(src).map((s) => ({ ...s, id: uid(), x: s.x + offset, y: s.y + offset, groups: s.groups?.map(gid) }));
  copies.forEach((s) => s.dim?.links && (s.dim.links = undefined));
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
export const copy = () => (clipboard = clone(selected.value));
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

// ---------- order (groups move as one unit) ----------

const isSelUnit = (u: Shape[]) => u.some((s) => state.selection.includes(s.id));

export function toFront() {
  const u = units();
  state.shapes = [...u.filter((x) => !isSelUnit(x)), ...u.filter(isSelUnit)].flat();
  commit();
}
export function toBack() {
  const u = units();
  state.shapes = [...u.filter(isSelUnit), ...u.filter((x) => !isSelUnit(x))].flat();
  commit();
}
export function forward() {
  const a = units();
  for (let i = a.length - 2; i >= 0; i--) if (isSelUnit(a[i]) && !isSelUnit(a[i + 1])) [a[i], a[i + 1]] = [a[i + 1], a[i]];
  state.shapes = a.flat();
  commit();
}
export function backward() {
  const a = units();
  for (let i = 1; i < a.length; i++) if (isSelUnit(a[i]) && !isSelUnit(a[i - 1])) [a[i], a[i - 1]] = [a[i - 1], a[i]];
  state.shapes = a.flat();
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

// ponytail: one page size for the whole document; per-page sizes when someone needs mixed formats
export function setPage(size: string, landscape: boolean) {
  const [w, h] = PAGE_SIZES[size];
  state.page = { size, w: landscape ? h : w, h: landscape ? w : h };
  state.dirty = true;
  zoomPage();
}

// ---------- custom palette (per user, kept in this browser/webview, not in the document) ----------

const CUSTOM_KEY = "fd-custom-colors";
export const customColors = ref<string[]>((() => {
  try {
    return JSON.parse(localStorage.getItem(CUSTOM_KEY) ?? "[]");
  } catch {
    return [];
  }
})());
function setCustomColors(list: string[]) {
  customColors.value = list;
  try {
    localStorage.setItem(CUSTOM_KEY, JSON.stringify(list));
  } catch {}
}
export const addCustomColor = (c: string) =>
  customColors.value.includes(c.toLowerCase()) || setCustomColors([...customColors.value, c.toLowerCase()]);
export const removeCustomColor = (c: string) => setCustomColors(customColors.value.filter((x) => x !== c));

export function setTool(t: Tool) {
  if (state.tool !== "pick") state.lastTool = state.tool;
  state.tool = t;
  state.rotateMode = false;
  state.editingText = null;
  state.nodeSel = [];
}
