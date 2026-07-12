import {
  imageCanvas,
  hemdCanvas,
  ctx,
  hemdCtx,
  imageNameText,
  bboxInfoText,
  btnShowHemd,
  btnShowXray,
  btnSuspect,
  hemdMissingModal,
  btnCloseHemdModal
} from "./dom.js?v=12";
import { state } from "./state.js";
import { resetSelection, setStatus } from "./ui.js";

function cloneImageData(imageData) {
  return new ImageData(
    new Uint8ClampedArray(imageData.data),
    imageData.width,
    imageData.height
  );
}

function loadHtmlImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Não foi possível abrir: ${src}`));
    img.src = src;
  });
}

export function getCanvasPoint(event) {
  const rect = imageCanvas.getBoundingClientRect();
  const xScreen = event.clientX - rect.left;
  const yScreen = event.clientY - rect.top;

  if (xScreen < 0 || yScreen < 0 || xScreen > rect.width || yScreen > rect.height) {
    return null;
  }

  return {
    x: Math.round(xScreen * imageCanvas.width / rect.width),
    y: Math.round(yScreen * imageCanvas.height / rect.height)
  };
}

export function updateViewButtons() {
  const hasXray = Boolean(state.currentImageData);
  const showingXray = state.activeView === "xray";

  // O botão HEMD continua disponível quando existe uma X-RAY carregada.
  // Caso a HEMD não exista, ele abre uma tela informativa no lugar da imagem.
  btnShowHemd.disabled = !hasXray || !showingXray;
  btnShowXray.disabled = !hasXray || showingXray;
  btnSuspect.disabled = !hasXray || !showingXray;
}

function openMissingHemdModal() {
  hemdMissingModal.hidden = false;
  document.body.classList.add("modal-open");
  btnCloseHemdModal.focus();
}

function closeMissingHemdModal() {
  hemdMissingModal.hidden = true;
  document.body.classList.remove("modal-open");
  btnShowHemd.focus();
}

btnCloseHemdModal.addEventListener("click", closeMissingHemdModal);
hemdMissingModal.addEventListener("click", (event) => {
  if (event.target.matches("[data-close-hemd-modal]")) {
    closeMissingHemdModal();
  }
});

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !hemdMissingModal.hidden) {
    event.preventDefault();
    event.stopImmediatePropagation();
    closeMissingHemdModal();
  }
}, true);

export function showImageView(view) {
  if (!state.currentImageData) return;

  if (view === "hemd" && !state.hemdImageData) {
    openMissingHemdModal();
    setStatus("Não foi possível encontrar a imagem HEMD correspondente!");
    updateViewButtons();
    return;
  }

  state.activeView = view === "hemd" ? "hemd" : "xray";
  const showingXray = state.activeView === "xray";

  imageCanvas.classList.toggle("canvas-visible", showingXray);
  hemdCanvas.classList.toggle("canvas-visible", !showingXray);
  imageCanvas.setAttribute("aria-hidden", String(!showingXray));
  hemdCanvas.setAttribute("aria-hidden", String(showingXray));

  resetSelection();
  updateViewButtons();

  if (showingXray) {
    imageNameText.textContent = state.currentFileName;
    setStatus("Visualizando a imagem X-RAY.");
  } else {
    imageNameText.textContent = state.hemdFileName;
    setStatus("Visualizando a imagem HEMD.");
  }
}

export function redrawCanvas() {
  if (!state.currentImageData) return;

  ctx.putImageData(state.currentImageData, 0, 0);

  if (state.suspectBoxes?.length > 0) {
    ctx.save();
    ctx.strokeStyle = "#ff1f1f";
    ctx.fillStyle = "#ff1f1f";
    ctx.lineWidth = Math.max(3, Math.round(imageCanvas.width / 500));
    ctx.font = `${Math.max(14, Math.round(imageCanvas.width / 90))}px Arial`;

    state.suspectBoxes.forEach((box, index) => {
      const width = box.xMax - box.xMin + 1;
      const height = box.yMax - box.yMin + 1;
      ctx.strokeRect(box.xMin, box.yMin, width, height);
      const prefix = box.source === "fft" ? "FFT" : "BB";
      ctx.fillText(`${prefix} ${index + 1}`, box.xMin + 6, Math.max(18, box.yMin - 8));
    });
    ctx.restore();
  }

  if (state.lastBox) {
    ctx.save();
    ctx.strokeStyle = "#00e5ff";
    ctx.lineWidth = Math.max(2, Math.round(imageCanvas.width / 700));
    ctx.strokeRect(state.lastBox.xMin, state.lastBox.yMin, state.lastBox.width, state.lastBox.height);
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

export async function loadXrayOnlyFromSource(xraySrc, xrayFileName) {
  try {
    const xrayImg = await loadHtmlImage(xraySrc);
    const width = xrayImg.naturalWidth;
    const height = xrayImg.naturalHeight;

    imageCanvas.width = width;
    imageCanvas.height = height;
    hemdCanvas.width = width;
    hemdCanvas.height = height;

    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(xrayImg, 0, 0, width, height);
    hemdCtx.clearRect(0, 0, width, height);

    state.originalImageData = ctx.getImageData(0, 0, width, height);
    state.currentImageData = cloneImageData(state.originalImageData);
    state.hemdImageData = null;
    state.currentFileName = xrayFileName;
    state.hemdFileName = "";
    state.activeView = "xray";
    state.lastBox = null;
    state.currentDetectorBoxes = [];
    state.fftDetectorBoxes = [];
    state.suspectBoxes = [];

    bboxInfoText.textContent = "nenhum";
    resetSelection();
    redrawCanvas();
    showImageView("xray");
    setStatus(`Imagem X-RAY carregada: ${xrayFileName} (${width} x ${height}).`);
  } catch (error) {
    console.error(error);
    setStatus(`Não foi possível carregar a imagem X-RAY: ${error.message}`);
    throw error;
  }
}

export async function loadImagePairFromSources(xraySrc, hemdSrc, xrayFileName, hemdFileName) {
  try {
    const [xrayImg, hemdImg] = await Promise.all([
      loadHtmlImage(xraySrc),
      loadHtmlImage(hemdSrc)
    ]);

    const width = xrayImg.naturalWidth;
    const height = xrayImg.naturalHeight;

    imageCanvas.width = width;
    imageCanvas.height = height;
    hemdCanvas.width = width;
    hemdCanvas.height = height;

    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(xrayImg, 0, 0, width, height);

    hemdCtx.clearRect(0, 0, width, height);
    // A HEMD é redimensionada para ocupar exatamente W x H da X-RAY.
    hemdCtx.drawImage(hemdImg, 0, 0, width, height);

    state.originalImageData = ctx.getImageData(0, 0, width, height);
    state.currentImageData = cloneImageData(state.originalImageData);
    state.hemdImageData = hemdCtx.getImageData(0, 0, width, height);
    state.currentFileName = xrayFileName;
    state.hemdFileName = hemdFileName;
    state.activeView = "xray";
    state.lastBox = null;
    state.currentDetectorBoxes = [];
    state.fftDetectorBoxes = [];
    state.suspectBoxes = [];

    bboxInfoText.textContent = "nenhum";
    resetSelection();
    redrawCanvas();
    showImageView("xray");

    setStatus(
      `Par carregado: ${xrayFileName} + ${hemdFileName} (${width} x ${height}).`
    );
  } catch (error) {
    console.error(error);
    setStatus(`Não foi possível carregar o par X-RAY/HEMD: ${error.message}`);
    throw error;
  }
}

// Mantido por compatibilidade com chamadas antigas.
export function loadImageFromSource(src, fileName) {
  const match = fileName.match(/^xray(\d+)\.[^.]+$/i);
  if (!match) {
    setStatus("O arquivo deve seguir o padrão xray{i}.png.");
    return;
  }
  const hemdName = `hemd${match[1]}.png`;
  loadImagePairFromSources(src, `./ImagensTest/${hemdName}`, fileName, hemdName);
}

export function restoreOriginalImage() {
  if (!state.originalImageData) return;

  state.currentImageData = cloneImageData(state.originalImageData);
  state.lastBox = null;
  state.suspectBoxes = [];
  bboxInfoText.textContent = "nenhum";

  resetSelection();
  redrawCanvas();
  setStatus("Imagem X-RAY original restaurada.");
}

export function downloadEqualizedImage() {
  if (!state.currentImageData) return;

  const exportCanvas = document.createElement("canvas");
  exportCanvas.width = imageCanvas.width;
  exportCanvas.height = imageCanvas.height;
  exportCanvas.getContext("2d").putImageData(state.currentImageData, 0, 0);

  const baseName = state.currentFileName.replace(/\.[^/.]+$/, "");
  const link = document.createElement("a");
  link.download = `${baseName}_equalizada_local.png`;
  link.href = exportCanvas.toDataURL("image/png");
  link.click();
  setStatus(`Download gerado: ${link.download}`);
}
