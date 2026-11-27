/* Utilidades compartilhadas — nada aqui usa innerHTML com dado do usuário. */
'use strict';

function h(tag, attrs) {
  var el = document.createElement(tag);
  if (attrs) {
    Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v === null || v === undefined || v === false) return;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), v);
      else if (k === 'value') el.value = v;
      else if (k === 'checked') el.checked = !!v;
      else el.setAttribute(k, v === true ? '' : String(v));
    });
  }
  for (var i = 2; i < arguments.length; i++) anexar(el, arguments[i]);
  return el;
}

function anexar(el, filho) {
  if (filho === null || filho === undefined || filho === false) return;
  if (Array.isArray(filho)) { filho.forEach(function (f) { anexar(el, f); }); return; }
  el.appendChild(typeof filho === 'string' || typeof filho === 'number' ? document.createTextNode(String(filho)) : filho);
}

function limpar(el) { while (el.firstChild) el.removeChild(el.firstChild); return el; }

/* Ícones SVG fixos (sem dado do usuário) */
var ICONES = {
  check: '<svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
  nuvem: '<svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.5 19H9a7 7 0 1 1 6.7-9h1.8a4.5 4.5 0 1 1 0 9Z"/><path d="M12 13v4M12 9.5v.01"/></svg>',
  celular: '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="2" width="12" height="20" rx="2.5"/><path d="M11 18h2"/></svg>',
  pdf: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z"/><path d="M14 3v5h5"/><path d="M12 12v6M9.5 15.5 12 18l2.5-2.5"/></svg>',
  caneta: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>'
};
function icone(nome) {
  var s = document.createElement('span');
  if (!ICONES[nome]) return s; // nunca escrever "undefined" na tela
  s.innerHTML = ICONES[nome]; // conteúdo fixo, definido acima
  return s.firstChild;
}

function toast(msg, ms) {
  var t = h('div', { class: 'toast', role: 'status', text: msg });
  document.body.appendChild(t);
  setTimeout(function () { t.remove(); }, ms || 3200);
}

function dataBR(iso, comHora) {
  if (!iso) return '';
  var d = new Date(iso);
  if (isNaN(d)) return iso;
  var p = function (n) { return String(n).padStart(2, '0'); };
  var s = p(d.getDate()) + '/' + p(d.getMonth() + 1) + '/' + d.getFullYear();
  return comHora ? s + ' ' + p(d.getHours()) + ':' + p(d.getMinutes()) : s;
}

function novoUUID() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  var b = new Uint8Array(16);
  crypto.getRandomValues(b);
  b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
  var x = Array.prototype.map.call(b, function (n) { return n.toString(16).padStart(2, '0'); }).join('');
  return x.slice(0, 8) + '-' + x.slice(8, 12) + '-' + x.slice(12, 16) + '-' + x.slice(16, 20) + '-' + x.slice(20);
}

function cpfValido(v) {
  var c = String(v).replace(/\D/g, '');
  if (c.length !== 11 || /^(\d)\1{10}$/.test(c)) return false;
  for (var t = 9; t < 11; t++) {
    var s = 0;
    for (var i = 0; i < t; i++) s += Number(c[i]) * (t + 1 - i);
    if (Number(c[t]) !== ((10 * s) % 11) % 10) return false;
  }
  return true;
}

function cpfMascara(v) {
  var c = String(v).replace(/\D/g, '').slice(0, 11);
  if (c.length > 9) return c.replace(/(\d{3})(\d{3})(\d{3})(\d{1,2})/, '$1.$2.$3-$4');
  if (c.length > 6) return c.replace(/(\d{3})(\d{3})(\d{1,3})/, '$1.$2.$3');
  if (c.length > 3) return c.replace(/(\d{3})(\d{1,3})/, '$1.$2');
  return c;
}

/* localStorage protegido (pode falhar em modo privado) */
var Guarda = {
  ler: function (k, padrao) { try { var v = localStorage.getItem(k); return v === null ? padrao : JSON.parse(v); } catch (e) { return padrao; } },
  gravar: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } },
  apagar: function (k) { try { localStorage.removeItem(k); } catch (e) {} }
};
