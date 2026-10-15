<script setup lang="ts">
import { ref } from "vue";
import { HueyRoot, SaturationArea, HueSlider, HexInput, ColorPreview, hueyColor } from "@hueycolor/vue";
import { applyStyle } from "../store";

// Close to CorelDRAW's default CMYK palette.
const colors = [
  "#000000", "#1a1a1a", "#4d4d4d", "#808080", "#b3b3b3", "#e6e6e6", "#ffffff",
  "#00a0e9", "#0068b7", "#1d2088", "#601986", "#920783", "#e4007f", "#e5004f",
  "#e60012", "#eb6100", "#f39800", "#fcc800", "#fff100", "#cfdb00", "#8fc31f",
  "#22ac38", "#009944", "#009b6b", "#009e96", "#00a0c1", "#7ecef4", "#f19ec2",
  "#facd89", "#c7b299", "#8c6239", "#603813", "#e6b422", "#ca9a24",
];

// User colours live in this browser/webview, not in the document.
const KEY = "fd-custom-colors";
const custom = ref<string[]>((() => {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]");
  } catch {
    return [];
  }
})());
const saveCustom = () => {
  try {
    localStorage.setItem(KEY, JSON.stringify(custom.value));
  } catch {}
};

const picker = ref(false);
const draft = ref(hueyColor("#3b82f6"));
function addCustom() {
  const c = draft.value.toHexString().toLowerCase();
  if (!custom.value.includes(c)) custom.value.push(c), saveCustom();
  picker.value = false;
}

// Left click = fill, right click = outline, as in CorelDRAW. Shift+click removes a custom colour.
function pick(e: MouseEvent, c: string) {
  if (e.shiftKey && custom.value.includes(c)) return (custom.value = custom.value.filter((x) => x !== c)), saveCustom();
  applyStyle(e.button === 2 ? { stroke: c } : { fill: c, gradient: undefined });
}
</script>

<template>
  <aside class="w-6 shrink-0 flex flex-col gap-px p-0.5 overflow-y-auto overflow-x-hidden bg-neutral-100 border-l border-neutral-300" title="Clic: relleno · Clic derecho: contorno">
    <button
      class="w-5 h-4 shrink-0 bg-white border border-neutral-400 grid place-items-center"
      aria-label="Sin color"
      @mousedown.prevent="pick($event, 'none')"
      @contextmenu.prevent
    >
      <svg viewBox="0 0 10 8" class="w-3 h-3"><path d="M1 1l8 6M9 1L1 7" stroke="#000" stroke-width="1" /></svg>
    </button>
    <button
      v-for="c in colors"
      :key="c"
      class="w-5 h-4 shrink-0 border border-neutral-400 hover:scale-125 hover:z-10 transition-transform"
      :style="{ background: c }"
      :aria-label="c"
      @mousedown.prevent="pick($event, c)"
      @contextmenu.prevent
    />
    <div class="h-px my-0.5 shrink-0 bg-neutral-400" />
    <button
      v-for="c in custom"
      :key="'u' + c"
      class="w-5 h-4 shrink-0 border border-neutral-400 hover:scale-125 hover:z-10 transition-transform"
      :style="{ background: c }"
      :aria-label="c"
      :title="`${c} · Mayús+clic: quitar`"
      @mousedown.prevent="pick($event, c)"
      @contextmenu.prevent
    />
    <button
      class="w-5 h-4 shrink-0 border border-dashed border-neutral-500 text-[11px] leading-none text-neutral-600 hover:bg-neutral-200"
      title="Agregar color personalizado" aria-label="Agregar color personalizado" :aria-expanded="picker"
      @click="picker = !picker"
    >+</button>
  </aside>

  <div v-if="picker" class="fixed right-8 bottom-10 z-50 w-56 p-2 flex flex-col gap-2 bg-white border border-neutral-300 shadow-lg text-xs" role="dialog" aria-label="Color personalizado">
    <HueyRoot v-model="draft">
      <SaturationArea />
      <HueSlider />
      <div class="flex items-center gap-2">
        <ColorPreview class="w-6 h-6 shrink-0" />
        <HexInput class="min-w-0 flex-1 h-6 px-1 border border-neutral-300 rounded-sm" />
      </div>
    </HueyRoot>
    <div class="flex justify-end gap-1">
      <button class="px-2 h-6 rounded hover:bg-neutral-200" @click="picker = false">Cancelar</button>
      <button class="px-2 h-6 rounded bg-blue-600 text-white hover:bg-blue-700" @click="addCustom">Agregar</button>
    </div>
  </div>
</template>
