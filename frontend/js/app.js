// ============================================================================
// app.js — inicialização, sessão e roteamento
//
// SPA por hash (#/lista, #/orcamento…), como o Nosso Plano: funciona em
// qualquer hospedagem estática sem configurar reescrita de URL na Vercel.
//
// O caminho até a lista tem três portas, nesta ordem, e cada uma tem a sua tela:
//   1. sem sessão                         → Login
//   2. com sessão, fora de membros_casal  → "Acesso não liberado" (com Sair)
//      com sessão, mas a conferência falhou (rede, API) → erro com "Tentar de
//      novo"; falha de conferência NUNCA vira "acesso não liberado" nem lista
//   3. membro do casal                    → as quatro abas
// ============================================================================

import { configurado } from "./config.js";
import { auth, consultas } from "./api.js";
import { esc, htmlErro } from "./ui.js";
import { iniciarConexao, aoMudarConexao, aoMudarLista, htmlSelo } from "./conexao.js";
import { aplicarTelaAcesa } from "./tela-acesa.js";

import { telaLogin } from "./telas/login.js";
import { telaAcessoNegado, telaFalhaNaConferencia } from "./telas/acesso.js";
import { telaLista } from "./telas/lista.js";
import { telaOrcamento } from "./telas/orcamento.js";
import { telaHistorico } from "./telas/historico.js";
import { telaAjustes } from "./telas/ajustes.js";

const ROTAS = {
  lista:     { titulo: "Compras",   render: telaLista },
  orcamento: { titulo: "Orçamento", render: telaOrcamento },
  historico: { titulo: "Histórico", render: telaHistorico },
  ajustes:   { titulo: "Ajustes",   render: telaAjustes },
};

const el = {
  cabecalho: document.getElementById("cabecalho"),
  topo:      document.getElementById("topo-tela"),
  tela:      document.getElementById("tela"),
  abas:      document.getElementById("abas"),
};

/** Quem entrou, a linha dele em membros_casal e os dois do casal. */
export const estado = { usuario: null, membro: null, membros: [] };

