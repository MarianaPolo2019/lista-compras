// ============================================================================
// escolhas.js — as folhas de escolher que mais de uma tela usa
//
//   escolherCorredor(nome, categorias) → id da categoria, ou null se cancelou
//   escolherProduto(produtos, categorias) → o produto escolhido ou recém-
//     cadastrado, ou null se cancelou
// ============================================================================

import { acoes } from "./api.js";
import { esc, normalizar, abrirFolha } from "./ui.js";

/** "pao de forma" → "Pao de forma": primeira letra maiúscula, espaços limpos. */
export function nomeDeProduto(texto) {
  const limpo = String(texto ?? "").replace(/\s+/g, " ").trim();
  return limpo.charAt(0).toLocaleUpperCase("pt-BR") + limpo.slice(1);
}

/** Folha com os corredores (na ordem do mercado) e Cancelar. */
export function escolherCorredor(titulo, categorias, { atual = null } = {}) {
  return new Promise((resolver) => {
    const folha = abrirFolha({ rotulo: titulo });
    folha.corpo.innerHTML = `
      <div class="folha__titulo">${esc(titulo)}</div>
      <div class="folha__texto">Em que corredor ele fica?</div>
      <div class="folha__lista">
        ${categorias.map((c) => `
          <button type="button" class="folha__opcao" data-categoria="${esc(c.id)}">
            <span>${esc(c.nome)}</span>${c.id === atual ? `<span class="folha__check" aria-label="atual">✓</span>` : ""}
          </button>`).join("")}
      </div>
      <button type="button" class="botao botao--secundario folha__cancelar" data-cancelar>Cancelar</button>`;
    const terminar = (valor) => { folha.fechar(); resolver(valor); };
    folha.el.addEventListener("click", (e) => {
      if (e.target.closest("[data-fechar-folha], [data-cancelar]")) return terminar(null);
      const op = e.target.closest("[data-categoria]");
      if (op) terminar(op.dataset.categoria);
    });
  });
}

/**
 * Folha de escolher um produto ativo, com busca sem acento. Se a busca não
 * acha nada, oferece "Cadastrar '[texto]'": pede o corredor e cria o produto
 * (com a mensagem real do banco se o nome já existir). Devolve o produto.
 */
export function escolherProduto(produtos, categorias, { titulo = "Escolher produto" } = {}) {
  return new Promise((resolver) => {
    const ativos = produtos.filter((p) => p.ativo)
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR", { sensitivity: "base" }));
    const nomeCat = new Map(categorias.map((c) => [c.id, c.nome]));
    const folha = abrirFolha({ alta: true, rotulo: titulo });
    folha.corpo.innerHTML = `
      <div class="folha__titulo">${esc(titulo)}</div>
      <label class="busca__caixa folha__busca">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/></svg>
        <input class="busca__entrada" type="search" placeholder="Buscar produto…" aria-label="Buscar produto" autocomplete="off">
      </label>
      <div class="folha__lista" data-resultados></div>
      <div class="alerta" data-erro hidden><div class="alerta__texto"></div></div>
      <button type="button" class="botao botao--secundario folha__cancelar" data-cancelar>Cancelar</button>`;

    const entrada = folha.corpo.querySelector("input");
    const resultados = folha.corpo.querySelector("[data-resultados]");
    const erro = folha.corpo.querySelector("[data-erro]");
    const terminar = (valor) => { folha.fechar(); resolver(valor); };

    const desenhar = () => {
      const texto = entrada.value.trim();
      const termo = normalizar(texto);
      const achados = termo ? ativos.filter((p) => normalizar(p.nome).includes(termo)) : ativos;
      resultados.innerHTML = achados.map((p) => `
        <button type="button" class="folha__opcao folha__opcao--produto" data-produto="${esc(p.id)}">
          <span>${esc(p.nome)}</span><span class="folha__opcao-sub">${esc(nomeCat.get(p.categoria_id) ?? "")}</span>
        </button>`).join("") || `
        <div class="sem-resultado">
          <div class="sem-resultado__texto">Não achamos “${esc(texto)}” na sua lista.</div>
          <button type="button" class="adicionar" data-cadastrar>
            <span class="adicionar__mais" aria-hidden="true">+</span>
            <span>
              <span class="adicionar__titulo">Cadastrar “${esc(nomeDeProduto(texto))}”</span>
              <span class="adicionar__sub">Escolhe o corredor e cria o produto</span>
            </span>
          </button>
        </div>`;
    };
    entrada.addEventListener("input", desenhar);
    desenhar();

    folha.el.addEventListener("click", async (e) => {
      if (e.target.closest("[data-fechar-folha], [data-cancelar]")) return terminar(null);
      const op = e.target.closest("[data-produto]");
      if (op) return terminar(ativos.find((p) => p.id === op.dataset.produto));
      if (!e.target.closest("[data-cadastrar]")) return;
      const nome = nomeDeProduto(entrada.value);
      const cat = await escolherCorredor(`Cadastrar “${nome}”`, categorias);
      if (!cat) return;
      erro.hidden = true;
      try {
        terminar(await acoes.criarProduto(nome, cat));
      } catch (falha) {
        erro.querySelector(".alerta__texto").textContent = falha.message;
        erro.hidden = false;
      }
    });
    entrada.focus();
  });
}
