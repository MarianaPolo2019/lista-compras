// ============================================================================
// lista.js — aba Lista (telas 5a e 6a/6b do design)
//
// Nesta etapa a Lista só LÊ: mostra o que está no banco, do jeito que o design
// arruma, sem botões de mexer em quantidade, preço ou marca (são da próxima
// etapa). Nenhum botão aparece sem fazer o que promete.
//
// De onde sai cada número:
//   - produto "a levar": ativo, quantidade > 0 e ainda fora do carrinho;
//   - "no carrinho": no_carrinho = true (mesmo que o produto tenha sido
//     desativado depois, porque a finalização copia todo item do carrinho);
//   - total do cabeçalho: soma de quantidade × preço dos itens do carrinho que
//     já têm preço. Item no carrinho sem preço não entra na soma, e a tela de
//     Orçamento avisa quantos são;
//   - "X de Y itens": X no carrinho, de Y que estão na lista (a levar + carrinho).
//
// O seletor (Todos / A levar / Carrinho) e a busca são estado da tela, não do
// banco: ficam guardados aqui para sobreviver aos redesenhos que o Realtime
// dispara quando o outro celular mexe na lista.
// ============================================================================

import { consultas } from "../api.js";
import { esc, moeda, plural, normalizar, htmlAvatar } from "../ui.js";
import { htmlSelo } from "../conexao.js";

const visao = { filtro: "levar", busca: "" };
let dados = null;

