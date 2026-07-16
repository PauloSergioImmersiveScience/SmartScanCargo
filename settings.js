import {
  configModal,
  btnConfig,
  btnConfigClose,
  btnConfigCancel,
  btnConfigApply,
  btnConfigSave,
  btnConfigDefaults,
  configForm,
  configValidation,
  configActiveLabel
} from "./dom.js?v=40";

import {
  DEFAULT_ALGORITHM_CONFIG,
  getAlgorithmConfig,
  applyAlgorithmConfig,
  saveAlgorithmConfig,
  loadSavedAlgorithmConfig
} from "./algorithm_config.js?v=40";

const FIELD_MAP = {
  current: [
    "D", "MORPH_KERNEL_SIZE", "MORPH_ITERATIONS", "ANALYSIS_WIDTH",
    "WINDOW_RATIO", "TOP_N", "N_BINS", "SMOOTH", "GAUSS_K", "GAUSS_SIG",
    "EDGE_PERC", "GROUP_GAP_FACTOR", "W_ENTROPY", "W_COHERENCE", "W_DENSITY"
  ],
  fft: [
    "ANALYSIS_WIDTH", "APPLY_MORPHOLOGY", "MORPH_KERNEL_SIZE",
    "OPEN_ITERATIONS", "CLOSE_ITERATIONS", "BB_AREA_MIN_PERCENT",
    "MAX_COMPONENT_AREA", "BBOX_MARGIN", "BBOX_THICKNESS", "EPS",
    "FFT_WINDOW_SIZE", "FFT_STEP", "HIGH_FREQ_RADIUS",
    "FFT_LOCAL_KERNEL_SIZE", "FFT_ENERGY_ABS_MIN", "FFT_Z_THRESHOLD",
    "FFT_SCORE_THRESHOLD", "REQUIRE_FFT_DETECTOR"
  ]
};

function field(section, name) {
  return configForm.elements[`${section}.${name}`];
}

function isOddInteger(value) {
  return Number.isInteger(value) && value > 0 && value % 2 === 1;
}

function fillForm(config) {
  for (const [section, names] of Object.entries(FIELD_MAP)) {
    for (const name of names) {
      const input = field(section, name);
      if (!input) continue;
      const value = config[section][name];
      if (input.type === "checkbox") input.checked = Boolean(value);
      else input.value = value === null ? "" : String(value);
    }
  }
  updateDependentFields();
  configValidation.textContent = "";
}

function numberValue(section, name, { integer = false, nullable = false } = {}) {
  const input = field(section, name);
  const raw = input.value.trim();
  if (nullable && raw === "") return null;
  const value = Number(raw);
  if (!Number.isFinite(value) || (integer && !Number.isInteger(value))) {
    throw new Error(`${name} possui valor inválido.`);
  }
  return value;
}

