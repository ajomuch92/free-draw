<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount } from "vue";
import MenuBar from "./components/MenuBar.vue";
import PropertyBar from "./components/PropertyBar.vue";
import Toolbox from "./components/Toolbox.vue";
import Canvas from "./components/Canvas.vue";
import Docker from "./components/Docker.vue";
import Palette from "./components/Palette.vue";
import {
  state as S, selected, setTool, commit, undo, redo, cut, copy, paste, duplicate, duplicateInPlace, del, selectAll,
  toFront, toBack, forward, backward, zoomPage, zoomObjects, zoomBy, newDoc, openDoc, saveDoc, exportSVG,
  TYPE_NAMES, type Tool,
} from "./store";
import { convertToCurves, combine, breakApart, deleteNodes, moveNodes, worldPaths } from "./paths";

const ctrlKeys: Record<string, () => unknown> = {
  z: undo, y: redo, x: cut, c: copy, v: paste, d: duplicate, a: selectAll,
  n: newDoc, o: openDoc, s: saveDoc, e: exportSVG,
  pageup: forward, pagedown: backward,
  q: () => convertToCurves(), l: combine, k: breakApart,
};
const toolKeys: Record<string, Tool> = { f10: "shape", f5: "freehand", f6: "rect", f7: "ellipse", f8: "text", y: "polygon", z: "zoom", h: "pan" };

function onKey(e: KeyboardEvent) {
  const t = e.target as HTMLElement;
  if (t.closest("input, textarea, select")) return;
  const k = e.key.toLowerCase();

  if (e.ctrlKey || e.metaKey) {
    const fn = e.shiftKey && k === "z" ? redo : ctrlKeys[k];
    if (fn) (e.preventDefault(), fn());
    return;
  }
  if (e.shiftKey && (k === "pageup" || k === "pagedown")) return e.preventDefault(), k === "pageup" ? toFront() : toBack();
  if (e.shiftKey && k === "f4") return e.preventDefault(), zoomPage();

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

function onBeforeUnload(e: BeforeUnloadEvent) {
  if (S.dirty) e.preventDefault();
}

onMounted(() => {
  window.addEventListener("keydown", onKey);
  window.addEventListener("beforeunload", onBeforeUnload);
});
onBeforeUnmount(() => {
  window.removeEventListener("keydown", onKey);
  window.removeEventListener("beforeunload", onBeforeUnload);
});

const status = computed(() => {
  const n = selected.value.length;
  if (!n) return "Ningún objeto seleccionado";
  if (n > 1) return `${n} objetos seleccionados en Capa 1`;
  if (S.tool === "shape" && selected.value[0].type !== "path")
    return `${TYPE_NAMES[selected.value[0].type]} — conviértalo a curvas (Ctrl+Q) para editar sus nodos`;
  return `${TYPE_NAMES[selected.value[0].type]} en Capa 1${S.rotateMode ? " — clic de nuevo para escalar" : ""}`;
});
const one = computed(() => selected.value[0] ?? S.defaults);
const cursorText = computed(() => `( ${S.cursor.x.toFixed(2)} ; ${(S.page.h - S.cursor.y).toFixed(2)} ) mm`);
const swatch = (c: string) => (c === "none" ? "repeating-linear-gradient(45deg,#fff 0 3px,#ddd 3px 6px)" : c);
</script>

<template>
  <div class="h-full flex flex-col bg-neutral-100 text-neutral-800">
    <MenuBar />
    <PropertyBar />
    <div class="flex-1 min-h-0 flex">
      <Toolbox />
      <Canvas />
      <Docker />
      <Palette />
    </div>
    <footer class="h-6 shrink-0 flex items-center gap-4 px-2 bg-neutral-100 border-t border-neutral-300 text-[11px] text-neutral-600">
      <span class="w-44 tabular-nums">{{ cursorText }}</span>
      <span class="flex-1 truncate">{{ status }}</span>
      <span class="flex items-center gap-1.5">
        Relleno <span class="w-4 h-3 border border-neutral-400" :style="{ background: swatch(one.fill) }" />
      </span>
      <span class="flex items-center gap-1.5">
        Contorno <span class="w-4 h-3 border border-neutral-400" :style="{ background: swatch(one.stroke) }" />
        {{ one.stroke === "none" ? "Ninguno" : `${one.strokeWidth} mm` }}
      </span>
    </footer>
  </div>
</template>
