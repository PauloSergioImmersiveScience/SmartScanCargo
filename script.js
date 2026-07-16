import "./scripts/settings.js?v=40";
import {
  appScreen,
  passwordInput,
  btnLogin,
  btnLogout,
  imageLoader,
  hemdLoader,
  localXrayDisplay,
  localHemdDisplay,
  exampleXraySelect,
  exampleHemdSelect,
  btnLoadExampleXray,
  btnLoadExampleHemd,
  imageCanvas,
  hemdCanvas,
  effectsCanvas,
  effectsPanel,
  hemdPalettePanel,
  imageNameText,
  bboxInfoText,
  pointsCountText,
  btnRestore,
  btnDownload,
  btnSuspect,
  btnShowHemd,
  btnShowXray,
  btnEffects,
  btnReport
} from "./scripts/dom.js?v=63";

import { state } from "./scripts/state.js";
import { initializeEffectsUI, resetEffectsRanges } from "./scripts/effects.js?v=71";
import { setStatus, resetSelection } from "./scripts/ui.js";
import {
  getCanvasPoint,
  loadXrayOnlyFromSource,
  loadHemdOnlyFromSource,
  redrawCanvas,
  restoreOriginalImage,
  restoreBoundingBoxRegion,
  downloadEqualizedImage,
  showImageView,
  updateViewButtons
} from "./scripts/imagem.js?v=81";
import { equalizeBoundingBox } from "./scripts/equalizacao.js";
import { findPossibleSuspectRegions } from "./scripts/detector.js?v=81";
import { findFftSuspectRegions } from "./scripts/fft_detector.js?v=81";
import { EXAMPLE_IMAGES, EXAMPLE_IMAGES_DIRECTORY } from "./scripts/examples.js?v=2";
import { checkPassword, lockApp, restoreLoginState } from "./scripts/login.js";
import { generateCurrentAnalysisReport } from "./scripts/report.js?v=81";

const btnManual = document.getElementById("btnManual");
state.manualBoxes = [];
state.manualDetectionActive = false;
state.manualPoints = [];
state.manualPreviewPoint = null;

btnLogin.addEventListener("click", checkPassword);
passwordInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") checkPassword();
});
function resetApplicationSession() {
  // Limpa somente o estado da sessão atual. A configuração salva dos
  // algoritmos permanece intacta, pois nenhum dado de localStorage é alterado.
  state.originalImageData = null;
  state.effectsSourceImageData = null;
  state.currentImageData = null;
  state.hemdImageData = null;
  state.effectsImageData = null;
  state.effectsThresholds = [1, 10, 20, 30, 40];
  state.activeView = "xray";
  state.selectedPoints = [];
  state.previewPoint = null;
  state.restorePoints = [];
  state.restorePreviewPoint = null;
  state.lastRestoreBox = null;
  state.lastBox = null;
  state.currentDetectorBoxes = [];
  state.fftDetectorBoxes = [];
  state.suspectBoxes = [];
  state.manualBoxes = [];
  state.manualDetectionActive = false;
  state.manualPoints = [];
  state.manualPreviewPoint = null;
  btnManual.classList.remove("active");
  btnManual.setAttribute("aria-pressed", "false");
  state.currentFileName = "";
  state.hemdFileName = "";

  imageLoader.value = "";
  hemdLoader.value = "";
  exampleXraySelect.value = "";
  exampleHemdSelect.value = "";
  btnLoadExampleXray.disabled = true;
  btnLoadExampleHemd.disabled = true;

  setLocalDisplay(localXrayDisplay, "Selecione uma imagem X-RAY");
  setLocalDisplay(localHemdDisplay, "Selecione uma imagem HEMD correspondente");

  imageCanvas.getContext("2d").clearRect(0, 0, imageCanvas.width, imageCanvas.height);
  hemdCanvas.getContext("2d").clearRect(0, 0, hemdCanvas.width, hemdCanvas.height);
  effectsCanvas.getContext("2d").clearRect(0, 0, effectsCanvas.width, effectsCanvas.height);

  imageCanvas.width = 0;
  imageCanvas.height = 0;
  hemdCanvas.width = 0;
  hemdCanvas.height = 0;
  effectsCanvas.width = 0;
  effectsCanvas.height = 0;

  imageCanvas.classList.add("canvas-visible");
  hemdCanvas.classList.remove("canvas-visible");
  effectsCanvas.classList.remove("canvas-visible");
  imageCanvas.setAttribute("aria-hidden", "false");
  hemdCanvas.setAttribute("aria-hidden", "true");
  effectsCanvas.setAttribute("aria-hidden", "true");
  effectsPanel.hidden = true;
  hemdPalettePanel.hidden = true;

  imageNameText.textContent = "nenhuma imagem carregada";
  pointsCountText.textContent = "0";
  bboxInfoText.textContent = "nenhum";

  resetEffectsRanges();
  updateViewButtons();
  setStatus("");
}

