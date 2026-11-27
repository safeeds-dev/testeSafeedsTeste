/* Formulário de campo: sem login, liberado pelo link da equipe. Funciona sem internet (fila no aparelho). */
'use strict';

var API = 'api.php';
var app = document.getElementById('app');
var redeEl = document.getElementById('rede');

var K_CHAVE = 'autz_equipe', K_COLETOR = 'autz_coletor', K_TERMO = 'autz_termo', K_HIST = 'autz_historico';

var estado = {
  chave: Guarda.ler(K_CHAVE, ''),
  coletor: Guarda.ler(K_COLETOR, ''),
  termo: Guarda.ler(K_TERMO, null),
  linkInvalido: false,
  ficha: null,          // coleta em andamento
  sincronizando: false,
  enviandoAgora: null   // uuid enviado pela tela de conferência (a fila não mexe nele)
};

/* ---------------- link da equipe vindo na URL ---------------- */
(function lerLink() {
  var u = new URL(location.href);
  var k = u.searchParams.get('k');
  if (k && /^[A-Za-z0-9_-]{16,100}$/.test(k)) {
    estado.chave = k;
    Guarda.gravar(K_CHAVE, k);
  }
  if (k !== null) {
    u.searchParams.delete('k');
    history.replaceState(null, '', u.pathname + (u.search || '') + u.hash); // tira o código da barra de endereço
  }
})();

/* ---------------- fila no aparelho (IndexedDB) ---------------- */
var Fila = (function () {
  var dbp = null;
  function abrir() {
    if (dbp) return dbp;
    dbp = new Promise(function (ok, falha) {
      var r = indexedDB.open('autz', 1);
      r.onupgradeneeded = function () { r.result.createObjectStore('fila', { keyPath: 'uuid' }); };
      r.onsuccess = function () { ok(r.result); };
      r.onerror = function () { falha(r.error); };
    });
    return dbp;
  }
  function tx(modo, fn) {
    return abrir().then(function (db) {
      return new Promise(function (ok, falha) {
        var t = db.transaction('fila', modo);
        var res = fn(t.objectStore('fila'));
        t.oncomplete = function () { ok(res && res.result !== undefined ? res.result : res); };
        t.onerror = function () { falha(t.error); };
      });
    });
  }
  return {
    por: function (item) { return tx('readwrite', function (s) { return s.put(item); }); },
    tirar: function (uuid) { return tx('readwrite', function (s) { return s.delete(uuid); }); },
    todos: function () { return tx('readonly', function (s) { return s.getAll(); }); }
  };
})();

/* ---------------- rede ---------------- */
function atualizarRede() {
  var on = navigator.onLine;
  redeEl.textContent = on ? 'online' : 'sem internet';
  redeEl.classList.toggle('off', !on);
}
window.addEventListener('online', function () { atualizarRede(); sincronizar(); });
window.addEventListener('offline', atualizarRede);
atualizarRede();

function chamar(acao, corpo, cabecalhos) {
  var op = { method: corpo ? 'POST' : 'GET', headers: { 'Accept': 'application/json' }, credentials: 'omit', cache: 'no-store' };
  if (corpo) { op.headers['Content-Type'] = 'application/json'; op.body = JSON.stringify(corpo); }
  Object.assign(op.headers, cabecalhos || {});
  return fetch(API + '?a=' + encodeURIComponent(acao), op).then(function (r) {
    return r.json().catch(function () { return {}; }).then(function (j) { j._status = r.status; return j; });
  });
}

