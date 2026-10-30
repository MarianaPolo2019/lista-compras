// ============================================================================
// lista.js — aba Lista (telas 5a–5e, 6a e 6b do design)
//
// ESTADO
//   `confirmado`: cada linha de mercado.lista_itens como o banco a devolveu
//                 pela última vez (leitura, resposta de gravação ou Realtime).
//   `local`:      o que a tela mostra. Igual ao confirmado, mais as mudanças
//                 que ainda estão a caminho do banco.
//   Produto sem linha em lista_itens vale { quantidade 0, fora do carrinho,
//   sem marca, sem preço }, e só ganha linha no banco quando é tocado.
//
// GRAVAÇÃO (otimista, por produto, em fila)
//   A tela muda na hora; a gravação vai depois, uma por vez por produto, só
//   com os campos que mudaram. Se falhar, o produto volta INTEIRO ao que está
//   confirmado no banco e aparece o aviso. A tela nunca fica mostrando algo
//   que não foi salvo.
//   O preço digitado grava 600 ms depois da última tecla ou ao sair do campo.
//
// TEMPO REAL
//   Mudança que chega do outro celular atualiza `confirmado` e a linha. Duas
//   exceções, aplicadas depois: se o produto tem gravação na fila (a mudança
//   local ainda vai chegar ao banco), ou se há um campo em edição (redesenhar
//   apagaria o que está sendo digitado). Quando o campo perde o foco, aplica.
//   Se o canal cair e voltar, a lista inteira é relida.
//
// PREÇO E MARCA (histórico)
//   compra_itens é lido uma vez ao abrir a aba (e de novo quando o app volta ao
//   primeiro plano) e daqui sai, no aparelho:
//     - a última compra de cada produto (qualquer marca): "última R$ x";
//     - a última compra de cada produto + marca (marca sem acento/maiúscula):
//       a referência do selo de comparação e a lista do chip de marca.
//   "Marca" de uma linha = a gravada em lista_itens; se não houver, a da
//   última compra do produto; se o produto nunca foi comprado, nenhuma.
//
// TAMANHO (pré-preenchido como a marca, sem gravar sozinho)
//   O da linha; senão, o da última compra da mesma marca; senão, o da última
//   compra do produto. Grava quando a Mari escolhe na folha, ou junto com o
//   preço/carrinho (como a marca). Os dois campos vão SEMPRE juntos.
//   Trocar de marca: se o tamanho da linha é o que a marca antiga sugeria,
//   passa a ser o que a nova sugere; um tamanho escolhido à mão fica.
//   "Sem tamanho" esconde a sugestão neste aparelho até a Mari escolher outro.
// ============================================================================

import { consultas, acoes } from "../api.js";
import { esc, moeda, numero, plural, normalizar, htmlAvatar, avisar, dataCurta, precisaDeInternet, ligarArrasteHorizontal, abrirFolha } from "../ui.js";
import { htmlSelo, aoMudarLista, aoReconectar, definirPendentes, marcarSincronizado } from "../conexao.js";
import * as fila from "../fila.js";
import {
  montarPrecos, comparar, partesDoSelo, marcaMostrada, tamanhoDe, tamanhoMostrado, tamanhoSugerido,
  camposDeTamanho, mesmoTamanho, mesmaMarca, textoTamanho, porMedida, textoMedida, UNIDADES,
} from "../precos.js";
import { escolherCorredor, nomeDeProduto } from "../escolhas.js";
import { abrirFolhaProduto } from "./produto.js";

const CHAVE_FILTRO = "minhas-compras.filtro";
const FILTROS = ["todos", "levar", "carrinho"];
const ATRASO_PRECO = 600;
const VAZIO = Object.freeze({ quantidade: 0, no_carrinho: false, marca: null, preco_unitario: null, tamanho_qtd: null, tamanho_unidade: null, marcado_por: null });

const st = {
  ctx: null,
  categorias: [],
  produtos: new Map(),       // id → produto
  confirmado: new Map(),     // produto_id → linha do banco
  local: new Map(),          // produto_id → linha mostrada
  hist: { ultima: new Map(), porMarca: new Map(), marcas: new Map(), doProduto: new Map() },
  semTamanho: new Set(),     // produtos em que a Mari tocou "Sem tamanho" (só neste aparelho)
  filtro: lerFiltro(),
  busca: "",
  aberto: null,              // produto_id da linha aberta (só uma)
  marcasAbertas: false,      // a lista do chip de marca está aberta
  digitandoMarca: false,     // "Outra marca…" virou campo de texto
  focarPreco: false,         // depois de desenhar, pôr o foco no preço da linha aberta
  remotos: new Map(),        // produto_id → linha remota esperando para ser aplicada
  redesenhoPendente: false,
};

// ---------------------------------------------------------------------------
// Entrada
// ---------------------------------------------------------------------------
export async function telaLista(ctx) {
  const [categorias, produtos, itens, historico] = await Promise.all([
    consultas.categorias(), consultas.produtos(), consultas.itensDaLista(), consultas.historicoDePrecos(),
  ]);
  if (!ctx.vivo()) return;

  st.ctx = ctx;
  st.categorias = categorias;
  st.produtos = new Map(produtos.map((p) => [p.id, p]));
  montarHistorico(historico);

  // Releitura completa: o banco (ou a última cópia dele, sem internet) manda,
  // com as alterações da fila que ainda não subiram por cima.
  st.confirmado = new Map(itens.map((i) => [i.produto_id, i]));
  montarLocal();
  st.remotos.clear();

  if (!ctx.silencioso || !ctx.topo.querySelector(".segmento")) desenharTopo();
  desenharTudo();
}