btnLogout.addEventListener("click", () => {
  // Primeiro encerra a sessão e retorna imediatamente à tela de login.
  lockApp();

  // Em seguida, com a aplicação já oculta, limpa apenas o estado de trabalho.
  // Assim, ao entrar novamente, o sistema começa sem imagens, seleções,
  // bounding boxes ou resultados, mas preserva integralmente a configuração
  // dos algoritmos salva no localStorage.
  resetApplicationSession();
});

function extractIndex(fileName, prefix) {
  const optionalSuffix = prefix.toLowerCase() === "xray" ? "(?:_[su]\\d+)?" : "";
  const match = fileName.match(
    new RegExp(`^${prefix}(\\d+)${optionalSuffix}\\.[^.]+$`, "i")
  );
  return match ? match[1] : null;
}

function expectedHemdIndex() {
  return extractIndex(state.currentFileName || "", "xray");
}

function setLocalDisplay(element, text) {
  element.textContent = text;
}

function ensureRestoreState() {
  if (!Array.isArray(state.restorePoints)) state.restorePoints = [];
  if (!("restorePreviewPoint" in state)) state.restorePreviewPoint = null;
  if (!("lastRestoreBox" in state)) state.lastRestoreBox = null;
}

function resetLeftSelectionLocal() {
  state.selectedPoints = [];
  state.previewPoint = null;
  pointsCountText.textContent = "0";
}

function resetRestoreSelectionLocal() {
  ensureRestoreState();
  state.restorePoints = [];
  state.restorePreviewPoint = null;
}

function populateExampleSelect(select, type) {
  EXAMPLE_IMAGES.forEach((example) => {
    const option = document.createElement("option");
    option.value = String(example.index);
    option.textContent = type === "xray"
      ? `Raio-X ${example.index}`
      : `HEMD ${example.index}`;
    select.appendChild(option);
  });
}

populateExampleSelect(exampleXraySelect, "xray");
populateExampleSelect(exampleHemdSelect, "hemd");

btnLoadExampleXray.disabled = true;
btnLoadExampleHemd.disabled = true;

exampleXraySelect.addEventListener("change", () => {
  btnLoadExampleXray.disabled = !exampleXraySelect.value;
});

exampleHemdSelect.addEventListener("change", () => {
  btnLoadExampleHemd.disabled = !exampleHemdSelect.value;
});

imageLoader.addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;

  const index = extractIndex(file.name, "xray");
  if (!index) {
    setStatus('Use "xray{i}.ext", "xray{i}_s{j}.ext" ou "xray{i}_u{j}.ext".');
    imageLoader.value = "";
    return;
  }

  setLocalDisplay(localXrayDisplay, file.name);
  const url = URL.createObjectURL(file);

  try {
    await loadXrayOnlyFromSource(url, file.name);
    hemdLoader.value = "";
    setLocalDisplay(localHemdDisplay, "Selecione uma imagem HEMD correspondente");
  } finally {
    URL.revokeObjectURL(url);
  }
});

