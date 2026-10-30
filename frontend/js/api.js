// ============================================================================
// api.js — toda a conversa com o Supabase acontece aqui
//
// O cliente nasce apontado para o esquema `mercado`: todo `sb.from(...)` deste
// app lê e grava lá, nunca no `public` do Nosso Plano. A única exceção é a
// conferência de quem é do casal, que lê `public.membros_casal` pelo
// `sb.schema("public")` explícito, só leitura.
//
// O esquema `mercado` só responde depois de entrar na lista de "Exposed
// schemas" da Data API do Supabase. Enquanto não entrar, toda leitura falha com
// PGRST106, e a tela mostra isso com todas as letras (ver `traduzir`).
//
// SEM INTERNET: as leituras que a Lista e o Orçamento usam guardam a última
// resposta bem-sucedida no aparelho (local.js). Se o servidor não responde por
// REDE, volta essa cópia; se o servidor responde com erro, o erro sobe. Toda
// falha de rede é avisada a rede.js, e todo sucesso desfaz o aviso.
//
// A versão do supabase-js é FIXA na URL (2.118.0, não "@2"): o service worker
// guarda esses arquivos para o app abrir sem internet, e uma URL que muda de
// conteúdo sozinha deixaria o cache com uma versão e a rede com outra.
// Trocar de versão = mudar aqui E no sw.js (SUPABASE_JS), juntos.
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.118.0";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";
import { registrarFalhaDeRede, registrarSucessoDeRede, ehErroDeRede } from "./rede.js";
import * as local from "./local.js";

export const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  // retry: false — sem isto, cada leitura que falha por rede é repetida pela
  // biblioteca com espera crescente (~7 s por consulta), e o app sem internet
  // levava 14 s para abrir. A recuperação fica com o app: cópia no aparelho,
  // nova leitura quando a rede volta, quando o Realtime reconecta e a cada 15 s.
  db: { schema: "mercado", retry: false },
  auth: { persistSession: true, autoRefreshToken: true },
});

/** `rede = true`: o servidor não respondeu (sem internet), não é uma recusa. */
export class ErroApi extends Error {
  constructor(mensagem, { rede = false, codigo = null } = {}) {
    super(mensagem);
    this.rede = rede;
    this.codigo = codigo;
  }
}

/** As colunas de lista_itens que o app lê e grava (sem atualizado_por/updated_at). */
const COLUNAS_ITEM = "produto_id, quantidade, no_carrinho, marca, preco_unitario, marcado_por";

/**
 * Mensagem que a Mari consegue entender. Os erros comuns ganham frase própria;
 * qualquer outro passa com o texto original, para nunca virar um "deu certo"
 * nem um erro mudo.
 */
function traduzir(error) {
  const bruto = String(error?.message ?? error ?? "");
  if (error?.code === "PGRST106" || /schema must be one of/i.test(bruto)) {
    return "O esquema mercado ainda não está liberado na API do Supabase " +
      "(Project Settings → Data API → Exposed schemas).";
  }
  if (/failed to fetch|networkerror|load failed/i.test(bruto)) {
    return "Sem conexão com o servidor. Confira a internet e tente de novo.";
  }
  if (/jwt expired|invalid jwt/i.test(bruto)) {
    return "A sessão expirou. Saia e entre de novo.";
  }
  // Índice único que ignora acento e maiúscula (mercado.normalizar): o texto
  // original do banco vai junto, para ninguém ter de adivinhar qual regra barrou.
  if (error?.code === "23505") {
    return `Já existe um cadastro com esse nome (o app não diferencia acento nem maiúscula). Detalhe: ${bruto}`;
  }
  return bruto || "Não consegui completar a operação.";
}

function erroDe(error) {
  const rede = ehErroDeRede(error);
  if (rede) registrarFalhaDeRede();
  return new ErroApi(traduzir(error), { rede, codigo: error?.code ?? null });
}

function conferir({ data, error, count }) {
  if (error) throw erroDe(error);
  registrarSucessoDeRede();
  return count !== undefined && count !== null && data === null ? count : data;
}

