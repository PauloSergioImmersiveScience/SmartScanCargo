import {
  appScreen,
  passwordInput,
  btnLogin,
  btnLogout,
  imageLoader,
  hemdLoader,
  exampleImageSelect,
  btnLoadExample,
  imageCanvas,
  pointsCountText,
  btnRestore,
  btnDownload,
  btnSuspect,
  btnShowHemd,
  btnShowXray
} from "./scripts/dom.js";

import { state } from "./scripts/state.js";
import { setStatus, resetSelection } from "./scripts/ui.js";
import {
  getCanvasPoint,
  loadImagePairFromSources,
  loadXrayOnlyFromSource,
  redrawCanvas,
  restoreOriginalImage,
  downloadEqualizedImage,
  showImageView,
  updateViewButtons
} from "./scripts/imagem.js";
import { equalizeBoundingBox } from "./scripts/equalizacao.js";
import { findPossibleSuspectRegions } from "./scripts/detector.js?v=6";
import { findFftSuspectRegions } from "./scripts/fft_detector.js?v=2";
import { EXAMPLE_IMAGES, EXAMPLE_IMAGES_DIRECTORY } from "./scripts/examples.js?v=2";
import { checkPassword, lockApp, restoreLoginState } from "./scripts/login.js";

btnLogin.addEventListener("click", checkPassword);
passwordInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") checkPassword();
});
btnLogout.addEventListener("click", lockApp);

function extractIndex(fileName, prefix) {
  const match = fileName.match(new RegExp(`^${prefix}(\\d+)\\.[^.]+$`, "i"));
  return match ? match[1] : null;
}

function getSelectedDirectory(file) {
  const relativePath = file.webkitRelativePath || "";
  const separatorIndex = relativePath.lastIndexOf("/");
  return separatorIndex >= 0 ? relativePath.slice(0, separatorIndex) : "";
}

function filesAreInSameDirectory(fileA, fileB) {
  return getSelectedDirectory(fileA) === getSelectedDirectory(fileB);
}

function setLocalDisplay(text) {
  const display = document.getElementById("localFileDisplay");
  if (display) display.textContent = text;
}

function resetExampleSelection() {
  exampleImageSelect.value = "";
  btnLoadExample.disabled = true;
}

EXAMPLE_IMAGES.forEach((example) => {
  const option = document.createElement("option");
  option.value = String(example.index);
  option.textContent = example.label;
  exampleImageSelect.appendChild(option);
});

exampleImageSelect.addEventListener("change", () => {
  btnLoadExample.disabled = !exampleImageSelect.value;
});

btnLoadExample.addEventListener("click", async () => {
  const example = EXAMPLE_IMAGES.find(
    (item) => String(item.index) === exampleImageSelect.value
  );

  if (!example) {
    setStatus("Selecione uma imagem exemplo antes de carregar.");
    return;
  }

  imageLoader.value = "";
  hemdLoader.value = "";
  setLocalDisplay("Selecione uma imagem");

  const xrayURL = `${EXAMPLE_IMAGES_DIRECTORY}${encodeURIComponent(example.xray)}`;
  const hemdURL = `${EXAMPLE_IMAGES_DIRECTORY}${encodeURIComponent(example.hemd)}`;
  await loadImagePairFromSources(xrayURL, hemdURL, example.xray, example.hemd);
});
btnLoadExample.disabled = true;


async function loadLocalPair(xrayFile, hemdFile) {
  const xrayURL = URL.createObjectURL(xrayFile);
  const hemdURL = URL.createObjectURL(hemdFile);
  try {
    await loadImagePairFromSources(xrayURL, hemdURL, xrayFile.name, hemdFile.name);
  } finally {
    URL.revokeObjectURL(xrayURL);
    URL.revokeObjectURL(hemdURL);
  }
}

imageLoader.addEventListener("change", async (event) => {
  const files = Array.from(event.target.files || []);
  if (files.length === 0) {
    setLocalDisplay("Selecione uma imagem");
    return;
  }

  const xrayFile = files.find((file) => extractIndex(file.name, "xray"));
  if (!xrayFile) {
    setStatus("Selecione uma imagem com nome no formato xray{i}.png.");
    imageLoader.value = "";
    return;
  }

  const index = extractIndex(xrayFile.name, "xray");
  const expectedHemdName = `hemd${index}.png`;
  const hemdFile = files.find(
    (file) =>
      file.name.toLowerCase() === expectedHemdName.toLowerCase() &&
      filesAreInSameDirectory(xrayFile, file)
  );

  setLocalDisplay(xrayFile.name);
  resetExampleSelection();

  if (hemdFile) {
    await loadLocalPair(xrayFile, hemdFile);
    return;
  }

  // Para arquivos locais, a HEMD correspondente só é aceita quando foi
  // selecionada no mesmo diretório da X-RAY. O navegador não pode acessar
  // silenciosamente outros arquivos da pasta sem que o usuário os selecione.
  const xrayURL = URL.createObjectURL(xrayFile);
  try {
    await loadXrayOnlyFromSource(xrayURL, xrayFile.name);
  } finally {
    URL.revokeObjectURL(xrayURL);
  }
});

btnShowHemd.addEventListener("click", () => showImageView("hemd"));
btnShowXray.addEventListener("click", () => showImageView("xray"));

imageCanvas.addEventListener("click", (event) => {
  if (state.activeView !== "xray") return;
  const point = getCanvasPoint(event);
  if (!point || !state.currentImageData) return;

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
  if (state.activeView === "xray") restoreOriginalImage();
});

btnRestore.addEventListener("click", restoreOriginalImage);

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
window.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !appScreen.classList.contains("hidden")) {
    downloadEqualizedImage();
  }
});
window.addEventListener("resize", redrawCanvas);

updateViewButtons();
restoreLoginState();
