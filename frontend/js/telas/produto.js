// ============================================================================
// produto.js — folha do produto (tela 7d): histórico de preços e cadastro
//
// Abre de baixo para cima a partir do "Histórico de preços ›" da Lista e do
// nome de um item no detalhe da compra.
//
// ÚLTIMO PREÇO e o selo ao lado: a última compra contra as anteriores, pela
// regra de precos.js (comparar) — mesma marca e tamanho, preço por medida,
// "Outra marca" cinza, "Embalagem diferente"; sem anterior, "primeira compra".
//
// GRÁFICO: um ponto por compra, em ordem de data, mês embaixo de cada ponto e
// o último preenchido. SVG feito aqui, sem biblioteca. Com 2 ou mais compras
// com tamanho da mesma família, gráfico e cartões passam a ser em preço por
// medida (R$/kg…), só com essas compras.
//
// AÇÕES (só para produto ativo):
//   - Editar: renomeia; o índice único do banco (sem acento/maiúscula) recusa
//     nome repetido e a mensagem dele aparece como veio.
//   - Mudar categoria: escolhe outro corredor.
//   - Excluir: NUNCA apaga o produto nem o histórico. Primeiro apaga a linha
//     dele em lista_itens (se houver), depois marca ativo = false. Produto no
//     carrinho não pode ser excluído: o aviso pede para tirar antes.
// ============================================================================

import { consultas, acoes } from "../api.js";
import { esc, moeda, numero, dataBR, mesCurto, avisar, abrirFolha, abrirDialogo, precisaDeInternet } from "../ui.js";
import { montarPrecos, comparar, partesDoSelo, familia, textoTamanho, porMedida, textoMedida, rotuloMedida } from "../precos.js";
import { escolherCorredor } from "../escolhas.js";
import * as fila from "../fila.js";

/**
 * Abre a folha do produto. `aoMudar()` é chamado depois de qualquer gravação
 * confirmada (renomear, mudar corredor, excluir), para a tela de baixo reler.
 */
