// ==========================================================
// SmartScanCargo - Equalização Histogrâmica Local no Navegador
// ==========================================================
// Senha local simples. Atenção: isso não é segurança forte.
// Em GitHub Pages, qualquer pessoa pode abrir o DevTools e ver essa senha.
// Use apenas para uma barreira simples de acesso.
const LOCAL_PASSWORD = "SmartScanCargo";

// Imagem padrão. Coloque esse arquivo em SmartScanCargo/imagens/ no GitHub.
const DEFAULT_IMAGE_PATH = "imagens/xray-despadronizado.png";

const loginScreen = document.getElementById("loginScreen");
const appScreen = document.getElementById("appScreen");
const passwordInput = document.getElementById("passwordInput");
const btnLogin = document.getElementById("btnLogin");
const btnLogout = document.getElementById("btnLogout");
const loginStatus = document.getElementById("loginStatus");

const imageLoader = document.getElementById("imageLoader");
const imageCanvas = document.getElementById("imageCanvas");
const canvasWrapper = document.getElementById("canvasWrapper");
const ctx = imageCanvas.getContext("2d", { willReadFrequently: true });

const imageNameText = document.getElementById("imageName");
const pointsCountText = document.getElementById("pointsCount");
const bboxInfoText = document.getElementById("bboxInfo");
const statusText = document.getElementById("statusText");
const btnRestore = document.getElementById("btnRestore");
const btnDownload = document.getElementById("btnDownload");

let originalImageData = null;
let currentImageData = null;
let selectedPoints = [];
let previewPoint = null;
let lastBox = null;
let currentFileName = "xray-despadronizado.png";

// ==========================================================
// Login local
// ==========================================================
function unlockApp() {
  sessionStorage.setItem("smartScanCargoUnlocked", "true");
  loginScreen.classList.add("hidden");
  appScreen.classList.remove("hidden");
  loadDefaultImage();
}

function lockApp() {
  sessionStorage.removeItem("smartScanCargoUnlocked");
  appScreen.classList.add("hidden");
  loginScreen.classList.remove("hidden");
  passwordInput.value = "";
  passwordInput.focus();
}

function checkPassword() {
  if (passwordInput.value === LOCAL_PASSWORD) {
    loginStatus.textContent = "";
    unlockApp();
  } else {
    loginStatus.textContent = "Senha incorreta.";
    passwordInput.select();
  }
}

btnLogin.addEventListener("click", checkPassword);
passwordInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") checkPassword();
});
btnLogout.addEventListener("click", lockApp);

// ==========================================================
// Carregamento de imagem
// ==========================================================
function setStatus(message) {
  statusText.textContent = message;
}

function resetSelection() {
  selectedPoints = [];
  previewPoint = null;
  pointsCountText.textContent = "0";
}

function loadImageFromSource(src, fileName) {
  const img = new Image();

  img.onload = function () {
    imageCanvas.width = img.naturalWidth;
    imageCanvas.height = img.naturalHeight;

    ctx.drawImage(img, 0, 0);

    originalImageData = ctx.getImageData(0, 0, imageCanvas.width, imageCanvas.height);
    currentImageData = new ImageData(
      new Uint8ClampedArray(originalImageData.data),
      originalImageData.width,
      originalImageData.height
    );

    currentFileName = fileName;
    imageNameText.textContent = fileName;
    bboxInfoText.textContent = "nenhum";
    lastBox = null;
    resetSelection();
    redrawCanvas();

    setStatus(`Imagem carregada: ${fileName} (${imageCanvas.width} x ${imageCanvas.height}).`);
  };

  img.onerror = function () {
    setStatus("Não foi possível carregar a imagem padrão. Use o botão 'Carregar imagem'.");
  };

  img.src = src;
}

function loadDefaultImage() {
  if (originalImageData !== null) return;
  loadImageFromSource(DEFAULT_IMAGE_PATH, DEFAULT_IMAGE_PATH);
}

imageLoader.addEventListener("change", function (event) {
  const file = event.target.files[0];
  if (!file) return;

  const objectURL = URL.createObjectURL(file);
  loadImageFromSource(objectURL, file.name);
});

// ==========================================================
// Conversão de coordenadas tela -> pixel da imagem
// ==========================================================
function getCanvasPoint(event) {
  const rect = imageCanvas.getBoundingClientRect();
  const xScreen = event.clientX - rect.left;
  const yScreen = event.clientY - rect.top;

  if (xScreen < 0 || yScreen < 0 || xScreen > rect.width || yScreen > rect.height) {
    return null;
  }

  const scaleX = imageCanvas.width / rect.width;
  const scaleY = imageCanvas.height / rect.height;

  return {
    x: Math.round(xScreen * scaleX),
    y: Math.round(yScreen * scaleY)
  };
}

// ==========================================================
// Equalização histogrâmica local dentro do bounding box
// ==========================================================
function rgbToGray(r, g, b) {
  return Math.round(0.299 * r + 0.587 * g + 0.114 * b);
}

function clampBox(p1, p2) {
  const xMin = Math.max(0, Math.min(p1.x, p2.x));
  const xMax = Math.min(imageCanvas.width - 1, Math.max(p1.x, p2.x));
  const yMin = Math.max(0, Math.min(p1.y, p2.y));
  const yMax = Math.min(imageCanvas.height - 1, Math.max(p1.y, p2.y));

  return { xMin, xMax, yMin, yMax, width: xMax - xMin + 1, height: yMax - yMin + 1 };
}