/* ---------------- envio da fila ---------------- */
function sincronizar() {
  if (estado.sincronizando || !navigator.onLine || !estado.chave) return Promise.resolve();
  estado.sincronizando = true;
  return Fila.todos().then(function (itens) {
    var seq = Promise.resolve();
    itens.filter(function (i) { return !i.erroDefinitivo && i.uuid !== estado.enviandoAgora; }).forEach(function (item) {
      seq = seq.then(function () {
        return chamar('coletar', item.payload, { 'X-Equipe': estado.chave }).then(function (r) {
          if (r._status === 200 && r.ok) {
            guardarHistorico({ protocolo: r.protocolo, nome: primeiroNome(item.payload.dados.nome), quando: item.payload.coletado_em });
            return Fila.tirar(item.uuid);
          }
          if (r._status === 403 && r.linkInvalido) { estado.linkInvalido = true; throw new Error('link'); }
          if (r._status === 422 || r._status === 409 || r._status === 400 || r._status === 413) {
            item.erroDefinitivo = r.erro || 'Dados recusados pelo servidor.';
            return Fila.por(item);
          }
          item.ultimoErro = r.erro || ('Erro ' + r._status);
          return Fila.por(item);
        }, function () { /* sem rede: fica na fila */ });
      });
    });
    return seq;
  }).catch(function () {}).then(function () {
    estado.sincronizando = false;
    if (telaAtual === 'inicio') telaInicio();
  });
}
setInterval(sincronizar, 60000);

/* Identificador aleatório deste aparelho (não é dado pessoal): ajuda a gestão a separar envios suspeitos. */
function idAparelho() {
  var id = Guarda.ler('autz_aparelho', '');
  if (!/^[0-9a-f-]{36}$/.test(id)) { id = novoUUID(); Guarda.gravar('autz_aparelho', id); }
  return id;
}

function primeiroNome(n) { return String(n || '').trim().split(/\s+/)[0] || ''; }

function guardarHistorico(x) {
  var l = Guarda.ler(K_HIST, []).filter(function (y) { return y.protocolo !== x.protocolo; });
  l.unshift(x);
  Guarda.gravar(K_HIST, l.slice(0, 30));
}

/* ---------------- termo (fica salvo para usar sem internet) ---------------- */
function carregarTermo() {
  if (!navigator.onLine) return Promise.resolve(estado.termo);
  return chamar('termo').then(function (t) {
    if (t._status === 200 && t.versao) { delete t._status; estado.termo = t; Guarda.gravar(K_TERMO, t); }
    return estado.termo;
  }, function () { return estado.termo; });
}

function verificarLink() {
  if (!navigator.onLine || !estado.chave) return Promise.resolve();
  return chamar('equipe', { codigo: estado.chave }).then(function (r) {
    if (r._status === 403) { estado.linkInvalido = true; Guarda.apagar(K_CHAVE); estado.chave = ''; }
  }, function () {});
}

/* ================= telas ================= */
var telaAtual = '';

function telaSemLink() {
  telaAtual = 'semlink';
  limpar(app).appendChild(h('div', { class: 'card' },
    h('h1', { text: estado.linkInvalido ? 'Este link foi desativado' : 'Abra pelo link da equipe' }),
    h('p', { class: 'sub', text: estado.linkInvalido
      ? 'Foi gerado um link novo para a equipe. Peça o link atualizado ao seu gestor e abra por ele.'
      : 'Este formulário só funciona pelo link enviado pela Safeagro. Peça o link ao seu gestor e abra por ele no celular.' })));
}

function telaColetor() {
  telaAtual = 'coletor';
  var inp = h('input', { id: 'coletor', autocomplete: 'name', maxlength: '100', value: estado.coletor, placeholder: 'Ex.: João da Silva' });
  var campo = h('label', { class: 'campo' }, h('span', null, 'Seu nome ', h('em', { text: '*' })), inp, h('div', { class: 'msg', text: 'Informe seu nome.' }));
  var btn = h('button', { class: 'btn btn-primario btn-bloco btn-grande', type: 'submit', text: 'Continuar' });
  var form = h('form', { novalidate: true, onsubmit: function (ev) {
    ev.preventDefault();
    var v = inp.value.trim().replace(/\s+/g, ' ');
    if (v.length < 3) { campo.classList.add('invalido'); inp.focus(); return; }
    estado.coletor = v; Guarda.gravar(K_COLETOR, v); telaInicio();
  } }, campo, btn);
  limpar(app).appendChild(h('div', { class: 'card' },
    h('h1', { text: 'Quem está coletando?' }),
    h('p', { class: 'sub', text: 'Seu nome vai junto com cada autorização. Fica salvo neste celular.' }), form));
  inp.focus();
}

