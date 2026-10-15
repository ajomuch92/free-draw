import paper from "paper";
import {
  state, selected, makeShape, commit, polygonPoints, uid,
  type Shape, type SubPath, type PNode, type NodeKind, type P, type Link,
} from "./store";

// paper.js is used headless, for curve maths only (bounds, simplify, booleans).
paper.setup(new paper.Size(1, 1));
paper.settings.insertItems = false;

const KAPPA = 0.5522847498;
const node = (x: number, y: number, ix = 0, iy = 0, ox = 0, oy = 0, kind: NodeKind = "cusp"): PNode => ({ x, y, ix, iy, ox, oy, kind });

// ---------- shape <-> curves (normalised local space) ----------

export const isCurvable = (s: Shape) => s.type === "rect" || s.type === "ellipse" || s.type === "polygon" || s.type === "path";

// Corner radii in mm [top-left, top-right, bottom-right, bottom-left], clamped so arcs never overlap.
export function rectRadii(s: Shape) {
  const r = s.radius ?? 0, max = Math.min(s.w, s.h) / 2;
  return (Array.isArray(r) ? r : [r, r, r, r]).map((v) => Math.max(0, Math.min(v, max)));
}

export function curvesOf(s: Shape): SubPath[] {
  if (s.type === "path") return s.paths ?? [];
  if (s.type === "polygon") return [{ closed: true, nodes: polygonPoints(s.sides ?? 5).map(([x, y]) => node(x, y)) }];
  if (s.type === "ellipse") {
    const k = KAPPA * 0.5;
    return [{ closed: true, nodes: [
      node(0.5, 0, -k, 0, k, 0, "symmetric"),
      node(1, 0.5, 0, -k, 0, k, "symmetric"),
      node(0.5, 1, k, 0, -k, 0, "symmetric"),
      node(0, 0.5, 0, k, 0, -k, "symmetric"),
    ] }];
  }
  if (s.type === "rect") {
    const [tl, tr, br, bl] = rectRadii(s).map((r) => [r / (s.w || 1), r / (s.h || 1)]);
    // clockwise from the top-left corner; a sharp corner is a single node
    const corner = (r: number[], x: number, y: number, a: PNode, b: PNode) => (r[0] > 0 ? [a, b] : [node(x, y)]);
    return [{ closed: true, nodes: [
      ...corner(tl, 0, 0, node(0, tl[1], 0, 0, 0, -tl[1] * KAPPA), node(tl[0], 0, -tl[0] * KAPPA, 0)),
      ...corner(tr, 1, 0, node(1 - tr[0], 0, 0, 0, tr[0] * KAPPA, 0), node(1, tr[1], 0, -tr[1] * KAPPA)),
      ...corner(br, 1, 1, node(1, 1 - br[1], 0, 0, 0, br[1] * KAPPA), node(1 - br[0], 1, br[0] * KAPPA, 0)),
      ...corner(bl, 0, 1, node(bl[0], 1, 0, 0, -bl[0] * KAPPA, 0), node(0, 1 - bl[1], 0, bl[1] * KAPPA)),
    ] }];
  }
  return [];
}

export function convertToCurves(list = selected.value) {
  let changed = false;
  for (const s of list) {
    if (!isCurvable(s) || s.type === "path") continue;
    s.paths = curvesOf(s);
    s.type = "path";
    delete s.radius;
    delete s.sides;
    changed = true;
  }
  if (changed) commit();
  return changed;
}

// ---------- local <-> world ----------

function linear(s: Shape) {
  const r = (s.rotation * Math.PI) / 180, c = Math.cos(r), sn = Math.sin(r);
  const fx = s.flipX ? -1 : 1, fy = s.flipY ? -1 : 1;
  // normalised vector -> world vector
  return (vx: number, vy: number): P => {
    const lx = vx * s.w * fx, ly = vy * s.h * fy;
    return { x: lx * c - ly * sn, y: lx * sn + ly * c };
  };
}

export function toWorld(s: Shape, nx: number, ny: number): P {
  const v = linear(s)(nx - 0.5, ny - 0.5);
  return { x: s.x + s.w / 2 + v.x, y: s.y + s.h / 2 + v.y };
}

