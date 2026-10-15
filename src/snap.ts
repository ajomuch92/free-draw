import { state, bounds, type P, type Link, type Shape } from "./store";
import { snapCandidates, type SnapPoint } from "./paths";

const tol = () => 8 / state.zoom;

export interface SnapResult {
  p: P;
  mark: P | null; // where to draw the snap marker
  link?: Link; // set when it landed on an object node
}

// Built once per gesture; object nodes are the expensive part.
export function snapContext(exclude: Set<string> = new Set()) {
  return { points: state.snapTo.objects ? snapCandidates(exclude) : ([] as SnapPoint[]) };
}

// Snap one point: object nodes first, then guides and grid per axis.
export function snapPoint(p: P, ctx: { points: SnapPoint[] }, objects = true): SnapResult {
  const t = tol();
  if (objects) {
    let best: SnapPoint | null = null, bd = t;
    for (const c of ctx.points) {
      const d = Math.hypot(c.x - p.x, c.y - p.y);
      if (d < bd) (bd = d, best = c);
    }
    if (best) return { p: { x: best.x, y: best.y }, mark: { x: best.x, y: best.y }, link: best.link };
  }
  const x = snapAxis(p.x, "x", t), y = snapAxis(p.y, "y", t);
  const q = { x: x ?? p.x, y: y ?? p.y };
  return { p: q, mark: x !== null || y !== null ? q : null };
}

function snapAxis(v: number, axis: "x" | "y", t: number): number | null {
  let best: number | null = null, bd = t;
  const consider = (c: number) => Math.abs(c - v) < bd && ((bd = Math.abs(c - v)), (best = c));
  if (state.snapTo.guides) state.guides.filter((g) => g.axis === axis).forEach((g) => consider(g.pos));
  if (state.snapTo.grid) consider(Math.round(v / state.grid.spacing) * state.grid.spacing);
  return best;
}

// Moving a selection: align its left/centre/right (top/middle/bottom) with guides,
// grid lines and other objects' edges and centres. Returns the corrected delta and
// the lines to highlight.
export function moveTargets(exclude: Set<string>) {
  const others = state.snapTo.objects ? state.shapes.filter((s: Shape) => s.visible && !exclude.has(s.id)).map((s) => bounds([s])) : [];
  return {
    x: others.flatMap((b) => [b.x, b.x + b.w / 2, b.x + b.w]),
    y: others.flatMap((b) => [b.y, b.y + b.h / 2, b.y + b.h]),
  };
}

export function snapMove(box: { x: number; y: number; w: number; h: number }, dx: number, dy: number, targets: { x: number[]; y: number[] }) {
  const t = tol();
  const lines: { axis: "x" | "y"; pos: number }[] = [];
  const fix = (keys: number[], axis: "x" | "y", extra: number[]) => {
    let best: { d: number; pos: number } | null = null;
    for (const k of keys) {
      const cands = [...extra];
      if (state.snapTo.guides) cands.push(...state.guides.filter((g) => g.axis === axis).map((g) => g.pos));
      if (state.snapTo.grid) cands.push(Math.round(k / state.grid.spacing) * state.grid.spacing);
      for (const c of cands) if (Math.abs(c - k) < t && (!best || Math.abs(c - k) < Math.abs(best.d))) best = { d: c - k, pos: c };
    }
    if (best) lines.push({ axis, pos: best.pos });
    return best?.d ?? 0;
  };
  const x0 = box.x + dx, y0 = box.y + dy;
  const ddx = fix([x0, x0 + box.w / 2, x0 + box.w], "x", targets.x);
  const ddy = fix([y0, y0 + box.h / 2, y0 + box.h], "y", targets.y);
  return { dx: dx + ddx, dy: dy + ddy, lines };
}
