import { state } from "./state.js";
import { redrawCanvas } from "./imagem.js";
import { setStatus } from "./ui.js";
import { getAlgorithmConfig } from "./algorithm_config.js?v=40";



let ANALYSIS_WIDTH, FFT_WINDOW_SIZE, FFT_STEP, HIGH_FREQ_RADIUS;
let FFT_LOCAL_KERNEL_SIZE, FFT_ENERGY_ABS_MIN, FFT_Z_THRESHOLD;
let FFT_SCORE_THRESHOLD, REQUIRE_FFT_DETECTOR, APPLY_MORPHOLOGY;
let MORPH_KERNEL_SIZE, OPEN_ITERATIONS, CLOSE_ITERATIONS;
let BB_AREA_MIN_PERCENT, MAX_COMPONENT_AREA, BBOX_MARGIN, BBOX_THICKNESS, EPS;

function refreshFftConfig() {
  ({
    ANALYSIS_WIDTH, FFT_WINDOW_SIZE, FFT_STEP, HIGH_FREQ_RADIUS,
    FFT_LOCAL_KERNEL_SIZE, FFT_ENERGY_ABS_MIN, FFT_Z_THRESHOLD,
    FFT_SCORE_THRESHOLD, REQUIRE_FFT_DETECTOR, APPLY_MORPHOLOGY,
    MORPH_KERNEL_SIZE, OPEN_ITERATIONS, CLOSE_ITERATIONS,
    BB_AREA_MIN_PERCENT, MAX_COMPONENT_AREA, BBOX_MARGIN,
    BBOX_THICKNESS, EPS
  } = getAlgorithmConfig().fft);
}

function imageDataToGray(imageData) {
  const { width, height, data } = imageData;
  const gray = new Uint8Array(width * height);
  for (let p = 0, i = 0; p < gray.length; p++, i += 4) {
    gray[p] = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
  }
  return gray;
}

function resizeGrayNearest(src, srcW, srcH, dstW, dstH) {
  const dst = new Uint8Array(dstW * dstH);
  for (let y = 0; y < dstH; y++) {
    const sy = Math.min(srcH - 1, Math.floor(y * srcH / dstH));
    for (let x = 0; x < dstW; x++) {
      const sx = Math.min(srcW - 1, Math.floor(x * srcW / dstW));
      dst[y * dstW + x] = src[sy * srcW + sx];
    }
  }
  return dst;
}

function reflectIndex(i, n) {
  while (i < 0 || i >= n) {
    if (i < 0) i = -i - 1;
    if (i >= n) i = 2 * n - i - 1;
  }
  return i;
}

function createDftTables(k) {
  const cos = Array.from({ length: k }, () => new Float32Array(k));
  const sin = Array.from({ length: k }, () => new Float32Array(k));
  for (let u = 0; u < k; u++) {
    for (let x = 0; x < k; x++) {
      const angle = -2 * Math.PI * u * x / k;
      cos[u][x] = Math.cos(angle);
      sin[u][x] = Math.sin(angle);
    }
  }
  return { cos, sin };
}

function createHann(k) {
  const hann = new Float32Array(k);
  for (let i = 0; i < k; i++) hann[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (k - 1));
  return hann;
}

function createHighFrequencyMask(k, radiusThreshold) {
  const mask = new Uint8Array(k * k);
  const center = Math.floor(k / 2);
  const maxDist = Math.hypot(center, center);
  for (let v = 0; v < k; v++) {
    for (let u = 0; u < k; u++) {
      const shiftedU = (u + center) % k;
      const shiftedV = (v + center) % k;
      const dist = Math.hypot(shiftedU - center, shiftedV - center) / (maxDist + EPS);
      mask[v * k + u] = dist >= radiusThreshold && !(shiftedU === center && shiftedV === center) ? 1 : 0;
    }
  }
  return mask;
}

function relativeHighFrequencyEnergy(gray, width, height, cx, cy, tables, hann, highMask) {
  const k = FFT_WINDOW_SIZE;
  const half = Math.floor(k / 2);
  const window = new Float32Array(k * k);
  let mean = 0;

  for (let y = 0; y < k; y++) {
    const sy = reflectIndex(cy + y - half, height);
    for (let x = 0; x < k; x++) {
      const sx = reflectIndex(cx + x - half, width);
      const value = gray[sy * width + sx];
      window[y * k + x] = value;
      mean += value;
    }
  }
  mean /= k * k;
  for (let y = 0; y < k; y++) {
    for (let x = 0; x < k; x++) window[y * k + x] = (window[y * k + x] - mean) * hann[y] * hann[x];
  }

  const rowRe = new Float32Array(k * k);
  const rowIm = new Float32Array(k * k);
  for (let y = 0; y < k; y++) {
    for (let u = 0; u < k; u++) {
      let re = 0, im = 0;
      for (let x = 0; x < k; x++) {
        const value = window[y * k + x];
        re += value * tables.cos[u][x];
        im += value * tables.sin[u][x];
      }
      rowRe[y * k + u] = re;
      rowIm[y * k + u] = im;
    }
  }

  let total = 0, high = 0;
  for (let v = 0; v < k; v++) {
    for (let u = 0; u < k; u++) {
      let re = 0, im = 0;
      for (let y = 0; y < k; y++) {
        const c = tables.cos[v][y];
        const s = tables.sin[v][y];
        const rr = rowRe[y * k + u];
        const ri = rowIm[y * k + u];
        re += rr * c - ri * s;
        im += rr * s + ri * c;
      }
      const power = re * re + im * im;
      total += power;
      if (highMask[v * k + u]) high += power;
    }
  }
  return high / (total + EPS);
}

