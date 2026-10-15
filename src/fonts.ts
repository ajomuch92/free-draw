import { state, selected, makeShape, commit, type Shape, type SubPath, type PNode } from "./store";
import { convertToCurves, setWorldPaths, toWorld, isCurvable } from "./paths";
import { isTauri, tell } from "./files";
import { t } from "./i18n";

// Text outlines come from the installed Windows fonts, read through the Tauri fs plugin.
// ponytail: Windows-only font lookup by file name; use a font-matching crate for macOS/Linux
const FONT_FILES: Record<string, string> = {
  Arial: "arial.ttf",
  "Times New Roman": "times.ttf",
  "Courier New": "cour.ttf",
  Georgia: "georgia.ttf",
  Verdana: "verdana.ttf",
  "Segoe UI": "segoeui.ttf",
  Impact: "impact.ttf",
};

type Cmd = { type: string; x?: number; y?: number; x1?: number; y1?: number; x2?: number; y2?: number };

// opentype path commands (text space) -> subpaths with handles relative to their node.
function toSubPaths(cmds: Cmd[]): SubPath[] {
  const out: SubPath[] = [];
  let cur: SubPath | null = null;
  const node = (x: number, y: number): PNode => ({ x, y, ix: 0, iy: 0, ox: 0, oy: 0, kind: "cusp" });
  // glyph contours are always closed; opentype.js 2 omits the Z, so close on every new M and at the end
  const close = (sp: SubPath | null) => {
    if (!sp || sp.closed) return;
    sp.closed = true;
    const first = sp.nodes[0], end = sp.nodes[sp.nodes.length - 1];
    // contours usually end on their start point: merge the duplicate node
    if (sp.nodes.length > 1 && Math.hypot(end.x - first.x, end.y - first.y) < 1e-6) {
      first.ix = end.ix;
      first.iy = end.iy;
      sp.nodes.pop();
    }
  };
  for (const c of cmds) {
    const last = cur?.nodes[cur.nodes.length - 1];
    if (c.type === "M") (close(cur), out.push((cur = { closed: false, nodes: [node(c.x!, c.y!)] })));
    else if (c.type === "L" && cur) cur.nodes.push(node(c.x!, c.y!));
    else if ((c.type === "C" || c.type === "Q") && cur && last) {
      // quadratic -> cubic: control points at 2/3 towards the quadratic control
      const [c1x, c1y, c2x, c2y] = c.type === "C"
        ? [c.x1!, c.y1!, c.x2!, c.y2!]
        : [last.x + (2 / 3) * (c.x1! - last.x), last.y + (2 / 3) * (c.y1! - last.y), c.x! + (2 / 3) * (c.x1! - c.x!), c.y! + (2 / 3) * (c.y1! - c.y!)];
      last.ox = c1x - last.x;
      last.oy = c1y - last.y;
      const n = node(c.x!, c.y!);
      n.ix = c2x - n.x;
      n.iy = c2y - n.y;
      cur.nodes.push(n);
    } else if (c.type === "Z") close(cur);
  }
  close(cur);
  return out.filter((sp) => sp.nodes.length > 1);
}

// World-space glyph outlines of text shape s.
export function outlineText(font: { getPath: (t: string, x: number, y: number, size: number) => { commands: unknown[] } }, s: Shape): SubPath[] {
  const fs = s.fontSize ?? 10, natW = s.natW || 1, natH = s.natH || 1;
  // same baselines as the SVG text: first line at 0.9em, then 1.2em apart
  const cmds = (s.text ?? "").split("\n").flatMap((line, i) => font.getPath(line, 0, fs * (0.9 + 1.2 * i), fs).commands as Cmd[]);
  // text space -> world, through the text's stretch, rotation and flips
  const W = (x: number, y: number) => toWorld(s, x / natW, y / natH);
  return toSubPaths(cmds).map((sp) => ({
    closed: sp.closed,
    nodes: sp.nodes.map((n) => {
      const p = W(n.x, n.y), i = W(n.x + n.ix, n.y + n.iy), o = W(n.x + n.ox, n.y + n.oy);
      return { ...n, x: p.x, y: p.y, ix: i.x - p.x, iy: i.y - p.y, ox: o.x - p.x, oy: o.y - p.y };
    }),
  }));
}

async function textToCurves(texts: Shape[]) {
  const [{ readFile }, opentype] = await Promise.all([import("@tauri-apps/plugin-fs"), import("opentype.js")]);
  const made: Shape[] = [];
  for (const s of texts) {
    const file = FONT_FILES[s.fontFamily ?? ""];
    if (!file) continue;
    const bytes = await readFile(`C:/Windows/Fonts/${file}`);
    const subs = outlineText(opentype.parse(bytes.buffer), s);
    if (!subs.length) continue;
    const { fill, gradient, stroke, strokeWidth, dash, cap, join, opacity, groups, rotation } = s;
    const res = makeShape("path", { fill, gradient, stroke, strokeWidth, dash, cap, join, opacity, groups, rotation, name: s.name });
    setWorldPaths(res, subs);
    state.shapes.splice(state.shapes.indexOf(s), 1, res);
    made.push(res);
  }
  return made;
}

// Ctrl+Q: shapes become curves; text becomes glyph outlines (desktop only).
export async function toCurves() {
  const texts = selected.value.filter((s) => s.type === "text");
  const shapes = selected.value.filter((s) => isCurvable(s) && s.type !== "path");
  if (texts.length && !isTauri) await tell(t("Convertir texto a curvas solo está disponible en la app de escritorio (usa las fuentes de Windows)."));
  if (shapes.length) convertToCurves(shapes);
  if (!texts.length || !isTauri) return;
  try {
    const made = await textToCurves(texts);
    state.selection = [...state.selection.filter((id) => state.shapes.some((s) => s.id === id)), ...made.map((m) => m.id)];
    commit();
  } catch (e) {
    await tell(t("No se pudo leer la fuente: {e}", { e: String(e) }));
  }
}
