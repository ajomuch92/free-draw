<script setup lang="ts">
import { computed, nextTick, onMounted, onBeforeUnmount, ref, shallowRef, watch } from "vue";
import {
  state as S, selected, selectionFrame, corners, makeShape, measureText, commit, expandGroups, units,
  scaleShapes, rotateShapes, bounds, zoomBy, zoomPage,
  type Frame, type P, type Shape, type SubPath, type Link,
} from "../store";
import {
  worldPaths, moveNodes, moveHandle, bendSegment, nearestSegment, addNodeAt, deleteNodes, key, pathFromPoints,
} from "../paths";
import { makeDimension, hvKind, updateLinkedDimensions } from "../dimensions";
import { snapContext, snapPoint, moveTargets, snapMove, type SnapResult } from "../snap";
import { sampleAt, applySampled } from "../eyedropper";
import ShapeView from "./ShapeView.vue";
import Rulers from "./Rulers.vue";

const RULER = 20; // px, same as Rulers.vue

const svg = ref<SVGSVGElement>();
const editor = ref<HTMLTextAreaElement>();
const draft = shallowRef<Shape | null>(null);
const marquee = ref<{ x: number; y: number; w: number; h: number } | null>(null);
const snapMark = ref<P | null>(null);
const alignLines = ref<{ axis: "x" | "y"; pos: number }[]>([]);
const guideDraft = ref<{ axis: "x" | "y"; pos: number } | null>(null);

type Ctx = ReturnType<typeof snapContext>;
type Box = { x: number; y: number; w: number; h: number };
type Drag =
  | { kind: "pan"; sx: number; sy: number; px: number; py: number }
  | { kind: "move"; start: P; orig: Shape[]; moved: boolean; wasSelected: boolean; box: Box; targets: { x: number[]; y: number[] } }
  | { kind: "scale"; hx: number; hy: number; frame: Frame; orig: Shape[]; ctx: Ctx }
  | { kind: "rotate"; frame: Frame; startAng: number; orig: Shape[] }
  | { kind: "marquee"; start: P; add: boolean }
  | { kind: "create"; start: P; pts: P[]; ctx: Ctx }
  | { kind: "nodes"; shape: Shape; start: P; orig: SubPath[]; moved: boolean; grab: P; ctx: Ctx }
  | { kind: "handle"; shape: Shape; orig: SubPath[]; si: number; ni: number; which: "in" | "out" }
  | { kind: "bend"; shape: Shape; orig: SubPath[]; si: number; i: number; t: number; start: P; moved: boolean }
  | { kind: "nodeMarquee"; start: P; add: boolean }
  | { kind: "guide"; index: number | null; axis: "x" | "y" };
let drag: Drag | null = null;

// Dimension tool is click-driven across several gestures:
// linear  = press A, drag to B, release, move to place, click
// angular = press vertex, drag to arm 1, release, click arm 2, click radius
let dimStep: { pts: P[]; links: (Link | null)[]; stage: number; ctx: Ctx } | null = null;

const rectOf = () => svg.value!.getBoundingClientRect();
function toWorld(e: { clientX: number; clientY: number }): P {
  const r = rectOf();
  return { x: (e.clientX - r.left - S.panX) / S.zoom, y: (e.clientY - r.top - S.panY) / S.zoom };
}
const toScreen = (p: P): P => ({ x: p.x * S.zoom + S.panX, y: p.y * S.zoom + S.panY });
const deg = (a: number) => (a * 180) / Math.PI;
const snapAngle = (a: number, step = 15) => Math.round(a / step) * step;

function snapped(p: P, ctx: Ctx, objects = true): SnapResult {
  const r = snapPoint(p, ctx, objects);
  snapMark.value = r.mark;
  return r;
}

function hitShape(target: EventTarget | null): Shape | undefined {
  const id = (target as Element)?.closest?.("#fd-shapes [data-id]")?.getAttribute("data-id");
  const s = S.shapes.find((s) => s.id === id);
  return s && !s.locked ? s : undefined;
}

// ---------- selection overlay (screen space) ----------

