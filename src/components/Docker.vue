<script setup lang="ts">
import { computed, nextTick, ref } from "vue";
import { state as S, selected, applyStyle, commit, toFront, toBack, forward, backward, del, TYPE_NAMES, type Shape } from "../store";

// With nothing selected, edits go to the defaults for new objects (CorelDRAW behaviour).
const target = computed(() => selected.value[0] ?? S.defaults);
const layers = computed(() => [...S.shapes].reverse());
const renaming = ref<string | null>(null);
const renameInput = ref<HTMLInputElement[]>();

function select(e: MouseEvent, s: Shape) {
  if (e.shiftKey || e.ctrlKey)
    S.selection = S.selection.includes(s.id) ? S.selection.filter((id) => id !== s.id) : [...S.selection, s.id];
  else S.selection = [s.id];
}

async function startRename(s: Shape) {
  renaming.value = s.id;
  await nextTick();
  renameInput.value?.[0]?.select();
}

function finishRename(s: Shape, e: Event) {
  const v = (e.target as HTMLInputElement).value.trim();
  if (renaming.value !== s.id) return;
  renaming.value = null;
  if (v && v !== s.name) (s.name = v, commit());
}

function toggle(s: Shape, key: "visible" | "locked") {
  s[key] = !s[key];
  if (key === "locked" && s.locked) S.selection = S.selection.filter((id) => id !== s.id);
  commit();
}

const val = (e: Event) => (e.target as HTMLInputElement).value;
const toggleNone = (key: "fill" | "stroke", on: boolean) => applyStyle({ [key]: on ? "#000000" : "none" });
</script>

