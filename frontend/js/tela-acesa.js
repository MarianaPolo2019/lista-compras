// ============================================================================
// tela-acesa.js — "Manter tela acesa" (Ajustes → Durante a compra)
//
// Ligado, o app pede ao navegador para não apagar a tela (Screen Wake Lock)
// enquanto ele estiver visível. O navegador solta o pedido sozinho quando o app
// vai para segundo plano, então ele é refeito toda vez que o app volta a ficar
// visível. Desligado, o pedido em curso é solto e nada é refeito.
//
// Navegador sem Wake Lock (iPhone com iOS antigo, por exemplo) não ganha nada e
// não perde nada: `suportado` diz isso, e a tela de Ajustes avisa.
// ============================================================================

export const suportado = "wakeLock" in navigator;

let ligado = false;
let trava = null;

async function pedir() {
  if (!suportado || !ligado || document.visibilityState !== "visible" || trava) return;
  try {
    trava = await navigator.wakeLock.request("screen");
    trava.addEventListener("release", () => { trava = null; });
  } catch {
    // O navegador pode recusar (bateria fraca, aba sem foco). Não há o que
    // fazer além de tentar de novo na próxima vez que o app ficar visível.
    trava = null;
  }
}

document.addEventListener("visibilitychange", pedir);

export function aplicarTelaAcesa(valor) {
  ligado = !!valor;
  if (ligado) pedir();
  else if (trava) trava.release().catch(() => {});
}
