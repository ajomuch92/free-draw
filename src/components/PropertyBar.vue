<script setup lang="ts">
import { computed, ref } from "vue";
import {
  state as S, selected, selectionFrame, setFrame, setPage, flip, applyStyle, commit, measureText,
  PAGE_SIZES, FONTS, PT, customColors, addCustomColor,
} from "../store";
import {
  isCurvable, combine, booleanOp, addNodes, deleteNodes, joinNodes, breakAtNodes,
  toggleClosed, toLine, toCurve, setNodeKind, type BoolOp,
} from "../paths";
import { toCurves } from "../fonts";
import { breakApart } from "../dimensions";
import { group, ungroup, canUngroup } from "../arrange";
import { applySampled, sampleScreen, canPickScreen } from "../eyedropper";
import { t } from "../i18n";

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

function setSides(v: number) {
  if (!one.value || !(v >= 0)) return;
  one.value.sides = Math.min(50, Math.max(3, Math.round(v)));
  commit();
}

// Rectangle corners: a number while they are linked, one radius per corner once unlinked.
const CORNERS = ["Esquina superior izquierda", "Esquina superior derecha", "Esquina inferior derecha", "Esquina inferior izquierda"];
const radii = computed(() => {
  const r = one.value?.radius ?? 0;
  return Array.isArray(r) ? r : [r];
});
function setRadius(i: number, v: number) {
  const s = one.value;
  if (!s || !(v >= 0)) return;
  if (Array.isArray(s.radius)) s.radius = s.radius.map((r, j) => (j === i ? v : r));
  else s.radius = v;
  commit();
}
function toggleCorners() {
  const s = one.value;
  if (!s) return;
  const r = s.radius ?? 0;
  s.radius = Array.isArray(r) ? r[0] : [r, r, r, r];
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
const canConvert = computed(() => selected.value.some((s) => (isCurvable(s) && s.type !== "path") || s.type === "text"));
const canBreak = computed(() => selected.value.some((s) => s.type === "dimension") || (one.value?.type === "path" && (one.value.paths?.length ?? 0) > 1));

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
    <!-- Eyedropper -->
    <template v-if="S.tool === 'eyedropper'">
      <span class="flex items-center gap-1.5">
        {{ t('Muestra') }}
        <span
          class="w-8 h-5 border border-neutral-400 rounded-sm"
          :style="{ background: S.sampled ?? 'repeating-linear-gradient(45deg,#fff 0 3px,#ddd 3px 6px)' }"
        />
        <span class="w-14 font-mono tabular-nums">{{ S.sampled ?? "—" }}</span>
      </span>
      <div class="flex gap-0.5">
        <button :class="btn" :disabled="!S.sampled" :title="t('Rellenar la selección (o los objetos nuevos) con la muestra')" @click="applySampled('fill')">{{ t('Aplicar relleno') }}</button>
        <button :class="btn" :disabled="!S.sampled" :title="t('Usar la muestra como contorno')" @click="applySampled('stroke')">{{ t('Aplicar contorno') }}</button>
        <button
          :class="btn" :disabled="!S.sampled || customColors.includes(S.sampled)"
          :title="S.sampled && customColors.includes(S.sampled) ? t('Ya está en tus colores personalizados') : t('Guardar la muestra en la paleta, debajo de los colores fijos')"
          @click="addCustomColor(S.sampled!)"
        >{{ t('Agregar a colores personalizados') }}</button>
      </div>
      <button v-if="canPickScreen" :class="btn" :title="t('Tomar un color de cualquier parte de la pantalla, incluso fuera de la ventana')" @click="sampleScreen">{{ t('Tomar de la pantalla') }}</button>
      <span class="text-neutral-500">{{ t('Clic en el dibujo para tomar un color; si hay objetos seleccionados se aplica como relleno (Shift o clic derecho: contorno).') }}</span>
    </template>

    <template v-else-if="S.tool === 'dimension'">
      <div class="flex gap-0.5">
        <button class="px-2 h-6 rounded-sm border" :class="on(S.dimMode === 'parallel')" :title="t('Cota paralela')" @click="S.dimMode = 'parallel'">{{ t('Paralela') }}</button>
        <button class="px-2 h-6 rounded-sm border" :class="on(S.dimMode === 'hv')" :title="t('Cota horizontal o vertical')" @click="S.dimMode = 'hv'">{{ t('Horizontal/vertical') }}</button>
        <button class="px-2 h-6 rounded-sm border" :class="on(S.dimMode === 'angular')" :title="t('Cota angular')" @click="S.dimMode = 'angular'">{{ t('Angular') }}</button>
      </div>
      <label class="flex items-center gap-1">{{ t('Decimales') }}
        <select :value="S.dimDefaults.decimals" @change="S.dimDefaults.decimals = num($event)">
          <option v-for="d in 4" :key="d" :value="d - 1">{{ d - 1 }}</option>
        </select>
      </label>
      <label class="flex items-center gap-1"><input type="checkbox" class="!h-auto" :checked="S.dimDefaults.units" @change="S.dimDefaults.units = ($event.target as HTMLInputElement).checked" /> {{ t('Mostrar unidades') }}</label>
      <span class="text-neutral-500">
        {{ S.dimMode === 'angular' ? t('Arrastre desde el vértice al primer lado, clic en el segundo lado y clic para ubicar el arco.') : t('Arrastre entre dos puntos y haga clic para ubicar la cota. Se ajusta a los nodos.') }}
      </span>
    </template>

    <!-- Shape tool: node editing -->
    <template v-else-if="editPath">
      <span class="text-neutral-500 tabular-nums">{{ t("{i} de {n} nodos", { i: S.nodeSel.length, n: nodeCount }) }}</span>
      <div class="flex gap-0.5">
        <button :class="btn" :disabled="!S.nodeSel.length" :title="t('Agregar nodo en el segmento siguiente (doble clic en la curva)')" @click="addNodes">{{ t('+ Nodo') }}</button>
        <button :class="btn" :disabled="!S.nodeSel.length" :title="t('Eliminar nodos (Supr o doble clic en el nodo)')" @click="deleteNodes()">{{ t('− Nodo') }}</button>
      </div>
      <div class="flex gap-0.5">
        <button :class="btn" :disabled="S.nodeSel.length !== 2" :title="t('Unir dos nodos finales')" @click="joinNodes">{{ t('Unir') }}</button>
        <button :class="btn" :disabled="!S.nodeSel.length" :title="t('Separar la curva en los nodos')" @click="breakAtNodes">{{ t('Separar') }}</button>
        <button :class="btn" :title="t('Cerrar o abrir el trazado')" @click="toggleClosed">{{ t('Cerrar/abrir') }}</button>
      </div>
      <div class="flex gap-0.5">
        <button :class="btn" :disabled="!S.nodeSel.length" :title="t('Convertir el segmento en línea')" @click="toLine">{{ t('A línea') }}</button>
        <button :class="btn" :disabled="!S.nodeSel.length" :title="t('Convertir el segmento en curva')" @click="toCurve">{{ t('A curva') }}</button>
      </div>
      <div class="flex gap-0.5">
        <button :class="btn" :disabled="!S.nodeSel.length" :title="t('Nodo cúspide: manejadores independientes')" @click="setNodeKind('cusp')">{{ t('Cúspide') }}</button>
        <button :class="btn" :disabled="!S.nodeSel.length" :title="t('Nodo suave: manejadores alineados')" @click="setNodeKind('smooth')">{{ t('Suave') }}</button>
        <button :class="btn" :disabled="!S.nodeSel.length" :title="t('Nodo simétrico: manejadores alineados y de igual largo')" @click="setNodeKind('symmetric')">{{ t('Simétrico') }}</button>
      </div>
    </template>

    <!-- No selection: page settings -->
    <template v-else-if="!frame">
      <select :value="S.page.size" :aria-label="t('Tamaño de página')" @change="setPage(($event.target as HTMLSelectElement).value, landscape)">
        <option v-for="(_, k) in PAGE_SIZES" :key="k" :value="k">{{ k }}</option>
      </select>
      <span class="tabular-nums">{{ r2(S.page.w) }} × {{ r2(S.page.h) }} mm</span>
      <div class="flex gap-0.5">
        <button class="px-2 h-6 rounded-sm border" :class="!landscape ? 'bg-blue-100 border-blue-400' : 'border-neutral-300 bg-white'" @click="setPage(S.page.size, false)">{{ t('Vertical') }}</button>
        <button class="px-2 h-6 rounded-sm border" :class="landscape ? 'bg-blue-100 border-blue-400' : 'border-neutral-300 bg-white'" @click="setPage(S.page.size, true)">{{ t('Horizontal') }}</button>
      </div>
      <span class="text-neutral-500">{{ t('Unidades: milímetros') }}</span>
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
        <label for="pb-w">{{ t('An:') }}</label>
        <input id="pb-w" type="number" step="0.1" min="0" :value="r2(frame.w)" class="text-[11px] !h-[17px]" @change="setSize('w', num($event))" />
        <label for="pb-h">{{ t('Al:') }}</label>
        <input id="pb-h" type="number" step="0.1" min="0" :value="r2(frame.h)" class="text-[11px] !h-[17px]" @change="setSize('h', num($event))" />
      </div>
      <button
        class="w-6 h-6 grid place-items-center rounded-sm border"
        :class="lockRatio ? 'bg-blue-100 border-blue-400' : 'border-neutral-300 bg-white'"
        :title="lockRatio ? t('Proporción bloqueada') : t('Proporción libre')"
        :aria-pressed="lockRatio"
        @click="lockRatio = !lockRatio"
      >
        <svg viewBox="0 0 24 24" class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="5" y="11" width="14" height="9" rx="1" />
          <path :d="lockRatio ? 'M8 11V8a4 4 0 0 1 8 0v3' : 'M8 11V8a4 4 0 0 1 8 0'" />
        </svg>
      </button>

      <div class="w-px h-6 bg-neutral-300" />
      <label class="flex items-center gap-1" :title="t('Ángulo de rotación')">
        <svg viewBox="0 0 24 24" class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 12a8 8 0 1 1-3-6.2M20 4v5h-5" /></svg>
        <input type="number" step="1" :value="angle" class="w-14" :aria-label="t('Ángulo')" @change="setFrame({ rotation: 360 - num($event) })" />°
      </label>
      <button class="w-7 h-6 rounded-sm border border-neutral-300 bg-white hover:bg-neutral-100" :title="t('Reflejar horizontalmente')" :aria-label="t('Reflejar horizontalmente')" @click="flip('x')">⇋</button>
      <button class="w-7 h-6 rounded-sm border border-neutral-300 bg-white hover:bg-neutral-100 rotate-90" :title="t('Reflejar verticalmente')" :aria-label="t('Reflejar verticalmente')" @click="flip('y')">⇋</button>

      <div class="w-px h-6 bg-neutral-300" />
      <label class="flex items-center gap-1" :title="t('Ancho de contorno')">
        <svg viewBox="0 0 24 24" class="w-4 h-4" stroke="currentColor"><path d="M3 6h18" stroke-width="1" /><path d="M3 12h18" stroke-width="2.5" /><path d="M3 19h18" stroke-width="4" /></svg>
        <select :value="selected[0]?.strokeWidth" :aria-label="t('Ancho de contorno')" @change="applyStyle({ strokeWidth: num($event) })">
          <option v-if="!widths.includes(selected[0]?.strokeWidth)" :value="selected[0]?.strokeWidth">{{ r2(selected[0]?.strokeWidth ?? 0) }} mm</option>
          <option v-for="w in widths" :key="w" :value="w">{{ w }} mm</option>
        </select>
      </label>

      <template v-if="one?.type === 'rect'">
        <div class="w-px h-6 bg-neutral-300" />
        <span class="flex items-center gap-1">{{ t('Esquinas:') }}
          <input
            v-for="(r, i) in radii" :key="i" type="number" min="0" step="0.5" :value="r2(r)" class="w-12"
            :title="radii.length > 1 ? t(CORNERS[i]) : undefined" :aria-label="radii.length > 1 ? t(CORNERS[i]) : t('Radio de las esquinas')"
            @change="setRadius(i, num($event))"
          />
          mm
          <button
            class="w-6 h-6 grid place-items-center rounded-sm border"
            :class="radii.length === 1 ? 'bg-blue-100 border-blue-400' : 'border-neutral-300 bg-white'"
            :title="radii.length === 1 ? t('Mismo radio en todas las esquinas') : t('Radio independiente por esquina')"
            :aria-pressed="radii.length === 1"
            @click="toggleCorners"
          >
            <svg viewBox="0 0 24 24" class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="5" y="11" width="14" height="9" rx="1" />
              <path :d="radii.length === 1 ? 'M8 11V8a4 4 0 0 1 8 0v3' : 'M8 11V8a4 4 0 0 1 8 0'" />
            </svg>
          </button>
        </span>
      </template>
      <template v-if="one?.type === 'polygon'">
        <div class="w-px h-6 bg-neutral-300" />
        <label class="flex items-center gap-1">{{ t('Lados:') }} <input type="number" min="3" max="50" :value="one.sides" class="w-12" @change="setSides(num($event))" /></label>
      </template>
      <template v-if="one?.type === 'text'">
        <div class="w-px h-6 bg-neutral-300" />
        <select :value="one.fontFamily" :aria-label="t('Fuente')" class="w-36" @change="setFont({ fontFamily: ($event.target as HTMLSelectElement).value })">
          <option v-for="f in FONTS" :key="f" :value="f" :style="{ fontFamily: f }">{{ f }}</option>
        </select>
        <label class="flex items-center gap-1">
          <input type="number" min="1" step="1" :value="r2((one.fontSize ?? 0) / PT)" class="w-14" :aria-label="t('Tamaño de fuente')" @change="setFont({ fontSize: num($event) * PT })" /> pt
        </label>
      </template>
      <template v-if="one?.type === 'dimension'">
        <div class="w-px h-6 bg-neutral-300" />
        <label class="flex items-center gap-1">{{ t('Decimales') }}
          <select :value="dimTarget.decimals" @change="setDim({ decimals: num($event) })">
            <option v-for="d in 4" :key="d" :value="d - 1">{{ d - 1 }}</option>
          </select>
        </label>
        <label class="flex items-center gap-1"><input type="checkbox" class="!h-auto" :checked="dimTarget.units" @change="setDim({ units: ($event.target as HTMLInputElement).checked })" /> {{ t('Unidades') }}</label>
        <label class="flex items-center gap-1">{{ t('Texto') }}
          <input type="number" min="1" step="1" :value="r2((one.fontSize ?? 0) / PT)" class="w-12" :aria-label="t('Tamaño del texto de la cota')" @change="setFont({ fontSize: num($event) * PT })" /> pt
        </label>
      </template>

      <template v-if="selected.length > 1 || canUngroup()">
        <div class="w-px h-6 bg-neutral-300" />
        <button v-if="selected.length > 1" :class="btn" :title="t('Agrupar (Ctrl+G)')" @click="group">{{ t('Agrupar') }}</button>
        <button v-if="canUngroup()" :class="btn" :title="t('Desagrupar (Ctrl+U)')" @click="ungroup()">{{ t('Desagrupar') }}</button>
      </template>
      <template v-if="canConvert || canBreak || curvableCount > 1">
        <div class="w-px h-6 bg-neutral-300" />
        <button v-if="canConvert" :class="btn" :title="t('Convertir a curvas (Ctrl+Q)')" @click="toCurves">{{ t('Convertir a curvas') }}</button>
        <button v-if="curvableCount > 1" :class="btn" :title="t('Combinar (Ctrl+L)')" @click="combine">{{ t('Combinar') }}</button>
        <button v-if="canBreak" :class="btn" :title="t('Separar (Ctrl+K)')" @click="breakApart">{{ t('Separar') }}</button>
      </template>
      <template v-if="curvableCount > 1">
        <div class="w-px h-6 bg-neutral-300" />
        <div class="flex gap-0.5">
          <button v-for="b in shaping" :key="b.op" :class="btn" :title="t(b.title)" @click="booleanOp(b.op)">{{ t(b.label) }}</button>
        </div>
      </template>
    </template>
  </div>
</template>
