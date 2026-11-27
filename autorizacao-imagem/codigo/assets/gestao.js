/* Área de gestão: login, consulta, comprovante, revogação, exportação, link da equipe e acessos. */
'use strict';

var API = 'api.php';
var raiz = document.getElementById('raiz');
var S = { eu: null, csrf: '', aba: 'autorizacoes', filtros: { q: '', status: '', coletor: '', de: '', ate: '' } };

function api(acao, corpo, params) {
  var url = API + '?a=' + encodeURIComponent(acao);
  if (params) Object.keys(params).forEach(function (k) { if (params[k] !== '' && params[k] != null) url += '&' + k + '=' + encodeURIComponent(params[k]); });
  var op = { method: corpo ? 'POST' : 'GET', credentials: 'same-origin', cache: 'no-store', headers: { 'Accept': 'application/json' } };
  if (corpo) { op.headers['Content-Type'] = 'application/json'; op.headers['X-CSRF'] = S.csrf; op.body = JSON.stringify(corpo); }
  return fetch(url, op).then(function (r) {
    return r.json().catch(function () { return {}; }).then(function (j) {
      if (r.status === 401 && acao !== 'entrar') { S.eu = null; telaLogin('Sua sessão expirou. Entre novamente.'); throw new Error('sessao'); }
      if (r.status === 403 && j.trocarSenha) { telaTrocarSenha(); throw new Error('trocar'); }
      if (!r.ok) { var e = new Error(j.erro || ('Erro ' + r.status)); e.status = r.status; throw e; }
      return j;
    });
  });
}

function falhou(e) { if (e && e.message !== 'sessao' && e.message !== 'trocar') toast(e.message || 'Falha de comunicação.', 4500); }

/* ---------------- login ---------------- */
function telaAcesso(titulo, sub, form) {
  document.body.className = 'pg-acesso';
  limpar(raiz).appendChild(h('div', { class: 'acesso' },
    h('aside', { class: 'acesso-marca' },
      h('img', { src: 'assets/icone.png', alt: '', class: 'acesso-icone' }),
      h('div', null,
        h('div', { class: 'acesso-kicker', text: 'Safeagro' }),
        h('div', { class: 'acesso-titulo', text: 'Autorizações de uso de imagem, voz e depoimentos' })),
      h('ul', { class: 'acesso-lista' },
        h('li', { text: 'Assinatura feita na tela do celular' }),
        h('li', { text: 'Dados protegidos com criptografia' }),
        h('li', { text: 'Comprovante pronto para imprimir' }))),
    h('main', { class: 'acesso-form' },
      h('div', { class: 'acesso-caixa' },
        h('img', { src: 'assets/marca.png', alt: 'Safeagro', class: 'marca-login' }),
        h('h1', { text: titulo }), h('p', { class: 'sub', text: sub }), form))));
}

function telaLogin(aviso) {
  var email = h('input', { type: 'email', autocomplete: 'username', required: true, maxlength: '150' });
  var senha = h('input', { type: 'password', autocomplete: 'current-password', required: true, maxlength: '200' });
  var msg = h('div', { class: 'aviso aviso-erro', hidden: !aviso, text: aviso || '' });
  var btn = h('button', { class: 'btn btn-primario btn-bloco', type: 'submit', text: 'Entrar' });
  var form = h('form', { class: 'form-simples', onsubmit: function (ev) {
    ev.preventDefault();
    if (btn.disabled) return;
    btn.disabled = true; btn.textContent = 'Entrando…';
    api('entrar', { email: email.value.trim(), senha: senha.value }).then(function (r) {
      S.eu = r; S.csrf = r.csrf;
      if (r.trocarSenha) telaTrocarSenha(); else telaGestao();
    }).catch(function (e) {
      msg.hidden = false; msg.textContent = e.message; senha.value = ''; senha.focus();
      btn.disabled = false; btn.textContent = 'Entrar';
    });
  } }, msg, h('label', null, 'E-mail', email), h('label', null, 'Senha', senha), btn);
  telaAcesso('Entrar', 'Acesso restrito a pessoas autorizadas.', form);
  email.focus();
}

