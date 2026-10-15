import { state, selected, units, uid, bounds, commit, type Shape } from "./store";

// ---------- groups ----------

export function group() {
  const list = selected.value;
  if (list.length < 2) return;
  const g = uid();
  list.forEach((s) => (s.groups = [g, ...(s.groups ?? [])]));
  // keep members contiguous: gather them at the position of the top-most one
  const top = Math.max(...list.map((s) => state.shapes.indexOf(s)));
  const before = state.shapes.slice(0, top + 1).filter((s) => !list.includes(s));
  const after = state.shapes.slice(top + 1);
  state.shapes = [...before, ...state.shapes.filter((s) => list.includes(s)), ...after];
  commit();
}

// Remove the outermost group level (Ctrl+U) or every level.
export function ungroup(all = false) {
  const list = selected.value.filter((s) => s.groups?.length);
  if (!list.length) return;
  list.forEach((s) => {
    s.groups = all ? undefined : s.groups!.slice(1);
    if (!s.groups?.length) delete s.groups;
  });
  commit();
}

export const canUngroup = () => selected.value.some((s) => s.groups?.length);

// ---------- align & distribute ----------

export type Edge = "left" | "right" | "top" | "bottom" | "centerX" | "centerY";
type Box = { x: number; y: number; w: number; h: number };

// Selected objects as units (a group moves as one).
const selectedUnits = () => units().filter((u) => u.some((s) => state.selection.includes(s.id)));
const move = (u: Shape[], dx: number, dy: number) => u.forEach((s) => ((s.x += dx), (s.y += dy)));

function delta(edge: Edge, b: Box, t: Box): [number, number] {
  switch (edge) {
    case "left": return [t.x - b.x, 0];
    case "right": return [t.x + t.w - (b.x + b.w), 0];
    case "top": return [0, t.y - b.y];
    case "bottom": return [0, t.y + t.h - (b.y + b.h)];
    case "centerX": return [t.x + t.w / 2 - (b.x + b.w / 2), 0]; // same vertical axis
    case "centerY": return [0, t.y + t.h / 2 - (b.y + b.h / 2)]; // same horizontal axis
  }
}

// CorelDRAW aligns to the last selected object, or to the page.
export function align(edges: Edge[], toPage = false) {
  const us = selectedUnits();
  if (!us.length || (!toPage && us.length < 2)) return;
  const lastId = state.selection[state.selection.length - 1];
  const target = toPage ? null : us.find((u) => u.some((s) => s.id === lastId)) ?? us[us.length - 1];
  const t: Box = target ? bounds(target) : { x: 0, y: 0, w: state.page.w, h: state.page.h };
  for (const u of us) {
    if (u === target) continue;
    for (const e of edges) move(u, ...delta(e, bounds(u), t));
  }
  commit();
}

// Equal gaps between the selected objects along an axis.
export function distribute(axis: "x" | "y") {
  const us = selectedUnits().map((u) => ({ u, b: bounds(u) }));
  if (us.length < 3) return;
  const pos = (b: Box) => (axis === "x" ? b.x : b.y), size = (b: Box) => (axis === "x" ? b.w : b.h);
  us.sort((a, b) => pos(a.b) - pos(b.b));
  const first = us[0].b, last = us[us.length - 1].b;
  const span = pos(last) + size(last) - pos(first);
  const gap = (span - us.reduce((n, x) => n + size(x.b), 0)) / (us.length - 1);
  let cursor = pos(first);
  for (const { u, b } of us) {
    const d = cursor - pos(b);
    move(u, axis === "x" ? d : 0, axis === "y" ? d : 0);
    cursor += size(b) + gap;
  }
  commit();
}