// Ligados uma vez só, valem para a vida do app; agem só com a Lista na tela.
let ligado = false;
function ligarOuvintes() {
  if (ligado) return;
  ligado = true;
  aoMudarLista((payload) => { if (naLista()) aplicarRemoto(payload); });
  // Voltou o Realtime: primeiro sobe a fila, depois relê (a releitura também
  // acontece sozinha quando a fila esvazia, em "sincronizado").
  aoReconectar(() => {
    fila.sincronizar();
    if (naLista()) st.ctx.redesenhar();
  });

  // --- a fila conta o que acontece com cada alteração ----------------------
  fila.ao("mudou", () => {
    definirPendentes(fila.quantasPendentes());
    if (naLista()) desenharTudo();
  });
  fila.ao("confirmado", (id, linha) => {
    st.confirmado.set(id, linha);
    // A tela continua mostrando o que ainda está na fila por cima do banco.
    if (!st.remotos.has(id)) montarLocal([id]);
  });
  fila.ao("recusado", (id, erro, doServidor) => {
    if (doServidor) st.confirmado.set(id, doServidor);
    else st.confirmado.delete(id);
    montarLocal([id]);
    st.remotos.delete(id);
    const nome = st.produtos.get(id)?.nome ?? "Um produto";
    avisar(`${nome} não foi salvo: ${erro.message}`);
    if (naLista()) forcarRedesenho();
  });
  fila.ao("sincronizado", async () => {
    // Fila vazia e confirmada: relê lista_itens do servidor, e a tela passa a
    // mostrar o que ficou no banco (inclusive o que o Carlos mudou nesse meio).
    try {
      // Do servidor mesmo (não a cópia): com sinal fraco, a cópia poderia
      // chegar primeiro e a tela voltaria a um estado de antes da fila.
      const itens = await consultas.itensDaListaDoServidor();
      st.confirmado = new Map(itens.map((i) => [i.produto_id, i]));
      montarLocal();
      st.remotos.clear();
      marcarSincronizado();
      if (naLista()) desenharTudo();
    } catch (e) {
      console.error(e);
    }
  });

  document.addEventListener("visibilitychange", async () => {
    if (document.visibilityState !== "visible" || !naLista()) return;
    try {
      montarHistorico(await consultas.historicoDePrecos());
      desenharTudo();
    } catch (e) {
      avisar(`Não consegui atualizar os últimos preços: ${e.message}`);
    }
  });
  // Saiu do campo: o que esperava (Realtime, redesenho) entra agora. O
  // setTimeout deixa o foco chegar ao próximo campo antes de decidir. Sem nada
  // esperando, não redesenha: redesenhar entre o "apertar" e o "soltar" de um
  // toque trocaria o botão de baixo do dedo e o toque se perderia.
  document.addEventListener("focusout", (e) => {
    if (!e.target.closest?.("#tela")) return;
    setTimeout(() => {
      if (campoEmEdicao() || !(st.redesenhoPendente || st.remotos.size)) return;
      aplicarPendentes();
    }, 0);
  });
}
ligarOuvintes();

function naLista() {
  return !!st.ctx && (location.hash || "#/lista").startsWith("#/lista");
}

// ---------------------------------------------------------------------------
// Dados derivados
// ---------------------------------------------------------------------------
function item(id) {
  return st.local.get(id) ?? VAZIO;
}

/** `local` = o que o banco tem + as alterações da fila por cima. `ids` limita a alguns produtos. */
function montarLocal(ids = null) {
  if (!ids) {
    st.local = new Map(fila.comPendentes([...st.confirmado.values()]).map((i) => [i.produto_id, i]));
    return;
  }
  for (const id of ids) {
    const base = st.confirmado.has(id) ? [st.confirmado.get(id)] : [];
    const linha = fila.comPendentes(base).find((l) => l.produto_id === id);
    if (linha) st.local.set(id, linha);
    else st.local.delete(id);
  }
}

/** A regra de "última" e "mesma marca" é a de precos.js, igual em todas as telas. */
function montarHistorico(linhas) {
  st.hist = montarPrecos(linhas);
}

/** A marca que a linha mostra: a escolhida; senão, a da última compra. */
function marcaDe(id) {
  return marcaMostrada(st.hist, { ...item(id), produto_id: id });
}

/** O tamanho que a linha mostra: o gravado; senão, o sugerido (ver o topo). */
function tamanhoDaLinha(id) {
  if (!tamanhoDe(item(id)) && st.semTamanho.has(id)) return null;
  return tamanhoMostrado(st.hist, { ...item(id), produto_id: id }, marcaDe(id));
}

/**
 * Ao mexer na linha (preço, carrinho), a marca e o tamanho que ela mostra
 * viram os gravados: são os que vão para o Histórico quando a compra for
 * finalizada. Só os que ainda não estão gravados.
 */
function camposMostrados(id) {
  const campos = {};
  const i = item(id);
  if (!i.marca && marcaDe(id)) campos.marca = marcaDe(id);
  const t = tamanhoDaLinha(id);
  if (!tamanhoDe(i) && t) Object.assign(campos, camposDeTamanho(t));
  return campos;
}

const comparaNome = (a, b) => a.nome.localeCompare(b.nome, "pt-BR", { sensitivity: "base" });

function ativos() {
  return [...st.produtos.values()].filter((p) => p.ativo);
}
function noCarrinho() {
  return [...st.produtos.values()].filter((p) => item(p.id).no_carrinho).sort(comparaNome);
}
function aLevar() {
  return ativos().filter((p) => item(p.id).quantidade >= 1 && !item(p.id).no_carrinho);
}
function foraDoCarrinho() {
  return ativos().filter((p) => !item(p.id).no_carrinho);
}

/** Total do carrinho: só itens com preço E quantidade ≥ 1. */
function totalCarrinho() {
  return noCarrinho().reduce((s, p) => {
    const i = item(p.id);
    return i.preco_unitario == null || i.quantidade < 1 ? s : s + i.quantidade * Number(i.preco_unitario);
  }, 0);
}

function grupoDe(p) {
  return st.categorias.some((c) => c.id === p.categoria_id) ? p.categoria_id : "sem-categoria";
}

/** Seções na ordem dos corredores; dentro de cada uma, ordem alfabética. */
function agrupar(lista) {
  const grupos = st.categorias.map((c) => ({ id: c.id, nome: c.nome, produtos: [] }));
  grupos.push({ id: "sem-categoria", nome: "Sem categoria", produtos: [] });
  const porId = new Map(grupos.map((g) => [g.id, g]));
  for (const p of lista) porId.get(grupoDe(p)).produtos.push(p);
  for (const g of grupos) g.produtos.sort(comparaNome);
  return grupos.filter((g) => g.produtos.length);
}

function aLevarNoGrupo(grupoId) {
  return aLevar().filter((p) => grupoDe(p) === grupoId).length;
}

// ---------------------------------------------------------------------------
// Filtro salvo no aparelho
// ---------------------------------------------------------------------------
function lerFiltro() {
  try {
    const f = localStorage.getItem(CHAVE_FILTRO);
    return FILTROS.includes(f) ? f : "levar";
  } catch {
    return "levar";
  }
}
/**
 * Para outras telas escolherem o filtro antes de abrir a Lista (o "Ir para o
 * carrinho" do Reiniciar). Salva no aparelho como se a pessoa tivesse tocado.
 */