function telaTrocarSenha() {
  var atual = h('input', { type: 'password', autocomplete: 'current-password', required: true });
  var nova = h('input', { type: 'password', autocomplete: 'new-password', required: true, minlength: '10' });
  var conf = h('input', { type: 'password', autocomplete: 'new-password', required: true, minlength: '10' });
  var msg = h('div', { class: 'aviso aviso-erro', hidden: true });
  var btn = h('button', { class: 'btn btn-primario btn-bloco', type: 'submit', text: 'Salvar nova senha' });
  var form = h('form', { class: 'form-simples', onsubmit: function (ev) {
    ev.preventDefault();
    if (nova.value !== conf.value) { msg.hidden = false; msg.textContent = 'A confirmação não bate com a nova senha.'; return; }
    btn.disabled = true;
    api('trocar-senha', { atual: atual.value, nova: nova.value }).then(function (r) {
      if (r.csrf) S.csrf = r.csrf; // a sessão é renovada ao trocar a senha
      toast('Senha alterada.'); S.eu.trocarSenha = false; telaGestao();
    }).catch(function (e) { msg.hidden = false; msg.textContent = e.message; btn.disabled = false; });
  } }, msg, h('label', null, 'Senha atual (provisória)', atual), h('label', null, 'Nova senha (mín. 10 caracteres)', nova),
    h('label', null, 'Repita a nova senha', conf), btn);
  telaAcesso('Crie a sua senha', 'Por segurança, troque a senha provisória antes de continuar.', form);
  atual.focus();
}

function sair() {
  api('sair', {}).catch(function () {}).then(function () { S.eu = null; S.csrf = ''; telaLogin(); });
}