function telaInicio() {
  telaAtual = 'inicio';
  Fila.todos().then(function (fila) {
    if (telaAtual !== 'inicio') return;
    var hist = Guarda.ler(K_HIST, []);
    var pend = fila.filter(function (i) { return !i.erroDefinitivo; });
    // Recusadas ficam no máximo 7 dias no aparelho (dados pessoais não devem ficar parados no celular).
    var limiteRec = Date.now() - 7 * 86400000;
    fila.filter(function (i) { return i.erroDefinitivo && (i.criadoLocal || 0) < limiteRec; }).forEach(function (i) { Fila.tirar(i.uuid); });
    var recusadas = fila.filter(function (i) { return i.erroDefinitivo && (i.criadoLocal || 0) >= limiteRec; });
    limpar(app);

    // Contagens a partir do histórico deste aparelho
    var agora = new Date();
    var iniHoje = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());
    var ini7 = new Date(iniHoje.getTime() - 6 * 86400000);
    var nHoje = hist.filter(function (x) { return new Date(x.quando) >= iniHoje; }).length;
    var nSemana = hist.filter(function (x) { return new Date(x.quando) >= ini7; }).length;

    app.appendChild(h('section', { class: 'inicio' },
      h('div', { class: 'inicio-ola' },
        h('span', { text: 'Olá, ' + primeiroNome(estado.coletor) }),
        h('button', { class: 'link-discreto', type: 'button', text: 'Não é você?', onclick: telaColetor })),
      h('h1', { text: 'Registrar autorização' }),
      h('p', { class: 'sub', text: 'Dados do produtor, leitura do termo e assinatura na tela. Leva cerca de 2 minutos.' }),
      h('button', { class: 'btn btn-primario btn-bloco btn-grande', type: 'button', onclick: novaColeta }, icone('caneta'), 'Nova autorização')));

    var status = pend.length
      ? h('span', { class: 'status alerta', text: pend.length + ' aguardando envio' })
      : h('span', { class: 'status ok', text: 'Tudo enviado' });
    app.appendChild(h('div', { class: 'card resumo' },
      h('div', { class: 'resumo-cab' }, h('h2', { text: 'Suas coletas' }), status),
      h('div', { class: 'resumo-nums' },
        h('div', null, h('b', { text: String(nHoje) }), h('span', { text: 'hoje' })),
        h('div', null, h('b', { text: String(nSemana) }), h('span', { text: 'últimos 7 dias' }))),
      pend.length ? h('p', { class: 'nota mt', text: navigator.onLine ? 'Enviando as autorizações guardadas…' : 'Serão enviadas sozinhas quando houver internet. Não limpe os dados do navegador.' }) : null));
    if (recusadas.length) {
      app.appendChild(h('div', { class: 'card' },
        h('h2', { text: 'Não aceitas pelo sistema' }),
        h('ul', { class: 'lista-simples' }, recusadas.map(function (i) {
          return h('li', null,
            h('div', null, h('strong', { text: i.payload.dados.nome }), h('div', { class: 'nota', text: i.erroDefinitivo })),
            h('button', { class: 'btn btn-pq btn-perigo', type: 'button', text: 'Descartar', onclick: function () {
              if (confirm('Descartar esta autorização? Será preciso coletar de novo.')) Fila.tirar(i.uuid).then(telaInicio);
            } }));
        }))));
    }
    app.appendChild(h('div', { class: 'card' },
      h('h2', { text: 'Últimas enviadas deste celular' }),
      hist.length ? h('ul', { class: 'lista-simples' }, hist.slice(0, 8).map(function (x) {
        return h('li', null,
          h('span', { class: 'li-nome' }, h('i', { class: 'ponto-ok', 'aria-hidden': 'true' }), h('strong', { text: x.nome })),
          h('span', { class: 'p', text: x.protocolo + ' · ' + dataBR(x.quando) }));
      })) : h('p', { class: 'nota', text: 'Nenhuma ainda. Por segurança, aqui aparece só o primeiro nome e o protocolo.' })));
  });
}

