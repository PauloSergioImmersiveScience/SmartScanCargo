import { imageCanvas } from "./dom.js";
import { state } from "./state.js";
import { redrawCanvas } from "./imagem.js";
import { setStatus } from "./ui.js";
import { getAlgorithmConfig } from "./algorithm_config.js?v=40";


// A imagem é sempre analisada com a mesma largura interna.
// Isso evita resultados diferentes causados por resoluções distintas
// entre desktop, celular ou versões redimensionadas da mesma imagem.

function imageDataToGray(imageData) {
  const { width, height, data } = imageData;
  const gray = new Uint8Array(width * height);
  for (let i = 0, p = 0; p < gray.length; p++, i += 4) {
    gray[p] = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
  }
  return gray;
}

function resizeGrayNearest(src, srcW, srcH, dstW, dstH) {
  if (srcW === dstW && srcH === dstH) return src;
  const dst = new Uint8Array(dstW * dstH);
  for (let y = 0; y < dstH; y++) {
    const sy = Math.min(srcH - 1, Math.floor(y * srcH / dstH));
    const srcRow = sy * srcW;
    const dstRow = y * dstW;
    for (let x = 0; x < dstW; x++) {
      const sx = Math.min(srcW - 1, Math.floor(x * srcW / dstW));
      dst[dstRow + x] = src[srcRow + sx];
    }
  }
  return dst;
}

function otsuThreshold(gray, y0, y1, width) {
  const hist = new Uint32Array(256);
  let total = 0;
  let sum = 0;
  for (let y = y0; y < y1; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      const v = gray[row + x];
      hist[v]++;
      total++;
      sum += v;
    }
  }

  let sumBackground = 0;
  let weightBackground = 0;
  let maxVariance = -1;
  let threshold = 0;

  for (let t = 0; t < 256; t++) {
    weightBackground += hist[t];
    if (weightBackground === 0) continue;
    const weightForeground = total - weightBackground;
    if (weightForeground === 0) break;

    sumBackground += t * hist[t];
    const meanBackground = sumBackground / weightBackground;
    const meanForeground = (sum - sumBackground) / weightForeground;
    const diff = meanBackground - meanForeground;
    const variance = weightBackground * weightForeground * diff * diff;

    if (variance > maxVariance) {
      maxVariance = variance;
      threshold = t;
    }
  }
  return threshold;
}

function erodeBinary(src, width, height, kernelSize) {
  const dst = new Uint8Array(src.length);
  const radius = Math.floor(kernelSize / 2);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    let ok = 1;
    for (let dy = -radius; dy <= radius && ok; dy++) for (let dx = -radius; dx <= radius; dx++) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || nx >= width || ny < 0 || ny >= height || !src[ny * width + nx]) { ok = 0; break; }
    }
    if (ok) dst[y * width + x] = 255;
  }
  return dst;
}

function dilateBinary(src, width, height, kernelSize) {
  const dst = new Uint8Array(src.length);
  const radius = Math.floor(kernelSize / 2);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    let on = 0;
    for (let dy = -radius; dy <= radius && !on; dy++) for (let dx = -radius; dx <= radius; dx++) {
      const nx = x + dx, ny = y + dy;
      if (nx >= 0 && nx < width && ny >= 0 && ny < height && src[ny * width + nx]) { on = 1; break; }
    }
    if (on) dst[y * width + x] = 255;
  }
  return dst;
}

function opening(binary, width, height, iterations, kernelSize) {
  let result = binary;
  for (let i = 0; i < iterations; i++) result = erodeBinary(result, width, height, kernelSize);
  for (let i = 0; i < iterations; i++) result = dilateBinary(result, width, height, kernelSize);
  return result;
}

