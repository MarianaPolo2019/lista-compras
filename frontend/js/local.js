// ============================================================================
// local.js — o que fica guardado no aparelho (IndexedDB)
//
// Duas gavetas:
//   "cache": a última cópia BEM-SUCEDIDA de cada leitura do servidor
//            (categorias, produtos, lista_itens, histórico de preços,
//            configurações, membros, observações). Só é usada quando o
//            servidor não responde por falta de rede.
//   "fila":  as alterações da Lista que ainda não chegaram ao servidor, uma
//            por produto (ver fila.js). Sobrevive a fechar e reabrir o app.
//
// Sem IndexedDB (navegador antigo, modo privado restrito) as funções falham
// com erro claro; quem chama decide o que dizer na tela.
// ============================================================================

const NOME = "minhas-compras";
const VERSAO_DB = 1;
let aberto = null;

function abrir() {
  if (aberto) return aberto;
  aberto = new Promise((resolver, rejeitar) => {
    const pedido = indexedDB.open(NOME, VERSAO_DB);
    pedido.onupgradeneeded = () => {
      const db = pedido.result;
      if (!db.objectStoreNames.contains("cache")) db.createObjectStore("cache");
      if (!db.objectStoreNames.contains("fila")) db.createObjectStore("fila", { keyPath: "produto_id" });
    };
    pedido.onsuccess = () => resolver(pedido.result);
    pedido.onerror = () => { aberto = null; rejeitar(pedido.error); };
  });
  return aberto;
}

async function operar(gaveta, modo, fazer) {
  const db = await abrir();
  return new Promise((resolver, rejeitar) => {
    const tx = db.transaction(gaveta, modo);
    const pedido = fazer(tx.objectStore(gaveta));
    tx.oncomplete = () => resolver(pedido?.result);
    tx.onerror = () => rejeitar(tx.error);
    tx.onabort = () => rejeitar(tx.error);
  });
}

// --- cache das leituras ------------------------------------------------------
export function guardar(chave, valor) {
  return operar("cache", "readwrite", (s) => s.put({ valor, em: Date.now() }, chave));
}

/** { valor, em } ou undefined se nunca foi guardado. */
export function ler(chave) {
  return operar("cache", "readonly", (s) => s.get(chave));
}

// --- fila de alterações ------------------------------------------------------
export function filaTodos() {
  return operar("fila", "readonly", (s) => s.getAll());
}

export function filaGravar(item) {
  return operar("fila", "readwrite", (s) => s.put(item));
}

export function filaApagar(produtoId) {
  return operar("fila", "readwrite", (s) => s.delete(produtoId));
}
