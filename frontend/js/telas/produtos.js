// ============================================================================
// produtos.js — Ajustes · Produtos (tela 6i)
//
// Só produtos ATIVOS (excluído = desativado, e some daqui). Ordem alfabética,
// busca sem acento e um chip por categoria (na ordem dos corredores), numa
// linha que rola para o lado como os atalhos da Lista. Tocar num produto abre
// a folha dele (produto.js: histórico, editar, mudar categoria, excluir).
//
// "+ Novo produto": nome + corredor e pronto. O produto NÃO entra na lista
// de compras (quantidade 0, sem linha em lista_itens): só fica cadastrado.
// Cadastrar exige internet.
// ============================================================================

import { consultas, acoes } from "../api.js";
import { esc, plural, normalizar, avisar, abrirDialogo, precisaDeInternet, ligarArrasteHorizontal } from "../ui.js";
import { escolherCorredor, nomeDeProduto } from "../escolhas.js";
import { abrirFolhaProduto } from "./produto.js";

const visao = { busca: "", categoria: "todas" };

const ICONE_BUSCA = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/></svg>`;

export async function telaProdutos(ctx) {
  const [categorias, todos] = await Promise.all([consultas.categorias(), consultas.produtos()]);
  if (!ctx.vivo()) return;

  const ativos = todos.filter((p) => p.ativo)
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR", { sensitivity: "base" }));
  const nomeCat = new Map(categorias.map((c) => [c.id, c.nome]));
  if (visao.categoria !== "todas" && !nomeCat.has(visao.categoria)) visao.categoria = "todas";

  ctx.cabecalho.innerHTML = `
    <button type="button" class="cabecalho__voltar" data-voltar aria-label="Voltar para Ajustes">‹</button>
    <div class="cabecalho__meio">
      <h1 class="cabecalho__titulo">Produtos</h1>
      <div class="cabecalho__sub">${plural(ativos.length, "cadastrado", "cadastrados")}</div>
    </div>`;
  ctx.cabecalho.querySelector("[data-voltar]").addEventListener("click", () => { location.hash = "#/ajustes"; });

  // O topo é refeito a cada desenho (os ouvintes precisam dos dados novos); a
  // busca digitada e o foco no campo continuam.
  const estavaFocada = document.activeElement?.matches?.(".busca--produtos .busca__entrada");
  {
    ctx.topo.innerHTML = `
      <div class="busca busca--produtos">
        <label class="busca__caixa">
          ${ICONE_BUSCA}
          <input class="busca__entrada" type="search" placeholder="Buscar produto…" aria-label="Buscar produto"
                 autocomplete="off" value="${esc(visao.busca)}">
        </label>
      </div>
      <div class="chips" data-filtros aria-label="Filtrar por categoria"></div>`;
    const entrada = ctx.topo.querySelector(".busca__entrada");
    entrada.addEventListener("input", () => { visao.busca = entrada.value; desenharCorpo(); });
    if (estavaFocada) entrada.focus();
    ligarArrasteHorizontal(ctx.topo.querySelector("[data-filtros]"), (e) => {
      const chip = e.target.closest("[data-categoria]");
      if (!chip) return;
      visao.categoria = chip.dataset.categoria;
      desenharFiltros();
      desenharCorpo();
    });
  }

  function desenharFiltros() {
    ctx.topo.querySelector("[data-filtros]").innerHTML = [{ id: "todas", nome: "Todas" }, ...categorias]
      .map((c) => `<button type="button" class="chip${visao.categoria === c.id ? " chip--ativo" : ""}"
                            data-categoria="${esc(c.id)}" aria-pressed="${visao.categoria === c.id}">${esc(c.nome)}</button>`).join("");
  }

  function desenharCorpo() {
    const termo = normalizar(visao.busca.trim());
    const lista = ativos.filter((p) =>
      (visao.categoria === "todas" || p.categoria_id === visao.categoria) &&
      (!termo || normalizar(p.nome).includes(termo)));
    ctx.tela.className = "tela tela--produtos";
    ctx.tela.innerHTML = `
      ${lista.length ? lista.map((p) => `
        <button type="button" class="prod" data-produto="${esc(p.id)}">
          <span class="prod__texto">
            <span class="prod__nome">${esc(p.nome)}</span>
            <span class="prod__cat">${esc(nomeCat.get(p.categoria_id) ?? "Sem categoria")}</span>
          </span>
          <span class="prod__seta" aria-hidden="true">›</span>
        </button>`).join("") : `
        <div class="sem-resultado">
          <div class="sem-resultado__titulo">Nenhum produto encontrado</div>
          <div class="sem-resultado__texto">${termo ? `Não achamos “${esc(visao.busca.trim())}”.` : "Nenhum produto nesta categoria."}</div>
        </div>`}
      <button type="button" class="fab" data-novo>+ Novo produto</button>`;

    for (const b of ctx.tela.querySelectorAll("[data-produto]")) {
      b.addEventListener("click", () => abrirFolhaProduto(b.dataset.produto, { aoMudar: () => ctx.redesenhar() }));
    }
    ctx.tela.querySelector("[data-novo]").addEventListener("click", () =>
      precisaDeInternet("Cadastrar produto") || novoProduto(ctx, categorias));
  }

  desenharFiltros();
  desenharCorpo();
}

/** Nome → corredor → cadastra. Não põe na lista. */
async function novoProduto(ctx, categorias) {
  const nome = await new Promise((resolver) => {
    abrirDialogo({
      titulo: "Novo produto",
      texto: "Ele fica cadastrado, sem entrar na lista de compras.",
      extra: `
        <label class="campo dialogo__campo">
          <span class="campo__rotulo">Nome do produto</span>
          <input class="campo__entrada" data-nome type="text" maxlength="80" autocomplete="off">
        </label>`,
      botoes: [
        { texto: "Escolher corredor", valor: "seguir" },
        { texto: "Cancelar", tipo: "neutro", valor: "cancelar" },
      ],
      aoEscolher: (_, dialogo) => {
        const texto = nomeDeProduto(dialogo.el.querySelector("[data-nome]").value);
        if (!texto) { dialogo.erro("Escreva o nome do produto."); return false; }
        resolver(texto);
        return true;
      },
    }).el.addEventListener("click", (e) => {
      if (e.target.closest("[data-cancelar], [data-valor=cancelar]")) resolver(null);
    });
    setTimeout(() => document.querySelector(".dialogo [data-nome]")?.focus(), 0);
  });
  if (!nome) return;

  const categoria = await escolherCorredor(`Cadastrar “${nome}”`, categorias);
  if (!categoria) return;
  try {
    await acoes.criarProduto(nome, categoria);
    avisar(`“${nome}” foi cadastrado. Ele não entrou na lista.`, "ok");
    ctx.redesenhar();
  } catch (falha) {
    avisar(`Não foi possível cadastrar: ${falha.message}`);
  }
}