const frame = computed(() => (S.editingText ? null : selectionFrame()));
const handles = computed(() => {
  const f = frame.value;
  if (!f) return [];
  const r = (f.rotation * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r);
  const list = S.rotateMode
    ? [[-1, -1], [1, -1], [1, 1], [-1, 1]]
    : [[-1, -1], [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0]];
  const pad = 6 / S.zoom; // keep handles off the shape outline
  return list.map(([hx, hy]) => {
    const lx = hx * (f.w / 2 + pad), ly = hy * (f.h / 2 + pad);
    const p = toScreen({ x: f.cx + lx * c - ly * s, y: f.cy + lx * s + ly * c });
    return { hx, hy, ...p };
  });
});
const center = computed(() => (frame.value ? toScreen({ x: frame.value.cx, y: frame.value.cy }) : null));
const outline = computed(() =>
  frame.value && selected.value.length > 1
    ? corners(frame.value).map((p) => { const q = toScreen(p); return `${q.x},${q.y}`; }).join(" ")
    : "",
);

// Shape tool: nodes of the single selected curve, handles of the selected nodes.
const editPath = computed(() => {
  const s = selected.value.length === 1 ? selected.value[0] : null;
  return S.tool === "shape" && s?.type === "path" ? s : null;
});
const nodeView = computed(() => {
  const s = editPath.value;
  if (!s) return null;
  const nodes: { k: string; x: number; y: number; sel: boolean; first: boolean }[] = [];
  const hs: { k: string; x1: number; y1: number; x2: number; y2: number }[] = [];
  worldPaths(s).forEach((sp, si) => sp.nodes.forEach((n, ni) => {
    const k = key(si, ni), p = toScreen(n), sel = S.nodeSel.includes(k);
    nodes.push({ k, ...p, sel, first: ni === 0 });
    if (!sel) return;
    const ends = { in: !sp.closed && ni === 0, out: !sp.closed && ni === sp.nodes.length - 1 };
    for (const [w, hx, hy] of [["in", n.ix, n.iy], ["out", n.ox, n.oy]] as const) {
      if ((!hx && !hy) || ends[w]) continue;
      const h = toScreen({ x: n.x + hx, y: n.y + hy });
      hs.push({ k: `${k}:${w}`, x1: p.x, y1: p.y, x2: h.x, y2: h.y });
    }
  }));
  return { nodes, handles: hs };
});
const snapScreen = computed(() => (snapMark.value ? toScreen(snapMark.value) : null));
const screenGuides = computed(() => {
  const list = S.guides.map((g, i) => ({ ...g, i }));
  if (guideDraft.value) list.push({ ...guideDraft.value, i: -1 });
  return list.map((g) => ({ ...g, s: g.axis === "x" ? g.pos * S.zoom + S.panX : g.pos * S.zoom + S.panY }));
});
const screenAlign = computed(() =>
  alignLines.value.map((l) => ({ ...l, s: l.axis === "x" ? l.pos * S.zoom + S.panX : l.pos * S.zoom + S.panY })),
);

// ---------- pointer ----------