/**
 * Leitura com cópia no aparelho: servidor respondeu → guarda e devolve;
 * falhou por rede e há cópia → devolve a cópia; qualquer outro caso → erro.
 */
async function comCache(chave, buscar) {
  try {
    const valor = await buscar();
    local.guardar(chave, valor).catch(() => {});
    return valor;
  } catch (e) {
    if (!e.rede) throw e;
    const guardado = await local.ler(chave).catch(() => undefined);
    if (guardado === undefined) throw e;
    return guardado.valor;
  }
}

// ---------------------------------------------------------------------------
// Sessão
// ---------------------------------------------------------------------------
export const auth = {
  async sessao() {
    const { data, error } = await sb.auth.getSession();
    if (error) throw erroDe(error);
    return data?.session ?? null;
  },
  async entrar(email, senha) {
    return conferir(await sb.auth.signInWithPassword({ email, password: senha }));
  },
  /**
   * Sai. Sem internet o servidor não responde e o signOut normal devolve erro
   * SEM apagar a sessão do aparelho; aí apaga só a local (scope "local"), para
   * "Sair" sempre levar ao Login.
   */
  async sair() {
    const { error } = await sb.auth.signOut();
    if (error) await sb.auth.signOut({ scope: "local" });
  },
  aoMudar(callback) {
    return sb.auth.onAuthStateChange((evento, sessao) => callback(evento, sessao));
  },
  /**
   * A linha do usuário em public.membros_casal, ou null se ele não estiver lá.
   * O RLS da tabela só devolve linhas para quem é do casal, então "nenhuma
   * linha" e "não é membro" são a mesma resposta. Erro de rede NÃO vira null:
   * ele sobe, e a tela diz que não conseguiu conferir, em vez de dizer que o
   * acesso não foi liberado.
   */
  async ehMembro(userId) {
    return conferir(await sb.schema("public").from("membros_casal")
      .select("user_id, nome").eq("user_id", userId).maybeSingle());
  },
};

