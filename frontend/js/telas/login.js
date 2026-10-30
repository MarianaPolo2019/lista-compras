// ============================================================================
// login.js — entrada com e-mail e senha (Supabase Auth, signInWithPassword)
//
// É o mesmo projeto Supabase do Nosso Plano, então a Mari e o Carlos entram com
// o mesmo e-mail e a mesma senha de lá. Não há "criar conta" nem "esqueci a
// senha" de propósito: as duas contas já existem, e quem não está em
// membros_casal não lê nada do esquema mercado, então uma conta nova seria
// inútil.
//
// O design não tem tela de login: esta é montada só com peças das telas
// aprovadas (título de 24px, texto fraco de 14,5px, campo de 48px com raio 14 e
// borda magenta no foco, botão principal de 50px, faixa vermelha de alerta).
// ============================================================================

import { auth } from "../api.js";

export async function telaLogin(container) {
  container.innerHTML = `
    <form id="form-login" novalidate>
      <img class="cheia__marca" src="assets/icone.svg" alt="" width="64" height="64">
      <h1 class="cheia__titulo">Minhas Compras</h1>
      <p class="cheia__texto">Entre com o mesmo e-mail e a mesma senha do Nosso Plano.</p>

      <label class="campo">
        <span class="campo__rotulo">E-mail</span>
        <input class="campo__entrada" type="email" name="email"
               autocomplete="username" inputmode="email" autocapitalize="off" required>
      </label>

      <label class="campo">
        <span class="campo__rotulo">Senha</span>
        <input class="campo__entrada" type="password" name="senha"
               autocomplete="current-password" required>
      </label>

      <div class="alerta" id="erro-login" role="alert" hidden>
        <div class="alerta__texto" id="erro-login-texto"></div>
      </div>

      <div class="cheia__acoes">
        <button type="submit" class="botao" id="btn-entrar">Entrar</button>
      </div>
    </form>`;

  const form = container.querySelector("#form-login");
  const erro = container.querySelector("#erro-login");
  const erroTexto = container.querySelector("#erro-login-texto");
  const botao = container.querySelector("#btn-entrar");

  const mostrarErro = (texto) => {
    erroTexto.textContent = texto;
    erro.hidden = false;
  };

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    erro.hidden = true;

    const email = form.email.value.trim();
    const senha = form.senha.value;
    if (!email || !senha) {
      mostrarErro("Preencha o e-mail e a senha.");
      return;
    }

    botao.disabled = true;
    botao.textContent = "Entrando…";

    try {
      await auth.entrar(email, senha);
      // Recarrega já com a sessão: o boot confere se a conta é do casal.
      location.reload();
    } catch (falha) {
      // O Supabase responde em inglês; as respostas comuns ganham frase em
      // português, e qualquer outra aparece como veio, nunca escondida.
      const bruto = String(falha?.message ?? "");
      mostrarErro(
        /invalid login credentials/i.test(bruto) ? "E-mail ou senha incorretos." :
        /email not confirmed/i.test(bruto) ? "Este e-mail ainda não foi confirmado." :
        bruto || "Não consegui entrar. Tente de novo.",
      );
      botao.disabled = false;
      botao.textContent = "Entrar";
    }
  });
}
