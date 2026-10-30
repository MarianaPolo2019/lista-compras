// ============================================================================
// orcamento.js — aba Orçamento (telas 6c, 6d e o diálogo 7a)
//
// DE ONDE SAI CADA NÚMERO
//   comprados  = itens no carrinho;
//   pendentes  = produtos ativos com quantidade ≥ 1 fora do carrinho;
//   gasto      = soma de quantidade × preço dos itens do carrinho COM preço e
//                quantidade ≥ 1 (o mesmo total do cabeçalho da Lista);
//   barra      = gasto ÷ limite: verde até 80%, âmbar acima de 80% até 100%,
//                vermelha acima de 100% (e aí aparece o alerta de estourado);
//   saldo      = limite − gasto; sem limite, "—".
//
// ESTIMATIVA DO QUE FALTA
//   Entram os pendentes e os itens do carrinho ainda sem preço. Preço de
//   referência, nesta ordem: o preço já digitado na linha; o último preço da
//   marca da linha; o último preço do produto. Item sem nenhum desses fica FORA
//   da conta e a tela diz quantos ficaram de fora. Nenhum valor é inventado.
//
// MESMOS ITENS: o que mercado.comparar_mesmos_itens() devolve, sem recalcular.
//
// REINICIAR LISTA: antes de chamar mercado.finalizar_compra, a tela confere o
// carrinho lido na hora (vazio, item sem preço ou com quantidade 0 → aviso e
// nada é salvo). A data enviada é a de hoje em São Paulo. Erro da função
// aparece dentro do diálogo, como veio, e nada muda na tela.
// ============================================================================

import { consultas, acoes } from "../api.js";
import {
  esc, moeda, numero, plural, normalizar, dataCurta, hojeSP, dataBR, percentual1,
  avisar, abrirDialogo,
} from "../ui.js";
import { montarPrecos } from "../precos.js";
import { escolherProduto } from "../escolhas.js";
import { definirFiltroDaLista } from "./lista.js";
import { precisaDeInternet } from "../ui.js";
import * as fila from "../fila.js";

const ATRASO_LIMITE = 600;

const st = {
  ctx: null,
  dados: null,
  limiteConfirmado: null,   // o que o banco tem
  temporizador: null,
  redesenhoPendente: false,
};

function campoEmEdicao() {
  const a = document.activeElement;
  return a && a.matches?.("#tela input") ? a : null;
}

// Um redesenho (Realtime) com um campo em foco apagaria o que está sendo
// digitado: ele espera o campo perder o foco.
document.addEventListener("focusout", () => {
  setTimeout(() => {
    if (!st.redesenhoPendente || campoEmEdicao() || !st.ctx?.vivo()) return;
    st.redesenhoPendente = false;
    st.ctx.redesenhar();
  }, 0);
});

export async function telaOrcamento(ctx) {
  if (ctx.silencioso && campoEmEdicao()) {
    st.redesenhoPendente = true;
    return;
  }

  const [produtos, itensDoServidor, config, observacoes, linhas, categorias] = await Promise.all([
    consultas.produtos(), consultas.itensDaLista(), consultas.configuracoes(),
    consultas.observacoesAbertas(), consultas.historicoDePrecos(), consultas.categorias(),
  ]);
  // As contas são feitas sobre o que a Lista mostra: o banco (ou a cópia dele)
  // com as alterações da fila que ainda não subiram por cima.
  const itens = fila.comPendentes(itensDoServidor);
  // A comparação vem à parte e é feita PELO SERVIDOR: sem internet não há
  // número, e o cartão diz "Disponível com internet" em vez de um valor velho.
  let comparacao = null, erroComparacao = null, comparacaoOffline = false;
  try {
    comparacao = await consultas.compararMesmosItens();
  } catch (e) {
    if (e.rede) comparacaoOffline = true;
    else erroComparacao = e.message;
  }
  if (!ctx.vivo()) return;

  st.ctx = ctx;
  st.dados = calcular({ produtos, itens, config, observacoes, linhas, categorias, comparacao, erroComparacao });
  st.dados.comparacaoOffline = comparacaoOffline;
  st.limiteConfirmado = st.dados.limite;
  desenhar();
}

