// ============================================================================
// rede.js — o app está com internet agora?
//
// "Sem internet" quando QUALQUER uma vale:
//   - o navegador diz que não tem rede (navigator.onLine = false);
//   - a última conversa com o servidor falhou por rede (o celular às vezes
//     diz que tem rede e não tem: sinal fraco dentro do mercado).
// Uma conversa bem-sucedida com o servidor desfaz o segundo caso.
//
// Este módulo não importa nada, para api.js e conexao.js poderem usá-lo sem
// dependência circular.
// ============================================================================

let falhouPorRede = false;
const ouvintes = new Set();

function avisar() {
  for (const fn of ouvintes) fn();
}

window.addEventListener("online", () => { falhouPorRede = false; avisar(); });
window.addEventListener("offline", avisar);

export function semInternet() {
  return !navigator.onLine || falhouPorRede;
}

export function registrarFalhaDeRede() {
  if (falhouPorRede) return;
  falhouPorRede = true;
  avisar();
}

export function registrarSucessoDeRede() {
  if (!falhouPorRede) return;
  falhouPorRede = false;
  avisar();
}

/** Chamado quando "sem internet" muda. */
export function aoMudarRede(fn) {
  ouvintes.add(fn);
  return () => ouvintes.delete(fn);
}

/** Erro de rede (sem resposta do servidor), em oposição a uma recusa do servidor. */
export function ehErroDeRede(erro) {
  if (erro?.rede === true) return true;
  const t = String(erro?.message ?? erro ?? "");
  return /failed to fetch|networkerror|load failed|network request failed|fetch failed|timeout/i.test(t)
    || erro?.name === "AuthRetryableFetchError";
}