export function worldPaths(s: Shape): SubPath[] {
  const vec = linear(s);
  return curvesOf(s).map((sp) => ({
    closed: sp.closed,
    nodes: sp.nodes.map((n) => {
      const p = toWorld(s, n.x, n.y), i = vec(n.ix, n.iy), o = vec(n.ox, n.oy);
      return { x: p.x, y: p.y, ix: i.x, iy: i.y, ox: o.x, oy: o.y, kind: n.kind };
    }),
  }));
}

// Store world-space subpaths into s (keeps its rotation, refits the bbox to the curves).
const rotBy = (deg: number) => {
  const r = (deg * Math.PI) / 180, c = Math.cos(r), sn = Math.sin(r);
  return (x: number, y: number): P => ({ x: x * c - y * sn, y: x * sn + y * c });
};

export function setWorldPaths(s: Shape, subs: SubPath[]) {
  const rot = rotBy(-s.rotation);
  const local = subs.map((sp) => ({
    closed: sp.closed,
    nodes: sp.nodes.map((n) => {
      const p = rot(n.x, n.y), i = rot(n.ix, n.iy), o = rot(n.ox, n.oy);
      return { x: p.x, y: p.y, ix: i.x, iy: i.y, ox: o.x, oy: o.y, kind: n.kind };
    }),
  }));
  const b = toPaper(local).bounds;
  const w = b.width || 1, h = b.height || 1;
  const cc = rotBy(s.rotation)(b.x + b.width / 2, b.y + b.height / 2);
  s.type = "path";
  s.flipX = s.flipY = false;
  s.w = b.width;
  s.h = b.height;
  s.x = cc.x - b.width / 2;
  s.y = cc.y - b.height / 2;
  s.paths = local.map((sp) => ({
    closed: sp.closed,
    nodes: sp.nodes.map((n) => ({
      x: (n.x - b.x) / w, y: (n.y - b.y) / h, ix: n.ix / w, iy: n.iy / h, ox: n.ox / w, oy: n.oy / h, kind: n.kind,
    })),
  }));
}

// ---------- paper bridge ----------

export function toPaper(subs: SubPath[]): paper.CompoundPath {
  return new paper.CompoundPath({
    fillRule: "evenodd",
    children: subs.map((sp) => new paper.Path({
      closed: sp.closed,
      segments: sp.nodes.map((n) => new paper.Segment(new paper.Point(n.x, n.y), new paper.Point(n.ix, n.iy), new paper.Point(n.ox, n.oy))),
    })),
  });
}

function kindOf(s: paper.Segment): NodeKind {
  const i = s.handleIn, o = s.handleOut;
  if (i.isZero() || o.isZero() || Math.abs(i.cross(o)) > 1e-6 * i.length * o.length || i.dot(o) > 0) return "cusp";
  return Math.abs(i.length - o.length) < 1e-6 ? "symmetric" : "smooth";
}

export function fromPaper(item: paper.PathItem): SubPath[] {
  const paths = item instanceof paper.CompoundPath ? (item.children as paper.Path[]) : [item as paper.Path];
  return paths.filter((p) => p.segments.length).map((p) => ({
    closed: p.closed,
    nodes: p.segments.map((s) => node(s.point.x, s.point.y, s.handleIn.x, s.handleIn.y, s.handleOut.x, s.handleOut.y, kindOf(s))),
  }));
}

export function pathD(s: Shape, closed: boolean) {
  const w = s.w, h = s.h;
  // straight segments must be L: a C with control points on its ends has no end tangent,
  // which leaves arrow markers (orient="auto") pointing at 0°
  const seg = (a: PNode, b: PNode) =>
    !a.ox && !a.oy && !b.ix && !b.iy
      ? ` L${b.x * w} ${b.y * h}`
      : ` C${(a.x + a.ox) * w} ${(a.y + a.oy) * h} ${(b.x + b.ix) * w} ${(b.y + b.iy) * h} ${b.x * w} ${b.y * h}`;
  return (s.paths ?? []).filter((sp) => sp.closed === closed && sp.nodes.length).map((sp) => {
    const n = sp.nodes;
    let d = `M${n[0].x * w} ${n[0].y * h}`;
    for (let i = 1; i < n.length; i++) d += seg(n[i - 1], n[i]);
    return closed ? d + seg(n[n.length - 1], n[0]) + "Z" : d;
  }).join(" ");
}