function onDown(e: PointerEvent) {
  if (S.editingText) finishText();
  e.preventDefault();
  if (e.button === 2 && S.tool !== "zoom" && S.tool !== "eyedropper") return;
  svg.value!.setPointerCapture(e.pointerId);
  const p = toWorld(e), t = e.target as Element;

  if (e.button === 1 || S.tool === "pan") {
    drag = { kind: "pan", sx: e.clientX, sy: e.clientY, px: S.panX, py: S.panY };
    return;
  }
  // guides: drag one out of a ruler, or move an existing one
  const ruler = t.closest("[data-ruler]")?.getAttribute("data-ruler") as "x" | "y" | undefined;
  if (ruler) {
    drag = { kind: "guide", index: null, axis: ruler };
    guideDraft.value = { axis: ruler, pos: ruler === "x" ? p.x : p.y };
    return;
  }
  const gi = t.closest("[data-guide]")?.getAttribute("data-guide");
  if (gi !== undefined && gi !== null && S.tool === "pick") {
    drag = { kind: "guide", index: +gi, axis: S.guides[+gi].axis };
    return;
  }
  if (S.tool === "zoom") {
    const r = rectOf();
    zoomBy(e.button === 2 || e.shiftKey ? 1 / 1.6 : 1.6, e.clientX - r.left, e.clientY - r.top);
    return;
  }
  if (S.tool === "text") {
    const hit = hitShape(e.target);
    if (hit?.type === "text") return editText(hit);
    const s = makeShape("text", { x: p.x, y: p.y, text: "", ...S.textDefaults });
    measureText(s);
    S.shapes.push(s);
    S.selection = [s.id];
    return editText(S.shapes[S.shapes.length - 1]);
  }
  if (S.tool === "eyedropper") {
    // take the colour under the cursor; with a selection, paint it as fill (Shift/right click: outline)
    const asStroke = e.shiftKey || e.button === 2;
    sampleAt(p).then((c) => {
      if (!c) return;
      S.sampled = c;
      if (S.selection.length) applySampled(asStroke ? "stroke" : "fill");
    });
    return;
  }
  if (S.tool === "shape") return shapeToolDown(e, p);
  if (S.tool === "dimension") return dimensionDown(p);
  if (S.tool !== "pick") {
    const ctx = snapContext();
    const start = S.tool === "freehand" ? p : snapped(p, ctx).p;
    drag = { kind: "create", start, pts: [start], ctx };
    return;
  }

  const handle = t.closest("[data-handle]")?.getAttribute("data-handle");
  const f = selectionFrame();
  if (handle && f) {
    const orig = selected.value.map((s) => ({ ...s }));
    const [hx, hy] = handle.split(",").map(Number);
    drag = S.rotateMode
      ? { kind: "rotate", frame: f, startAng: deg(Math.atan2(p.y - f.cy, p.x - f.cx)), orig }
      : { kind: "scale", hx, hy, frame: f, orig, ctx: snapContext(new Set(S.selection)) };
    return;
  }

  const hit = hitShape(e.target);
  if (!hit) {
    if (!e.shiftKey) (S.selection = [], S.rotateMode = false);
    drag = { kind: "marquee", start: p, add: e.shiftKey };
    return;
  }
  // a click selects the whole group; Ctrl+click picks one object inside it
  const ids = e.ctrlKey ? [hit.id] : expandGroups([hit.id]);
  const wasSelected = ids.every((id) => S.selection.includes(id));
  if (e.shiftKey) {
    S.selection = wasSelected ? S.selection.filter((id) => !ids.includes(id)) : [...S.selection, ...ids.filter((id) => !S.selection.includes(id))];
    return;
  }
  if (!wasSelected) (S.selection = ids, S.rotateMode = false);
  const exclude = new Set(S.selection);
  drag = {
    kind: "move", start: p, orig: selected.value.map((s) => ({ ...s })), moved: false, wasSelected,
    box: bounds(selected.value), targets: moveTargets(exclude),
  };
}

function shapeToolDown(e: PointerEvent, p: P) {
  const t = e.target as Element, s = editPath.value;
  const nh = t.closest("[data-nh]")?.getAttribute("data-nh");
  const nd = t.closest("[data-node]")?.getAttribute("data-node");
  if (s && nh) {
    const [si, ni, which] = nh.split(":");
    drag = { kind: "handle", shape: s, orig: worldPaths(s), si: +si, ni: +ni, which: which as "in" | "out" };
    return;
  }
  if (s && nd) {
    if (e.shiftKey) S.nodeSel = S.nodeSel.includes(nd) ? S.nodeSel.filter((k) => k !== nd) : [...S.nodeSel, nd];
    else if (!S.nodeSel.includes(nd)) S.nodeSel = [nd];
    const orig = worldPaths(s), [si, ni] = nd.split(":").map(Number);
    drag = { kind: "nodes", shape: s, start: p, orig, moved: false, grab: orig[si].nodes[ni], ctx: snapContext(new Set([s.id])) };
    return;
  }
  const hit = hitShape(e.target);
  if (hit && hit !== s) {
    S.selection = [hit.id];
    S.nodeSel = [];
    return;
  }
  // dragging the curve itself bends the segment under the cursor
  const seg = s && hit === s ? nearestSegment(s, p) : null;
  if (s && seg && seg.d < 6 / S.zoom) {
    drag = { kind: "bend", shape: s, orig: worldPaths(s), si: seg.si, i: seg.i, t: seg.t, start: p, moved: false };
    return;
  }
  if (!e.shiftKey) S.nodeSel = [];
  if (s) drag = { kind: "nodeMarquee", start: p, add: e.shiftKey };
  else S.selection = [];
}