// ---------------------------------------------------------------------------
// Leituras do esquema mercado
// ---------------------------------------------------------------------------
export const consultas = {
  /** Os dois do casal, na ordem em que foram cadastrados. */
  async membros() {
    return comCache("membros", async () => conferir(await sb.schema("public").from("membros_casal")
      .select("user_id, nome, created_at").order("created_at")) ?? []);
  },

  async categorias() {
    return comCache("categorias", async () =>
      conferir(await sb.from("categorias").select("id, nome, ordem").order("ordem")) ?? []);
  },

  /** Todos, ativos e desativados: um item desativado ainda pode estar no carrinho. */
  async produtos() {
    return comCache("produtos", async () =>
      conferir(await sb.from("produtos").select("id, nome, categoria_id, ativo").order("nome")) ?? []);
  },

  /**
   * lista_itens como o SERVIDOR tem (ou a última cópia, sem internet). As
   * alterações da fila que ainda não subiram não estão aqui: quem mostra a
   * lista junta as duas coisas (fila.comPendentes).
   */
  async itensDaLista() {
    return comCache("lista_itens", async () =>
      conferir(await sb.from("lista_itens").select(COLUNAS_ITEM)) ?? []);
  },

  /** Sempre do servidor, nunca da cópia: é para conferir o estado real agora. */
  async itensDaListaDoServidor() {
    return conferir(await sb.from("lista_itens").select(COLUNAS_ITEM)) ?? [];
  },

  /**
   * Todas as linhas de compra_itens com a data da compra, para a Lista calcular
   * no aparelho a última compra de cada produto e de cada produto + marca.
   * Lido em páginas de 1000 (o teto do PostgREST): uma resposta cortada no meio
   * daria "última" errada sem ninguém perceber.
   */
  async historicoDePrecos() {
    return comCache("historico", async () => {
      const PAGINA = 1000;
      const linhas = [];
      for (let de = 0; ; de += PAGINA) {
        const parte = conferir(await sb.from("compra_itens")
          .select("produto_id, compra_id, marca, quantidade, preco_unitario, compras!inner(data, created_at)")
          .order("id")
          .range(de, de + PAGINA - 1)) ?? [];
        linhas.push(...parte);
        if (parte.length < PAGINA) return linhas;
      }
    });
  },

  async configuracoes() {
    return comCache("configuracoes", async () => conferir(await sb.from("configuracoes")
      .select("limite_gastos, manter_tela_acesa").eq("id", 1).maybeSingle()));
  },

  /** Observações ainda não resolvidas, a mais recente primeiro. */
  async observacoesAbertas() {
    return comCache("observacoes", async () => conferir(await sb.from("observacoes")
      .select("id, texto, produto_id, created_at").eq("resolvida", false)
      .order("created_at", { ascending: false })) ?? []);
  },

  /** Uma linha de lista_itens, lida na hora (para somar 1 sem usar valor velho). */
  async itemDaLista(produtoId) {
    return conferir(await sb.from("lista_itens").select(COLUNAS_ITEM).eq("produto_id", produtoId).maybeSingle());
  },

  /** Uma compra com os itens e o nome/corredor de cada produto (ativos ou não). */
  async compra(id) {
    return conferir(await sb.from("compras")
      .select("id, data, mercado, origem, total, created_at, compra_itens(id, produto_id, marca, quantidade, preco_unitario, produtos(nome, categoria_id, ativo))")
      .eq("id", id).maybeSingle());
  },

  /**
   * mercado.comparar_mesmos_itens(): só produtos no carrinho com preço E
   * comprados na compra anterior. Devolve uma linha (ou null).
   */
  async compararMesmosItens() {
    const r = conferir(await sb.rpc("comparar_mesmos_itens", {}));
    return Array.isArray(r) ? (r[0] ?? null) : r;
  },

  /** Compras finalizadas, da mais nova para a mais antiga, com a contagem de itens. */
  async compras() {
    return conferir(await sb.from("compras")
      .select("id, data, mercado, origem, total, created_at, compra_itens(count)")
      .order("data", { ascending: false })
      .order("created_at", { ascending: false })) ?? [];
  },

  /** O mercado da compra mais recente, para pré-preencher o "Reiniciar lista". */
  async ultimoMercado() {
    const linha = conferir(await sb.from("compras").select("mercado")
      .order("data", { ascending: false }).order("created_at", { ascending: false })
      .limit(1).maybeSingle());
    return linha?.mercado ?? "";
  },

  async contar(tabela, montar = (q) => q) {
    return conferir(await montar(sb.from(tabela).select("*", { count: "exact", head: true })));
  },
};

