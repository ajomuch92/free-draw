import { ref } from "vue";
import { state, uid, resetHistory, zoomPage, makeShape, commit, type Page } from "./store";
import { t } from "./i18n";

// Desktop (Tauri) gets native dialogs and real files; the browser falls back to downloads.
export const isTauri = "__TAURI_INTERNALS__" in window;

const docFilter = () => ({ name: t("Documento de Free Draw"), extensions: ["fdraw"] });

export async function ask(text: string) {
  if (!isTauri) return confirm(text);
  const { ask } = await import("@tauri-apps/plugin-dialog");
  return ask(text, { title: "Free Draw", kind: "warning", okLabel: t("Descartar"), cancelLabel: t("Cancelar") });
}

export async function tell(text: string) {
  if (!isTauri) return alert(text);
  const { message } = await import("@tauri-apps/plugin-dialog");
  await message(text, { title: "Free Draw" });
}

const confirmDiscard = () => !state.dirty || ask(t("Hay cambios sin guardar. ¿Descartarlos?"));
export const baseName = (p: string) => p.split(/[\\/]/).pop()!.replace(/\.[^.]+$/, "");

function download(blob: Blob, name: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

async function savePath(name: string, filter: { name: string; extensions: string[] }) {
  const { save } = await import("@tauri-apps/plugin-dialog");
  return save({ defaultPath: `${name}.${filter.extensions[0]}`, filters: [filter] });
}

// Write text or bytes to a user-chosen file (Tauri) or download it (browser).
async function writeOut(data: string | Uint8Array, name: string, filter: { name: string; extensions: string[] }, mime: string) {
  if (!isTauri) {
    download(new Blob([data as BlobPart], { type: mime }), `${name}.${filter.extensions[0]}`);
    return true;
  }
  const path = await savePath(name, filter);
  if (!path) return false;
  const fs = await import("@tauri-apps/plugin-fs");
  if (typeof data === "string") await fs.writeTextFile(path, data);
  else await fs.writeFile(path, data);
  return true;
}

// ---------- document ----------

function load(doc: { app?: string; page?: typeof state.page; pages?: Page[]; shapes?: Page["shapes"]; guides?: typeof state.guides; grid?: typeof state.grid }, name: string, path: string | null) {
  // v1 files had a single page under "shapes"
  const pages = doc.pages ?? (Array.isArray(doc.shapes) ? [{ id: uid(), name: t("Página {n}", { n: 1 }), shapes: doc.shapes }] : null);
  if (doc.app !== "free-draw" || !pages?.length) throw new Error("formato");
  state.pages = pages;
  state.pageIndex = 0;
  state.page = doc.page ?? state.page;
  state.guides = doc.guides ?? [];
  if (doc.grid) state.grid = doc.grid;
  state.selection = [];
  state.fileName = name;
  state.filePath = path;
  state.home = false;
  resetHistory();
  zoomPage();
}

function resetDoc() {
  state.pages = [{ id: uid(), name: t("Página {n}", { n: 1 }), shapes: [] }];
  state.pageIndex = 0;
  state.guides = [];
  state.selection = [];
  state.fileName = t("Sin título");
  state.filePath = null;
  resetHistory();
  zoomPage();
}

export async function newDoc() {
  if (!(await confirmDiscard())) return;
  resetDoc();
  state.home = false;
}

// Close the document and show the home screen with the recent files.
export async function closeDoc() {
  if (!(await confirmDiscard())) return;
  resetDoc();
  state.home = true;
}

// ---------- recent files (desktop only: the browser never sees real paths) ----------

const RECENT_KEY = "fd-recent";
export const recent = ref<string[]>((() => {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
  } catch {
    return [];
  }
})());
function setRecent(list: string[]) {
  recent.value = list.slice(0, 8);
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(recent.value));
  } catch {}
}
const remember = (path: string) => setRecent([path, ...recent.value.filter((p) => p !== path)]);

async function readDoc(path: string) {
  const { readTextFile } = await import("@tauri-apps/plugin-fs");
  load(JSON.parse(await readTextFile(path)), baseName(path), path);
  remember(path);
}

export async function openRecent(path: string) {
  if (!(await confirmDiscard())) return;
  try {
    await readDoc(path);
  } catch {
    setRecent(recent.value.filter((p) => p !== path));
    await tell(t("No se pudo abrir {path}. Se quitó de los recientes.", { path }));
  }
}

export async function openDoc() {
  if (!(await confirmDiscard())) return;
  try {
    if (isTauri) {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const path = await open({ multiple: false, filters: [docFilter(), { name: "JSON", extensions: ["json"] }] });
      if (path) await readDoc(path);
      return;
    }
    const file = await new Promise<File | undefined>((resolve) => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = ".fdraw,.json";
      input.onchange = () => resolve(input.files?.[0]);
      input.click();
    });
    if (file) load(JSON.parse(await file.text()), baseName(file.name), null);
  } catch {
    await tell(t("El archivo no es un documento de Free Draw válido."));
  }
}