export async function abrirFolhaProduto(produtoId, { aoMudar = () => {} } = {}) {
  const folha = abrirFolha({ alta: true, rotulo: "Histórico de preços" });
  folha.corpo.innerHTML = `<div class="girando" aria-label="Carregando"></div>`;

  const estado = { editando: false, produto: null, categorias: [], compras: [], precos: null };

  const carregar = async () => {
    const [produtos, categorias, linhas] = await Promise.all([
      consultas.produtos(), consultas.categorias(), consultas.historicoDePrecos(),
    ]);
    estado.produto = produtos.find((p) => p.id === produtoId) ?? null;
    estado.categorias = categorias;
    estado.precos = montarPrecos(linhas);
    estado.compras = estado.precos.doProduto.get(produtoId) ?? [];
  };

  const desenhar = () => {
    const p = estado.produto;
    if (!p) {
      folha.corpo.innerHTML = `<div class="vazio"><div class="vazio__titulo">Produto não encontrado</div></div>`;
      return;
    }
    const categoria = estado.categorias.find((c) => c.id === p.categoria_id)?.nome ?? "Sem categoria";
    folha.corpo.innerHTML = `
      <div class="produto__topo">
        <div class="produto__titulos">
          ${estado.editando ? `
            <label class="campo produto__editar">
              <span class="campo__rotulo">Nome do produto</span>
              <input class="campo__entrada" data-novo-nome type="text" value="${esc(p.nome)}" autocomplete="off" enterkeyhint="done">
            </label>
            <div class="produto__editar-botoes">
              <button type="button" class="botao" data-acao="salvar-nome">Salvar</button>
              <button type="button" class="botao botao--secundario" data-acao="cancelar-nome">Cancelar</button>
            </div>` : `
            <div class="produto__nome">${esc(p.nome)}</div>
            <div class="produto__categoria">${esc(categoria)}${p.ativo ? "" : " · excluído do cadastro"}</div>`}
        </div>
        <button type="button" class="produto__fechar" data-acao="fechar" aria-label="Fechar">✕</button>
      </div>
      ${estado.compras.length ? htmlHistorico() : `
        <div class="produto__vazio">Ainda sem compras registradas.</div>`}
      <div class="alerta" data-erro hidden><div class="alerta__texto"></div></div>
      ${p.ativo ? `
        <div class="produto__acoes">
          <button type="button" class="botao" data-acao="editar">Editar</button>
          <button type="button" class="botao botao--secundario" data-acao="categoria">Mudar categoria</button>
        </div>
        <button type="button" class="produto__excluir" data-acao="excluir">Excluir produto</button>` : ""}`;
    if (estado.editando) {
      const campo = folha.corpo.querySelector("[data-novo-nome]");
      campo.focus();
      campo.select();
      campo.addEventListener("keydown", (e) => {
        if (e.key === "Enter") { e.preventDefault(); salvarNome(); }
      });
    }
  };

  const mostrarErro = (msg) => {
    const erro = folha.corpo.querySelector("[data-erro]");
    erro.querySelector(".alerta__texto").textContent = msg;
    erro.hidden = false;
    erro.scrollIntoView({ block: "nearest" });
  };

  function htmlHistorico() {
    const ult = estado.compras[0];
    let selo = `<span class="selo-preco selo-preco--neutro">primeira compra</span>`;
    let contra = "";
    const c = comparar(estado.precos, ult, { antesDe: ult });
    if (c) {
      const partes = partesDoSelo(c);
      selo = partes.selo;
      contra = [partes.contra, esc(partes.nota)].filter(Boolean).map((t) => `<div class="produto__contra">${t}</div>`).join("");
    }

    // Preço por medida quando 2+ compras têm tamanho da mesma família (a mais
    // comum); senão, preço unitário de todas as compras.
    const porFamilia = new Map();
    for (const r of estado.compras) {
      if (!r.tamanho) continue;
      const f = familia(r.tamanho);
      porFamilia.set(f, [...(porFamilia.get(f) ?? []), r]);
    }
    const [fam, daFamilia] = [...porFamilia].sort((a, b) => b[1].length - a[1].length)[0] ?? [null, []];
    const emMedida = daFamilia.length >= 2;
    const serie = emMedida
      ? daFamilia.map((r) => ({ ...r, valor: porMedida(r.preco, r.tamanho).bruto }))
      : estado.compras.map((r) => ({ ...r, valor: r.preco }));
    const menor = serie.reduce((a, r) => (r.valor < a.valor ? r : a));
    const maior = serie.reduce((a, r) => (r.valor > a.valor ? r : a));
    const media = serie.reduce((s, r) => s + r.valor, 0) / serie.length;
    const unidade = emMedida ? ` (${rotuloMedida(fam)})` : "";
    const medidaUlt = textoMedida(porMedida(ult.preco, ult.tamanho));

    return `
      <div class="produto__ultimo">
        <div>
          <div class="produto__ultimo-rotulo">Último preço${[ult.marca, textoTamanho(ult.tamanho)].filter(Boolean).map((t) => ` · ${esc(t)}`).join("")}</div>
          <div class="produto__ultimo-valor">${moeda(ult.preco)}</div>
          ${medidaUlt ? `<div class="produto__medida">${esc(medidaUlt)}</div>` : ""}
        </div>
        <div class="produto__ultimo-selo">${selo}${contra}</div>
      </div>
      <div class="secao__titulo produto__secao">Histórico de preços${esc(unidade)}</div>
      ${emMedida && daFamilia.length < estado.compras.length
        ? `<div class="produto__nota">Preço por ${esc(rotuloMedida(fam).slice(3))} das ${daFamilia.length} compras com tamanho informado (de ${estado.compras.length}).</div>` : ""}
      ${htmlGrafico([...serie].reverse())}
      <div class="produto__cartoes">
        <div class="produto__cartao">
          <div class="produto__cartao-rotulo">Menor${esc(unidade)}</div>
          <div class="produto__cartao-valor" style="color:var(--desceu)">${numero(menor.valor)}</div>
          <div class="produto__cartao-marca">${esc(menor.marca ?? "")}</div>
        </div>
        <div class="produto__cartao">
          <div class="produto__cartao-rotulo">Maior${esc(unidade)}</div>
          <div class="produto__cartao-valor" style="color:var(--subiu)">${numero(maior.valor)}</div>
          <div class="produto__cartao-marca">${esc(maior.marca ?? "")}</div>
        </div>
        <div class="produto__cartao">
          <div class="produto__cartao-rotulo">Média${esc(unidade)}</div>
          <div class="produto__cartao-valor">${numero(media)}</div>
        </div>
      </div>
      <div class="produto__compras">
        ${estado.compras.map((r) => {
          const extra = [r.marca, textoTamanho(r.tamanho)].filter(Boolean).join(" · ");
          const medida = textoMedida(porMedida(r.preco, r.tamanho));
          return `
          <div class="produto__compra">
            <span>${dataBR(r.data)}${extra ? ` <span class="produto__compra-marca">· ${esc(extra)}</span>` : ""}</span>
            <span class="produto__compra-preco">${moeda(r.preco)}${medida ? `<span class="produto__compra-medida">${esc(medida)}</span>` : ""}</span>
          </div>`;
        }).join("")}
      </div>`;
  }

  async function salvarNome() {
    const campo = folha.corpo.querySelector("[data-novo-nome]");
    const nome = campo.value.replace(/\s+/g, " ").trim();
    if (!nome || nome === estado.produto.nome) {
      estado.editando = false;
      return desenhar();
    }
    for (const b of folha.corpo.querySelectorAll("button")) b.disabled = true;
    try {
      estado.produto = await acoes.atualizarProduto(produtoId, { nome });
      estado.editando = false;
      desenhar();
      aoMudar();
    } catch (e) {
      for (const b of folha.corpo.querySelectorAll("button")) b.disabled = false;
      mostrarErro(e.message);
    }
  }

  async function mudarCategoria() {
    const p = estado.produto;
    const nova = await escolherCorredor(`Mudar “${p.nome}” de corredor`, estado.categorias, { atual: p.categoria_id });
    if (!nova || nova === p.categoria_id) return;
    try {
      estado.produto = await acoes.atualizarProduto(produtoId, { categoria_id: nova });
      desenhar();
      aoMudar();
    } catch (e) {
      mostrarErro(e.message);
    }
  }

  async function excluir() {
    const p = estado.produto;
    // Uma alteração dele ainda na fila recriaria a linha na lista depois da
    // exclusão: primeiro ela sobe, depois exclui.
    if (fila.temPendente(produtoId)) return mostrarErro("Este produto tem alteração da lista ainda subindo. Espere o “Sincronizado” e tente de novo.");
    // Lido na hora: o carrinho pode ter mudado no outro celular.
    let item;
    try {
      item = await consultas.itemDaLista(produtoId);
    } catch (e) {
      return mostrarErro(e.message);
    }
    if (item?.no_carrinho) return mostrarErro("Tire o produto do carrinho antes de excluir.");

    abrirDialogo({
      titulo: `Excluir “${p.nome}”?`,
      texto: "O produto sai da lista e do cadastro. O histórico de compras e de preços dele é mantido.",
      botoes: [
        { texto: "Excluir produto", tipo: "perigo", valor: "excluir" },
        { texto: "Cancelar", tipo: "neutro", valor: "cancelar" },
      ],
      aoEscolher: async (_, dialogo) => {
        const agora = await consultas.itemDaLista(produtoId);
        if (agora?.no_carrinho) {
          dialogo.erro("Tire o produto do carrinho antes de excluir.");
          return false;
        }
        if (agora) await acoes.apagarItemDaLista(produtoId);
        try {
          await acoes.atualizarProduto(produtoId, { ativo: false });
        } catch (e) {
          // A linha da lista já saiu; o produto continua no cadastro. Diz isso.
          aoMudar();
          dialogo.erro(`Não consegui excluir: ${e.message}. A quantidade dele na lista já foi zerada.`);
          return false;
        }
        folha.fechar();
        avisar(`“${p.nome}” foi excluído do cadastro.`, "ok");
        aoMudar();
        return true;
      },
    });
  }

  folha.el.addEventListener("click", (e) => {
    const alvo = e.target.closest("[data-acao]");
    if (!alvo) return;
    // Cadastro só com internet: o botão fica à vista e avisa, sem tentar gravar.
    ({
      fechar: () => folha.fechar(),
      editar: () => precisaDeInternet("Editar o produto") || (estado.editando = true, desenhar()),
      "salvar-nome": () => precisaDeInternet("Editar o produto") || salvarNome(),
      "cancelar-nome": () => { estado.editando = false; desenhar(); },
      categoria: () => precisaDeInternet("Mudar a categoria") || mudarCategoria(),
      excluir: () => precisaDeInternet("Excluir o produto") || excluir(),
    })[alvo.dataset.acao]?.();
  });

  try {
    await carregar();
    desenhar();
  } catch (e) {
    folha.corpo.innerHTML = `
      <div class="vazio">
        <div class="vazio__titulo">Não consegui abrir o histórico</div>
        <div class="vazio__texto">${esc(e.message)}</div>
      </div>`;
  }
}

