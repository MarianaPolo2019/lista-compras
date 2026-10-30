// ============================================================================
// ajustes.js — aba Ajustes (tela 6g do design) + o botão Sair
//
// - Compartilhamento: os dois de public.membros_casal. "Online agora" vem da
//   presença do canal Realtime (quem está com o app aberto neste momento); para
//   quem está usando, vale o mesmo selo do cabeçalho da Lista.
// - Cadastros: as contagens reais de categorias e de produtos ATIVOS (produto
//   excluído é desativado, não apagado). Cada linha abre a sua tela:
//   Categorias (categorias.js, 6h) e Produtos (produtos.js, 6i).
// - Durante a compra: "Manter tela acesa", lido de mercado.configuracoes e
//   gravado lá ao tocar. A chave só muda de posição depois que o banco
//   confirma; se a gravação falhar, ela volta e a tela mostra o erro.
// ============================================================================

import { consultas, acoes } from "../api.js";
import { esc, htmlAvatar } from "../ui.js";
import { estaOnline, estaPresente } from "../conexao.js";
import { aplicarTelaAcesa, suportado as wakeLockSuportado } from "../tela-acesa.js";
import { telaCategorias } from "./categorias.js";
import { telaProdutos } from "./produtos.js";

/** #/ajustes, #/ajustes/categorias (6h) e #/ajustes/produtos (6i). */
export async function telaAjustes(ctx) {
  const sub = (location.hash || "").replace(/^#\//, "").split("/")[1];
  if (sub === "categorias") return telaCategorias(ctx);
  if (sub === "produtos") return telaProdutos(ctx);

  // As contagens saem das mesmas leituras da Lista (que têm cópia no aparelho),
  // para os Ajustes abrirem também sem internet.
  const [membros, listaCategorias, listaProdutos, config] = await Promise.all([
    consultas.membros(), consultas.categorias(), consultas.produtos(), consultas.configuracoes(),
  ]);
  if (!ctx.vivo()) return;
  const categorias = listaCategorias.length;
  const produtos = listaProdutos.filter((p) => p.ativo).length;

  const eu = ctx.estado.usuario.id;
  const telaAcesa = !!config?.manter_tela_acesa;

  ctx.cabecalho.innerHTML = `
    <div>
      <h1 class="cabecalho__titulo">Ajustes</h1>
      <div class="cabecalho__sub">Compartilhamento e cadastros</div>
    </div>`;

  ctx.tela.className = "tela";
  ctx.tela.innerHTML = `
    <div class="secao secao--ajustes secao--primeira"><span class="secao__titulo">Compartilhamento</span></div>
    ${membros.map((m, i) => {
      const souEu = m.user_id === eu;
      const online = souEu ? estaOnline() : estaPresente(m.user_id);
      return `
        <div class="pessoa">
          ${htmlAvatar(m, i, 40)}
          <div class="pessoa__texto">
            <div class="pessoa__nome">${esc(m.nome)}${souEu ? " (você)" : ""}</div>
            <div class="pessoa__sub">${online ? "Online agora" : "Offline"}</div>
          </div>
        </div>`;
    }).join("")}

    <div class="secao secao--ajustes"><span class="secao__titulo">Cadastros</span></div>
    <a class="cadastro" href="#/ajustes/categorias">
      <span class="cadastro__nome">Categorias</span><span class="cadastro__conta">${categorias}</span>
      <span class="cadastro__seta" aria-hidden="true">›</span>
    </a>
    <a class="cadastro" href="#/ajustes/produtos">
      <span class="cadastro__nome">Produtos</span><span class="cadastro__conta">${produtos}</span>
      <span class="cadastro__seta" aria-hidden="true">›</span>
    </a>

    <div class="secao secao--ajustes"><span class="secao__titulo">Durante a compra</span></div>
    <div class="opcao">
      <div class="opcao__texto">
        <div class="opcao__nome" id="rotulo-tela-acesa">Manter tela acesa</div>
        <div class="opcao__sub">${wakeLockSuportado
          ? "Evita a tela apagar com a mão no carrinho."
          : "Este navegador não permite manter a tela acesa; a preferência fica guardada para os outros aparelhos."}</div>
      </div>
      <button type="button" class="chave" role="switch" aria-labelledby="rotulo-tela-acesa"
              aria-checked="${telaAcesa}" id="chave-tela-acesa"></button>
    </div>
    <div class="alerta" id="erro-ajustes" role="alert" hidden><div class="alerta__texto"></div></div>

    <div class="sair">
      <button type="button" class="botao botao--secundario" data-acao="sair">Sair</button>
    </div>`;

  const chave = ctx.tela.querySelector("#chave-tela-acesa");
  const erro = ctx.tela.querySelector("#erro-ajustes");
  chave.addEventListener("click", async () => {
    const pedido = chave.getAttribute("aria-checked") !== "true";
    chave.disabled = true;
    erro.hidden = true;
    try {
      const gravado = await acoes.manterTelaAcesa(pedido);
      chave.setAttribute("aria-checked", String(gravado));
      aplicarTelaAcesa(gravado);
    } catch (e) {
      erro.querySelector(".alerta__texto").textContent = `Não consegui gravar: ${e.message}`;
      erro.hidden = false;
    } finally {
      chave.disabled = false;
    }
  });
}
