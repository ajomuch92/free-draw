<script setup lang="ts">
import { computed, nextTick, ref } from "vue";
import {
  state as S, selected, applyStyle, commit, toFront, toBack, forward, backward, del, expandGroups, TYPE_NAMES,
  type Shape, type Gradient, type Style,
} from "../store";
import { group, ungroup, canUngroup, align, distribute } from "../arrange";
import { t } from "../i18n";

// With nothing selected, edits go to the defaults for new objects (CorelDRAW behaviour).
const target = computed<Style>(() => selected.value[0] ?? S.defaults);
const val = (e: Event) => (e.target as HTMLInputElement).value;

// ---------- fill ----------

type FillKind = "none" | "solid" | "linear" | "radial";
const fillKind = computed<FillKind>(() =>
  target.value.gradient ? target.value.gradient.type : target.value.fill === "none" ? "none" : "solid",
);
const solid = computed(() => (target.value.fill === "none" ? "#ffffff" : target.value.fill));

function setFillKind(k: FillKind) {
  if (k === "none") return applyStyle({ fill: "none", gradient: undefined });
  if (k === "solid") return applyStyle({ fill: solid.value, gradient: undefined });
  const g = target.value.gradient;
  applyStyle({ gradient: { type: k, from: g?.from ?? solid.value, to: g?.to ?? "#000000", angle: g?.angle ?? 0 } });
}
const setGradient = (patch: Partial<Gradient>) => applyStyle({ gradient: { ...target.value.gradient!, ...patch } });

// ---------- object manager (groups shown as a tree) ----------

type Row = { kind: "group"; id: string; depth: number; count: number; members: Shape[] } | { kind: "shape"; shape: Shape; depth: number };

function rows(list: Shape[], depth: number): Row[] {
  const out: Row[] = [];
  for (let i = 0; i < list.length; ) {
    const g = list[i].groups?.[depth];
    if (!g) {
      out.push({ kind: "shape", shape: list[i], depth });
      i++;
      continue;
    }
    let j = i;
    while (j < list.length && list[j].groups?.[depth] === g) j++;
    const members = list.slice(i, j);
    out.push({ kind: "group", id: g, depth, count: members.length, members }, ...rows(members, depth + 1));
    i = j;
  }
  return out;
}
const tree = computed(() => rows([...S.shapes].reverse(), 0));
const page = computed(() => S.pages[S.pageIndex]);

function selectIds(e: MouseEvent, ids: string[]) {
  const all = ids.every((id) => S.selection.includes(id));
  if (e.shiftKey) S.selection = all ? S.selection.filter((id) => !ids.includes(id)) : [...new Set([...S.selection, ...ids])];
  else S.selection = ids;
}
const allSelected = (list: Shape[]) => list.every((x) => S.selection.includes(x.id));
const selectShape = (e: MouseEvent, s: Shape) => selectIds(e, e.ctrlKey || e.shiftKey ? [s.id] : expandGroups([s.id]));

const renaming = ref<string | null>(null);
const renameInput = ref<HTMLInputElement[]>();
async function startRename(s: Shape) {
  renaming.value = s.id;
  await nextTick();
  renameInput.value?.[0]?.select();
}
function finishRename(s: Shape, e: Event) {
  const v = val(e).trim();
  if (renaming.value !== s.id) return;
  renaming.value = null;
  if (v && v !== s.name) (s.name = v, commit());
}

function toggle(s: Shape, key: "visible" | "locked") {
  s[key] = !s[key];
  if (key === "locked" && s.locked) S.selection = S.selection.filter((id) => id !== s.id);
  commit();
}

const icon = "w-7 h-7 grid place-items-center rounded border border-neutral-300 bg-white hover:bg-neutral-100 disabled:opacity-30 disabled:hover:bg-white";
const input = "h-5 border border-neutral-300 rounded-sm bg-white";
const many = computed(() => new Set(selected.value.map((s) => s.groups?.[0] ?? s.id)).size);
</script>