// ---------------------------------------------------------------------------
// Contas
// ---------------------------------------------------------------------------
function calcular({ produtos, itens, config, observacoes, linhas, categorias, comparacao, erroComparacao }) {
  const porId = new Map(produtos.map((p) => [p.id, p]));
  const carrinho = itens.filter((i) => i.no_carrinho && porId.has(i.produto_id));
  const pendentes = itens.filter((i) => !i.no_carrinho && i.quantidade >= 1 && porId.get(i.produto_id)?.ativo);
  const comPreco = (i) => i.preco_unitario != null && i.quantidade >= 1;
  const gasto = carrinho.filter(comPreco).reduce((s, i) => s + i.quantidade * Number(i.preco_unitario), 0);
  const carrinhoSemPreco = carrinho.filter((i) => i.preco_unitario == null && i.quantidade >= 1);

  // Estimativa: pendentes + carrinho sem preço.
  const precos = montarPrecos(linhas);
  let estimativa = 0, deFora = 0;
  for (const i of [...pendentes, ...carrinhoSemPreco]) {
    const ult = precos.ultima.get(i.produto_id);
    const marca = i.marca || ult?.marca || null;
    const daMarca = marca ? precos.porMarca.get(`${i.produto_id}|${normalizar(marca)}`) : null;
    const ref = i.preco_unitario != null ? Number(i.preco_unitario) : (daMarca?.preco ?? ult?.preco ?? null);
    if (ref == null) deFora++;
    else estimativa += i.quantidade * ref;
  }

  return {
    produtos, categorias, observacoes, comparacao, erroComparacao,
    comprados: carrinho.length,
    pendentes: pendentes.length,
    gasto,
    semPrecoNoCarrinho: carrinhoSemPreco.length,
    estimativa,
    deFora,
    limite: config?.limite_gastos == null ? null : Number(config.limite_gastos),
  };
}

// ---------------------------------------------------------------------------
// Desenho
// ---------------------------------------------------------------------------
function desenhar() {
  const d = st.dados;
  const { ctx } = st;
  ctx.cabecalho.innerHTML = `
    <div>
      <h1 class="cabecalho__titulo">Orçamento</h1>
      <div class="cabecalho__sub">${plural(d.comprados, "comprado", "comprados")} · ${plural(d.pendentes, "pendente", "pendentes")}</div>
    </div>`;

  ctx.tela.className = "tela";
  ctx.tela.innerHTML = `
    <div data-estourado>${htmlEstourado(d.limite)}</div>

    <div class="secao secao--bloco"><span class="secao__titulo">Limite de gastos</span></div>
    <div class="par">
      <label class="par__rotulo" for="limite-gastos">Valor máximo</label>
      <span class="caixa-valor">
        <span class="caixa-valor__moeda">R$</span>
        <input class="caixa-valor__entrada" id="limite-gastos" data-limite type="text" inputmode="decimal"
               enterkeyhint="done" placeholder="0,00" autocomplete="off"
               value="${d.limite == null ? "" : numero(d.limite).replace(/\./g, "")}">
      </span>
    </div>
    <div data-progresso>${htmlProgresso(d.limite)}</div>

    <div class="secao secao--bloco secao--resumo"><span class="secao__titulo">Resumo da compra</span></div>
    <div class="grade-resumo">
      ${cartao("Total gasto", moeda(d.gasto))}
      <div data-saldo>${htmlSaldo(d.limite)}</div>
      ${cartao("Itens comprados", String(d.comprados))}
      ${cartao("Itens pendentes", String(d.pendentes))}
    </div>
    ${d.semPrecoNoCarrinho ? `<p class="nota nota--abaixo">${plural(d.semPrecoNoCarrinho, "item no carrinho ainda sem preço", "itens no carrinho ainda sem preço")}: fora do total gasto.</p>` : ""}

    <div class="cartao-info">
      <div class="cartao-info__linha">
        <span class="cartao-info__rotulo">Estimativa do que falta</span>
        <span class="cartao-info__valor">${moeda(d.estimativa)}</span>
      </div>
      <div class="cartao-info__nota">Se pegar tudo, o total vai a ${moeda(d.gasto + d.estimativa)}</div>
      ${d.deFora ? `<div class="cartao-info__nota cartao-info__nota--aviso">${d.deFora === 1
        ? "1 item sem preço conhecido ficou de fora"
        : `${d.deFora} itens sem preço conhecido ficaram de fora`}</div>` : ""}
    </div>

    <div class="cartao-info">${htmlMesmosItens(d)}</div>

    <div class="secao secao--bloco secao--resumo"><span class="secao__titulo">Observações</span></div>
    <form class="obs-nova" data-obs-form>
      <input class="campo__entrada obs-nova__entrada" data-obs-texto type="text" maxlength="200"
             placeholder="Ex.: acabou o catchup" aria-label="Nova observação" autocomplete="off" enterkeyhint="done">
      <button type="submit" class="botao obs-nova__botao">+ Anotar</button>
    </form>
    ${d.observacoes.map((o) => `
      <div class="observacao" data-obs="${esc(o.id)}">
        <span class="observacao__texto">${esc(o.texto)}</span>
        <button type="button" class="observacao__lista" data-acao="obs-lista">+ Adicionar à lista</button>
        <button type="button" class="observacao__apagar" data-acao="obs-apagar" aria-label="Apagar observação “${esc(o.texto)}”">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 002 2h6a2 2 0 002-2l1-12M9 7V4h6v3"/></svg>
        </button>
      </div>`).join("")}

    <button type="button" class="botao botao--secundario reiniciar" data-acao="reiniciar">↺ Reiniciar lista (nova compra)</button>`;

  ligar();
}

