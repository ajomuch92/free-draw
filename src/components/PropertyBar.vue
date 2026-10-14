<script setup lang="ts">
import { computed, ref } from "vue";
import {
  state as S, selected, selectionFrame, setFrame, setPage, flip, applyStyle, commit, measureText,
  PAGE_SIZES, FONTS, PT,
} from "../store";
import {
  isCurvable, convertToCurves, combine, breakApart, booleanOp, addNodes, deleteNodes, joinNodes, breakAtNodes,
  toggleClosed, toLine, toCurve, setNodeKind, type BoolOp,
} from "../paths";

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
  if (!s || (s.type !== "text" && s.type !== "dimension")) return;
  Object.assign(s, patch);
  if (s.type === "text") measureText(s);
  commit();
}

// ---------- curves, nodes, shaping ----------

const editPath = computed(() => (S.tool === "shape" && one.value?.type === "path" ? one.value : null));
const nodeCount = computed(() => editPath.value?.paths?.reduce((n, sp) => n + sp.nodes.length, 0) ?? 0);
const curvableCount = computed(() => selected.value.filter(isCurvable).length);
const canConvert = computed(() => selected.value.some((s) => isCurvable(s) && s.type !== "path"));
const canBreak = computed(() => one.value?.type === "path" && (one.value.paths?.length ?? 0) > 1);

const shaping: { op: BoolOp; label: string; title: string }[] = [
  { op: "weld", label: "Soldar", title: "Une los objetos en uno solo" },
  { op: "trim", label: "Recortar", title: "Recorta el objeto de atrás con los demás" },
  { op: "intersect", label: "Intersecar", title: "Crea un objeto con el área común" },
  { op: "simplify", label: "Simplificar", title: "Quita de cada objeto lo que tapan los de arriba" },
  { op: "frontMinusBack", label: "Frente − detrás", title: "Deja el objeto de adelante menos los de atrás" },
  { op: "backMinusFront", label: "Detrás − frente", title: "Deja el objeto de atrás menos los de adelante" },
];

// ---------- dimensions ----------

const dimTarget = computed(() => (one.value?.type === "dimension" ? one.value.dim! : S.dimDefaults));
function setDim(patch: { decimals?: number; units?: boolean }) {
  Object.assign(dimTarget.value, patch);
  if (one.value?.type === "dimension") commit();
}
const btn = "px-2 h-6 rounded-sm border border-neutral-300 bg-white hover:bg-neutral-100 disabled:opacity-40 disabled:hover:bg-white";
const on = (active: boolean) => (active ? "bg-blue-100 border-blue-400" : "border-neutral-300 bg-white hover:bg-neutral-100");
</script>

