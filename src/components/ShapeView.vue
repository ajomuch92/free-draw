<script setup lang="ts">
import { computed } from "vue";
import { type Shape, polygonPoints } from "../store";
import { pathD, curvesOf } from "../paths";
import { dimensionGeometry } from "../dimensions";

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
  return polygonPoints(s.sides ?? 5).map(([a, b]) => `${a * s.w},${b * s.h}`).join(" ");
});

const gid = computed(() => `fdg-${props.shape.id}`);
const paint = computed(() => {
  const s = props.shape, w = s.strokeWidth;
  return {
    fill: s.gradient ? `url(#${gid.value})` : s.fill,
    stroke: s.stroke,
    "stroke-width": w,
    "stroke-dasharray": s.dash === "dash" ? `${w * 4} ${w * 2}` : s.dash === "dot" ? `${w} ${w * 2}` : undefined,
    "stroke-linecap": s.cap ?? (s.dash === "dot" ? "round" : "butt"),
    "stroke-linejoin": s.join ?? "round",
  } as const;
});

// Linear gradient axis across the bbox; angle counter-clockwise, 0° = left to right.
const axis = computed(() => {
  const a = ((props.shape.gradient?.angle ?? 0) * Math.PI) / 180, c = Math.cos(a) / 2, s = Math.sin(a) / 2;
  return { x1: 0.5 - c, y1: 0.5 + s, x2: 0.5 + c, y2: 0.5 - s };
});

// Arrowheads sized in mm, never smaller than 2.5 mm.
const arrowSize = computed(() => Math.max(2.5, props.shape.strokeWidth * 5));
const marker = (end: "s" | "e") => {
  const a = end === "s" ? props.shape.arrowStart : props.shape.arrowEnd;
  return a && a !== "none" ? `url(#fdm-${end}-${props.shape.id})` : undefined;
};

const closedD = computed(() => (props.shape.type === "path" ? pathD(props.shape, true) : ""));
const openD = computed(() => (props.shape.type === "path" ? pathD(props.shape, false) : ""));
// per-corner radii have no SVG <rect> equivalent: draw the rectangle as a path
const rectD = computed(() => (Array.isArray(props.shape.radius) ? pathD({ ...props.shape, paths: curvesOf(props.shape) }, true) : ""));
const dim = computed(() => (props.shape.type === "dimension" ? dimensionGeometry(props.shape) : null));
const lines = computed(() => (props.shape.text ?? "").split("\n"));
</script>

<template>
  <g :data-id="shape.id" :opacity="hidden ? 0 : shape.opacity" :style="shape.visible ? undefined : 'display:none'">
    <!-- dimensions are drawn in world space so arrows and labels never distort -->
    <g v-if="dim" :stroke="shape.stroke === 'none' ? '#000' : shape.stroke" :fill="shape.stroke === 'none' ? '#000' : shape.stroke">
      <path :d="dim.lines" fill="none" :stroke-width="shape.strokeWidth" stroke-linecap="butt" />
      <polygon v-for="(a, i) in dim.arrows" :key="i" :points="a" stroke="none" />
      <text
        :transform="`translate(${dim.label.x} ${dim.label.y}) rotate(${dim.label.angle})`"
        :y="dim.label.dy" text-anchor="middle" stroke="none"
        :font-size="shape.fontSize" :font-family="shape.fontFamily"
      >{{ dim.label.text }}</text>
      <path class="fd-hit" :d="dim.lines" fill="none" stroke="transparent" :stroke-width="8 / zoom" />
    </g>

    <g v-else :transform="transform">
      <defs v-if="shape.gradient || marker('s') || marker('e')">
        <linearGradient v-if="shape.gradient?.type === 'linear'" :id="gid" v-bind="axis">
          <stop offset="0" :stop-color="shape.gradient.from" />
          <stop offset="1" :stop-color="shape.gradient.to" />
        </linearGradient>
        <radialGradient v-else-if="shape.gradient" :id="gid">
          <stop offset="0" :stop-color="shape.gradient.from" />
          <stop offset="1" :stop-color="shape.gradient.to" />
        </radialGradient>
        <template v-for="end in (['s', 'e'] as const)" :key="end">
          <marker
            v-if="marker(end)" :id="`fdm-${end}-${shape.id}`" viewBox="0 0 10 10"
            :refX="(end === 's' ? shape.arrowStart : shape.arrowEnd) === 'dot' ? 5 : 9" refY="5"
            :markerWidth="arrowSize" :markerHeight="arrowSize" markerUnits="userSpaceOnUse" orient="auto-start-reverse"
          >
            <circle v-if="(end === 's' ? shape.arrowStart : shape.arrowEnd) === 'dot'" cx="5" cy="5" r="4" :fill="shape.stroke === 'none' ? '#000' : shape.stroke" />
            <path
              v-else-if="(end === 's' ? shape.arrowStart : shape.arrowEnd) === 'open'"
              d="M1 1 L9 5 L1 9" fill="none" :stroke="shape.stroke === 'none' ? '#000' : shape.stroke" stroke-width="1.5" stroke-linejoin="miter"
            />
            <path v-else d="M0 0 L10 5 L0 10 Z" :fill="shape.stroke === 'none' ? '#000' : shape.stroke" />
          </marker>
        </template>
      </defs>
      <path v-if="rectD" :d="rectD" v-bind="paint" pointer-events="all" />
      <rect v-else-if="shape.type === 'rect'" :width="shape.w" :height="shape.h" :rx="shape.radius as number" v-bind="paint" pointer-events="all" />
      <ellipse
        v-else-if="shape.type === 'ellipse'"
        :cx="shape.w / 2" :cy="shape.h / 2" :rx="shape.w / 2" :ry="shape.h / 2"
        v-bind="paint" pointer-events="all"
      />
      <polygon v-else-if="shape.type === 'polygon'" :points="points" v-bind="paint" pointer-events="all" />
      <template v-else-if="shape.type === 'path'">
        <path v-if="closedD" :d="closedD" v-bind="paint" fill-rule="evenodd" pointer-events="all" />
        <template v-if="openD">
          <path :d="openD" v-bind="paint" fill="none" :marker-start="marker('s')" :marker-end="marker('e')" />
          <path class="fd-hit" :d="openD" fill="none" stroke="transparent" :stroke-width="8 / zoom" />
        </template>
      </template>
      <image v-else-if="shape.type === 'image'" :href="shape.src" :width="shape.w" :height="shape.h" preserveAspectRatio="none" pointer-events="all" />
      <g v-else-if="shape.type === 'text'" :transform="`scale(${shape.w / (shape.natW || 1)} ${shape.h / (shape.natH || 1)})`">
        <text :font-size="shape.fontSize" :font-family="shape.fontFamily" v-bind="paint" style="white-space: pre">
          <tspan v-for="(l, i) in lines" :key="i" x="0" :dy="(shape.fontSize ?? 0) * (i ? 1.2 : 0.9)">{{ l || " " }}</tspan>
        </text>
        <rect class="fd-hit" :width="shape.natW" :height="shape.natH" fill="transparent" />
      </g>
    </g>
  </g>
</template>