export function definirFiltroDaLista(f) {
  if (!FILTROS.includes(f)) return;
  st.filtro = f;
  try { localStorage.setItem(CHAVE_FILTRO, f); } catch { /* sem armazenamento: vale só nesta sessão */ }
}

function trocarFiltro(f) {
  st.filtro = f;
  try { localStorage.setItem(CHAVE_FILTRO, f); } catch { /* sem armazenamento: vale só nesta sessão */ }
  desenharTudo();
  window.scrollTo(0, 0);
}

// ---------------------------------------------------------------------------
// Desenho
// ---------------------------------------------------------------------------
function campoEmEdicao() {
  const ativo = document.activeElement;
  return ativo && ativo.matches?.("#tela input") ? ativo : null;
}

function desenharTudo() {
  if (!st.ctx?.vivo()) return;
  // Redesenhar o corpo com um campo em foco apagaria o que está sendo
  // digitado: o cabeçalho e o topo atualizam já, o corpo quando o foco sair.
  desenharCabecalho();
  atualizarTopo();
  if (campoEmEdicao()) {
    st.redesenhoPendente = true;
    return;
  }
  st.redesenhoPendente = false;
  desenharCorpo();
}

function desenharCabecalho() {
  const carrinho = noCarrinho().length;
  const naLista = carrinho + aLevar().length;
  st.ctx.cabecalho.innerHTML = `
    <div>
      <h1 class="cabecalho__titulo">Compras</h1>
      <div class="cabecalho__sub" data-selo>${htmlSelo()}</div>
    </div>
    <div class="cabecalho__direita">
      <div class="cabecalho__valor">${moeda(totalCarrinho())}</div>
      <div class="cabecalho__prog">${carrinho} de ${plural(naLista, "item", "itens")}</div>
    </div>`;
}

