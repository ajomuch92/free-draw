<script setup lang="ts">
import { applyStyle } from "../store";

// Close to CorelDRAW's default CMYK palette.
const colors = [
  "#000000", "#1a1a1a", "#4d4d4d", "#808080", "#b3b3b3", "#e6e6e6", "#ffffff",
  "#00a0e9", "#0068b7", "#1d2088", "#601986", "#920783", "#e4007f", "#e5004f",
  "#e60012", "#eb6100", "#f39800", "#fcc800", "#fff100", "#cfdb00", "#8fc31f",
  "#22ac38", "#009944", "#009b6b", "#009e96", "#00a0c1", "#7ecef4", "#f19ec2",
  "#facd89", "#c7b299", "#8c6239", "#603813", "#e6b422", "#ca9a24",
];

// Left click = fill, right click = outline, as in CorelDRAW.
const pick = (e: MouseEvent, c: string) => applyStyle(e.button === 2 ? { stroke: c } : { fill: c, gradient: undefined });
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
  </aside>
</template>
