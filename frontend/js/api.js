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
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

export const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  db: { schema: "mercado" },
  auth: { persistSession: true, autoRefreshToken: true },
});

export class ErroApi extends Error {}

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
  return bruto || "Não consegui completar a operação.";
}

function conferir({ data, error, count }) {
  if (error) throw new ErroApi(traduzir(error));
  return count !== undefined && count !== null && data === null ? count : data;
}

// ---------------------------------------------------------------------------
// Sessão
// ---------------------------------------------------------------------------
export const auth = {
  async sessao() {
    const { data, error } = await sb.auth.getSession();
    if (error) throw new ErroApi(traduzir(error));
    return data?.session ?? null;
  },
  async entrar(email, senha) {
    return conferir(await sb.auth.signInWithPassword({ email, password: senha }));
  },
  async sair() {
    await sb.auth.signOut();
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
    return conferir(await sb.schema("public").from("membros_casal")
      .select("user_id, nome, created_at").order("created_at")) ?? [];
  },

  async categorias() {
    return conferir(await sb.from("categorias").select("id, nome, ordem").order("ordem")) ?? [];
  },

  /** Todos, ativos e desativados: um item desativado ainda pode estar no carrinho. */
  async produtos() {
    return conferir(await sb.from("produtos").select("id, nome, categoria_id, ativo").order("nome")) ?? [];
  },

  async itensDaLista() {
    return conferir(await sb.from("lista_itens")
      .select("produto_id, quantidade, no_carrinho, marca, preco_unitario, marcado_por")) ?? [];
  },

  async configuracoes() {
    return conferir(await sb.from("configuracoes")
      .select("limite_gastos, manter_tela_acesa").eq("id", 1).maybeSingle());
  },

  async observacoesAbertas() {
    return conferir(await sb.from("observacoes")
      .select("id, texto, produto_id, created_at").eq("resolvida", false).order("created_at")) ?? [];
  },

  /** Compras finalizadas, da mais nova para a mais antiga, com a contagem de itens. */
  async compras() {
    return conferir(await sb.from("compras")
      .select("id, data, mercado, origem, total, created_at, compra_itens(count)")
      .order("data", { ascending: false })
      .order("created_at", { ascending: false })) ?? [];
  },

  async contar(tabela, montar = (q) => q) {
    return conferir(await montar(sb.from(tabela).select("*", { count: "exact", head: true })));
  },
};

// ---------------------------------------------------------------------------
// Escritas
// ---------------------------------------------------------------------------
export const acoes = {
  /** Grava a preferência e devolve o valor que o banco confirmou. */
  async manterTelaAcesa(valor) {
    const linha = conferir(await sb.from("configuracoes")
      .update({ manter_tela_acesa: valor }).eq("id", 1)
      .select("manter_tela_acesa").maybeSingle());
    if (!linha) throw new ErroApi("Não encontrei as configurações para gravar.");
    return linha.manter_tela_acesa;
  },
};
