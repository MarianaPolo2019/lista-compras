// ============================================================================
// conexao.js — o selo "Online / Offline", a presença do casal e o aviso de que
// a lista mudou no outro celular
//
// "Online" exige as DUAS coisas ao mesmo tempo: o navegador dizer que tem rede
// (navigator.onLine) E o canal Realtime estar inscrito (status SUBSCRIBED).
// Qualquer uma faltando é "Offline": com rede mas sem Realtime, o que a Mari
// marca não chega na hora ao Carlos, e o selo não pode dizer o contrário.
//
// O mesmo canal faz duas coisas:
//   - escuta as mudanças em mercado.lista_itens (publicação supabase_realtime),
//     e avisa as telas para relerem a lista;
//   - mantém a presença de cada um (quem está com o app aberto agora), que a
//     tela de Ajustes mostra em Compartilhamento.
// ============================================================================

import { sb } from "./api.js";
import { semInternet, aoMudarRede } from "./rede.js";
import { plural } from "./ui.js";

const estado = {
  inscrito: false,
  presentes: new Set(),   // user_id de quem está com o app aberto agora
  pendentes: 0,           // alterações da Lista ainda não confirmadas pelo servidor (fila.js)
  sincronizadoAte: 0,     // até quando mostrar "Sincronizado"
};

const ouvintesConexao = new Set();
const ouvintesLista = new Set();
const ouvintesReconexao = new Set();

let canal = null;
// Já esteve inscrito alguma vez? A primeira inscrição é o começo normal; as
// seguintes são reconexões, e numa reconexão o que mudou enquanto o canal
// estava caído não chegou: quem escuta `aoReconectar` precisa reler.
let jaInscreveu = false;

export function estaOnline() {
  return !semInternet() && estado.inscrito;
}

/** fila.js informa quantas alterações faltam subir. */
export function definirPendentes(n) {
  if (n === estado.pendentes) return;
  estado.pendentes = n;
  avisarConexao();
}

/** A fila esvaziou depois de ficar presa sem rede: "Sincronizado" por 4 s. */
export function marcarSincronizado() {
  estado.sincronizadoAte = Date.now() + 4000;
  avisarConexao();
  setTimeout(avisarConexao, 4100);
}

aoMudarRede(() => avisarConexao());

export function estaPresente(userId) {
  return estado.presentes.has(userId);
}

/** Chamado a cada mudança de rede, de inscrição ou de presença. */
export function aoMudarConexao(fn) {
  ouvintesConexao.add(fn);
  return () => ouvintesConexao.delete(fn);
}

/**
 * Chamado quando alguma linha de mercado.lista_itens muda (aqui ou no outro
 * celular), com o payload do Realtime: { eventType, new, old }.
 */
export function aoMudarLista(fn) {
  ouvintesLista.add(fn);
  return () => ouvintesLista.delete(fn);
}

/** Chamado quando o canal volta a ficar inscrito depois de ter caído. */
export function aoReconectar(fn) {
  ouvintesReconexao.add(fn);
  return () => ouvintesReconexao.delete(fn);
}

function avisarConexao() {
  for (const fn of ouvintesConexao) fn();
}

function lerPresenca() {
  const presentes = new Set();
  for (const entradas of Object.values(canal?.presenceState() ?? {})) {
    for (const e of entradas) if (e.user_id) presentes.add(e.user_id);
  }
  estado.presentes = presentes;
}

/** Liga o canal para quem acabou de entrar. Chamar uma vez, depois do login. */
export function iniciarConexao(userId) {
  canal = sb.channel("mercado-lista", { config: { presence: { key: userId } } })
    .on("postgres_changes", { event: "*", schema: "mercado", table: "lista_itens" }, (payload) => {
      for (const fn of ouvintesLista) fn(payload);
    })
    .on("presence", { event: "sync" }, () => { lerPresenca(); avisarConexao(); })
    .subscribe(async (status) => {
      // SUBSCRIBED é o único estado em que as mudanças chegam. CHANNEL_ERROR,
      // TIMED_OUT e CLOSED derrubam o selo para Offline; o supabase-js tenta
      // reinscrever sozinho e, quando voltar a SUBSCRIBED, o selo volta.
      const estavaInscrito = estado.inscrito;
      estado.inscrito = status === "SUBSCRIBED";
      if (estado.inscrito) {
        try { await canal.track({ user_id: userId }); } catch { /* presença é extra; o selo não depende dela */ }
      } else {
        estado.presentes = new Set();
      }
      avisarConexao();
      if (estado.inscrito && !estavaInscrito) {
        if (jaInscreveu) for (const fn of ouvintesReconexao) fn();
        jaInscreveu = true;
      }
    });
}

/**
 * HTML do selo do cabeçalho (ponto de 6px + texto), nesta ordem de prioridade:
 *   "Sincronizado" (verde)  — a fila acabou de esvaziar, confirmada item a item;
 *   "Offline · 3 alterações pendentes" (âmbar) — sem conexão, com coisa a subir;
 *   "Enviando 3 alterações…" (âmbar) — com conexão, a fila ainda subindo;
 *   "Online" (verde) / "Offline" (âmbar).
 */
export function htmlSelo() {
  const on = estaOnline();
  const n = estado.pendentes;
  const verde = (t) => `<span class="ponto ponto--online"></span>${t}`;
  const ambar = (t) => `<span class="ponto"></span>${t}`;
  if (!n && Date.now() < estado.sincronizadoAte) return verde("Sincronizado");
  if (n && !on) return ambar(`Offline · ${plural(n, "alteração pendente", "alterações pendentes")}`);
  if (n) return ambar(`Enviando ${plural(n, "alteração", "alterações")}…`);
  return on ? verde("Online") : ambar("Offline");
}