function cartao(rotulo, valor, cor = "") {
  return `
    <div class="resumo">
      <div class="resumo__rotulo">${esc(rotulo)}</div>
      <div class="resumo__valor"${cor ? ` style="color:${cor}"` : ""}>${esc(valor)}</div>
    </div>`;
}

function htmlEstourado(limite) {
  const { gasto } = st.dados;
  if (!(limite > 0) || gasto <= limite) return "";
  return `
    <div class="alerta">
      <div class="alerta__titulo">▲ Orçamento estourado</div>
      <div class="alerta__texto">Você passou ${moeda(gasto - limite)} do limite.</div>
    </div>`;
}

function htmlProgresso(limite) {
  const { gasto } = st.dados;
  if (!(limite > 0)) return `<p class="nota">Nenhum limite de gastos definido.</p>`;
  const razao = gasto / limite;
  const cor = razao > 1 ? "var(--subiu)" : razao > 0.8 ? "var(--barra-atencao)" : "var(--barra-ok)";
  const pct = Math.round(razao * 100);
  return `
    <div class="progresso">
      <div class="progresso__linha">
        <span class="progresso__gasto">${moeda(gasto)} <span class="progresso__de">de ${moeda(limite)}</span></span>
        <span class="progresso__pct" style="color:${cor}">${pct}%</span>
      </div>
      <div class="progresso__trilho" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.min(pct, 100)}">
        <div class="progresso__barra" style="width:${Math.min(pct, 100)}%;background:${cor}"></div>
      </div>
    </div>`;
}

function htmlSaldo(limite) {
  if (!(limite > 0)) return cartao("Saldo restante", "—");
  const saldo = limite - st.dados.gasto;
  return cartao("Saldo restante", moeda(saldo), saldo < 0 ? "var(--subiu)" : "var(--desceu)");
}