/* ---------------- coleta ---------------- */
function novaColeta() {
  if (!estado.termo) {
    toast('Conecte-se à internet uma vez para baixar o termo.');
    carregarTermo().then(function (t) { if (t) novaColeta(); });
    return;
  }
  estado.ficha = {
    uuid: novoUUID(),
    dados: { nome: '', cpf: '', rg: '', nacionalidade: 'Brasileira', estado_civil: '', profissao: 'Produtor rural', endereco: '', cidade: '', uf: 'PR' },
    aceite: false, assinatura: null, geo: null
  };
  pedirLocalizacao();
  passoDados();
}

function pedirLocalizacao() {
  if (!navigator.geolocation) return;
  navigator.geolocation.getCurrentPosition(function (p) {
    if (estado.ficha) estado.ficha.geo = { lat: p.coords.latitude, lng: p.coords.longitude, precisao: p.coords.accuracy };
  }, function () {}, { enableHighAccuracy: true, timeout: 15000, maximumAge: 120000 });
}

function cabecalhoPasso(n, rotulo, titulo, sub) {
  var nomes = ['Produtor', 'Termo', 'Assinatura', 'Envio'];
  var passos = nomes.map(function (nm, i) {
    var k = i + 1;
    return h('li', { class: k < n ? 'feito' : k === n ? 'atual' : '', 'aria-current': k === n ? 'step' : null },
      h('span', { class: 'bola', text: k < n ? '✓' : String(k) }), h('span', { class: 'rot', text: nm }));
  });
  return [h('ol', { class: 'passos', 'aria-label': 'Passo ' + n + ' de 4: ' + rotulo }, passos),
    h('h1', { class: 'tit-passo', text: titulo }), sub ? h('p', { class: 'sub', text: sub }) : null];
}

function barra(voltar, avancar, rotulo, desab) {
  var b = h('button', { class: 'btn btn-primario', type: 'button', text: rotulo || 'Continuar', onclick: avancar, disabled: !!desab });
  var el = h('div', { class: 'barra-fixa' }, h('button', { class: 'btn', type: 'button', text: 'Voltar', onclick: voltar }), b);
  return { el: el, btn: b };
}

function sairDaColeta() {
  if (confirm('Cancelar esta autorização? O que foi preenchido será perdido.')) { estado.ficha = null; telaInicio(); }
}

var CAMPOS = [
  { k: 'nome', rot: 'Nome completo', ac: 'name', max: 150 },
  { k: 'cpf', rot: 'CPF', tipo: 'cpf' },
  { k: 'rg', rot: 'RG', max: 30, ac: 'off' },
  { k: 'nacionalidade', rot: 'Nacionalidade', max: 60 },
  { k: 'estado_civil', rot: 'Estado civil', tipo: 'civil' },
  { k: 'profissao', rot: 'Profissão', max: 80 },
  { k: 'endereco', rot: 'Endereço residencial completo', dica: 'Logradouro, número e bairro', tipo: 'area', max: 300 },
  { k: 'cidade', rot: 'Cidade', max: 100, ac: 'address-level2' },
  { k: 'uf', rot: 'UF', tipo: 'uf' }
];