hemdLoader.addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;

  if (!state.currentImageData) {
    setStatus("Carregue primeiro uma imagem X-RAY.");
    hemdLoader.value = "";
    return;
  }

  const hemdIndex = extractIndex(file.name, "hemd");
  const xrayIndex = expectedHemdIndex();

  if (!hemdIndex || hemdIndex !== xrayIndex) {
    setStatus(`Selecione a imagem HEMD correspondente: hemd${xrayIndex}.png.`);
    hemdLoader.value = "";
    return;
  }

  setLocalDisplay(localHemdDisplay, file.name);
  const url = URL.createObjectURL(file);

  try {
    await loadHemdOnlyFromSource(url, file.name);
  } finally {
    URL.revokeObjectURL(url);
  }
});

btnLoadExampleXray.addEventListener("click", async () => {
  const example = EXAMPLE_IMAGES.find(
    (item) => String(item.index) === exampleXraySelect.value
  );

  if (!example) {
    setStatus("Selecione uma imagem X-RAY exemplo.");
    return;
  }

  const url = `${EXAMPLE_IMAGES_DIRECTORY}${encodeURIComponent(example.xray)}`;
  await loadXrayOnlyFromSource(url, example.xray);

  exampleHemdSelect.value = "";
  btnLoadExampleHemd.disabled = true;
});

btnLoadExampleHemd.addEventListener("click", async () => {
  if (!state.currentImageData) {
    setStatus("Carregue primeiro uma imagem X-RAY.");
    return;
  }

  const example = EXAMPLE_IMAGES.find(
    (item) => String(item.index) === exampleHemdSelect.value
  );

  if (!example) {
    setStatus("Selecione uma imagem HEMD exemplo.");
    return;
  }

  const xrayIndex = expectedHemdIndex();
  if (String(example.index) !== String(xrayIndex)) {
    setStatus(`Selecione a HEMD ${xrayIndex}, correspondente à X-RAY carregada.`);
    return;
  }

  const url = `${EXAMPLE_IMAGES_DIRECTORY}${encodeURIComponent(example.hemd)}`;
  await loadHemdOnlyFromSource(url, example.hemd);
});

ensureRestoreState();

btnShowHemd.addEventListener("click", () => showImageView("hemd"));
btnShowXray.addEventListener("click", () => showImageView("xray"));
btnEffects.addEventListener("click", () => showImageView("effects"));

imageCanvas.addEventListener("click", (event) => {
  if (state.activeView !== "xray") return;
  const point = getCanvasPoint(event);
  if (!point || !state.currentImageData) return;

  if (state.manualDetectionActive) {
    state.manualPoints.push(point);
    state.manualPreviewPoint = point;
    if (state.manualPoints.length === 1) {
      setStatus(`Primeiro ponto manual: (${point.x}, ${point.y}). Clique no canto oposto.`);
    } else {
      const [p1, p2] = state.manualPoints;
      const xMin = Math.min(p1.x, p2.x);
      const xMax = Math.max(p1.x, p2.x);
      const yMin = Math.min(p1.y, p2.y);
      const yMax = Math.max(p1.y, p2.y);
      if (xMax > xMin && yMax > yMin) {
        state.manualBoxes.push({ source: "manual", suspicionPercent: 0, xMin, xMax, yMin, yMax });
        state.suspectBoxes = [
          ...(state.currentDetectorBoxes || []),
          ...(state.fftDetectorBoxes || []),
          ...state.manualBoxes
        ];
        setStatus(`Bounding box manual ${state.manualBoxes.length} criado e incluído no relatório.`);
      } else {
        setStatus("Bounding box inválido. Os dois pontos precisam formar uma área.");
      }
      state.manualPoints = [];
      state.manualPreviewPoint = null;
      updateViewButtons();
    }
    redrawCanvas();
    return;
  }

  resetRestoreSelectionLocal();
  state.lastRestoreBox = null;
  state.selectedPoints.push(point);
  pointsCountText.textContent = String(state.selectedPoints.length);

  if (state.selectedPoints.length === 1) {
    state.previewPoint = point;
    setStatus(`Ponto p1 selecionado: (${point.x}, ${point.y}). Agora clique no ponto p2.`);
    redrawCanvas();
    return;
  }

  if (state.selectedPoints.length === 2) {
    const [p1, p2] = state.selectedPoints;
    state.previewPoint = null;
    equalizeBoundingBox(p1, p2);
    resetSelection();
    redrawCanvas();
  }
});

