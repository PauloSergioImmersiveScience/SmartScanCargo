export const state = {
  originalImageData: null,
  currentImageData: null,
  hemdImageData: null,
  effectsImageData: null,
  effectsThresholds: [1, 10, 20, 30, 40],
  activeView: "xray",
  selectedPoints: [],
  previewPoint: null,
  restorePoints: [],
  restorePreviewPoint: null,
  lastRestoreBox: null,
  lastBox: null,
  currentDetectorBoxes: [],
  fftDetectorBoxes: [],
  suspectBoxes: [],
  currentFileName: ""
};
