// ============================================================================
// precos.js — o histórico de preços calculado no aparelho, a partir de todas
// as linhas de mercado.compra_itens (com a data da compra)
//
// Uma regra só para todas as telas (Lista, Orçamento, Histórico e folha):
//   - "mais nova" = data da compra maior; no mesmo dia, a compra criada por
//     último;
//   - "mesma marca" = marcas iguais sem diferenciar acento nem maiúscula, ou
//     as duas sem marca;
//   - TAMANHO: quantidade + unidade (g, kg, ml, l, un, rolos, m). Unidades da
//     mesma família (g e kg; ml e l) se convertem; famílias diferentes não se
//     comparam. As compras antigas (notas fiscais) não têm tamanho.
//
// COMPARAÇÃO (comparar): a referência é procurada nesta ordem —
//   1. mesma marca e mesmo tamanho → preço unitário;
//   2. mesma marca, outro tamanho da mesma família → preço por medida (R$/kg…);
//   3. mesma marca, tamanho desconhecido num dos lados → preço unitário;
//   4. outra marca → selo cinza, sem seta;
//   5. embalagem de outra família (g contra rolos) → "Embalagem diferente".
// ============================================================================

import { normalizar, moeda, dataCurta, esc } from "./ui.js";

/** Chave de ordenação de uma compra: data e, no mesmo dia, a criação. */
function chave(reg) {
  return `${reg.data}|${reg.criada}`;
}

// ---------------------------------------------------------------------------
// Tamanho
// ---------------------------------------------------------------------------
export const UNIDADES = ["g", "kg", "ml", "l", "un", "rolos", "m"];
const FAMILIA = { g: "massa", kg: "massa", ml: "volume", l: "volume", un: "un", rolos: "rolos", m: "m" };
const FATOR = { kg: 1000, l: 1000 };          // kg → g, l → ml
const MEDIDA = {                              // a medida do "preço por": base ÷ divisor
  massa: { divisor: 1000, por: "kg" },
  volume: { divisor: 1000, por: "l" },
  un: { divisor: 1, por: "un." },
  rolos: { divisor: 1, por: "rolo" },
  m: { divisor: 1, por: "m" },
};

/** { qtd, unidade } de uma linha (lista_itens ou compra_itens), ou null sem tamanho. */
export function tamanhoDe(linha) {
  const qtd = linha?.tamanho_qtd;
  const unidade = linha?.tamanho_unidade;
  if (qtd == null || !FAMILIA[unidade] || !(Number(qtd) > 0)) return null;
  return { qtd: Number(qtd), unidade };
}

/** Os dois campos do banco, SEMPRE juntos (null + null = sem tamanho). */
export function camposDeTamanho(t) {
  return { tamanho_qtd: t ? t.qtd : null, tamanho_unidade: t ? t.unidade : null };
}

export function familia(t) {
  return t ? FAMILIA[t.unidade] : null;
}

/** Quantidade na unidade base da família (g, ml, un, rolos, m), como mercado.tamanho_base. */
function base(t) {
  return Math.round(t.qtd * (FATOR[t.unidade] ?? 1) * 1000) / 1000;
}

/** Mesma família e mesma quantidade base (700 g = 0,7 kg). Dois sem tamanho também são iguais. */
export function mesmoTamanho(a, b) {
  if (!a || !b) return !a && !b;
  return familia(a) === familia(b) && base(a) === base(b);
}

const fmtTamanho = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 });

/** { qtd: 0.7, unidade: "kg" } → "0,7 kg"; 12 rolos; 1 rolo. Sem tamanho → "". */
export function textoTamanho(t) {
  if (!t) return "";
  const unidade = t.unidade === "rolos" && t.qtd === 1 ? "rolo" : t.unidade;
  return `${fmtTamanho.format(t.qtd)} ${unidade}`;
}

/**
 * Preço por medida: massa por kg, volume por litro, un por unidade, rolos por
 * rolo, m por metro. Sem tamanho ou sem preço → null (nunca há "por kg" sem
 * tamanho informado).
 */
export function porMedida(preco, t) {
  if (!t || preco == null || !(Number(preco) > 0)) return null;
  const m = MEDIDA[familia(t)];
  const bruto = Number(preco) / (base(t) / m.divisor);
  return { valor: Math.round(bruto * 100) / 100, bruto, por: m.por, familia: familia(t) };
}