/** Gráfico de linha (viewBox 354 × 120, como no 7d), mês embaixo de cada ponto. `valor`: preço unitário ou por medida. */
function htmlGrafico(cronologico) {
  const n = cronologico.length;
  const precos = cronologico.map((c) => c.valor);
  const min = Math.min(...precos), max = Math.max(...precos);
  const x = (i) => (n === 1 ? 177 : 30 + (i * 300) / (n - 1));
  const y = (v) => (max === min ? 55 : 90 - ((v - min) / (max - min)) * 70);
  const pontos = cronologico.map((c, i) => [x(i), y(c.valor)]);
  const titulo = cronologico.map((c) => `${dataBR(c.data)}: ${moeda(c.valor)}`).join("; ");
  return `
    <svg class="grafico" viewBox="0 0 354 120" width="100%" height="120" role="img" aria-label="${esc(titulo)}">
      <g stroke="var(--divisoria)"><line x1="0" y1="20" x2="354" y2="20"/><line x1="0" y1="55" x2="354" y2="55"/><line x1="0" y1="90" x2="354" y2="90"/></g>
      ${n > 1 ? `<polyline points="${pontos.map((p) => p.join(",")).join(" ")}" fill="none" stroke="var(--magenta)" stroke-width="3" stroke-linejoin="round"/>` : ""}
      <g fill="#fff" stroke="var(--magenta)" stroke-width="2.5">
        ${pontos.slice(0, -1).map(([px, py]) => `<circle cx="${px}" cy="${py}" r="5"/>`).join("")}
      </g>
      <circle cx="${pontos[n - 1][0]}" cy="${pontos[n - 1][1]}" r="7" fill="var(--magenta)"/>
    </svg>
    <div class="grafico__meses" aria-hidden="true">
      ${cronologico.map((c, i) => `<span style="left:${(x(i) / 354) * 100}%">${mesCurto(c.data)}</span>`).join("")}
    </div>`;
}
