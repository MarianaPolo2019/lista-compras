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
//
// SEM INTERNET (depois de ter entrado uma vez com internet neste aparelho):
//   - a renovação do login falha por rede, mas isso NÃO manda para o Login:
//     o app usa a sessão guardada e a última confirmação de "membro do casal"
//     guardada no aparelho (ACESSO_SALVO);
//   - o Login só aparece se a pessoa tocar em Sair, ou se o servidor, COM
//     internet, disser que a sessão não vale mais (evento SIGNED_OUT).
// ============================================================================

import { configurado } from "./config.js";
import { auth, consultas, aoAtualizar } from "./api.js";
import { esc, htmlErro, avisar, plural } from "./ui.js";
import { iniciarConexao, aoMudarConexao, aoMudarLista, htmlSelo, definirPendentes } from "./conexao.js";
import { semInternet } from "./rede.js";
import * as fila from "./fila.js";
import { aplicarTelaAcesa, definirNaLista } from "./tela-acesa.js";

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
  definirNaLista(nome === "lista");

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

// A última confirmação de acesso (quem entrou, a linha em membros_casal e os
// dois do casal), para abrir sem internet. Apagada ao Sair.
const ACESSO_SALVO = "minhas-compras.acesso";
function lerAcesso() {
  try { return JSON.parse(localStorage.getItem(ACESSO_SALVO) ?? "null"); } catch { return null; }
}
function guardarAcesso(valor) {
  try { localStorage.setItem(ACESSO_SALVO, JSON.stringify(valor)); } catch { /* sem armazenamento: só não abre offline */ }
}
function esquecerAcesso() {
  try { localStorage.removeItem(ACESSO_SALVO); } catch { /* nada a fazer */ }
}

/**
 * Sair. Com alterações da Lista ainda na fila, NÃO sai: sair descartaria o que
 * não subiu sem ninguém saber. Pede para esperar o "Sincronizado".
 */
async function sair(botao) {
  const n = fila.quantasPendentes();
  if (n) {
    avisar(`Há ${plural(n, "alteração", "alterações")} da lista ainda não enviada${n === 1 ? "" : "s"}. Espere o “Sincronizado” antes de sair.`);
    if (botao) botao.disabled = false;
    return;
  }
  esquecerAcesso();
  await auth.sair();
  location.hash = "";
  location.reload();
}

/** Liga Realtime, presença e "manter tela acesa" para um membro confirmado. */
function ligarAoVivo() {
  iniciarConexao(estado.usuario.id);
  // O que sobrou na fila de uma sessão anterior sobe assim que der.
  definirPendentes(fila.quantasPendentes());
  fila.sincronizar();

  aoMudarConexao(() => {
    for (const selo of document.querySelectorAll("[data-selo]")) selo.innerHTML = htmlSelo();
    // Ajustes mostra quem está online: a presença mudou, a tela muda junto.
    if (rotaAtual() === "ajustes") desenhar({ silencioso: true });
  });

  aoMudarLista(() => {
    // O Orçamento relê tudo. A Lista NÃO passa por aqui: ela aplica cada
    // mudança na própria linha (lista.js), sem apagar o que está sendo digitado.
    if (rotaAtual() === "orcamento") desenhar({ silencioso: true });
  });

  // A preferência vale assim que o app abre, não só depois de visitar Ajustes.
  // Se a leitura falhar, a tela continua apagando como o celular quiser; o erro
  // real aparece nas telas, que fazem as mesmas leituras.
  const lerTelaAcesa = () => consultas.configuracoes()
    .then((c) => aplicarTelaAcesa(c?.manter_tela_acesa))
    .catch(() => {});
  lerTelaAcesa();

  // A tela foi desenhada com a cópia do aparelho e o servidor respondeu depois
  // com algo diferente (api.js, comCache): redesenha em silêncio. Nunca no meio
  // de uma digitação: espera o campo ser solto.
  let agendado = null;
  aoAtualizar((chave) => {
    if (chave === "configuracoes") lerTelaAcesa();
    clearTimeout(agendado);
    const tentar = () => {
      if (document.activeElement?.closest?.("#tela, #topo-tela") && document.activeElement.matches("input, textarea")) {
        agendado = setTimeout(tentar, 800);
        return;
      }
      desenhar({ silencioso: true });
    };
    agendado = setTimeout(tentar, 150);
  });
}