<template>
  <aside class="w-64 shrink-0 flex flex-col bg-neutral-50 border-l border-neutral-300 text-[11px] text-neutral-700">
    <!-- Object properties -->
    <section class="border-b border-neutral-300">
      <h2 class="px-2 py-1.5 font-semibold bg-neutral-200/70 border-b border-neutral-300">
        Propiedades {{ selected.length ? "del objeto" : "predeterminadas" }}
      </h2>
      <div class="p-2 grid grid-cols-[4.5rem_1fr] gap-x-2 gap-y-1.5 items-center">
        <span>Relleno</span>
        <div class="flex items-center gap-1.5">
          <input
            type="color" class="w-8 h-5 p-0 border border-neutral-300 disabled:opacity-30" aria-label="Color de relleno"
            :value="target.fill === 'none' ? '#ffffff' : target.fill" :disabled="target.fill === 'none'"
            @change="applyStyle({ fill: val($event) })"
          />
          <label class="flex items-center gap-1"><input type="checkbox" :checked="target.fill !== 'none'" @change="toggleNone('fill', ($event.target as HTMLInputElement).checked)" /> Activo</label>
        </div>

        <span>Contorno</span>
        <div class="flex items-center gap-1.5">
          <input
            type="color" class="w-8 h-5 p-0 border border-neutral-300 disabled:opacity-30" aria-label="Color de contorno"
            :value="target.stroke === 'none' ? '#000000' : target.stroke" :disabled="target.stroke === 'none'"
            @change="applyStyle({ stroke: val($event) })"
          />
          <label class="flex items-center gap-1"><input type="checkbox" :checked="target.stroke !== 'none'" @change="toggleNone('stroke', ($event.target as HTMLInputElement).checked)" /> Activo</label>
        </div>

        <label for="dk-w">Ancho</label>
        <div class="flex items-center gap-1">
          <input id="dk-w" type="number" min="0" step="0.05" class="w-16 h-5 px-1 border border-neutral-300 rounded-sm bg-white" :value="target.strokeWidth" @change="applyStyle({ strokeWidth: Math.max(0, parseFloat(val($event)) || 0) })" /> mm
        </div>

        <label for="dk-dash">Estilo</label>
        <select id="dk-dash" class="h-5 border border-neutral-300 rounded-sm bg-white" :value="target.dash" @change="applyStyle({ dash: val($event) as 'solid' })">
          <option value="solid">Sólido</option>
          <option value="dash">Discontinuo</option>
          <option value="dot">Punteado</option>
        </select>

        <label for="dk-op">Opacidad</label>
        <div class="flex items-center gap-1">
          <input id="dk-op" type="range" min="0" max="100" class="flex-1" :value="Math.round(target.opacity * 100)" @change="applyStyle({ opacity: parseFloat(val($event)) / 100 })" />
          <span class="w-8 text-right tabular-nums">{{ Math.round(target.opacity * 100) }}%</span>
        </div>
      </div>
    </section>

    <!-- Object manager -->
    <section class="flex-1 min-h-0 flex flex-col">
      <h2 class="px-2 py-1.5 font-semibold bg-neutral-200/70 border-b border-neutral-300 flex items-center justify-between">
        Administrador de objetos
        <span class="flex gap-0.5 font-normal">
          <button class="px-1 rounded hover:bg-neutral-300 disabled:opacity-30" :disabled="!S.selection.length" title="Al frente (Shift+RePág)" aria-label="Al frente" @click="toFront">⤒</button>
          <button class="px-1 rounded hover:bg-neutral-300 disabled:opacity-30" :disabled="!S.selection.length" title="Adelante uno (Ctrl+RePág)" aria-label="Adelante uno" @click="forward">↑</button>
          <button class="px-1 rounded hover:bg-neutral-300 disabled:opacity-30" :disabled="!S.selection.length" title="Atrás uno (Ctrl+AvPág)" aria-label="Atrás uno" @click="backward">↓</button>
          <button class="px-1 rounded hover:bg-neutral-300 disabled:opacity-30" :disabled="!S.selection.length" title="Al fondo (Shift+AvPág)" aria-label="Al fondo" @click="toBack">⤓</button>
          <button class="px-1 rounded hover:bg-neutral-300 disabled:opacity-30" :disabled="!S.selection.length" title="Eliminar (Supr)" aria-label="Eliminar" @click="del">✕</button>
        </span>
      </h2>
      <div class="px-2 py-1 text-neutral-500 border-b border-neutral-200">▾ Página 1 · Capa 1</div>
      <ul class="flex-1 overflow-y-auto">
        <li
          v-for="s in layers"
          :key="s.id"
          class="flex items-center gap-1.5 pl-4 pr-1 h-6 cursor-default"
          :class="S.selection.includes(s.id) ? 'bg-blue-100' : 'hover:bg-neutral-100'"
          @click="select($event, s)"
          @dblclick="startRename(s)"
        >
          <span class="w-3.5 h-3.5 shrink-0 border border-neutral-400" :style="{ background: s.fill === 'none' ? 'transparent' : s.fill, borderColor: s.stroke === 'none' ? undefined : s.stroke }" />
          <input
            v-if="renaming === s.id"
            ref="renameInput"
            class="flex-1 min-w-0 h-5 px-1 border border-blue-400 bg-white"
            :value="s.name"
            @click.stop
            @keydown.enter="finishRename(s, $event)"
            @keydown.esc="renaming = null"
            @blur="finishRename(s, $event)"
          />
          <span v-else class="flex-1 truncate" :class="{ 'opacity-40': !s.visible }" :title="TYPE_NAMES[s.type]">{{ s.name }}</span>
          <button class="w-5 text-center opacity-70 hover:opacity-100" :title="s.visible ? 'Ocultar' : 'Mostrar'" :aria-label="s.visible ? 'Ocultar' : 'Mostrar'" @click.stop="toggle(s, 'visible')">
            {{ s.visible ? "👁" : "–" }}
          </button>
          <button class="w-5 text-center opacity-70 hover:opacity-100" :title="s.locked ? 'Desbloquear' : 'Bloquear'" :aria-label="s.locked ? 'Desbloquear' : 'Bloquear'" @click.stop="toggle(s, 'locked')">
            {{ s.locked ? "🔒" : "🔓" }}
          </button>
        </li>
        <li v-if="!layers.length" class="px-4 py-3 text-neutral-400">Sin objetos. Dibuja con las herramientas de la izquierda.</li>
      </ul>
    </section>
  </aside>
</template>
