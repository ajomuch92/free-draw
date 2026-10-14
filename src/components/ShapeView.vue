<script setup lang="ts">
import { computed } from "vue";
import { type Shape, polygonPoints } from "../store";

const props = defineProps<{ shape: Shape; zoom: number; hidden?: boolean }>();

const transform = computed(() => {
  const s = props.shape;
  let t = `translate(${s.x} ${s.y}) rotate(${s.rotation} ${s.w / 2} ${s.h / 2})`;
  if (s.flipX || s.flipY)
    t += ` translate(${s.flipX ? s.w : 0} ${s.flipY ? s.h : 0}) scale(${s.flipX ? -1 : 1} ${s.flipY ? -1 : 1})`;
  return t;
});

const points = computed(() => {
  const s = props.shape;
  const pts = s.type === "polygon" ? polygonPoints(s.sides ?? 5) : (s.points ?? []);
  return pts.map(([a, b]) => `${a * s.w},${b * s.h}`).join(" ");
});

const paint = computed(() => {
  const s = props.shape, w = s.strokeWidth;
  return {
    fill: s.fill,
    stroke: s.stroke,
    "stroke-width": w,
    "stroke-dasharray": s.dash === "dash" ? `${w * 4} ${w * 2}` : s.dash === "dot" ? `${w} ${w * 2}` : undefined,
    "stroke-linecap": s.dash === "dot" ? "round" : undefined,
    "stroke-linejoin": "round",
  } as const;
});

const lines = computed(() => (props.shape.text ?? "").split("\n"));
</script>

<template>
  <g
    :data-id="shape.id"
    :transform="transform"
    :opacity="hidden ? 0 : shape.opacity"
    :style="shape.visible ? undefined : 'display:none'"
  >
    <rect v-if="shape.type === 'rect'" :width="shape.w" :height="shape.h" :rx="shape.radius" v-bind="paint" pointer-events="all" />
    <ellipse
      v-else-if="shape.type === 'ellipse'"
      :cx="shape.w / 2" :cy="shape.h / 2" :rx="shape.w / 2" :ry="shape.h / 2"
      v-bind="paint" pointer-events="all"
    />
    <polygon v-else-if="shape.type === 'polygon'" :points="points" v-bind="paint" pointer-events="all" />
    <template v-else-if="shape.type === 'line' || shape.type === 'freehand'">
      <polyline :points="points" v-bind="paint" />
      <polyline class="fd-hit" :points="points" fill="none" stroke="transparent" :stroke-width="8 / zoom" />
    </template>
    <g v-else-if="shape.type === 'text'" :transform="`scale(${shape.w / (shape.natW || 1)} ${shape.h / (shape.natH || 1)})`">
      <text :font-size="shape.fontSize" :font-family="shape.fontFamily" v-bind="paint" style="white-space: pre">
        <tspan v-for="(l, i) in lines" :key="i" x="0" :dy="(shape.fontSize ?? 0) * (i ? 1.2 : 0.9)">{{ l || " " }}</tspan>
      </text>
      <rect class="fd-hit" :width="shape.natW" :height="shape.natH" fill="transparent" />
    </g>
  </g>
</template>
