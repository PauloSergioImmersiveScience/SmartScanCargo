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
const RANGE_HEIGHT = 55;
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


function getCurrentRangeLabels() {
  ensureEffectsState();
  const [orangeStart, orangeEnd, greenEnd, blueEnd, pinkEnd] = state.effectsThresholds;

  const formatRange = (start, end) => start === end ? String(start) : `${start}-${end}`;

  return {
    blackStart: formatRange(0, orangeStart - 1),
    orange: formatRange(orangeStart, orangeEnd),
    green: formatRange(orangeEnd + 1, greenEnd),
    blue: formatRange(greenEnd + 1, blueEnd),
    pink: formatRange(blueEnd + 1, pinkEnd),
    blackEnd: formatRange(pinkEnd + 1, 255)
  };
}


function ensureRangeSummaryElement() {
  let element = document.getElementById("effectsRangeSummary");
  if (!element) {
    element = document.createElement("div");
    element.id = "effectsRangeSummary";
    element.style.position = "relative";
    element.style.display = "block";
    element.style.width = "100%";
    element.style.height = "20px";
    element.style.boxSizing = "border-box";
    element.style.margin = "0";
    element.style.background = "#ffffff";
    element.style.color = "#111111";
    element.style.font = "600 11px Arial, sans-serif";
    element.style.lineHeight = "20px";
    element.style.whiteSpace = "nowrap";
    element.style.overflow = "visible";
    effectsRangeCanvas.parentNode.insertBefore(element, effectsRangeCanvas);
  }
  return element;
}

