<?php
/*
 * Núcleo do sistema de autorizações de uso de imagem — Safeagro.
 * Versão 1.1.0. Banco SQLite, dados pessoais cifrados com AES-256-GCM, sessão só para a área de gestão.
 */
declare(strict_types=1);
if (!defined('AUTZ')) { http_response_code(404); exit; }

date_default_timezone_set('America/Sao_Paulo');
ini_set('display_errors', '0');
error_reporting(E_ALL);
ini_set('log_errors', '1');

const ESQUEMA_VERSAO  = 2;           // versão do banco (PRAGMA user_version)
const SESSAO_COOKIE   = 'autz_gestao';
const SESSAO_MAX_SEG  = 12 * 3600;   // sessão da gestão dura no máximo 12 h
const SESSAO_OCIO_SEG = 2 * 3600;    // e cai depois de 2 h parada
const LIMITE_LOGIN_EMAIL_IP = 5;     // senhas erradas do mesmo IP para o mesmo e-mail em 15 min
const LIMITE_LOGIN_IP       = 20;    // senhas erradas por IP em 15 min
const LIMITE_LOGIN_EMAIL    = 60;    // teto por e-mail vindo de muitos IPs (ataque distribuído) em 15 min
const LIMITE_COLETA_IP      = 60;    // envios (aceitos ou não) por IP por hora
const LIMITE_COLETA_GERAL   = 400;   // envios aceitos por hora no sistema todo
const LIMITE_CHAVE_IP       = 30;    // códigos de equipe errados por IP por hora
const MAX_ASSIN_PIXELS      = 1600 * 900; // teto de pixels da assinatura antes de decodificar
const MAX_ASSINATURA     = 700000;   // bytes do PNG da assinatura
const MAX_CORPO          = 1500000;  // bytes do JSON recebido

/* ---------- caminhos e segredo ---------- */

function dados_dir(): string {
    static $d = null;
    if ($d !== null) return $d;
    $env = getenv('AUTZ_DADOS');
    if ($env) return $d = rtrim($env, '/\\');
    $local = __DIR__ . '/local.php';
    if (is_file($local)) {
        $c = require $local;
        if (is_array($c) && !empty($c['dados'])) return $d = rtrim($c['dados'], '/\\');
    }
    return $d = dirname(__DIR__) . DIRECTORY_SEPARATOR . 'dados';
}

function instalado(): bool {
    return is_file(dados_dir() . '/segredo.php') && is_file(dados_dir() . '/banco.sqlite');
}

function segredo(): array {
    static $s = null;
    if ($s !== null) return $s;
    $f = dados_dir() . '/segredo.php';
    if (!is_file($f)) throw new RuntimeException('nao_instalado');
    $c = require $f;
    $chave = is_array($c) ? base64_decode((string)($c['chave'] ?? ''), true) : false;
    $hmac = is_array($c) ? base64_decode((string)($c['hmac'] ?? ''), true) : false;
    if (!is_string($chave) || !is_string($hmac) || strlen($chave) !== 32 || strlen($hmac) !== 32) throw new RuntimeException('segredo_invalido');
    $s = ['chave' => $chave, 'hmac' => $hmac];
    return $s;
}

/* ---------- banco ---------- */

function db(): PDO {
    static $pdo = null;
    if ($pdo) return $pdo;
    if (is_dir(dados_dir())) ini_set("error_log", dados_dir() . "/php-erros.log"); // log fora da pasta pública
    $pdo = new PDO('sqlite:' . dados_dir() . '/banco.sqlite', null, null, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ]);
    $pdo->exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000; PRAGMA secure_delete = ON;');
    migrar($pdo);
    return $pdo;
}

