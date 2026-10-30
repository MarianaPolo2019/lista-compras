// ============================================================================
// fila.js — alterações da Lista a caminho do servidor
//
// TODA alteração da Lista (quantidade, marca, preço, carrinho) passa por aqui,
// com ou sem internet:
//   1. vai para a fila no aparelho (IndexedDB), uma entrada por produto. Várias
//      mudanças no mesmo produto se juntam: a entrada guarda o valor FINAL de
//      cada campo mexido;
//   2. a fila é enviada em ordem (a entrada mais antiga primeiro);
//   3. uma entrada só sai da fila DEPOIS que o servidor confirma. Fechar o app
//      no meio do envio não perde nada: a entrada continua lá e é reenviada.
//      Reenviar é seguro porque cada envio grava valores ("quantidade = 3"),
//      não incrementos ("quantidade + 1"): mandar duas vezes dá o mesmo.
//      Se o produto mudou de novo enquanto o envio estava no ar, a entrada fica
//      (com os valores novos) e sobe na volta seguinte.
//   4. erro de REDE: a entrada fica e o envio para; tenta de novo quando a
//      rede volta, quando o Realtime reconecta e a cada 15 s enquanto houver
//      pendências;
//   5. RECUSA do servidor (qualquer erro que não é de rede): a entrada sai da
//      fila, a linha daquele produto é relida do servidor e a tela avisa qual
//      produto não foi salvo e por quê. Os outros itens continuam subindo.
//
// CONFLITO (Mari e Carlos mexeram no mesmo produto, um deles sem internet):
// vale a última alteração que CHEGAR ao servidor, campo a campo (cada envio só
// leva os campos que aquela pessoa mexeu). Depois de esvaziar a fila, a lista
// é relida do servidor, e a tela mostra o que ficou no banco.
//
// "Sincronizado" só aparece quando a fila esvazia depois de ter ficado presa
// por falta de rede, e só depois da confirmação do servidor de cada item.
// ============================================================================

import * as local from "./local.js";
import { acoes, consultas } from "./api.js";
import { aoMudarRede } from "./rede.js";

const VAZIO = Object.freeze({ quantidade: 0, no_carrinho: false, marca: null, preco_unitario: null, marcado_por: null });
const REPETIR_A_CADA = 15000;

const memoria = new Map();        // espelho da fila guardada
let carregada = false;
let rodando = false;
let repetir = false;
let presaPorRede = false;         // houve envio bloqueado por rede desde o último "Sincronizado"
let temporizador = null;
let relogio = null;

const ouvintes = { mudou: new Set(), confirmado: new Set(), recusado: new Set(), sincronizado: new Set() };
const emitir = (tipo, ...args) => { for (const fn of ouvintes[tipo]) fn(...args); };

/** tipo: "mudou" | "confirmado"(id, linha) | "recusado"(id, erro, linhaDoServidor) | "sincronizado" */
export function ao(tipo, fn) {
  ouvintes[tipo].add(fn);
  return () => ouvintes[tipo].delete(fn);
}

/** Lê a fila guardada no aparelho (uma vez, no início do app). */
export async function carregarFila() {
  if (carregada) return;
  const todos = await local.filaTodos();
  for (const e of todos) memoria.set(e.produto_id, e);
  carregada = true;
  if (memoria.size) presaPorRede = true;   // sobrou de uma sessão anterior
  emitir("mudou");
}

export function quantasPendentes() {
  return memoria.size;
}

export function temPendente(id) {
  return memoria.has(id);
}

/** As linhas do servidor com as alterações da fila por cima (o que a tela mostra). */
export function comPendentes(itens) {
  const porId = new Map(itens.map((i) => [i.produto_id, i]));
  for (const [id, e] of memoria) {
    porId.set(id, { ...VAZIO, ...(porId.get(id) ?? {}), produto_id: id, ...e.campos });
  }
  return [...porId.values()];
}

/**
 * Junta `campos` na entrada do produto e agenda o envio. `linhaExiste` diz se o
 * servidor já tem linha para ele (UPDATE) ou não (UPSERT).
 */
export async function enfileirar(id, campos, linhaExiste, { atraso = 0 } = {}) {
  const atual = memoria.get(id);
  const entrada = {
    produto_id: id,
    campos: { ...(atual?.campos ?? {}), ...campos },
    existe: !!(atual?.existe || linhaExiste),
    versao: (atual?.versao ?? 0) + 1,
    criada: atual?.criada ?? Date.now(),
  };
  memoria.set(id, entrada);
  emitir("mudou");
  try {
    await local.filaGravar(entrada);
  } catch (e) {
    // Sem IndexedDB a alteração continua na memória e sobe normalmente; só não
    // sobreviveria a fechar o app. Fica registrado no console.
    console.error("Não consegui guardar a alteração no aparelho", e);
  }
  agendar(atraso);
}

/** Envia agora (sem esperar o atraso do preço). */
export function enviarJa() {
  agendar(0);
}

function agendar(atraso) {
  clearTimeout(temporizador);
  temporizador = setTimeout(sincronizar, atraso);
}

async function tirar(id) {
  memoria.delete(id);
  await local.filaApagar(id).catch((e) => console.error(e));
}

/** Envia a fila, em ordem, uma entrada por vez. */
export async function sincronizar() {
  if (rodando) { repetir = true; return; }
  if (!memoria.size) return;
  if (!navigator.onLine) { presaPorRede = true; armarRelogio(); return; }
  rodando = true;
  let parouPorRede = false;
  try {
    do {
      repetir = false;
      const ordem = [...memoria.values()].sort((a, b) => a.criada - b.criada);
      for (const enviada of ordem) {
        const envio = { ...enviada, campos: { ...enviada.campos } };
        try {
          const linha = await acoes.gravarItem(envio.produto_id, envio.campos, envio.existe);
          const agora = memoria.get(envio.produto_id);
          if (agora && agora.versao === envio.versao) {
            await tirar(envio.produto_id);
          } else if (agora) {
            // Mudou enquanto subia: fica, já sabendo que a linha existe.
            agora.existe = true;
            await local.filaGravar(agora).catch(() => {});
            repetir = true;
          }
          emitir("confirmado", envio.produto_id, linha);
          emitir("mudou");
        } catch (erro) {
          if (erro.rede) {
            parouPorRede = true;
            presaPorRede = true;
            break;
          }
          // Recusa do servidor: sai da fila, relê a linha e avisa. Segue para os outros.
          await tirar(envio.produto_id);
          let doServidor = null;
          try { doServidor = await consultas.itemDaLista(envio.produto_id); } catch { /* fica null */ }
          emitir("recusado", envio.produto_id, erro, doServidor);
          emitir("mudou");
        }
      }
    } while (repetir && !parouPorRede && memoria.size);
  } finally {
    rodando = false;
  }

  if (parouPorRede || memoria.size) {
    armarRelogio();
    return;
  }
  desarmarRelogio();
  if (presaPorRede) {
    presaPorRede = false;
    emitir("sincronizado");
  }
}

/** Enquanto houver pendências, tenta de novo de tempos em tempos. */
function armarRelogio() {
  if (relogio) return;
  relogio = setInterval(() => { if (memoria.size) sincronizar(); else desarmarRelogio(); }, REPETIR_A_CADA);
}
function desarmarRelogio() {
  clearInterval(relogio);
  relogio = null;
}

// A rede voltou (ou caiu): tenta enviar.
aoMudarRede(() => { if (navigator.onLine && memoria.size) sincronizar(); });