function updateRangeSummary() {
  ensureEffectsState();

  const element = ensureRangeSummaryElement();
  const width = effectsRangeCanvas.getBoundingClientRect().width
    || effectsPanel.clientWidth
    || 800;
  const usableWidth = Math.max(1, width - 2 * MARGIN);

  const labels = getCurrentRangeLabels();
  const [orangeStart, orangeEnd, greenEnd, blueEnd, pinkEnd] = state.effectsThresholds;
  const ranges = [
    [0, orangeStart - 1, labels.blackStart],
    [orangeStart, orangeEnd, labels.orange],
    [orangeEnd + 1, greenEnd, labels.green],
    [greenEnd + 1, blueEnd, labels.blue],
    [blueEnd + 1, pinkEnd, labels.pink],
    [pinkEnd + 1, 255, labels.blackEnd]
  ];

  element.replaceChildren();

  for (const [start, end, text] of ranges) {
    if (start > end) continue;

    const centerIntensity = (start + end + 1) / 2;
    const centerX = MARGIN + (centerIntensity / 256) * usableWidth;

    const label = document.createElement("span");
    label.textContent = text;
    label.style.position = "absolute";
    label.style.left = `${centerX}px`;
    label.style.top = "0";
    label.style.transform = "translateX(-50%)";
    label.style.textAlign = "center";
    label.style.color = "#111111";
    label.style.pointerEvents = "none";

    element.appendChild(label);
  }
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
  updateRangeSummary();

  const { context, width, height } = prepareCanvas(effectsRangeCanvas, RANGE_HEIGHT);
  context.clearRect(0, 0, width, height);

  const barTop = 0;
  const barBottom = height - 1;

  for (const [start, end, color] of getRanges()) {
    if (start > end) continue;
    const x0 = intensityToX(start, width);
    const x1 = intensityToX(end + 1, width);
    context.fillStyle = `rgb(${color[0]}, ${color[1]}, ${color[2]})`;
    context.fillRect(x0, barTop, Math.max(1, x1 - x0), barBottom - barTop);
  }

  context.strokeStyle = "#222";
  context.lineWidth = 1;
  context.strokeRect(MARGIN, barTop, width - 2 * MARGIN, barBottom - barTop);

  for (const threshold of state.effectsThresholds) {
    const x = intensityToX(threshold, width);
    context.strokeStyle = "#fff";
    context.lineWidth = 3;
    context.beginPath();
    context.moveTo(x, barTop);
    context.lineTo(x, barBottom);
    context.stroke();

    context.strokeStyle = "#111";
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(x + 2, barTop);
    context.lineTo(x + 2, barBottom);
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


function drawPaletteLegend() {
  if (!effectsPaletteCanvas) return;

  const ratio = window.devicePixelRatio || 1;
  const width = canvasWidth();
  const height = PALETTE_HEIGHT;

  effectsPaletteCanvas.width = Math.round(width * ratio);
  effectsPaletteCanvas.height = Math.round(height * ratio);
  effectsPaletteCanvas.style.width = `${width}px`;
  effectsPaletteCanvas.style.height = `${height}px`;

  const ctx = effectsPaletteCanvas.getContext("2d");
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);

  const left = Math.max(24, width * 0.035);
  const right = Math.max(16, width * 0.02);
  const barWidth = width - left - right;
  const titleY = 26;
  const barY = 58;
  const barHeight = 68;
  const axisY = barY + barHeight;

  ctx.fillStyle = "#171717";
  ctx.font = "700 17px Arial, sans-serif";
  ctx.textBaseline = "alphabetic";
  ctx.fillText("Index of Color pallete for HEMD images", left, titleY);

  const xForIndex = value => left + (value / 40) * barWidth;

  // Black / sem sinal: faixa ligeiramente mais larga, como no modelo.
  const blackEnd = xForIndex(2);
  ctx.fillStyle = "#050505";
  ctx.fillRect(left, barY, blackEnd - left, barHeight);

  function gradientSegment(x0, x1, stops) {
    const gradient = ctx.createLinearGradient(x0, 0, x1, 0);
    for (const [offset, color] of stops) gradient.addColorStop(offset, color);
    ctx.fillStyle = gradient;
    ctx.fillRect(x0, barY, x1 - x0, barHeight);
  }

  gradientSegment(blackEnd + 3, xForIndex(10), [[0, "#ff6f00"], [1, "#fff200"]]);
  gradientSegment(xForIndex(10) + 3, xForIndex(20), [[0, "#77d600"], [1, "#00a84f"]]);
  gradientSegment(xForIndex(20) + 3, xForIndex(30), [[0, "#1749d1"], [1, "#7132b9"]]);
  gradientSegment(xForIndex(30) + 3, xForIndex(40), [[0, "#f0005d"], [1, "#c9003d"]]);

  ctx.strokeStyle = "#333";
  ctx.lineWidth = 1;
  ctx.strokeRect(left, barY, barWidth, barHeight);

  ctx.strokeStyle = "#222";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(left, axisY);
  ctx.lineTo(left + barWidth, axisY);
  ctx.stroke();

  ctx.font = "600 15px Arial, sans-serif";
  ctx.fillStyle = "#202020";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  for (let value = 0; value <= 40; value += 5) {
    const x = xForIndex(value);
    ctx.beginPath();
    ctx.moveTo(x, axisY);
    ctx.lineTo(x, axisY + 11);
    ctx.stroke();
    ctx.fillText(String(value), x, axisY + 14);
  }

  const bracketY = 178;
  const labelY = 192;
  const rangeY = 220;
  const currentLabels = getCurrentRangeLabels();
  const categories = [
    { x0: left, x1: blackEnd, color: "#111111", label: "Black", range: `${currentLabels.blackStart} / ${currentLabels.blackEnd}` },
    { x0: xForIndex(2.8), x1: xForIndex(10), color: "#f57c00", label: "Organic", range: currentLabels.orange },
    { x0: xForIndex(11.2), x1: xForIndex(20), color: "#0aa63b", label: "Intermediate", range: currentLabels.green },
    { x0: xForIndex(21.0), x1: xForIndex(30), color: "#123fcd", label: "Mineral", range: currentLabels.blue },
    { x0: xForIndex(31.0), x1: xForIndex(40), color: "#e50046", label: "High Z", range: currentLabels.pink }
  ];

  for (const category of categories) {
    const center = (category.x0 + category.x1) / 2;
    ctx.strokeStyle = category.color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(category.x0, bracketY);
    ctx.lineTo(category.x1, bracketY);
    ctx.moveTo(category.x0, bracketY - 5);
    ctx.lineTo(category.x0, bracketY + 5);
    ctx.moveTo(category.x1, bracketY - 5);
    ctx.lineTo(category.x1, bracketY + 5);
    ctx.stroke();

    ctx.fillStyle = category.color;
    ctx.font = "700 17px Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText(category.label, center, labelY);

    ctx.fillStyle = "#242424";
    ctx.font = "400 15px Arial, sans-serif";
    ctx.fillText(category.range, center, rangeY);
  }
}

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