function htmlMesmosItens(d) {
  if (d.comparacaoOffline) {
    return `<div class="cartao-info__rotulo">Mesmos itens na compra anterior</div>
            <div class="cartao-info__nota">Disponível com internet.</div>`;
  }
  if (d.erroComparacao) {
    return `<div class="cartao-info__rotulo">Mesmos itens na compra anterior</div>
            <div class="cartao-info__nota cartao-info__nota--aviso">Não consegui comparar: ${esc(d.erroComparacao)}</div>`;
  }
  const c = d.comparacao;
  if (!c?.compra_data) {
    return `<div class="cartao-info__rotulo">Mesmos itens na compra anterior</div>
            <div class="cartao-info__nota">Sem compra anterior para comparar.</div>`;
  }
  const quando = dataCurta(c.compra_data);
  if (!c.qtd_produtos) {
    return `<div class="cartao-info__rotulo">Mesmos itens na compra de ${quando}</div>
            <div class="cartao-info__nota">Os itens do carrinho ainda não têm par na compra de ${quando}.</div>`;
  }
  const dif = Number(c.diferenca);
  const selo = dif === 0
    ? `<span class="selo-preco selo-preco--neutro">= mesmo valor</span>`
    : `<span class="selo-preco selo-preco--${dif > 0 ? "subiu" : "desceu"}">${dif > 0 ? "▲" : "▼"} ${moeda(Math.abs(dif))} (${dif > 0 ? "+" : ""}${percentual1(c.percentual)}%)</span>`;
  return `
    <div class="cartao-info__rotulo">Mesmos itens na compra de ${quando}</div>
    <div class="cartao-info__selo">${selo}</div>
    <div class="cartao-info__nota">Comparando ${plural(Number(c.qtd_produtos), "produto", "produtos")} · ${moeda(c.total_hoje)} hoje contra ${moeda(c.total_anterior)}</div>`;
}

// ---------------------------------------------------------------------------
// Interação
// ---------------------------------------------------------------------------
function ligar() {
  const tela = st.ctx.tela;

  // Limite: aceita vírgula ou ponto, 2 casas; vazio = sem limite (null).
  // Grava 600 ms depois da última tecla ou ao sair. Enquanto digita, a barra,
  // o alerta e o saldo acompanham; se a gravação falhar, tudo volta ao que o
  // banco tem e aparece o aviso.
  const campo = tela.querySelector("[data-limite]");
  const ler = () => {
    const t = campo.value.trim().replace(/\s/g, "");
    if (t === "") return { ok: true, valor: null };
    if (!/^\d{1,8}([.,]\d{0,2})?$/.test(t)) return { ok: false };
    const v = Math.round(Number(t.replace(",", ".")) * 100) / 100;
    return v > 0 ? { ok: true, valor: v } : { ok: false };
  };
  const mostrarLimite = (limite) => {
    tela.querySelector("[data-estourado]").innerHTML = htmlEstourado(limite);
    tela.querySelector("[data-progresso]").innerHTML = htmlProgresso(limite);
    tela.querySelector("[data-saldo]").innerHTML = htmlSaldo(limite);
  };
  const gravar = async () => {
    clearTimeout(st.temporizador);
    const r = ler();
    if (!r.ok || r.valor === st.limiteConfirmado) return;
    try {
      st.limiteConfirmado = await acoes.limiteGastos(r.valor);
      st.limiteConfirmado = st.limiteConfirmado == null ? null : Number(st.limiteConfirmado);
      st.dados.limite = st.limiteConfirmado;
    } catch (e) {
      console.error(e);
      st.dados.limite = st.limiteConfirmado;
      campo.value = st.limiteConfirmado == null ? "" : numero(st.limiteConfirmado).replace(/\./g, "");
      mostrarLimite(st.limiteConfirmado);
      const rede = /conexão|internet|fetch/i.test(e.message ?? "");
      avisar(rede ? "Não foi possível salvar. Verifique a conexão." : `Não foi possível salvar: ${e.message}`);
    }
  };
  campo.addEventListener("input", () => {
    const r = ler();
    campo.closest(".caixa-valor").classList.toggle("caixa-valor--invalido", !r.ok);
    if (!r.ok) return;
    mostrarLimite(r.valor);
    clearTimeout(st.temporizador);
    st.temporizador = setTimeout(gravar, ATRASO_LIMITE);
  });
  campo.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); campo.blur(); } });
  // O limite é gravado direto no servidor (não entra na fila da Lista): sem
  // internet, o campo nem recebe o foco, e o aviso diz por quê.
  campo.addEventListener("focus", () => {
    if (precisaDeInternet("Mudar o limite de gastos")) campo.blur();
  });
  campo.addEventListener("blur", async () => {
    await gravar();
    // Ao sair, o campo mostra o que o banco tem, já formatado ("100,00").
    if (document.activeElement === campo) return;
    campo.value = st.limiteConfirmado == null ? "" : numero(st.limiteConfirmado).replace(/\./g, "");
    campo.closest(".caixa-valor").classList.remove("caixa-valor--invalido");
    mostrarLimite(st.limiteConfirmado);
  });

  // Nova observação.
  const form = tela.querySelector("[data-obs-form]");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (precisaDeInternet("Anotar uma observação")) return;
    const entrada = form.querySelector("[data-obs-texto]");
    const texto = entrada.value.replace(/\s+/g, " ").trim();
    if (!texto) return;
    const botao = form.querySelector("button");
    botao.disabled = true;
    try {
      await acoes.criarObservacao(texto, st.ctx.estado.usuario.id);
      entrada.value = "";
      entrada.blur();
      st.ctx.redesenhar();
    } catch (falha) {
      avisar(`Não foi possível salvar a observação: ${falha.message}`);
      botao.disabled = false;
    }
  });

  // #tela é o mesmo elemento em todas as abas e sobrevive aos redesenhos:
  // o ouvinte de clique entra uma vez só e só age com o Orçamento na tela.
  if (st.cliqueLigado) return;
  st.cliqueLigado = true;
  tela.addEventListener("click", (e) => {
    if (!(location.hash || "").startsWith("#/orcamento")) return;
    const alvo = e.target.closest("[data-acao]");
    if (!alvo) return;
    const obs = st.dados.observacoes.find((o) => o.id === alvo.closest("[data-obs]")?.dataset.obs);
    ({
      "obs-lista": () => precisaDeInternet("Pôr a observação na lista") || adicionarObservacaoNaLista(obs),
      "obs-apagar": () => precisaDeInternet("Apagar uma observação") || apagarObservacao(obs),
      reiniciar: () => precisaDeInternet("Salvar a compra") || reiniciarLista(),
    })[alvo.dataset.acao]?.();
  });
}