function largestWhiteComponent(binary, width, height) {
  const visited = new Uint8Array(binary.length);
  const queue = new Int32Array(binary.length);
  let bestArea = 0;
  let bestYMin = 0;
  let bestYMax = -1;
  let components = 0;

  for (let start = 0; start < binary.length; start++) {
    if (!binary[start] || visited[start]) continue;
    components++;
    let head = 0;
    let tail = 0;
    queue[tail++] = start;
    visited[start] = 1;
    let area = 0;
    let yMin = height;
    let yMax = -1;

    while (head < tail) {
      const idx = queue[head++];
      const y = Math.floor(idx / width);
      const x = idx - y * width;
      area++;
      if (y < yMin) yMin = y;
      if (y > yMax) yMax = y;

      for (let dy = -1; dy <= 1; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= height) continue;
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nx = x + dx;
          if (nx < 0 || nx >= width) continue;
          const ni = ny * width + nx;
          if (binary[ni] && !visited[ni]) {
            visited[ni] = 1;
            queue[tail++] = ni;
          }
        }
      }
    }

    if (area > bestArea) {
      bestArea = area;
      bestYMin = yMin;
      bestYMax = yMax;
    }
  }

  if (bestArea === 0) throw new Error("Nenhuma região branca encontrada após Otsu e abertura.");
  return { area: bestArea, yMin: bestYMin, yMax: bestYMax, components };
}

function gaussianKernel1D(size, sigma) {
  const kernel = new Float32Array(size);
  const half = Math.floor(size / 2);
  let sum = 0;
  for (let i = -half; i <= half; i++) {
    const v = Math.exp(-(i * i) / (2 * sigma * sigma));
    kernel[i + half] = v;
    sum += v;
  }
  for (let i = 0; i < size; i++) kernel[i] /= sum;
  return kernel;
}

function gaussianBlur(src, width, height, size, sigma) {
  const kernel = gaussianKernel1D(size, sigma);
  const half = Math.floor(size / 2);
  const temp = new Float32Array(src.length);
  const dst = new Float32Array(src.length);

  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      let sum = 0;
      for (let k = -half; k <= half; k++) {
        const xx = Math.max(0, Math.min(width - 1, x + k));
        sum += src[row + xx] * kernel[k + half];
      }
      temp[row + x] = sum;
    }
  }

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0;
      for (let k = -half; k <= half; k++) {
        const yy = Math.max(0, Math.min(height - 1, y + k));
        sum += temp[yy * width + x] * kernel[k + half];
      }
      dst[y * width + x] = sum;
    }
  }
  return dst;
}

function sobel(src, width, height) {
  const gx = new Float32Array(src.length);
  const gy = new Float32Array(src.length);
  const mag = new Float32Array(src.length);
  const ang = new Float32Array(src.length);

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      const a = src[i - width - 1], b = src[i - width], c = src[i - width + 1];
      const d = src[i - 1], f = src[i + 1];
      const g = src[i + width - 1], h = src[i + width], j = src[i + width + 1];
      const sx = -a + c - 2 * d + 2 * f - g + j;
      const sy = -a - 2 * b - c + g + 2 * h + j;
      gx[i] = sx;
      gy[i] = sy;
      mag[i] = Math.hypot(sx, sy);
      let theta = Math.atan2(sy, sx);
      theta %= Math.PI;
      if (theta < 0) theta += Math.PI;
      ang[i] = theta;
    }
  }
  return { gx, gy, mag, ang };
}

function percentileApprox(values, percentile) {
  let max = 0;
  let count = 0;
  for (const v of values) {
    if (v > 0) {
      count++;
      if (v > max) max = v;
    }
  }
  if (!count || max === 0) throw new Error("A faixa detectada não possui gradientes válidos.");

  const bins = 2048;
  const hist = new Uint32Array(bins);
  for (const v of values) {
    if (v > 0) hist[Math.min(bins - 1, Math.floor((v / max) * (bins - 1)))]++;
  }
  const target = Math.ceil((percentile / 100) * count);
  let cumulative = 0;
  for (let i = 0; i < bins; i++) {
    cumulative += hist[i];
    if (cumulative >= target) return (i / (bins - 1)) * max;
  }
  return max;
}

function normalizedEntropy(hist) {
  let total = 0;
  for (const v of hist) total += v;
  if (total <= 0) return 0;
  let entropy = 0;
  for (const v of hist) {
    if (v > 0) {
      const p = v / total;
      entropy -= p * Math.log(p);
    }
  }
  return entropy / Math.log(hist.length);
}

