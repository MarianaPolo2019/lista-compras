// ============================================================================
// historico.js — aba Histórico (tela 6e do design)
//
// Lista as compras de mercado.compras, da mais nova para a mais antiga, com a
// data, quantos itens e o total. Compra importada de nota fiscal não tem total
// (só preço unitário de cada item): aparece "—" e o selo "Nota fiscal", nunca
// um total calculado por fora.
//
// Ficam para a etapa de comparação de preços: o selo de variação contra a
// compra anterior (▲/▼) e o detalhe da compra ao tocar na linha. Sem o detalhe,
// a linha não leva o "›", para não prometer um toque que não faz nada.
// ============================================================================

import { consultas } from "../api.js";
import { esc, moeda, dataBR, plural } from "../ui.js";

export async function telaHistorico(ctx) {
  const compras = await consultas.compras();
  if (!ctx.vivo()) return;

  ctx.cabecalho.innerHTML = `
    <div>
      <h1 class="cabecalho__titulo">Histórico</h1>
      <div class="cabecalho__sub">${plural(compras.length, "compra finalizada", "compras finalizadas")}</div>
    </div>`;

  ctx.tela.className = "tela";

  if (!compras.length) {
    ctx.tela.innerHTML = `
      <div class="vazio">
        <div class="vazio__titulo">Nenhuma compra finalizada</div>
        <div class="vazio__texto">As compras aparecem aqui quando vocês finalizam uma lista.</div>
      </div>`;
    return;
  }

  ctx.tela.innerHTML = compras.map((c) => {
    const itens = c.compra_itens?.[0]?.count ?? 0;
    const sub = [plural(itens, "item", "itens"), c.mercado].filter(Boolean).join(" · ");
    const nota = c.origem === "nota_fiscal";
    return `
      <div class="compra">
        <div class="compra__texto">
          <div class="compra__data">${esc(dataBR(c.data))}</div>
          <div class="compra__itens">${esc(sub)}</div>
        </div>
        <div class="compra__lado">
          <div class="compra__total">${c.total == null ? "—" : moeda(c.total)}</div>
          ${nota ? `<span class="selo selo--neutro">Nota fiscal</span>` : ""}
        </div>
      </div>`;
  }).join("");
}