function passoDados() {
  telaAtual = 'dados';
  var f = estado.ficha;
  var campos = {};
  function montar(c) {
    var ctl;
    if (c.tipo === 'civil' || c.tipo === 'uf') {
      var ops = c.tipo === 'uf' ? estado.termo.ufs : estado.termo.estadosCivis;
      ctl = h('select', { name: c.k }, c.tipo === 'civil' ? h('option', { value: '', text: 'Selecione' }) : null,
        ops.map(function (o) { var op = h('option', { value: o, text: o }); if (o === f.dados[c.k]) op.selected = true; return op; }));
    } else if (c.tipo === 'area') {
      ctl = h('textarea', { name: c.k, maxlength: String(c.max), rows: '3', placeholder: c.dica || '' });
      ctl.value = f.dados[c.k];
    } else {
      ctl = h('input', { name: c.k, value: c.tipo === 'cpf' ? cpfMascara(f.dados.cpf) : f.dados[c.k],
        maxlength: c.tipo === 'cpf' ? '14' : String(c.max), autocomplete: c.ac || 'off',
        inputmode: c.tipo === 'cpf' ? 'numeric' : null, placeholder: c.tipo === 'cpf' ? '000.000.000-00' : null,
        autocapitalize: c.k === 'nome' || c.k === 'cidade' ? 'words' : null });
      if (c.tipo === 'cpf') ctl.addEventListener('input', function () { ctl.value = cpfMascara(ctl.value); });
    }
    var msg = c.tipo === 'cpf' ? 'CPF inválido.' : c.k === 'nome' ? 'Informe nome e sobrenome.' : 'Campo obrigatório.';
    var el = h('label', { class: 'campo' }, h('span', null, c.rot + ' ', h('em', { text: '*' })), ctl, h('div', { class: 'msg', text: msg }));
    ctl.addEventListener('input', function () { el.classList.remove('invalido'); });
    ctl.addEventListener('change', function () { el.classList.remove('invalido'); });
    campos[c.k] = { el: el, ctl: ctl };
    return el;
  }
  var porK = {};
  CAMPOS.forEach(function (c) { porK[c.k] = montar(c); });

  function ler() {
    CAMPOS.forEach(function (c) {
      var v = campos[c.k].ctl.value.trim().replace(/[ \t]+/g, ' ');
      f.dados[c.k] = c.tipo === 'cpf' ? v.replace(/\D/g, '') : v;
    });
  }
  function validar() {
    ler();
    var primeiro = null;
    CAMPOS.forEach(function (c) {
      var v = f.dados[c.k];
      var ok = v !== '';
      if (c.k === 'nome') ok = v.length >= 5 && v.indexOf(' ') > 0;
      if (c.tipo === 'cpf') ok = cpfValido(v);
      campos[c.k].el.classList.toggle('invalido', !ok);
      if (!ok && !primeiro) primeiro = campos[c.k].ctl;
    });
    if (primeiro) { primeiro.focus(); primeiro.scrollIntoView({ block: 'center', behavior: 'smooth' }); return false; }
    return true;
  }

  var b = barra(function () { ler(); sairDaColeta(); }, function () { if (validar()) passoTermo(); });
  b.el.firstChild.textContent = 'Cancelar';
  limpar(app);
  anexar(app, cabecalhoPasso(1, 'Produtor', 'Dados de quem autoriza', 'Preencha com os documentos do produtor.'));
  app.appendChild(h('div', { class: 'card' },
    porK.nome, porK.cpf,
    h('div', { class: 'duas-igual' }, porK.rg, porK.nacionalidade),
    h('div', { class: 'duas-igual' }, porK.estado_civil, porK.profissao),
    porK.endereco,
    h('div', { class: 'duas' }, porK.cidade, porK.uf),
    h('div', { class: 'data-auto', text: 'Data da autorização: ' + dataBR(new Date().toISOString()) + ' (automática)' })));
  app.appendChild(b.el);
  window.scrollTo(0, 0);
}

function passoTermo() {
  telaAtual = 'termo';
  var f = estado.ficha, t = estado.termo;
  var chk = h('input', { type: 'checkbox', checked: f.aceite });
  var aceite = h('label', { class: 'aceite' + (f.aceite ? ' marcado' : '') }, chk, h('span', { text: t.aceite }));
  var b = barra(passoDados, function () { if (f.aceite) passoAssinatura(); }, 'Continuar', !f.aceite);
  chk.addEventListener('change', function () {
    f.aceite = chk.checked;
    aceite.classList.toggle('marcado', f.aceite);
    b.btn.disabled = !f.aceite;
  });
  limpar(app);
  anexar(app, cabecalhoPasso(2, 'Termo', t.titulo));
  app.appendChild(h('div', { class: 'entrega' }, icone('celular'), h('span', { text: 'Entregue o celular ao produtor para ler o termo, marcar o aceite e assinar.' })));
  app.appendChild(h('div', { class: 'card termo-texto' }, t.paragrafos.map(function (p) { return h('p', { text: p }); })));
  app.appendChild(aceite);
  app.appendChild(b.el);
  window.scrollTo(0, 0);
}

