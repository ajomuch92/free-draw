<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from "vue";
import {
  state as S, newDoc, openDoc, saveDoc, exportSVG, exportPNG, undo, redo, cut, copy, paste, duplicate, del,
  selectAll, toFront, toBack, forward, backward, flip, zoomPage, zoomObjects, zoomBy,
} from "../store";
import { convertToCurves, combine, breakApart, booleanOp } from "../paths";

type Item = { label: string; key?: string; run: () => unknown } | "-";
const menus: { label: string; items: Item[] }[] = [
  { label: "Archivo", items: [
    { label: "Nuevo", key: "Ctrl+N", run: newDoc },
    { label: "Abrir…", key: "Ctrl+O", run: openDoc },
    { label: "Guardar", key: "Ctrl+S", run: saveDoc },
    "-",
    { label: "Exportar SVG…", key: "Ctrl+E", run: exportSVG },
    { label: "Exportar PNG (300 ppp)…", run: () => exportPNG() },
  ] },
  { label: "Editar", items: [
    { label: "Deshacer", key: "Ctrl+Z", run: undo },
    { label: "Rehacer", key: "Ctrl+Y", run: redo },
    "-",
    { label: "Cortar", key: "Ctrl+X", run: cut },
    { label: "Copiar", key: "Ctrl+C", run: copy },
    { label: "Pegar", key: "Ctrl+V", run: paste },
    { label: "Duplicar", key: "Ctrl+D", run: duplicate },
    { label: "Eliminar", key: "Supr", run: del },
    "-",
    { label: "Seleccionar todo", key: "Ctrl+A", run: selectAll },
  ] },
  { label: "Ver", items: [
    { label: "Acercar", key: "+", run: () => zoomBy(1.25) },
    { label: "Alejar", key: "-", run: () => zoomBy(0.8) },
    { label: "Zoom a página", key: "Shift+F4", run: zoomPage },
    { label: "Zoom a objetos", key: "F4", run: zoomObjects },
  ] },
  { label: "Objeto", items: [
    { label: "Al frente de la página", key: "Shift+RePág", run: toFront },
    { label: "Al fondo de la página", key: "Shift+AvPág", run: toBack },
    { label: "Adelante uno", key: "Ctrl+RePág", run: forward },
    { label: "Atrás uno", key: "Ctrl+AvPág", run: backward },
    "-",
    { label: "Reflejar horizontalmente", run: () => flip("x") },
    { label: "Reflejar verticalmente", run: () => flip("y") },
    "-",
    { label: "Convertir a curvas", key: "Ctrl+Q", run: () => convertToCurves() },
    { label: "Combinar", key: "Ctrl+L", run: combine },
    { label: "Separar", key: "Ctrl+K", run: breakApart },
  ] },
  { label: "Dar forma", items: [
    { label: "Soldar", run: () => booleanOp("weld") },
    { label: "Recortar", run: () => booleanOp("trim") },
    { label: "Intersecar", run: () => booleanOp("intersect") },
    { label: "Simplificar", run: () => booleanOp("simplify") },
    { label: "Frente menos detrás", run: () => booleanOp("frontMinusBack") },
    { label: "Detrás menos frente", run: () => booleanOp("backMinusFront") },
  ] },
];

const open = ref<number | null>(null);
function run(item: Item) {
  open.value = null;
  if (item !== "-") item.run();
}
const close = (e: PointerEvent) => !(e.target as Element).closest("[data-menubar]") && (open.value = null);
onMounted(() => window.addEventListener("pointerdown", close));
onBeforeUnmount(() => window.removeEventListener("pointerdown", close));

const zoomPct = () => Math.round((S.zoom / (96 / 25.4)) * 100); // 100% = real size at 96 dpi
const tb = "w-7 h-7 grid place-items-center rounded hover:bg-neutral-200 text-neutral-700";
</script>

