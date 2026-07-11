// ==========================================================
// SmartScanCargo - Módulo principal
//
// Responsabilidades deste arquivo:
//   1. Importar os elementos HTML e as funções dos módulos.
//   2. Registrar os eventos de login, carregamento e interação.
//   3. Controlar a seleção dos dois pontos do bounding box.
//   4. Solicitar a equalização local da região selecionada.
// ==========================================================

// Importa as referências dos elementos da página definidos em dom.js.
import {
  appScreen,       // Área principal do sistema, exibida após o login.
  passwordInput,   // Campo no qual o usuário digita a senha.
  btnLogin,        // Botão usado para entrar no sistema.
  btnLogout,       // Botão usado para sair do sistema.
  imageLoader,     // Campo usado para selecionar uma imagem do computador.
  imageCanvas,     // Canvas no qual a imagem é exibida e manipulada.
  pointsCountText, // Elemento que mostra quantos pontos foram selecionados.
  btnRestore,      // Botão que restaura a imagem original.
  btnDownload      // Botão que baixa a imagem equalizada.
} from "./scripts/dom.js";

// Importa o objeto que armazena o estado atual da aplicação.
import { state } from "./scripts/state.js";

// Importa funções auxiliares de interface.
import {
  setStatus,      // Exibe uma mensagem de status para o usuário.
  resetSelection // Limpa os pontos selecionados anteriormente.
} from "./scripts/ui.js";

// Importa as funções relacionadas à imagem e ao canvas.
import {
  getCanvasPoint,        // Converte a posição do clique em coordenadas da imagem.
  loadImageFromSource,   // Carrega no canvas a imagem escolhida pelo usuário.
  redrawCanvas,          // Redesenha a imagem e os elementos visuais do canvas.
  restoreOriginalImage,  // Restaura a imagem para seu estado original.
  downloadEqualizedImage // Gera o download da imagem equalizada.
} from "./scripts/imagem.js";

// Importa a função que aplica a equalização local no bounding box.
import { equalizeBoundingBox } from "./scripts/equalizacao.js";

// Importa as funções responsáveis pelo controle de acesso.
import {
  checkPassword,    // Verifica se a senha digitada está correta.
  lockApp,          // Encerra a sessão e retorna à tela de login.
  restoreLoginState // Recupera o estado de login da aba atual.
} from "./scripts/login.js";

// ==========================================================
// Eventos de login e logout
// ==========================================================

// Ao clicar em "Entrar", verifica a senha digitada.
btnLogin.addEventListener("click", checkPassword);

// Permite confirmar a senha pressionando a tecla Enter.
passwordInput.addEventListener("keydown", (event) => {
  // Verifica se a tecla pressionada foi Enter.
  if (event.key === "Enter") {
    // Executa a mesma verificação usada pelo botão de login.
    checkPassword();
  }
});

// Ao clicar em "Sair", bloqueia novamente o sistema.
btnLogout.addEventListener("click", lockApp);

// ==========================================================
// Evento de carregamento da imagem
// ==========================================================

// Executa quando o usuário escolhe um arquivo no botão "Carregar imagem".
imageLoader.addEventListener("change", (event) => {
  // Obtém o primeiro arquivo selecionado pelo usuário.
  const file = event.target.files[0];

  // Interrompe a função caso nenhum arquivo tenha sido selecionado.
  if (!file) return;

  // Cria um endereço temporário para o navegador acessar o arquivo local.
  const objectURL = URL.createObjectURL(file);

  // Envia o endereço temporário e o nome do arquivo para o módulo de imagem.
  loadImageFromSource(objectURL, file.name);
});

// ==========================================================
// Evento de clique esquerdo no canvas
// ==========================================================

// Executa sempre que o usuário clica com o botão esquerdo na imagem.
imageCanvas.addEventListener("click", (event) => {
  // Converte a posição do clique na tela para coordenadas da imagem.
  const point = getCanvasPoint(event);

  // Ignora o clique se ele for inválido ou se nenhuma imagem estiver carregada.
  if (!point || !state.currentImageData) return;

  // Armazena o ponto selecionado no estado da aplicação.
  state.selectedPoints.push(point);

  // Atualiza na interface a quantidade de pontos selecionados.
  pointsCountText.textContent = String(state.selectedPoints.length);

  // Trata o primeiro clique da seleção.
  if (state.selectedPoints.length === 1) {
    // Guarda o primeiro ponto para que ele possa ser desenhado no canvas.
    state.previewPoint = point;

    // Informa ao usuário as coordenadas do primeiro ponto.
    setStatus(
      `Ponto p1 selecionado: (${point.x}, ${point.y}). ` +
      "Agora clique no ponto p2."
    );

    // Redesenha o canvas para mostrar visualmente o primeiro ponto.
    redrawCanvas();

    // Encerra esta execução e aguarda o segundo clique.
    return;
  }

  // Trata o segundo clique da seleção.
  if (state.selectedPoints.length === 2) {
    // Recupera o primeiro ponto armazenado.
    const p1 = state.selectedPoints[0];

    // Recupera o segundo ponto armazenado.
    const p2 = state.selectedPoints[1];

    // Remove a marca temporária do primeiro ponto.
    state.previewPoint = null;

    // Aplica a equalização apenas na região delimitada por p1 e p2.
    equalizeBoundingBox(p1, p2);

    // Limpa os pontos para permitir uma nova seleção.
    resetSelection();

    // Redesenha o canvas com a imagem equalizada e o bounding box.
    redrawCanvas();
  }
});

// ==========================================================
// Evento de clique direito no canvas
// ==========================================================

// Executa quando o usuário clica com o botão direito sobre a imagem.
imageCanvas.addEventListener("contextmenu", (event) => {
  // Impede que o menu de contexto padrão do navegador seja aberto.
  event.preventDefault();

  // Restaura a imagem original.
  restoreOriginalImage();
});

// ==========================================================
// Eventos dos botões de restauração e download
// ==========================================================

// Restaura a imagem original ao clicar no botão correspondente.
btnRestore.addEventListener("click", restoreOriginalImage);

// Baixa a imagem equalizada ao clicar no botão correspondente.
btnDownload.addEventListener("click", downloadEqualizedImage);

// ==========================================================
// Atalhos e eventos globais da janela
// ==========================================================

// Monitora as teclas pressionadas enquanto a página está aberta.
window.addEventListener("keydown", (event) => {
  // Verifica se ESC foi pressionado e se a aplicação está visível.
  if (event.key === "Escape" && !appScreen.classList.contains("hidden")) {
    // Gera o download da imagem equalizada atual.
    downloadEqualizedImage();
  }
});

// Redesenha o canvas quando o tamanho da janela do navegador muda.
window.addEventListener("resize", redrawCanvas);

// ==========================================================
// Inicialização do sistema
// ==========================================================

// Recupera o estado de login salvo na aba atual do navegador.
restoreLoginState();
