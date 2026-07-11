import {
  appScreen,
  passwordInput,
  btnLogin,
  btnLogout,
  imageLoader,
  imageCanvas,
  pointsCountText,
  btnRestore,
  btnDownload
} from "./scripts/dom.js";

import { state } from "./scripts/state.js";
import { setStatus, resetSelection } from "./scripts/ui.js";
import {
  getCanvasPoint,
  loadImageFromSource,
  redrawCanvas,
  restoreOriginalImage,
  downloadEqualizedImage
} from "./scripts/imagem.js";
import { equalizeBoundingBox } from "./scripts/equalizacao.js";
import {
  checkPassword,
  lockApp,
  restoreLoginState
} from "./scripts/login.js";

btnLogin.addEventListener("click", checkPassword);

passwordInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    checkPassword();
  }
});

btnLogout.addEventListener("click", lockApp);

imageLoader.addEventListener("change", (event) => {
  const file = event.target.files[0];
  if (!file) return;

  const objectURL = URL.createObjectURL(file);
  loadImageFromSource(objectURL, file.name);
});

imageCanvas.addEventListener("click", (event) => {
  const point = getCanvasPoint(event);
  if (!point || !state.currentImageData) return;

  state.selectedPoints.push(point);
  pointsCountText.textContent = String(state.selectedPoints.length);

  if (state.selectedPoints.length === 1) {
    state.previewPoint = point;
    setStatus(
      `Ponto p1 selecionado: (${point.x}, ${point.y}). ` +
      "Agora clique no ponto p2."
    );
    redrawCanvas();
    return;
  }

  if (state.selectedPoints.length === 2) {
    const p1 = state.selectedPoints[0];
    const p2 = state.selectedPoints[1];

    state.previewPoint = null;
    equalizeBoundingBox(p1, p2);
    resetSelection();
    redrawCanvas();
  }
});

imageCanvas.addEventListener("contextmenu", (event) => {
  event.preventDefault();
  restoreOriginalImage();
});

btnRestore.addEventListener("click", restoreOriginalImage);
btnDownload.addEventListener("click", downloadEqualizedImage);

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !appScreen.classList.contains("hidden")) {
    downloadEqualizedImage();
  }
});

window.addEventListener("resize", redrawCanvas);

restoreLoginState();