// Freehand: fit Bézier curves through the raw pointer samples.
export function pathFromPoints(pts: P[], tolerance: number, smooth: boolean): Shape {
  const s = makeShape("path", { fill: "none" });
  const p = new paper.Path({ segments: pts.map((q) => [q.x, q.y]) });
  if (smooth && pts.length > 2) p.simplify(tolerance);
  setWorldPaths(s, fromPaper(p));
  return s;
}

// ---------- node editing (world space) ----------

export const key = (si: number, ni: number) => `${si}:${ni}`;
const parse = (k: string) => k.split(":").map(Number) as [number, number];

// Run an edit against world-space nodes of the single selected path.
function editNodes(fn: (subs: SubPath[], sel: [number, number][]) => SubPath[] | void, resetSel = true) {
  const s = selected.value[0];
  if (!s || s.type !== "path") return;
  const subs = worldPaths(s);
  const out = fn(subs, state.nodeSel.map(parse).filter(([a, b]) => subs[a]?.nodes[b])) ?? subs;
  const kept = out.filter((sp) => sp.nodes.length >= 2);
  if (!kept.length) {
    state.shapes = state.shapes.filter((x) => x.id !== s.id);
    state.selection = [];
  } else setWorldPaths(s, kept);
  if (resetSel) state.nodeSel = [];
  commit();
}

const segPath = (sp: SubPath, i: number) => {
  const a = sp.nodes[i], b = sp.nodes[(i + 1) % sp.nodes.length];
  return new paper.Path({ segments: [
    new paper.Segment(new paper.Point(a.x, a.y), new paper.Point(0, 0), new paper.Point(a.ox, a.oy)),
    new paper.Segment(new paper.Point(b.x, b.y), new paper.Point(b.ix, b.iy), new paper.Point(0, 0)),
  ] });
};

// Split segment i of subpath sp at time t, inserting a node after i.
function splitAt(sp: SubPath, i: number, t: number) {
  const p = segPath(sp, i);
  p.curves[0].divideAtTime(t);
  const [a, m, b] = p.segments;
  const na = sp.nodes[i], nb = sp.nodes[(i + 1) % sp.nodes.length];
  na.ox = a.handleOut.x; na.oy = a.handleOut.y;
  nb.ix = b.handleIn.x; nb.iy = b.handleIn.y;
  sp.nodes.splice(i + 1, 0, node(m.point.x, m.point.y, m.handleIn.x, m.handleIn.y, m.handleOut.x, m.handleOut.y, kindOf(m)));
}

export const hasSegmentAfter = (sp: SubPath, i: number) => sp.closed || i < sp.nodes.length - 1;

export function addNodes() {
  editNodes((subs, sel) => {
    // splice from the end so earlier indices stay valid
    [...sel].sort((a, b) => b[0] - a[0] || b[1] - a[1])
      .forEach(([si, ni]) => hasSegmentAfter(subs[si], ni) && splitAt(subs[si], ni, 0.5));
  });
}

// Segment of s nearest to world point p: subpath, segment index, curve time, distance.
export function nearestSegment(s: Shape, p: P) {
  let best: { si: number; i: number; t: number; d: number } | null = null;
  worldPaths(s).forEach((sp, si) => {
    for (let i = 0; i < sp.nodes.length; i++) {
      if (!hasSegmentAfter(sp, i)) continue;
      const loc = segPath(sp, i).getNearestLocation(new paper.Point(p.x, p.y));
      if (loc && (!best || loc.distance < best.d)) best = { si, i, t: loc.time, d: loc.distance };
    }
  });
  return best as { si: number; i: number; t: number; d: number } | null;
}

// Add a node at the point of the path nearest to p (within tol), returns false if none.
export function addNodeAt(p: P, tol: number) {
  const s = selected.value[0];
  if (s?.type !== "path") return false;
  const b = nearestSegment(s, p);
  if (!b || b.d > tol || b.t < 1e-3 || b.t > 1 - 1e-3) return false;
  editNodes((subs) => splitAt(subs[b.si], b.i, b.t));
  state.nodeSel = [key(b.si, b.i + 1)];
  return true;
}

export function deleteNodes(only?: [number, number][]) {
  editNodes((subs, sel) => {
    const drop = new Set((only ?? sel).map(([a, b]) => key(a, b)));
    return subs.map((sp, si) => ({ ...sp, nodes: sp.nodes.filter((_, ni) => !drop.has(key(si, ni))) }))
      .filter((sp) => sp.nodes.length >= 2);
  });
}

