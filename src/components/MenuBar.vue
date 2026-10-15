<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref } from "vue";
import {
  state as S, undo, redo, cut, copy, paste, duplicate, del, selectAll, toFront, toBack, forward, backward, flip,
  zoomPage, zoomObjects, zoomBy, addPage, deletePage, gotoPage,
} from "../store";
import { combine, booleanOp } from "../paths";
import { breakApart } from "../dimensions";
import { newDoc, openDoc, saveDoc, exportSVG, exportPNG, drawingBounds, importImage, recent, openRecent, baseName } from "../files";
import { toCurves } from "../fonts";
import { group, ungroup, align, distribute } from "../arrange";
import { t, lang, type Lang } from "../i18n";

type Item = { label: string; key?: string; title?: string; run: () => unknown; checked?: () => boolean } | "-";
// ---------- PNG export dialog ----------
const DPI = [72, 96, 150, 300, 600];
const png = ref<HTMLDialogElement>();
const dpiIndex = ref(3);
const transparent = ref(false);
const pngSize = ref({ w: 0, h: 0 }); // mm
function openPng() {
  const b = drawingBounds();
  pngSize.value = b ? { w: b.w, h: b.h } : { w: 0, h: 0 };
  png.value?.showModal();
}
const px = (mm: number) => Math.max(1, Math.round((mm / 25.4) * DPI[dpiIndex.value]));
function runPng() {
  png.value?.close();
  exportPNG(DPI[dpiIndex.value], transparent.value);
}

