<script setup lang="ts">
import { computed, ref } from "vue";
import {
  state as S, selected, selectionFrame, setFrame, setPage, flip, applyStyle, commit, measureText,
  PAGE_SIZES, FONTS, PT,
} from "../store";

const frame = computed(() => selectionFrame());
const one = computed(() => (selected.value.length === 1 ? selected.value[0] : null));
const lockRatio = ref(true);
const landscape = computed(() => S.page.w > S.page.h);
const r2 = (n: number) => Math.round(n * 100) / 100;
const num = (e: Event) => parseFloat((e.target as HTMLInputElement).value);

// CorelDRAW shows the object centre with Y measured up from the page bottom,
// and angles counter-clockwise.
const fx = computed(() => r2(frame.value?.cx ?? 0));
const fy = computed(() => r2(S.page.h - (frame.value?.cy ?? 0)));
const angle = computed(() => r2((360 - (frame.value?.rotation ?? 0)) % 360));

function setSize(axis: "w" | "h", v: number) {
  const f = frame.value;
  if (!f || !(v > 0)) return;
  if (!lockRatio.value) return setFrame({ [axis]: v });
  const k = v / (axis === "w" ? f.w : f.h);
  setFrame({ w: f.w * k, h: f.h * k });
}

const widths = [0.1, 0.2, 0.25, 0.5, 0.75, 1, 1.5, 2, 2.5, 3, 5, 8];

function setShapeProp(key: "radius" | "sides", v: number) {
  if (!one.value || !(v >= 0)) return;
  one.value[key] = key === "sides" ? Math.min(50, Math.max(3, Math.round(v))) : v;
  commit();
}

function setFont(patch: { fontFamily?: string; fontSize?: number }) {
  const s = one.value;
  if (!s || s.type !== "text") return;
  Object.assign(s, patch);
  measureText(s);
  commit();
}
</script>

