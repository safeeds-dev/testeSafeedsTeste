<?php
declare(strict_types=1);
define('AUTZ', true);
require __DIR__ . '/nucleo/base.php';
require __DIR__ . '/nucleo/termo.php';

cabecalhos_seguranca();
header('Content-Type: text/html; charset=utf-8');
if (!eh_https() && !eh_local()) { http_response_code(403); exit('Use https://'); }
if (!instalado()) { http_response_code(503); exit('Sistema não instalado.'); }

$u = sessao_atual();
if (!$u || $u['trocar_senha']) { header('Location: gestao.html'); exit; }

$st = db()->prepare('SELECT * FROM autorizacoes WHERE id = ?');
$st->execute([(int)($_GET['id'] ?? 0)]);
$r = $st->fetch();
if (!$r) { http_response_code(404); exit('Autorização não encontrada.'); }

$d = json_decode((string)decifrar($r['dados_cifrados']), true) ?: [];
$png = base64_decode((string)decifrar($r['assinatura_cifrada']));
$geoJson = $r['geo_cifrado'] ? (string)decifrar($r['geo_cifrado']) : null;
$geo = $geoJson ? json_decode($geoJson, true) : null;
$t = termo($r['termo_versao']);
$integro = hash_equals($r['integridade'], integridade($r, $d, $png, (int)($r['integ_versao'] ?? 1), $geoJson)) && hash_equals($r['termo_hash'], $t['hash']);
$prot = protocolo((int)$r['id'], $r['criado_em']);
registrar($u, 'comprovante', $prot);

$quando = date('d/m/Y \à\s H:i', strtotime($r['criado_em']));
?><!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>Autorização <?= e($prot) ?></title>
<link rel="stylesheet" href="assets/comprovante.css"></head>
<body>
<div class="barra-acoes"><button type="button" id="imprimir">Imprimir ou salvar em PDF</button></div>
<article class="folha">
  <header class="topo">
    <img src="assets/marca.png" alt="Safeagro" class="logo">
    <div class="topo-dir">
      <div class="prot">Protocolo <strong><?= e($prot) ?></strong></div>
      <div>Registrado em <?= e($quando) ?></div>
      <?php if ($r['status'] === 'revogada'): ?><div class="selo-revogada">REVOGADA em <?= e(date('d/m/Y', strtotime((string)$r['revogada_em']))) ?></div><?php endif; ?>
    </div>
  </header>

  <h1><?= e($t['titulo']) ?></h1>

  <section class="ident">
    <h2>Identificação de quem concede a autorização</h2>
    <table>
      <tr><th>Nome completo</th><td colspan="3"><?= e($d['nome'] ?? '') ?></td></tr>
      <tr><th>CPF</th><td><?= e(cpf_formatar($d['cpf'] ?? '')) ?></td><th>RG</th><td><?= e($d['rg'] ?? '') ?></td></tr>
      <tr><th>Nacionalidade</th><td><?= e($d['nacionalidade'] ?? '') ?></td><th>Estado civil</th><td><?= e($d['estado_civil'] ?? '') ?></td></tr>
      <tr><th>Profissão</th><td colspan="3"><?= e($d['profissao'] ?? '') ?></td></tr>
      <tr><th>Endereço</th><td colspan="3"><?= e($d['endereco'] ?? '') ?></td></tr>
      <tr><th>Cidade / UF</th><td><?= e(($d['cidade'] ?? '') . ' / ' . ($d['uf'] ?? '')) ?></td><th>Data</th><td><?= e($d['data_autorizacao'] ?? '') ?></td></tr>
    </table>
  </section>

  <section class="termo">
    <?php foreach ($t['paragrafos'] as $p): ?><p><?= e($p) ?></p><?php endforeach; ?>
    <p class="aceite">☑ <?= e($t['aceite']) ?></p>
  </section>

  <section class="assin">
    <img src="data:image/png;base64,<?= base64_encode($png) ?>" alt="Assinatura">
    <div class="linha"></div>
    <div><?= e($d['nome'] ?? '') ?> — CPF <?= e(cpf_formatar($d['cpf'] ?? '')) ?></div>
  </section>

  <section class="evid">
    <h2>Registro eletrônico</h2>
    <ul>
      <li>Coletado por: <?= e($r['coletor']) ?></li>
      <li>Data e hora do servidor: <?= e($quando) ?> (horário de Brasília)<?= $r['coletado_em'] ? ' · no aparelho: ' . e(date('d/m/Y H:i', strtotime($r['coletado_em']) ?: time())) : '' ?></li>
      <?php if ($geo): ?><li>Localização do aparelho: <?= e(number_format((float)$geo['lat'], 5, '.', '') . ', ' . number_format((float)$geo['lng'], 5, '.', '')) ?><?= $geo['precisao'] ? ' (±' . e((string)$geo['precisao']) . ' m)' : '' ?></li><?php endif; ?>
      <li>Endereço IP: <?= e($r['ip']) ?> · Versão do termo: <?= e($r['termo_versao']) ?></li>
      <li>Código de integridade: <code><?= e($r['integridade']) ?></code> — <?= $integro ? '<span class="ok">conferido, registro sem alteração</span>' : '<span class="falha">NÃO CONFERE</span>' ?></li>
      <?php if ($r['status'] === 'revogada'): ?><li>Motivo da revogação: <?= e($r['revogada_motivo']) ?></li><?php endif; ?>
    </ul>
  </section>
</article>
<script src="assets/comprovante.js"></script>
</body></html>
