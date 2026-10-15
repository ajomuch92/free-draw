<script setup lang="ts">
import { computed } from "vue";
import { state as S } from "../store";

// Screen-space rulers in mm. Like CorelDRAW, x starts at the page's left edge and
// y grows upwards from the page's bottom edge. Pressing on a ruler drags out a guide.
const RULER = 20; // px, mirrored in Canvas.vue
const STEPS = [0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000];

function ticks(axis: "x" | "y") {
  const z = S.zoom, pan = axis === "x" ? S.panX : S.panY, len = axis === "x" ? S.viewW : S.viewH;
  const major = STEPS.find((s) => s * z >= 60) ?? 2000;
  const minor = major / (String(major).startsWith("2") ? 4 : 5);
  // label value <-> world coordinate
  const toWorld = (l: number) => (axis === "x" ? l : S.page.h - l);
  const w0 = (RULER - pan) / z, w1 = (len - pan) / z;
  const [l0, l1] = axis === "x" ? [w0, w1] : [S.page.h - w1, S.page.h - w0];
  const out: { pos: number; size: number; label?: string }[] = [];
  for (let l = Math.floor(l0 / minor) * minor; l <= l1; l += minor) {
    const pos = toWorld(l) * z + pan;
    const isMajor = Math.abs(l / major - Math.round(l / major)) < 1e-6;
    const isHalf = !isMajor && Math.abs((2 * l) / major - Math.round((2 * l) / major)) < 1e-6;
    out.push({ pos, size: isMajor ? RULER : isHalf ? 8 : 5, label: isMajor ? String(+l.toFixed(2)) : undefined });
  }
  return out;
}

const xs = computed(() => ticks("x"));
const ys = computed(() => ticks("y"));
const cx = computed(() => S.cursor.x * S.zoom + S.panX);
const cy = computed(() => S.cursor.y * S.zoom + S.panY);
</script>

<template>
  <g font-size="9" font-family="Segoe UI, sans-serif" fill="#525252">
    <g data-ruler="y" style="cursor: s-resize">
      <rect :x="0" :y="0" :width="S.viewW" :height="RULER" fill="#f5f5f5" stroke="#d4d4d4" />
      <template v-for="t in xs" :key="t.pos">
        <line v-if="t.pos > RULER" :x1="t.pos" :x2="t.pos" :y1="RULER - t.size" :y2="RULER" stroke="#737373" pointer-events="none" />
        <text v-if="t.label && t.pos > RULER" :x="t.pos + 2" y="9" pointer-events="none">{{ t.label }}</text>
      </template>
      <line :x1="cx" :x2="cx" y1="0" :y2="RULER" stroke="#2563eb" pointer-events="none" />
    </g>
    <g data-ruler="x" style="cursor: e-resize">
      <rect :x="0" :y="RULER" :width="RULER" :height="S.viewH" fill="#f5f5f5" stroke="#d4d4d4" />
      <template v-for="t in ys" :key="t.pos">
        <line v-if="t.pos > RULER" :y1="t.pos" :y2="t.pos" :x1="RULER - t.size" :x2="RULER" stroke="#737373" pointer-events="none" />
        <text
          v-if="t.label && t.pos > RULER" :transform="`translate(9 ${t.pos + 2}) rotate(-90)`" text-anchor="end" pointer-events="none"
        >{{ t.label }}</text>
      </template>
      <line :y1="cy" :y2="cy" x1="0" :x2="RULER" stroke="#2563eb" pointer-events="none" />
    </g>
    <rect width="20" height="20" fill="#e5e5e5" stroke="#d4d4d4" />
  </g>
</template>