/**
 * "+ Adicionar à lista": escolhe (ou cadastra) o produto, soma 1 na
 * quantidade dele (lida na hora) e marca a observação como resolvida, com o
 * produto preenchido. Se só a segunda gravação falhar, a tela diz isso.
 */
async function adicionarObservacaoNaLista(obs) {
  if (!obs) return;
  const produto = await escolherProduto(st.dados.produtos, st.dados.categorias, {
    titulo: `Adicionar à lista: “${obs.texto}”`,
  });
  if (!produto) return;
  let quantidade;
  try {
    const atual = await consultas.itemDaLista(produto.id);
    quantidade = (atual?.quantidade ?? 0) + 1;
    await acoes.gravarItem(produto.id, { quantidade }, !!atual);
  } catch (e) {
    avisar(`Não foi possível pôr ${produto.nome} na lista: ${e.message}`);
    st.ctx.redesenhar();
    return;
  }
  try {
    await acoes.resolverObservacao(obs.id, produto.id);
    avisar(`${produto.nome} foi para a lista (quantidade ${quantidade}).`, "ok");
  } catch (e) {
    avisar(`${produto.nome} foi para a lista, mas não consegui marcar a observação como resolvida: ${e.message}`);
  }
  st.ctx.redesenhar();
}

function apagarObservacao(obs) {
  if (!obs) return;
  abrirDialogo({
    titulo: "Apagar observação?",
    texto: `“${obs.texto}” sai das observações.`,
    botoes: [
      { texto: "Apagar", tipo: "perigo", valor: "apagar" },
      { texto: "Cancelar", tipo: "neutro", valor: "cancelar" },
    ],
    aoEscolher: async () => {
      await acoes.apagarObservacao(obs.id);
      st.ctx.redesenhar();
      return true;
    },
  });
}