<template>
  <aside class="w-64 shrink-0 flex flex-col bg-neutral-50 border-l border-neutral-300 text-[11px] text-neutral-700 overflow-y-auto">
    <!-- Object properties -->
    <details open class="border-b border-neutral-300">
      <summary class="px-2 py-1.5 font-semibold bg-neutral-200/70 border-b border-neutral-300 cursor-default select-none">
        {{ selected.length ? t("Propiedades del objeto") : t("Propiedades predeterminadas") }}
      </summary>
      <div class="p-2 grid grid-cols-[4.5rem_1fr] gap-x-2 gap-y-1.5 items-center">
        <label for="dk-fill">{{ t('Relleno') }}</label>
        <select id="dk-fill" :class="input" :value="fillKind" @change="setFillKind(val($event) as FillKind)">
          <option value="none">{{ t('Sin relleno') }}</option>
          <option value="solid">{{ t('Uniforme') }}</option>
          <option value="linear">{{ t('Degradado lineal') }}</option>
          <option value="radial">{{ t('Degradado radial') }}</option>
        </select>

        <template v-if="fillKind === 'solid'">
          <span>{{ t('Color') }}</span>
          <input type="color" class="w-10 h-5 p-0 border border-neutral-300" :aria-label="t('Color de relleno')" :value="solid" @change="applyStyle({ fill: val($event) })" />
        </template>
        <template v-else-if="target.gradient">
          <span>{{ t('Colores') }}</span>
          <div class="flex items-center gap-1.5">
            <input type="color" class="w-8 h-5 p-0 border border-neutral-300" :aria-label="t('Color inicial')" :value="target.gradient.from" @change="setGradient({ from: val($event) })" />
            <div class="flex-1 h-3 border border-neutral-300" :style="{ background: `linear-gradient(90deg, ${target.gradient.from}, ${target.gradient.to})` }" />
            <input type="color" class="w-8 h-5 p-0 border border-neutral-300" :aria-label="t('Color final')" :value="target.gradient.to" @change="setGradient({ to: val($event) })" />
          </div>
          <template v-if="target.gradient.type === 'linear'">
            <label for="dk-ang">{{ t('Ángulo') }}</label>
            <div class="flex items-center gap-1">
              <input id="dk-ang" type="number" step="15" class="w-16 px-1" :class="input" :value="target.gradient.angle" @change="setGradient({ angle: parseFloat(val($event)) || 0 })" /> °
            </div>
          </template>
        </template>

        <span>{{ t('Contorno') }}</span>
        <div class="flex items-center gap-1.5">
          <input
            type="color" class="w-8 h-5 p-0 border border-neutral-300 disabled:opacity-30" :aria-label="t('Color de contorno')"
            :value="target.stroke === 'none' ? '#000000' : target.stroke" :disabled="target.stroke === 'none'"
            @change="applyStyle({ stroke: val($event) })"
          />
          <label class="flex items-center gap-1"><input type="checkbox" :checked="target.stroke !== 'none'" @change="applyStyle({ stroke: ($event.target as HTMLInputElement).checked ? '#000000' : 'none' })" /> {{ t('Activo') }}</label>
        </div>

        <label for="dk-w">{{ t('Ancho') }}</label>
        <div class="flex items-center gap-1">
          <input id="dk-w" type="number" min="0" step="0.05" class="w-16 px-1" :class="input" :value="target.strokeWidth" @change="applyStyle({ strokeWidth: Math.max(0, parseFloat(val($event)) || 0) })" /> mm
        </div>

        <label for="dk-dash">{{ t('Estilo') }}</label>
        <select id="dk-dash" :class="input" :value="target.dash" @change="applyStyle({ dash: val($event) as 'solid' })">
          <option value="solid">{{ t('Sólido') }}</option>
          <option value="dash">{{ t('Discontinuo') }}</option>
          <option value="dot">{{ t('Punteado') }}</option>
        </select>

        <label for="dk-cap">{{ t('Extremos') }}</label>
        <select id="dk-cap" :class="input" :value="target.cap ?? 'butt'" @change="applyStyle({ cap: val($event) as 'butt' })">
          <option value="butt">{{ t('Planos') }}</option>
          <option value="round">{{ t('Redondeados') }}</option>
          <option value="square">{{ t('Cuadrados') }}</option>
        </select>

        <label for="dk-join">{{ t('Esquinas') }}</label>
        <select id="dk-join" :class="input" :value="target.join ?? 'round'" @change="applyStyle({ join: val($event) as 'round' })">
          <option value="miter">{{ t('En punta') }}</option>
          <option value="round">{{ t('Redondeadas') }}</option>
          <option value="bevel">{{ t('Biseladas') }}</option>
        </select>

        <span>{{ t('Flechas') }}</span>
        <div class="flex items-center gap-1" :title="t('Solo en curvas y líneas abiertas')">
          <select :class="input" class="flex-1 min-w-0" :aria-label="t('Flecha inicial')" :value="target.arrowStart ?? 'none'" @change="applyStyle({ arrowStart: val($event) as 'none' })">
            <option value="none">{{ t('— inicio') }}</option>
            <option value="triangle">{{ t('◀ triángulo') }}</option>
            <option value="open">{{ t('‹ abierta') }}</option>
            <option value="dot">{{ t('● punto') }}</option>
          </select>
          <select :class="input" class="flex-1 min-w-0" :aria-label="t('Flecha final')" :value="target.arrowEnd ?? 'none'" @change="applyStyle({ arrowEnd: val($event) as 'none' })">
            <option value="none">{{ t('fin —') }}</option>
            <option value="triangle">{{ t('triángulo ▶') }}</option>
            <option value="open">{{ t('abierta ›') }}</option>
            <option value="dot">{{ t('punto ●') }}</option>
          </select>
        </div>

        <label for="dk-op">{{ t('Opacidad') }}</label>
        <div class="flex items-center gap-1">
          <input id="dk-op" type="range" min="0" max="100" class="flex-1" :value="Math.round(target.opacity * 100)" @change="applyStyle({ opacity: parseFloat(val($event)) / 100 })" />
          <span class="w-8 text-right tabular-nums">{{ Math.round(target.opacity * 100) }}%</span>
        </div>
      </div>
    </details>

    <!-- Align & distribute -->
    <details open class="border-b border-neutral-300">
      <summary class="px-2 py-1.5 font-semibold bg-neutral-200/70 border-b border-neutral-300 cursor-default select-none">{{ t('Alinear y distribuir') }}</summary>
      <div class="p-2 flex flex-col gap-1.5">
        <div class="flex items-center gap-1">
          <button :class="icon" :disabled="many < 2" :title="t('Alinear a la izquierda (L)')" :aria-label="t('Alinear a la izquierda')" @click="align(['left'])">
            <svg viewBox="0 0 16 16" class="w-4 h-4"><path d="M2 1v14" stroke="currentColor" /><rect x="3" y="3" width="9" height="3" fill="currentColor" /><rect x="3" y="9" width="6" height="3" fill="currentColor" /></svg>
          </button>
          <button :class="icon" :disabled="many < 2" :title="t('Centrar verticalmente (C)')" :aria-label="t('Alinear centros en vertical')" @click="align(['centerX'])">
            <svg viewBox="0 0 16 16" class="w-4 h-4"><path d="M8 1v14" stroke="currentColor" /><rect x="3" y="3" width="10" height="3" fill="currentColor" /><rect x="5" y="9" width="6" height="3" fill="currentColor" /></svg>
          </button>
          <button :class="icon" :disabled="many < 2" :title="t('Alinear a la derecha (R)')" :aria-label="t('Alinear a la derecha')" @click="align(['right'])">
            <svg viewBox="0 0 16 16" class="w-4 h-4"><path d="M14 1v14" stroke="currentColor" /><rect x="4" y="3" width="9" height="3" fill="currentColor" /><rect x="7" y="9" width="6" height="3" fill="currentColor" /></svg>
          </button>
          <div class="w-px h-5 mx-0.5 bg-neutral-300" />
          <button :class="icon" :disabled="many < 2" :title="t('Alinear arriba (T)')" :aria-label="t('Alinear arriba')" @click="align(['top'])">
            <svg viewBox="0 0 16 16" class="w-4 h-4"><path d="M1 2h14" stroke="currentColor" /><rect x="3" y="3" width="3" height="9" fill="currentColor" /><rect x="9" y="3" width="3" height="6" fill="currentColor" /></svg>
          </button>
          <button :class="icon" :disabled="many < 2" :title="t('Centrar horizontalmente (E)')" :aria-label="t('Alinear centros en horizontal')" @click="align(['centerY'])">
            <svg viewBox="0 0 16 16" class="w-4 h-4"><path d="M1 8h14" stroke="currentColor" /><rect x="3" y="3" width="3" height="10" fill="currentColor" /><rect x="9" y="5" width="3" height="6" fill="currentColor" /></svg>
          </button>
          <button :class="icon" :disabled="many < 2" :title="t('Alinear abajo (B)')" :aria-label="t('Alinear abajo')" @click="align(['bottom'])">
            <svg viewBox="0 0 16 16" class="w-4 h-4"><path d="M1 14h14" stroke="currentColor" /><rect x="3" y="4" width="3" height="9" fill="currentColor" /><rect x="9" y="7" width="3" height="6" fill="currentColor" /></svg>
          </button>
        </div>
        <div class="flex items-center gap-1">
          <button class="px-2 h-7 rounded border border-neutral-300 bg-white hover:bg-neutral-100 disabled:opacity-30 disabled:hover:bg-white" :disabled="!selected.length" :title="t('Centrar en la página (P)')" @click="align(['centerX', 'centerY'], true)">{{ t('Centrar en página') }}</button>
          <button :class="icon" :disabled="many < 3" :title="t('Distribuir espaciado horizontal')" :aria-label="t('Distribuir espaciado horizontal')" @click="distribute('x')">
            <svg viewBox="0 0 16 16" class="w-4 h-4"><rect x="1" y="4" width="3" height="8" fill="currentColor" /><rect x="6.5" y="4" width="3" height="8" fill="currentColor" /><rect x="12" y="4" width="3" height="8" fill="currentColor" /></svg>
          </button>
          <button :class="icon" :disabled="many < 3" :title="t('Distribuir espaciado vertical')" :aria-label="t('Distribuir espaciado vertical')" @click="distribute('y')">
            <svg viewBox="0 0 16 16" class="w-4 h-4"><rect x="4" y="1" width="8" height="3" fill="currentColor" /><rect x="4" y="6.5" width="8" height="3" fill="currentColor" /><rect x="4" y="12" width="8" height="3" fill="currentColor" /></svg>
          </button>
        </div>
      </div>
    </details>

    <!-- Object manager -->
    <section class="flex-1 min-h-40 flex flex-col">
      <h2 class="px-2 py-1.5 font-semibold bg-neutral-200/70 border-b border-neutral-300 flex items-center justify-between">
        {{ t('Objetos') }}
        <span class="flex gap-0.5 font-normal">
          <button class="px-1 rounded hover:bg-neutral-300 disabled:opacity-30" :disabled="selected.length < 2" :title="t('Agrupar (Ctrl+G)')" :aria-label="t('Agrupar')" @click="group">⧉</button>
          <button class="px-1 rounded hover:bg-neutral-300 disabled:opacity-30" :disabled="!canUngroup()" :title="t('Desagrupar (Ctrl+U)')" :aria-label="t('Desagrupar')" @click="ungroup()">⧈</button>
          <button class="px-1 rounded hover:bg-neutral-300 disabled:opacity-30" :disabled="!S.selection.length" :title="t('Al frente (Shift+RePág)')" :aria-label="t('Al frente')" @click="toFront">⤒</button>
          <button class="px-1 rounded hover:bg-neutral-300 disabled:opacity-30" :disabled="!S.selection.length" :title="t('Adelante uno (Ctrl+RePág)')" :aria-label="t('Adelante uno')" @click="forward">↑</button>
          <button class="px-1 rounded hover:bg-neutral-300 disabled:opacity-30" :disabled="!S.selection.length" :title="t('Atrás uno (Ctrl+AvPág)')" :aria-label="t('Atrás uno')" @click="backward">↓</button>
          <button class="px-1 rounded hover:bg-neutral-300 disabled:opacity-30" :disabled="!S.selection.length" :title="t('Al fondo (Shift+AvPág)')" :aria-label="t('Al fondo')" @click="toBack">⤓</button>
          <button class="px-1 rounded hover:bg-neutral-300 disabled:opacity-30" :disabled="!S.selection.length" :title="t('Eliminar (Supr)')" :aria-label="t('Eliminar')" @click="del">✕</button>
        </span>
      </h2>
      <div class="px-2 py-1 text-neutral-500 border-b border-neutral-200">▾ {{ page.name }} · {{ t("Capa 1") }}</div>
      <ul class="flex-1 overflow-y-auto">
        <template v-for="r in tree" :key="r.kind === 'group' ? `${r.id}-${r.depth}` : r.shape.id">
          <li
            v-if="r.kind === 'group'"
            class="flex items-center gap-1.5 pr-1 h-6 cursor-default font-medium"
            :class="allSelected(r.members) ? 'bg-blue-100' : 'hover:bg-neutral-100'"
            :style="{ paddingLeft: `${16 + r.depth * 12}px` }"
            @click="selectIds($event, r.members.map((x) => x.id))"
          >
            <span class="w-3.5 text-center text-neutral-500">▾</span>
            <span class="flex-1 truncate">{{ t("Grupo de {n} objetos", { n: r.count }) }}</span>
          </li>
          <li
            v-else
            class="flex items-center gap-1.5 pr-1 h-6 cursor-default"
            :class="S.selection.includes(r.shape.id) ? 'bg-blue-100' : 'hover:bg-neutral-100'"
            :style="{ paddingLeft: `${16 + r.depth * 12}px` }"
            @click="selectShape($event, r.shape)"
            @dblclick="startRename(r.shape)"
          >
            <span
              class="w-3.5 h-3.5 shrink-0 border border-neutral-400"
              :style="{
                background: r.shape.gradient ? `linear-gradient(135deg, ${r.shape.gradient.from}, ${r.shape.gradient.to})` : r.shape.fill === 'none' ? 'transparent' : r.shape.fill,
                borderColor: r.shape.stroke === 'none' ? undefined : r.shape.stroke,
              }"
            />
            <input
              v-if="renaming === r.shape.id"
              ref="renameInput"
              class="flex-1 min-w-0 h-5 px-1 border border-blue-400 bg-white"
              :value="r.shape.name"
              @click.stop
              @keydown.enter="finishRename(r.shape, $event)"
              @keydown.esc="renaming = null"
              @blur="finishRename(r.shape, $event)"
            />
            <span v-else class="flex-1 truncate" :class="{ 'opacity-40': !r.shape.visible }" :title="t(TYPE_NAMES[r.shape.type])">{{ r.shape.name }}</span>
            <button class="w-5 text-center opacity-70 hover:opacity-100" :title="r.shape.visible ? t('Ocultar') : t('Mostrar')" :aria-label="r.shape.visible ? t('Ocultar') : t('Mostrar')" @click.stop="toggle(r.shape, 'visible')">
              {{ r.shape.visible ? "👁" : "–" }}
            </button>
            <button class="w-5 text-center opacity-70 hover:opacity-100" :title="r.shape.locked ? t('Desbloquear') : t('Bloquear')" :aria-label="r.shape.locked ? t('Desbloquear') : t('Bloquear')" @click.stop="toggle(r.shape, 'locked')">
              {{ r.shape.locked ? "🔒" : "🔓" }}
            </button>
          </li>
        </template>
        <li v-if="!tree.length" class="px-4 py-3 text-neutral-400">{{ t('Sin objetos. Dibuja con las herramientas de la izquierda.') }}</li>
      </ul>
    </section>
  </aside>
</template>