/**
 * Abriu com o acesso guardado (sem esperar a rede): confere em segundo plano.
 * Sessão encerrada ou de outra pessoa, ou não é mais do casal → esquece o
 * acesso e recarrega (vai para o Login ou para "Acesso não liberado"). Falha
 * de rede → segue com o que está guardado.
 */
async function conferirAcesso(salvo) {
  let sessao;
  try {
    sessao = await auth.sessao();
  } catch {
    return;
  }
  if (!sessao?.user) {
    if (semInternet()) return;
    esquecerAcesso();
    location.reload();
    return;
  }
  if (sessao.user.id !== salvo.usuario.id) {
    esquecerAcesso();
    location.reload();
    return;
  }
  let membro;
  try {
    membro = await auth.ehMembro(sessao.user.id);
  } catch {
    return;
  }
  if (!membro) {
    esquecerAcesso();
    location.reload();
    return;
  }
  const membros = await consultas.membros().catch(() => salvo.membros);
  const acesso = { usuario: { id: sessao.user.id, email: sessao.user.email }, membro, membros };
  guardarAcesso(acesso);
  entrarComAcesso(acesso);
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
      sair(alvo);
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

  // A fila de alterações guardada no aparelho entra antes de qualquer tela.
  await fila.carregarFila().catch((e) => console.error("Fila do aparelho indisponível", e));

  const salvo = lerAcesso();

  // Já entrou neste aparelho antes: abre NA HORA com o acesso guardado e a
  // cópia dos dados, sem esperar sessão nem rede (sinal fraco no mercado), e
  // confere tudo em segundo plano.
  if (salvo?.usuario && salvo.membro) {
    entrarComAcesso(salvo);
    conferirAcesso(salvo);
    return finalizarEntrada();
  }

  let sessao = null, erroSessao = null;
  try {
    sessao = await auth.sessao();
  } catch (e) {
    erroSessao = e;
  }

  if (!sessao?.user) {
    // Sem sessão válida porque a renovação falhou por REDE, e com acesso
    // confirmado antes neste aparelho: entra com o que está guardado.
    const porRede = erroSessao?.rede || (!erroSessao && semInternet());
    if (porRede && salvo?.usuario) {
      entrarComAcesso(salvo);
      return finalizarEntrada();
    }
    modoCheio();
    if (erroSessao) el.tela.innerHTML = htmlErro("Não consegui abrir o app", erroSessao);
    else await telaLogin(el.tela);
    return;
  }

  let membro;
  try {
    membro = await auth.ehMembro(sessao.user.id);
  } catch (e) {
    // Sem internet, vale a última confirmação deste mesmo usuário.
    if (e.rede && salvo?.usuario?.id === sessao.user.id && salvo.membro) {
      entrarComAcesso(salvo);
      return finalizarEntrada();
    }
    modoCheio();
    telaFalhaNaConferencia(el.tela, e);
    return;
  }

  if (!membro) {
    esquecerAcesso();
    modoCheio();
    telaAcessoNegado(el.tela, sessao.user.email);
    return;
  }

  // Os dois do casal: nome e cor de quem marcou cada item do carrinho, e a
  // lista do Compartilhamento. Se falhar, segue só com quem entrou; os itens
  // marcados pelo outro aparecem sem o avatar, nunca com o avatar errado.
  const membros = await consultas.membros().catch(() => [membro]);
  const acesso = { usuario: { id: sessao.user.id, email: sessao.user.email }, membro, membros };
  guardarAcesso(acesso);
  entrarComAcesso(acesso);
  await finalizarEntrada();
}

function entrarComAcesso(acesso) {
  estado.usuario = acesso.usuario;
  estado.membro = acesso.membro;
  estado.membros = acesso.membros?.length ? acesso.membros : [acesso.membro];
}

async function finalizarEntrada() {

  modoApp();
  ligarAoVivo();
  window.addEventListener("hashchange", () => desenhar());
  if (!location.hash) fixarRota("lista");
  await desenhar();

  // Saiu em outra aba, ou o servidor (com internet) disse que a sessão não
  // vale mais: esquece o acesso guardado e volta para o Login.
  auth.aoMudar((evento) => {
    if (evento === "SIGNED_OUT") {
      esquecerAcesso();
      location.reload();
    }
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