const ICONE_BUSCA = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/></svg>`;

export async function telaLista(ctx) {
  const [categorias, produtos, itens] = await Promise.all([
    consultas.categorias(), consultas.produtos(), consultas.itensDaLista(),
  ]);
  if (!ctx.vivo()) return;

  dados = montar(categorias, produtos, itens, ctx.estado);
  desenharCabecalho(ctx);

  // No redesenho silencioso o topo fica: trocar o campo de busca por um novo
  // tiraria o foco de quem está digitando.
  if (!ctx.silencioso || !ctx.topo.querySelector(".segmento")) desenharTopo(ctx);
  else atualizarTopo(ctx);

  desenharCorpo(ctx);
}

// ---------------------------------------------------------------------------
// Dados
// ---------------------------------------------------------------------------
function montar(categorias, produtos, itens, estado) {
  const porProduto = new Map(itens.map((i) => [i.produto_id, i]));
  const item = (p) => porProduto.get(p.id) ?? { quantidade: 0, no_carrinho: false };

  const ativos = produtos.filter((p) => p.ativo);
  const aLevar = ativos.filter((p) => item(p).quantidade > 0 && !item(p).no_carrinho);
  const carrinho = produtos.filter((p) => item(p).no_carrinho);

  const total = carrinho.reduce((s, p) => {
    const i = item(p);
    return i.preco_unitario == null ? s : s + i.quantidade * Number(i.preco_unitario);
  }, 0);

  return { categorias, ativos, aLevar, carrinho, total, item, membros: estado.membros };
}

/** Produtos agrupados por corredor, na ordem das categorias; sem categoria vai por último. */
function agrupar(lista) {
  const grupos = dados.categorias.map((c) => ({ id: c.id, nome: c.nome, produtos: [] }));
  const porId = new Map(grupos.map((g) => [g.id, g]));
  const avulsos = { id: "sem-categoria", nome: "Sem categoria", produtos: [] };
  for (const p of lista) (porId.get(grupoDe(p)) ?? avulsos).produtos.push(p);
  if (avulsos.produtos.length) grupos.push(avulsos);
  return grupos.filter((g) => g.produtos.length);
}

/** Em que grupo o produto cai: o da categoria dele, ou "sem-categoria" se ela não existir. */
function grupoDe(p) {
  return dados.categorias.some((c) => c.id === p.categoria_id) ? p.categoria_id : "sem-categoria";
}

function aLevarNoGrupo(grupoId) {
  return dados.aLevar.filter((p) => grupoDe(p) === grupoId).length;
}

// ---------------------------------------------------------------------------
// Cabeçalho e topo
// ---------------------------------------------------------------------------
function desenharCabecalho(ctx) {
  const naLista = dados.aLevar.length + dados.carrinho.length;
  ctx.cabecalho.innerHTML = `
    <div>
      <h1 class="cabecalho__titulo">Compras</h1>
      <div class="cabecalho__sub" data-selo>${htmlSelo()}</div>
    </div>
    <div class="cabecalho__direita">
      <div class="cabecalho__valor">${moeda(dados.total)}</div>
      ${naLista ? `<div class="cabecalho__prog">${dados.carrinho.length} de ${plural(naLista, "item", "itens")}</div>` : ""}
    </div>`;
}

function rotulos() {
  return {
    todos: `Todos · ${dados.ativos.length}`,
    levar: `A levar · ${dados.aLevar.length}`,
    carrinho: `Carrinho · ${dados.carrinho.length}`,
  };
}

function desenharTopo(ctx) {
  const r = rotulos();
  ctx.topo.innerHTML = `
    <div class="segmento" role="group" aria-label="Mostrar">
      ${["todos", "levar", "carrinho"].map((f) => `
        <button type="button" class="segmento__opcao" data-filtro="${f}"
                aria-pressed="${visao.filtro === f}">${esc(r[f])}</button>`).join("")}
    </div>
    <div class="busca">
      <label class="busca__caixa">
        ${ICONE_BUSCA}
        <input class="busca__entrada" type="search" placeholder="Buscar produto…"
               aria-label="Buscar produto" autocomplete="off" value="${esc(visao.busca)}">
        <button type="button" class="busca__limpar" aria-label="Limpar busca"
                ${visao.busca ? "" : "hidden"}>✕</button>
      </label>
    </div>
    <div class="chips" id="chips"></div>`;

  for (const botao of ctx.topo.querySelectorAll("[data-filtro]")) {
    botao.addEventListener("click", () => {
      visao.filtro = botao.dataset.filtro;
      atualizarTopo(ctx);
      desenharCorpo(ctx);
      window.scrollTo(0, 0);
    });
  }

  const entrada = ctx.topo.querySelector(".busca__entrada");
  const limpar = ctx.topo.querySelector(".busca__limpar");
  entrada.addEventListener("input", () => {
    visao.busca = entrada.value;
    limpar.hidden = !visao.busca;
    desenharCorpo(ctx);
  });
  limpar.addEventListener("click", () => {
    visao.busca = "";
    entrada.value = "";
    limpar.hidden = true;
    entrada.focus();
    desenharCorpo(ctx);
  });
}

function atualizarTopo(ctx) {
  const r = rotulos();
  for (const botao of ctx.topo.querySelectorAll("[data-filtro]")) {
    botao.textContent = r[botao.dataset.filtro];
    botao.setAttribute("aria-pressed", String(visao.filtro === botao.dataset.filtro));
  }
}

/** Atalhos por corredor ("Laticínios · 5"), como no 5a: tocam e rolam até o grupo. */
function desenharChips(ctx, grupos) {
  const chips = ctx.topo.querySelector("#chips");
  if (!chips) return;
  chips.innerHTML = grupos.map((g) => `
    <button type="button" class="chip" data-ir="${esc(g.id)}">${esc(g.nome)} · ${aLevarNoGrupo(g.id)}</button>`).join("");
  ctx.tela.classList.toggle("tela--lista", !grupos.length);
  for (const chip of chips.querySelectorAll("[data-ir]")) {
    chip.addEventListener("click", () => {
      const alvo = ctx.tela.querySelector(`[data-grupo="${CSS.escape(chip.dataset.ir)}"]`);
      if (!alvo) return;
      const folga = document.querySelector(".topo-fixo").getBoundingClientRect().height;
      window.scrollTo({ top: alvo.getBoundingClientRect().top + window.scrollY - folga, behavior: "smooth" });
    });
  }
}

// ---------------------------------------------------------------------------
// Corpo
// ---------------------------------------------------------------------------
function desenharCorpo(ctx) {
  ctx.tela.className = "tela";
  const termo = normalizar(visao.busca.trim());

  if (termo) {
    const achados = dados.ativos.filter((p) => normalizar(p.nome).includes(termo));
    if (!achados.length) {
      desenharChips(ctx, []);
      ctx.tela.innerHTML = `
        <div class="sem-resultado">
          <div class="sem-resultado__titulo">Nenhum produto encontrado</div>
          <div class="sem-resultado__texto">Não achamos “${esc(visao.busca.trim())}” na sua lista.</div>
        </div>`;
      return;
    }
    const grupos = agrupar(achados);
    desenharChips(ctx, grupos);
    ctx.tela.innerHTML = htmlGrupos(grupos);
    return;
  }

  if (visao.filtro === "carrinho") {
    desenharChips(ctx, []);
    ctx.tela.innerHTML = dados.carrinho.length ? htmlCarrinho() : htmlVazio(
      "Carrinho vazio", "Os itens que vocês pegarem no mercado aparecem aqui.");
    return;
  }

  const base = visao.filtro === "todos"
    ? dados.ativos.filter((p) => !dados.item(p).no_carrinho)
    : dados.aLevar;
  const grupos = agrupar(base);
  desenharChips(ctx, grupos);

  if (!grupos.length) {
    if (visao.filtro === "todos") {
      ctx.tela.innerHTML = dados.carrinho.length
        ? htmlVazio("Tudo no carrinho", "Todos os produtos já estão no carrinho.") + htmlCarrinho()
        : htmlVazio("Nenhum produto cadastrado", "Os produtos cadastrados aparecem aqui, separados por corredor.");
      return;
    }
    // 6a. O texto do design vale quando nada está no carrinho; com algo no
    // carrinho, "todos estão com quantidade 0" deixaria de ser verdade.
    const texto = dados.carrinho.length
      ? "Tudo o que estava na lista já está no carrinho."
      : "Todos os produtos estão com quantidade 0. Aumente a quantidade do que precisa ou cadastre um produto novo.";
    ctx.tela.innerHTML = `
      <div class="vazio">
        <div class="vazio__titulo">Nenhum item para levar</div>
        <div class="vazio__texto">${esc(texto)}</div>
        ${dados.ativos.length ? `<button type="button" class="botao botao--secundario" data-ver-todos>Ver todos os produtos</button>` : ""}
      </div>
      ${dados.carrinho.length ? htmlCarrinho() : ""}`;
    ctx.tela.querySelector("[data-ver-todos]")?.addEventListener("click", () => {
      visao.filtro = "todos";
      atualizarTopo(ctx);
      desenharCorpo(ctx);
    });
    return;
  }

  ctx.tela.innerHTML = htmlGrupos(grupos) + (dados.carrinho.length ? htmlCarrinho() : "");
}

function htmlVazio(titulo, texto) {
  return `
    <div class="vazio">
      <div class="vazio__titulo">${esc(titulo)}</div>
      <div class="vazio__texto">${esc(texto)}</div>
    </div>`;
}

function htmlGrupos(grupos) {
  return grupos.map((g) => `
    <section data-grupo="${esc(g.id)}">
      <div class="secao">
        <span class="secao__titulo">${esc(g.nome)}</span>
        <span class="secao__conta">${aLevarNoGrupo(g.id)} a levar</span>
      </div>
      ${g.produtos.map(htmlLinha).join("")}
    </section>`).join("");
}

function htmlLinha(p) {
  const i = dados.item(p);
  const partes = [];
  if (i.no_carrinho) partes.push("No carrinho");
  if (i.marca) partes.push(i.marca);
  partes.push(`${i.quantidade} un.`);
  return `
    <div class="linha${i.quantidade === 0 && !i.no_carrinho ? " linha--zerada" : ""}">
      <div class="linha__corpo">
        <div class="linha__marcador" aria-hidden="true"></div>
        <div class="linha__texto">
          <div class="linha__nome">${esc(p.nome)}</div>
          <div class="linha__sub">${esc(partes.join(" · "))}</div>
        </div>
      </div>
    </div>`;
}

function htmlCarrinho() {
  return `
    <div class="secao secao--carrinho">
      <span class="secao__titulo">No carrinho</span>
      <span class="secao__conta">${plural(dados.carrinho.length, "item", "itens")}</span>
    </div>
    ${dados.carrinho.map((p) => {
      const i = dados.item(p);
      const temPreco = i.preco_unitario != null;
      const sub = [i.marca, temPreco ? `${i.quantidade} × ${moeda(i.preco_unitario)}` : `${i.quantidade} un. · sem preço`]
        .filter(Boolean).join(" · ");
      const indice = dados.membros.findIndex((m) => m.user_id === i.marcado_por);
      return `
        <div class="carrinho">
          <div class="carrinho__check" aria-hidden="true">✓</div>
          <div class="carrinho__texto">
            <div class="carrinho__nome">${esc(p.nome)}</div>
            <div class="carrinho__sub">${esc(sub)}</div>
          </div>
          <div class="carrinho__total">${temPreco ? moeda(i.quantidade * Number(i.preco_unitario)) : "—"}</div>
          ${indice >= 0 ? htmlAvatar(dados.membros[indice], indice) : ""}
        </div>`;
    }).join("")}`;
}
