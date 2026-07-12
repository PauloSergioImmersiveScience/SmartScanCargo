import { pointsCountText, statusText } from "./dom.js";
import { state } from "./state.js";

export function setStatus(message) {
  statusText.textContent = message;
}

export function resetSelection() {
  state.selectedPoints = [];
  state.previewPoint = null;
  pointsCountText.textContent = "0";
}