/** "R$ 23,00/kg" */
export function textoMedida(m) {
  return m ? `${moeda(m.valor)}/${m.por}` : "";
}

/** "R$/kg", para rótulos de gráfico e cartões. */
export function rotuloMedida(fam) {
  return `R$/${MEDIDA[fam]?.por ?? ""}`;
}

// ---------------------------------------------------------------------------
// Histórico
// ---------------------------------------------------------------------------

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
    tamanho: tamanhoDe(l),
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

/** Marcas iguais sem acento/maiúscula, ou as duas vazias. */
export function mesmaMarca(a, b) {
  if (!a || !b) return !a && !b;
  return normalizar(a) === normalizar(b);
}

/** A compra mais nova do mesmo produto, ANTERIOR à compra de `reg`, de qualquer marca. */
export function anteriorQualquer(precos, reg) {
  return anteriores(precos, reg)[0] ?? null;
}

function anteriores(precos, reg) {
  return (precos.doProduto.get(reg.produto_id) ?? [])
    .filter((r) => r.compra_id !== reg.compra_id && chave(r) < chave(reg));
}

/** A marca que a linha da lista mostra: a gravada; senão, a da última compra do produto. */
export function marcaMostrada(precos, item) {
  return item.marca || precos.ultima.get(item.produto_id)?.marca || null;
}

/**
 * O tamanho que a linha da lista mostra (pré-preenchimento): o gravado; senão,
 * o da última compra DA MESMA MARCA; senão, o da última compra do produto.
 * `marca` é a marca mostrada na linha.
 */
export function tamanhoMostrado(precos, item, marca = marcaMostrada(precos, item)) {
  const gravado = tamanhoDe(item);
  if (gravado) return gravado;
  return tamanhoSugerido(precos, item.produto_id, marca);
}

/** O tamanho da última compra da marca (com tamanho); senão, o da última compra do produto que tenha tamanho. */
export function tamanhoSugerido(precos, produtoId, marca) {
  const compras = precos.doProduto.get(produtoId) ?? [];
  return compras.find((r) => r.tamanho && mesmaMarca(r.marca, marca))?.tamanho
    ?? compras.find((r) => r.tamanho)?.tamanho
    ?? null;
}

/**
 * Preço de referência de uma linha da lista ainda sem preço (estimativa do
 * Orçamento), com a marca e o tamanho que a linha mostra:
 *   1. a última compra da mesma marca e do mesmo tamanho;
 *   2. o preço por medida da última compra da mesma marca com tamanho da
 *      mesma família × o tamanho da linha;
 *   3. a última compra da marca; 4. a última compra do produto.
 * Nada disso → null (o item fica de fora da conta).
 */
export function precoEstimado(precos, item) {
  const marca = marcaMostrada(precos, item);
  const t = tamanhoMostrado(precos, item, marca);
  const compras = precos.doProduto.get(item.produto_id) ?? [];
  const daMarca = compras.filter((r) => mesmaMarca(r.marca, marca));
  if (t) {
    const igual = daMarca.find((r) => r.tamanho && mesmoTamanho(r.tamanho, t));
    if (igual) return igual.preco;
    const parecido = daMarca.find((r) => r.tamanho && familia(r.tamanho) === familia(t));
    if (parecido) return Math.round((parecido.preco * base(t)) / base(parecido.tamanho) * 100) / 100;
  }
  return daMarca[0]?.preco ?? compras[0]?.preco ?? null;
}

/** Variação de `preco` contra `ref`: { dif, pct, real } com dif em centavos exatos, pct inteiro e real sem arredondar. */
export function variacao(preco, ref) {
  const dif = Math.round((preco - ref) * 100) / 100;
  return { dif, pct: Math.round((Math.abs(dif) / ref) * 100), real: (preco - ref) / ref };
}

/**
 * Compara `atual` = { produto_id, marca, tamanho, preco } com as compras do
 * produto (todas; ou só as anteriores à compra `antesDe`, no Histórico e na
 * folha). Devolve null se não há compra para comparar; senão:
 *   { caso 1–5 (ver o topo), ref, medida, medidaRef, semTamanhoAntes,
 *     dif, pct, real }   — dif/pct/real só nos casos 1, 2 e 3 e com preço.
 * No caso 2, dif é em R$ por medida (R$/kg…) e pct sai do preço por medida.
 */
