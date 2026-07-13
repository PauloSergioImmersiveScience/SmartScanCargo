import { pointsCountText, statusText } from "./dom.js";
import { state } from "./state.js";

export function setStatus(message) {
  statusText.textContent = message;
}

export function resetLeftSelection() {
  state.selectedPoints = [];
  state.previewPoint = null;
  pointsCountText.textContent = "0";
}

export function resetRestoreSelection() {
  state.restorePoints = [];
  state.restorePreviewPoint = null;
}

export function resetSelection() {
  resetLeftSelection();
  resetRestoreSelection();
}
