// ============================================================================
// acesso.js — as duas telas de quem entrou mas não passou da conferência
//
// "Acesso não liberado": o login deu certo, mas a conta não está em
// public.membros_casal. O RLS do esquema mercado não deixaria ler nada, então
// em vez de uma lista vazia fingindo que está tudo bem, a tela diz o motivo e
// oferece Sair. A sessão continua aberta até a pessoa tocar em Sair.
//
// "Não consegui conferir": a pergunta a membros_casal falhou (rede, API). Não
// dá para afirmar nem que é membro nem que não é, então a tela não afirma:
// mostra o erro e oferece tentar de novo.
// ============================================================================

import { esc } from "../ui.js";

export function telaAcessoNegado(container, email) {
  container.innerHTML = `
    <img class="cheia__marca" src="assets/icone.svg" alt="" width="64" height="64">
    <h1 class="cheia__titulo">Acesso não liberado</h1>
    <p class="cheia__texto">A conta <strong>${esc(email)}</strong> entrou, mas não está
      liberada no Minhas Compras. O app é só para as contas do casal cadastradas no
      Nosso Plano.</p>
    <div class="cheia__acoes">
      <button type="button" class="botao" data-acao="sair">Sair</button>
    </div>`;
}

export function telaFalhaNaConferencia(container, erro) {
  container.innerHTML = `
    <img class="cheia__marca" src="assets/icone.svg" alt="" width="64" height="64">
    <h1 class="cheia__titulo">Não consegui conferir seu acesso</h1>
    <div class="alerta"><div class="alerta__texto">${esc(erro?.message ?? erro)}</div></div>
    <div class="cheia__acoes">
      <button type="button" class="botao" data-acao="recarregar">Tentar de novo</button>
      <button type="button" class="botao botao--secundario" data-acao="sair">Sair</button>
    </div>`;
}
