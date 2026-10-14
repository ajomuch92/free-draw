<script setup lang="ts">
import { state as S, setTool, type Tool } from "../store";

const tools: { id: Tool; label: string; key: string; icon: string }[] = [
  { id: "pick", label: "Selección", key: "Espacio", icon: "M5 3l13 7-6 1.5L9 18z" },
  { id: "shape", label: "Forma (editar nodos)", key: "F10", icon: "M4 4l7 16 2-7 7-2zM17 17h4v4h-4z" },
  { id: "zoom", label: "Zoom", key: "Z", icon: "M10.5 4a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13zM15.5 15.5L21 21M8 10.5h5M10.5 8v5" },
  { id: "pan", label: "Desplazamiento", key: "H", icon: "M8 11V5.5a1.5 1.5 0 0 1 3 0V10m0-5.5a1.5 1.5 0 0 1 3 0V10m0-3.5a1.5 1.5 0 0 1 3 0V14a6 6 0 0 1-6 6h-1a6 6 0 0 1-5-2.7L3.5 14a1.5 1.5 0 0 1 2.5-1.6L8 15" },
  { id: "freehand", label: "Mano alzada", key: "F5", icon: "M3 17c3-8 5-8 7-3s4 5 6-1 3-6 5-4" },
  { id: "line", label: "Línea de 2 puntos", key: "", icon: "M4 20L20 4M4 20h0M20 4h0" },
  { id: "dimension", label: "Cota", key: "", icon: "M4 8v12M20 8v12M4 14h16M4 14l3-2M4 14l3 2M20 14l-3-2M20 14l-3 2M9 9h6" },
  { id: "rect", label: "Rectángulo", key: "F6", icon: "M4 6h16v12H4z" },
  { id: "ellipse", label: "Elipse", key: "F7", icon: "M12 5c4.4 0 8 3.1 8 7s-3.6 7-8 7-8-3.1-8-7 3.6-7 8-7z" },
  { id: "polygon", label: "Polígono", key: "Y", icon: "M12 3l8.5 6.2-3.3 10H6.8L3.5 9.2z" },
  { id: "text", label: "Texto", key: "F8", icon: "M5 5h14M12 5v14M9 19h6" },
];
</script>

<template>
  <nav class="w-11 shrink-0 flex flex-col items-center gap-0.5 py-1.5 bg-neutral-100 border-r border-neutral-300">
    <template v-for="(t, i) in tools" :key="t.id">
      <div v-if="i === 4 || i === 10" class="w-7 h-px my-1 bg-neutral-300" />
      <button
        class="w-9 h-9 grid place-items-center rounded transition-colors"
        :class="S.tool === t.id ? 'bg-blue-100 ring-1 ring-blue-400 text-blue-800' : 'text-neutral-700 hover:bg-neutral-200'"
        :title="t.key ? `${t.label} (${t.key})` : t.label"
        :aria-label="t.label"
        :aria-pressed="S.tool === t.id"
        @click="setTool(t.id)"
      >
        <svg viewBox="0 0 24 24" class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round">
          <path :d="t.icon" :fill="t.id === 'pick' || t.id === 'shape' ? 'currentColor' : 'none'" />
        </svg>
      </button>
    </template>
  </nav>
</template>
