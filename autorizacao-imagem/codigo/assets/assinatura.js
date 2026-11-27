/* Assinatura desenhada com o dedo ou caneta, em tela cheia. Devolve um PNG recortado. */
'use strict';

function abrirAssinatura(nomeProdutor, aoConfirmar) {
  var tracos = [];       // [[{x,y}, ...], ...] em px do canvas (CSS)
  var atual = null;
  var larguraBase = 0;

  var canvas = h('canvas', { 'aria-label': 'Área para assinar' });
  var dica = h('div', { class: 'pad-dica', text: 'Assine com o dedo sobre a linha' });
  var area = h('div', { class: 'pad-area' }, canvas, h('div', { class: 'pad-linha' }), h('div', { class: 'pad-x', text: '✕' }), dica);
  var btnLimpar = h('button', { class: 'btn', type: 'button', text: 'Limpar' });
  var btnCancelar = h('button', { class: 'btn', type: 'button', text: 'Cancelar' });
  var btnOk = h('button', { class: 'btn btn-primario', type: 'button', text: 'Confirmar assinatura', disabled: true });
  var pad = h('div', { class: 'pad', role: 'dialog', 'aria-modal': 'true' },
    h('div', { class: 'pad-topo' },
      icone('caneta'),
      h('div', null, h('div', { class: 't', text: 'Assinatura de ' + (nomeProdutor || 'quem autoriza') }),
        h('div', { class: 'd' }, h('span', { class: 'girar', text: 'Dica: gire o celular para ter mais espaço.' })))),
    area,
    h('div', { class: 'pad-acoes' }, btnCancelar, btnLimpar, btnOk));
  document.body.appendChild(pad);
  document.documentElement.style.overflow = 'hidden';

  var ctx = canvas.getContext('2d');

  function dimensionar() {
    var r = area.getBoundingClientRect();
    var dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
    if (larguraBase && r.width && larguraBase !== r.width) {
      var f = r.width / larguraBase;
      tracos.forEach(function (t) { t.forEach(function (p) { p.x *= f; p.y *= f; }); });
    }
    larguraBase = r.width;
    canvas.width = Math.round(r.width * dpr);
    canvas.height = Math.round(r.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    redesenhar();
  }

  function estilo(c) {
    c.lineCap = 'round'; c.lineJoin = 'round'; c.strokeStyle = '#0f1f3d'; c.lineWidth = 2.6;
  }

  function desenharTraco(c, t) {
    if (!t.length) return;
    c.beginPath();
    c.moveTo(t[0].x, t[0].y);
    if (t.length === 1) { c.lineTo(t[0].x + 0.1, t[0].y + 0.1); }
    for (var i = 1; i < t.length - 1; i++) {
      var mx = (t[i].x + t[i + 1].x) / 2, my = (t[i].y + t[i + 1].y) / 2;
      c.quadraticCurveTo(t[i].x, t[i].y, mx, my);
    }
    if (t.length > 1) c.lineTo(t[t.length - 1].x, t[t.length - 1].y);
    c.stroke();
  }

  function redesenhar() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    estilo(ctx);
    tracos.forEach(function (t) { desenharTraco(ctx, t); });
    var tem = tracos.length > 0;
    dica.hidden = tem;
    btnOk.disabled = !suficiente();
  }

  function comprimento() {
    var total = 0;
    tracos.forEach(function (t) {
      for (var i = 1; i < t.length; i++) total += Math.hypot(t[i].x - t[i - 1].x, t[i].y - t[i - 1].y);
    });
    return total;
  }
  function suficiente() { return comprimento() > 80; }

  function ponto(ev) {
    var r = canvas.getBoundingClientRect();
    return { x: ev.clientX - r.left, y: ev.clientY - r.top };
  }

  canvas.addEventListener('pointerdown', function (ev) {
    ev.preventDefault();
    canvas.setPointerCapture(ev.pointerId);
    atual = [ponto(ev)];
    tracos.push(atual);
    redesenhar();
  });
  canvas.addEventListener('pointermove', function (ev) {
    if (!atual) return;
    ev.preventDefault();
    var eventos = ev.getCoalescedEvents ? ev.getCoalescedEvents() : [ev];
    eventos.forEach(function (e2) { atual.push(ponto(e2)); });
    redesenhar();
  });
  function fim() { atual = null; redesenhar(); }
  canvas.addEventListener('pointerup', fim);
  canvas.addEventListener('pointercancel', fim);
  canvas.addEventListener('pointerleave', function () { if (atual) fim(); });

  btnLimpar.addEventListener('click', function () { tracos = []; redesenhar(); });
  btnCancelar.addEventListener('click', fechar);
  btnOk.addEventListener('click', function () {
    if (!suficiente()) return;
    var png = exportar();
    fechar();
    aoConfirmar(png);
  });

  function exportar() {
    var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    tracos.forEach(function (t) { t.forEach(function (p) {
      minX = Math.min(minX, p.x); minY = Math.min(minY, p.y); maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y);
    }); });
    var margem = 12;
    var w = (maxX - minX) + margem * 2, alt = (maxY - minY) + margem * 2;
    var escala = Math.min(2, 1400 / w, 700 / alt);
    var c = document.createElement('canvas');
    c.width = Math.max(60, Math.round(w * escala));
    c.height = Math.max(30, Math.round(alt * escala));
    var x = c.getContext('2d');
    x.setTransform(escala, 0, 0, escala, (margem - minX) * escala, (margem - minY) * escala);
    estilo(x);
    tracos.forEach(function (t) { desenharTraco(x, t); });
    return c.toDataURL('image/png');
  }

  function fechar() {
    window.removeEventListener('resize', dimensionar);
    document.documentElement.style.overflow = '';
    pad.remove();
  }

  window.addEventListener('resize', dimensionar);
  requestAnimationFrame(dimensionar);
}
