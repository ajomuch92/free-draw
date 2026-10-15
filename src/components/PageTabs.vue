<script setup lang="ts">
import { nextTick, ref } from "vue";
import { state as S, gotoPage, addPage, deletePage, renamePage } from "../store";
import { ask } from "../files";

const renaming = ref<number | null>(null);
const input = ref<HTMLInputElement[]>();

async function startRename(i: number) {
  renaming.value = i;
  await nextTick();
  input.value?.[0]?.select();
}

function finishRename(i: number, e: Event) {
  if (renaming.value !== i) return;
  renaming.value = null;
  renamePage(i, (e.target as HTMLInputElement).value);
}

async function remove(i: number) {
  const p = S.pages[i];
  if (p.shapes.length && !(await ask(`¿Eliminar "${p.name}" y sus ${p.shapes.length} objetos?`))) return;
  deletePage(i);
}

const nav = "w-6 h-6 grid place-items-center rounded hover:bg-neutral-200 disabled:opacity-30 disabled:hover:bg-transparent";
</script>

<template>
  <div class="h-7 shrink-0 flex items-center gap-0.5 px-1 bg-neutral-100 border-t border-neutral-300 text-[11px] text-neutral-700">
    <button :class="nav" :disabled="S.pageIndex === 0" title="Página anterior (RePág)" aria-label="Página anterior" @click="gotoPage(S.pageIndex - 1)">‹</button>
    <span class="px-1 tabular-nums text-neutral-500">{{ S.pageIndex + 1 }} de {{ S.pages.length }}</span>
    <button :class="nav" :disabled="S.pageIndex === S.pages.length - 1" title="Página siguiente (AvPág)" aria-label="Página siguiente" @click="gotoPage(S.pageIndex + 1)">›</button>
    <div class="w-px h-4 mx-1 bg-neutral-300" />
    <div class="flex items-end gap-px overflow-x-auto self-stretch pt-0.5">
      <div
        v-for="(p, i) in S.pages"
        :key="p.id"
        class="group flex items-center gap-1 h-6 pl-2.5 pr-1 border border-b-0 rounded-t cursor-default whitespace-nowrap"
        :class="i === S.pageIndex ? 'bg-white border-neutral-300 font-semibold' : 'bg-neutral-200/60 border-transparent hover:bg-neutral-200'"
        @click="gotoPage(i)"
        @dblclick="startRename(i)"
      >
        <input
          v-if="renaming === i" ref="input" class="w-24 h-5 px-1 border border-blue-400 bg-white font-normal"
          :value="p.name" @click.stop @keydown.enter="finishRename(i, $event)" @keydown.esc="renaming = null" @blur="finishRename(i, $event)"
        />
        <span v-else>{{ p.name }}</span>
        <button
          v-if="S.pages.length > 1"
          class="w-4 h-4 grid place-items-center rounded text-neutral-400 opacity-0 group-hover:opacity-100 focus:opacity-100 hover:bg-neutral-300 hover:text-neutral-700"
          :title="`Eliminar ${p.name}`" :aria-label="`Eliminar ${p.name}`"
          @click.stop="remove(i)"
        >×</button>
      </div>
    </div>
    <button :class="nav" title="Agregar página" aria-label="Agregar página" @click="addPage()">+</button>
  </div>
</template>
