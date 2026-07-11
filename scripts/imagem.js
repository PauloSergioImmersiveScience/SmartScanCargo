import { DEFAULT_IMAGE_PATH } from "./config.js";
import {
  imageCanvas,
  ctx,
  imageNameText,
  bboxInfoText
} from "./dom.js";
import { state } from "./state.js";
import { resetSelection, setStatus } from "./ui.js";

export function getCanvasPoint(event) {
  const rect = imageCanvas.getBoundingClientRect();
  const xScreen = event.clientX - rect.left;
  const yScreen = event.clientY - rect.top;

  if (
    xScreen < 0 ||
    yScreen < 0 ||
    xScreen > rect.width ||
    yScreen > rect.height
  ) {
    return null;
  }

  const scaleX = imageCanvas.width / rect.width;
  const scaleY = imageCanvas.height / rect.height;

  return {
    x: Math.round(xScreen * scaleX),
    y: Math.round(yScreen * scaleY)
  };
}

export function redrawCanvas() {
  if (!state.currentImageData) return;

  ctx.putImageData(state.currentImageData, 0, 0);

  if (state.lastBox) {
    ctx.save();
    ctx.strokeStyle = "red";
    ctx.lineWidth = Math.max(2, Math.round(imageCanvas.width / 700));
    ctx.strokeRect(
      state.lastBox.xMin,
      state.lastBox.yMin,
      state.lastBox.width,
      state.lastBox.height
    );
    ctx.restore();
  }

  if (state.previewPoint) {
    ctx.save();
    ctx.fillStyle = "red";
    ctx.strokeStyle = "white";
    ctx.lineWidth = Math.max(1, Math.round(imageCanvas.width / 1200));
    ctx.beginPath();
    ctx.arc(
      state.previewPoint.x,
      state.previewPoint.y,
      Math.max(4, Math.round(imageCanvas.width / 300)),
      0,
      2 * Math.PI
    );
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
}

export function loadImageFromSource(src, fileName) {
  const img = new Image();

  img.onload = function () {
    imageCanvas.width = img.naturalWidth;
    imageCanvas.height = img.naturalHeight;

    ctx.drawImage(img, 0, 0);

    state.originalImageData = ctx.getImageData(
      0,
      0,
      imageCanvas.width,
      imageCanvas.height
    );

    state.currentImageData = new ImageData(
      new Uint8ClampedArray(state.originalImageData.data),
      state.originalImageData.width,
      state.originalImageData.height
    );

    state.currentFileName = fileName;
    state.lastBox = null;

    imageNameText.textContent = fileName;
    bboxInfoText.textContent = "nenhum";

    resetSelection();
    redrawCanvas();

    setStatus(
      `Imagem carregada: ${fileName} ` +
      `(${imageCanvas.width} x ${imageCanvas.height}).`
    );
  };

  img.onerror = function () {
    setStatus(
      "Não foi possível carregar a imagem padrão. " +
      "Use o botão 'Carregar imagem'."
    );
  };

  img.src = src;
}

export function loadDefaultImage() {
  if (state.originalImageData !== null) return;
  loadImageFromSource(DEFAULT_IMAGE_PATH, DEFAULT_IMAGE_PATH);
}

export function restoreOriginalImage() {
  if (!state.originalImageData) return;

  state.currentImageData = new ImageData(
    new Uint8ClampedArray(state.originalImageData.data),
    state.originalImageData.width,
    state.originalImageData.height
  );

  state.lastBox = null;
  bboxInfoText.textContent = "nenhum";

  resetSelection();
  redrawCanvas();
  setStatus("Imagem original restaurada.");
}

export function downloadEqualizedImage() {
  if (!state.currentImageData) return;

  const exportCanvas = document.createElement("canvas");
  exportCanvas.width = imageCanvas.width;
  exportCanvas.height = imageCanvas.height;

  const exportCtx = exportCanvas.getContext("2d");
  exportCtx.putImageData(state.currentImageData, 0, 0);

  const baseName = state.currentFileName.replace(/\.[^/.]+$/, "");
  const link = document.createElement("a");

  link.download = `${baseName}_equalizada_local.png`;
  link.href = exportCanvas.toDataURL("image/png");
  link.click();

  setStatus(`Download gerado: ${link.download}`);
}