// ---------------------------------------------------------------------------
// Escritas
// ---------------------------------------------------------------------------
export const acoes = {
  /**
   * Grava um item da lista e devolve a linha como o banco a guardou.
   *
   * Linha que já existe: UPDATE só dos campos que mudaram, para não
   * sobrescrever com valor velho o que o outro celular acabou de gravar em
   * outro campo. Linha nova (primeira vez que o produto é tocado): UPSERT por
   * produto_id, que também resolve o caso de o outro celular ter criado a
   * linha um instante antes.
   *
   * atualizado_por e updated_at NÃO vão: quem preenche é o trigger do banco.
   */
  async gravarItem(produtoId, campos, linhaExiste) {
    if (linhaExiste) {
      const linha = conferir(await sb.from("lista_itens")
        .update(campos).eq("produto_id", produtoId).select(COLUNAS_ITEM).maybeSingle());
      if (linha) return linha;
      // A linha sumiu entre a leitura e a gravação: cai para o upsert abaixo.
    }
    return conferir(await sb.from("lista_itens")
      .upsert({ produto_id: produtoId, ...campos }, { onConflict: "produto_id" })
      .select(COLUNAS_ITEM).single());
  },

  // --- Categorias (Ajustes) --------------------------------------------------
  async criarCategoria(nome, ordem) {
    return conferir(await sb.from("categorias").insert({ nome, ordem }).select("id, nome, ordem").single());
  },

  async renomearCategoria(id, nome) {
    const linha = conferir(await sb.from("categorias").update({ nome }).eq("id", id).select("id, nome, ordem").maybeSingle());
    if (!linha) throw new ErroApi("Não encontrei a categoria para gravar.");
    return linha;
  },

  async ordemDaCategoria(id, ordem) {
    const linha = conferir(await sb.from("categorias").update({ ordem }).eq("id", id).select("id, ordem").maybeSingle());
    if (!linha) throw new ErroApi("Não encontrei a categoria para gravar.");
    return linha;
  },

  /**
   * Move TODOS os produtos (ativos e inativos) de uma categoria para outra,
   * num comando só (o banco aplica tudo ou nada). Devolve os ids movidos, para
   * quem chamou poder desfazer se o passo seguinte falhar.
   */
  async moverProdutosDeCategoria(de, para) {
    const linhas = conferir(await sb.from("produtos").update({ categoria_id: para }).eq("categoria_id", de).select("id")) ?? [];
    return linhas.map((l) => l.id);
  },

  /** Volta produtos específicos para uma categoria (desfazer de moverProdutosDeCategoria). */
  async devolverProdutos(ids, para) {
    if (!ids.length) return;
    conferir(await sb.from("produtos").update({ categoria_id: para }).in("id", ids));
  },

  async apagarCategoria(id) {
    const linhas = conferir(await sb.from("categorias").delete().eq("id", id).select("id")) ?? [];
    if (!linhas.length) throw new ErroApi("A categoria não foi apagada (nenhuma linha removida).");
  },

  /** Cadastra um produto novo e devolve a linha criada. */
  async criarProduto(nome, categoriaId) {
    return conferir(await sb.from("produtos")
      .insert({ nome, categoria_id: categoriaId })
      .select("id, nome, categoria_id, ativo").single());
  },

  /** Renomeia, troca o corredor ou desativa um produto. Devolve a linha gravada. */
  async atualizarProduto(id, campos) {
    const linha = conferir(await sb.from("produtos").update(campos).eq("id", id)
      .select("id, nome, categoria_id, ativo").maybeSingle());
    if (!linha) throw new ErroApi("Não encontrei o produto para gravar.");
    return linha;
  },

  /** Apaga a linha do produto em lista_itens (se não existir, não faz nada). */
  async apagarItemDaLista(produtoId) {
    conferir(await sb.from("lista_itens").delete().eq("produto_id", produtoId));
  },

  /** Grava o limite de gastos (null = sem limite) e devolve o valor confirmado. */
  async limiteGastos(valor) {
    const linha = conferir(await sb.from("configuracoes")
      .update({ limite_gastos: valor }).eq("id", 1)
      .select("limite_gastos").maybeSingle());
    if (!linha) throw new ErroApi("Não encontrei as configurações para gravar.");
    return linha.limite_gastos;
  },

  async criarObservacao(texto, autorId) {
    return conferir(await sb.from("observacoes")
      .insert({ texto, criada_por: autorId })
      .select("id, texto, produto_id, created_at").single());
  },

  async resolverObservacao(id, produtoId) {
    conferir(await sb.from("observacoes").update({ resolvida: true, produto_id: produtoId }).eq("id", id));
  },

  async apagarObservacao(id) {
    conferir(await sb.from("observacoes").delete().eq("id", id));
  },

  /**
   * mercado.finalizar_compra: salva o carrinho no Histórico e zera a lista.
   * `data` vem do aparelho já no fuso de São Paulo (o padrão do banco é UTC
   * e erraria o dia de uma compra feita à noite). Devolve o id da compra.
   */
  async finalizarCompra(data, mercado) {
    return conferir(await sb.rpc("finalizar_compra", { p_data: data, p_mercado: mercado }));
  },

  /** Grava a preferência e devolve o valor que o banco confirmou. */
  async manterTelaAcesa(valor) {
    const linha = conferir(await sb.from("configuracoes")
      .update({ manter_tela_acesa: valor }).eq("id", 1)
      .select("manter_tela_acesa").maybeSingle());
    if (!linha) throw new ErroApi("Não encontrei as configurações para gravar.");
    return linha.manter_tela_acesa;
  },
};