// Segment that ends at a selected node, as CorelDRAW does.
function prevIndex(sp: SubPath, i: number) {
  if (i > 0) return i - 1;
  return sp.closed ? sp.nodes.length - 1 : -1;
}

export function toLine() {
  editNodes((subs, sel) => sel.forEach(([si, ni]) => {
    const sp = subs[si], pi = prevIndex(sp, ni);
    if (pi < 0) return;
    sp.nodes[pi].ox = sp.nodes[pi].oy = sp.nodes[ni].ix = sp.nodes[ni].iy = 0;
    sp.nodes[pi].kind = sp.nodes[ni].kind = "cusp";
  }), false);
}

export function toCurve() {
  editNodes((subs, sel) => sel.forEach(([si, ni]) => {
    const sp = subs[si], pi = prevIndex(sp, ni);
    if (pi < 0) return;
    const a = sp.nodes[pi], b = sp.nodes[ni], dx = (b.x - a.x) / 3, dy = (b.y - a.y) / 3;
    if (!a.ox && !a.oy) (a.ox = dx, a.oy = dy);
    if (!b.ix && !b.iy) (b.ix = -dx, b.iy = -dy);
  }), false);
}

export function setNodeKind(kind: NodeKind) {
  editNodes((subs, sel) => sel.forEach(([si, ni]) => {
    const n = subs[si].nodes[ni];
    n.kind = kind;
    if (kind === "cusp") return;
    const li = Math.hypot(n.ix, n.iy), lo = Math.hypot(n.ox, n.oy);
    // direction: through both handles, or along the one that exists
    let dx = n.ox - n.ix, dy = n.oy - n.iy;
    const len = Math.hypot(dx, dy);
    if (!len) return;
    dx /= len; dy /= len;
    const a = kind === "symmetric" ? (li + lo) / 2 : li, b = kind === "symmetric" ? (li + lo) / 2 : lo;
    n.ix = -dx * a; n.iy = -dy * a; n.ox = dx * b; n.oy = dy * b;
  }), false);
}

// Break a subpath at the selected nodes (Corel "Separar curva").
export function breakAtNodes() {
  editNodes((subs, sel) => {
    const out: SubPath[] = [];
    subs.forEach((sp, si) => {
      const cuts = sel.filter(([a]) => a === si).map(([, b]) => b).sort((a, b) => a - b);
      if (!cuts.length) return out.push(sp);
      let nodes = sp.nodes;
      if (sp.closed) {
        // rotate so the first cut is the start, then reopen at it
        const c0 = cuts[0];
        nodes = [...nodes.slice(c0), ...nodes.slice(0, c0), { ...nodes[c0] }];
        const shifted = cuts.slice(1).map((c) => (c - c0 + sp.nodes.length) % sp.nodes.length);
        return splitOpen(nodes, shifted, out);
      }
      splitOpen(nodes, cuts.filter((c) => c > 0 && c < nodes.length - 1), out);
    });
    return out;
  });
}

function splitOpen(nodes: PNode[], cuts: number[], out: SubPath[]) {
  let start = 0;
  for (const c of cuts) {
    out.push({ closed: false, nodes: nodes.slice(start, c + 1).map((n) => ({ ...n })) });
    start = c;
  }
  out.push({ closed: false, nodes: nodes.slice(start).map((n) => ({ ...n })) });
}

// Join two selected end nodes (same subpath closes it, two subpaths are chained).
export function joinNodes() {
  editNodes((subs, sel) => {
    if (sel.length !== 2) return;
    const [[sa, na], [sb, nb]] = sel;
    const A = subs[sa], B = subs[sb];
    const isEnd = (sp: SubPath, i: number) => !sp.closed && (i === 0 || i === sp.nodes.length - 1);
    if (!isEnd(A, na) || !isEnd(B, nb)) return;
    if (sa === sb) {
      A.closed = true;
      return;
    }
    // orient A to end at na and B to start at nb, then append B to A
    const a = na === 0 ? reverse(A.nodes) : A.nodes;
    const b = nb === 0 ? B.nodes : reverse(B.nodes);
    return [...subs.filter((_, i) => i !== sa && i !== sb), { closed: false, nodes: [...a, ...b] }];
  });
}

