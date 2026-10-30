// ============================================================================
// tela-acesa.js — "Manter tela acesa" (Ajustes → Durante a compra)
//
// O pedido ao navegador (Screen Wake Lock) só existe quando as DUAS coisas
// valem: a preferência está ligada em mercado.configuracoes E a aba Lista está
// aberta. É a Lista que se usa com a mão no carrinho; nas outras abas a tela
// apaga como o celular quiser.
//
// O navegador solta o pedido sozinho quando o app vai para segundo plano, então
// ele é refeito toda vez que o app volta a ficar visível com a Lista aberta.
// Desligada a preferência ou saindo da Lista, o pedido em curso é solto.
//
// Navegador sem Wake Lock: segue sem erro e sem aviso; `suportado` diz isso a
// quem quiser explicar (a tela de Ajustes explica).
// ============================================================================

export const suportado = "wakeLock" in navigator;

let ligado = false;     // preferência gravada no banco
let naLista = false;    // a aba Lista está aberta
let trava = null;

async function pedir() {
  if (!suportado || !ligado || !naLista || document.visibilityState !== "visible" || trava) return;
  try {
    trava = await navigator.wakeLock.request("screen");
    trava.addEventListener("release", () => { trava = null; });
  } catch {
    // O navegador pode recusar (bateria fraca, aba sem foco). Não há o que
    // fazer além de tentar de novo na próxima vez que o app ficar visível.
    trava = null;
  }
}

function soltar() {
  if (trava) trava.release().catch(() => {});
}

document.addEventListener("visibilitychange", pedir);

function reavaliar() {
  if (ligado && naLista) pedir();
  else soltar();
}

/** A preferência de mercado.configuracoes.manter_tela_acesa. */
export function aplicarTelaAcesa(valor) {
  ligado = !!valor;
  reavaliar();
}

/** Chamado pelo roteador a cada troca de aba. */
export function definirNaLista(valor) {
  naLista = !!valor;
  reavaliar();
}