export function comparar(precos, atual, { antesDe = null } = {}) {
  const lista = antesDe ? anteriores(precos, antesDe) : (precos.doProduto.get(atual.produto_id) ?? []);
  if (!lista.length) return null;
  const t = atual.tamanho ?? null;
  const mesma = lista.filter((r) => mesmaMarca(r.marca, atual.marca));

  let caso, ref;
  if (mesma.length) {
    if (!t) { ref = mesma[0]; caso = ref.tamanho ? 3 : 1; }
    else if ((ref = mesma.find((r) => r.tamanho && mesmoTamanho(r.tamanho, t)))) caso = 1;
    else if ((ref = mesma.find((r) => r.tamanho && familia(r.tamanho) === familia(t)))) caso = 2;
    else if ((ref = mesma.find((r) => !r.tamanho))) caso = 3;
    else { ref = mesma[0]; caso = 5; }
  } else {
    ref = lista[0];
    caso = t && ref.tamanho && familia(ref.tamanho) !== familia(t) ? 5 : 4;
  }

  const r = {
    caso, ref, tamanho: t,
    medida: porMedida(atual.preco, t),
    medidaRef: porMedida(ref.preco, ref.tamanho),
    // Só quando a linha de hoje tem tamanho e a compra antiga não.
    semTamanhoAntes: caso === 3 && !!t && !ref.tamanho,
  };
  if (atual.preco == null || !(Number(atual.preco) > 0)) return r;
  if (caso === 1 || caso === 3) Object.assign(r, variacao(Number(atual.preco), ref.preco));
  if (caso === 2) {
    const dif = Math.round((r.medida.valor - r.medidaRef.valor) * 100) / 100;
    const real = (r.medida.bruto - r.medidaRef.bruto) / r.medidaRef.bruto;
    Object.assign(r, { dif, pct: Math.round(Math.abs(real) * 100), real });
  }
  return r;
}

/**
 * O selo (HTML) de uma comparação e o texto de contra, separados para cada
 * tela pôr onde cabe: { selo, contra, nota }.
 *   1/3: "▲ R$ 0,40 (+5%)"  · "vs. R$ 9,60 em 31/10"
 *   2:   "▼ R$ 1,00/kg (−4%)" · "vs. 400 g a R$ 9,60 em 31/10"
 *   4:   "Outra marca · Pullman 500 g R$ 6,95 (R$ 13,90/kg) em 25/08"
 *   5:   "Embalagem diferente" · "vs. 12 rolos em 25/08"
 */
export function partesDoSelo(c) {
  const { ref } = c;
  const quando = dataCurta(ref.data);
  if (c.caso === 4) {
    // O preço por medida da outra marca só quando os dois lados têm tamanho da mesma família.
    const medida = c.medidaRef && familia(c.tamanho) === c.medidaRef.familia ? ` (${textoMedida(c.medidaRef)})` : "";
    const quem = [ref.marca, textoTamanho(ref.tamanho), moeda(ref.preco)].filter(Boolean).join(" ");
    return { selo: `<span class="selo-preco selo-preco--outra">Outra marca · ${esc(quem)}${esc(medida)} em ${quando}</span>`, contra: "", nota: "" };
  }
  if (c.caso === 5) {
    return {
      selo: `<span class="selo-preco selo-preco--outra">Embalagem diferente</span>`,
      contra: `vs. ${esc(textoTamanho(ref.tamanho))} em ${quando}`,
      nota: "",
    };
  }
  if (c.dif == null) return { selo: "", contra: "", nota: "" };
  const porKg = c.caso === 2 ? `/${c.medida.por}` : "";
  const selo = c.dif === 0
    ? `<span class="selo-preco selo-preco--neutro">= mesmo preço${c.caso === 2 ? ` por ${c.medida.por}` : ""}</span>`
    : `<span class="selo-preco selo-preco--${c.dif > 0 ? "subiu" : "desceu"}">${c.dif > 0 ? "▲" : "▼"} ${moeda(Math.abs(c.dif))}${porKg} (${c.dif > 0 ? "+" : "−"}${c.pct}%)</span>`;
  const contra = c.caso === 2
    ? `vs. ${esc(textoTamanho(ref.tamanho))} a ${moeda(ref.preco)} em ${quando}`
    : `vs. ${moeda(ref.preco)} em ${quando}`;
  return { selo, contra, nota: c.semTamanhoAntes ? "tamanho não informado na compra anterior" : "" };
}
