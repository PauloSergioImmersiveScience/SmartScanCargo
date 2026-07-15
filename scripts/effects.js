import {
  effectsCanvas,
  effectsCtx,
  effectsPanel,
  effectsRangeCanvas,
  effectsHistogramCanvas
} from "./dom.js?v=62";
import { state } from "./state.js";

const INITIAL_THRESHOLDS = [1, 10, 20, 30, 40];
const MIN_CLASS_WIDTH = 1;
const RANGE_HEIGHT = 54;
const HISTOGRAM_HEIGHT = 130;
const MARGIN = 2;
const HIT_RADIUS = 12;
const effectsPaletteCanvas = document.getElementById("effectsPaletteCanvas");
const PALETTE_HEIGHT = 245;


const COLORS = {
  black: [0, 0, 0],
  orange: [255, 128, 0],
  green: [0, 180, 0],
  blue: [70, 140, 255],
  pink: [255, 192, 203]
};

let draggingBoundary = null;
let resizeObserver = null;

function cloneThresholds() {
  return INITIAL_THRESHOLDS.slice();
}

function ensureEffectsState() {
  if (!Array.isArray(state.effectsThresholds)) {
    state.effectsThresholds = cloneThresholds();
  }
}

function getRanges() {
  ensureEffectsState();
  const [orangeStart, orangeEnd, greenEnd, blueEnd, pinkEnd] = state.effectsThresholds;
  return [
    [0, orangeStart - 1, COLORS.black],
    [orangeStart, orangeEnd, COLORS.orange],
    [orangeEnd + 1, greenEnd, COLORS.green],
    [greenEnd + 1, blueEnd, COLORS.blue],
    [blueEnd + 1, pinkEnd, COLORS.pink],
    [pinkEnd + 1, 255, COLORS.black]
  ];
}

function grayAt(data, index) {
  return Math.max(0, Math.min(255, Math.round(
    0.299 * data[index] + 0.587 * data[index + 1] + 0.114 * data[index + 2]
  )));
}

function rangeColor(value) {
  for (const [start, end, color] of getRanges()) {
    if (value >= start && value <= end) return color;
  }
  return COLORS.black;
}

export function resetEffectsRanges() {
  state.effectsThresholds = cloneThresholds();
  draggingBoundary = null;
  updateEffectsImage();
}

export function initializeEffectsCanvas(width, height) {
  effectsCanvas.width = width;
  effectsCanvas.height = height;
  ensureEffectsState();
  updateEffectsImage();
}

export function updateEffectsImage() {
  if (!state.effectsSourcePixels || !state.effectsSourceWidth || !state.effectsSourceHeight) return;

  // Usa apenas o buffer bruto capturado no carregamento. Esse array não é
  // compartilhado com nenhum canvas nem com currentImageData.
  const width = state.effectsSourceWidth;
  const height = state.effectsSourceHeight;
  if (effectsCanvas.width !== width || effectsCanvas.height !== height) {
    effectsCanvas.width = width;
    effectsCanvas.height = height;
  }
  const output = new ImageData(width, height);
  const src = state.effectsSourcePixels;
  const dst = output.data;

  for (let i = 0; i < src.length; i += 4) {
    const gray = grayAt(src, i);
    const [r, g, b] = rangeColor(gray);
    dst[i] = r;
    dst[i + 1] = g;
    dst[i + 2] = b;
    dst[i + 3] = 255;
  }

  state.effectsImageData = output;
  effectsCtx.putImageData(output, 0, 0);
  drawEffectsControls();
}

function canvasWidth() {
  const width = effectsPanel.clientWidth || effectsCanvas.getBoundingClientRect().width || 800;
  return Math.max(260, Math.round(width));
}