function readForm() {
  const config = {
    current: {
      D: numberValue("current", "D"),
      MORPH_KERNEL_SIZE: numberValue("current", "MORPH_KERNEL_SIZE", {integer:true}),
      MORPH_ITERATIONS: numberValue("current", "MORPH_ITERATIONS", {integer:true}),
      ANALYSIS_WIDTH: numberValue("current", "ANALYSIS_WIDTH", {integer:true}),
      WINDOW_RATIO: numberValue("current", "WINDOW_RATIO"),
      TOP_N: numberValue("current", "TOP_N", {integer:true}),
      N_BINS: numberValue("current", "N_BINS", {integer:true}),
      SMOOTH: field("current", "SMOOTH").checked,
      GAUSS_K: numberValue("current", "GAUSS_K", {integer:true}),
      GAUSS_SIG: numberValue("current", "GAUSS_SIG"),
      EDGE_PERC: numberValue("current", "EDGE_PERC"),
      GROUP_GAP_FACTOR: numberValue("current", "GROUP_GAP_FACTOR"),
      W_ENTROPY: numberValue("current", "W_ENTROPY"),
      W_COHERENCE: numberValue("current", "W_COHERENCE"),
      W_DENSITY: numberValue("current", "W_DENSITY")
    },
    fft: {
      ANALYSIS_WIDTH: numberValue("fft", "ANALYSIS_WIDTH", {integer:true}),
      APPLY_MORPHOLOGY: field("fft", "APPLY_MORPHOLOGY").checked,
      MORPH_KERNEL_SIZE: numberValue("fft", "MORPH_KERNEL_SIZE", {integer:true}),
      OPEN_ITERATIONS: numberValue("fft", "OPEN_ITERATIONS", {integer:true}),
      CLOSE_ITERATIONS: numberValue("fft", "CLOSE_ITERATIONS", {integer:true}),
      BB_AREA_MIN_PERCENT: numberValue("fft", "BB_AREA_MIN_PERCENT"),
      MAX_COMPONENT_AREA: numberValue("fft", "MAX_COMPONENT_AREA", {nullable:true}),
      BBOX_MARGIN: numberValue("fft", "BBOX_MARGIN", {integer:true}),
      BBOX_THICKNESS: numberValue("fft", "BBOX_THICKNESS", {integer:true}),
      EPS: numberValue("fft", "EPS"),
      FFT_WINDOW_SIZE: numberValue("fft", "FFT_WINDOW_SIZE", {integer:true}),
      FFT_STEP: numberValue("fft", "FFT_STEP", {integer:true, nullable:true}),
      HIGH_FREQ_RADIUS: numberValue("fft", "HIGH_FREQ_RADIUS"),
      FFT_LOCAL_KERNEL_SIZE: numberValue("fft", "FFT_LOCAL_KERNEL_SIZE", {integer:true}),
      FFT_ENERGY_ABS_MIN: numberValue("fft", "FFT_ENERGY_ABS_MIN"),
      FFT_Z_THRESHOLD: numberValue("fft", "FFT_Z_THRESHOLD"),
      FFT_SCORE_THRESHOLD: numberValue("fft", "FFT_SCORE_THRESHOLD"),
      REQUIRE_FFT_DETECTOR: field("fft", "REQUIRE_FFT_DETECTOR").checked
    }
  };
  validate(config);
  return config;
}

function validate(c) {
  const a = c.current, f = c.fft;
  if (!(a.D > 0 && a.D <= 1)) throw new Error("D deve satisfazer 0 < D ≤ 1.");
  if (!isOddInteger(a.MORPH_KERNEL_SIZE)) throw new Error("MORPH_KERNEL_SIZE do detector atual deve ser ímpar e positivo.");
  if (a.MORPH_ITERATIONS < 0) throw new Error("MORPH_ITERATIONS deve ser ≥ 0.");
  if (a.ANALYSIS_WIDTH < 100) throw new Error("ANALYSIS_WIDTH do detector atual deve ser ≥ 100.");
  if (!(a.WINDOW_RATIO > 0 && a.WINDOW_RATIO <= 1)) throw new Error("WINDOW_RATIO deve estar em (0, 1].");
  if (a.TOP_N < 1 || a.N_BINS < 2) throw new Error("TOP_N deve ser ≥ 1 e N_BINS ≥ 2.");
  if (!isOddInteger(a.GAUSS_K)) throw new Error("GAUSS_K deve ser ímpar e positivo.");
  if (a.GAUSS_SIG <= 0) throw new Error("GAUSS_SIG deve ser > 0.");
  if (!(a.EDGE_PERC >= 0 && a.EDGE_PERC <= 100)) throw new Error("EDGE_PERC deve estar entre 0 e 100.");
  if (a.GROUP_GAP_FACTOR < 0) throw new Error("GROUP_GAP_FACTOR deve ser ≥ 0.");
  if ([a.W_ENTROPY, a.W_COHERENCE, a.W_DENSITY].every(v => v === 0)) {
    throw new Error("Os três pesos do score não podem ser simultaneamente zero.");
  }

  if (f.ANALYSIS_WIDTH < 100) throw new Error("ANALYSIS_WIDTH da FFT deve ser ≥ 100.");
  if (!isOddInteger(f.MORPH_KERNEL_SIZE)) throw new Error("MORPH_KERNEL_SIZE da FFT deve ser ímpar e positivo.");
  if (f.OPEN_ITERATIONS < 0 || f.CLOSE_ITERATIONS < 0) throw new Error("Iterações morfológicas devem ser ≥ 0.");
  if (!(f.BB_AREA_MIN_PERCENT >= 0 && f.BB_AREA_MIN_PERCENT <= 100)) throw new Error("BB_AREA_MIN_PERCENT deve estar entre 0 e 100.");
  if (f.MAX_COMPONENT_AREA !== null && f.MAX_COMPONENT_AREA <= 0) throw new Error("MAX_COMPONENT_AREA deve ser vazio ou > 0.");
  if (f.BBOX_MARGIN < 0 || f.BBOX_THICKNESS <= 0) throw new Error("Margem deve ser ≥ 0 e espessura > 0.");
  if (f.EPS <= 0) throw new Error("EPS deve ser > 0.");
  if (!isOddInteger(f.FFT_WINDOW_SIZE) || f.FFT_WINDOW_SIZE <= 1) throw new Error("FFT_WINDOW_SIZE deve ser ímpar e > 1.");
  if (f.FFT_STEP !== null && f.FFT_STEP <= 0) throw new Error("FFT_STEP deve ser vazio ou > 0.");
  if (!(f.HIGH_FREQ_RADIUS > 0 && f.HIGH_FREQ_RADIUS < 1)) throw new Error("HIGH_FREQ_RADIUS deve estar em (0, 1).");
  if (!isOddInteger(f.FFT_LOCAL_KERNEL_SIZE)) throw new Error("FFT_LOCAL_KERNEL_SIZE deve ser ímpar e positivo.");
  if (f.FFT_ENERGY_ABS_MIN < 0 || f.FFT_Z_THRESHOLD <= 0 || f.FFT_SCORE_THRESHOLD < 0) {
    throw new Error("Os limiares FFT possuem valores inválidos.");
  }
}