function dimensionDown(p: P) {
  if (!dimStep) {
    const ctx = snapContext();
    const r = snapped(p, ctx);
    dimStep = { pts: [r.p, r.p, r.p, r.p], links: [r.link ?? null], stage: 0, ctx };
    drag = { kind: "create", start: r.p, pts: [], ctx };
    return;
  }
  const last = S.dimMode === "angular" ? 2 : 1;
  if (dimStep.stage < last) {
    dimStep.stage++;
    return;
  }
  const s = draft.value;
  draft.value = null;
  dimStep = null;
  snapMark.value = null;
  if (!s) return;
  S.shapes.push(s);
  S.selection = [s.id];
  commit();
}

// Update the dimension draft with the cursor as the point of the current stage.
function dimensionMove(p: P) {
  const st = dimStep!;
  const linear = S.dimMode !== "angular";
  const placing = (linear && st.stage === 1) || st.stage === 2;
  const r = placing ? { p, link: undefined } : snapped(p, st.ctx); // placement never snaps
  if (placing) snapMark.value = null;
  for (let i = st.stage + 1; i < st.pts.length; i++) st.pts[i] = r.p;
  if (!placing) st.links[st.stage + 1] = r.link ?? null;
  if (linear) {
    const [A, B, Pp] = st.pts;
    draft.value = makeDimension(S.dimMode === "hv" ? hvKind(A, B, Pp) : "parallel", [A, B, Pp], st.links.slice(0, 2));
  } else draft.value = makeDimension("angular", st.pts, st.links.slice(0, 3));
}

function cancelDimension() {
  dimStep = null;
  draft.value = null;
  snapMark.value = null;
  drag = null;
}

function onMove(e: PointerEvent) {
  const p = toWorld(e);
  S.cursor = p;
  if (S.tool === "dimension" && dimStep) return dimensionMove(p);
  if (!drag) {
    // ponytail: hover rebuilds snap points on every move; cache per document change if docs get big
    if (S.tool === "dimension" || S.tool === "line" || S.tool === "rect" || S.tool === "ellipse" || S.tool === "polygon")
      snapped(p, snapContext());
    return;
  }
  const d = drag;
  switch (d.kind) {
    case "guide": {
      const pos = d.axis === "x" ? p.x : p.y;
      if (d.index === null) guideDraft.value = { axis: d.axis, pos };
      else S.guides[d.index].pos = pos;
      break;
    }
    case "nodes": {
      let dx = p.x - d.start.x, dy = p.y - d.start.y;
      if (!d.moved && Math.hypot(dx, dy) * S.zoom < 3) return;
      d.moved = true;
      if (e.ctrlKey) Math.abs(dx) > Math.abs(dy) ? (dy = 0) : (dx = 0);
      // the grabbed node snaps; the rest of the selection follows it
      const r = snapped({ x: d.grab.x + dx, y: d.grab.y + dy }, d.ctx);
      moveNodes(d.shape, d.orig, S.nodeSel, r.p.x - d.grab.x, r.p.y - d.grab.y);
      updateLinkedDimensions();
      break;
    }
    case "handle":
      moveHandle(d.shape, d.orig, d.si, d.ni, d.which, p);
      updateLinkedDimensions();
      break;
    case "bend": {
      const dx = p.x - d.start.x, dy = p.y - d.start.y;
      if (!d.moved && Math.hypot(dx, dy) * S.zoom < 3) return;
      d.moved = true;
      bendSegment(d.shape, d.orig, d.si, d.i, d.t, dx, dy);
      updateLinkedDimensions();
      break;
    }
    case "pan":
      S.panX = d.px + e.clientX - d.sx;
      S.panY = d.py + e.clientY - d.sy;
      break;
    case "move": {
      let dx = p.x - d.start.x, dy = p.y - d.start.y;
      if (!d.moved && Math.hypot(dx, dy) * S.zoom < 3) return;
      d.moved = true;
      if (e.ctrlKey) Math.abs(dx) > Math.abs(dy) ? (dy = 0) : (dx = 0);
      if (!e.altKey) {
        // Alt drags freely; otherwise edges and centres snap to guides, grid and other objects
        const r = snapMove(d.box, dx, dy, d.targets);
        if (!e.ctrlKey || dy === 0) dx = r.dx;
        if (!e.ctrlKey || dx === 0) dy = r.dy;
        alignLines.value = r.lines;
      }
      selected.value.forEach((s, i) => ((s.x = d.orig[i].x + dx), (s.y = d.orig[i].y + dy)));
      updateLinkedDimensions();
      break;
    }
    case "scale": {
      const q = snapped(p, d.ctx).p;
      const f = d.frame, r = (-f.rotation * Math.PI) / 180;
      const vx = q.x - f.cx, vy = q.y - f.cy;
      const lx = vx * Math.cos(r) - vy * Math.sin(r), ly = vx * Math.sin(r) + vy * Math.cos(r);
      const fromCenter = e.shiftKey;
      const ax = fromCenter ? 0 : (-d.hx * f.w) / 2, ay = fromCenter ? 0 : (-d.hy * f.h) / 2;
      let sx = d.hx && f.w > 1e-6 ? ((lx - ax) * d.hx) / (fromCenter ? f.w / 2 : f.w) : 1;
      let sy = d.hy && f.h > 1e-6 ? ((ly - ay) * d.hy) / (fromCenter ? f.h / 2 : f.h) : 1;
      if (d.hx && d.hy && !e.altKey) sx = sy = Math.max(sx, sy); // corners scale proportionally, like CorelDRAW
      scaleShapes(selected.value, d.orig, f, Math.max(sx, 0.01), Math.max(sy, 0.01), ax, ay);
      updateLinkedDimensions();
      break;
    }
    case "rotate": {
      let a = deg(Math.atan2(p.y - d.frame.cy, p.x - d.frame.cx)) - d.startAng;
      if (e.ctrlKey) a = snapAngle(a);
      rotateShapes(selected.value, d.orig, d.frame.cx, d.frame.cy, a);
      updateLinkedDimensions();
      break;
    }
    case "marquee":
    case "nodeMarquee":
      marquee.value = {
        x: Math.min(d.start.x, p.x), y: Math.min(d.start.y, p.y),
        w: Math.abs(p.x - d.start.x), h: Math.abs(p.y - d.start.y),
      };
      break;
    case "create":
      draft.value = buildDraft(d, p, e);
      break;
  }
}

