// ============================================================================
// sw.js — service worker: instalação na tela inicial + o app abrir sem internet
//
// O QUE FICA EM CACHE
//   - o "casco" do app (HTML, CSS, JS, fonte, ícones): rede primeiro, com
//     limite de 3 s; sem rede ou passou do limite (sinal fraco), a última
//     cópia, e a resposta da rede, quando chegar, atualiza o cache em segundo
//     plano. Com sinal bom, abre sempre a versão publicada mais nova;
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
const VERSAO = "minhas-compras-v7";

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
  "./assets/icons/icone-mascavel-192.png",
  "./assets/icons/icone-mascavel-512.png",
  "./assets/icons/apple-touch-icon.png",
  "./assets/icons/favicon-64.png",
  "./assets/icons/favicon-32.png",
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

  // A cópia da rede sempre atualiza o cache, mesmo se chegar depois do limite
  // (o service worker continua vivo até ela terminar).
  const daRede = fetch(req).then(async (resposta) => {
    if (resposta.ok) {
      const cache = await caches.open(VERSAO);
      await cache.put(req, resposta.clone()).catch(() => {});
    }
    return resposta;
  });
  evento.waitUntil(daRede.catch(() => {}));
  evento.respondWith(arquivoDoApp(req, daRede));
});

/**
 * Rede primeiro, com LIMITE_REDE_MS. Passou do limite ou deu erro: a cópia do
 * cache. Depois de um limite estourado, por REDE_LENTA_MS os próximos arquivos
 * já saem do cache sem esperar (senão cada nível de import somaria 3 s).
 * Sem cópia no cache, espera a rede mesmo (ou o erro dela).
 */
const LIMITE_REDE_MS = 3000;
const REDE_LENTA_MS = 10000;
let redeLentaAte = 0;

async function arquivoDoApp(req, daRede) {
  const doCache = () => caches.match(req, { ignoreSearch: true })
    .then((r) => r ?? (req.mode === "navigate" ? caches.match("./index.html") : undefined));

  if (Date.now() < redeLentaAte) {
    const emCache = await doCache();
    if (emCache) return emCache;
  }

  let estourou = false;
  try {
    const resposta = await Promise.race([
      daRede,
      new Promise((_, falhar) => setTimeout(() => { estourou = true; falhar(new Error("lenta")); }, LIMITE_REDE_MS)),
    ]);
    redeLentaAte = 0;
    return resposta;
  } catch {
    if (estourou) redeLentaAte = Date.now() + REDE_LENTA_MS;
    const emCache = await doCache();
    if (emCache) return emCache;
    return daRede.catch(() => Response.error());
  }
}
