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
  btnReport,
  hemdMissingModal,
  btnCloseHemdModal
} from "./dom.js?v=40";
import { state } from "./state.js";
import { resetSelection, setStatus } from "./ui.js";
import { getAlgorithmConfig } from "./algorithm_config.js?v=40";


function ensureRestoreState() {
  if (!Array.isArray(state.restorePoints)) state.restorePoints = [];
  if (!("restorePreviewPoint" in state)) state.restorePreviewPoint = null;
  if (!("lastRestoreBox" in state)) state.lastRestoreBox = null;
}

function resetRestoreSelectionLocal() {
  ensureRestoreState();
  state.restorePoints = [];
  state.restorePreviewPoint = null;
}

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

  // O relatório fica disponível sempre que existirem BBs atuais,
  // inclusive depois de restaurações locais que recortem as regiões.
  btnReport.disabled = !(state.suspectBoxes?.length > 0);
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
    setStatus("Nenhuma imagem hemd foi carregada!");
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
  ensureRestoreState();
  if (!state.currentImageData) return;

  // Reinicia explicitamente os estilos do canvas.
  // Isso impede que qualquer tracejado de versões anteriores permaneça ativo.
  ctx.setLineDash([]);
  ctx.lineDashOffset = 0;
  ctx.globalAlpha = 1;
  ctx.putImageData(state.currentImageData, 0, 0);

  if (state.suspectBoxes?.length > 0) {
    ctx.save();
    ctx.strokeStyle = "#ff1f1f";
    ctx.fillStyle = "#ff1f1f";
    ctx.lineWidth = Math.max(1, getAlgorithmConfig().fft.BBOX_THICKNESS);
    ctx.font = `${Math.max(14, Math.round(imageCanvas.width / 90))}px Arial`;

    state.suspectBoxes.forEach((box, index) => {
      ctx.lineWidth = Math.max(1, box.thickness || getAlgorithmConfig().fft.BBOX_THICKNESS);
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

  if (state.restorePreviewPoint) {
    ctx.save();
    ctx.fillStyle = "#22c55e";
    ctx.strokeStyle = "white";
    ctx.lineWidth = Math.max(1, Math.round(imageCanvas.width / 1200));
    ctx.beginPath();
    ctx.arc(
      state.restorePreviewPoint.x,
      state.restorePreviewPoint.y,
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
    state.lastRestoreBox = null;
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


export async function loadHemdOnlyFromSource(hemdSrc, hemdFileName) {
  if (!state.currentImageData) {
    throw new Error("Carregue primeiro uma imagem X-RAY.");
  }

  try {
    const hemdImg = await loadHtmlImage(hemdSrc);
    const width = imageCanvas.width;
    const height = imageCanvas.height;

    hemdCanvas.width = width;
    hemdCanvas.height = height;
    hemdCtx.clearRect(0, 0, width, height);
    hemdCtx.drawImage(hemdImg, 0, 0, width, height);

    state.hemdImageData = hemdCtx.getImageData(0, 0, width, height);
    state.hemdFileName = hemdFileName;

    updateViewButtons();
    setStatus(`Imagem HEMD carregada: ${hemdFileName}.`);
  } catch (error) {
    console.error(error);
    setStatus(`Não foi possível carregar a imagem HEMD: ${error.message}`);
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
    state.lastRestoreBox = null;
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


function clampRegion(p1, p2) {
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

function subtractRegionFromBox(box, cut) {
  const ix1 = Math.max(box.xMin, cut.xMin);
  const iy1 = Math.max(box.yMin, cut.yMin);
  const ix2 = Math.min(box.xMax, cut.xMax);
  const iy2 = Math.min(box.yMax, cut.yMax);

  // Não há interseção.
  if (ix1 > ix2 || iy1 > iy2) {
    return [{ ...box }];
  }

  const fragments = [];
  const addFragment = (xMin, yMin, xMax, yMax) => {
    if (xMin > xMax || yMin > yMax) return;
    fragments.push({
      ...box,
      xMin,
      yMin,
      xMax,
      yMax
    });
  };

  // Faixa superior.
  addFragment(box.xMin, box.yMin, box.xMax, iy1 - 1);

  // Faixa inferior.
  addFragment(box.xMin, iy2 + 1, box.xMax, box.yMax);

  // Faixa esquerda na altura da interseção.
  addFragment(box.xMin, iy1, ix1 - 1, iy2);

  // Faixa direita na altura da interseção.
  addFragment(ix2 + 1, iy1, box.xMax, iy2);

  return fragments;
}

function subtractRegionFromBoxes(boxes, cut) {
  return (boxes || []).flatMap((box) => {
    const fragments = subtractRegionFromBox(box, cut);

    if (fragments.length <= 1) {
      return fragments;
    }

    let largest = fragments[0];
    let largestArea =
      (largest.xMax - largest.xMin + 1) *
      (largest.yMax - largest.yMin + 1);

    for (let i = 1; i < fragments.length; i++) {
      const fragment = fragments[i];
      const area =
        (fragment.xMax - fragment.xMin + 1) *
        (fragment.yMax - fragment.yMin + 1);

      if (area > largestArea) {
        largest = fragment;
        largestArea = area;
      }
    }

    return [largest];
  });
}

export function restoreBoundingBoxRegion(p1, p2) {
  if (!state.currentImageData || !state.originalImageData) return;

  const box = clampRegion(p1, p2);

  if (box.width <= 1 || box.height <= 1) {
    setStatus("Região de restauração inválida: selecione dois pontos diferentes.");
    return;
  }

  const current = state.currentImageData.data;
  const original = state.originalImageData.data;
  const imageWidth = state.currentImageData.width;

  for (let y = box.yMin; y <= box.yMax; y++) {
    const start = (y * imageWidth + box.xMin) * 4;
    const end = (y * imageWidth + box.xMax + 1) * 4;
    current.set(original.subarray(start, end), start);
  }

  state.currentDetectorBoxes = subtractRegionFromBoxes(
    state.currentDetectorBoxes,
    box
  );
  state.fftDetectorBoxes = subtractRegionFromBoxes(
    state.fftDetectorBoxes,
    box
  );
  state.suspectBoxes = subtractRegionFromBoxes(
    state.suspectBoxes,
    box
  );

  state.lastBox = null;
  state.lastRestoreBox = null;
  resetRestoreSelectionLocal();
  redrawCanvas();

  const remaining = state.suspectBoxes.length;
  updateViewButtons();
  setStatus(
    `Região restaurada ao original. Os bounding boxes interceptados foram ` +
    `recortados; restam ${remaining} região(ões) marcada(s).`
  );
}

export function restoreOriginalImage() {
  if (!state.originalImageData) return;

  state.currentImageData = cloneImageData(state.originalImageData);
  state.lastBox = null;
  state.lastRestoreBox = null;
  state.currentDetectorBoxes = [];
  state.fftDetectorBoxes = [];
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