function buildDraft(d: Extract<Drag, { kind: "create" }>, p: P, e: PointerEvent): Shape {
  const t = S.tool as "rect" | "ellipse" | "polygon" | "line" | "freehand";
  if (t === "freehand") {
    const last = d.pts[d.pts.length - 1];
    if (Math.hypot(p.x - last.x, p.y - last.y) * S.zoom > 2) d.pts.push(p);
    return pathFromPoints(d.pts, 0, false);
  }
  if (!e.ctrlKey) p = snapped(p, d.ctx).p;
  if (t === "line") {
    let end = p;
    if (e.ctrlKey) {
      const len = Math.hypot(p.x - d.start.x, p.y - d.start.y);
      const a = (snapAngle(deg(Math.atan2(p.y - d.start.y, p.x - d.start.x))) * Math.PI) / 180;
      end = { x: d.start.x + len * Math.cos(a), y: d.start.y + len * Math.sin(a) };
    }
    return pathFromPoints([d.start, end], 0, false);
  }
  let dx = p.x - d.start.x, dy = p.y - d.start.y;
  if (e.ctrlKey) {
    const m = Math.max(Math.abs(dx), Math.abs(dy));
    dx = Math.sign(dx || 1) * m;
    dy = Math.sign(dy || 1) * m;
  }
  const box = e.shiftKey
    ? { x: d.start.x - Math.abs(dx), y: d.start.y - Math.abs(dy), w: Math.abs(dx) * 2, h: Math.abs(dy) * 2 }
    : { x: Math.min(d.start.x, d.start.x + dx), y: Math.min(d.start.y, d.start.y + dy), w: Math.abs(dx), h: Math.abs(dy) };
  return makeShape(t, { ...box, ...(t === "polygon" ? { sides: 5 } : {}) });
}

