import { imageCanvas, bboxInfoText } from "./dom.js";
import { state } from "./state.js";
import { setStatus } from "./ui.js";

function rgbToGray(r, g, b) {
  return Math.round(0.299 * r + 0.587 * g + 0.114 * b);
}

function clampBox(p1, p2) {
  const xMin = Math.max(0, Math.min(p1.x, p2.x));
  const xMax = Math.min(imageCanvas.width - 1, Math.max(p1.x, p2.x));
  const yMin = Math.max(0, Math.min(p1.y, p2.y));
  const yMax = Math.min(imageCanvas.height - 1, Math.max(p1.y, p2.y));

  return {
    xMin,
    xMax,
    yMin,
    yMax,
    width: xMax - xMin + 1,
    height: yMax - yMin + 1
  };
}

export function equalizeBoundingBox(p1, p2) {
  if (!state.currentImageData) return;

  const box = clampBox(p1, p2);

  if (box.width <= 1 || box.height <= 1) {
    setStatus("Bounding box inválido: selecione dois pontos diferentes.");
    return;
  }

  const data = state.currentImageData.data;
  const imageWidth = state.currentImageData.width;
  const hist = new Array(256).fill(0);

  for (let y = box.yMin; y <= box.yMax; y++) {
    for (let x = box.xMin; x <= box.xMax; x++) {
      const idx = (y * imageWidth + x) * 4;
      const gray = rgbToGray(data[idx], data[idx + 1], data[idx + 2]);
      hist[gray]++;
    }
  }

  const cdf = new Array(256).fill(0);
  cdf[0] = hist[0];

  for (let i = 1; i < 256; i++) {
    cdf[i] = cdf[i - 1] + hist[i];
  }

  const total = box.width * box.height;
  const cdfMin = cdf.find((value) => value > 0) || 0;
  const denom = total - cdfMin;

  if (denom <= 0) {
    setStatus("A região selecionada tem intensidade praticamente constante. Nada foi equalizado.");
    return;
  }

  const lut = new Array(256).fill(0);

  for (let i = 0; i < 256; i++) {
    lut[i] = Math.max(
      0,
      Math.min(255, Math.round(((cdf[i] - cdfMin) / denom) * 255))
    );
  }

  for (let y = box.yMin; y <= box.yMax; y++) {
    for (let x = box.xMin; x <= box.xMax; x++) {
      const idx = (y * imageWidth + x) * 4;
      const gray = rgbToGray(data[idx], data[idx + 1], data[idx + 2]);
      const equalizedValue = lut[gray];

      data[idx] = equalizedValue;
      data[idx + 1] = equalizedValue;
      data[idx + 2] = equalizedValue;
      data[idx + 3] = 255;
    }
  }

  state.lastBox = box;
  bboxInfoText.textContent =
    `x=[${box.xMin}, ${box.xMax}], y=[${box.yMin}, ${box.yMax}], ` +
    `${box.width} x ${box.height}`;

  setStatus(
    `Equalização aplicada na região: p1=(${p1.x}, ${p1.y}), ` +
    `p2=(${p2.x}, ${p2.y}).`
  );
}
