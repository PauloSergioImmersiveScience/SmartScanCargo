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
  if (!state.currentImageData || !effectsCanvas.width || !effectsCanvas.height) return;

  const source = state.currentImageData;
  const output = new ImageData(source.width, source.height);
  const src = source.data;
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
  if (!state.currentImageData) return histogram;
  const data = state.currentImageData.data;
  for (let i = 0; i < data.length; i += 4) histogram[grayAt(data, i)]++;
  return histogram;
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
  if (effectsPanel.hidden || !state.currentImageData) return;
  drawRangeBar();
  drawHistogram();
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
