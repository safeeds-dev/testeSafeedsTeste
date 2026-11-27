<?php
/*
 * Instalação única. Só funciona enquanto existir nucleo/instalar.txt e o código da URL bater com ele.
 * Ao terminar, o arquivo é apagado e esta página passa a responder 404.
 */
declare(strict_types=1);
define('AUTZ', true);
require __DIR__ . '/nucleo/base.php';

cabecalhos_seguranca();
header('Content-Type: text/html; charset=utf-8');

$tokenArq = __DIR__ . '/nucleo/instalar.txt';
$token = is_file($tokenArq) ? trim((string)file_get_contents($tokenArq)) : '';
$recebido = (string)($_GET['t'] ?? $_POST['t'] ?? '');
if ($token === '' || strlen($token) < 20 || !hash_equals($token, $recebido)) { http_response_code(404); echo 'Não encontrado.'; exit; }
if (!eh_https() && !eh_local()) { http_response_code(403); echo 'Abra esta página com https://'; exit; }

$problemas = [];
if (version_compare(PHP_VERSION, '8.0.0', '<')) $problemas[] = 'PHP 8 ou mais novo é necessário (atual: ' . PHP_VERSION . ').';
if (!extension_loaded('pdo_sqlite')) $problemas[] = 'Extensão pdo_sqlite não está ativa.';
if (!extension_loaded('openssl') || !in_array('aes-256-gcm', openssl_get_cipher_methods(), true)) $problemas[] = 'OpenSSL com AES-256-GCM não disponível.';
if (!extension_loaded('mbstring')) $problemas[] = 'Extensão mbstring não está ativa.';

$resultado = null;
$erroForm = '';

if (!$problemas && ($_SERVER['REQUEST_METHOD'] ?? '') === 'POST') {
    $nome = texto($_POST['nome'] ?? '', 100);
    $email = strtolower(texto($_POST['email'] ?? '', 150));
    if (mb_strlen($nome) < 3 || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
        $erroForm = 'Informe nome e e-mail válidos.';
    } else {
        // 1) Pasta de dados: de preferência FORA da pasta pública do site.
        $fora = null;
        $raizSite = realpath((string)($_SERVER['DOCUMENT_ROOT'] ?? ''));
        if ($raizSite && !getenv('AUTZ_DADOS')) {
            $cand = dirname($raizSite) . DIRECTORY_SEPARATOR . 'autorizacao-dados';
            if ((is_dir($cand) || @mkdir($cand, 0700, true)) && is_writable($cand)) $fora = $cand;
        }
        $dir = $fora ?? dados_dir();
        if (!is_dir($dir)) @mkdir($dir, 0700, true);
        if (!is_writable($dir)) {
            $erroForm = 'Sem permissão de escrita em ' . $dir;
        } else {
            if ($fora) {
                file_put_contents(__DIR__ . '/nucleo/local.php', "<?php\nif (!defined('AUTZ')) { http_response_code(404); exit; }\nreturn ['dados' => " . var_export($fora, true) . "];\n");
            }
            @file_put_contents($dir . '/.htaccess', "Require all denied\nDeny from all\n");
            @file_put_contents($dir . '/index.html', '');
            // 2) Chaves de criptografia (só são criadas uma vez).
            $seg = $dir . '/segredo.php';
            if (!is_file($seg)) {
                file_put_contents($seg, "<?php\n// NÃO APAGUE E NÃO PERCA ESTE ARQUIVO: sem ele os dados cifrados não podem ser lidos.\nif (!defined('AUTZ')) { http_response_code(404); exit; }\nreturn " . var_export([
                    'chave' => base64_encode(random_bytes(32)),
                    'hmac' => base64_encode(random_bytes(32)),
                    'criado_em' => date('c'),
                ], true) . ";\n");
                @chmod($seg, 0600);
            }
            // 3) Banco + primeiro acesso + link da equipe.
            $pdo = db();
            @chmod($dir . '/banco.sqlite', 0600);
            // Transação exclusiva: dois envios ao mesmo tempo não criam dois administradores.
            $pdo->exec('BEGIN IMMEDIATE');
            if ((int)$pdo->query('SELECT COUNT(*) FROM usuarios')->fetchColumn() > 0) {
                $pdo->exec('ROLLBACK');
                $erroForm = 'Já existe usuário cadastrado. A instalação foi encerrada.';
                @unlink($tokenArq);
            } else {
                $senha = senha_gerada();
                $pdo->prepare('INSERT INTO usuarios(nome, email, senha_hash, ativo, admin, trocar_senha, criado_em) VALUES(?,?,?,1,1,1,?)')
                    ->execute([$nome, $email, senha_hash($senha), date('c')]);
                $pdo->exec('COMMIT');
                @unlink($tokenArq);
                $codigo = chave_equipe_nova();
                registrar(null, 'instalacao', $email, $fora ? 'dados fora da pasta pública' : 'dados dentro da pasta do sistema', 'instalador');
                @unlink($tokenArq);
                $base = (eh_https() ? 'https://' : 'http://') . ($_SERVER['HTTP_HOST'] ?? '') . base_path();
                $resultado = ['email' => $email, 'senha' => $senha, 'link' => $base . '?k=' . $codigo, 'gestao' => $base . 'gestao.html', 'dir' => $dir, 'fora' => (bool)$fora];
            }
        }
    }
}
?><!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>Instalação</title><link rel="stylesheet" href="assets/app.css"></head>
<body class="pg-simples"><main class="caixa">
<img src="assets/marca.png" alt="Safeagro" class="marca-login">
<h1>Instalação do sistema de autorizações</h1>
<?php if ($problemas): ?>
  <div class="aviso aviso-erro"><strong>O servidor precisa de ajuste:</strong><ul><?php foreach ($problemas as $p) echo '<li>' . e($p) . '</li>'; ?></ul></div>
<?php elseif ($resultado): ?>
  <div class="aviso aviso-ok">Instalado. Anote agora — a senha não aparece de novo.</div>
  <dl class="dados-inst">
    <dt>Área de gestão</dt><dd><?= e($resultado['gestao']) ?></dd>
    <dt>E-mail</dt><dd><?= e($resultado['email']) ?></dd>
    <dt>Senha provisória</dt><dd><code><?= e($resultado['senha']) ?></code></dd>
    <dt>Link para os vendedores</dt><dd><?= e($resultado['link']) ?></dd>
    <dt>Dados guardados em</dt><dd><?= e($resultado['dir']) ?><?= $resultado['fora'] ? ' (fora da pasta pública ✓)' : '' ?></dd>
  </dl>
  <p class="nota">Faça uma cópia do arquivo <strong>segredo.php</strong> dessa pasta num lugar seguro (fora do servidor). Sem ele, os dados não podem ser lidos.</p>
<?php else: ?>
  <?php if ($erroForm): ?><div class="aviso aviso-erro"><?= e($erroForm) ?></div><?php endif; ?>
  <form method="post" class="form-simples">
    <input type="hidden" name="t" value="<?= e($recebido) ?>">
    <label>Seu nome<input name="nome" required maxlength="100" autocomplete="name"></label>
    <label>Seu e-mail<input name="email" type="email" required maxlength="150" autocomplete="email"></label>
    <button class="btn btn-primario" type="submit">Instalar e criar meu acesso</button>
  </form>
<?php endif; ?>
</main></body></html>
