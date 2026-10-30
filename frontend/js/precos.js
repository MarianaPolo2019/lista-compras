// ============================================================================
// precos.js — o histórico de preços calculado no aparelho, a partir de todas
// as linhas de mercado.compra_itens (com a data da compra)
//
// Uma regra só para todas as telas:
//   - "mais nova" = data da compra maior; no mesmo dia, a compra criada por
//     último;
//   - "mesma marca" = marcas iguais sem diferenciar acento nem maiúscula.
//     Marca vazia não é marca: um item sem marca nunca é "da mesma marca" de
//     outro, então nunca vira referência de comparação por marca.
// ============================================================================

import { normalizar } from "./ui.js";

/** Chave de ordenação de uma compra: data e, no mesmo dia, a criação. */
function chave(reg) {
  return `${reg.data}|${reg.criada}`;
}

/**
 * Recebe as linhas de consultas.historicoDePrecos() e devolve:
 *   ultima    produto → a compra mais nova (qualquer marca)
 *   porMarca  "produto|marca normalizada" → a compra mais nova daquela marca
 *   marcas    produto → [a mais nova de cada marca], mais nova primeiro
 *   doProduto produto → todas as compras, mais nova primeiro
 */
export function montarPrecos(linhas) {
  const regs = linhas.map((l) => ({
    produto_id: l.produto_id,
    compra_id: l.compra_id,
    marca: l.marca || null,
    quantidade: l.quantidade,
    preco: Number(l.preco_unitario),
    data: l.compras.data,
    criada: String(l.compras.created_at),
  })).sort((a, b) => chave(b).localeCompare(chave(a)));

  const ultima = new Map(), porMarca = new Map(), marcas = new Map(), doProduto = new Map();
  for (const r of regs) {
    if (!doProduto.has(r.produto_id)) doProduto.set(r.produto_id, []);
    doProduto.get(r.produto_id).push(r);
    if (!ultima.has(r.produto_id)) ultima.set(r.produto_id, r);
    if (!r.marca) continue;
    const k = `${r.produto_id}|${normalizar(r.marca)}`;
    if (porMarca.has(k)) continue;
    porMarca.set(k, r);
    if (!marcas.has(r.produto_id)) marcas.set(r.produto_id, []);
    marcas.get(r.produto_id).push(r);
  }
  return { ultima, porMarca, marcas, doProduto };
}

/** A compra mais nova do mesmo produto, ANTERIOR à compra de `reg`, de qualquer marca. */
export function anteriorQualquer(precos, reg) {
  return (precos.doProduto.get(reg.produto_id) ?? [])
    .find((r) => r.compra_id !== reg.compra_id && chave(r) < chave(reg)) ?? null;
}

/** A compra mais nova do mesmo produto e da MESMA marca, anterior à de `reg`. */
export function anteriorMesmaMarca(precos, reg) {
  if (!reg.marca) return null;
  const m = normalizar(reg.marca);
  return (precos.doProduto.get(reg.produto_id) ?? [])
    .find((r) => r.compra_id !== reg.compra_id && chave(r) < chave(reg) && r.marca && normalizar(r.marca) === m) ?? null;
}

/** Variação de `preco` contra `ref`: { dif, pct } com dif em centavos exatos e pct inteiro. */
export function variacao(preco, ref) {
  const dif = Math.round((preco - ref) * 100) / 100;
  return { dif, pct: Math.round((Math.abs(dif) / ref) * 100) };
}
