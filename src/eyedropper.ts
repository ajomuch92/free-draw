import { state, applyStyle, type P } from "./store";
import { shapesSVG } from "./files";

const hex = (r: number, g: number, b: number) => `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;

// Colour of the rendered page at world point p (gradients, overlaps and opacity included),
// or null outside the page.
export async function sampleAt(p: P): Promise<string | null> {
  if (p.x < 0 || p.y < 0 || p.x > state.page.w || p.y > state.page.h) return null;
  const d = 0.5 / state.zoom; // half a screen pixel, in mm
  const img = new Image();
  img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(shapesSVG([p.x - d, p.y - d, 2 * d, 2 * d], ["1", "1"], "#ffffff"));
  await img.decode();
  const ctx = document.createElement("canvas").getContext("2d", { willReadFrequently: true })!;
  ctx.canvas.width = ctx.canvas.height = 1;
  ctx.drawImage(img, 0, 0, 1, 1);
  const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
  return hex(r, g, b);
}

// Native picker (Chromium / WebView2): any pixel on screen, even outside the window.
export const canPickScreen = "EyeDropper" in window;
export async function sampleScreen() {
  try {
    const picker = new (window as unknown as { EyeDropper: new () => { open: () => Promise<{ sRGBHex: string }> } }).EyeDropper();
    state.sampled = (await picker.open()).sRGBHex;
  } catch {
    // cancelled with Esc
  }
}

// Sampled colour onto the selection, or onto the defaults for new objects.
export function applySampled(as: "fill" | "stroke") {
  if (!state.sampled) return;
  applyStyle(as === "fill" ? { fill: state.sampled, gradient: undefined } : { stroke: state.sampled });
}
