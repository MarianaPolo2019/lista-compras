// ============================================================================
// historico.js — aba Histórico (6e) e detalhe da compra (6f, #/historico/<id>)
//
// LISTA
//   Mais recente primeiro. A variação do total contra a compra anterior só
//   aparece quando AS DUAS têm total: compra importada de nota fiscal sem
//   total não vira comparação com número inventado. A mais antiga mostra
//   "primeira compra". Compra de nota fiscal leva o selo "Nota fiscal".
//
// DETALHE (só consulta)
//   Cada item é comparado com as compras ANTERIORES a esta pela regra de
//   precos.js (comparar): mesma marca e tamanho, ou outro tamanho da mesma
//   família pelo preço por medida. Outra marca, embalagem de outra família ou
//   produto sem compra anterior não ganham selo nem entram nos destaques.
//   Destaques: até 3 que mais subiram e até 3 que mais caíram, por percentual
//   (casos 1 e 2 da regra).
// ============================================================================

import { consultas } from "../api.js";
import { esc, moeda, dataBR, dataCurta, plural } from "../ui.js";
import { montarPrecos, comparar, tamanhoDe, textoTamanho, porMedida, textoMedida } from "../precos.js";
import { abrirFolhaProduto } from "./produto.js";

export async function telaHistorico(ctx) {
  const id = (location.hash || "").replace(/^#\//, "").split("/")[1];
  if (id) return telaDetalhe(ctx, decodeURIComponent(id));

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

  ctx.tela.innerHTML = compras.map((c, i) => {
    const anterior = compras[i + 1];
    const itens = c.compra_itens?.[0]?.count ?? 0;
    const sub = [plural(itens, "item", "itens"), c.mercado].filter(Boolean).join(" · ");
    const selos = [];
    if (!anterior) {
      selos.push(`<span class="selo selo--neutro">primeira compra</span>`);
    } else if (c.total != null && anterior.total != null) {
      const dif = Math.round((Number(c.total) - Number(anterior.total)) * 100) / 100;
      selos.push(dif === 0
        ? `<span class="selo selo--neutro">= mesmo total</span>`
        : `<span class="selo selo--${dif > 0 ? "subiu" : "desceu"}">${dif > 0 ? "▲" : "▼"} ${moeda(Math.abs(dif))}</span>`);
    }
    if (c.origem === "nota_fiscal") selos.push(`<span class="selo selo--neutro">Nota fiscal</span>`);
    return `
      <button type="button" class="compra" data-compra="${esc(c.id)}">
        <span class="compra__texto">
          <span class="compra__data">${esc(dataBR(c.data))}</span>
          <span class="compra__itens">${esc(sub)}</span>
        </span>
        <span class="compra__lado">
          <span class="compra__total">${c.total == null ? "—" : moeda(c.total)}</span>
          <span class="compra__selos">${selos.join("")}</span>
        </span>
        <span class="compra__seta" aria-hidden="true">›</span>
      </button>`;
  }).join("");

  for (const b of ctx.tela.querySelectorAll("[data-compra]")) {
    b.addEventListener("click", () => { location.hash = `#/historico/${b.dataset.compra}`; });
  }
}

// ---------------------------------------------------------------------------
// Detalhe da compra
// ---------------------------------------------------------------------------
async function telaDetalhe(ctx, id) {
  const [compra, compras, linhas, categorias] = await Promise.all([
    consultas.compra(id), consultas.compras(), consultas.historicoDePrecos(), consultas.categorias(),
  ]);
  if (!ctx.vivo()) return;

  const voltar = `<button type="button" class="cabecalho__voltar" data-voltar aria-label="Voltar para o Histórico">‹</button>`;
  if (!compra) {
    ctx.cabecalho.innerHTML = `${voltar}<div class="cabecalho__meio"><h1 class="cabecalho__titulo">Compra</h1></div>`;
    ctx.tela.className = "tela";
    ctx.tela.innerHTML = `<div class="vazio"><div class="vazio__titulo">Compra não encontrada</div></div>`;
    ligarVoltar(ctx);
    return;
  }

  const pos = compras.findIndex((c) => c.id === compra.id);
  const anterior = pos >= 0 ? compras[pos + 1] : null;
  const itens = compra.compra_itens ?? [];
  const precos = montarPrecos(linhas);

  // Cada item com a sua comparação (compras anteriores a esta, regra de precos.js).
  const analisados = itens.map((it) => {
    const reg = {
      produto_id: it.produto_id, compra_id: compra.id, marca: it.marca || null, tamanho: tamanhoDe(it),
      preco: Number(it.preco_unitario), data: compra.data, criada: String(compra.created_at),
    };
    const c = comparar(precos, reg, { antesDe: reg });
    // Selo colorido só com referência da mesma marca (casos 1, 2 e 3).
    const v = c && c.dif != null ? c : null;
    return { ...it, nome: it.produtos?.nome ?? "Produto", categoria_id: it.produtos?.categoria_id, preco: reg.preco, tamanho: reg.tamanho, v };
  });

  // Destaques: só mesmo tamanho (1) ou tamanho convertido (2), pelo percentual.
  const comVariacao = analisados.filter((a) => a.v && (a.v.caso === 1 || a.v.caso === 2) && a.v.dif !== 0);
  const caros = comVariacao.filter((a) => a.v.dif > 0).sort((a, b) => b.v.real - a.v.real).slice(0, 3);
  const baratos = comVariacao.filter((a) => a.v.dif < 0).sort((a, b) => a.v.real - b.v.real).slice(0, 3);
  const porMed = (a) => (a.v.caso === 2 ? `/${a.v.medida.por}` : "");

  ctx.cabecalho.innerHTML = `
    ${voltar}
    <div class="cabecalho__meio">
      <h1 class="cabecalho__titulo">${esc(dataBR(compra.data))}</h1>
      <div class="cabecalho__sub">${plural(itens.length, "item", "itens")}${compra.mercado ? ` · ${esc(compra.mercado)}` : ""} · ${anterior ? `vs. ${dataCurta(anterior.data)}` : "primeira compra"}</div>
    </div>
    <div class="cabecalho__valor">${compra.total == null ? "—" : moeda(compra.total)}</div>`;

  const destaque = (a) => `
    <div class="destaque">
      <button type="button" class="destaque__nome" data-produto="${esc(a.produto_id)}">${esc(a.nome)}</button>
      <span class="selo-preco selo-preco--${a.v.dif > 0 ? "subiu" : "desceu"}">${a.v.dif > 0 ? "▲" : "▼"} ${moeda(Math.abs(a.v.dif))}${porMed(a)} (${a.v.dif > 0 ? "+" : "−"}${a.v.pct}%)</span>
    </div>`;

  // Seções na ordem dos corredores; dentro, ordem alfabética.
  const grupos = categorias.map((c) => ({ ...c, itens: [] }));
  const semCat = { id: "sem-categoria", nome: "Sem categoria", itens: [] };
  const porId = new Map(grupos.map((g) => [g.id, g]));
  for (const a of analisados) (porId.get(a.categoria_id) ?? semCat).itens.push(a);
  if (semCat.itens.length) grupos.push(semCat);
  for (const g of grupos) g.itens.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR", { sensitivity: "base" }));

  const linhaItem = (a) => {
    const temQtd = a.quantidade != null;
    // "Marca · 700 g · 2 × R$ 8,05", ou "Marca · 700 g" sem quantidade.
    const sub = [a.marca, textoTamanho(a.tamanho), temQtd ? `${a.quantidade} × ${moeda(a.preco)}` : ""].filter(Boolean).join(" · ");
    const medida = textoMedida(porMedida(a.preco, a.tamanho));
    const selo = !a.v ? "" : a.v.dif === 0
      ? `<span class="selo-mini selo-mini--neutro">= mesmo preço</span>`
      : `<span class="selo-mini selo-mini--${a.v.dif > 0 ? "subiu" : "desceu"}">${a.v.dif > 0 ? "▲ +" : "▼ −"}${a.v.pct}%${porMed(a)}</span>`;
    return `
      <div class="det">
        <div class="det__texto">
          <button type="button" class="det__nome" data-produto="${esc(a.produto_id)}">${esc(a.nome)}</button>
          ${sub ? `<div class="det__sub">${esc(sub)}</div>` : ""}
          ${medida ? `<div class="det__medida">${esc(medida)}</div>` : ""}
        </div>
        <div class="det__lado">
          <div class="det__valor">${temQtd ? moeda(a.quantidade * a.preco) : `${moeda(a.preco)} un.`}</div>
          ${selo}
        </div>
      </div>`;
  };

  ctx.tela.className = "tela";
  ctx.tela.innerHTML = `
    ${caros.length ? `
      <div class="secao secao--destaque"><span class="secao__titulo" style="color:var(--subiu)">▲ Mais caros nesta compra</span></div>
      ${caros.map(destaque).join("")}` : ""}
    ${baratos.length ? `
      <div class="secao secao--destaque"><span class="secao__titulo" style="color:var(--desceu)">▼ Mais baratos nesta compra</span></div>
      ${baratos.map(destaque).join("")}` : ""}
    ${!caros.length && !baratos.length ? `<p class="nota det__sem-destaque">Nenhum item desta compra tem compra anterior da mesma marca e da mesma embalagem para comparar.</p>` : ""}
    ${grupos.filter((g) => g.itens.length).map((g) => `
      <div class="secao secao--resumo"><span class="secao__titulo">${esc(g.nome)}</span></div>
      ${g.itens.map(linhaItem).join("")}`).join("")}`;

  ligarVoltar(ctx);
  for (const b of ctx.tela.querySelectorAll("[data-produto]")) {
    b.addEventListener("click", () => abrirFolhaProduto(b.dataset.produto, { aoMudar: () => ctx.redesenhar() }));
  }
}

function ligarVoltar(ctx) {
  ctx.cabecalho.querySelector("[data-voltar]")?.addEventListener("click", () => { location.hash = "#/historico"; });
}
