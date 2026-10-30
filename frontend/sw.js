// ============================================================================
// sw.js — service worker: instalação na tela inicial + o app abrir sem internet
//
// O QUE FICA EM CACHE
//   - o "casco" do app (HTML, CSS, JS, fonte, ícones): rede primeiro, cache se
//     não houver rede. Com internet, abre sempre a versão publicada mais nova;
//     sem internet, a última cópia;
//   - o supabase-js do esm.sh, NA VERSÃO FIXA (SUPABASE_JS, igual à do
//     import em js/api.js): cache primeiro. Uma URL com versão fixa nunca muda
//     de conteúdo, então a cópia guardada é sempre a certa. Na instalação, o
//     service worker baixa o arquivo de entrada e segue os imports dele ("/…")
//     até guardar a árvore inteira (hoje 10 arquivos, ~230 KB);
//   - NADA do Supabase (dados, login, Realtime). Os dados sem internet são o
//     IndexedDB do app (js/local.js), com as regras dele.
//
// COMO UMA VERSÃO NOVA CHEGA AO CELULAR
//   Qualquer mudança neste arquivo (por isso a VERSAO) faz o navegador, na
//   próxima abertura com internet, instalar o service worker novo. Ele guarda
//   o casco novo, assume na hora (skipWaiting + clients.claim) e apaga os caches
//   de versões anteriores. Os arquivos do app já vêm da rede primeiro, então a
//   tela aberta com internet usa a versão nova; a cópia nova também passa a
//   valer para as aberturas sem internet.
// ============================================================================

// Trocar esta versão é o que faz o app atualizar no celular: o activate abaixo
// apaga todo cache com chave diferente. Incremente a cada mudança de arquivo.
const VERSAO = "minhas-compras-v5";

// A MESMA URL do import em js/api.js. Mudar uma = mudar a outra.
const SUPABASE_JS = "https://esm.sh/@supabase/supabase-js@2.118.0";
const ESM = "https://esm.sh";

const CASCO = [
  "./",
  "./index.html",
  "./manifest.json",
  "./css/estilo.css",
  "./js/app.js",
  "./js/api.js",
  "./js/ui.js",
  "./js/config.js",
  "./js/conexao.js",
  "./js/tela-acesa.js",
  "./js/precos.js",
  "./js/escolhas.js",
  "./js/rede.js",
  "./js/local.js",
  "./js/fila.js",
  "./js/telas/login.js",
  "./js/telas/acesso.js",
  "./js/telas/lista.js",
  "./js/telas/orcamento.js",
  "./js/telas/historico.js",
  "./js/telas/ajustes.js",
  "./js/telas/produto.js",
  "./js/telas/categorias.js",
  "./js/telas/produtos.js",
  "./assets/fonts/figtree-latin.woff2",
  "./assets/fonts/figtree-latin-ext.woff2",
  "./assets/icone.svg",
  "./assets/icons/icone-192.png",
  "./assets/icons/icone-512.png",
  "./assets/icons/apple-touch-icon.png",
  "./assets/icons/favicon-64.png",
];

/** Guarda o módulo do esm.sh e todos os arquivos que ele importa (até 40). */
async function guardarSupabaseJs(cache) {
  const vistos = new Set();
  const fila = [SUPABASE_JS];
  const importacao = /(?:import|export)\s*(?:[^'"]*?\sfrom\s*)?["'](\/[^"']+)["']/g;
  while (fila.length && vistos.size < 40) {
    const url = fila.shift();
    if (vistos.has(url)) continue;
    vistos.add(url);
    const resposta = await fetch(url, { mode: "cors" });
    if (!resposta.ok) throw new Error(`esm.sh ${resposta.status} em ${url}`);
    await cache.put(url, resposta.clone());
    const texto = await resposta.text();
    for (const m of texto.matchAll(importacao)) {
      const proxima = new URL(m[1], ESM).href;
      if (!vistos.has(proxima)) fila.push(proxima);
    }
  }
}

self.addEventListener("install", (evento) => {
  evento.waitUntil((async () => {
    const cache = await caches.open(VERSAO);
    // Falta de um arquivo não impede a instalação: o que faltar entra no cache
    // na primeira vez que for pedido com internet (fetch abaixo).
    await cache.addAll(CASCO).catch(() => {});
    await guardarSupabaseJs(cache).catch(() => {});
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (evento) => {
  evento.waitUntil(
    caches.keys()
      .then((chaves) => Promise.all(chaves.filter((k) => k !== VERSAO).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (evento) => {
  const req = evento.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // esm.sh: cache primeiro (versão fixa = conteúdo fixo); se não tiver, busca e guarda.
  if (url.origin === ESM) {
    evento.respondWith((async () => {
      const guardado = await caches.match(req);
      if (guardado) return guardado;
      const resposta = await fetch(req);
      if (resposta.ok) {
        const copia = resposta.clone();
        caches.open(VERSAO).then((c) => c.put(req, copia)).catch(() => {});
      }
      return resposta;
    })());
    return;
  }

  // Só o que é deste site. O Supabase fica de fora.
  if (url.origin !== self.location.origin) return;

  evento.respondWith(
    fetch(req)
      .then((resposta) => {
        if (resposta.ok) {
          const copia = resposta.clone();
          caches.open(VERSAO).then((cache) => cache.put(req, copia)).catch(() => {});
        }
        return resposta;
      })
      .catch(async () => {
        const emCache = await caches.match(req, { ignoreSearch: true });
        if (emCache) return emCache;
        // Navegação offline cai no index; o app abre com o que tem guardado.
        if (req.mode === "navigate") return caches.match("./index.html");
        return Response.error();
      }),
  );
});