function migrar(PDO $pdo): void {
    if ((int)$pdo->query('PRAGMA user_version')->fetchColumn() >= ESQUEMA_VERSAO) return; // já migrado
    $pdo->exec("
    CREATE TABLE IF NOT EXISTS usuarios (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nome TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        senha_hash TEXT NOT NULL,
        ativo INTEGER NOT NULL DEFAULT 1,
        trocar_senha INTEGER NOT NULL DEFAULT 1,
        criado_em TEXT NOT NULL,
        ultimo_acesso TEXT
    );
    CREATE TABLE IF NOT EXISTS sessoes (
        token_hash TEXT PRIMARY KEY,
        usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
        csrf TEXT NOT NULL,
        criada_em INTEGER NOT NULL,
        usada_em INTEGER NOT NULL,
        ip TEXT, ua TEXT
    );
    CREATE TABLE IF NOT EXISTS tentativas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        chave TEXT NOT NULL,
        quando INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS ix_tent ON tentativas(chave, quando);
    CREATE TABLE IF NOT EXISTS config (
        nome TEXT PRIMARY KEY,
        valor TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS autorizacoes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        uuid TEXT NOT NULL UNIQUE,
        criado_em TEXT NOT NULL,
        coletado_em TEXT,
        coletor TEXT NOT NULL,
        termo_versao TEXT NOT NULL,
        termo_hash TEXT NOT NULL,
        dados_cifrados TEXT NOT NULL,
        assinatura_cifrada TEXT NOT NULL,
        geo_cifrado TEXT,
        cpf_hmac TEXT NOT NULL,
        integridade TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'valida',
        revogada_em TEXT,
        revogada_motivo TEXT,
        revogada_por INTEGER,
        ip TEXT, ua TEXT
    );
    CREATE INDEX IF NOT EXISTS ix_aut_cpf ON autorizacoes(cpf_hmac);
    CREATE INDEX IF NOT EXISTS ix_aut_data ON autorizacoes(criado_em);
    CREATE TABLE IF NOT EXISTS eventos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        quando TEXT NOT NULL,
        usuario_id INTEGER,
        quem TEXT,
        acao TEXT NOT NULL,
        alvo TEXT,
        detalhe TEXT,
        ip TEXT
    );
    ");
    $cols = function (string $t) use ($pdo): array { return array_column($pdo->query("PRAGMA table_info($t)")->fetchAll(), 'name'); };
    if (!in_array('admin', $cols('usuarios'), true)) $pdo->exec('ALTER TABLE usuarios ADD COLUMN admin INTEGER NOT NULL DEFAULT 0');
    $ca = $cols('autorizacoes');
    if (!in_array('dispositivo', $ca, true)) $pdo->exec('ALTER TABLE autorizacoes ADD COLUMN dispositivo TEXT');
    if (!in_array('integ_versao', $ca, true)) $pdo->exec('ALTER TABLE autorizacoes ADD COLUMN integ_versao INTEGER NOT NULL DEFAULT 1');
    // Sempre existe pelo menos um administrador (o primeiro acesso criado).
    if ((int)$pdo->query('SELECT COUNT(*) FROM usuarios WHERE admin = 1')->fetchColumn() === 0) {
        $pdo->exec('UPDATE usuarios SET admin = 1 WHERE id = (SELECT MIN(id) FROM usuarios)');
    }
    $pdo->exec('PRAGMA user_version = ' . ESQUEMA_VERSAO);
}

function config_ler(string $nome, ?string $padrao = null): ?string {
    $st = db()->prepare('SELECT valor FROM config WHERE nome = ?');
    $st->execute([$nome]);
    $v = $st->fetchColumn();
    return $v === false ? $padrao : (string)$v;
}

function config_gravar(string $nome, string $valor): void {
    db()->prepare('INSERT INTO config(nome, valor) VALUES(?, ?) ON CONFLICT(nome) DO UPDATE SET valor = excluded.valor')
        ->execute([$nome, $valor]);
}

/* ---------- criptografia ---------- */

function cifrar(string $texto): string {
    $iv = random_bytes(12);
    $tag = '';
    $ct = openssl_encrypt($texto, 'aes-256-gcm', segredo()['chave'], OPENSSL_RAW_DATA, $iv, $tag, 'autz-v1', 16);
    if ($ct === false) throw new RuntimeException('falha_cifrar');
    return 'v1:' . base64_encode($iv . $tag . $ct);
}

function decifrar(?string $pacote): ?string {
    if ($pacote === null || $pacote === '') return null;
    if (strncmp($pacote, 'v1:', 3) !== 0) throw new RuntimeException('formato_cifra');
    $bin = base64_decode(substr($pacote, 3), true);
    if ($bin === false || strlen($bin) < 29) throw new RuntimeException('cifra_corrompida');
    $txt = openssl_decrypt(substr($bin, 28), 'aes-256-gcm', segredo()['chave'], OPENSSL_RAW_DATA, substr($bin, 0, 12), substr($bin, 12, 16), 'autz-v1');
    if ($txt === false) throw new RuntimeException('cifra_adulterada');
    return $txt;
}