function onUp(e: PointerEvent) {
  const d = drag;
  drag = null;
  alignLines.value = [];
  if (!d) return;
  if (S.tool === "dimension" && dimStep) {
    // end of the first press-drag: keep going only if it measured something
    const [A, B] = dimStep.pts;
    if (Math.hypot(B.x - A.x, B.y - A.y) * S.zoom < 3) cancelDimension();
    else dimStep.stage = 1;
    return;
  }
  if (d.kind === "guide") {
    // dropping a guide back on its ruler removes it
    const r = rectOf(), onRuler = d.axis === "x" ? e.clientX - r.left < RULER : e.clientY - r.top < RULER;
    if (d.index === null && guideDraft.value && !onRuler) S.guides.push(guideDraft.value);
    if (d.index !== null && onRuler) S.guides.splice(d.index, 1);
    guideDraft.value = null;
    S.dirty = true;
    return;
  }
  if (d.kind === "nodes" || d.kind === "handle" || d.kind === "bend") {
    snapMark.value = null;
    if (d.kind === "handle" || d.moved) commit();
    return;
  }
  if (d.kind === "nodeMarquee") {
    const m = marquee.value, s = editPath.value;
    marquee.value = null;
    if (!m || !s) return;
    const inside = worldPaths(s).flatMap((sp, si) => sp.nodes.map((n, ni) => ({ n, k: key(si, ni) })))
      .filter(({ n }) => n.x >= m.x && n.y >= m.y && n.x <= m.x + m.w && n.y <= m.y + m.h).map(({ k }) => k);
    S.nodeSel = [...new Set([...(d.add ? S.nodeSel : []), ...inside])];
    return;
  }
  if (d.kind === "move") {
    if (d.moved) commit();
    else if (d.wasSelected && !e.shiftKey) S.rotateMode = !S.rotateMode; // second click toggles rotate handles
  } else if (d.kind === "scale" || d.kind === "rotate") {
    snapMark.value = null;
    commit();
  } else if (d.kind === "marquee") {
    const m = marquee.value;
    marquee.value = null;
    if (!m) return;
    const inside = (s: Shape) => {
      if (!s.visible || s.locked) return false;
      const b = bounds([s]);
      return b.x >= m.x && b.y >= m.y && b.x + b.w <= m.x + m.w && b.y + b.h <= m.y + m.h;
    };
    // a group is picked only when all of it is inside the marquee
    const picked = units().filter((u) => u.every(inside)).flat().map((s) => s.id);
    S.selection = [...new Set([...(d.add ? S.selection : []), ...picked])];
  } else if (d.kind === "create") {
    let s = draft.value;
    draft.value = null;
    snapMark.value = null;
    if (!s || Math.max(s.w, s.h) * S.zoom < 3) return;
    if (S.tool === "freehand") s = pathFromPoints(d.pts, 2 / S.zoom, true); // fit smooth curves
    S.shapes.push(s);
    S.selection = [s.id];
    S.rotateMode = false;
    commit();
  }
}

function onWheel(e: WheelEvent) {
  if (e.shiftKey) {
    S.panX -= e.deltaY || e.deltaX;
    return;
  }
  const r = rectOf();
  zoomBy(Math.exp(-e.deltaY * 0.0015), e.clientX - r.left, e.clientY - r.top);
}

function onDblClick(e: MouseEvent) {
  const hit = hitShape(e.target);
  if (S.tool === "pick" && hit?.type === "text") editText(hit);
  if (S.tool !== "shape" || !editPath.value) return;
  // shape tool: double-click a node deletes it, a segment adds one
  const nd = (e.target as Element).closest("[data-node]")?.getAttribute("data-node");
  if (nd) deleteNodes([nd.split(":").map(Number) as [number, number]]);
  else addNodeAt(toWorld(e), 6 / S.zoom);
}

function onKey(e: KeyboardEvent) {
  if (e.key === "Escape" && dimStep) cancelDimension();
}

// ---------- text editing ----------

const editing = computed(() => S.shapes.find((s) => s.id === S.editingText));
const editorStyle = computed(() => {
  const s = editing.value;
  if (!s) return {};
  const p = toScreen({ x: s.x, y: s.y });
  return {
    left: `${p.x}px`, top: `${p.y}px`,
    fontSize: `${(s.fontSize ?? 10) * S.zoom * (s.h / (s.natH || 1))}px`,
    fontFamily: s.fontFamily,
    color: s.fill === "none" ? "#000" : s.fill,
    minWidth: `${s.w * S.zoom + 20}px`,
    height: `${s.h * S.zoom + 4}px`,
  };
});

async function editText(s: Shape) {
  S.selection = [s.id];
  S.editingText = s.id;
  await nextTick();
  setTimeout(() => editor.value?.focus()); // after the browser's own mousedown focus handling
}

