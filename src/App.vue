<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount } from "vue";
import MenuBar from "./components/MenuBar.vue";
import PropertyBar from "./components/PropertyBar.vue";
import Toolbox from "./components/Toolbox.vue";
import Canvas from "./components/Canvas.vue";
import Docker from "./components/Docker.vue";
import Palette from "./components/Palette.vue";
import PageTabs from "./components/PageTabs.vue";
import {
  state as S, selected, setTool, commit, undo, redo, cut, copy, paste, duplicate, duplicateInPlace, del, selectAll,
  toFront, toBack, forward, backward, zoomPage, zoomObjects, zoomBy, gotoPage, units,
  TYPE_NAMES, type Tool,
} from "./store";
import { combine, breakApart, deleteNodes, moveNodes, worldPaths } from "./paths";
import { newDoc, openDoc, saveDoc, exportSVG, guardWindowClose } from "./files";
import { toCurves } from "./fonts";
import { group, ungroup, align, type Edge } from "./arrange";

const ctrlKeys: Record<string, () => unknown> = {
  z: undo, y: redo, x: cut, c: copy, v: paste, d: duplicate, a: selectAll,
  n: newDoc, o: openDoc, s: () => saveDoc(), e: exportSVG,
  pageup: forward, pagedown: backward,
  q: toCurves, l: combine, k: breakApart, g: group, u: () => ungroup(),
};
const toolKeys: Record<string, Tool> = { f10: "shape", f5: "freehand", f6: "rect", f7: "ellipse", f8: "text", y: "polygon", z: "zoom", h: "pan" };
// CorelDRAW alignment keys, active with the pick tool and a selection
const alignKeys: Record<string, Edge> = { l: "left", r: "right", t: "top", b: "bottom", e: "centerY", c: "centerX" };

function onKey(e: KeyboardEvent) {
  const t = e.target as HTMLElement;
  if (t.closest("input, textarea, select")) return;
  const k = e.key.toLowerCase();

  if (e.ctrlKey || e.metaKey) {
    const fn = e.shiftKey && k === "z" ? redo : e.shiftKey && k === "s" ? () => saveDoc(true) : ctrlKeys[k];
    if (fn) (e.preventDefault(), fn());
    return;
  }
  if (e.altKey && k === "z") return e.preventDefault(), (S.snapTo.objects = !S.snapTo.objects);
  if (e.shiftKey && (k === "pageup" || k === "pagedown")) return e.preventDefault(), k === "pageup" ? toFront() : toBack();
  if (e.shiftKey && k === "f4") return e.preventDefault(), zoomPage();
  if (k === "pageup" || k === "pagedown") return e.preventDefault(), gotoPage(S.pageIndex + (k === "pageup" ? -1 : 1));

  const nudge = e.shiftKey ? 10 : 1; // mm
  const arrows: Record<string, [number, number]> = { arrowleft: [-1, 0], arrowright: [1, 0], arrowup: [0, -1], arrowdown: [0, 1] };
  if (arrows[k] && S.tool === "shape" && S.nodeSel.length && selected.value[0]?.type === "path") {
    e.preventDefault();
    const s = selected.value[0];
    moveNodes(s, worldPaths(s), S.nodeSel, arrows[k][0] * nudge, arrows[k][1] * nudge);
    commit();
    return;
  }
  if (arrows[k] && S.selection.length) {
    e.preventDefault();
    selected.value.forEach((s) => ((s.x += arrows[k][0] * nudge), (s.y += arrows[k][1] * nudge)));
    commit();
    return;
  }
  if (S.tool === "pick" && S.selection.length && !e.shiftKey) {
    if (alignKeys[k]) return e.preventDefault(), align([alignKeys[k]]);
    if (k === "p") return e.preventDefault(), align(["centerX", "centerY"], true);
  }
  if (toolKeys[k]) return e.preventDefault(), setTool(toolKeys[k]);
  switch (k) {
    case " ":
      e.preventDefault();
      setTool(S.tool === "pick" ? S.lastTool : "pick");
      break;
    case "delete":
    case "backspace":
      S.tool === "shape" && S.nodeSel.length ? deleteNodes() : del();
      break;
    case "escape":
      S.selection = [];
      S.rotateMode = false;
      S.nodeSel = [];
      break;
    case "f4":
      e.preventDefault();
      zoomObjects();
      break;
    case "+":
      e.code === "NumpadAdd" ? duplicateInPlace() : zoomBy(1.25);
      break;
    case "-":
      zoomBy(0.8);
      break;
  }
}

onMounted(() => {
  window.addEventListener("keydown", onKey);
  guardWindowClose();
});
onBeforeUnmount(() => window.removeEventListener("keydown", onKey));

const status = computed(() => {
  const n = selected.value.length;
  if (!n) return "Ningún objeto seleccionado";
  const groups = units().filter((u) => u.length > 1 && u.some((s) => S.selection.includes(s.id)));
  if (groups.length === 1 && groups[0].length === n) return `Grupo de ${n} objetos en Capa 1`;
  if (n > 1) return `${n} objetos seleccionados en Capa 1`;
  if (S.tool === "shape" && selected.value[0].type !== "path")
    return `${TYPE_NAMES[selected.value[0].type]} — conviértalo a curvas (Ctrl+Q) para editar sus nodos`;
  return `${TYPE_NAMES[selected.value[0].type]} en Capa 1${S.rotateMode ? " — clic de nuevo para escalar" : ""}`;
});
const one = computed(() => selected.value[0] ?? S.defaults);
const cursorText = computed(() => `( ${S.cursor.x.toFixed(2)} ; ${(S.page.h - S.cursor.y).toFixed(2)} ) mm`);
const swatch = (c: string) => (c === "none" ? "repeating-linear-gradient(45deg,#fff 0 3px,#ddd 3px 6px)" : c);
const fillSwatch = computed(() => (one.value.gradient ? `linear-gradient(90deg, ${one.value.gradient.from}, ${one.value.gradient.to})` : swatch(one.value.fill)));
</script>

<template>
  <div class="h-full flex flex-col bg-neutral-100 text-neutral-800">
    <MenuBar />
    <PropertyBar />
    <div class="flex-1 min-h-0 flex">
      <Toolbox />
      <div class="flex-1 min-w-0 flex flex-col">
        <Canvas />
        <PageTabs />
      </div>
      <Docker />
      <Palette />
    </div>
    <footer class="h-6 shrink-0 flex items-center gap-4 px-2 bg-neutral-100 border-t border-neutral-300 text-[11px] text-neutral-600">
      <span class="w-44 tabular-nums">{{ cursorText }}</span>
      <span class="flex-1 truncate">{{ status }}</span>
      <span class="flex items-center gap-1.5">
        Relleno <span class="w-4 h-3 border border-neutral-400" :style="{ background: fillSwatch }" />
      </span>
      <span class="flex items-center gap-1.5">
        Contorno <span class="w-4 h-3 border border-neutral-400" :style="{ background: swatch(one.stroke) }" />
        {{ one.stroke === "none" ? "Ninguno" : `${one.strokeWidth} mm` }}
      </span>
    </footer>
  </div>
</template>