<template>
  <div class="h-10 shrink-0 flex items-center gap-3 px-2 bg-neutral-50 border-b border-neutral-300 text-[11px] text-neutral-700 [&_input]:h-6 [&_input]:px-1 [&_input]:border [&_input]:border-neutral-300 [&_input]:rounded-sm [&_input]:bg-white [&_select]:h-6 [&_select]:border [&_select]:border-neutral-300 [&_select]:rounded-sm [&_select]:bg-white">
    <!-- No selection: page settings -->
    <template v-if="!frame">
      <select :value="S.page.size" aria-label="Tamaño de página" @change="setPage(($event.target as HTMLSelectElement).value, landscape)">
        <option v-for="(_, k) in PAGE_SIZES" :key="k" :value="k">{{ k }}</option>
      </select>
      <span class="tabular-nums">{{ r2(S.page.w) }} × {{ r2(S.page.h) }} mm</span>
      <div class="flex gap-0.5">
        <button class="px-2 h-6 rounded-sm border" :class="!landscape ? 'bg-blue-100 border-blue-400' : 'border-neutral-300 bg-white'" @click="setPage(S.page.size, false)">Vertical</button>
        <button class="px-2 h-6 rounded-sm border" :class="landscape ? 'bg-blue-100 border-blue-400' : 'border-neutral-300 bg-white'" @click="setPage(S.page.size, true)">Horizontal</button>
      </div>
      <span class="text-neutral-500">Unidades: milímetros</span>
    </template>

    <!-- Selection: transform -->
    <template v-else>
      <div class="grid grid-cols-[auto_4.5rem] gap-x-1 items-center leading-none">
        <label for="pb-x">X:</label>
        <input id="pb-x" type="number" step="0.1" :value="fx" class="text-[11px] !h-[17px]" @change="setFrame({ cx: num($event) })" />
        <label for="pb-y">Y:</label>
        <input id="pb-y" type="number" step="0.1" :value="fy" class="text-[11px] !h-[17px]" @change="setFrame({ cy: S.page.h - num($event) })" />
      </div>
      <div class="grid grid-cols-[auto_4.5rem] gap-x-1 items-center leading-none">
        <label for="pb-w">An:</label>
        <input id="pb-w" type="number" step="0.1" min="0" :value="r2(frame.w)" class="text-[11px] !h-[17px]" @change="setSize('w', num($event))" />
        <label for="pb-h">Al:</label>
        <input id="pb-h" type="number" step="0.1" min="0" :value="r2(frame.h)" class="text-[11px] !h-[17px]" @change="setSize('h', num($event))" />
      </div>
      <button
        class="w-6 h-6 grid place-items-center rounded-sm border"
        :class="lockRatio ? 'bg-blue-100 border-blue-400' : 'border-neutral-300 bg-white'"
        :title="lockRatio ? 'Proporción bloqueada' : 'Proporción libre'"
        :aria-pressed="lockRatio"
        @click="lockRatio = !lockRatio"
      >
        <svg viewBox="0 0 24 24" class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="5" y="11" width="14" height="9" rx="1" />
          <path :d="lockRatio ? 'M8 11V8a4 4 0 0 1 8 0v3' : 'M8 11V8a4 4 0 0 1 8 0'" />
        </svg>
      </button>

      <div class="w-px h-6 bg-neutral-300" />
      <label class="flex items-center gap-1" title="Ángulo de rotación">
        <svg viewBox="0 0 24 24" class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 12a8 8 0 1 1-3-6.2M20 4v5h-5" /></svg>
        <input type="number" step="1" :value="angle" class="w-14" aria-label="Ángulo" @change="setFrame({ rotation: 360 - num($event) })" />°
      </label>
      <button class="w-7 h-6 rounded-sm border border-neutral-300 bg-white hover:bg-neutral-100" title="Reflejar horizontalmente" aria-label="Reflejar horizontalmente" @click="flip('x')">⇋</button>
      <button class="w-7 h-6 rounded-sm border border-neutral-300 bg-white hover:bg-neutral-100 rotate-90" title="Reflejar verticalmente" aria-label="Reflejar verticalmente" @click="flip('y')">⇋</button>

      <div class="w-px h-6 bg-neutral-300" />
      <label class="flex items-center gap-1" title="Ancho de contorno">
        <svg viewBox="0 0 24 24" class="w-4 h-4" stroke="currentColor"><path d="M3 6h18" stroke-width="1" /><path d="M3 12h18" stroke-width="2.5" /><path d="M3 19h18" stroke-width="4" /></svg>
        <select :value="selected[0]?.strokeWidth" aria-label="Ancho de contorno" @change="applyStyle({ strokeWidth: num($event) })">
          <option v-if="!widths.includes(selected[0]?.strokeWidth)" :value="selected[0]?.strokeWidth">{{ r2(selected[0]?.strokeWidth ?? 0) }} mm</option>
          <option v-for="w in widths" :key="w" :value="w">{{ w }} mm</option>
        </select>
      </label>

      <template v-if="one?.type === 'rect'">
        <div class="w-px h-6 bg-neutral-300" />
        <label class="flex items-center gap-1">Esquinas: <input type="number" min="0" step="0.5" :value="one.radius ?? 0" class="w-14" @change="setShapeProp('radius', num($event))" /> mm</label>
      </template>
      <template v-if="one?.type === 'polygon'">
        <div class="w-px h-6 bg-neutral-300" />
        <label class="flex items-center gap-1">Lados: <input type="number" min="3" max="50" :value="one.sides" class="w-12" @change="setShapeProp('sides', num($event))" /></label>
      </template>
      <template v-if="one?.type === 'text'">
        <div class="w-px h-6 bg-neutral-300" />
        <select :value="one.fontFamily" aria-label="Fuente" class="w-36" @change="setFont({ fontFamily: ($event.target as HTMLSelectElement).value })">
          <option v-for="f in FONTS" :key="f" :value="f" :style="{ fontFamily: f }">{{ f }}</option>
        </select>
        <label class="flex items-center gap-1">
          <input type="number" min="1" step="1" :value="r2((one.fontSize ?? 0) / PT)" class="w-14" aria-label="Tamaño de fuente" @change="setFont({ fontSize: num($event) * PT })" /> pt
        </label>
      </template>
    </template>
  </div>
</template>