function groupIntervals(intervals, maxGap) {
  if (!intervals.length) return [];
  intervals.sort((a, b) => a[0] - b[0]);
  const grouped = [[intervals[0][0], intervals[0][1]]];
  for (let i = 1; i < intervals.length; i++) {
    const cur = intervals[i];
    const prev = grouped[grouped.length - 1];
    if (cur[0] <= prev[1] + maxGap) prev[1] = Math.max(prev[1], cur[1]);
    else grouped.push([cur[0], cur[1]]);
  }
  return grouped;
}

export function detectCurrentAlgorithmBoxes(imageData) {
  const {
    D, MORPH_KERNEL_SIZE, MORPH_ITERATIONS, ANALYSIS_WIDTH, WINDOW_RATIO,
    TOP_N, N_BINS, SMOOTH, GAUSS_K, GAUSS_SIG, EDGE_PERC,
    GROUP_GAP_FACTOR, W_ENTROPY, W_COHERENCE, W_DENSITY
  } = getAlgorithmConfig().current;
  const originalW = imageData.width;
  const originalH = imageData.height;
  // Padroniza a resolução da análise em qualquer dispositivo.
  const width = ANALYSIS_WIDTH;
  const scale = width / originalW;
  const height = Math.max(3, Math.round(originalH * scale));

  const originalGray = imageDataToGray(imageData);
  const gray = resizeGrayNearest(originalGray, originalW, originalH, width, height);

  const center = Math.floor(height / 2);
  const centralY0 = Math.max(0, Math.floor(center - (D / 2) * height));
  const centralY1 = Math.min(height, Math.floor(center + (D / 2) * height));
  const centralH = centralY1 - centralY0;
  if (centralH <= 0) throw new Error("A região central calculada é inválida.");

  const threshold = otsuThreshold(gray, centralY0, centralY1, width);
  let binary = new Uint8Array(width * centralH);
  for (let y = 0; y < centralH; y++) {
    const srcRow = (centralY0 + y) * width;
    const dstRow = y * width;
    for (let x = 0; x < width; x++) {
      binary[dstRow + x] = gray[srcRow + x] <= threshold ? 255 : 0;
    }
  }

  binary = opening(binary, width, centralH, MORPH_ITERATIONS, MORPH_KERNEL_SIZE);
  const largest = largestWhiteComponent(binary, width, centralH);
  const lup = centralY0 + largest.yMin;
  const ldw = centralY0 + largest.yMax + 1;
  const roiH = ldw - lup;
  if (roiH <= 0) throw new Error("A faixa vertical automática ficou vazia.");

  const roi = new Uint8Array(width * roiH);
  for (let y = 0; y < roiH; y++) {
    roi.set(gray.subarray((lup + y) * width, (lup + y + 1) * width), y * width);
  }

  const proc = SMOOTH ? gaussianBlur(roi, width, roiH, GAUSS_K, GAUSS_SIG) : Float32Array.from(roi);
  const { gx, gy, mag, ang } = sobel(proc, width, roiH);
  const edgeThreshold = percentileApprox(mag, EDGE_PERC);

  // Mantém a janela proporcional à largura padronizada de análise.
  const windowW = Math.max(3, Math.min(width, Math.round(width * WINDOW_RATIO)));
  const step = Math.max(1, Math.floor(windowW / 2));
  const xPositions = [];
  for (let x = 0; x <= width - windowW; x += step) xPositions.push(x);
  const lastX = width - windowW;
  if (!xPositions.length || xPositions[xPositions.length - 1] !== lastX) xPositions.push(lastX);

  const windows = [];
  let minScore = Infinity;
  let maxScore = -Infinity;

  for (const x1 of xPositions) {
    const x2 = x1 + windowW;
    const hist = new Float64Array(N_BINS);
    let numEdge = 0;
    let jxx = 0, jyy = 0, jxy = 0;

    for (let y = 0; y < roiH; y++) {
      const row = y * width;
      for (let x = x1; x < x2; x++) {
        const idx = row + x;
        const m = mag[idx];
        if (m >= edgeThreshold) {
          numEdge++;
          const bin = Math.min(N_BINS - 1, Math.floor((ang[idx] / Math.PI) * N_BINS));
          hist[bin] += m;
          const sx = gx[idx], sy = gy[idx];
          jxx += sx * sx;
          jyy += sy * sy;
          jxy += sx * sy;
        }
      }
    }

    const density = numEdge / (roiH * windowW);
    let entropy = 0;
    let coherence = 0;
    let score = 0;

    if (numEdge > 0) {
      entropy = normalizedEntropy(hist);
      const trace = jxx + jyy;
      const delta = Math.sqrt((jxx - jyy) ** 2 + 4 * jxy * jxy);
      const lambda1 = 0.5 * (trace + delta);
      const lambda2 = 0.5 * (trace - delta);
      coherence = Math.max(0, Math.min(1, (lambda1 - lambda2) / (lambda1 + lambda2 + 1e-12)));
      score = (W_ENTROPY * entropy) * (W_COHERENCE * (1 - coherence)) * (W_DENSITY * density);
    }

    windows.push({ x1, x2, score });
    minScore = Math.min(minScore, score);
    maxScore = Math.max(maxScore, score);
  }

  for (const w of windows) {
    w.norm = maxScore > minScore ? (w.score - minScore) / (maxScore - minScore) : 0;
  }

  windows.sort((a, b) => b.norm - a.norm);
  const selectedWindows = windows.slice(0, Math.min(TOP_N, windows.length));
  const selectedIntervals = selectedWindows.map(w => [w.x1, w.x2]);
  const grouped = groupIntervals(selectedIntervals, Math.round(step * GROUP_GAP_FACTOR));

  const invScaleX = originalW / width;
  const invScaleY = originalH / height;
  return {
    boxes: grouped.map(([x1, x2]) => {
      const groupScore = selectedWindows
        .filter(w => w.x2 >= x1 && w.x1 <= x2)
        .reduce((maximum, w) => Math.max(maximum, w.norm), 0);

      return {
        source: "current",
        suspicionPercent: Math.max(0, Math.min(100, Math.round(groupScore * 100))),
        xMin: Math.max(0, Math.round(x1 * invScaleX)),
        xMax: Math.min(originalW - 1, Math.round(x2 * invScaleX)),
        yMin: Math.max(0, Math.round(lup * invScaleY)),
        yMax: Math.min(originalH - 1, Math.round((ldw - 1) * invScaleY))
      };
    }),
    threshold,
    lup: Math.round(lup * invScaleY),
    ldw: Math.round(ldw * invScaleY),
    componentArea: Math.round(largest.area / (scale * scale)),
    components: largest.components
  };
}