function hmac_cpf(string $cpf): string {
    return hash_hmac('sha256', 'cpf:' . preg_replace('/\D/', '', $cpf), segredo()['hmac']);
}

/** Código da equipe: guardamos só o HMAC; o código em claro fica cifrado para o admin poder rever o link. */
function chave_equipe_valida(string $codigo): bool {
    $h = config_ler('chave_equipe_hmac');
    if (!$h || $codigo === '') return false;
    return hash_equals($h, hash_hmac('sha256', 'equipe:' . $codigo, segredo()['hmac']));
}

function chave_equipe_nova(): string {
    $codigo = rtrim(strtr(base64_encode(random_bytes(18)), '+/', '-_'), '=');
    config_gravar('chave_equipe_hmac', hash_hmac('sha256', 'equipe:' . $codigo, segredo()['hmac']));
    config_gravar('chave_equipe_cifrada', cifrar($codigo));
    config_gravar('chave_equipe_desde', date('c'));
    return $codigo;
}

function senha_gerada(int $tam = 12): string {
    $alf = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    $s = '';
    for ($i = 0; $i < $tam; $i++) $s .= $alf[random_int(0, strlen($alf) - 1)];
    return $s;
}

function senha_hash(string $s): string {
    return defined('PASSWORD_ARGON2ID') ? password_hash($s, PASSWORD_ARGON2ID) : password_hash($s, PASSWORD_DEFAULT);
}

/* ---------- HTTP ---------- */