/* ---------------- estrutura ---------------- */
var conteudo;
function telaGestao() {
  document.body.className = 'pg-gestao';
  var abas = [
    ['autorizacoes', 'Autorizações', 'M5 4h14v16H5z M9 9h6 M9 13h6 M9 17h3'],
    ['link', 'Link da equipe', 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1 M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1'],
    ['acessos', 'Acessos', 'M16 19v-1a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1 M9.5 10a3 3 0 1 0 0-6a3 3 0 0 0 0 6 M20 19v-1a4 4 0 0 0-3-3.9 M16 4.1a3 3 0 0 1 0 5.8'],
    ['atividade', 'Atividade', 'M3 12h4l3 8l4-16l3 8h4']];
  // Perfil "Consulta" só vê as autorizações; o servidor também bloqueia o resto.
  if (!S.eu.admin) { abas = abas.slice(0, 1); S.aba = 'autorizacoes'; }
  var nav = h('nav', { class: 'menu', 'aria-label': 'Seções' }, abas.map(function (a) {
    var b = h('button', { type: 'button', class: S.aba === a[0] ? 'ativa' : '', onclick: function () { S.aba = a[0]; telaGestao(); } });
    b.appendChild(svgLinha(a[2]));
    b.appendChild(h('span', { text: a[1] }));
    return b;
  }));
  var titulos = { autorizacoes: 'Autorizações', link: 'Link da equipe', acessos: 'Acessos', atividade: 'Registro de atividade' };
  conteudo = h('div', { class: 'gestao-conteudo' });
  limpar(raiz);
  raiz.appendChild(h('div', { class: 'gestao' },
    h('aside', { class: 'lateral' },
      h('div', { class: 'lateral-marca' }, h('img', { src: 'assets/icone.png', alt: '' }),
        h('div', null, h('b', { text: 'Autorizações' }), h('span', { text: 'Safeagro' }))),
      nav,
      h('div', { class: 'lateral-usuario' },
        h('div', { class: 'avatar', text: (S.eu.nome || '?').trim().charAt(0).toUpperCase() }),
        h('div', { class: 'quem' }, h('b', { text: S.eu.nome }), h('span', { text: S.eu.admin ? 'Administrador' : 'Consulta' })),
        h('button', { class: 'sair', type: 'button', text: 'Sair', onclick: sair }))),
    h('main', { class: 'gestao-main' },
      h('header', { class: 'gestao-topo' }, h('h1', { text: titulos[S.aba] })),
      conteudo)));
  ({ autorizacoes: abaAutorizacoes, link: abaLink, acessos: abaAcessos, atividade: abaAtividade })[S.aba]();
}

function svgLinha(d) {
  var ns = 'http://www.w3.org/2000/svg';
  var s = document.createElementNS(ns, 'svg');
  [['viewBox', '0 0 24 24'], ['width', '20'], ['height', '20'], ['fill', 'none'], ['stroke', 'currentColor'], ['stroke-width', '1.8'],
    ['stroke-linecap', 'round'], ['stroke-linejoin', 'round'], ['aria-hidden', 'true']].forEach(function (a) { s.setAttribute(a[0], a[1]); });
  d.split(' M').forEach(function (p, i) { var e = document.createElementNS(ns, 'path'); e.setAttribute('d', (i ? 'M' : '') + p); s.appendChild(e); });
  return s;
}

/* ---------------- autorizações ---------------- */
function abaAutorizacoes() {
  var kpis = h('div', { class: 'kpis card' });
  api('resumo').then(function (r) {
    limpar(kpis);
    function kpi(rotulo, valor, extra) {
      return h('div', { class: 'kpi' }, h('span', { class: 'kpi-rot', text: rotulo }), h('b', { text: String(valor) }), extra);
    }
    var desde = h('span', { class: 'kpi-sub', text: 'desde ' + dataBR(r.desde + 'T12:00:00') });
    // pilha de iniciais de quem mais coleta (até 5) + "+N" para o restante
    var nomes = r.coletoresTop;
    var avatares = h('div', { class: 'pilha' }, nomes.map(function (n) {
      return h('span', { class: 'mini-av', title: n, text: n.trim().split(/\s+/).slice(0, 2).map(function (p) { return p.charAt(0); }).join('').toUpperCase() });
    }), r.nColetores > nomes.length ? h('span', { class: 'mini-av mais', text: '+' + (r.nColetores - nomes.length) }) : null);
    var total = r.validas + r.revogadas;
    anexar(kpis, [
      kpi('Autorizações válidas', r.validas, h('span', { class: 'kpi-sub', text: total ? Math.round(r.validas / total * 100) + '% do total registrado' : 'nenhuma ainda' })),
      kpi('Últimos 30 dias', r.ultimos30, desde),
      kpi('Revogadas', r.revogadas, h('span', { class: 'status ' + (r.revogadas ? 'erro' : 'neutro'), text: r.revogadas ? 'produtor pediu retirada' : 'nenhuma' })),
      kpi('Pessoas coletando', r.nColetores, r.nColetores ? avatares : h('span', { class: 'kpi-sub', text: 'ninguém ainda' }))]);
  }).catch(falhou);

  var f = S.filtros;
  var q = h('input', { class: 'q', type: 'search', placeholder: 'Buscar por nome, cidade, CPF ou protocolo', value: f.q });
  var st = h('select', null, [['', 'Status: todos'], ['valida', 'Válidas'], ['revogada', 'Revogadas']].map(function (o) {
    var op = h('option', { value: o[0], text: o[1] }); if (o[0] === f.status) op.selected = true; return op;
  }));
  var col = h('select', null, h('option', { value: '', text: 'Coletor: todos' }));
  var de = h('input', { type: 'date', value: f.de, 'aria-label': 'De' });
  var ate = h('input', { type: 'date', value: f.ate, 'aria-label': 'Até' });
  var lista = h('div', { class: 'card' }, h('div', { class: 'vazio', text: 'Carregando…' }));

  var t;
  function aplicar() {
    S.filtros = { q: q.value.trim(), status: st.value, coletor: col.value, de: de.value, ate: ate.value };
    carregar();
  }
  q.addEventListener('input', function () { clearTimeout(t); t = setTimeout(aplicar, 350); });
  [st, col, de, ate].forEach(function (el) { el.addEventListener('change', aplicar); });

  function carregar() {
    api('lista', null, S.filtros).then(function (r) {
      if (col.options.length === 1) r.coletores.forEach(function (c) {
        var op = h('option', { value: c, text: c }); if (c === S.filtros.coletor) op.selected = true; col.appendChild(op);
      });
      limpar(lista);
      if (!r.itens.length) { lista.appendChild(h('div', { class: 'vazio', text: 'Nenhuma autorização encontrada.' })); return; }
      var corpo = h('tbody');
      r.itens.forEach(function (it) {
        corpo.appendChild(h('tr', { tabindex: '0', onclick: function () { abrirDetalhe(it.id, carregar); },
          onkeydown: function (e) { if (e.key === 'Enter') abrirDetalhe(it.id, carregar); } },
          h('td', null, h('strong', { text: it.nome }), h('div', { class: 'nota', text: it.cpf })),
          h('td', { text: it.cidade + ' / ' + it.uf }),
          h('td', { text: it.coletor }),
          h('td', { class: 'mono', text: dataBR(it.criado_em, true) }),
          h('td', { class: 'mono', text: it.protocolo }),
          h('td', null, h('span', { class: 'pill ' + (it.status === 'valida' ? 'ok' : 'rev'), text: it.status === 'valida' ? 'válida' : 'revogada' }))));
      });
      lista.appendChild(h('div', { class: 'nota', text: r.itens.length + (r.itens.length === 1 ? ' autorização' : ' autorizações') }));
      lista.appendChild(h('table', { class: 'tabela' },
        h('thead', null, h('tr', null, ['Produtor', 'Cidade', 'Coletado por', 'Data', 'Protocolo', 'Status'].map(function (c) { return h('th', { text: c }); }))),
        corpo));
    }).catch(function (e) { falhou(e); limpar(lista).appendChild(h('div', { class: 'vazio', text: 'Não foi possível carregar.' })); });
  }

  var btnExp = S.eu.admin ? h('button', { class: 'btn btn-pq', type: 'button', text: 'Exportar planilha (CSV)', onclick: exportar }) : null;
  anexar(conteudo, [
    kpis,
    h('div', { class: 'entre' }, h('h2', { text: 'Recebidas' }), btnExp),
    h('div', { class: 'filtros' }, q, st, col, de, ate),
    lista]);
  carregar();

  function exportar() {
    if (!confirm('A planilha terá CPF, RG e endereço de todos os produtores. Guarde o arquivo em local seguro e apague quando não precisar mais. Continuar?')) return;
    btnExp.disabled = true;
    fetch(API + '?a=exportar', { method: 'POST', credentials: 'same-origin', headers: { 'X-CSRF': S.csrf, 'Content-Type': 'application/json' }, body: '{}' })
      .then(function (r) { if (!r.ok) throw new Error('Falha ao exportar.'); return r.blob(); })
      .then(function (b) {
        var u = URL.createObjectURL(b);
        var a = h('a', { href: u, download: 'autorizacoes-' + new Date().toISOString().slice(0, 10) + '.csv' });
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(function () { URL.revokeObjectURL(u); }, 2000);
      }).catch(falhou).then(function () { btnExp.disabled = false; });
  }
}

function modal(conteudoEls) {
  var caixa = h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true' }, conteudoEls);
  var fundo = h('div', { class: 'modal-fundo', onclick: function (e) { if (e.target === fundo) fechar(); } }, caixa);
  function fechar() { fundo.remove(); document.removeEventListener('keydown', esc); }
  function esc(e) { if (e.key === 'Escape') fechar(); }
  document.addEventListener('keydown', esc);
  document.body.appendChild(fundo);
  return { fechar: fechar, caixa: caixa };
}

function abrirDetalhe(id, aoMudar) {
  var m = modal(h('div', { class: 'vazio', text: 'Carregando…' }));
  api('ver', null, { id: id }).then(function (it) {
    var d = it.dados;
    var dl = h('dl', { class: 'resumo-lin' });
    [['CPF', d.cpf], ['RG', d.rg], ['Nacionalidade', d.nacionalidade], ['Estado civil', d.estado_civil], ['Profissão', d.profissao],
      ['Endereço', d.endereco], ['Cidade / UF', d.cidade + ' / ' + d.uf], ['Data', d.data_autorizacao], ['Coletado por', it.coletor],
      ['Registrado', dataBR(it.criado_em, true)], ['Localização', it.geo ? it.geo.lat.toFixed(5) + ', ' + it.geo.lng.toFixed(5) : '—'],
      ['Aparelho', it.dispositivo ? 'nº ' + it.dispositivo : '—'],
      ['Integridade', it.integro ? '✓ conferida, sem alteração' : '✗ NÃO CONFERE']]
      .forEach(function (l) { dl.appendChild(h('dt', { text: l[0] })); dl.appendChild(h('dd', { text: l[1] })); });
    var acoes = h('div', { class: 'acoes-lin mt' },
      h('a', { class: 'btn btn-primario', href: 'comprovante.php?id=' + it.id, target: '_blank', rel: 'noopener', text: 'Abrir comprovante (PDF)' }),
      S.eu.admin && it.status === 'valida' ? h('button', { class: 'btn', type: 'button', text: 'Revogar', onclick: revogar }) : null,
      S.eu.admin ? h('button', { class: 'btn btn-perigo', type: 'button', text: 'Excluir dados', onclick: excluir }) : null,
      h('button', { class: 'btn btn-texto', type: 'button', text: 'Fechar', onclick: m.fechar }));
    limpar(m.caixa);
    anexar(m.caixa, [
      h('div', { class: 'passo-rot', text: it.protocolo }),
      h('h2', null, it.dados.nome, ' ', h('span', { class: 'pill ' + (it.status === 'valida' ? 'ok' : 'rev'), text: it.status === 'valida' ? 'válida' : 'revogada' })),
      it.status === 'revogada' ? h('div', { class: 'aviso aviso-alerta', text: 'Revogada em ' + dataBR(it.revogada_em) + ': ' + it.revogada_motivo }) : null,
      dl,
      h('div', { class: 'nota mt', text: 'Assinatura' }),
      h('img', { class: 'assin-img', src: it.assinatura, alt: 'Assinatura' }),
      acoes]);

    function revogar() {
      var motivo = prompt('Motivo da revogação (ex.: produtor pediu para retirar a autorização):');
      if (!motivo) return;
      api('revogar', { id: it.id, motivo: motivo }).then(function () { toast('Autorização revogada.'); m.fechar(); aoMudar(); }).catch(falhou);
    }
    function excluir() {
      var motivo = prompt('Excluir apaga para sempre os dados e a assinatura (use em pedido de exclusão pela LGPD).\n\nMotivo:');
      if (!motivo) return;
      var conf = prompt('Para confirmar, digite o protocolo ' + it.protocolo + ':');
      if (conf === null) return;
      api('excluir', { id: it.id, motivo: motivo, confirmacao: conf.trim() }).then(function () { toast('Dados excluídos.'); m.fechar(); aoMudar(); }).catch(falhou);
    }
  }).catch(function (e) { m.fechar(); falhou(e); });
}

/* ---------------- link da equipe ---------------- */
function abaLink() {
  var box = h('div', { class: 'card' }, h('div', { class: 'vazio', text: 'Carregando…' }));
  conteudo.appendChild(box);
  function montar(r) {
    var link = new URL('./?k=' + r.codigo, location.href).href;
    limpar(box);
    anexar(box, [
      h('h2', { text: 'Link para os vendedores' }),
      h('p', { class: 'sub', text: 'Mande este link para a equipe de campo (WhatsApp ou e-mail). Quem abre não faz login: preenche e envia. Ninguém consegue ver as autorizações já enviadas pelo link.' }),
      h('div', { class: 'link-box' }, h('span', { text: link })),
      h('div', { class: 'acoes-lin mt' },
        h('button', { class: 'btn btn-primario', type: 'button', text: 'Copiar link', onclick: function () {
          navigator.clipboard.writeText(link).then(function () { toast('Link copiado.'); }, function () { toast('Selecione e copie o link manualmente.'); });
        } }),
        h('button', { class: 'btn btn-perigo', type: 'button', text: 'Gerar link novo', onclick: function () {
          if (!confirm('O link atual para de funcionar na hora. Quem tiver coletas guardadas sem internet só consegue enviar depois de abrir o link novo. Gerar outro link?')) return;
          api('link-novo', {}).then(function (n) { montar(n); toast('Link novo gerado. Envie para a equipe.'); }).catch(falhou);
        } })),
      h('p', { class: 'nota mt', text: 'Ativo desde ' + dataBR(r.desde, true) + '. Gere um link novo se ele vazar ou se alguém sair da equipe.' }),
      h('div', { class: 'aviso aviso-alerta mt', text: 'Dica para a equipe: depois de abrir o link, use "Adicionar à tela inicial" no navegador. Assim o formulário abre como aplicativo e funciona sem internet.' })]);
  }
  api('link').then(montar).catch(falhou);
}

/* ---------------- acessos da gestão ---------------- */
function abaAcessos() {
  var box = h('div', { class: 'card' });
  var nome = h('input', { placeholder: 'Nome', maxlength: '100' });
  var email = h('input', { type: 'email', placeholder: 'E-mail', maxlength: '150' });
  var perfil = h('select', { 'aria-label': 'Perfil' },
    h('option', { value: 'consulta', text: 'Consulta (só vê)' }),
    h('option', { value: 'admin', text: 'Administrador' }));
  var form = h('form', { class: 'filtros form-acesso', onsubmit: function (ev) {
    ev.preventDefault();
    var adm = perfil.value === 'admin';
    if (adm && !confirm('Administrador pode exportar todos os dados, excluir autorizações e gerenciar acessos. Confirmar?')) return;
    api('usuario-criar', { nome: nome.value.trim(), email: email.value.trim(), admin: adm }).then(function (r) {
      mostrarSenha(email.value.trim(), r.senha); nome.value = ''; email.value = ''; perfil.value = 'consulta'; carregar();
    }).catch(falhou);
  } }, nome, email, perfil, h('button', { class: 'btn btn-primario', type: 'submit', text: 'Criar acesso' }));
  anexar(conteudo, [
    h('div', { class: 'card' },
      h('h2', { text: 'Quem acessa a gestão' }),
      h('p', { class: 'sub', text: 'Só pessoas autorizadas da Safeagro. Cada uma tem a própria senha e é obrigada a trocá-la no primeiro acesso. "Consulta" vê as autorizações e abre comprovantes; "Administrador" também revoga, exclui, exporta e gerencia acessos e o link.' }),
      form),
    box]);
  function carregar() {
    api('usuarios').then(function (r) {
      limpar(box);
      var corpo = h('tbody');
      r.usuarios.forEach(function (u) {
        corpo.appendChild(h('tr', null,
          h('td', null, h('strong', { text: u.nome }), u.eu ? ' (você)' : '', h('div', { class: 'nota', text: u.email })),
          h('td', { text: u.admin ? 'Administrador' : 'Consulta' }),
          h('td', null, h('span', { class: 'pill ' + (u.ativo ? 'ok' : 'rev'), text: u.ativo ? 'ativo' : 'desativado' }),
            u.trocar_senha ? h('span', { class: 'pill pend', text: 'senha provisória' }) : null),
          h('td', { class: 'mono', text: u.ultimo_acesso ? dataBR(u.ultimo_acesso, true) : 'nunca entrou' }),
          h('td', null, u.eu ? null : h('div', { class: 'acoes-lin' },
            h('button', { class: 'btn btn-pq', type: 'button', text: u.admin ? 'Tornar consulta' : 'Tornar admin', onclick: function () {
              if (!u.admin && !confirm('Dar perfil de administrador para ' + u.nome + '?')) return;
              api('usuario-perfil', { id: u.id, admin: !u.admin }).then(carregar).catch(falhou);
            } }),
            h('button', { class: 'btn btn-pq', type: 'button', text: 'Nova senha', onclick: function () {
              if (!confirm('Gerar uma senha provisória nova para ' + u.nome + '? A atual deixa de valer.')) return;
              api('usuario-senha', { id: u.id }).then(function (x) { mostrarSenha(u.email, x.senha); carregar(); }).catch(falhou);
            } }),
            h('button', { class: 'btn btn-pq' + (u.ativo ? ' btn-perigo' : ''), type: 'button', text: u.ativo ? 'Desativar' : 'Reativar', onclick: function () {
              api('usuario-ativo', { id: u.id, ativo: !u.ativo }).then(carregar).catch(falhou);
            } })))));
      });
      box.appendChild(h('table', { class: 'tabela' },
        h('thead', null, h('tr', null, ['Pessoa', 'Perfil', 'Situação', 'Último acesso', ''].map(function (c) { return h('th', { text: c }); }))), corpo));
    }).catch(falhou);
  }
  carregar();
}

function mostrarSenha(email, senha) {
  var m = modal([
    h('h2', { text: 'Senha provisória' }),
    h('p', { class: 'sub', text: 'Passe para ' + email + ' por um canal seguro. Ela não aparece de novo e precisa ser trocada no primeiro acesso.' }),
    h('div', { class: 'link-box' }, h('span', { text: senha })),
    h('div', { class: 'acoes-lin mt' },
      h('button', { class: 'btn btn-primario', type: 'button', text: 'Copiar', onclick: function () { navigator.clipboard.writeText(senha).then(function () { toast('Copiada.'); }); } }),
      h('button', { class: 'btn', type: 'button', text: 'Fechar', onclick: function () { m.fechar(); } }))]);
}

/* ---------------- atividade ---------------- */
var NOMES_ACAO = { coleta: 'Nova autorização', login: 'Entrou na gestão', logout: 'Saiu', login_falhou: 'Senha errada', visualizou: 'Abriu autorização',
  comprovante: 'Abriu comprovante', revogou: 'Revogou', excluiu: 'Excluiu dados', exportou: 'Exportou planilha', criou_acesso: 'Criou acesso',
  desativou_acesso: 'Desativou acesso', reativou_acesso: 'Reativou acesso', gerou_senha: 'Gerou senha', senha_trocada: 'Trocou a senha',
  novo_link_equipe: 'Gerou link novo', instalacao: 'Instalação', mudou_perfil: 'Mudou perfil' };

var verColetas = false;
function abaAtividade() {
  var box = h('div', { class: 'card' }, h('div', { class: 'vazio', text: 'Carregando…' }));
  var alternar = h('div', { class: 'acoes-lin' },
    h('button', { class: 'btn btn-pq' + (verColetas ? '' : ' btn-primario'), type: 'button', text: 'Ações da equipe', onclick: function () { verColetas = false; telaGestao(); } }),
    h('button', { class: 'btn btn-pq' + (verColetas ? ' btn-primario' : ''), type: 'button', text: 'Coletas recebidas', onclick: function () { verColetas = true; telaGestao(); } }));
  anexar(conteudo, [h('div', { class: 'entre' },
    h('p', { class: 'sub', text: verColetas ? 'Cada autorização recebida pelo link da equipe (últimos 500).' : 'Quem entrou, viu, exportou, revogou ou excluiu, e mudanças de acesso (últimos 500).' }), alternar), box]);
  api('eventos', null, { coletas: verColetas ? '1' : '' }).then(function (r) {
    limpar(box);
    var corpo = h('tbody');
    r.eventos.forEach(function (ev) {
      corpo.appendChild(h('tr', null,
        h('td', { class: 'mono', text: dataBR(ev.quando, true) }),
        h('td', { text: ev.quem || '—' }),
        h('td', { text: NOMES_ACAO[ev.acao] || ev.acao }),
        h('td', { text: [ev.alvo, ev.detalhe].filter(Boolean).join(' · ') }),
        h('td', { class: 'mono nota', text: ev.ip || '' })));
    });
    box.appendChild(h('table', { class: 'tabela' },
      h('thead', null, h('tr', null, ['Quando', 'Quem', 'O quê', 'Detalhe', 'IP'].map(function (c) { return h('th', { text: c }); }))), corpo));
  }).catch(falhou);
}

/* ---------------- início ---------------- */
api('eu').then(function (r) {
  if (!r.logado) return telaLogin();
  S.eu = r; S.csrf = r.csrf;
  if (r.trocarSenha) telaTrocarSenha(); else telaGestao();
}).catch(function (e) { if (e.message !== 'sessao') telaLogin('Não foi possível conectar ao servidor.'); });