// ---------- import ----------

// The browser picker works in the Tauri webview too; the image is embedded as a data URL.
export async function importImage() {
  const file = await new Promise<File | undefined>((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = () => resolve(input.files?.[0]);
    input.click();
  });
  if (!file) return;
  const src = await new Promise<string>((resolve) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.readAsDataURL(file);
  });
  const img = new Image();
  img.src = src;
  try {
    await img.decode();
  } catch {
    return tell(t("No se pudo leer la imagen."));
  }
  // 96 dpi, shrunk to fit the page, centred on it
  const k = Math.min(25.4 / 96, state.page.w / img.naturalWidth, state.page.h / img.naturalHeight);
  const w = img.naturalWidth * k, h = img.naturalHeight * k;
  const s = makeShape("image", { src, w, h, x: (state.page.w - w) / 2, y: (state.page.h - h) / 2, name: baseName(file.name) });
  state.shapes.push(s);
  state.selection = [s.id];
  commit();
}

const docJSON = () =>
  JSON.stringify({ app: "free-draw", version: 2, page: state.page, pages: state.pages, guides: state.guides, grid: state.grid });

export async function saveDoc(as = false) {
  state.editingText = null;
  if (isTauri && state.filePath && !as) {
    const { writeTextFile } = await import("@tauri-apps/plugin-fs");
    await writeTextFile(state.filePath, docJSON());
    state.dirty = false;
    return;
  }
  if (!isTauri) {
    download(new Blob([docJSON()], { type: "application/json" }), `${state.fileName}.fdraw`);
    state.dirty = false;
    return;
  }
  const path = await savePath(state.fileName, docFilter());
  if (!path) return;
  const { writeTextFile } = await import("@tauri-apps/plugin-fs");
  await writeTextFile(path, docJSON());
  state.filePath = path;
  state.fileName = baseName(path);
  state.dirty = false;
  remember(path);
}

// ---------- export (current page) ----------

// Standalone SVG of the current page's objects for the given world viewBox.
export function shapesSVG(view = [0, 0, state.page.w, state.page.h], size = [`${state.page.w}mm`, `${state.page.h}mm`], background = "") {
  state.editingText = null;
  const g = document.getElementById("fd-shapes")!.cloneNode(true) as Element;
  g.querySelectorAll(".fd-hit").forEach((n) => n.remove());
  g.querySelectorAll("[data-id]").forEach((n) => n.removeAttribute("data-id"));
  g.querySelectorAll("[pointer-events]").forEach((n) => n.removeAttribute("pointer-events"));
  const bg = background && `<rect width="${state.page.w}" height="${state.page.h}" fill="${background}"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size[0]}" height="${size[1]}" viewBox="${view.join(" ")}">${bg}${g.innerHTML}</svg>`;
}
const pageSVG = () => shapesSVG();

const exportName = () => (state.pages.length > 1 ? `${state.fileName} - ${state.pages[state.pageIndex].name}` : state.fileName);

export async function exportSVG() {
  await writeOut(pageSVG(), exportName(), { name: "SVG", extensions: ["svg"] }, "image/svg+xml");
}

// World box around the drawn objects of the current page, or null when there are none.
// getBBox ignores stroke width, so pad by the widest outline.
export function drawingBounds() {
  const b = (document.getElementById("fd-shapes") as unknown as SVGGraphicsElement).getBBox();
  if (!b.width && !b.height) return null;
  const pad = Math.max(0, ...state.shapes.filter((s) => s.visible && s.stroke !== "none").map((s) => s.strokeWidth));
  return { x: b.x - pad, y: b.y - pad, w: b.width + 2 * pad, h: b.height + 2 * pad };
}

// PNG of the objects only (cropped to them, not the page).
export async function exportPNG(dpi = 300, transparent = false) {
  const b = drawingBounds();
  if (!b) return tell(t("No hay objetos para exportar."));
  const img = new Image();
  img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(shapesSVG([b.x, b.y, b.w, b.h], [`${b.w}mm`, `${b.h}mm`]));
  await img.decode();
  const k = dpi / 25.4, canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(b.w * k));
  canvas.height = Math.max(1, Math.round(b.h * k));
  const ctx = canvas.getContext("2d")!;
  if (!transparent) (ctx.fillStyle = "#fff", ctx.fillRect(0, 0, canvas.width, canvas.height));
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r));
  // the browser refuses canvases past its size limit
  if (!blob) return tell(t("La imagen es demasiado grande. Prueba con menos puntos por pulgada."));
  await writeOut(new Uint8Array(await blob.arrayBuffer()), exportName(), { name: "PNG", extensions: ["png"] }, "image/png");
}

// Ask before the desktop window closes with unsaved changes.
export async function guardWindowClose() {
  if (!isTauri) {
    window.addEventListener("beforeunload", (e) => state.dirty && e.preventDefault());
    return;
  }
  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  await getCurrentWindow().onCloseRequested(async (e) => {
    if (!(await confirmDiscard())) e.preventDefault();
  });
}
