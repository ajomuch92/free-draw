<script setup lang="ts">
import { computed, nextTick, onMounted, onBeforeUnmount, ref, shallowRef } from "vue";
import {
  state as S, selected, selectionFrame, corners, makeShape, fromPoints, measureText, commit,
  scaleShapes, rotateShapes, bounds, zoomBy, zoomPage,
  type Frame, type P, type Shape,
} from "../store";
import ShapeView from "./ShapeView.vue";

const svg = ref<SVGSVGElement>();
const editor = ref<HTMLTextAreaElement>();
const draft = shallowRef<Shape | null>(null);
const marquee = ref<{ x: number; y: number; w: number; h: number } | null>(null);

type Drag =
  | { kind: "pan"; sx: number; sy: number; px: number; py: number }
  | { kind: "move"; start: P; orig: Shape[]; moved: boolean; wasSelected: boolean }
  | { kind: "scale"; hx: number; hy: number; frame: Frame; orig: Shape[] }
  | { kind: "rotate"; frame: Frame; startAng: number; orig: Shape[] }
  | { kind: "marquee"; start: P; add: boolean }
  | { kind: "create"; start: P; pts: P[] };
let drag: Drag | null = null;

const rectOf = () => svg.value!.getBoundingClientRect();
function toWorld(e: { clientX: number; clientY: number }): P {
  const r = rectOf();
  return { x: (e.clientX - r.left - S.panX) / S.zoom, y: (e.clientY - r.top - S.panY) / S.zoom };
}
const toScreen = (p: P): P => ({ x: p.x * S.zoom + S.panX, y: p.y * S.zoom + S.panY });
const deg = (a: number) => (a * 180) / Math.PI;
const snap = (a: number, step = 15) => Math.round(a / step) * step;

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

// ---------- pointer ----------

