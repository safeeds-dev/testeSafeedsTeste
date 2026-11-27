/* Gera o comprovante em PDF no próprio aparelho, com os dados que o vendedor acabou de enviar.
   Não consulta o servidor (o formulário não tem acesso de leitura) e funciona sem internet.
   Cada página é desenhada num canvas A4 e embutida no PDF como imagem JPEG. */
'use strict';

var PDF_W = 1240, PDF_H = 1754, PDF_M = 96;   // A4 a 150 dpi
var COR = { verde: '#0d5a2e', texto: '#15231a', suave: '#56655b', linha: '#cfd8ce', fundoTh: '#f1f5f0' };

function carregarImagem(src) {
  return new Promise(function (ok) {
    var im = new Image();
    im.onload = function () { ok(im); };
    im.onerror = function () { ok(null); };
    im.src = src;
  });
}

function quebrarLinhas(ctx, texto, largura) {
  var saida = [];
  String(texto || '').split('\n').forEach(function (par) {
    var palavras = par.split(/\s+/).filter(Boolean), linha = '';
    palavras.forEach(function (p) {
      var teste = linha ? linha + ' ' + p : p;
      if (ctx.measureText(teste).width > largura && linha) { saida.push(linha); linha = p; }
      else linha = teste;
    });
    saida.push(linha);
  });
  return saida;
}

