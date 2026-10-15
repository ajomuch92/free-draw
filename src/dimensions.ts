import paper from "paper";
import {
  state, selected, makeShape, fromPoints, beforeCommit, commit, measureText,
  type DimKind, type P, type Shape, type Link, type PNode,
} from "./store";
import { toWorld, resolveLink, fromPaper, setWorldPaths, breakApart as breakCurve } from "./paths";

export interface DimGeometry {
  lines: string; // path data for extension + dimension lines
  arrows: string[]; // polygon points
  label: { x: number; y: number; angle: number; dy: number; text: string };
}

const sub = (a: P, b: P): P => ({ x: a.x - b.x, y: a.y - b.y });
const add = (a: P, b: P, k = 1): P => ({ x: a.x + b.x * k, y: a.y + b.y * k });
const len = (v: P) => Math.hypot(v.x, v.y);
const unit = (v: P): P => { const l = len(v) || 1; return { x: v.x / l, y: v.y / l }; };

function arrow(tip: P, dir: P, size: number) {
  const d = unit(dir), base = add(tip, d, -size), n = { x: -d.y, y: d.x }, w = size * 0.3;
  const a = add(base, n, w), b = add(base, n, -w);
  return { pts: `${tip.x},${tip.y} ${a.x},${a.y} ${b.x},${b.y}`, base };
}

// Create a dimension shape from world points (A, B, placement) or (vertex, A, B, placement).
// links[i] ties measured point i to an object so the value follows it.
export function makeDimension(kind: DimKind, pts: P[], links: (Link | null)[] = []): Shape {
  const b = fromPoints(pts);
  return makeShape("dimension", {
    x: b.x, y: b.y, w: b.w, h: b.h,
    fill: "none",
    fontSize: 3.5, fontFamily: "Arial",
    dim: { kind, pts: b.points, ...state.dimDefaults, links: links.some(Boolean) ? links : undefined },
  });
}

// Re-measure linked dimensions after their objects changed. The placement point
// travels with the midpoint of the measured points so the dimension keeps its offset.
// A linked dimension moved on its own snaps back to its objects.
export function updateLinkedDimensions() {
  for (const s of state.shapes) {
    const links = s.dim?.links;
    if (!links) continue;
    const W = s.dim!.pts.map(([x, y]) => toWorld(s, x, y));
    const n = W.length - 1; // last point is the placement
    const N = W.slice(0, n).map((p, i) => (links[i] && resolveLink(links[i]!)) || p);
    const mid = (a: P[]) => ({ x: a.reduce((t, p) => t + p.x, 0) / a.length, y: a.reduce((t, p) => t + p.y, 0) / a.length });
    const m0 = mid(W.slice(0, n)), m1 = mid(N);
    const moved = N.some((p, i) => Math.hypot(p.x - W[i].x, p.y - W[i].y) > 1e-9);
    if (!moved) continue;
    const b = fromPoints([...N, { x: W[n].x + m1.x - m0.x, y: W[n].y + m1.y - m0.y }]);
    Object.assign(s, { x: b.x, y: b.y, w: b.w, h: b.h, rotation: 0, flipX: false, flipY: false });
    s.dim!.pts = b.points;
  }
}
beforeCommit.push(updateLinkedDimensions);

export function format(s: Shape, value: number) {
  const d = s.dim!;
  if (d.kind === "angular") return `${value.toFixed(d.decimals)}°`;
  return `${value.toFixed(d.decimals)}${d.units ? " mm" : ""}`;
}

