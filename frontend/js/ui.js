// ============================================================================
// ui.js — formatação e pedacinhos de HTML usados por mais de uma tela
// ============================================================================

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
export function avisar(texto) {
  let el = document.getElementById("aviso-flutuante");
  if (!el) {
    el = document.createElement("div");
    el.id = "aviso-flutuante";
    el.className = "aviso-flutuante";
    el.setAttribute("role", "alert");
    document.body.appendChild(el);
  }
  el.textContent = texto;
  el.hidden = false;
  clearTimeout(temporizadorAviso);
  temporizadorAviso = setTimeout(() => { el.hidden = true; }, 6000);
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