function passoAssinatura() {
  telaAtual = 'assinatura';
  var f = estado.ficha;
  var caixa = h('div', { class: 'caixa-assin' + (f.assinatura ? ' feita' : ''), role: 'button', tabindex: '0' });
  function pintar() {
    limpar(caixa);
    caixa.classList.toggle('feita', !!f.assinatura);
    if (f.assinatura) caixa.appendChild(h('img', { src: f.assinatura, alt: 'Assinatura' }));
    else caixa.appendChild(h('div', null, icone('caneta'), h('div', { text: 'Toque aqui para assinar' })));
    b.btn.disabled = !f.assinatura;
  }
  function abrir() { abrirAssinatura(f.dados.nome, function (png) { f.assinatura = png; pintar(); }); }
  caixa.addEventListener('click', abrir);
  caixa.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); abrir(); } });
  var b = barra(passoTermo, function () { if (f.assinatura) passoConferir(); }, 'Continuar', !f.assinatura);
  limpar(app);
  anexar(app, cabecalhoPasso(3, 'Assinatura', 'Assinatura do produtor', 'A assinatura é feita na tela, com o dedo.'));
  app.appendChild(caixa);
  app.appendChild(h('div', { class: 'acoes-lin mt' },
    h('button', { class: 'btn btn-texto', type: 'button', text: 'Refazer assinatura', onclick: abrir })));
  app.appendChild(b.el);
  pintar();
  window.scrollTo(0, 0);
  if (!f.assinatura) abrir();
}

function passoConferir() {
  telaAtual = 'conferir';
  var f = estado.ficha, d = f.dados;
  var linhas = [['Nome', d.nome], ['CPF', cpfMascara(d.cpf)], ['RG', d.rg], ['Nacionalidade', d.nacionalidade], ['Estado civil', d.estado_civil],
    ['Profissão', d.profissao], ['Endereço', d.endereco], ['Cidade / UF', d.cidade + ' / ' + d.uf], ['Data', dataBR(new Date().toISOString())],
    ['Coletado por', estado.coletor], ['Localização', f.geo ? 'registrada' : 'não disponível (opcional)']];
  var dl = h('dl', { class: 'resumo-lin' });
  linhas.forEach(function (l) { dl.appendChild(h('dt', { text: l[0] })); dl.appendChild(h('dd', { text: l[1] })); });
  var b = barra(passoAssinatura, enviar, 'Enviar autorização');
  limpar(app);
  anexar(app, cabecalhoPasso(4, 'Conferir', 'Confira antes de enviar'));
  app.appendChild(h('div', { class: 'card' }, dl,
    h('div', { class: 'nota mt', text: 'Assinatura:' }),
    h('img', { src: f.assinatura, alt: 'Assinatura', class: 'assin-prev' }),
    h('div', { class: 'nota mt', text: '✓ Termo lido e aceito pelo produtor.' })));
  app.appendChild(h('button', { class: 'btn btn-texto', type: 'button', text: 'Corrigir dados', onclick: passoDados }));
  app.appendChild(b.el);
  window.scrollTo(0, 0);

  var enviando = false;
  function enviar() {
    if (enviando) return;           // trava contra duplo toque
    enviando = true;
    b.btn.disabled = true;
    b.btn.textContent = 'Enviando…';
    var payload = {
      uuid: f.uuid, dados: f.dados, aceite: true, assinatura: f.assinatura, geo: f.geo, dispositivo: idAparelho(),
      coletor: estado.coletor, coletado_em: new Date().toISOString(), termo_versao: estado.termo.versao
    };
    // Primeiro guarda no aparelho; só depois tenta mandar. Assim nada se perde se a internet cair.
    estado.enviandoAgora = f.uuid;
    Fila.por({ uuid: f.uuid, payload: payload, criadoLocal: Date.now() }).then(function () {
      estado.ficha = null;
      if (!navigator.onLine || !estado.chave) return telaResultado(null, payload.dados.nome, null, payload);
      var limite = new Promise(function (ok) { setTimeout(function () { ok({ _timeout: true }); }, 20000); });
      var envio = chamar('coletar', payload, { 'X-Equipe': estado.chave }).catch(function () { return { _rede: true }; });
      return Promise.race([envio, limite]).then(function (r) {
        estado.enviandoAgora = null;
        if (r._status === 200 && r.ok) {
          guardarHistorico({ protocolo: r.protocolo, nome: primeiroNome(payload.dados.nome), quando: payload.coletado_em });
          return Fila.tirar(f.uuid).then(function () { telaResultado(r.protocolo, payload.dados.nome, null, payload); });
        }
        if (r._status === 403 && r.linkInvalido) { estado.linkInvalido = true; return telaResultado(null, payload.dados.nome, 'O link desta equipe foi desativado. A autorização ficou guardada; abra o link novo para enviá-la.', payload); }
        if (r._status === 409 && r.termoMudou) {
          return Fila.tirar(f.uuid).then(function () { Guarda.apagar(K_TERMO); estado.termo = null; telaErro('O termo foi atualizado pela Safeagro. Recarregue a página e colete de novo.'); });
        }
        if (r._status >= 400 && r._status < 500 && r._status !== 429) {
          return Fila.tirar(f.uuid).then(function () {
            estado.ficha = Object.assign({}, f, { uuid: novoUUID() });
            telaErro(r.erro || 'Os dados foram recusados.', true);
          });
        }
        // 429, erro do servidor ou demora: fica na fila e vai sozinha depois.
        var aviso = (r._rede || r._timeout) ? null : 'O sistema não conseguiu receber agora. A autorização de ' + payload.dados.nome + ' ficou guardada no celular e será enviada automaticamente.';
        return telaResultado(null, payload.dados.nome, aviso, payload);
      });
    }, function () {
      estado.enviandoAgora = null;
      enviando = false; b.btn.disabled = false; b.btn.textContent = 'Enviar autorização';
      toast('Não foi possível guardar no celular. Verifique o espaço livre e tente de novo.', 5000);
    });
  }
}