function boxMean(values, cols, rows, radius) {
  const integral = new Float64Array((cols + 1) * (rows + 1));
  for (let y = 0; y < rows; y++) {
    let rowSum = 0;
    for (let x = 0; x < cols; x++) {
      rowSum += values[y * cols + x];
      integral[(y + 1) * (cols + 1) + x + 1] = integral[y * (cols + 1) + x + 1] + rowSum;
    }
  }
  const out = new Float32Array(values.length);
  for (let y = 0; y < rows; y++) {
    const y0 = Math.max(0, y - radius), y1 = Math.min(rows - 1, y + radius);
    for (let x = 0; x < cols; x++) {
      const x0 = Math.max(0, x - radius), x1 = Math.min(cols - 1, x + radius);
      const sum = integral[(y1 + 1) * (cols + 1) + x1 + 1] - integral[y0 * (cols + 1) + x1 + 1] - integral[(y1 + 1) * (cols + 1) + x0] + integral[y0 * (cols + 1) + x0];
      out[y * cols + x] = sum / ((x1 - x0 + 1) * (y1 - y0 + 1));
    }
  }
  return out;
}

function morphology(binary, cols, rows, iterations, mode) {
  let src = binary;
  for (let it = 0; it < iterations; it++) {
    const dst = new Uint8Array(src.length);
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        let value = mode === "dilate" ? 0 : 1;
        const radius = Math.floor(MORPH_KERNEL_SIZE / 2);
        for (let dy = -radius; dy <= radius; dy++) {
          for (let dx = -radius; dx <= radius; dx++) {
            const nx = x + dx, ny = y + dy;
            const v = nx >= 0 && nx < cols && ny >= 0 && ny < rows ? src[ny * cols + nx] : 0;
            if (mode === "dilate") value = Math.max(value, v);
            else value = Math.min(value, v);
          }
        }
        dst[y * cols + x] = value;
      }
    }
    src = dst;
  }
  return src;
}

function applyMorphology(binary, cols, rows) {
  let out = binary;
  if (OPEN_ITERATIONS > 0) {
    out = morphology(out, cols, rows, OPEN_ITERATIONS, "erode");
    out = morphology(out, cols, rows, OPEN_ITERATIONS, "dilate");
  }
  if (CLOSE_ITERATIONS > 0) {
    out = morphology(out, cols, rows, CLOSE_ITERATIONS, "dilate");
    out = morphology(out, cols, rows, CLOSE_ITERATIONS, "erode");
  }
  return out;
}

function componentsToBoxes(binary, scoreMap, cols, rows, centersX, centersY, step, originalW, originalH, analysisW, analysisH) {
  const visited = new Uint8Array(binary.length);
  const boxes = [];
  const minAreaPixels = Math.ceil((BB_AREA_MIN_PERCENT / 100) * originalW * originalH);
  const scaleX = originalW / analysisW;
  const scaleY = originalH / analysisH;
  const half = Math.floor(FFT_WINDOW_SIZE / 2);

  for (let start = 0; start < binary.length; start++) {
    if (!binary[start] || visited[start]) continue;
    const queue = new Int32Array(binary.length);
    let head = 0, tail = 0, count = 0;
    let componentMaxScore = 0;
    let minGX = cols, maxGX = 0, minGY = rows, maxGY = 0;
    queue[tail++] = start; visited[start] = 1;
    while (head < tail) {
      const idx = queue[head++]; count++;
      componentMaxScore = Math.max(componentMaxScore, scoreMap[idx] || 0);
      const gy = Math.floor(idx / cols), gx = idx % cols;
      minGX = Math.min(minGX, gx); maxGX = Math.max(maxGX, gx);
      minGY = Math.min(minGY, gy); maxGY = Math.max(maxGY, gy);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = gx + dx, ny = gy + dy;
        if (nx < 0 || nx >= cols || ny < 0 || ny >= rows) continue;
        const ni = ny * cols + nx;
        if (binary[ni] && !visited[ni]) { visited[ni] = 1; queue[tail++] = ni; }
      }
    }

    const ax0 = Math.max(0, centersX[minGX] - half);
    const ax1 = Math.min(analysisW - 1, centersX[maxGX] + half);
    const ay0 = Math.max(0, centersY[minGY] - half);
    const ay1 = Math.min(analysisH - 1, centersY[maxGY] + half);
    const estimatedArea = (ax1 - ax0 + 1) * (ay1 - ay0 + 1) * scaleX * scaleY;
    if (estimatedArea < minAreaPixels) continue;
    if (MAX_COMPONENT_AREA !== null && estimatedArea > MAX_COMPONENT_AREA) continue;

    boxes.push({
      xMin: Math.max(0, Math.round(ax0 * scaleX) - BBOX_MARGIN),
      xMax: Math.min(originalW - 1, Math.round(ax1 * scaleX) + BBOX_MARGIN),
      yMin: Math.max(0, Math.round(ay0 * scaleY) - BBOX_MARGIN),
      yMax: Math.min(originalH - 1, Math.round(ay1 * scaleY) + BBOX_MARGIN),
      source: "fft",
      suspicionPercent: Math.max(0, Math.min(100, Math.round(componentMaxScore * 100))),
      thickness: BBOX_THICKNESS
    });
  }
  return boxes;
}