export async function findPossibleSuspectRegions() {
  if (!state.currentImageData) {
    setStatus("Carregue uma imagem antes de procurar regiões suspeitas.");
    return;
  }

  setStatus("Analisando a imagem e procurando possíveis regiões suspeitas...");
  await new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 20)));

  try {
    const result = detectCurrentAlgorithmBoxes(state.currentImageData);
    state.currentDetectorBoxes = result.boxes;
    state.suspectBoxes = [...state.currentDetectorBoxes, ...(state.fftDetectorBoxes || []), ...(state.manualBoxes || [])];
    redrawCanvas();

    if (!result.boxes.length) {
      setStatus("O algoritmo atual não encontrou BBs; a região R será mantida para a análise FFT.");
      return result;
    }

    setStatus(
      `${result.boxes.length} possível(is) região(ões) suspeita(s) indicada(s). ` +
      `Faixa automática: y=[${result.lup}, ${result.ldw - 1}]. ` +
      "Você pode equalizar dentro ou fora dos bounding boxes normalmente."
    );
    return result;
  } catch (error) {
    console.error(error);
    state.currentDetectorBoxes = [];
    state.suspectBoxes = [...(state.fftDetectorBoxes || []), ...(state.manualBoxes || [])];
    redrawCanvas();
    setStatus(`Não foi possível executar a detecção: ${error.message}`);
    return null;
  }
}

export function clearSuspectRegions() {
  state.currentDetectorBoxes = [];
  state.fftDetectorBoxes = [];
  state.suspectBoxes = [...(state.manualBoxes || [])];
  redrawCanvas();
}
