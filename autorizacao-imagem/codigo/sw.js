/* Guarda a "casca" do formulário para abrir sem internet. Dados e API nunca passam pelo cache.
   Regra: COM internet, sempre a versão nova do servidor; a cópia guardada só é usada SEM sinal
   (ou se o servidor demorar mais que alguns segundos). Assim nunca se misturam arquivos de versões diferentes. */
'use strict';
var VERSAO = 'autz-v9';
var ESPERA_MS = 6000;
var CASCA = ['./', 'index.html', 'manifest.webmanifest', 'assets/app.css', 'assets/comum.js', 'assets/assinatura.js',
  'assets/form.js', 'assets/pdf.js', 'assets/icone.png', 'assets/icone-192.png', 'assets/marca.png',
  'assets/fontes/Montserrat-Regular.ttf', 'assets/fontes/Montserrat-SemiBold.ttf', 'assets/fontes/Montserrat-Bold.ttf'];

self.addEventListener('install', function (e) {
  // cache: 'reload' ignora o cache HTTP do navegador, garantindo arquivos novos no pacote offline
  e.waitUntil(caches.open(VERSAO).then(function (c) {
    return c.addAll(CASCA.map(function (u) { return new Request(u, { cache: 'reload' }); }));
  }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (ks) {
    return Promise.all(ks.filter(function (k) { return k !== VERSAO; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== location.origin) return;
  if (/\.php$/.test(url.pathname) || /gestao/.test(url.pathname)) return; // API, comprovante e gestão: sempre rede

  // Só a página do formulário vira "casca" offline; outras navegações (imagem, manifest…) seguem direto.
  var navIndex = req.mode === 'navigate' && /\/(index\.html)?$/.test(url.pathname);
  if (req.mode === 'navigate' && !navIndex) return;
  var chave = navIndex ? 'index.html' : req;
  e.respondWith(new Promise(function (responder) {
    var respondido = false;
    function usarCache() {
      if (respondido) return;
      caches.match(chave, { ignoreSearch: true }).then(function (r) {
        if (respondido) return;
        if (r) { respondido = true; responder(r); }
      });
    }
    var timer = setTimeout(usarCache, ESPERA_MS); // sinal fraco: não deixa o vendedor esperando
    var pedido = req.mode === 'navigate' ? req : new Request(req, { cache: 'no-cache' });
    fetch(pedido).then(function (r) {
      clearTimeout(timer);
      if (r.ok) { var copia = r.clone(); caches.open(VERSAO).then(function (c) { c.put(chave, copia); }); }
      if (!respondido) { respondido = true; responder(r); }
    }).catch(function () {
      clearTimeout(timer);
      caches.match(chave, { ignoreSearch: true }).then(function (r) {
        if (respondido) return;
        respondido = true;
        responder(r || new Response('Sem internet e sem cópia salva.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } }));
      });
    });
  }));
});