function onTextInput(e: Event) {
  const s = editing.value;
  if (!s) return;
  s.text = (e.target as HTMLTextAreaElement).value;
  measureText(s);
}

function finishText() {
  if (!S.editingText) return;
  const s = editing.value;
  S.editingText = null;
  if (!s) return;
  if (!s.text?.trim()) {
    S.shapes = S.shapes.filter((x) => x.id !== s.id);
    S.selection = [];
  }
  commit();
}

// ---------- lifecycle ----------

const cursor = computed(() => ({
  pick: "default", shape: "default", pan: "grab", zoom: "zoom-in", text: "text", eyedropper: "copy",
}[S.tool as string] ?? "crosshair"));

let ro: ResizeObserver;
onMounted(() => {
  let first = true;
  ro = new ResizeObserver(([entry]) => {
    S.viewW = entry.contentRect.width;
    S.viewH = entry.contentRect.height;
    if (first && S.viewH > 0) (first = false, zoomPage());
  });
  ro.observe(svg.value!);
  window.addEventListener("keydown", onKey);
});
onBeforeUnmount(() => (ro.disconnect(), window.removeEventListener("keydown", onKey)));
watch(() => S.tool, () => cancelDimension());
watch(() => S.pageIndex, () => (cancelDimension(), (marquee.value = null)));

defineExpose({ finishText });
</script>