function updateDependentFields() {
  field("fft", "MORPH_KERNEL_SIZE").disabled = !field("fft", "APPLY_MORPHOLOGY").checked;
  field("fft", "OPEN_ITERATIONS").disabled = !field("fft", "APPLY_MORPHOLOGY").checked;
  field("fft", "CLOSE_ITERATIONS").disabled = !field("fft", "APPLY_MORPHOLOGY").checked;
}

function openModal() {
  fillForm(getAlgorithmConfig());
  configModal.hidden = false;
  document.body.classList.add("modal-open");
  field("current", "D").focus();
}

function closeModal() {
  configModal.hidden = true;
  document.body.classList.remove("modal-open");
  btnConfig.focus();
}

function execute(action) {
  try {
    const config = readForm();
    action(config);
    configActiveLabel.textContent = action === saveAlgorithmConfig
      ? "Configuração ativa: personalizada — salva localmente"
      : "Configuração ativa: personalizada — sessão atual";
    closeModal();
  } catch (error) {
    configValidation.textContent = error.message;
  }
}

const loaded = loadSavedAlgorithmConfig();
configActiveLabel.textContent = loaded
  ? "Configuração ativa: personalizada — salva localmente"
  : "Configuração ativa: padrão";

btnConfig.addEventListener("click", openModal);
btnConfigClose.addEventListener("click", closeModal);
btnConfigCancel.addEventListener("click", closeModal);
btnConfigApply.addEventListener("click", () => execute(applyAlgorithmConfig));
btnConfigSave.addEventListener("click", () => execute(saveAlgorithmConfig));
btnConfigDefaults.addEventListener("click", () => {
  fillForm(DEFAULT_ALGORITHM_CONFIG);
  configValidation.textContent = "Valores padrão carregados no formulário. Clique em Aplicar ou Salvar configuração.";
});
field("fft", "APPLY_MORPHOLOGY").addEventListener("change", updateDependentFields);

configModal.addEventListener("click", event => {
  if (event.target.matches("[data-close-config-modal]")) closeModal();
});
window.addEventListener("keydown", event => {
  if (event.key === "Escape" && !configModal.hidden) {
    event.preventDefault();
    event.stopImmediatePropagation();
    closeModal();
  }
}, true);