/** "Reiniciar lista": confere o carrinho (lido agora) e só então oferece salvar. */
async function reiniciarLista() {
  // Com alterações da Lista ainda na fila, o carrinho do servidor não é o que
  // a tela mostra: salvar agora gravaria uma compra diferente da que se vê.
  const pendentes = fila.quantasPendentes();
  if (pendentes) {
    avisar(`Ainda ${pendentes === 1 ? "há 1 alteração" : `há ${pendentes} alterações`} da lista subindo. Espere o “Sincronizado” e tente de novo.`);
    fila.sincronizar();
    return;
  }
  let produtos, itens, mercado;
  try {
    [produtos, itens, mercado] = await Promise.all([
      consultas.produtos(), consultas.itensDaListaDoServidor(), consultas.ultimoMercado(),
    ]);
  } catch (e) {
    avisar(`Não consegui conferir o carrinho: ${e.message}`);
    return;
  }
  const nome = new Map(produtos.map((p) => [p.id, p.nome]));
  const ativo = new Map(produtos.map((p) => [p.id, p.ativo]));
  const carrinho = itens.filter((i) => i.no_carrinho);

  if (!carrinho.length) {
    abrirDialogo({
      titulo: "Carrinho vazio",
      texto: "O carrinho está vazio. Marque os itens que você pegou antes de salvar a compra.",
      botoes: [{ texto: "Entendi", tipo: "neutro", valor: "cancelar" }],
    });
    return;
  }

  const semPreco = carrinho.filter((i) => i.preco_unitario == null).map((i) => nome.get(i.produto_id));
  const zerados = carrinho.filter((i) => i.quantidade < 1).map((i) => nome.get(i.produto_id));
  if (semPreco.length || zerados.length) {
    const partes = [];
    if (semPreco.length) partes.push(`Falta o preço de: ${semPreco.join(", ")}.`);
    if (zerados.length) partes.push(`Quantidade 0 em: ${zerados.join(", ")}.`);
    abrirDialogo({
      titulo: "Ainda não dá para salvar",
      texto: partes.join(" "),
      botoes: [
        { texto: "Ir para o carrinho", valor: "carrinho" },
        { texto: "Cancelar", tipo: "neutro", valor: "cancelar" },
      ],
      aoEscolher: () => {
        definirFiltroDaLista("carrinho");
        location.hash = "#/lista";
        return true;
      },
    });
    return;
  }

  const total = carrinho.reduce((s, i) => s + i.quantidade * Number(i.preco_unitario), 0);
  const naoPegos = itens.filter((i) => !i.no_carrinho && i.quantidade >= 1 && ativo.get(i.produto_id)).length;
  const hoje = hojeSP();

  abrirDialogo({
    titulo: "Reiniciar lista?",
    texto: "Começa uma nova compra. Veja o que acontece:",
    linhas: [
      { tipo: "salva", rotulo: "Salva",
        texto: `A compra vai para o Histórico com data, itens, quantidades, marcas e preços. ${dataBR(hoje)} · ${plural(carrinho.length, "item", "itens")} · total ${moeda(total)}.` },
      { tipo: "zera", rotulo: "Zera",
        texto: `Quantidades e marcações.${naoPegos ? ` ${naoPegos === 1 ? "1 item que não foi pego volta" : `${naoPegos} itens que não foram pegos voltam`} para 0.` : ""}` },
      { tipo: "mantem", rotulo: "Mantém", texto: "Produtos, histórico de preços, limite e observações." },
    ],
    extra: `
      <label class="campo dialogo__campo">
        <span class="campo__rotulo">Mercado</span>
        <input class="campo__entrada" data-mercado type="text" value="${esc(mercado)}" autocomplete="off" maxlength="80">
      </label>`,
    botoes: [
      { texto: "Salvar e reiniciar", valor: "salvar" },
      { texto: "Cancelar", tipo: "neutro", valor: "cancelar" },
    ],
    aoEscolher: async (_, dialogo) => {
      const nomeMercado = dialogo.el.querySelector("[data-mercado]").value.replace(/\s+/g, " ").trim() || null;
      const id = await acoes.finalizarCompra(hoje, nomeMercado);
      avisar("Compra salva no Histórico", "ok");
      location.hash = `#/historico/${id}`;
      return true;
    },
  });
}