const reverse = (nodes: PNode[]) => [...nodes].reverse().map((n) => ({ ...n, ix: n.ox, iy: n.oy, ox: n.ix, oy: n.iy }));

export function toggleClosed() {
  editNodes((subs, sel) => {
    const targets = sel.length ? new Set(sel.map(([a]) => a)) : new Set(subs.map((_, i) => i));
    targets.forEach((i) => (subs[i].closed = !subs[i].closed));
  });
}

// Move selected nodes (and their handles) from orig by d.
export function moveNodes(s: Shape, orig: SubPath[], keys: string[], dx: number, dy: number) {
  const subs = orig.map((sp, si) => ({
    closed: sp.closed,
    nodes: sp.nodes.map((n, ni) => (keys.includes(key(si, ni)) ? { ...n, x: n.x + dx, y: n.y + dy } : { ...n })),
  }));
  setWorldPaths(s, subs);
}

const copySubs = (orig: SubPath[]) => orig.map((sp) => ({ closed: sp.closed, nodes: sp.nodes.map((n) => ({ ...n })) }));

// After one handle of n changed, realign the other one for smooth/symmetric nodes.
function enforceKind(n: PNode, moved: "in" | "out") {
  if (n.kind === "cusp") return;
  const [mx, my, ox, oy] = moved === "in" ? ["ix", "iy", "ox", "oy"] as const : ["ox", "oy", "ix", "iy"] as const;
  const len = Math.hypot(n[mx], n[my]);
  if (!len) return;
  const other = n.kind === "symmetric" ? len : Math.hypot(n[ox], n[oy]);
  n[ox] = (-n[mx] / len) * other;
  n[oy] = (-n[my] / len) * other;
}

// Drag one handle to world point p, honouring the node kind.
export function moveHandle(s: Shape, orig: SubPath[], si: number, ni: number, which: "in" | "out", p: P) {
  const subs = copySubs(orig);
  const n = subs[si].nodes[ni];
  if (which === "in") (n.ix = p.x - n.x, n.iy = p.y - n.y);
  else (n.ox = p.x - n.x, n.oy = p.y - n.y);
  enforceKind(n, which);
  setWorldPaths(s, subs);
}

// Drag the point at time t of segment i by (dx, dy), bending it through the cursor.
// Handle weights follow Inkscape's segment-drag formula; straight segments become curves.
export function bendSegment(s: Shape, orig: SubPath[], si: number, i: number, t: number, dx: number, dy: number) {
  const subs = copySubs(orig), sp = subs[si];
  const a = sp.nodes[i], b = sp.nodes[(i + 1) % sp.nodes.length];
  if (!a.ox && !a.oy && !b.ix && !b.iy) {
    a.ox = (b.x - a.x) / 3; a.oy = (b.y - a.y) / 3;
    b.ix = (a.x - b.x) / 3; b.iy = (a.y - b.y) / 3;
  }
  t = Math.min(0.95, Math.max(0.05, t));
  const w = t <= 1 / 6 ? 0 : t <= 0.5 ? Math.pow((6 * t - 1) / 2, 3) / 2
    : t <= 5 / 6 ? (1 - Math.pow((6 * (1 - t) - 1) / 2, 3)) / 2 + 0.5 : 1;
  const k0 = (1 - w) / (3 * t * (1 - t) * (1 - t)), k1 = w / (3 * t * t * (1 - t));
  a.ox += dx * k0; a.oy += dy * k0;
  b.ix += dx * k1; b.iy += dy * k1;
  enforceKind(a, "out");
  enforceKind(b, "in");
  setWorldPaths(s, subs);
}

// ---------- combine / booleans ----------

const curvable = () => selected.value.filter(isCurvable);
const zIndex = (s: Shape) => state.shapes.indexOf(s);

function placeResult(subs: SubPath[], style: Shape, at: number, remove: Shape[]) {
  state.shapes = state.shapes.filter((s) => !remove.includes(s));
  if (!subs.length) {
    state.selection = [];
    return commit();
  }
  const { fill, gradient, stroke, strokeWidth, dash, cap, join, arrowStart, arrowEnd, opacity } = style;
  const res = makeShape("path", { fill, gradient, stroke, strokeWidth, dash, cap, join, arrowStart, arrowEnd, opacity });
  setWorldPaths(res, subs);
  state.shapes.splice(Math.min(at, state.shapes.length), 0, res);
  state.selection = [res.id];
  commit();
}

