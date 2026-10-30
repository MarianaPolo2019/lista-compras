// ============================================================================
// orcamento.js — aba Orçamento (telas 6c e 6d do design)
//
// Nesta etapa a tela mostra só o que dá para afirmar com os dados de agora:
//   - limite de gastos: o valor gravado em mercado.configuracoes, ou "—" se
//     não houver limite (editar o limite é da próxima etapa);
//   - total gasto: soma de quantidade × preço dos itens do carrinho que já têm
//     preço. Item no carrinho sem preço fica fora da soma, e a tela diz quantos;
//   - saldo restante e a barra: só existem com limite definido. Passou do
//     limite, a barra fica vermelha, cheia, e aparece o aviso de estourado;
//   - itens comprados (no carrinho) e pendentes (ativos com quantidade > 0
//     ainda fora do carrinho);
//   - observações ainda não resolvidas.
//
// Ficam de fora até a etapa de preços: a "Estimativa do que falta" (precisa do
// último preço de cada item), a comparação "Mesmos itens na compra de …" (que
// usa mercado.comparar_mesmos_itens) e o botão "Reiniciar lista", que chama a
// finalizar_compra. Nenhum desses aparece com número inventado.
// ============================================================================

import { consultas } from "../api.js";
import { esc, moeda, numero, plural } from "../ui.js";

export async function telaOrcamento(ctx) {
  const [produtos, itens, config, observacoes] = await Promise.all([
    consultas.produtos(), consultas.itensDaLista(), consultas.configuracoes(), consultas.observacoesAbertas(),
  ]);
  if (!ctx.vivo()) return;

  const ativos = new Set(produtos.filter((p) => p.ativo).map((p) => p.id));
  const existentes = new Set(produtos.map((p) => p.id));
  const carrinho = itens.filter((i) => i.no_carrinho && existentes.has(i.produto_id));
  const pendentes = itens.filter((i) => !i.no_carrinho && i.quantidade > 0 && ativos.has(i.produto_id));
  const semPreco = carrinho.filter((i) => i.preco_unitario == null).length;
  const gasto = carrinho.reduce((s, i) =>
    i.preco_unitario == null ? s : s + i.quantidade * Number(i.preco_unitario), 0);

  const limite = config?.limite_gastos == null ? null : Number(config.limite_gastos);
  const temLimite = limite != null && limite > 0;
  const pct = temLimite ? Math.round((gasto / limite) * 100) : 0;
  const estourou = temLimite && gasto > limite;
  const corBarra = estourou ? "var(--subiu)" : "var(--barra-ok)";

  ctx.cabecalho.innerHTML = `
    <div>
      <h1 class="cabecalho__titulo">Orçamento</h1>
      <div class="cabecalho__sub">${carrinho.length} comprados · ${pendentes.length} pendentes</div>
    </div>`;

  const saldo = temLimite ? limite - gasto : null;

  ctx.tela.className = "tela";
  ctx.tela.innerHTML = `
    ${estourou ? `
      <div class="alerta">
        <div class="alerta__titulo">▲ Orçamento estourado</div>
        <div class="alerta__texto">Você passou ${moeda(gasto - limite)} do limite.</div>
      </div>` : ""}

    <div class="secao secao--bloco"><span class="secao__titulo">Limite de gastos</span></div>
    <div class="par">
      <span class="par__rotulo">Valor máximo</span>
      <span class="caixa-valor">
        <span class="caixa-valor__moeda">R$</span>
        <span class="caixa-valor__numero${temLimite ? "" : " caixa-valor__numero--vazio"}">${temLimite ? numero(limite) : "—"}</span>
      </span>
    </div>
    ${temLimite ? `
      <div class="progresso">
        <div class="progresso__linha">
          <span class="progresso__gasto">${moeda(gasto)} <span class="progresso__de">de ${moeda(limite)}</span></span>
          <span class="progresso__pct" style="color:${corBarra}">${pct}%</span>
        </div>
        <div class="progresso__trilho">
          <div class="progresso__barra" style="width:${Math.min(pct, 100)}%;background:${corBarra}"></div>
        </div>
      </div>` : `<p class="nota">Nenhum limite de gastos definido.</p>`}

    <div class="secao secao--bloco secao--resumo"><span class="secao__titulo">Resumo da compra</span></div>
    <div class="grade-resumo">
      ${resumo("Total gasto", moeda(gasto))}
      ${resumo("Saldo restante", saldo == null ? "—" : moeda(saldo),
               saldo == null ? "" : saldo < 0 ? "var(--subiu)" : "var(--desceu)")}
      ${resumo("Itens comprados", String(carrinho.length))}
      ${resumo("Itens pendentes", String(pendentes.length))}
    </div>
    ${semPreco ? `<p class="nota nota--abaixo">${plural(semPreco, "item no carrinho ainda sem preço", "itens no carrinho ainda sem preço")}: fora do total.</p>` : ""}

    ${observacoes.length ? `
      <div class="secao secao--bloco secao--resumo"><span class="secao__titulo">Observações</span></div>
      ${observacoes.map((o) => `<div class="observacao">${esc(o.texto)}</div>`).join("")}` : ""}`;
}

function resumo(rotulo, valor, cor = "") {
  return `
    <div class="resumo">
      <div class="resumo__rotulo">${esc(rotulo)}</div>
      <div class="resumo__valor"${cor ? ` style="color:${cor}"` : ""}>${esc(valor)}</div>
    </div>`;
}