export async function detectFftBoxes(imageData, regionR) {
  refreshFftConfig();
  const originalW = imageData.width, originalH = imageData.height;
  const analysisW = Math.min(ANALYSIS_WIDTH, originalW);
  const scale = analysisW / originalW;
  const analysisH = Math.max(FFT_WINDOW_SIZE, Math.round(originalH * scale));
  const gray = resizeGrayNearest(imageDataToGray(imageData), originalW, originalH, analysisW, analysisH);

  const yMin = Math.max(0, Math.round(regionR.yMin * analysisH / originalH));
  const yMax = Math.min(analysisH - 1, Math.round(regionR.yMax * analysisH / originalH));
  const step = FFT_STEP ?? Math.max(1, Math.floor(FFT_WINDOW_SIZE / 2));
  const half = Math.floor(FFT_WINDOW_SIZE / 2);
  const centersX = [], centersY = [];
  for (let x = half; x < analysisW; x += step) centersX.push(x);
  for (let y = Math.max(half, yMin); y <= Math.min(analysisH - 1, yMax); y += step) centersY.push(y);
  if (!centersX.length || !centersY.length) return [];

  const tables = createDftTables(FFT_WINDOW_SIZE);
  const hann = createHann(FFT_WINDOW_SIZE);
  const highMask = createHighFrequencyMask(FFT_WINDOW_SIZE, HIGH_FREQ_RADIUS);
  const cols = centersX.length, rows = centersY.length;
  const energy = new Float32Array(cols * rows);

  let processed = 0;
  for (let gy = 0; gy < rows; gy++) {
    for (let gx = 0; gx < cols; gx++) {
      energy[gy * cols + gx] = relativeHighFrequencyEnergy(gray, analysisW, analysisH, centersX[gx], centersY[gy], tables, hann, highMask);
      processed++;
    }
    if (gy % 2 === 0) {
      setStatus(`Algoritmo FFT: processando janelas ${processed}/${cols * rows}...`);
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  }

  const localRadius = Math.max(1, Math.round((FFT_LOCAL_KERNEL_SIZE / step) / 2));
  const mean = boxMean(energy, cols, rows, localRadius);
  const squared = Float32Array.from(energy, v => v * v);
  const sqMean = boxMean(squared, cols, rows, localRadius);
  const z = new Float32Array(energy.length);
  let maxZ = 0;
  for (let i = 0; i < energy.length; i++) {
    const variance = Math.max(0, sqMean[i] - mean[i] * mean[i]);
    z[i] = Math.max(0, (energy[i] - mean[i]) / (Math.sqrt(variance) + EPS));
    maxZ = Math.max(maxZ, z[i]);
  }

  const scoreMap = new Float32Array(energy.length);
  let suspicious = new Uint8Array(energy.length);
  for (let i = 0; i < energy.length; i++) {
    const score = maxZ > EPS ? z[i] / maxZ : 0;
    scoreMap[i] = score;
    const detector = energy[i] > FFT_ENERGY_ABS_MIN && z[i] > FFT_Z_THRESHOLD;
    suspicious[i] = score > FFT_SCORE_THRESHOLD && (!REQUIRE_FFT_DETECTOR || detector) ? 1 : 0;
  }
  if (APPLY_MORPHOLOGY) suspicious = applyMorphology(suspicious, cols, rows);
  return componentsToBoxes(suspicious, scoreMap, cols, rows, centersX, centersY, step, originalW, originalH, analysisW, analysisH);
}

export async function findFftSuspectRegions(regionR) {
  if (!state.currentImageData) return [];
  const boxes = await detectFftBoxes(state.currentImageData, regionR);
  state.fftDetectorBoxes = boxes;
  state.suspectBoxes = [...(state.currentDetectorBoxes || []), ...boxes, ...(state.manualBoxes || [])];
  redrawCanvas();
  return boxes;
}