function telaResultado(protocolo, nome, aviso, payload) {
  telaAtual = 'resultado';
  limpar(app);
  var ok = !!protocolo;
  // Dados só ficam em memória enquanto esta tela está aberta; ao sair, o PDF não pode mais ser gerado.
  var info = payload ? { protocolo: protocolo, dados: payload.dados, assinatura: payload.assinatura, geo: payload.geo,
    coletor: payload.coletor, quando: payload.coletado_em, termo: estado.termo } : null;
  // Passo 1: gerar. Passo 2: compartilhar/salvar com um toque novo (o navegador exige toque recente para isso).
  var areaPdf = info ? h('div', { class: 'area-pdf' }) : null;
  var urlPdf = null;
  function botaoGerar() {
    var gerando = false;
    var b = h('button', { class: 'btn btn-bloco btn-grande btn-pdf', type: 'button', onclick: function () {
      if (gerando) return;
      gerando = true; b.disabled = true; b.lastChild.textContent = 'Gerando PDF…';
      var limite = new Promise(function (_, falha) { setTimeout(function () { falha(new Error('tempo')); }, 25000); });
      Promise.race([gerarComprovantePDF(info), limite]).then(mostrarOpcoes, function () {
        toast('Não foi possível gerar o PDF. Tente de novo.', 4500);
        gerando = false; b.disabled = false; b.lastChild.textContent = 'Gerar PDF para o produtor';
      });
    } }, icone('pdf'), h('span', { text: 'Gerar PDF para o produtor' }));
    limpar(areaPdf).appendChild(b);
  }
  function mostrarOpcoes(blob) {
    var nomeArq = nomeArquivoPDF(info);
    if (urlPdf) URL.revokeObjectURL(urlPdf);
    urlPdf = URL.createObjectURL(blob);
    var arq = null;
    try { arq = new File([blob], nomeArq, { type: 'application/pdf' }); } catch (e) {}
    var podeCompartilhar = !!(arq && navigator.canShare && navigator.canShare({ files: [arq] }));
    limpar(areaPdf);
    areaPdf.appendChild(h('div', { class: 'pdf-pronto', text: '✓ PDF pronto (' + Math.round(blob.size / 1024) + ' KB)' }));
    if (podeCompartilhar) {
      areaPdf.appendChild(h('button', { class: 'btn btn-bloco btn-grande btn-pdf', type: 'button', onclick: function () {
        navigator.share({ files: [arq], title: 'Autorização de uso de imagem', text: 'Sua via da autorização de uso de imagem — Safeagro.' })
          .catch(function (e) { if (!e || e.name !== 'AbortError') toast('Não abriu o compartilhar. Use "Salvar PDF".', 4500); });
      } }, icone('pdf'), h('span', { text: 'Compartilhar (WhatsApp, e-mail…)' })));
    }
    areaPdf.appendChild(h('div', { class: 'pdf-acoes' },
      h('a', { class: 'btn btn-bloco', href: urlPdf, download: nomeArq, text: 'Salvar PDF' }),
      h('a', { class: 'btn btn-bloco', href: urlPdf, target: '_blank', rel: 'noopener', text: 'Abrir PDF' })));
  }
  if (areaPdf) botaoGerar();

  app.appendChild(h('div', { class: 'card sucesso' },
    h('div', { class: 'icone' + (ok ? '' : ' pend') }, icone(ok ? 'check' : 'nuvem')),
    h('h1', { text: ok ? 'Autorização registrada' : 'Guardada no celular' }),
    ok ? h('div', { class: 'prot', text: protocolo }) : null,
    h('p', { class: 'sub', text: ok
      ? 'A autorização de ' + nome + ' foi recebida e está segura no sistema da Safeagro.'
      : (aviso || 'Sem internet agora. A autorização de ' + nome + ' será enviada sozinha quando o celular se conectar. Abra este app de vez em quando para concluir o envio.') }),
    areaPdf,
    areaPdf ? h('p', { class: 'nota nota-pdf', text: 'Se quiser, mande a via do produtor agora por WhatsApp ou e-mail. Depois de sair desta tela, o PDF não pode ser gerado de novo pelo celular.' }) : null,
    h('button', { class: 'btn btn-primario btn-bloco btn-grande', type: 'button', text: 'Nova autorização', onclick: novaColeta }),
    h('div', { class: 'esp' }),
    h('button', { class: 'btn btn-bloco', type: 'button', text: 'Voltar ao início', onclick: telaInicio })));
  window.scrollTo(0, 0);
}

