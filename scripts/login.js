import { LOCAL_PASSWORD, SESSION_KEY } from "./config.js";
import {
  loginScreen,
  appScreen,
  passwordInput,
  loginStatus
} from "./dom.js";
import { setStatus } from "./ui.js";

export function unlockApp() {
  sessionStorage.setItem(SESSION_KEY, "true");
  loginScreen.classList.add("hidden");
  appScreen.classList.remove("hidden");

  setStatus("Clique em 'Carregar imagem' para escolher uma imagem local.");
}

export function lockApp() {
  sessionStorage.removeItem(SESSION_KEY);
  appScreen.classList.add("hidden");
  loginScreen.classList.remove("hidden");
  passwordInput.value = "";
  passwordInput.focus();
}

export function checkPassword() {
  if (passwordInput.value === LOCAL_PASSWORD) {
    loginStatus.textContent = "";
    unlockApp();
  } else {
    loginStatus.textContent = "Senha incorreta.";
    passwordInput.select();
  }
}

export function restoreLoginState() {
  if (sessionStorage.getItem(SESSION_KEY) === "true") {
    unlockApp();
  } else {
    passwordInput.focus();
  }
}
