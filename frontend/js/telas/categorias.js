// ============================================================================
// categorias.js — Ajustes · Categorias (tela 6h) e o diálogo 7b
//
// ORDEM DOS CORREDORES
//   Arrastar pela alça (dedo ou mouse, pointer events). Ao soltar, a nova
//   ordem é gravada em DUAS passadas: primeiro cada categoria que mudou vai
//   para uma ordem provisória (1000 + nova), depois para a final. Assim duas
//   categorias nunca disputam o mesmo número no meio do caminho, mesmo que o
//   banco não aceite ordens repetidas. Se qualquer gravação falhar, as que já
//   mudaram voltam à ordem de antes, a tela relê o banco e avisa.
//
// EXCLUIR (7b, adaptado à regra do banco: produtos.categoria_id é "on delete
// restrict", e produto com histórico não pode ser apagado)
//   - nenhum produto aponta para ela (nem inativo): confirmação simples;
//   - com produtos: escolher o destino; TODOS os produtos dela (ativos e
//     inativos) vão para lá num comando só, e só então a categoria é apagada.
//     Se apagar falhar, os produtos voltam para ela. Nada fica pela metade:
//     ou a categoria sai com os produtos movidos, ou tudo volta como estava.
//
// Tudo aqui grava direto no servidor: sem internet, os botões avisam
// "Precisa de internet" e não tentam.
// ============================================================================

import { consultas, acoes } from "../api.js";
import { esc, plural, avisar, abrirDialogo, precisaDeInternet } from "../ui.js";

const ICONE_ALCA = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 8h16M4 12h16M4 16h16"/></svg>`;
const ICONE_LAPIS = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16v4z"/><path d="M13.5 6.5l4 4"/></svg>`;
const ICONE_LIXO = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 002 2h6a2 2 0 002-2l1-12M9 7V4h6v3"/></svg>`;

export async function telaCategorias(ctx) {
  const [categorias, produtos] = await Promise.all([consultas.categorias(), consultas.produtos()]);
  if (!ctx.vivo()) return;

  const ativos = (id) => produtos.filter((p) => p.ativo && p.categoria_id === id).length;

  ctx.cabecalho.innerHTML = `
    <button type="button" class="cabecalho__voltar" data-voltar aria-label="Voltar para Ajustes">‹</button>
    <div class="cabecalho__meio">
      <h1 class="cabecalho__titulo">Categorias</h1>
      <div class="cabecalho__sub">Ordem dos corredores</div>
    </div>`;
  ctx.cabecalho.querySelector("[data-voltar]").addEventListener("click", () => { location.hash = "#/ajustes"; });

  ctx.tela.className = "tela";
  ctx.tela.innerHTML = `
    <p class="categorias__dica">Segure a alça à esquerda e arraste para seguir o caminho do seu mercado.</p>
    <div class="categorias" data-categorias>
      ${categorias.map((c) => `
        <div class="cat" data-cat="${esc(c.id)}">
          <button type="button" class="cat__alca" data-alca aria-label="Arrastar ${esc(c.nome)}">${ICONE_ALCA}</button>
          <div class="cat__texto">
            <div class="cat__nome">${esc(c.nome)}</div>
            <div class="cat__qtd">${plural(ativos(c.id), "produto", "produtos")}</div>
          </div>
          <button type="button" class="cat__icone" data-acao="renomear" aria-label="Renomear ${esc(c.nome)}">${ICONE_LAPIS}</button>
          <button type="button" class="cat__icone" data-acao="excluir" aria-label="Excluir ${esc(c.nome)}">${ICONE_LIXO}</button>
        </div>`).join("")}
    </div>
    <form class="obs-nova categorias__nova" data-nova>
      <input class="campo__entrada obs-nova__entrada" type="text" maxlength="60" placeholder="Nova categoria…"
             aria-label="Nome da nova categoria" autocomplete="off" enterkeyhint="done">
      <button type="submit" class="botao obs-nova__botao">+ Criar</button>
    </form>`;

  const porId = new Map(categorias.map((c) => [c.id, c]));

  // Renomear e excluir.
  ctx.tela.querySelector("[data-categorias]").addEventListener("click", (e) => {
    const botao = e.target.closest("[data-acao]");
    if (!botao) return;
    const cat = porId.get(botao.closest("[data-cat]").dataset.cat);
    if (botao.dataset.acao === "renomear") precisaDeInternet("Renomear a categoria") || renomear(ctx, cat);
    if (botao.dataset.acao === "excluir") precisaDeInternet("Excluir a categoria") || excluir(ctx, cat, categorias, produtos);
  });

  // Criar: entra no fim (maior ordem + 1).
  const form = ctx.tela.querySelector("[data-nova]");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (precisaDeInternet("Criar uma categoria")) return;
    const entrada = form.querySelector("input");
    const nome = entrada.value.replace(/\s+/g, " ").trim();
    if (!nome) return;
    const botao = form.querySelector("button");
    botao.disabled = true;
    try {
      const ordem = Math.max(0, ...categorias.map((c) => c.ordem)) + 1;
      await acoes.criarCategoria(nome, ordem);
      entrada.value = "";
      entrada.blur();
      ctx.redesenhar();
    } catch (falha) {
      avisar(`Não foi possível criar: ${falha.message}`);
      botao.disabled = false;
    }
  });

  ligarArraste(ctx, categorias);
}