const ICONE_BUSCA = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/></svg>`;

function desenharTopo() {
  const topo = st.ctx.topo;
  topo.innerHTML = `
    <div class="segmento" role="group" aria-label="Mostrar">
      ${FILTROS.map((f) => `<button type="button" class="segmento__opcao" data-filtro="${f}"></button>`).join("")}
    </div>
    <div class="busca">
      <label class="busca__caixa">
        ${ICONE_BUSCA}
        <input class="busca__entrada" type="search" placeholder="Buscar ou adicionar produto…"
               aria-label="Buscar ou adicionar produto" autocomplete="off" enterkeyhint="search">
        <button type="button" class="busca__limpar" aria-label="Limpar busca" hidden>✕</button>
      </label>
    </div>
    <div class="chips" id="chips" aria-label="Ir para o corredor"></div>`;

  for (const b of topo.querySelectorAll("[data-filtro]")) {
    b.addEventListener("click", () => trocarFiltro(b.dataset.filtro));
  }

  const entrada = topo.querySelector(".busca__entrada");
  const limpar = topo.querySelector(".busca__limpar");
  entrada.value = st.busca;
  limpar.hidden = !st.busca;
  // A busca fica no topo, fora de #tela: digitar nela não segura redesenhos.
  entrada.addEventListener("input", () => {
    st.busca = entrada.value;
    limpar.hidden = !st.busca;
    desenharTudo();
  });
  limpar.addEventListener("click", () => {
    st.busca = "";
    entrada.value = "";
    limpar.hidden = true;
    entrada.focus();
    desenharTudo();
  });

  ligarArrasteDosAtalhos(topo.querySelector("#chips"));
}

function atualizarTopo() {
  const topo = st.ctx.topo;
  const n = { todos: foraDoCarrinho().length, levar: aLevar().length, carrinho: noCarrinho().length };
  const nome = { todos: "Todos", levar: "A levar", carrinho: "Carrinho" };
  for (const b of topo.querySelectorAll("[data-filtro]")) {
    const f = b.dataset.filtro;
    b.textContent = `${nome[f]} · ${n[f]}`;
    b.setAttribute("aria-pressed", String(st.filtro === f));
  }
  desenharAtalhos();
}

// ---------------------------------------------------------------------------
// Atalhos de corredor
//
// Uma linha só, rolando para o lado. Ordem alfabética (as seções continuam na
// ordem dos corredores). N = itens a levar do corredor; no filtro "A levar" os
// de 0 somem. Escondidos no filtro "Carrinho" e durante a busca.
// No celular o dedo rola sozinho (overflow nativo). No computador, arrastar com
// o mouse rola por pointer events; um arraste de mais de 5 px NÃO conta como
// toque, para não pular para um corredor sem querer.
// ---------------------------------------------------------------------------
function desenharAtalhos() {
  const chips = st.ctx.topo.querySelector("#chips");
  if (!chips) return;
  let lista = [];
  if (!st.busca.trim() && st.filtro !== "carrinho") {
    const base = st.filtro === "todos" ? foraDoCarrinho() : aLevar();
    lista = agrupar(base)
      .map((g) => ({ ...g, n: aLevarNoGrupo(g.id) }))
      .filter((g) => st.filtro !== "levar" || g.n > 0)
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR", { sensitivity: "base" }));
  }
  const html = lista.map((g) =>
    `<button type="button" class="chip" data-ir="${esc(g.id)}">${esc(g.nome)} · ${g.n}</button>`).join("");
  // Só reescreve se mudou: reescrever no meio de um arraste faria a linha pular.
  if (chips.dataset.html !== html) {
    chips.innerHTML = html;
    chips.dataset.html = html;
  }
}

function ligarArrasteDosAtalhos(chips) {
  ligarArrasteHorizontal(chips, (e) => {
    const chip = e.target.closest("[data-ir]");
    if (chip) irParaSecao(chip.dataset.ir);
  });
}

/** Rola até a seção descontando a altura REAL do topo fixo naquele momento. */
function irParaSecao(id) {
  const alvo = st.ctx.tela.querySelector(`[data-grupo="${CSS.escape(id)}"]`);
  if (!alvo) return;
  const folga = document.querySelector(".topo-fixo").getBoundingClientRect().height;
  window.scrollTo({ top: alvo.getBoundingClientRect().top + window.scrollY - folga, behavior: "smooth" });
}

// ---------------------------------------------------------------------------
// Corpo
// ---------------------------------------------------------------------------
function desenharCorpo() {
  const tela = st.ctx.tela;
  tela.className = "tela";
  const temAtalhos = !!st.ctx.topo.querySelector("#chips")?.children.length;
  tela.classList.toggle("tela--lista", !temAtalhos);

  const termo = normalizar(st.busca.trim());
  let html;

  if (termo) {
    // A busca ignora o filtro: todos os produtos ativos que batem, zerados e do
    // carrinho inclusive, para dar para aumentar a quantidade direto daqui.
    const achados = ativos().filter((p) => normalizar(p.nome).includes(termo));
    html = achados.length
      ? htmlGrupos(agrupar(achados), { comMais: true, comCarrinho: true })
      : htmlSemResultado(st.busca.trim());
  } else if (st.filtro === "carrinho") {
    html = noCarrinho().length
      ? htmlBlocoCarrinho()
      : htmlVazio("Carrinho vazio", "Toque no círculo de um item para marcar que você pegou.");
  } else {
    const todos = st.filtro === "todos";
    const grupos = agrupar(todos ? foraDoCarrinho() : aLevar());
    const carrinho = noCarrinho().length ? htmlBlocoCarrinho() : "";
    if (grupos.length) {
      html = htmlGrupos(grupos, { comMais: todos }) + carrinho;
    } else if (todos) {
      html = htmlVazio("Tudo no carrinho", "Todos os produtos já estão no carrinho.") + carrinho;
    } else {
      // 6a. Com algo no carrinho, "todos estão com quantidade 0" deixaria de ser verdade.
      const texto = noCarrinho().length
        ? "Tudo o que estava na lista já está no carrinho."
        : "Todos os produtos estão com quantidade 0. Aumente a quantidade do que precisa ou cadastre um produto novo.";
      html = `
        <div class="vazio">
          <div class="vazio__titulo">Nenhum item para levar</div>
          <div class="vazio__texto">${esc(texto)}</div>
          <button type="button" class="botao botao--secundario" data-ver-todos>Ver todos os produtos</button>
        </div>${carrinho}`;
    }
  }

  tela.innerHTML = html;
  ligarCorpo(tela);

  if (st.focarPreco) {
    st.focarPreco = false;
    tela.querySelector(`[data-produto="${CSS.escape(st.aberto ?? "")}"] [data-preco]`)?.focus();
  }
}

function htmlVazio(titulo, texto) {
  return `
    <div class="vazio">
      <div class="vazio__titulo">${esc(titulo)}</div>
      <div class="vazio__texto">${esc(texto)}</div>
    </div>`;
}

function htmlSemResultado(texto) {
  return `
    <div class="sem-resultado">
      <div class="sem-resultado__titulo">Nenhum produto encontrado</div>
      <div class="sem-resultado__texto">Não achamos “${esc(texto)}” na sua lista.</div>
      <button type="button" class="adicionar" data-adicionar>
        <span class="adicionar__mais" aria-hidden="true">+</span>
        <span>
          <span class="adicionar__titulo">Adicionar “${esc(texto)}”</span>
          <span class="adicionar__sub">Cadastra o produto e já coloca quantidade 1</span>
        </span>
      </button>
    </div>`;
}

function htmlGrupos(grupos, { comMais = false, comCarrinho = false } = {}) {
  return grupos.map((g) => `
    <section data-grupo="${esc(g.id)}">
      <div class="secao">
        <span class="secao__titulo">${esc(g.nome)}</span>
        <span class="secao__conta">${aLevarNoGrupo(g.id)} a levar</span>
      </div>
      ${g.produtos.map((p) => comCarrinho && item(p.id).no_carrinho
        ? htmlLinhaCarrinho(p)
        : htmlLinha(p, comMais)).join("")}
    </section>`).join("");
}

function htmlBlocoCarrinho() {
  const itens = noCarrinho();
  return `
    <div class="secao secao--carrinho">
      <span class="secao__titulo">No carrinho · ${itens.length}</span>
      <span class="secao__conta secao__conta--total" data-total-carrinho>${moeda(totalCarrinho())}</span>
    </div>
    ${itens.map(htmlLinhaCarrinho).join("")}`;
}

/**
 * "Toddy · 700 g · 2 un. · última R$ 16,10". Marca e tamanho omitidos se não
 * houver; com quantidade 0 o "0 un." some ("Toddy · 700 g · última R$ 16,10").
 */
function subLinha(p) {
  const i = item(p.id);
  const ult = st.hist.ultima.get(p.id);
  return [marcaDe(p.id), textoTamanho(tamanhoDaLinha(p.id)), i.quantidade > 0 ? `${i.quantidade} un.` : "",
    ult ? `última ${moeda(ult.preco)}` : "primeira compra"]
    .filter(Boolean).join(" · ");
}

function htmlLinha(p, comMais) {
  const i = item(p.id);
  const aberta = st.aberto === p.id;
  const classes = ["linha", i.quantidade === 0 ? "linha--zerada" : "", aberta ? "linha--aberta" : ""].filter(Boolean).join(" ");
  return `
    <div class="${classes}" data-produto="${esc(p.id)}">
      <div class="linha__corpo">
        <button type="button" class="linha__marcar" data-acao="marcar" aria-label="Marcar ${esc(p.nome)} como pego">
          <span class="linha__marcador"></span>
        </button>
        <button type="button" class="linha__texto" data-acao="abrir" aria-expanded="${aberta}">
          <span class="linha__nome">${esc(p.nome)}${htmlPendente(p.id)}</span>
          <span class="linha__sub">${esc(subLinha(p))}</span>
        </button>
        ${comMais && !aberta ? `<button type="button" class="linha__mais" data-acao="mais" aria-label="Somar 1 em ${esc(p.nome)}">+</button>` : ""}
      </div>
      ${aberta ? htmlEditor(p) : ""}
    </div>`;
}

function htmlLinhaCarrinho(p) {
  const i = item(p.id);
  const aberta = st.aberto === p.id;
  const temPreco = i.preco_unitario != null;
  const marca = marcaDe(p.id);
  const indice = (st.ctx.estado.membros ?? []).findIndex((m) => m.user_id === i.marcado_por);
  return `
    <div class="carrinho${aberta ? " linha--aberta" : ""}" data-produto="${esc(p.id)}">
      <div class="carrinho__corpo">
        <button type="button" class="carrinho__marcar" data-acao="marcar" aria-label="Tirar ${esc(p.nome)} do carrinho">
          <span class="carrinho__check" aria-hidden="true">✓</span>
        </button>
        <button type="button" class="carrinho__texto" data-acao="abrir" aria-expanded="${aberta}">
          <span class="carrinho__nome"><span class="carrinho__riscado">${esc(p.nome)}</span>${htmlPendente(p.id)}</span>
          <span class="carrinho__sub" data-sub-carrinho>${htmlSubCarrinho(p.id, marca)}</span>
        </button>
        <span class="carrinho__total${temPreco ? "" : " carrinho__total--sem"}" data-total-linha>${htmlTotalLinha(p.id)}</span>
        ${indice >= 0 ? htmlAvatar(st.ctx.estado.membros[indice], indice) : ""}
      </div>
      ${aberta ? htmlEditor(p) : ""}
    </div>`;
}

/**
 * "Toddy · 700 g · 2 × R$ 16,10": a conta nunca é cortada; se faltar espaço,
 * a marca ganha reticências primeiro, depois o tamanho (CSS em estilo.css).
 */
function htmlSubCarrinho(id, marca) {
  const i = item(id);
  const conta = i.preco_unitario != null ? `${i.quantidade} × ${moeda(i.preco_unitario)}` : `${i.quantidade} un.`;
  const partes = [];
  if (marca) partes.push(["marca", marca]);
  const tamanho = textoTamanho(tamanhoDaLinha(id));
  if (tamanho) partes.push(["tamanho", tamanho]);
  partes.push(["conta", conta]);
  return partes.map(([classe, texto], n) =>
    `<span class="sub__${classe}">${n ? "&nbsp;· " : ""}${esc(texto)}</span>`).join("");
}

function htmlTotalLinha(id) {
  const i = item(id);
  return i.preco_unitario == null ? "sem preço" : moeda(i.quantidade * Number(i.preco_unitario));
}

// ---------------------------------------------------------------------------
// Linha aberta: chip de marca, contador, preço, conta e selo
// ---------------------------------------------------------------------------
function htmlEditor(p) {
  const i = item(p.id);
  const marca = marcaDe(p.id);
  const tamanho = textoTamanho(tamanhoDaLinha(p.id));
  return `
    <div class="editor">
      <div class="editor__marca">
        <span class="editor__rotulo">Marca</span>
        <button type="button" class="chip-marca${st.marcasAbertas ? " chip-marca--aberto" : ""}${marca ? "" : " chip-marca--vazio"}"
                data-acao="marcas" aria-expanded="${st.marcasAbertas}">
          <span class="chip-marca__texto">${esc(marca || "Marca")}</span><span class="chip-marca__seta" aria-hidden="true">▾</span>
        </button>
        <button type="button" class="chip-marca chip-tamanho${tamanho ? "" : " chip-marca--vazio"}"
                data-acao="tamanho" aria-label="Tamanho: ${esc(tamanho || "não informado")}">
          <span class="chip-marca__texto">${esc(tamanho || "Tamanho")}</span><span class="chip-marca__seta" aria-hidden="true">▾</span>
        </button>
      </div>
      ${st.marcasAbertas ? htmlMarcas(p.id, marca) : ""}
      <div class="editor__controles">
        <div class="contador">
          <button type="button" class="contador__menos" data-acao="menos" aria-label="Diminuir">−</button>
          <span class="contador__valor" aria-live="polite">${i.quantidade}</span>
          <button type="button" class="contador__mais" data-acao="mais" aria-label="Aumentar">+</button>
        </div>
        <label class="preco">
          <span class="preco__moeda">R$</span>
          <input class="preco__entrada" data-preco type="text" inputmode="decimal" enterkeyhint="done"
                 placeholder="0,00" aria-label="Preço unitário de ${esc(p.nome)}" autocomplete="off"
                 value="${i.preco_unitario == null ? "" : numero(i.preco_unitario).replace(/\./g, "")}">
        </label>
      </div>
      <div class="editor__conta" data-conta>${htmlConta(p.id)}</div>
      <div class="editor__medida" data-medida>${htmlMedida(p.id)}</div>
      <div class="editor__selo" data-selo-preco>${htmlSeloPreco(p.id)}</div>
      <button type="button" class="link-historico" data-acao="historico">Histórico de preços ›</button>
    </div>`;
}

function htmlMarcas(id, atual) {
  const marcas = st.hist.marcas.get(id) ?? [];
  const atualNorm = normalizar(atual ?? "");
  return `
    <div class="marcas" role="listbox" aria-label="Marcas já compradas">
      ${marcas.map((m) => {
        const marcada = normalizar(m.marca) === atualNorm;
        return `
          <button type="button" class="marcas__opcao" role="option" aria-selected="${marcada}" data-marca="${esc(m.marca)}">
            <span class="marcas__texto">
              <span class="marcas__nome">${esc(m.marca)}</span>
              <span class="marcas__sub">última ${moeda(m.preco)} · ${dataCurta(m.data)}</span>
            </span>
            <span class="marcas__check" aria-hidden="true">${marcada ? "✓" : ""}</span>
          </button>`;
      }).join("")}
      ${st.digitandoMarca ? `
        <div class="marcas__outra">
          <input class="marcas__entrada" data-nova-marca type="text" placeholder="Nome da marca"
                 aria-label="Nome da nova marca" autocomplete="off" enterkeyhint="done">
          <button type="button" class="marcas__ok" data-acao="salvar-marca">OK</button>
        </div>` : `
        <button type="button" class="marcas__opcao marcas__opcao--outra" data-acao="outra-marca">
          <span class="marcas__texto">
            <span class="marcas__nome">Outra marca…</span>
            <span class="marcas__sub">Digitar nova marca</span>
          </span>
        </button>`}
    </div>`;
}

/** "3 × R$ 7,99 = R$ 23,97", só com quantidade > 1 e preço preenchido. */
function htmlConta(id) {
  const i = item(id);
  if (i.quantidade <= 1 || i.preco_unitario == null) return "";
  return `${i.quantidade} × ${moeda(i.preco_unitario)} = ${moeda(i.quantidade * Number(i.preco_unitario))}`;
}

/** "R$ 23,00/kg", só com tamanho E preço. */
function htmlMedida(id) {
  const i = item(id);
  return textoMedida(porMedida(i.preco_unitario, tamanhoDaLinha(id)));
}

/**
 * Selo de comparação de preço:
 *   - item no carrinho sem preço → aviso "Digite o preço para somar no carrinho";
 *   - produto nunca comprado → "primeira compra";
 *   - sem preço digitado → nada;
 *   - o resto é a regra de precos.js (comparar): mesma marca e tamanho →
 *     preço unitário; outro tamanho da mesma família → preço por medida;
 *     outra marca → cinza; embalagem de outra família → "Embalagem diferente".
 *   - maior ▲ vermelho, menor ▼ verde, igual "= mesmo preço": seta e cor
 *     juntas, percentual arredondado para inteiro.
 */
function htmlSeloPreco(id) {
  const i = item(id);
  if (i.no_carrinho && i.preco_unitario == null) {
    return `<span class="selo-aviso">Digite o preço para somar no carrinho</span>`;
  }
  const c = comparar(st.hist, {
    produto_id: id, marca: marcaDe(id), tamanho: tamanhoDaLinha(id),
    preco: i.preco_unitario == null ? null : Number(i.preco_unitario),
  });
  if (!c) return `<span class="selo-preco selo-preco--neutro">primeira compra</span>`;
  if (i.preco_unitario == null) return "";
  const { selo, contra, nota } = partesDoSelo(c);
  return `${selo}${contra ? `<span class="selo-preco__contra">${contra}</span>` : ""}${nota ? `<span class="selo-preco__nota">${esc(nota)}</span>` : ""}`;
}

/** Atualiza só o que depende do preço/quantidade, sem tocar no campo em foco. */
function atualizarAoVivo(id) {
  desenharCabecalho();
  atualizarTopo();
  const linha = st.ctx.tela.querySelector(`[data-produto="${CSS.escape(id)}"]`);
  if (linha) {
    const conta = linha.querySelector("[data-conta]");
    if (conta) conta.textContent = htmlConta(id);
    const medida = linha.querySelector("[data-medida]");
    if (medida) medida.textContent = htmlMedida(id);
    const selo = linha.querySelector("[data-selo-preco]");
    if (selo) selo.innerHTML = htmlSeloPreco(id);
    const sub = linha.querySelector("[data-sub-carrinho]");
    if (sub) sub.innerHTML = htmlSubCarrinho(id, marcaDe(id));
    const total = linha.querySelector("[data-total-linha]");
    if (total) {
      total.textContent = htmlTotalLinha(id);
      total.classList.toggle("carrinho__total--sem", item(id).preco_unitario == null);
    }
  }
  const totalCar = st.ctx.tela.querySelector("[data-total-carrinho]");
  if (totalCar) totalCar.textContent = moeda(totalCarrinho());
}

// ---------------------------------------------------------------------------
// Interação
// ---------------------------------------------------------------------------
function ligarCorpo(tela) {
  tela.querySelector("[data-ver-todos]")?.addEventListener("click", () => trocarFiltro("todos"));
  tela.querySelector("[data-adicionar]")?.addEventListener("click", () => abrirFolhaCategoria(st.busca.trim()));

  for (const linha of tela.querySelectorAll("[data-produto]")) {
    const id = linha.dataset.produto;
    linha.addEventListener("click", (e) => {
      const alvo = e.target.closest("[data-acao], [data-marca]");
      if (!alvo) return;
      if (alvo.dataset.marca !== undefined) return escolherMarca(id, alvo.dataset.marca);
      ({
        marcar: () => alternarCarrinho(id),
        abrir: () => alternarAberta(id),
        mais: () => mudarQuantidade(id, +1),
        menos: () => mudarQuantidade(id, -1),
        marcas: () => { st.marcasAbertas = !st.marcasAbertas; st.digitandoMarca = false; desenharCorpo(); },
        "outra-marca": () => {
          st.digitandoMarca = true;
          desenharCorpo();
          st.ctx.tela.querySelector("[data-nova-marca]")?.focus();
        },
        "salvar-marca": () => salvarMarcaDigitada(id),
        tamanho: () => abrirFolhaTamanho(id),
        // Renomear, mudar corredor ou excluir lá dentro: a Lista relê tudo.
        historico: () => abrirFolhaProduto(id, { aoMudar: () => st.ctx.redesenhar() }),
      })[alvo.dataset.acao]?.();
    });

    const preco = linha.querySelector("[data-preco]");
    if (preco) ligarCampoPreco(id, preco);

    const novaMarca = linha.querySelector("[data-nova-marca]");
    novaMarca?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); salvarMarcaDigitada(id); }
      if (e.key === "Escape") { st.digitandoMarca = false; novaMarca.blur(); desenharCorpo(); }
    });
  }
}

function alternarAberta(id) {
  st.aberto = st.aberto === id ? null : id;
  st.marcasAbertas = false;
  st.digitandoMarca = false;
  desenharCorpo();
}

/**
 * Tocar no círculo marca como pego (no_carrinho, marcado_por = quem tocou) ou
 * desmarca (volta para a seção). Marcar algo com quantidade 0 põe 1: no
 * carrinho há pelo menos uma unidade. Marcado sem preço, a linha abre já com o
 * foco no preço e o aviso de que, sem preço, não soma.
 */
function alternarCarrinho(id) {
  const i = item(id);
  if (i.no_carrinho) {
    mudar(id, { no_carrinho: false, marcado_por: null });
    if (st.aberto === id) st.aberto = null;
  } else {
    const campos = { no_carrinho: true, marcado_por: st.ctx.estado.usuario.id, ...camposMostrados(id) };
    if (i.quantidade < 1) campos.quantidade = 1;
    mudar(id, campos);
    if (i.preco_unitario == null) {
      st.aberto = id;
      st.marcasAbertas = false;
      st.focarPreco = true;
    }
  }
  desenharTudo();
}

function mudarQuantidade(id, delta) {
  const q = Math.max(0, item(id).quantidade + delta);
  if (q === item(id).quantidade) return;
  mudar(id, { quantidade: q });
  desenharTudo();
}

function escolherMarca(id, marca) {
  st.marcasAbertas = false;
  st.digitandoMarca = false;
  const campos = { marca };
  // Tamanho gravado igual ao que a marca antiga sugeria = veio da sugestão:
  // acompanha a marca nova. Escolhido à mão (outro valor), fica. Sem tamanho
  // gravado, a sugestão da marca nova aparece sozinha (tamanhoDaLinha).
  const gravado = tamanhoDe(item(id));
  if (gravado && !mesmaMarca(marca, marcaDe(id)) && mesmoTamanho(gravado, tamanhoSugerido(st.hist, id, marcaDe(id)))) {
    Object.assign(campos, camposDeTamanho(tamanhoSugerido(st.hist, id, marca)));
  }
  mudar(id, campos);
  desenharTudo();
}

// ---------------------------------------------------------------------------
// Folha de tamanho
// ---------------------------------------------------------------------------

/** Os tamanhos já comprados do produto, sem repetir: os da marca da linha primeiro, mais novo primeiro. */
function tamanhosComprados(id) {
  const marca = marcaDe(id);
  const compras = (st.hist.doProduto.get(id) ?? []).filter((r) => r.tamanho);
  const ordem = [...compras.filter((r) => mesmaMarca(r.marca, marca)), ...compras.filter((r) => !mesmaMarca(r.marca, marca))];
  const vistos = [];
  for (const r of ordem) if (!vistos.some((v) => mesmoTamanho(v.tamanho, r.tamanho))) vistos.push(r);
  return vistos;
}

/** Aceita vírgula ou ponto, até 3 casas; > 0 e cabe em numeric(10,3). */
function lerQuantidadeDeTamanho(texto) {
  const t = String(texto ?? "").trim().replace(/\s/g, "");
  if (!/^\d{1,7}([.,]\d{1,3})?$/.test(t)) return null;
  const v = Number(t.replace(",", "."));
  return v > 0 ? v : null;
}

function abrirFolhaTamanho(id) {
  const p = st.produtos.get(id);
  const folha = abrirFolha({ rotulo: `Tamanho de ${p?.nome ?? "produto"}` });
  const marca = marcaDe(id);
  const atual = tamanhoDaLinha(id);
  const comprados = tamanhosComprados(id);
  let outro = false;
  let unidade = null;

  const desenhar = () => {
    folha.corpo.innerHTML = `
      <div class="folha__titulo">Tamanho</div>
      <div class="folha__texto">${esc([p?.nome, marca].filter(Boolean).join(" · "))}</div>
      <div class="folha__lista">
        ${comprados.map((r) => {
          const marcado = mesmoTamanho(r.tamanho, atual);
          const sub = [mesmaMarca(r.marca, marca) ? "" : r.marca, `última ${moeda(r.preco)}`, dataCurta(r.data)].filter(Boolean).join(" · ");
          return `
            <button type="button" class="marcas__opcao" data-tam="${esc(`${r.tamanho.qtd}|${r.tamanho.unidade}`)}" aria-pressed="${marcado}">
              <span class="marcas__texto">
                <span class="marcas__nome">${esc(textoTamanho(r.tamanho))}</span>
                <span class="marcas__sub">${esc(sub)}</span>
              </span>
              <span class="marcas__check" aria-hidden="true">${marcado ? "✓" : ""}</span>
            </button>`;
        }).join("")}
        ${outro ? `
          <div class="tamanho-outro">
            <label class="tamanho-outro__campo">
              <span class="campo__rotulo">Quantidade</span>
              <input class="campo__entrada" data-tam-qtd type="text" inputmode="decimal" placeholder="Ex.: 700 ou 0,7"
                     autocomplete="off" enterkeyhint="done" aria-label="Quantidade do tamanho">
            </label>
            <div class="tamanho-outro__unidades" role="group" aria-label="Unidade">
              ${UNIDADES.map((u) => `<button type="button" class="tamanho-outro__unidade" data-unidade="${u}" aria-pressed="${u === unidade}">${u}</button>`).join("")}
            </div>
            <button type="button" class="botao" data-salvar-tam disabled>Salvar tamanho</button>
          </div>` : `
          <button type="button" class="marcas__opcao marcas__opcao--outra" data-outro-tam>
            <span class="marcas__texto">
              <span class="marcas__nome">Outro tamanho…</span>
              <span class="marcas__sub">Digitar quantidade e unidade</span>
            </span>
          </button>`}
        <button type="button" class="marcas__opcao" data-sem-tam aria-pressed="${!atual}">
          <span class="marcas__texto"><span class="marcas__nome">Sem tamanho</span></span>
          <span class="marcas__check" aria-hidden="true">${atual ? "" : "✓"}</span>
        </button>
      </div>
      <button type="button" class="botao botao--secundario folha__cancelar" data-cancelar>Cancelar</button>`;
    if (outro) ligarOutro();
  };

  // A unidade é obrigatória: "Salvar" só acende com número válido E unidade.
  const ligarOutro = () => {
    const campo = folha.corpo.querySelector("[data-tam-qtd]");
    const salvar = folha.corpo.querySelector("[data-salvar-tam]");
    const conferir = () => { salvar.disabled = !(lerQuantidadeDeTamanho(campo.value) && unidade); };
    campo.addEventListener("input", () => {
      campo.classList.toggle("campo__entrada--invalido", campo.value.trim() !== "" && !lerQuantidadeDeTamanho(campo.value));
      conferir();
    });
    campo.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); if (!salvar.disabled) salvar.click(); } });
    for (const b of folha.corpo.querySelectorAll("[data-unidade]")) {
      b.addEventListener("click", () => {
        unidade = b.dataset.unidade;
        for (const o of folha.corpo.querySelectorAll("[data-unidade]")) o.setAttribute("aria-pressed", String(o === b));
        conferir();
      });
    }
    salvar.addEventListener("click", () => {
      const qtd = lerQuantidadeDeTamanho(campo.value);
      if (qtd && unidade) terminar({ qtd, unidade });
    });
    campo.focus();
  };

  const terminar = (t) => {
    folha.fechar();
    escolherTamanho(id, t);
  };

  folha.el.addEventListener("click", (e) => {
    if (e.target.closest("[data-fechar-folha], [data-cancelar]")) return folha.fechar();
    const op = e.target.closest("[data-tam]");
    if (op) {
      const [qtd, u] = op.dataset.tam.split("|");
      return terminar({ qtd: Number(qtd), unidade: u });
    }
    if (e.target.closest("[data-sem-tam]")) return terminar(null);
    if (e.target.closest("[data-outro-tam]")) { outro = true; desenhar(); }
  });
  desenhar();
}

/** Grava o tamanho escolhido (null = "Sem tamanho"): os dois campos juntos. */
function escolherTamanho(id, t) {
  if (t) st.semTamanho.delete(id);
  else st.semTamanho.add(id);
  // "Sem tamanho" num produto sem tamanho gravado só esconde a sugestão:
  // não cria linha no banco à toa.
  if (t || tamanhoDe(item(id))) mudar(id, camposDeTamanho(t));
  desenharTudo();
}

function salvarMarcaDigitada(id) {
  const campo = st.ctx.tela.querySelector("[data-nova-marca]");
  const marca = (campo?.value ?? "").trim().replace(/\s+/g, " ");
  st.digitandoMarca = false;
  campo?.blur();
  if (!marca) { desenharCorpo(); return; }
  // Uma marca que já existe no histórico (sem diferenciar acento/maiúscula)
  // usa a grafia de lá, para a comparação de preço encontrar a referência.
  const existente = (st.hist.marcas.get(id) ?? []).find((m) => normalizar(m.marca) === normalizar(marca));
  escolherMarca(id, existente ? existente.marca : marca);
}

/**
 * Campo de preço: aceita vírgula ou ponto, até 2 casas. Vazio = sem preço
 * (grava null, nunca 0). Valor inválido ou zero não é aceito: o campo fica
 * vermelho e nada é gravado; ao sair, volta ao último valor válido.
 * Grava 600 ms depois da última tecla, ou na hora ao sair do campo.
 */
function ligarCampoPreco(id, campo) {
  const ler = () => {
    const t = campo.value.trim().replace(/\s/g, "");
    if (t === "") return { ok: true, valor: null };
    if (!/^\d{1,7}([.,]\d{0,2})?$/.test(t)) return { ok: false };
    const v = Math.round(Number(t.replace(",", ".")) * 100) / 100;
    return v > 0 ? { ok: true, valor: v } : { ok: false };
  };

  campo.addEventListener("input", () => {
    const r = ler();
    campo.closest(".preco").classList.toggle("preco--invalido", !r.ok);
    if (!r.ok) return;
    if (r.valor === (item(id).preco_unitario == null ? null : Number(item(id).preco_unitario))) return;
    mudar(id, { preco_unitario: r.valor, ...camposMostrados(id) }, { atraso: ATRASO_PRECO });
    atualizarAoVivo(id);
  });
  campo.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); campo.blur(); }
  });
  campo.addEventListener("blur", () => {
    gravarJa(id);
    const i = item(id);
    campo.value = i.preco_unitario == null ? "" : numero(i.preco_unitario).replace(/\./g, "");
    campo.closest(".preco")?.classList.remove("preco--invalido");
  });
}

// ---------------------------------------------------------------------------
// Gravação: tudo passa pela fila (fila.js), com ou sem internet
// ---------------------------------------------------------------------------

/**
 * Muda a tela já e põe os campos na fila do produto. A fila guarda no
 * aparelho, envia quando der e conta o resultado (ouvintes em ligarOuvintes):
 * confirmado, recusado pelo servidor (a linha volta ao banco e há aviso) ou
 * preso por falta de rede (a linha fica com o relógio de "pendente").
 */
function mudar(id, campos, { atraso = 0 } = {}) {
  st.local.set(id, { ...item(id), produto_id: id, ...campos });
  fila.enfileirar(id, campos, st.confirmado.has(id), { atraso });
}

/** Ao sair do campo de preço: envia sem esperar o atraso. */
function gravarJa() {
  fila.enviarJa();
}

/** Depois de uma recusa a tela PRECISA voltar ao banco, mesmo com campo em foco. */
function forcarRedesenho() {
  campoEmEdicao()?.blur();
  st.redesenhoPendente = false;
  desenharCabecalho();
  atualizarTopo();
  desenharCorpo();
}

// ---------------------------------------------------------------------------
// Tempo real
// ---------------------------------------------------------------------------
function aplicarRemoto({ eventType, new: novo, old }) {
  const id = (novo && novo.produto_id) || (old && old.produto_id);
  if (!id) return;
  const linha = eventType === "DELETE" ? null : pick(novo);
  if (linha) st.confirmado.set(id, linha);
  else st.confirmado.delete(id);

  // Produto com alteração na fila ou com campo em edição: a mudança remota
  // espera (a alteração local ainda vai chegar ao servidor e, chegando por
  // último, é ela que vale). O que está no banco aparece quando a fila esvazia.
  const ocupado = fila.temPendente(id) || campoEmEdicao()?.closest(`[data-produto="${CSS.escape(id)}"]`);
  if (ocupado) {
    st.remotos.set(id, linha);
    return;
  }
  montarLocal([id]);
  desenharTudo();
}

function pick(l) {
  return {
    produto_id: l.produto_id, quantidade: l.quantidade, no_carrinho: l.no_carrinho,
    marca: l.marca, preco_unitario: l.preco_unitario,
    tamanho_qtd: l.tamanho_qtd ?? null, tamanho_unidade: l.tamanho_unidade ?? null, marcado_por: l.marcado_por,
  };
}

function aplicarPendentes() {
  for (const id of [...st.remotos.keys()]) {
    if (fila.temPendente(id)) continue;
    montarLocal([id]);
    st.remotos.delete(id);
  }
  desenharTudo();
}

// ---------------------------------------------------------------------------
// Produto novo pela busca (6b → escolha de corredor)
// ---------------------------------------------------------------------------
/** Relógio discreto ao lado do nome: a alteração deste produto ainda não subiu. */
function htmlPendente(id) {
  if (!fila.temPendente(id)) return "";
  return `<svg class="pendente" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" role="img" aria-label="alteração ainda não enviada"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>`;
}

async function abrirFolhaCategoria(texto) {
  if (precisaDeInternet("Cadastrar produto")) return;
  const nome = nomeDeProduto(texto);
  if (!nome) return;
  const categoria = await escolherCorredor(`Adicionar “${nome}”`, st.categorias);
  if (!categoria) return;
  let produto;
  try {
    produto = await acoes.criarProduto(nome, categoria);
  } catch (falha) {
    // Nome repetido (índice único sem acento/maiúscula) e outros: a mensagem real.
    avisar(`Não foi possível cadastrar: ${falha.message}`);
    return;
  }
  st.produtos.set(produto.id, produto);
  st.busca = "";
  const entrada = st.ctx.topo.querySelector(".busca__entrada");
  if (entrada) entrada.value = "";
  st.ctx.topo.querySelector(".busca__limpar")?.setAttribute("hidden", "");
  // Já entra com quantidade 1. Se esta gravação falhar, o produto existe
  // (com 0) e o aviso da fila diz que a quantidade não foi salva.
  mudar(produto.id, { quantidade: 1 });
  desenharTudo();
}
