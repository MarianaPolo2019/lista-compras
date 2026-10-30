// ============================================================================
// ui.js — formatação e pedacinhos de HTML usados por mais de uma tela
// ============================================================================

import { semInternet } from "./rede.js";

/** Escapa texto que vem do banco antes de ir para dentro de um template. */
export function esc(valor) {
  return String(valor ?? "")
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

const fmtNumero = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** 1234.5 → "1.234,50" (sem o "R$", para as caixas de valor do design). */
export function numero(n) {
  return fmtNumero.format(Number(n) || 0);
}

/** 1234.5 → "R$ 1.234,50"; negativo → "− R$ 37,80", com o sinal de menos do design. */
export function moeda(n) {
  const v = Number(n) || 0;
  return (v < 0 ? "− " : "") + "R$ " + numero(Math.abs(v));
}

/** "2026-10-03" → "03/10/2026". A data vem do banco como texto, sem fuso. */
export function dataBR(iso) {
  const [a, m, d] = String(iso ?? "").slice(0, 10).split("-");
  return a && m && d ? `${d}/${m}/${a}` : "";
}

/**
 * A data de hoje em São Paulo, "AAAA-MM-DD". É a data que vai para o banco
 * quando a compra é salva: o banco pensa em UTC, e às 21h de São Paulo já é o
 * dia seguinte lá.
 */
export function hojeSP() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
}

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
/** "2026-08-25" → "ago" (eixo do gráfico de preços). */
export function mesCurto(iso) {
  return MESES[Number(String(iso ?? "").slice(5, 7)) - 1] ?? "";
}