function prepareCanvas(canvas, cssHeight) {
  const ratio = window.devicePixelRatio || 1;
  const width = canvasWidth();
  canvas.width = Math.round(width * ratio);
  canvas.height = Math.round(cssHeight * ratio);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${cssHeight}px`;
  const context = canvas.getContext("2d");
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  return { context, width, height: cssHeight };
}

function intensityToX(value, width) {
  const usable = width - 2 * MARGIN;
  return MARGIN + (value / 255) * usable;
}

function xToIntensity(x, width) {
  const usable = width - 2 * MARGIN;
  const normalized = Math.max(0, Math.min(usable, x - MARGIN));
  return Math.round((normalized / usable) * 255);
}

function drawRangeBar() {
  const { context, width, height } = prepareCanvas(effectsRangeCanvas, RANGE_HEIGHT);
  context.clearRect(0, 0, width, height);

  for (const [start, end, color] of getRanges()) {
    if (start > end) continue;
    const x0 = intensityToX(start, width);
    const x1 = intensityToX(end + 1, width);
    context.fillStyle = `rgb(${color[0]}, ${color[1]}, ${color[2]})`;
    context.fillRect(x0, 1, Math.max(1, x1 - x0), height - 2);
  }

  context.strokeStyle = "#222";
  context.lineWidth = 1;
  context.strokeRect(MARGIN, 1, width - 2 * MARGIN, height - 2);

  for (const threshold of state.effectsThresholds) {
    const x = intensityToX(threshold, width);
    context.strokeStyle = "#fff";
    context.lineWidth = 3;
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x, height);
    context.stroke();
    context.strokeStyle = "#111";
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(x + 2, 0);
    context.lineTo(x + 2, height);
    context.stroke();
  }
}

function calculateHistogram() {
  const histogram = new Uint32Array(256);
  if (!state.effectsSourcePixels) return histogram;
  const data = state.effectsSourcePixels;
  for (let i = 0; i < data.length; i += 4) histogram[grayAt(data, i)]++;
  return histogram;
}

\nfunction drawPaletteLegend() {\n  if (!effectsPaletteCanvas) return;\n\n  const ratio = window.devicePixelRatio || 1;\n  const width = canvasWidth();\n  const height = PALETTE_HEIGHT;\n\n  effectsPaletteCanvas.width = Math.round(width * ratio);\n  effectsPaletteCanvas.height = Math.round(height * ratio);\n  effectsPaletteCanvas.style.width = `${width}px`;\n  effectsPaletteCanvas.style.height = `${height}px`;\n\n  const ctx = effectsPaletteCanvas.getContext("2d");\n  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);\n  ctx.clearRect(0, 0, width, height);\n  ctx.fillStyle = "#ffffff";\n  ctx.fillRect(0, 0, width, height);\n\n  const left = Math.max(24, width * 0.035);\n  const right = Math.max(16, width * 0.02);\n  const barWidth = width - left - right;\n  const titleY = 26;\n  const barY = 58;\n  const barHeight = 68;\n  const axisY = barY + barHeight;\n\n  ctx.fillStyle = "#171717";\n  ctx.font = "700 17px Arial, sans-serif";\n  ctx.textBaseline = "alphabetic";\n  ctx.fillText("Index of Color pallete for HEMD images", left, titleY);\n\n  const xForIndex = value => left + (value / 40) * barWidth;\n\n  // Black / sem sinal: faixa ligeiramente mais larga, como no modelo.\n  const blackEnd = xForIndex(2);\n  ctx.fillStyle = "#050505";\n  ctx.fillRect(left, barY, blackEnd - left, barHeight);\n\n  function gradientSegment(x0, x1, stops) {\n    const gradient = ctx.createLinearGradient(x0, 0, x1, 0);\n    for (const [offset, color] of stops) gradient.addColorStop(offset, color);\n    ctx.fillStyle = gradient;\n    ctx.fillRect(x0, barY, x1 - x0, barHeight);\n  }\n\n  gradientSegment(blackEnd + 3, xForIndex(10), [[0, "#ff6f00"], [1, "#fff200"]]);\n  gradientSegment(xForIndex(10) + 3, xForIndex(20), [[0, "#77d600"], [1, "#00a84f"]]);\n  gradientSegment(xForIndex(20) + 3, xForIndex(30), [[0, "#1749d1"], [1, "#7132b9"]]);\n  gradientSegment(xForIndex(30) + 3, xForIndex(40), [[0, "#f0005d"], [1, "#c9003d"]]);\n\n  ctx.strokeStyle = "#333";\n  ctx.lineWidth = 1;\n  ctx.strokeRect(left, barY, barWidth, barHeight);\n\n  ctx.strokeStyle = "#222";\n  ctx.lineWidth = 2;\n  ctx.beginPath();\n  ctx.moveTo(left, axisY);\n  ctx.lineTo(left + barWidth, axisY);\n  ctx.stroke();\n\n  ctx.font = "600 15px Arial, sans-serif";\n  ctx.fillStyle = "#202020";\n  ctx.textAlign = "center";\n  ctx.textBaseline = "top";\n  for (let value = 0; value <= 40; value += 5) {\n    const x = xForIndex(value);\n    ctx.beginPath();\n    ctx.moveTo(x, axisY);\n    ctx.lineTo(x, axisY + 11);\n    ctx.stroke();\n    ctx.fillText(String(value), x, axisY + 14);\n  }\n\n  const bracketY = 178;\n  const labelY = 192;\n  const rangeY = 220;\n  const categories = [\n    { x0: left, x1: blackEnd, color: "#111111", label: "Black", range: "sem sinal" },\n    { x0: xForIndex(2.8), x1: xForIndex(10), color: "#f57c00", label: "Organic", range: "1–10" },\n    { x0: xForIndex(11.2), x1: xForIndex(20), color: "#0aa63b", label: "Intermediate", range: "11–20" },\n    { x0: xForIndex(21.0), x1: xForIndex(30), color: "#123fcd", label: "Mineral", range: "21–30" },\n    { x0: xForIndex(31.0), x1: xForIndex(40), color: "#e50046", label: "High Z", range: "31–40" }\n  ];\n\n  for (const category of categories) {\n    const center = (category.x0 + category.x1) / 2;\n    ctx.strokeStyle = category.color;\n    ctx.lineWidth = 2;\n    ctx.beginPath();\n    ctx.moveTo(category.x0, bracketY);\n    ctx.lineTo(category.x1, bracketY);\n    ctx.moveTo(category.x0, bracketY - 5);\n    ctx.lineTo(category.x0, bracketY + 5);\n    ctx.moveTo(category.x1, bracketY - 5);\n    ctx.lineTo(category.x1, bracketY + 5);\n    ctx.stroke();\n\n    ctx.fillStyle = category.color;\n    ctx.font = "700 17px Arial, sans-serif";\n    ctx.textAlign = "center";\n    ctx.textBaseline = "top";\n    ctx.fillText(category.label, center, labelY);\n\n    ctx.fillStyle = "#242424";\n    ctx.font = "400 15px Arial, sans-serif";\n    ctx.fillText(category.range, center, rangeY);\n  }\n}\n
function drawHistogram() {
  const { context, width, height } = prepareCanvas(effectsHistogramCanvas, HISTOGRAM_HEIGHT);
  const histogram = calculateHistogram();
  const maxCount = Math.max(1, ...histogram);

  context.clearRect(0, 0, width, height);
  context.fillStyle = "#f4f4f4";
  context.fillRect(0, 0, width, height);

  for (const [start, end, color] of getRanges()) {
    if (start > end) continue;
    const x0 = intensityToX(start, width);
    const x1 = intensityToX(end + 1, width);
    context.fillStyle = `rgba(${color[0]}, ${color[1]}, ${color[2]}, 0.18)`;
    context.fillRect(x0, 0, Math.max(1, x1 - x0), height);
  }

  context.strokeStyle = "#444";
  context.lineWidth = 1;
  for (let i = 0; i < 256; i++) {
    const x = intensityToX(i, width);
    const barHeight = (histogram[i] / maxCount) * (height - 3);
    context.beginPath();
    context.moveTo(x, height);
    context.lineTo(x, height - barHeight);
    context.stroke();
  }

  context.strokeStyle = "#777";
  context.strokeRect(MARGIN, 0.5, width - 2 * MARGIN, height - 1);
}

export function drawEffectsControls() {
  if (effectsPanel.hidden || !state.effectsSourcePixels) return;
  drawRangeBar();
  drawHistogram();
  drawPaletteLegend();
}

function constrainThreshold(index, value) {
  const t = state.effectsThresholds;
  let lower;
  let upper;
  if (index === 0) {
    lower = 0;
    upper = t[1] - MIN_CLASS_WIDTH + 1;
  } else if (index === t.length - 1) {
    lower = t[index - 1] + MIN_CLASS_WIDTH;
    upper = 255;
  } else {
    lower = t[index - 1] + MIN_CLASS_WIDTH;
    upper = t[index + 1] - MIN_CLASS_WIDTH;
  }
  return Math.max(lower, Math.min(upper, value));
}

function pointerCoordinates(event) {
  const rect = effectsRangeCanvas.getBoundingClientRect();
  return { x: event.clientX - rect.left, width: rect.width };
}

effectsRangeCanvas.addEventListener("pointerdown", (event) => {
  if (event.button !== 0) return;
  const { x, width } = pointerCoordinates(event);
  const positions = state.effectsThresholds.map(value => intensityToX(value, width));
  let nearest = 0;
  for (let i = 1; i < positions.length; i++) {
    if (Math.abs(x - positions[i]) < Math.abs(x - positions[nearest])) nearest = i;
  }
  if (Math.abs(x - positions[nearest]) <= HIT_RADIUS) {
    draggingBoundary = nearest;
    effectsRangeCanvas.setPointerCapture(event.pointerId);
    event.preventDefault();
  }
});

effectsRangeCanvas.addEventListener("pointermove", (event) => {
  if (draggingBoundary === null) return;
  const { x, width } = pointerCoordinates(event);
  const value = xToIntensity(x, width);
  state.effectsThresholds[draggingBoundary] = constrainThreshold(draggingBoundary, value);
  updateEffectsImage();
});

function stopDragging(event) {
  draggingBoundary = null;
  if (event?.pointerId !== undefined && effectsRangeCanvas.hasPointerCapture(event.pointerId)) {
    effectsRangeCanvas.releasePointerCapture(event.pointerId);
  }
}

effectsRangeCanvas.addEventListener("pointerup", stopDragging);
effectsRangeCanvas.addEventListener("pointercancel", stopDragging);
effectsRangeCanvas.addEventListener("contextmenu", (event) => {
  event.preventDefault();
  resetEffectsRanges();
});

export function initializeEffectsUI() {
  ensureEffectsState();
  if (!resizeObserver) {
    resizeObserver = new ResizeObserver(drawEffectsControls);
    resizeObserver.observe(effectsPanel);
  }
}