function equalizeBoundingBox(p1, p2) {
  if (!currentImageData) return;

  const box = clampBox(p1, p2);

  if (box.width <= 1 || box.height <= 1) {
    setStatus("Bounding box inválido: selecione dois pontos diferentes.");
    return;
  }

  const data = currentImageData.data;
  const imageWidth = currentImageData.width;
  const hist = new Array(256).fill(0);

  // Histograma da ROI em tons de cinza.
  for (let y = box.yMin; y <= box.yMax; y++) {
    for (let x = box.xMin; x <= box.xMax; x++) {
      const idx = (y * imageWidth + x) * 4;
      const gray = rgbToGray(data[idx], data[idx + 1], data[idx + 2]);
      hist[gray]++;
    }
  }

  // CDF: função de distribuição acumulada.
  const cdf = new Array(256).fill(0);
  cdf[0] = hist[0];
  for (let i = 1; i < 256; i++) cdf[i] = cdf[i - 1] + hist[i];

  const total = box.width * box.height;
  const cdfMin = cdf.find((value) => value > 0) || 0;
  const denom = total - cdfMin;

  if (denom <= 0) {
    setStatus("A região selecionada tem intensidade praticamente constante. Nada foi equalizado.");
    return;
  }

  // LUT da equalização: equivalente ao equalizeHist para a ROI.
  const lut = new Array(256).fill(0);
  for (let i = 0; i < 256; i++) {
    lut[i] = Math.max(0, Math.min(255, Math.round(((cdf[i] - cdfMin) / denom) * 255)));
  }

  // Aplica a equalização apenas na ROI. Como a imagem de raio-X é grayscale,
  // gravamos o mesmo valor nos canais R, G e B.
  for (let y = box.yMin; y <= box.yMax; y++) {
    for (let x = box.xMin; x <= box.xMax; x++) {
      const idx = (y * imageWidth + x) * 4;
      const gray = rgbToGray(data[idx], data[idx + 1], data[idx + 2]);
      const eq = lut[gray];
      data[idx] = eq;
      data[idx + 1] = eq;
      data[idx + 2] = eq;
      data[idx + 3] = 255;
    }
  }

  lastBox = box;
  bboxInfoText.textContent = `x=[${box.xMin}, ${box.xMax}], y=[${box.yMin}, ${box.yMax}], ${box.width} x ${box.height}`;
  setStatus(`Equalização aplicada na região: p1=(${p1.x}, ${p1.y}), p2=(${p2.x}, ${p2.y}).`);
}

// ==========================================================
// Desenho do canvas e overlays de visualização
// ==========================================================
function redrawCanvas() {
  if (!currentImageData) return;

  ctx.putImageData(currentImageData, 0, 0);

  // Desenha o último bounding box apenas para visualização.
  // O retângulo NÃO entra no arquivo baixado, pois o download usa currentImageData.
  if (lastBox) {
    ctx.save();
    ctx.strokeStyle = "red";
    ctx.lineWidth = Math.max(2, Math.round(imageCanvas.width / 700));
    ctx.strokeRect(lastBox.xMin, lastBox.yMin, lastBox.width, lastBox.height);
    ctx.restore();
  }

  // Desenha o primeiro ponto selecionado.
  if (previewPoint) {
    ctx.save();
    ctx.fillStyle = "red";
    ctx.strokeStyle = "white";
    ctx.lineWidth = Math.max(1, Math.round(imageCanvas.width / 1200));
    ctx.beginPath();
    ctx.arc(previewPoint.x, previewPoint.y, Math.max(4, Math.round(imageCanvas.width / 300)), 0, 2 * Math.PI);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
}

imageCanvas.addEventListener("click", function (event) {
  const point = getCanvasPoint(event);
  if (!point || !currentImageData) return;

  selectedPoints.push(point);
  pointsCountText.textContent = String(selectedPoints.length);

  if (selectedPoints.length === 1) {
    previewPoint = point;
    setStatus(`Ponto p1 selecionado: (${point.x}, ${point.y}). Agora clique no ponto p2.`);
    redrawCanvas();
    return;
  }

  if (selectedPoints.length === 2) {
    const p1 = selectedPoints[0];
    const p2 = selectedPoints[1];
    previewPoint = null;
    equalizeBoundingBox(p1, p2);
    resetSelection();
    redrawCanvas();
  }
});

imageCanvas.addEventListener("contextmenu", function (event) {
  event.preventDefault();
  restoreOriginalImage();
});

// ==========================================================
// Botões e atalhos
// ==========================================================
function restoreOriginalImage() {
  if (!originalImageData) return;

  currentImageData = new ImageData(
    new Uint8ClampedArray(originalImageData.data),
    originalImageData.width,
    originalImageData.height
  );

  lastBox = null;
  bboxInfoText.textContent = "nenhum";
  resetSelection();
  redrawCanvas();
  setStatus("Imagem original restaurada.");
}

function downloadEqualizedImage() {
  if (!currentImageData) return;

  const exportCanvas = document.createElement("canvas");
  exportCanvas.width = imageCanvas.width;
  exportCanvas.height = imageCanvas.height;
  const exportCtx = exportCanvas.getContext("2d");
  exportCtx.putImageData(currentImageData, 0, 0);

  const baseName = currentFileName.replace(/\.[^/.]+$/, "");
  const link = document.createElement("a");
  link.download = `${baseName}_equalizada_local.png`;
  link.href = exportCanvas.toDataURL("image/png");
  link.click();

  setStatus(`Download gerado: ${link.download}`);
}

btnRestore.addEventListener("click", restoreOriginalImage);
btnDownload.addEventListener("click", downloadEqualizedImage);

window.addEventListener("keydown", function (event) {
  if (event.key === "Escape" && !appScreen.classList.contains("hidden")) {
    downloadEqualizedImage();
  }
});

window.addEventListener("resize", redrawCanvas);

// Mantém login ativo na aba atual.
if (sessionStorage.getItem("smartScanCargoUnlocked") === "true") {
  unlockApp();
} else {
  passwordInput.focus();
}
