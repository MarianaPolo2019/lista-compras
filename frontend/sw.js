// ============================================================================
// sw.js — service worker: instalação na tela inicial + cache do casco do app
//
// Só o "casco" (HTML, CSS, JS, fonte, ícones) fica em cache, e sempre com a
// rede primeiro: com internet, o app abre a versão publicada mais nova; sem
// internet, abre a última cópia do casco. Nada do Supabase (dados, login,
// Realtime) passa por aqui: uma lista velha mostrada como se fosse a atual é
// pior do que a tela dizer que está sem conexão. O modo offline de verdade, com
// a lista guardada no aparelho e as alterações na fila, é de outra etapa.
// ============================================================================

// Trocar esta versão é o que faz o app atualizar no celular: o activate abaixo
// apaga todo cache com chave diferente. Incremente a cada mudança de arquivo.
const VERSAO = "minhas-compras-v1";

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
  "./js/telas/login.js",
  "./js/telas/acesso.js",
  "./js/telas/lista.js",
  "./js/telas/orcamento.js",
  "./js/telas/historico.js",
  "./js/telas/ajustes.js",
  "./assets/fonts/figtree-latin.woff2",
  "./assets/fonts/figtree-latin-ext.woff2",
  "./assets/icone.svg",
  "./assets/icons/icone-192.png",
  "./assets/icons/icone-512.png",
  "./assets/icons/apple-touch-icon.png",
  "./assets/icons/favicon-64.png",
];

self.addEventListener("install", (evento) => {
  evento.waitUntil(
    caches.open(VERSAO)
      .then((cache) => cache.addAll(CASCO))
      .catch(() => {})          // falta de um arquivo não impede a instalação
      .then(() => self.skipWaiting()),
  );
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

  // Só o que é deste site. O Supabase e o esm.sh (de onde vem o supabase-js)
  // ficam de fora: o navegador cuida do cache deles do jeito normal.
  const url = new URL(req.url);
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
        const emCache = await caches.match(req);
        if (emCache) return emCache;
        // Navegação offline cai no index; o app mostra que está sem conexão.
        if (req.mode === "navigate") return caches.match("./index.html");
        return Response.error();
      }),
  );
});