<template>
  <div class="relative flex-1 min-w-0 overflow-hidden bg-[#d9dbde]">
    <svg
      ref="svg"
      class="absolute inset-0 w-full h-full touch-none"
      :style="{ cursor }"
      @pointerdown="onDown"
      @pointermove="onMove"
      @pointerup="onUp"
      @pointercancel="onUp"
      @wheel.prevent="onWheel"
      @dblclick="onDblClick"
      @contextmenu.prevent
    >
      <defs>
        <pattern id="fd-grid" :width="S.grid.spacing" :height="S.grid.spacing" patternUnits="userSpaceOnUse">
          <path :d="`M ${S.grid.spacing} 0 L 0 0 0 ${S.grid.spacing}`" fill="none" stroke="#c7d2fe" :stroke-width="1 / S.zoom" />
        </pattern>
      </defs>
      <g :transform="`translate(${S.panX} ${S.panY}) scale(${S.zoom})`">
        <rect :x="4 / S.zoom" :y="4 / S.zoom" :width="S.page.w" :height="S.page.h" fill="#8d9096" />
        <rect :width="S.page.w" :height="S.page.h" fill="#fff" stroke="#6b6f76" :stroke-width="1 / S.zoom" />
        <rect
          v-if="S.grid.show && S.grid.spacing * S.zoom >= 4"
          :width="S.page.w" :height="S.page.h" fill="url(#fd-grid)" pointer-events="none"
        />
        <g id="fd-shapes">
          <ShapeView v-for="s in S.shapes" :key="s.id" :shape="s" :zoom="S.zoom" :hidden="s.id === S.editingText" />
        </g>
        <g v-if="draft" pointer-events="none" opacity="0.85">
          <ShapeView :shape="draft" :zoom="S.zoom" />
        </g>
        <rect
          v-if="marquee"
          :x="marquee.x" :y="marquee.y" :width="marquee.w" :height="marquee.h"
          fill="rgba(37,99,235,0.08)" stroke="#2563eb" :stroke-width="1 / S.zoom" :stroke-dasharray="`${4 / S.zoom} ${3 / S.zoom}`"
        />
      </g>

      <!-- guides and alignment hints (screen space) -->
      <g>
        <g v-for="g in screenGuides" :key="g.i" :data-guide="g.i >= 0 ? g.i : undefined" :style="{ cursor: g.axis === 'x' ? 'ew-resize' : 'ns-resize' }">
          <line
            v-if="g.axis === 'x'" :x1="g.s" :x2="g.s" y1="0" :y2="S.viewH" stroke="transparent" stroke-width="7"
            :pointer-events="S.tool === 'pick' && g.i >= 0 ? 'stroke' : 'none'"
          />
          <line
            v-else :x1="0" :x2="S.viewW" :y1="g.s" :y2="g.s" stroke="transparent" stroke-width="7"
            :pointer-events="S.tool === 'pick' && g.i >= 0 ? 'stroke' : 'none'"
          />
          <line
            v-if="g.axis === 'x'" :x1="g.s" :x2="g.s" y1="0" :y2="S.viewH" stroke="#2b7fff" stroke-dasharray="4 3" pointer-events="none"
          />
          <line v-else :x1="0" :x2="S.viewW" :y1="g.s" :y2="g.s" stroke="#2b7fff" stroke-dasharray="4 3" pointer-events="none" />
        </g>
        <template v-for="(l, i) in screenAlign" :key="`a${i}`">
          <line v-if="l.axis === 'x'" :x1="l.s" :x2="l.s" y1="0" :y2="S.viewH" stroke="#db2777" stroke-width="1" pointer-events="none" />
          <line v-else :x1="0" :x2="S.viewW" :y1="l.s" :y2="l.s" stroke="#db2777" stroke-width="1" pointer-events="none" />
        </template>
      </g>

      <g v-if="frame && S.tool === 'pick'">
        <polygon v-if="outline" :points="outline" fill="none" stroke="#2563eb" stroke-dasharray="4 3" pointer-events="none" />
        <template v-for="h in handles" :key="`${h.hx},${h.hy}`">
          <rect
            v-if="!S.rotateMode"
            :data-handle="`${h.hx},${h.hy}`"
            :x="h.x - 4" :y="h.y - 4" width="8" height="8"
            fill="#000" stroke="#fff" stroke-width="1"
            :style="{ cursor: h.hx && h.hy ? (h.hx === h.hy ? 'nwse-resize' : 'nesw-resize') : h.hx ? 'ew-resize' : 'ns-resize' }"
          />
          <g v-else data-handle="rot" :transform="`translate(${h.x} ${h.y})`" style="cursor: alias">
            <circle r="9" fill="transparent" />
            <path
              :transform="`rotate(${(Math.atan2(h.hy, h.hx) * 180) / Math.PI + 45})`"
              d="M -6 -2 A 6 6 0 0 1 2 -6 M 2 -6 l -3 -2 M 2 -6 l -2 3"
              fill="none" stroke="#000" stroke-width="2" stroke-linecap="round"
            />
          </g>
        </template>
        <g v-if="center" :transform="`translate(${center.x} ${center.y})`" pointer-events="none">
          <template v-if="S.rotateMode">
            <circle r="5" fill="#fff" stroke="#000" />
            <circle r="1.5" fill="#000" />
          </template>
          <path v-else d="M -4 -4 L 4 4 M 4 -4 L -4 4" stroke="#000" stroke-width="1.2" />
        </g>
      </g>

      <!-- shape tool: control lines, handles, nodes -->
      <g v-if="nodeView">
        <g v-for="h in nodeView.handles" :key="h.k">
          <line :x1="h.x1" :y1="h.y1" :x2="h.x2" :y2="h.y2" stroke="#2563eb" stroke-dasharray="3 2" pointer-events="none" />
          <circle :data-nh="h.k" :cx="h.x2" :cy="h.y2" r="4" fill="#fff" stroke="#2563eb" stroke-width="1.5" style="cursor: move" />
        </g>
        <rect
          v-for="n in nodeView.nodes" :key="n.k" :data-node="n.k"
          :x="n.x - (n.first ? 5 : 4)" :y="n.y - (n.first ? 5 : 4)" :width="n.first ? 10 : 8" :height="n.first ? 10 : 8"
          :fill="n.sel ? '#2563eb' : '#fff'" stroke="#2563eb" stroke-width="1.5" style="cursor: move"
        />
      </g>

      <rect
        v-if="snapScreen" :x="snapScreen.x - 6" :y="snapScreen.y - 6" width="12" height="12"
        fill="none" stroke="#e11d48" stroke-width="1.5" pointer-events="none"
      />

      <Rulers />
    </svg>

    <textarea
      v-if="editing"
      ref="editor"
      :value="editing.text"
      class="absolute p-0 m-0 bg-transparent outline outline-1 outline-dashed outline-blue-600 resize-none overflow-hidden whitespace-pre leading-[1.2]"
      :style="editorStyle"
      spellcheck="false"
      @input="onTextInput"
      @blur="finishText"
      @keydown.esc.prevent="finishText"
      @pointerdown.stop
    />
  </div>
</template>
