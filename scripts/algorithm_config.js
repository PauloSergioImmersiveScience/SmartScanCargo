const STORAGE_KEY = "smartScanCargoAlgorithmConfig";

export const DEFAULT_ALGORITHM_CONFIG = Object.freeze({
  current: {
    D: 0.60,
    MORPH_KERNEL_SIZE: 3,
    MORPH_ITERATIONS: 10,
    ANALYSIS_WIDTH: 1200,
    WINDOW_RATIO: 450 / 4728,
    TOP_N: 8,
    N_BINS: 18,
    SMOOTH: true,
    GAUSS_K: 5,
    GAUSS_SIG: 1.0,
    EDGE_PERC: 75,
    GROUP_GAP_FACTOR: 1.0,
    W_ENTROPY: 1.0,
    W_COHERENCE: 1.0,
    W_DENSITY: 1.0
  },
  fft: {
    ANALYSIS_WIDTH: 600,
    APPLY_MORPHOLOGY: true,
    MORPH_KERNEL_SIZE: 3,
    OPEN_ITERATIONS: 0,
    CLOSE_ITERATIONS: 2,
    BB_AREA_MIN_PERCENT: 0.01,
    MAX_COMPONENT_AREA: null,
    BBOX_MARGIN: 20,
    BBOX_THICKNESS: 3,
    EPS: 1e-6,
    FFT_WINDOW_SIZE: 31,
    FFT_STEP: null,
    HIGH_FREQ_RADIUS: 0.25,
    FFT_LOCAL_KERNEL_SIZE: 31,
    FFT_ENERGY_ABS_MIN: 0.30,
    FFT_Z_THRESHOLD: 0.80,
    FFT_SCORE_THRESHOLD: 0.05,
    REQUIRE_FFT_DETECTOR: true
  }
});

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

let activeConfig = clone(DEFAULT_ALGORITHM_CONFIG);

export function getAlgorithmConfig() {
  return activeConfig;
}

export function applyAlgorithmConfig(config) {
  activeConfig = clone(config);
  window.dispatchEvent(new CustomEvent("smartscan-config-changed", {
    detail: clone(activeConfig)
  }));
}

export function restoreDefaultAlgorithmConfig() {
  applyAlgorithmConfig(DEFAULT_ALGORITHM_CONFIG);
}

export function saveAlgorithmConfig(config) {
  applyAlgorithmConfig(config);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(activeConfig));
}

export function loadSavedAlgorithmConfig() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    activeConfig = {
      current: { ...clone(DEFAULT_ALGORITHM_CONFIG.current), ...(parsed.current || {}) },
      fft: { ...clone(DEFAULT_ALGORITHM_CONFIG.fft), ...(parsed.fft || {}) }
    };
    return true;
  } catch (error) {
    console.warn("Configuração salva inválida:", error);
    localStorage.removeItem(STORAGE_KEY);
    activeConfig = clone(DEFAULT_ALGORITHM_CONFIG);
    return false;
  }
}