function gerarComprovantePDF(info) {
  var fontes = document.fonts ? Promise.all([
    document.fonts.load('400 20px Montserrat'), document.fonts.load('600 20px Montserrat'), document.fonts.load('700 20px Montserrat')
  ]).catch(function () {}) : Promise.resolve();

  return Promise.all([fontes, carregarImagem('assets/marca.png'), carregarImagem(info.assinatura)]).then(function (r) {
    var logo = r[1], assin = r[2];
    var paginas = [], ctx, y;
    var F = function (peso, tam) { return peso + ' ' + tam + 'px Montserrat, Arial, sans-serif'; };
    var larg = PDF_W - PDF_M * 2;

    function novaPagina() {
      var c = document.createElement('canvas');
      c.width = PDF_W; c.height = PDF_H;
      ctx = c.getContext('2d');
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, PDF_W, PDF_H);
      ctx.textBaseline = 'top';
      paginas.push(c);
      y = PDF_M;
      if (paginas.length > 1) {
        ctx.font = F(600, 18); ctx.fillStyle = COR.suave;
        ctx.fillText('Autorização ' + (info.protocolo || '') + ' — continuação', PDF_M, y);
        y += 44;
      }
    }
    function garantir(alt, folga) { if (y + alt > PDF_H - (folga || PDF_M)) novaPagina(); }
    function texto(t, x, tam, peso, cor, largura, entre) {
      ctx.font = F(peso, tam); ctx.fillStyle = cor;
      var linhas = quebrarLinhas(ctx, t, largura);
      linhas.forEach(function (l) { garantir(entre); ctx.fillText(l, x, y); y += entre; });
    }

    novaPagina();

    /* cabeçalho */
    if (logo) { var lh = 104, lw = lh * logo.width / logo.height; ctx.drawImage(logo, PDF_M, y, lw, lh); }
    ctx.textAlign = 'right';
    ctx.font = F(700, 26); ctx.fillStyle = COR.texto;
    ctx.fillText(info.protocolo ? 'Protocolo ' + info.protocolo : 'Protocolo: gerado no envio', PDF_W - PDF_M, y + 22);
    ctx.font = F(400, 19); ctx.fillStyle = COR.suave;
    ctx.fillText((info.protocolo ? 'Registrado em ' : 'Coletado em ') + dataBR(info.quando, true).replace(' ', ' às '), PDF_W - PDF_M, y + 60);
    ctx.textAlign = 'left';
    y += 124;
    ctx.fillStyle = COR.verde; ctx.fillRect(PDF_M, y, larg, 4);
    y += 30;

    texto(info.termo.titulo, PDF_M, 32, 700, COR.verde, larg, 42);
    y += 14;

    /* identificação */
    ctx.font = F(700, 17); ctx.fillStyle = COR.suave;
    ctx.fillText('IDENTIFICAÇÃO DE QUEM CONCEDE A AUTORIZAÇÃO', PDF_M, y);
    y += 34;
    var d = info.dados;
    var linhas = [
      [['Nome completo', d.nome]],
      [['CPF', cpfMascara(d.cpf)], ['RG', d.rg]],
      [['Nacionalidade', d.nacionalidade], ['Estado civil', d.estado_civil]],
      [['Profissão', d.profissao]],
      [['Endereço', d.endereco]],
      [['Cidade / UF', d.cidade + ' / ' + d.uf], ['Data', dataBR(info.quando)]]
    ];
    var colTh = 220, pad = 14, entreT = 29;
    linhas.forEach(function (cel) {
      var largVal = cel.length === 1 ? larg - colTh : (larg - colTh * 2) / 2;
      ctx.font = F(400, 20);
      var quebras = cel.map(function (c) { return quebrarLinhas(ctx, c[1], largVal - pad * 2); });
      var alt = Math.max.apply(null, quebras.map(function (q) { return q.length; })) * entreT + pad * 2 - 6;
      garantir(alt);
      var x = PDF_M;
      cel.forEach(function (c, i) {
        ctx.fillStyle = COR.fundoTh; ctx.fillRect(x, y, colTh, alt);
        ctx.strokeStyle = COR.linha; ctx.lineWidth = 1.5;
        ctx.strokeRect(x, y, colTh, alt); ctx.strokeRect(x + colTh, y, largVal, alt);
        ctx.font = F(600, 18); ctx.fillStyle = COR.texto; ctx.fillText(c[0], x + pad, y + pad + 2);
        ctx.font = F(400, 20);
        quebras[i].forEach(function (l, k) { ctx.fillText(l, x + colTh + pad, y + pad + k * entreT); });
        x += colTh + largVal;
      });
      y += alt;
    });
    y += 30;

    /* termo */
    info.termo.paragrafos.forEach(function (p) { texto(p, PDF_M, 20, 400, COR.texto, larg, 31); y += 12; });
    y += 4;
    ctx.font = F(600, 20);
    var aceiteL = quebrarLinhas(ctx, info.termo.aceite, larg - 44);
    garantir(aceiteL.length * 31 + 10);
    ctx.fillStyle = COR.verde; ctx.fillRect(PDF_M, y + 2, 26, 26);
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 3.5; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(PDF_M + 6, y + 15); ctx.lineTo(PDF_M + 11, y + 21); ctx.lineTo(PDF_M + 20, y + 9); ctx.stroke();
    ctx.fillStyle = COR.texto;
    aceiteL.forEach(function (l) { ctx.fillText(l, PDF_M + 44, y); y += 31; });
    y += 30;

    /* assinatura */
    var maxW = 620, maxH = 150;
    garantir(maxH + 90);
    if (assin) {
      var e = Math.min(maxW / assin.width, maxH / assin.height);
      var aw = assin.width * e, ah = assin.height * e;
      ctx.drawImage(assin, (PDF_W - aw) / 2, y + (maxH - ah), aw, ah);
    }
    y += maxH + 8;
    ctx.fillStyle = COR.texto; ctx.fillRect((PDF_W - 700) / 2, y, 700, 2);
    y += 14;
    ctx.textAlign = 'center';
    ctx.font = F(600, 20); ctx.fillText(d.nome, PDF_W / 2, y);
    ctx.font = F(400, 18); ctx.fillStyle = COR.suave; ctx.fillText('CPF ' + cpfMascara(d.cpf), PDF_W / 2, y + 30);
    ctx.textAlign = 'left';
    y += 66;

    /* registro */
    garantir(18 + 4 * 25, 40);
    ctx.fillStyle = COR.linha; ctx.fillRect(PDF_M, y, larg, 1.5);
    y += 18;
    var reg = ['Coletado por ' + info.coletor + ' em ' + dataBR(info.quando, true).replace(' ', ' às ') + ' (horário do aparelho).'];
    if (info.geo) reg.push('Localização do aparelho: ' + info.geo.lat.toFixed(5) + ', ' + info.geo.lng.toFixed(5) + '.');
    reg.push(info.protocolo
      ? 'Via do produtor. O registro original, com código de integridade, fica guardado no sistema da Safeagro sob o protocolo ' + info.protocolo + '.'
      : 'Via do produtor. A autorização ainda será enviada ao sistema da Safeagro, que vai gerar o protocolo.');
    reg.forEach(function (t) { ctx.font = F(400, 16); quebrarLinhas(ctx, t, larg).forEach(function (l) { ctx.fillStyle = COR.suave; ctx.fillText(l, PDF_M, y); y += 25; }); });

    /* numeração */
    if (paginas.length > 1) paginas.forEach(function (c, i) {
      var x = c.getContext('2d');
      x.font = F(400, 15); x.fillStyle = COR.suave; x.textAlign = 'right'; x.textBaseline = 'alphabetic';
      x.fillText('Página ' + (i + 1) + ' de ' + paginas.length, PDF_W - PDF_M, PDF_H - 48);
    });

    return montarPDF(paginas.map(function (c) { return c.toDataURL('image/jpeg', 0.88); }));
  });
}