// ---------------------------------------------------------------------------
// Arrastar para reordenar
// ---------------------------------------------------------------------------
function ligarArraste(ctx, categorias) {
  const lista = ctx.tela.querySelector("[data-categorias]");
  const ordemAntes = categorias.map((c) => c.id);
  let arrasto = null;

  lista.addEventListener("pointerdown", (e) => {
    const alca = e.target.closest("[data-alca]");
    if (!alca || (e.pointerType === "mouse" && e.button !== 0)) return;
    if (precisaDeInternet("Mudar a ordem dos corredores")) return;
    e.preventDefault();
    const linha = alca.closest("[data-cat]");
    arrasto = { linha, inicioY: e.clientY, id: e.pointerId };
    linha.classList.add("cat--arrastando");
    alca.setPointerCapture(e.pointerId);
  });

  lista.addEventListener("pointermove", (e) => {
    if (!arrasto || e.pointerId !== arrasto.id) return;
    const { linha } = arrasto;
    // Passou da metade da vizinha: troca de lugar no DOM e o ponto de partida
    // anda junto, para a linha continuar debaixo do dedo. Repete enquanto
    // precisar (um movimento rápido pode passar de várias linhas de uma vez).
    for (;;) {
      const dy = e.clientY - arrasto.inicioY;
      const proxima = linha.nextElementSibling;
      const anterior = linha.previousElementSibling;
      if (proxima && dy > proxima.offsetHeight / 2) {
        lista.insertBefore(proxima, linha);
        arrasto.inicioY += proxima.offsetHeight;
      } else if (anterior && dy < -anterior.offsetHeight / 2) {
        lista.insertBefore(linha, anterior);
        arrasto.inicioY -= anterior.offsetHeight;
      } else break;
    }
    const dy = e.clientY - arrasto.inicioY;
    linha.style.transform = `translateY(${dy}px)`;
  });

  const soltar = async (e) => {
    if (!arrasto || e.pointerId !== arrasto.id) return;
    const { linha } = arrasto;
    arrasto = null;
    linha.style.transform = "";
    linha.classList.remove("cat--arrastando");
    const nova = [...lista.querySelectorAll("[data-cat]")].map((l) => l.dataset.cat);
    if (nova.join() === ordemAntes.join()) return;
    await gravarOrdem(ctx, categorias, nova);
  };
  lista.addEventListener("pointerup", soltar);
  lista.addEventListener("pointercancel", soltar);
}

/** Grava a nova ordem (duas passadas) ou desfaz tudo e avisa. */
async function gravarOrdem(ctx, categorias, novaOrdemIds) {
  const antes = new Map(categorias.map((c) => [c.id, c.ordem]));
  const destino = new Map(novaOrdemIds.map((id, i) => [id, i + 1]));
  const mudaram = novaOrdemIds.filter((id) => antes.get(id) !== destino.get(id));
  const tocadas = [];
  try {
    for (const id of mudaram) { await acoes.ordemDaCategoria(id, 1000 + destino.get(id)); tocadas.push(id); }
    for (const id of mudaram) await acoes.ordemDaCategoria(id, destino.get(id));
  } catch (falha) {
    // Volta as que já mudaram (também em duas passadas) e relê.
    try {
      for (const id of tocadas) await acoes.ordemDaCategoria(id, 2000 + antes.get(id));
      for (const id of tocadas) await acoes.ordemDaCategoria(id, antes.get(id));
      avisar(`Não foi possível salvar a nova ordem: ${falha.message}. A ordem anterior foi mantida.`);
    } catch (falhaAoDesfazer) {
      avisar(`Não foi possível salvar a nova ordem (${falha.message}) nem voltar à anterior (${falhaAoDesfazer.message}). A tela mostra o que ficou no banco.`);
    }
  }
  ctx.redesenhar();
}