<template>
  <div class="h-10 shrink-0 flex items-center gap-3 px-2 bg-neutral-50 border-b border-neutral-300 text-[11px] text-neutral-700 overflow-x-auto [&_input]:h-6 [&_input]:px-1 [&_input]:border [&_input]:border-neutral-300 [&_input]:rounded-sm [&_input]:bg-white [&_select]:h-6 [&_select]:border [&_select]:border-neutral-300 [&_select]:rounded-sm [&_select]:bg-white whitespace-nowrap">
    <!-- Dimension tool options -->
    <template v-if="S.tool === 'dimension'">
      <div class="flex gap-0.5">
        <button class="px-2 h-6 rounded-sm border" :class="on(S.dimMode === 'parallel')" title="Cota paralela" @click="S.dimMode = 'parallel'">Paralela</button>
        <button class="px-2 h-6 rounded-sm border" :class="on(S.dimMode === 'hv')" title="Cota horizontal o vertical" @click="S.dimMode = 'hv'">Horizontal/vertical</button>
        <button class="px-2 h-6 rounded-sm border" :class="on(S.dimMode === 'angular')" title="Cota angular" @click="S.dimMode = 'angular'">Angular</button>
      </div>
      <label class="flex items-center gap-1">Decimales
        <select :value="S.dimDefaults.decimals" @change="S.dimDefaults.decimals = num($event)">
          <option v-for="d in 4" :key="d" :value="d - 1">{{ d - 1 }}</option>
        </select>
      </label>
      <label class="flex items-center gap-1"><input type="checkbox" class="!h-auto" :checked="S.dimDefaults.units" @change="S.dimDefaults.units = ($event.target as HTMLInputElement).checked" /> Mostrar unidades</label>
      <span class="text-neutral-500">
        {{ S.dimMode === 'angular' ? 'Arrastre desde el vértice al primer lado, clic en el segundo lado y clic para ubicar el arco.' : 'Arrastre entre dos puntos y haga clic para ubicar la cota. Se ajusta a los nodos.' }}
      </span>
    </template>

    <!-- Shape tool: node editing -->
    <template v-else-if="editPath">
      <span class="text-neutral-500 tabular-nums">{{ S.nodeSel.length }} de {{ nodeCount }} nodos</span>
      <div class="flex gap-0.5">
        <button :class="btn" :disabled="!S.nodeSel.length" title="Agregar nodo en el segmento siguiente (doble clic en la curva)" @click="addNodes">+ Nodo</button>
        <button :class="btn" :disabled="!S.nodeSel.length" title="Eliminar nodos (Supr o doble clic en el nodo)" @click="deleteNodes()">− Nodo</button>
      </div>
      <div class="flex gap-0.5">
        <button :class="btn" :disabled="S.nodeSel.length !== 2" title="Unir dos nodos finales" @click="joinNodes">Unir</button>
        <button :class="btn" :disabled="!S.nodeSel.length" title="Separar la curva en los nodos" @click="breakAtNodes">Separar</button>
        <button :class="btn" title="Cerrar o abrir el trazado" @click="toggleClosed">Cerrar/abrir</button>
      </div>
      <div class="flex gap-0.5">
        <button :class="btn" :disabled="!S.nodeSel.length" title="Convertir el segmento en línea" @click="toLine">A línea</button>
        <button :class="btn" :disabled="!S.nodeSel.length" title="Convertir el segmento en curva" @click="toCurve">A curva</button>
      </div>
      <div class="flex gap-0.5">
        <button :class="btn" :disabled="!S.nodeSel.length" title="Nodo cúspide: manejadores independientes" @click="setNodeKind('cusp')">Cúspide</button>
        <button :class="btn" :disabled="!S.nodeSel.length" title="Nodo suave: manejadores alineados" @click="setNodeKind('smooth')">Suave</button>
        <button :class="btn" :disabled="!S.nodeSel.length" title="Nodo simétrico: manejadores alineados y de igual largo" @click="setNodeKind('symmetric')">Simétrico</button>
      </div>
    </template>

    <!-- No selection: page settings -->
    <template v-else-if="!frame">
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
      <template v-if="one?.type === 'dimension'">
        <div class="w-px h-6 bg-neutral-300" />
        <label class="flex items-center gap-1">Decimales
          <select :value="dimTarget.decimals" @change="setDim({ decimals: num($event) })">
            <option v-for="d in 4" :key="d" :value="d - 1">{{ d - 1 }}</option>
          </select>
        </label>
        <label class="flex items-center gap-1"><input type="checkbox" class="!h-auto" :checked="dimTarget.units" @change="setDim({ units: ($event.target as HTMLInputElement).checked })" /> Unidades</label>
        <label class="flex items-center gap-1">Texto
          <input type="number" min="1" step="1" :value="r2((one.fontSize ?? 0) / PT)" class="w-12" aria-label="Tamaño del texto de la cota" @change="setFont({ fontSize: num($event) * PT })" /> pt
        </label>
      </template>

      <template v-if="canConvert || canBreak || curvableCount > 1">
        <div class="w-px h-6 bg-neutral-300" />
        <button v-if="canConvert" :class="btn" title="Convertir a curvas (Ctrl+Q)" @click="convertToCurves()">Convertir a curvas</button>
        <button v-if="curvableCount > 1" :class="btn" title="Combinar (Ctrl+L)" @click="combine">Combinar</button>
        <button v-if="canBreak" :class="btn" title="Separar (Ctrl+K)" @click="breakApart">Separar</button>
      </template>
      <template v-if="curvableCount > 1">
        <div class="w-px h-6 bg-neutral-300" />
        <div class="flex gap-0.5">
          <button v-for="b in shaping" :key="b.op" :class="btn" :title="b.title" @click="booleanOp(b.op)">{{ b.label }}</button>
        </div>
      </template>
    </template>
  </div>
</template>