// ---------------------------------------------------------------------------
// Roteamento
// ---------------------------------------------------------------------------
function rotaAtual() {
  const nome = (location.hash || "#/lista").replace(/^#\//, "").split("/")[0];
  return ROTAS[nome] ? nome : "lista";
}

/** Aponta a URL para a rota sem disparar `hashchange` (o boot desenha logo em seguida). */
function fixarRota(rota) {
  history.replaceState(null, "", `#/${rota}`);
}

// Cada desenho ganha um número. Uma leitura que responder depois de outro
// desenho ter começado pertence a uma tela que já saiu, e não pode escrever
// na tela atual: as telas checam `vivo()` antes de cada escrita.
let geracao = 0;

/**
 * Desenha a rota atual.
 * `silencioso`: redesenho por causa de dado novo (Realtime, presença, depois
 * de gravar). Não mostra o carregando, não rola para o topo, e a Lista mantém a
 * busca e o foco no campo.
 */
async function desenhar({ silencioso = false } = {}) {
  const minha = ++geracao;
  const nome = rotaAtual();
  const rota = ROTAS[nome];

  for (const item of el.abas.querySelectorAll(".abas__item")) {
    if (item.dataset.rota === nome) item.setAttribute("aria-current", "page");
    else item.removeAttribute("aria-current");
  }

  if (!silencioso) {
    // Cabeçalho mínimo já com o título certo: se a leitura falhar, o erro
    // aparece debaixo do nome da tela certa, não do da anterior.
    el.cabecalho.innerHTML = `<div><h1 class="cabecalho__titulo">${esc(rota.titulo)}</h1></div>`;
    el.topo.innerHTML = "";
    el.tela.className = "tela";
    el.tela.innerHTML = `<div class="girando" aria-label="Carregando"></div>`;
    window.scrollTo(0, 0);
  }

  const ctx = {
    ...el,
    estado,
    silencioso,
    vivo: () => minha === geracao,
    redesenhar: () => desenhar({ silencioso: true }),
  };

  try {
    await rota.render(ctx);
  } catch (e) {
    console.error(e);
    if (!ctx.vivo()) return;
    el.tela.className = "tela";
    el.tela.innerHTML = htmlErro("Não consegui carregar esta tela", e);
  }
}

// ---------------------------------------------------------------------------
// Modos do app
// ---------------------------------------------------------------------------
function modoCheio() {
  el.cabecalho.classList.add("oculto");
  el.abas.classList.add("oculto");
  el.topo.innerHTML = "";
  el.tela.className = "cheia";
}

function modoApp() {
  el.cabecalho.classList.remove("oculto");
  el.abas.classList.remove("oculto");
}

async function sair() {
  await auth.sair();
  location.hash = "";
  location.reload();
}

/** Liga Realtime, presença e "manter tela acesa" para um membro confirmado. */
function ligarAoVivo() {
  iniciarConexao(estado.usuario.id);

  aoMudarConexao(() => {
    for (const selo of document.querySelectorAll("[data-selo]")) selo.innerHTML = htmlSelo();
    // Ajustes mostra quem está online: a presença mudou, a tela muda junto.
    if (rotaAtual() === "ajustes") desenhar({ silencioso: true });
  });

  aoMudarLista(() => {
    // Só as telas que dependem de lista_itens: o Histórico e os Ajustes não mudam.
    if (rotaAtual() === "lista" || rotaAtual() === "orcamento") desenhar({ silencioso: true });
  });

  // A preferência vale assim que o app abre, não só depois de visitar Ajustes.
  // Se a leitura falhar, a tela continua apagando como o celular quiser; o erro
  // real aparece nas telas, que fazem as mesmas leituras.
  consultas.configuracoes()
    .then((c) => aplicarTelaAcesa(c?.manter_tela_acesa))
    .catch(() => {});
}

// ---------------------------------------------------------------------------
// Início
// ---------------------------------------------------------------------------
async function iniciar() {
  // Botões "Tentar de novo" e "Sair" que as telas desenham, em qualquer tela.
  document.addEventListener("click", (e) => {
    const alvo = e.target.closest("[data-acao]");
    if (!alvo) return;
    if (alvo.dataset.acao === "recarregar") {
      if (estado.membro) desenhar();
      else location.reload();
    }
    if (alvo.dataset.acao === "sair") {
      alvo.disabled = true;
      sair();
    }
  });

  if (!configurado) {
    modoCheio();
    el.tela.innerHTML = `
      <h1 class="cheia__titulo">Falta configurar</h1>
      <p class="cheia__texto">Abra o arquivo frontend/js/config.js e cole a URL e a anon key
        do projeto no Supabase.</p>`;
    return;
  }

  let sessao;
  try {
    sessao = await auth.sessao();
  } catch (e) {
    modoCheio();
    el.tela.innerHTML = htmlErro("Não consegui abrir o app", e);
    return;
  }

  if (!sessao?.user) {
    modoCheio();
    await telaLogin(el.tela);
    return;
  }

  estado.usuario = sessao.user;

  let membro;
  try {
    membro = await auth.ehMembro(sessao.user.id);
  } catch (e) {
    modoCheio();
    telaFalhaNaConferencia(el.tela, e);
    return;
  }

  if (!membro) {
    modoCheio();
    telaAcessoNegado(el.tela, sessao.user.email);
    return;
  }

  estado.membro = membro;
  // Os dois do casal: nome e cor de quem marcou cada item do carrinho, e a
  // lista do Compartilhamento. Se falhar, segue só com quem entrou; os itens
  // marcados pelo outro aparecem sem o avatar, nunca com o avatar errado.
  estado.membros = await consultas.membros().catch(() => [membro]);

  modoApp();
  ligarAoVivo();
  window.addEventListener("hashchange", () => desenhar());
  if (!location.hash) fixarRota("lista");
  await desenhar();

  // Saiu em outra aba: esta acompanha.
  auth.aoMudar((evento) => {
    if (evento === "SIGNED_OUT") location.reload();
  });
}

// Service worker: instala o app na tela inicial e guarda o casco em cache.
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}

iniciar().catch((e) => {
  console.error(e);
  modoCheio();
  el.tela.innerHTML = htmlErro("Não consegui abrir o app", e);
});