function eh_https(): bool {
    return (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
        || (($_SERVER['SERVER_PORT'] ?? '') === '443')
        || (strtolower($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');
}

function eh_local(): bool {
    if (PHP_SAPI !== 'cli-server') return false; // em produção (LiteSpeed) nunca é "local"
    if (getenv('AUTZ_TESTE') === '1') return true; // só o "Testar no computador.cmd" define isso
    $h = strtolower(preg_replace('/:\d+$/', '', $_SERVER['HTTP_HOST'] ?? ''));
    $r = (string)($_SERVER['REMOTE_ADDR'] ?? '');
    return in_array($h, ['localhost', '127.0.0.1', '[::1]'], true) && in_array($r, ['127.0.0.1', '::1'], true);
}

function base_path(): string {
    $d = str_replace('\\', '/', dirname($_SERVER['SCRIPT_NAME'] ?? '/'));
    return rtrim($d, '/') . '/';
}

function ip(): string {
    return substr((string)($_SERVER['REMOTE_ADDR'] ?? ''), 0, 64);
}

function ua(): string {
    return substr((string)($_SERVER['HTTP_USER_AGENT'] ?? ''), 0, 300);
}

function cabecalhos_seguranca(): void {
    header_remove('X-Powered-By');
    header('X-Content-Type-Options: nosniff');
    header('Referrer-Policy: no-referrer');
    header('X-Frame-Options: DENY');
    header('Cross-Origin-Opener-Policy: same-origin');
    header('Permissions-Policy: geolocation=(self), camera=(), microphone=(), payment=()');
    header("Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'");
    if (eh_https()) header('Strict-Transport-Security: max-age=31536000');
    header('Cache-Control: no-store, max-age=0');
}

function exigir_https(): void {
    if (!eh_https() && !eh_local()) {
        responder(['erro' => 'Acesso permitido somente por HTTPS.'], 403);
    }
}

function responder($dados, int $codigo = 200): void {
    http_response_code($codigo);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($dados, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function erro(int $codigo, string $msg, array $extra = []): void {
    responder(['erro' => $msg] + $extra, $codigo);
}

/** POST só da própria página: JSON + mesma origem. Impede formulários de outros sites (CSRF de login/logout). */
function exigir_mesma_origem(): void {
    $ct = strtolower((string)($_SERVER['CONTENT_TYPE'] ?? ''));
    if (!str_starts_with($ct, 'application/json')) erro(415, 'Tipo de envio inválido.');
    $sfs = (string)($_SERVER['HTTP_SEC_FETCH_SITE'] ?? '');
    if ($sfs !== '' && $sfs !== 'same-origin') erro(403, 'Requisição recusada.');
    $origem = (string)($_SERVER['HTTP_ORIGIN'] ?? '');
    if ($origem !== '') {
        $host = strtolower((string)parse_url($origem, PHP_URL_HOST) . (($p = parse_url($origem, PHP_URL_PORT)) ? ':' . $p : ''));
        if ($host !== strtolower((string)($_SERVER['HTTP_HOST'] ?? ''))) erro(403, 'Requisição recusada.');
    }
}

function corpo_json(): array {
    $tam = (int)($_SERVER['CONTENT_LENGTH'] ?? 0);
    if ($tam > MAX_CORPO) erro(413, 'Envio grande demais.');
    $bruto = file_get_contents('php://input', false, null, 0, MAX_CORPO + 1);
    if ($bruto === false || strlen($bruto) > MAX_CORPO) erro(413, 'Envio grande demais.');
    $j = json_decode($bruto, true);
    if (!is_array($j)) erro(400, 'Dados inválidos.');
    return $j;
}

/* ---------- limite de tentativas ---------- */

function contar(string $chave, int $janela): int {
    $st = db()->prepare('SELECT COUNT(*) FROM tentativas WHERE chave = ? AND quando > ?');
    $st->execute([$chave, time() - $janela]);
    return (int)$st->fetchColumn();
}

function marcar(string $chave): void {
    db()->prepare('INSERT INTO tentativas(chave, quando) VALUES(?, ?)')->execute([$chave, time()]);
    if (random_int(1, 50) === 1) db()->prepare('DELETE FROM tentativas WHERE quando < ?')->execute([time() - 86400]);
}

function limpar_marcas(string $chave): void {
    db()->prepare('DELETE FROM tentativas WHERE chave = ?')->execute([$chave]);
}

/* ---------- registro de atividade ---------- */

function registrar(?array $u, string $acao, ?string $alvo = null, ?string $detalhe = null, ?string $quem = null): void {
    db()->prepare('INSERT INTO eventos(quando, usuario_id, quem, acao, alvo, detalhe, ip) VALUES(?,?,?,?,?,?,?)')
        ->execute([date('c'), $u['id'] ?? null, $quem ?? ($u['nome'] ?? null), $acao, $alvo, $detalhe, ip()]);
}

/* ---------- sessão da área de gestão ---------- */

function nome_cookie(): string {
    return (eh_https() && base_path() === '/') ? '__Host-' . SESSAO_COOKIE : SESSAO_COOKIE;
}

function cookie_sessao(string $valor, int $expira): void {
    setcookie(nome_cookie(), $valor, [
        'expires' => $expira,
        'path' => base_path(),
        'secure' => eh_https(),
        'httponly' => true,
        'samesite' => 'Strict',
    ]);
}

function sessao_abrir(array $u): array {
    $token = bin2hex(random_bytes(32));
    $csrf = bin2hex(random_bytes(32));
    $agora = time();
    db()->prepare('INSERT INTO sessoes(token_hash, usuario_id, csrf, criada_em, usada_em, ip, ua) VALUES(?,?,?,?,?,?,?)')
        ->execute([hash('sha256', $token), $u['id'], $csrf, $agora, $agora, ip(), ua()]);
    db()->prepare('UPDATE usuarios SET ultimo_acesso = ? WHERE id = ?')->execute([date('c'), $u['id']]);
    db()->prepare('DELETE FROM sessoes WHERE criada_em < ? OR usada_em < ?')->execute([$agora - SESSAO_MAX_SEG, $agora - SESSAO_OCIO_SEG]);
    cookie_sessao($token, $agora + SESSAO_MAX_SEG);
    return ['csrf' => $csrf];
}

function sessao_atual(): ?array {
    $token = $_COOKIE[nome_cookie()] ?? '';
    if (!is_string($token) || !preg_match('/^[a-f0-9]{64}$/', $token)) return null;
    $th = hash('sha256', $token);
    $st = db()->prepare('SELECT s.token_hash, s.csrf, s.criada_em, s.usada_em, u.id, u.nome, u.email, u.trocar_senha, u.admin
        FROM sessoes s JOIN usuarios u ON u.id = s.usuario_id WHERE s.token_hash = ? AND u.ativo = 1');
    $st->execute([$th]);
    $s = $st->fetch();
    if (!$s) return null;
    $agora = time();
    if ($s['criada_em'] < $agora - SESSAO_MAX_SEG || $s['usada_em'] < $agora - SESSAO_OCIO_SEG) {
        db()->prepare('DELETE FROM sessoes WHERE token_hash = ?')->execute([$th]);
        return null;
    }
    if ($s['usada_em'] < $agora - 60) {
        db()->prepare('UPDATE sessoes SET usada_em = ? WHERE token_hash = ?')->execute([$agora, $th]);
    }
    return $s;
}

function sessao_encerrar(): void {
    $token = $_COOKIE[nome_cookie()] ?? '';
    if (is_string($token) && $token !== '') {
        db()->prepare('DELETE FROM sessoes WHERE token_hash = ?')->execute([hash('sha256', $token)]);
    }
    cookie_sessao('', time() - 3600);
}

/** Exige login (qualquer perfil). */
function exigir_sessao(bool $aceitaTrocaPendente = false): array {
    $u = sessao_atual();
    if (!$u) erro(401, 'Sessão expirada. Entre novamente.');
    if ($u['trocar_senha'] && !$aceitaTrocaPendente) erro(403, 'Troque a senha provisória para continuar.', ['trocarSenha' => true]);
    return $u;
}

/** Ações que só administradores podem fazer (acessos, link da equipe, exportar, excluir, atividade). */
function exigir_administrador(array $u): void {
    if ((int)($u['admin'] ?? 0) !== 1) erro(403, 'Apenas administradores podem fazer isso.');
}

function exigir_csrf(array $u): void {
    $h = $_SERVER['HTTP_X_CSRF'] ?? '';
    if (!is_string($h) || !hash_equals($u['csrf'], $h)) erro(403, 'Requisição recusada.');
}

/* ---------- validação ---------- */

function texto($v, int $max): string {
    $v = is_scalar($v) ? (string)$v : '';
    $v = preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/u', '', $v) ?? '';
    $v = trim(preg_replace('/[ \t]+/u', ' ', $v) ?? '');
    return mb_substr($v, 0, $max);
}

function cpf_valido(string $cpf): bool {
    $c = preg_replace('/\D/', '', $cpf);
    if (strlen($c) !== 11 || preg_match('/^(\d)\1{10}$/', $c)) return false;
    for ($t = 9; $t < 11; $t++) {
        $s = 0;
        for ($i = 0; $i < $t; $i++) $s += (int)$c[$i] * (($t + 1) - $i);
        $d = ((10 * $s) % 11) % 10;
        if ((int)$c[$t] !== $d) return false;
    }
    return true;
}

function cpf_formatar(string $cpf): string {
    $c = preg_replace('/\D/', '', $cpf);
    return strlen($c) === 11 ? substr($c, 0, 3) . '.' . substr($c, 3, 3) . '.' . substr($c, 6, 3) . '-' . substr($c, 9) : $cpf;
}

function cpf_mascarar(string $cpf): string {
    $c = preg_replace('/\D/', '', $cpf);
    return strlen($c) === 11 ? '***.' . substr($c, 3, 3) . '.' . substr($c, 6, 3) . '-**' : '***';
}

const UFS = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];
const ESTADOS_CIVIS = ['Solteiro(a)','Casado(a)','União estável','Divorciado(a)','Separado(a)','Viúvo(a)'];

function protocolo(int $id, string $criado): string {
    return 'SA-' . substr($criado, 0, 4) . '-' . str_pad((string)$id, 5, '0', STR_PAD_LEFT);
}

/** Recalcula a impressão digital do registro: se qualquer dado, a assinatura ou o termo mudar, não bate.
 *  Versão 2 também cobre localização, horário do aparelho, aparelho e IP. */
function integridade(array $reg, array $dados, string $pngBin, int $versao = 1, ?string $geoJson = null): string {
    ksort($dados);
    $base = [
        'uuid' => $reg['uuid'],
        'criado_em' => $reg['criado_em'],
        'coletor' => $reg['coletor'],
        'termo_versao' => $reg['termo_versao'],
        'termo_hash' => $reg['termo_hash'],
        'dados' => $dados,
        'assinatura_sha256' => hash('sha256', $pngBin),
    ];
    if ($versao >= 2) {
        $base['v'] = 2;
        $base['coletado_em'] = (string)($reg['coletado_em'] ?? '');
        $base['geo'] = (string)($geoJson ?? '');
        $base['dispositivo'] = (string)($reg['dispositivo'] ?? '');
        $base['ip'] = (string)($reg['ip'] ?? '');
    }
    return hash_hmac('sha256', json_encode($base, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), segredo()['hmac']);
}

function e(?string $s): string {
    return htmlspecialchars((string)$s, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}