<template>
  <header data-menubar class="shrink-0 bg-neutral-100 border-b border-neutral-300 text-xs text-neutral-800">
    <div class="flex items-center h-7 px-1">
      <span class="px-2 font-bold text-green-700 tracking-tight">FreeDraw</span>
      <div v-for="(m, i) in menus" :key="m.label" class="relative">
        <button
          class="px-2.5 h-6 rounded-sm"
          :class="open === i ? 'bg-blue-100' : 'hover:bg-neutral-200'"
          :aria-expanded="open === i"
          @click="open = open === i ? null : i"
          @mouseenter="open !== null && (open = i)"
        >{{ m.label }}</button>
        <ul v-if="open === i" class="absolute left-0 top-full z-50 min-w-60 py-1 bg-white border border-neutral-300 shadow-lg" role="menu">
          <template v-for="(it, j) in m.items" :key="j">
            <li v-if="it === '-'" class="my-1 h-px bg-neutral-200" />
            <li v-else>
              <button class="w-full flex justify-between gap-6 px-4 py-1 text-left hover:bg-blue-100" role="menuitem" @click="run(it)">
                <span>{{ it.label }}</span><span class="text-neutral-500">{{ it.key }}</span>
              </button>
            </li>
          </template>
        </ul>
      </div>
      <span class="ml-auto pr-2 text-neutral-500">{{ S.fileName }}{{ S.dirty ? " *" : "" }}</span>
    </div>

    <!-- Standard toolbar -->
    <div class="flex items-center gap-0.5 h-9 px-1.5 border-t border-neutral-200">
      <button :class="tb" title="Nuevo (Ctrl+N)" aria-label="Nuevo" @click="newDoc">
        <svg viewBox="0 0 24 24" class="w-4.5 h-4.5" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M6 3h8l4 4v14H6zM14 3v4h4" /></svg>
      </button>
      <button :class="tb" title="Abrir (Ctrl+O)" aria-label="Abrir" @click="openDoc">
        <svg viewBox="0 0 24 24" class="w-4.5 h-4.5" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M3 6h6l2 2h10v11H3z" /></svg>
      </button>
      <button :class="tb" title="Guardar (Ctrl+S)" aria-label="Guardar" @click="saveDoc">
        <svg viewBox="0 0 24 24" class="w-4.5 h-4.5" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 4h13l3 3v13H4zM8 4v5h8V4M8 20v-6h8v6" /></svg>
      </button>
      <div class="w-px h-5 mx-1 bg-neutral-300" />
      <button :class="tb" title="Deshacer (Ctrl+Z)" aria-label="Deshacer" @click="undo">
        <svg viewBox="0 0 24 24" class="w-4.5 h-4.5" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M9 14L4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3" /></svg>
      </button>
      <button :class="tb" title="Rehacer (Ctrl+Y)" aria-label="Rehacer" @click="redo">
        <svg viewBox="0 0 24 24" class="w-4.5 h-4.5" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M15 14l5-5-5-5M20 9H10a6 6 0 0 0 0 12h3" /></svg>
      </button>
      <div class="w-px h-5 mx-1 bg-neutral-300" />
      <button :class="tb" title="Exportar SVG (Ctrl+E)" aria-label="Exportar SVG" @click="exportSVG">
        <svg viewBox="0 0 24 24" class="w-4.5 h-4.5" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M12 3v12M7 10l5 5 5-5M4 19h16" /></svg>
      </button>
      <div class="w-px h-5 mx-1 bg-neutral-300" />
      <span class="px-1.5 text-neutral-600 tabular-nums" title="Nivel de zoom">{{ zoomPct() }}%</span>
      <button :class="tb" title="Alejar" aria-label="Alejar" @click="zoomBy(0.8)">−</button>
      <button :class="tb" title="Acercar" aria-label="Acercar" @click="zoomBy(1.25)">+</button>
      <button class="px-2 h-7 rounded hover:bg-neutral-200" title="Zoom a página (Shift+F4)" @click="zoomPage">Página</button>
    </div>
  </header>
</template>