export function dimensionGeometry(s: Shape): DimGeometry | null {
  const d = s.dim;
  if (!d) return null;
  const W = d.pts.map(([x, y]) => toWorld(s, x, y));
  const fs = s.fontSize ?? 3.5, size = Math.max(fs * 0.7, s.strokeWidth * 4), gap = 1, over = 1.5;

  if (d.kind === "angular") {
    const [V, A, B, Pp] = W;
    const a1 = Math.atan2(A.y - V.y, A.x - V.x), a2 = Math.atan2(B.y - V.y, B.x - V.x);
    const ap = Math.atan2(Pp.y - V.y, Pp.x - V.x), r = Math.max(len(sub(Pp, V)), 1);
    const TAU = Math.PI * 2, norm = (a: number) => ((a % TAU) + TAU) % TAU;
    let start = a1, sweep = norm(a2 - a1);
    if (norm(ap - a1) > sweep) (start = a2, sweep = TAU - sweep); // measure the side the cursor is on
    const at = (a: number, rr = r): P => ({ x: V.x + Math.cos(a) * rr, y: V.y + Math.sin(a) * rr });
    const p0 = at(start), p1 = at(start + sweep);
    const t0 = { x: Math.sin(start), y: -Math.cos(start) }; // points back along the arc
    const t1 = { x: -Math.sin(start + sweep), y: Math.cos(start + sweep) };
    const arm = (a: number, p: P) => `M${V.x} ${V.y} L${at(a, Math.max(len(sub(p, V)), r + over)).x} ${at(a, Math.max(len(sub(p, V)), r + over)).y}`;
    const mid = start + sweep / 2, lp = at(mid, r + fs * 0.9);
    return {
      lines: `${arm(a1, A)} ${arm(a2, B)} M${p0.x} ${p0.y} A${r} ${r} 0 ${sweep > Math.PI ? 1 : 0} 1 ${p1.x} ${p1.y}`,
      arrows: [arrow(p0, t0, size).pts, arrow(p1, t1, size).pts],
      label: { x: lp.x, y: lp.y, angle: 0, dy: fs * 0.35, text: format(s, (sweep * 180) / Math.PI) },
    };
  }

  const [A, B, Pp] = W;
  let A2: P, B2: P, value: number;
  if (d.kind === "h") (A2 = { x: A.x, y: Pp.y }, B2 = { x: B.x, y: Pp.y }, value = Math.abs(B.x - A.x));
  else if (d.kind === "v") (A2 = { x: Pp.x, y: A.y }, B2 = { x: Pp.x, y: B.y }, value = Math.abs(B.y - A.y));
  else {
    const u = unit(sub(B, A)), n = { x: -u.y, y: u.x };
    const off = (Pp.x - A.x) * n.x + (Pp.y - A.y) * n.y;
    A2 = add(A, n, off);
    B2 = add(B, n, off);
    value = len(sub(B, A));
  }
  const ext = (from: P, to: P) => {
    const v = sub(to, from);
    if (len(v) < gap) return "";
    const e = unit(v), s0 = add(from, e, gap), s1 = add(to, e, over);
    return `M${s0.x} ${s0.y} L${s1.x} ${s1.y}`;
  };
  const dir = sub(B2, A2);
  const aA = arrow(A2, { x: -dir.x, y: -dir.y }, size), aB = arrow(B2, dir, size);
  let angle = (Math.atan2(dir.y, dir.x) * 180) / Math.PI;
  if (angle > 90) angle -= 180;
  if (angle <= -90) angle += 180;
  const m = { x: (A2.x + B2.x) / 2, y: (A2.y + B2.y) / 2 };
  return {
    lines: `${ext(A, A2)} ${ext(B, B2)} M${aA.base.x} ${aA.base.y} L${aB.base.x} ${aB.base.y}`,
    arrows: [aA.pts, aB.pts],
    label: { x: m.x, y: m.y, angle, dy: -fs * 0.4, text: format(s, value) },
  };
}

// Break a dimension into plain objects (CorelDRAW "Break Dimension Apart"):
// extension/dimension lines, arrowheads and the label as editable text.
function breakDimension(s: Shape) {
  const g = dimensionGeometry(s)!;
  const color = s.stroke === "none" ? "#000000" : s.stroke, fs = s.fontSize ?? 3.5;
  const common = { strokeWidth: s.strokeWidth, opacity: s.opacity, groups: s.groups };

  const lines = makeShape("path", { ...common, stroke: color, fill: "none", dash: "solid" });
  setWorldPaths(lines, fromPaper(new paper.CompoundPath(g.lines)));

  const corner = (xy: string): PNode => {
    const [x, y] = xy.split(",").map(Number);
    return { x, y, ix: 0, iy: 0, ox: 0, oy: 0, kind: "cusp" };
  };
  const arrows = makeShape("path", { ...common, stroke: "none", fill: color });
  setWorldPaths(arrows, g.arrows.map((pts) => ({ closed: true, nodes: pts.split(" ").map(corner) })));

  // the label is anchored at its baseline centre; a text shape is placed by its box centre (0.3 em above the baseline)
  const L = g.label, a = (L.angle * Math.PI) / 180, off = L.dy - fs * 0.3;
  const text = makeShape("text", { ...common, text: L.text, fontSize: fs, fontFamily: s.fontFamily, fill: color, stroke: "none", rotation: (L.angle + 360) % 360 });
  measureText(text);
  text.x = L.x - off * Math.sin(a) - text.w / 2;
  text.y = L.y + off * Math.cos(a) - text.h / 2;

  const parts = [lines, arrows, text];
  state.shapes.splice(state.shapes.indexOf(s), 1, ...parts);
  return parts;
}

// Ctrl+K: dimensions break into lines, arrows and text; curves into their subpaths.
export function breakApart() {
  const dims = selected.value.filter((s) => s.type === "dimension");
  if (!dims.length) return breakCurve();
  state.selection = dims.flatMap(breakDimension).map((p) => p.id);
  commit();
}

// H/V tool: pick the axis from where the placement point sits relative to A..B.
export function hvKind(A: P, B: P, Pp: P): DimKind {
  const outX = Math.max(0, Math.min(A.x, B.x) - Pp.x, Pp.x - Math.max(A.x, B.x));
  const outY = Math.max(0, Math.min(A.y, B.y) - Pp.y, Pp.y - Math.max(A.y, B.y));
  return outX > outY ? "v" : "h";
}