/** Percentual com 1 casa, vírgula e sinal de menos do design: -4.25 → "−4,3". */
export function percentual1(n) {
  const v = Math.round(Number(n) * 10) / 10;
  return (v < 0 ? "−" : "") + Math.abs(v).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

/** "2026-08-25" → "25/08", o formato curto que o design usa nos selos de preço. */
export function dataCurta(iso) {
  const [, m, d] = String(iso ?? "").slice(0, 10).split("-");
  return m && d ? `${d}/${m}` : "";
}

/**
 * Aviso flutuante logo acima da barra de abas, nas cores do alerta vermelho.
 * Some sozinho depois de alguns segundos; um aviso novo substitui o anterior.
 * É para falha que já foi tratada (a tela já voltou ao que está no banco) e
 * que a pessoa precisa saber que aconteceu.
 */
let temporizadorAviso = null;
export function avisar(texto, tipo = "erro") {
  let el = document.getElementById("aviso-flutuante");
  if (!el) {
    el = document.createElement("div");
    el.id = "aviso-flutuante";
    el.setAttribute("role", "alert");
    document.body.appendChild(el);
  }
  // "ok" é para sucesso confirmado pelo banco ("Compra salva no Histórico"),
  // nunca para algo que ainda está a caminho.
  el.className = `aviso-flutuante${tipo === "ok" ? " aviso-flutuante--ok" : ""}`;
  el.textContent = texto;
  el.hidden = false;
  clearTimeout(temporizadorAviso);
  temporizadorAviso = setTimeout(() => { el.hidden = true; }, 6000);
}

// ---------------------------------------------------------------------------
// Diálogo central (telas 7a, 7b, 7c) e folha que sobe de baixo (7d)
// ---------------------------------------------------------------------------

/**
 * Diálogo de confirmação no desenho 7a: título, texto, linhas com selo
 * ("Salva", "Zera", "Mantém"), um conteúdo extra opcional e os botões.
 *
 * `aoEscolher(valor, controle)` é chamado no toque de um botão. Se devolver
 * (ou resolver com) `false`, o diálogo continua aberto: é assim que uma ação
 * que falhou mostra o erro DENTRO do diálogo (controle.erro) sem fechar e sem
 * fingir sucesso. Enquanto a ação roda, os botões ficam travados.
 * O botão de valor "cancelar" e o toque fora fecham sem chamar nada.
 */
export function abrirDialogo({ titulo, texto = "", linhas = [], extra = "", botoes, aoEscolher = () => true }) {
  const el = document.createElement("div");
  el.className = "dialogo";
  el.setAttribute("role", "dialog");
  el.setAttribute("aria-modal", "true");
  el.setAttribute("aria-labelledby", "dialogo-titulo");
  const cor = { salva: "desceu", zera: "subiu", mantem: "neutro" };
  el.innerHTML = `
    <div class="dialogo__veu" data-cancelar></div>
    <div class="dialogo__caixa">
      <div class="dialogo__titulo" id="dialogo-titulo">${esc(titulo)}</div>
      ${texto ? `<div class="dialogo__texto">${esc(texto)}</div>` : ""}
      ${linhas.map((l) => `
        <div class="dialogo__linha">
          <span class="dialogo__selo dialogo__selo--${cor[l.tipo] ?? "neutro"}">${esc(l.rotulo)}</span>
          <span class="dialogo__linha-texto">${esc(l.texto)}</span>
        </div>`).join("")}
      ${extra}
      <div class="alerta" data-erro hidden><div class="alerta__texto"></div></div>
      <div class="dialogo__botoes">
        ${botoes.map((b) => `
          <button type="button" class="botao${b.tipo === "perigo" ? " botao--perigo" : b.tipo === "neutro" ? " botao--secundario" : ""}"
                  data-valor="${esc(b.valor)}">${esc(b.texto)}</button>`).join("")}
      </div>
    </div>`;
  document.body.appendChild(el);

  const erro = el.querySelector("[data-erro]");
  const controle = {
    el,
    fechar: () => el.remove(),
    erro(msg) {
      erro.querySelector(".alerta__texto").textContent = msg;
      erro.hidden = false;
    },
  };
  el.addEventListener("click", async (e) => {
    if (e.target.matches("[data-cancelar]")) return controle.fechar();
    const botao = e.target.closest("[data-valor]");
    if (!botao) return;
    if (botao.dataset.valor === "cancelar") return controle.fechar();
    const todos = el.querySelectorAll(".dialogo__botoes button");
    for (const b of todos) b.disabled = true;
    erro.hidden = true;
    let fechar = true;
    try {
      fechar = (await aoEscolher(botao.dataset.valor, controle)) !== false;
    } catch (falha) {
      controle.erro(falha.message ?? String(falha));
      fechar = false;
    }
    if (fechar) controle.fechar();
    else for (const b of todos) b.disabled = false;
  });
  el.querySelector(".dialogo__botoes button")?.focus();
  return controle;
}

/**
 * Folha que sobe de baixo (7d). `alta`: ocupa a tela quase toda (folha do
 * produto); sem ela, só a altura do conteúdo (escolher corredor/produto).
 * Devolve { el, corpo, fechar }; o conteúdo é de quem chamou.
 */
export function abrirFolha({ alta = false, rotulo = "" } = {}) {
  const el = document.createElement("div");
  el.className = `folha${alta ? " folha--alta" : ""}`;
  el.setAttribute("role", "dialog");
  el.setAttribute("aria-modal", "true");
  if (rotulo) el.setAttribute("aria-label", rotulo);
  el.innerHTML = `
    <div class="folha__veu" data-fechar-folha></div>
    <div class="folha__painel">
      <div class="folha__alca" aria-hidden="true"></div>
      <div class="folha__corpo"></div>
    </div>`;
  document.body.appendChild(el);
  const fechar = () => el.remove();
  el.querySelector("[data-fechar-folha]").addEventListener("click", fechar);
  return { el, corpo: el.querySelector(".folha__corpo"), fechar };
}

/**
 * Ações que só funcionam com o servidor (finalizar compra, cadastros,
 * observações, limite): sem internet, avisa "Precisa de internet" e devolve
 * true para quem chamou desistir ANTES de tentar gravar. O botão continua à
 * vista; só não finge que funcionou.
 */
export function precisaDeInternet(acao = "") {
  if (!semInternet()) return false;
  avisar(`Precisa de internet${acao ? ` para ${acao.charAt(0).toLowerCase()}${acao.slice(1)}` : ""}. Tente de novo quando o sinal voltar.`);
  return true;
}

/**
 * Linha de chips rolando para o lado (atalhos da Lista, filtros de Produtos).
 * Dedo: rolagem nativa. Mouse: arrastar rola por pointer events; passou de
 * 5 px, conta como arraste (o ponteiro fica capturado pela linha) e o clique
 * que encerra o arraste é descartado. `aoTocar(evento)` recebe os toques de
 * verdade.
 */
export function ligarArrasteHorizontal(trilho, aoTocar) {
  let inicio = null;
  let arrastou = false;
  trilho.addEventListener("pointerdown", (e) => {
    if (e.pointerType !== "mouse" || e.button !== 0) return;
    inicio = { x: e.clientX, rolagem: trilho.scrollLeft, id: e.pointerId };
    arrastou = false;
  });
  trilho.addEventListener("pointermove", (e) => {
    if (!inicio) return;
    const dx = e.clientX - inicio.x;
    if (!arrastou && Math.abs(dx) > 5) {
      arrastou = true;
      trilho.classList.add("chips--arrastando");
      try { trilho.setPointerCapture(inicio.id); } catch { /* sem captura, segue pelo trilho */ }
    }
    if (arrastou) trilho.scrollLeft = inicio.rolagem - dx;
  });
  const fim = () => {
    inicio = null;
    trilho.classList.remove("chips--arrastando");
  };
  trilho.addEventListener("pointerup", fim);
  trilho.addEventListener("pointercancel", fim);
  trilho.addEventListener("click", (e) => {
    if (arrastou) {
      e.preventDefault();
      e.stopPropagation();
      arrastou = false;
      return;
    }
    aoTocar?.(e);
  }, true);
}

/** 1 → "1 item", 3 → "3 itens". */
export function plural(n, um, varios) {
  return `${n} ${n === 1 ? um : varios}`;
}

/**
 * Minúsculas e sem acento, para a busca achar "pao" em "Pão". É a mesma regra
 * da mercado.normalizar() do banco (lower + unaccent), feita aqui no aparelho.
 */
export function normalizar(texto) {
  return String(texto ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/** Cartão de erro dentro da tela, com o texto real do erro e um botão de tentar de novo. */
export function htmlErro(titulo, erro) {
  return `
    <div class="vazio">
      <div class="vazio__titulo">${esc(titulo)}</div>
      <div class="vazio__texto">${esc(erro?.message ?? erro)}</div>
      <button type="button" class="botao botao--secundario" data-acao="recarregar">Tentar de novo</button>
    </div>`;
}

/** Círculo com a inicial de quem marcou, nas cores do Compartilhamento. */
export function htmlAvatar(membro, indice, tamanho = 28) {
  if (!membro) return "";
  const inicial = esc(String(membro.nome ?? "?").trim().charAt(0).toUpperCase() || "?");
  const estilo = tamanho === 40 ? "" : ` style="width:${tamanho}px;height:${tamanho}px;font-size:12px"`;
  return `<span class="avatar${indice === 1 ? " avatar--2" : ""}"${estilo}>${inicial}</span>`;
}