function telaErro(msg, podeCorrigir) {
  telaAtual = 'erro';
  limpar(app);
  app.appendChild(h('div', { class: 'aviso aviso-erro', text: msg }));
  if (podeCorrigir && estado.ficha) app.appendChild(h('button', { class: 'btn btn-primario btn-bloco', type: 'button', text: 'Corrigir dados', onclick: passoDados }));
  app.appendChild(h('div', { class: 'esp' }));
  app.appendChild(h('button', { class: 'btn btn-bloco', type: 'button', text: 'Voltar ao início', onclick: telaInicio }));
}

/* Aviso ao fechar no meio de uma coleta */
window.addEventListener('beforeunload', function (e) {
  if (estado.ficha && (estado.ficha.dados.nome || estado.ficha.assinatura)) { e.preventDefault(); e.returnValue = ''; }
});

/* ---------------- início ---------------- */
function iniciar() {
  if (!estado.chave) { telaSemLink(); return; }
  Promise.all([verificarLink(), carregarTermo()]).then(function () {
    if (!estado.chave) { telaSemLink(); return; }
    if (!estado.coletor) telaColetor(); else telaInicio();
    sincronizar();
  });
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', function () { navigator.serviceWorker.register('sw.js').catch(function () {}); });
  // Versão nova do app assumiu: recarrega uma vez para não misturar arquivos (nunca no meio de uma coleta).
  var jaControlado = !!navigator.serviceWorker.controller, recarregou = false;
  navigator.serviceWorker.addEventListener('controllerchange', function () {
    if (!jaControlado || recarregou || estado.ficha || telaAtual === 'resultado') return;
    recarregou = true;
    location.reload();
  });
}
iniciar();