const menus = computed<{ label: string; items: Item[] }[]>(() => [
  { label: "Archivo", items: [
    { label: "Nuevo", key: "Ctrl+N", run: newDoc },
    { label: "Abrir…", key: "Ctrl+O", run: openDoc },
    // numbered like CorelDRAW; the number also keeps file names out of the translation lookup
    ...recent.value.map((p, i): Item => ({ label: `${i + 1} ${baseName(p)}`, title: p, run: () => openRecent(p) })),
    { label: "Guardar", key: "Ctrl+S", run: () => saveDoc() },
    { label: "Guardar como…", key: "Ctrl+Shift+S", run: () => saveDoc(true) },
    "-",
    { label: "Importar imagen…", key: "Ctrl+I", run: importImage },
    { label: "Exportar página a SVG…", key: "Ctrl+E", run: exportSVG },
    { label: "Exportar a PNG…", run: openPng },
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
    "-",
    { label: "Cuadrícula", run: () => (S.grid.show = !S.grid.show), checked: () => S.grid.show },
    { label: "Ajustar a la cuadrícula", run: () => (S.snapTo.grid = !S.snapTo.grid), checked: () => S.snapTo.grid },
    { label: "Ajustar a las guías", run: () => (S.snapTo.guides = !S.snapTo.guides), checked: () => S.snapTo.guides },
    { label: "Ajustar a los objetos", key: "Alt+Z", run: () => (S.snapTo.objects = !S.snapTo.objects), checked: () => S.snapTo.objects },
    { label: "Borrar todas las guías", run: () => ((S.guides = []), (S.dirty = true)) },
  ] },
  { label: "Diseño", items: [
    { label: "Insertar página después", run: () => addPage() },
    { label: "Insertar página antes", run: () => addPage(S.pageIndex) },
    { label: "Eliminar página", run: () => deletePage() },
    "-",
    { label: "Página anterior", key: "RePág", run: () => gotoPage(S.pageIndex - 1) },
    { label: "Página siguiente", key: "AvPág", run: () => gotoPage(S.pageIndex + 1) },
  ] },
  { label: "Objeto", items: [
    { label: "Agrupar", key: "Ctrl+G", run: group },
    { label: "Desagrupar", key: "Ctrl+U", run: () => ungroup() },
    { label: "Desagrupar todo", run: () => ungroup(true) },
    "-",
    { label: "Alinear a la izquierda", key: "L", run: () => align(["left"]) },
    { label: "Alinear a la derecha", key: "R", run: () => align(["right"]) },
    { label: "Alinear arriba", key: "T", run: () => align(["top"]) },
    { label: "Alinear abajo", key: "B", run: () => align(["bottom"]) },
    { label: "Alinear centros horizontalmente", key: "E", run: () => align(["centerY"]) },
    { label: "Alinear centros verticalmente", key: "C", run: () => align(["centerX"]) },
    { label: "Centrar en la página", key: "P", run: () => align(["centerX", "centerY"], true) },
    { label: "Distribuir horizontalmente", run: () => distribute("x") },
    { label: "Distribuir verticalmente", run: () => distribute("y") },
    "-",
    { label: "Al frente de la página", key: "Shift+RePág", run: toFront },
    { label: "Al fondo de la página", key: "Shift+AvPág", run: toBack },
    { label: "Adelante uno", key: "Ctrl+RePág", run: forward },
    { label: "Atrás uno", key: "Ctrl+AvPág", run: backward },
    "-",
    { label: "Reflejar horizontalmente", run: () => flip("x") },
    { label: "Reflejar verticalmente", run: () => flip("y") },
    "-",
    { label: "Convertir a curvas", key: "Ctrl+Q", run: toCurves },
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
]);

const open = ref<number | null>(null);
function run(item: Item) {
  open.value = null;
  if (item !== "-") item.run();
}
const close = (e: PointerEvent) => !(e.target as Element).closest("[data-menubar]") && (open.value = null);
onMounted(() => window.addEventListener("pointerdown", close));
onBeforeUnmount(() => window.removeEventListener("pointerdown", close));

const setLang = (e: Event) => (lang.value = (e.target as HTMLSelectElement).value as Lang);
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
        >{{ t(m.label) }}</button>
        <ul v-if="open === i" class="absolute left-0 top-full z-50 min-w-60 py-1 bg-white border border-neutral-300 shadow-lg" role="menu">
          <template v-for="(it, j) in m.items" :key="j">
            <li v-if="it === '-'" class="my-1 h-px bg-neutral-200" />
            <li v-else>
              <button class="w-full flex justify-between gap-6 px-4 py-1 text-left hover:bg-blue-100" role="menuitem" :title="it.title" @click="run(it)">
                <span class="flex items-center gap-2"><span class="w-3 text-blue-700">{{ it.checked?.() ? "✓" : "" }}</span>{{ t(it.label) }}</span><span class="text-neutral-500">{{ it.key && t(it.key) }}</span>
              </button>
            </li>
          </template>
        </ul>
      </div>
      <span class="ml-auto pr-2 text-neutral-500">{{ S.fileName }}{{ S.dirty ? " *" : "" }}</span>
      <select class="h-6 mr-1 border border-neutral-300 rounded-sm text-neutral-700" :aria-label="t('Idioma')" :value="lang" @change="setLang">
        <option value="es">ES</option>
        <option value="en">EN</option>
      </select>
    </div>

    <!-- Standard toolbar -->
    <div class="flex items-center gap-0.5 h-9 px-1.5 border-t border-neutral-200">
      <button :class="tb" :title="t('Nuevo (Ctrl+N)')" :aria-label="t('Nuevo')" @click="newDoc">
        <svg viewBox="0 0 24 24" class="w-4.5 h-4.5" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M6 3h8l4 4v14H6zM14 3v4h4" /></svg>
      </button>
      <button :class="tb" :title="t('Abrir (Ctrl+O)')" :aria-label="t('Abrir')" @click="openDoc">
        <svg viewBox="0 0 24 24" class="w-4.5 h-4.5" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M3 6h6l2 2h10v11H3z" /></svg>
      </button>
      <button :class="tb" :title="t('Guardar (Ctrl+S)')" :aria-label="t('Guardar')" @click="saveDoc()">
        <svg viewBox="0 0 24 24" class="w-4.5 h-4.5" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 4h13l3 3v13H4zM8 4v5h8V4M8 20v-6h8v6" /></svg>
      </button>
      <div class="w-px h-5 mx-1 bg-neutral-300" />
      <button :class="tb" :title="t('Deshacer (Ctrl+Z)')" :aria-label="t('Deshacer')" @click="undo">
        <svg viewBox="0 0 24 24" class="w-4.5 h-4.5" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M9 14L4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3" /></svg>
      </button>
      <button :class="tb" :title="t('Rehacer (Ctrl+Y)')" :aria-label="t('Rehacer')" @click="redo">
        <svg viewBox="0 0 24 24" class="w-4.5 h-4.5" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M15 14l5-5-5-5M20 9H10a6 6 0 0 0 0 12h3" /></svg>
      </button>
      <div class="w-px h-5 mx-1 bg-neutral-300" />
      <button :class="tb" :title="t('Exportar SVG (Ctrl+E)')" :aria-label="t('Exportar SVG')" @click="exportSVG">
        <svg viewBox="0 0 24 24" class="w-4.5 h-4.5" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M12 3v12M7 10l5 5 5-5M4 19h16" /></svg>
      </button>
      <div class="w-px h-5 mx-1 bg-neutral-300" />
      <span class="px-1.5 text-neutral-600 tabular-nums" :title="t('Nivel de zoom')">{{ zoomPct() }}%</span>
      <button :class="tb" :title="t('Alejar')" :aria-label="t('Alejar')" @click="zoomBy(0.8)">−</button>
      <button :class="tb" :title="t('Acercar')" :aria-label="t('Acercar')" @click="zoomBy(1.25)">+</button>
      <button class="px-2 h-7 rounded hover:bg-neutral-200" :title="t('Zoom a página (Shift+F4)')" @click="zoomPage">{{ t('Página') }}</button>
      <div class="w-px h-5 mx-1 bg-neutral-300" />
      <button :class="[tb, S.grid.show && 'bg-blue-100 ring-1 ring-blue-300']" :title="t('Mostrar cuadrícula')" :aria-label="t('Mostrar cuadrícula')" :aria-pressed="S.grid.show" @click="S.grid.show = !S.grid.show">
        <svg viewBox="0 0 24 24" class="w-4.5 h-4.5" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M4 4h16v16H4zM9.3 4v16M14.7 4v16M4 9.3h16M4 14.7h16" /></svg>
      </button>
      <span class="pl-1 pr-0.5 text-neutral-500">{{ t('Ajustar a:') }}</span>
      <button
        v-for="o in ([['grid', 'Cuadrícula'], ['guides', 'Guías'], ['objects', 'Objetos']] as const)" :key="o[0]"
        class="px-1.5 h-6 rounded" :class="S.snapTo[o[0]] ? 'bg-blue-100 ring-1 ring-blue-300 text-blue-800' : 'hover:bg-neutral-200'"
        :aria-pressed="S.snapTo[o[0]]" @click="S.snapTo[o[0]] = !S.snapTo[o[0]]"
      >{{ t(o[1]) }}</button>
      <label class="flex items-center gap-1 pl-1 text-neutral-500" :title="t('Separación de la cuadrícula')">
        <input
          type="number" min="0.5" step="0.5" class="w-12 h-6 px-1 border border-neutral-300 rounded-sm bg-white text-neutral-800"
          :value="S.grid.spacing" @change="S.grid.spacing = Math.max(0.5, parseFloat(($event.target as HTMLInputElement).value) || 5)"
        /> mm
      </label>
    </div>

    <dialog ref="png" class="m-auto w-80 p-4 rounded border border-neutral-300 shadow-xl text-xs text-neutral-800 backdrop:bg-black/25">
      <h2 class="mb-3 text-sm font-semibold">{{ t('Exportar a PNG') }}</h2>
      <label class="flex flex-col gap-1">
        <span class="flex justify-between">{{ t('Resolución') }} <b class="tabular-nums">{{ DPI[dpiIndex] }} {{ t('ppp') }}</b></span>
        <input v-model.number="dpiIndex" type="range" min="0" :max="DPI.length - 1" step="1" />
        <span class="flex justify-between text-neutral-500 tabular-nums"><span v-for="d in DPI" :key="d">{{ d }}</span></span>
      </label>
      <label class="mt-3 flex items-center gap-1.5"><input v-model="transparent" type="checkbox" /> {{ t('Fondo transparente') }}</label>
      <p class="mt-3 text-neutral-500">
        {{ pngSize.w ? t('Solo los objetos, recortados a su tamaño: {w} × {h} px.', { w: px(pngSize.w), h: px(pngSize.h) }) : t('No hay objetos para exportar.') }}
      </p>
      <div class="mt-4 flex justify-end gap-1">
        <button class="px-3 h-7 rounded hover:bg-neutral-200" @click="png?.close()">{{ t('Cancelar') }}</button>
        <button class="px-3 h-7 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40" :disabled="!pngSize.w" @click="runPng">{{ t('Exportar') }}</button>
      </div>
    </dialog>
  </header>
</template>