// ---------------------------------------------------------------------------
// Renomear e excluir
// ---------------------------------------------------------------------------
function renomear(ctx, cat) {
  abrirDialogo({
    titulo: "Renomear categoria",
    extra: `
      <label class="campo dialogo__campo">
        <span class="campo__rotulo">Nome</span>
        <input class="campo__entrada" data-nome type="text" maxlength="60" value="${esc(cat.nome)}" autocomplete="off">
      </label>`,
    botoes: [
      { texto: "Salvar", valor: "salvar" },
      { texto: "Cancelar", tipo: "neutro", valor: "cancelar" },
    ],
    aoEscolher: async (_, dialogo) => {
      const nome = dialogo.el.querySelector("[data-nome]").value.replace(/\s+/g, " ").trim();
      if (!nome) { dialogo.erro("Escreva o nome da categoria."); return false; }
      if (nome === cat.nome) return true;
      // Nome repetido: o índice único do banco recusa e a mensagem dele aparece.
      await acoes.renomearCategoria(cat.id, nome);
      ctx.redesenhar();
      return true;
    },
  });
}

function excluir(ctx, cat, categorias, produtos) {
  const dela = produtos.filter((p) => p.categoria_id === cat.id);
  const inativos = dela.filter((p) => !p.ativo).length;

  if (!dela.length) {
    abrirDialogo({
      titulo: `Excluir “${cat.nome}”?`,
      texto: "A categoria não tem produtos e sai da lista de corredores.",
      botoes: [
        { texto: "Excluir categoria", tipo: "perigo", valor: "excluir" },
        { texto: "Cancelar", tipo: "neutro", valor: "cancelar" },
      ],
      aoEscolher: async () => {
        await acoes.apagarCategoria(cat.id);
        avisar(`“${cat.nome}” foi excluída.`, "ok");
        ctx.redesenhar();
        return true;
      },
    });
    return;
  }

  const outras = categorias.filter((c) => c.id !== cat.id);
  abrirDialogo({
    titulo: `Excluir “${cat.nome}”?`,
    texto: `Esta categoria tem ${plural(dela.length, "produto", "produtos")}${inativos ? ` (${inativos} fora do cadastro)` : ""}. Para excluir, escolha para qual categoria ${dela.length === 1 ? "ele vai" : "eles vão"}.`,
    extra: `
      <div class="destinos" role="radiogroup" aria-label="Categoria de destino">
        ${outras.map((c) => `
          <label class="destino">
            <input type="radio" name="destino" value="${esc(c.id)}">
            <span>${esc(c.nome)}</span>
          </label>`).join("")}
      </div>`,
    botoes: [
      { texto: "Mover e excluir", valor: "mover" },
      { texto: "Cancelar", tipo: "neutro", valor: "cancelar" },
    ],
    aoEscolher: async (_, dialogo) => {
      const destino = dialogo.el.querySelector("input[name=destino]:checked")?.value;
      if (!destino) { dialogo.erro("Escolha para qual categoria os produtos vão."); return false; }
      const nomeDestino = outras.find((c) => c.id === destino)?.nome ?? "a outra categoria";
      const movidos = await acoes.moverProdutosDeCategoria(cat.id, destino);
      try {
        await acoes.apagarCategoria(cat.id);
      } catch (falha) {
        try {
          await acoes.devolverProdutos(movidos, cat.id);
        } catch (falhaAoDevolver) {
          ctx.redesenhar();
          throw new Error(`Não consegui excluir a categoria (${falha.message}) nem devolver os produtos (${falhaAoDevolver.message}). ${plural(movidos.length, "produto ficou", "produtos ficaram")} em ${nomeDestino}.`);
        }
        ctx.redesenhar();
        throw new Error(`Não consegui excluir a categoria: ${falha.message}. Os produtos voltaram para ela.`);
      }
      avisar(`“${cat.nome}” foi excluída; ${plural(movidos.length, "produto foi", "produtos foram")} para ${nomeDestino}.`, "ok");
      ctx.redesenhar();
      return true;
    },
  });
}