imageCanvas.addEventListener("contextmenu", (event) => {
  event.preventDefault();

  if (state.activeView !== "xray" || !state.currentImageData) return;

  if (state.manualDetectionActive) {
    state.manualPoints = [];
    state.manualPreviewPoint = null;
    const removed = state.manualBoxes.pop();
    state.suspectBoxes = [
      ...(state.currentDetectorBoxes || []),
      ...(state.fftDetectorBoxes || []),
      ...state.manualBoxes
    ];
    setStatus(removed ? "Último bounding box manual removido." : "Não há bounding box manual para remover.");
    updateViewButtons();
    redrawCanvas();
    return;
  }

  const point = getCanvasPoint(event);
  if (!point) return;

  // O botão direito trabalha com sua própria seleção de dois pontos.
  resetLeftSelectionLocal();
  state.lastBox = null;
  state.restorePoints.push(point);

  if (state.restorePoints.length === 1) {
    state.restorePreviewPoint = point;
    setStatus(
      `Primeiro ponto da restauração selecionado: (${point.x}, ${point.y}). ` +
      `Clique com o botão direito no segundo ponto.`
    );
    redrawCanvas();
    return;
  }

  const [p1, p2] = state.restorePoints;
  state.restorePreviewPoint = null;
  restoreBoundingBoxRegion(p1, p2);
});

btnRestore.addEventListener("click", () => {
  if (state.activeView === "effects") {
    // Em Effects, restaura apenas os ranges de intensidade da terceira imagem.
    // A X-RAY e a HEMD permanecem exatamente como estão.
    resetEffectsRanges();
    setStatus("Effects restaurado aos ranges iniciais de intensidade.");
    return;
  }

  restoreOriginalImage();
});

btnManual.addEventListener("click", () => {
  if (!state.currentImageData || state.activeView !== "xray") return;
  state.manualDetectionActive = !state.manualDetectionActive;
  state.manualPoints = [];
  state.manualPreviewPoint = null;
  btnManual.classList.toggle("active", state.manualDetectionActive);
  btnManual.setAttribute("aria-pressed", String(state.manualDetectionActive));
  resetSelection();
  redrawCanvas();
  setStatus(state.manualDetectionActive
    ? "Detecção manual ativada. Clique em dois cantos opostos do bounding box."
    : "Detecção manual desativada.");
});

btnSuspect.addEventListener("click", async () => {
  if (state.activeView !== "xray") return;

  btnSuspect.disabled = true;
  const originalText = btnSuspect.textContent;
  btnSuspect.textContent = "Analisando...";

  try {
    const currentResult = await findPossibleSuspectRegions();
    if (!currentResult) return;

    const fftBoxes = await findFftSuspectRegions({
      yMin: currentResult.lup,
      yMax: currentResult.ldw - 1
    });

    setStatus(
      `${currentResult.boxes.length} BB(s) do algoritmo atual e ` +
      `${fftBoxes.length} BB(s) do algoritmo FFT foram sobrepostos dentro da região R.`
    );
  } catch (error) {
    console.error(error);
    setStatus(`Não foi possível concluir a análise combinada: ${error.message}`);
  } finally {
    btnSuspect.textContent = originalText;
    updateViewButtons();
  }
});

btnDownload.addEventListener("click", downloadEqualizedImage);
btnReport.addEventListener("click", generateCurrentAnalysisReport);

window.addEventListener("keydown", (event) => {
  if (
    event.key === "Escape" &&
    !appScreen.classList.contains("hidden") &&
    document.getElementById("hemdMissingModal")?.hidden
  ) {
    downloadEqualizedImage();
  }
});

window.addEventListener("resize", redrawCanvas);

initializeEffectsUI();
updateViewButtons();
restoreLoginState();