export function combine() {
  const list = curvable().sort((a, b) => zIndex(a) - zIndex(b));
  if (list.length < 2) return;
  const at = zIndex(list[0]);
  placeResult(list.flatMap(worldPaths), list[0], at, list);
}

export function breakApart() {
  const s = selected.value[0];
  if (s?.type !== "path" || (s.paths?.length ?? 0) < 2) return;
  const at = zIndex(s), parts = worldPaths(s);
  state.shapes.splice(at, 1);
  const made = parts.map((sp, i) => {
    const part = { ...s, id: uid(), name: `${s.name} ${i + 1}` };
    setWorldPaths(part, [sp]);
    return part;
  });
  state.shapes.splice(at, 0, ...made);
  state.selection = made.map((m) => m.id);
  commit();
}

export type BoolOp = "weld" | "trim" | "intersect" | "simplify" | "frontMinusBack" | "backMinusFront";

const item = (s: Shape) => toPaper(worldPaths(s).map((sp) => ({ ...sp, closed: true })));
const unite = (list: Shape[]) => (list.map(item) as paper.PathItem[]).reduce((a, b) => a.unite(b));

// CorelDRAW "Dar forma": target is the bottom-most object of the selection.
export function booleanOp(op: BoolOp) {
  const list = curvable().sort((a, b) => zIndex(a) - zIndex(b));
  if (list.length < 2) return false;
  const [back, front] = [list[0], list[list.length - 1]];
  const rest = (x: Shape) => list.filter((s) => s !== x);
  switch (op) {
    case "weld":
      placeResult(fromPaper(unite(list)), back, zIndex(back), list);
      break;
    case "trim":
      placeResult(fromPaper(item(back).subtract(unite(rest(back)))), back, zIndex(back), [back]);
      break;
    case "intersect":
      placeResult(fromPaper((list.map(item) as paper.PathItem[]).reduce((a, b) => a.intersect(b))), back, zIndex(front) + 1, []);
      break;
    case "frontMinusBack":
      placeResult(fromPaper(item(front).subtract(unite(rest(front)))), front, zIndex(back), list);
      break;
    case "backMinusFront":
      placeResult(fromPaper(item(back).subtract(unite(rest(back)))), back, zIndex(back), list);
      break;
    case "simplify": {
      // every object loses what the objects above it cover
      const cut = list.map((s, i) => {
        const above = list.slice(i + 1);
        return above.length ? fromPaper(item(s).subtract(unite(above))) : worldPaths(s);
      });
      list.forEach((s, i) => (cut[i].length ? setWorldPaths(s, cut[i]) : (state.shapes = state.shapes.filter((x) => x !== s))));
      state.selection = list.filter((s) => state.shapes.includes(s)).map((s) => s.id);
      commit();
      break;
    }
  }
  return true;
}

// ---------- snap points (object nodes and centres) ----------

export type SnapPoint = P & { link: Link };

export function snapCandidates(exclude: Set<string> = new Set()): SnapPoint[] {
  return state.shapes.filter((s) => s.visible && !exclude.has(s.id) && s.type !== "dimension").flatMap((s) => {
    const at = (nx: number, ny: number): SnapPoint => ({ ...toWorld(s, nx, ny), link: { id: s.id, nx, ny } });
    if (s.type === "text" || s.type === "image") return [at(0.5, 0.5), at(0, 0), at(1, 0), at(1, 1), at(0, 1)];
    // curve nodes are linked by index (they survive node edits), other shapes by bbox position
    const nodes = s.type === "path"
      ? worldPaths(s).flatMap((sp, si) => sp.nodes.map((n, ni) => ({ x: n.x, y: n.y, link: { id: s.id, si, ni } })))
      : curvesOf(s).flatMap((sp) => sp.nodes.map((n) => at(n.x, n.y)));
    return [at(0.5, 0.5), ...nodes];
  });
}

// Current world position of a linked point, or null if its object is gone.
export function resolveLink(l: Link): P | null {
  const s = state.shapes.find((x) => x.id === l.id);
  if (!s) return null;
  if (l.si !== undefined) {
    const n = worldPaths(s)[l.si]?.nodes[l.ni!];
    return n ? { x: n.x, y: n.y } : null;
  }
  return toWorld(s, l.nx ?? 0.5, l.ny ?? 0.5);
}