function onDown(e: PointerEvent) {
  if (S.editingText) finishText();
  e.preventDefault();
  if (e.button === 2 && S.tool !== "zoom") return;
  svg.value!.setPointerCapture(e.pointerId);
  const p = toWorld(e);

  if (e.button === 1 || S.tool === "pan") {
    drag = { kind: "pan", sx: e.clientX, sy: e.clientY, px: S.panX, py: S.panY };
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
  if (S.tool !== "pick") {
    drag = { kind: "create", start: p, pts: [p] };
    return;
  }

  const handle = (e.target as Element).closest("[data-handle]")?.getAttribute("data-handle");
  const f = selectionFrame();
  if (handle && f) {
    const orig = selected.value.map((s) => ({ ...s }));
    const [hx, hy] = handle.split(",").map(Number);
    drag = S.rotateMode
      ? { kind: "rotate", frame: f, startAng: deg(Math.atan2(p.y - f.cy, p.x - f.cx)), orig }
      : { kind: "scale", hx, hy, frame: f, orig };
    return;
  }

  const hit = hitShape(e.target);
  if (!hit) {
    if (!e.shiftKey) (S.selection = [], S.rotateMode = false);
    drag = { kind: "marquee", start: p, add: e.shiftKey };
    return;
  }
  const wasSelected = S.selection.includes(hit.id);
  if (e.shiftKey) {
    S.selection = wasSelected ? S.selection.filter((id) => id !== hit.id) : [...S.selection, hit.id];
    return;
  }
  if (!wasSelected) (S.selection = [hit.id], S.rotateMode = false);
  drag = { kind: "move", start: p, orig: selected.value.map((s) => ({ ...s })), moved: false, wasSelected };
}

function onMove(e: PointerEvent) {
  const p = toWorld(e);
  S.cursor = p;
  if (!drag) return;
  const d = drag;
  switch (d.kind) {
    case "pan":
      S.panX = d.px + e.clientX - d.sx;
      S.panY = d.py + e.clientY - d.sy;
      break;
    case "move": {
      let dx = p.x - d.start.x, dy = p.y - d.start.y;
      if (!d.moved && Math.hypot(dx, dy) * S.zoom < 3) return;
      d.moved = true;
      if (e.ctrlKey) Math.abs(dx) > Math.abs(dy) ? (dy = 0) : (dx = 0);
      selected.value.forEach((s, i) => ((s.x = d.orig[i].x + dx), (s.y = d.orig[i].y + dy)));
      break;
    }
    case "scale": {
      const f = d.frame, r = (-f.rotation * Math.PI) / 180;
      const vx = p.x - f.cx, vy = p.y - f.cy;
      const lx = vx * Math.cos(r) - vy * Math.sin(r), ly = vx * Math.sin(r) + vy * Math.cos(r);
      const fromCenter = e.shiftKey;
      const ax = fromCenter ? 0 : (-d.hx * f.w) / 2, ay = fromCenter ? 0 : (-d.hy * f.h) / 2;
      let sx = d.hx && f.w > 1e-6 ? ((lx - ax) * d.hx) / (fromCenter ? f.w / 2 : f.w) : 1;
      let sy = d.hy && f.h > 1e-6 ? ((ly - ay) * d.hy) / (fromCenter ? f.h / 2 : f.h) : 1;
      if (d.hx && d.hy && !e.altKey) sx = sy = Math.max(sx, sy); // corners scale proportionally, like CorelDRAW
      scaleShapes(selected.value, d.orig, f, Math.max(sx, 0.01), Math.max(sy, 0.01), ax, ay);
      break;
    }
    case "rotate": {
      let a = deg(Math.atan2(p.y - d.frame.cy, p.x - d.frame.cx)) - d.startAng;
      if (e.ctrlKey) a = snap(a);
      rotateShapes(selected.value, d.orig, d.frame.cx, d.frame.cy, a);
      break;
    }
    case "marquee":
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
    return makeShape("freehand", fromPoints(d.pts));
  }
  if (t === "line") {
    let end = p;
    if (e.ctrlKey) {
      const len = Math.hypot(p.x - d.start.x, p.y - d.start.y);
      const a = (snap(deg(Math.atan2(p.y - d.start.y, p.x - d.start.x))) * Math.PI) / 180;
      end = { x: d.start.x + len * Math.cos(a), y: d.start.y + len * Math.sin(a) };
    }
    return makeShape("line", fromPoints([d.start, end]));
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
  if (!d) return;
  if (d.kind === "move") {
    if (d.moved) commit();
    else if (d.wasSelected && !e.shiftKey) S.rotateMode = !S.rotateMode; // second click toggles rotate handles
  } else if (d.kind === "scale" || d.kind === "rotate") {
    commit();
  } else if (d.kind === "marquee") {
    const m = marquee.value;
    marquee.value = null;
    if (!m) return;
    const inside = S.shapes.filter((s) => {
      if (!s.visible || s.locked) return false;
      const b = bounds([s]);
      return b.x >= m.x && b.y >= m.y && b.x + b.w <= m.x + m.w && b.y + b.h <= m.y + m.h;
    });
    S.selection = [...new Set([...(d.add ? S.selection : []), ...inside.map((s) => s.id)])];
  } else if (d.kind === "create") {
    const s = draft.value;
    draft.value = null;
    if (!s || Math.max(s.w, s.h) * S.zoom < 3) return;
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
  pick: "default", pan: "grab", zoom: "zoom-in", text: "text",
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
});
onBeforeUnmount(() => ro.disconnect());

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
      <g :transform="`translate(${S.panX} ${S.panY}) scale(${S.zoom})`">
        <rect :x="4 / S.zoom" :y="4 / S.zoom" :width="S.page.w" :height="S.page.h" fill="#8d9096" />
        <rect :width="S.page.w" :height="S.page.h" fill="#fff" stroke="#6b6f76" :stroke-width="1 / S.zoom" />
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