/* PDF mínimo: uma imagem JPEG (DCTDecode) ocupando cada página A4. */
function montarPDF(jpegs) {
  var partes = [], tam = 0, offs = [];
  var enc = new TextEncoder();
  function add(x) { var b = typeof x === 'string' ? enc.encode(x) : x; partes.push(b); tam += b.length; }
  function bytes(dataUrl) {
    var bin = atob(dataUrl.split(',')[1]), u = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    return u;
  }
  function obj(n, corpo) { offs[n] = tam; add(n + ' 0 obj\n'); corpo(); add('\nendobj\n'); }

  var n = jpegs.length, kids = [];
  for (var i = 0; i < n; i++) kids.push((3 + i * 3) + ' 0 R');
  add('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
  obj(1, function () { add('<< /Type /Catalog /Pages 2 0 R >>'); });
  obj(2, function () { add('<< /Type /Pages /Count ' + n + ' /Kids [' + kids.join(' ') + '] >>'); });
  jpegs.forEach(function (j, i) {
    var p = 3 + i * 3, img = bytes(j), cont = 'q 595.28 0 0 841.89 0 0 cm /Im0 Do Q';
    obj(p, function () { add('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] /Resources << /XObject << /Im0 ' + (p + 2) + ' 0 R >> >> /Contents ' + (p + 1) + ' 0 R >>'); });
    obj(p + 1, function () { add('<< /Length ' + cont.length + ' >>\nstream\n' + cont + '\nendstream'); });
    obj(p + 2, function () {
      add('<< /Type /XObject /Subtype /Image /Width ' + PDF_W + ' /Height ' + PDF_H + ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ' + img.length + ' >>\nstream\n');
      add(img); add('\nendstream');
    });
  });
  var total = 3 + n * 3, xref = tam;
  var x = 'xref\n0 ' + total + '\n0000000000 65535 f \n';
  for (var k = 1; k < total; k++) x += String(offs[k]).padStart(10, '0') + ' 00000 n \n';
  add(x + 'trailer\n<< /Size ' + total + ' /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF');
  return new Blob(partes, { type: 'application/pdf' });
}

function nomeArquivoPDF(info) {
  var nome = String(info.dados.nome || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
  return 'Autorizacao-imagem-' + (info.protocolo || 'pendente') + '-' + nome + '.pdf';
}
