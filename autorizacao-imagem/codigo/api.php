<?php
declare(strict_types=1);
define('AUTZ', true);
require __DIR__ . '/nucleo/base.php';
require __DIR__ . '/nucleo/termo.php';

cabecalhos_seguranca();
exigir_https();
if (!instalado()) erro(503, 'Sistema ainda não instalado.');

$acao = (string)($_GET['a'] ?? '');
$metodo = $_SERVER['REQUEST_METHOD'] ?? 'GET';

try {
    rotear($acao, $metodo);
} catch (Throwable $t) {
    error_log('[autorizacao] ' . $t->getMessage() . ' @ ' . $t->getFile() . ':' . $t->getLine());
    erro(500, 'Erro interno. Tente novamente.');
}

function rotear(string $acao, string $metodo): void {
    $publicas = [
        'GET termo'        => 'acao_termo',
        'POST equipe'      => 'acao_equipe',
        'POST coletar'     => 'acao_coletar',
        'GET eu'           => 'acao_eu',
        'POST entrar'      => 'acao_entrar',
        'POST sair'        => 'acao_sair',
        'POST trocar-senha'=> 'acao_trocar_senha',
    ];
    $gestao = [
        'GET resumo'           => 'acao_resumo',
        'GET lista'            => 'acao_lista',
        'GET ver'              => 'acao_ver',
        'POST revogar'         => 'acao_revogar',
        'POST excluir'         => 'acao_excluir',
        'POST exportar'        => 'acao_exportar',
        'GET usuarios'         => 'acao_usuarios',
        'POST usuario-criar'   => 'acao_usuario_criar',
        'POST usuario-ativo'   => 'acao_usuario_ativo',
        'POST usuario-senha'   => 'acao_usuario_senha',
        'GET link'             => 'acao_link',
        'POST link-novo'       => 'acao_link_novo',
        'GET eventos'          => 'acao_eventos',
        'POST usuario-perfil'  => 'acao_usuario_perfil',
    ];
    // Perfil "Consulta" só vê e abre comprovante. O resto é de administrador.
    $soAdministrador = ['POST revogar', 'POST excluir', 'POST exportar', 'GET usuarios', 'POST usuario-criar', 'POST usuario-ativo',
        'POST usuario-senha', 'POST usuario-perfil', 'GET link', 'POST link-novo', 'GET eventos'];
    $k = $metodo . ' ' . $acao;
    if ($metodo === 'POST' && (isset($publicas[$k]) || isset($gestao[$k]))) exigir_mesma_origem();
    if (isset($publicas[$k])) { ($publicas[$k])(); return; }
    if (isset($gestao[$k])) {
        $u = exigir_sessao();
        if ($metodo === 'POST') exigir_csrf($u);
        if (in_array($k, $soAdministrador, true)) exigir_administrador($u);
        ($gestao[$k])($u);
        return;
    }
    erro(404, 'Ação desconhecida.');
}

/* ================= formulário (sem login, com código da equipe) ================= */

function acao_termo(): void {
    $t = termo();
    responder(['versao' => $t['versao'], 'titulo' => $t['titulo'], 'paragrafos' => $t['paragrafos'], 'aceite' => $t['aceite'],
        'ufs' => UFS, 'estadosCivis' => ESTADOS_CIVIS]);
}

function verificar_codigo_equipe(string $codigo): void {
    $chaveIp = 'equipe-ip:' . ip();
    if (contar($chaveIp, 3600) >= LIMITE_CHAVE_IP) erro(429, 'Muitas tentativas. Aguarde e tente de novo.');
    if (!chave_equipe_valida($codigo)) {
        marcar($chaveIp);
        erro(403, 'Link inválido ou desativado. Peça o link atualizado ao seu gestor.', ['linkInvalido' => true]);
    }
}

function acao_equipe(): void {
    $in = corpo_json();
    verificar_codigo_equipe(texto($in['codigo'] ?? '', 100));
    responder(['ok' => true]);
}

function acao_coletar(): void {
    verificar_codigo_equipe(texto((string)($_SERVER['HTTP_X_EQUIPE'] ?? ''), 100));
    $chaveIp = 'coleta-ip:' . ip();
    if (contar($chaveIp, 3600) >= LIMITE_COLETA_IP) erro(429, 'Limite de envios por hora atingido. Tente mais tarde.');
    if (contar('coleta-geral', 3600) >= LIMITE_COLETA_GERAL) erro(429, 'Muitos envios no sistema agora. Tente mais tarde.');
    marcar($chaveIp); // conta toda tentativa, aceita ou recusada

    $in = corpo_json();
    $dispositivo = strtolower(texto($in['dispositivo'] ?? '', 36));
    if (!preg_match('/^[0-9a-f-]{36}$/', $dispositivo)) $dispositivo = '';
    $uuid = strtolower(texto($in['uuid'] ?? '', 36));
    if (!preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/', $uuid)) erro(400, 'Identificador inválido.');

    // Reenvio da mesma coleta (internet caiu no meio): devolve o protocolo já gravado.
    $st = db()->prepare('SELECT id, criado_em FROM autorizacoes WHERE uuid = ?');
    $st->execute([$uuid]);
    if ($ja = $st->fetch()) responder(['ok' => true, 'protocolo' => protocolo((int)$ja['id'], $ja['criado_em']), 'repetido' => true]);

    $d = is_array($in['dados'] ?? null) ? $in['dados'] : [];
    $dados = [
        'nome'          => texto($d['nome'] ?? '', 150),
        'cpf'           => preg_replace('/\D/', '', (string)($d['cpf'] ?? '')),
        'nacionalidade' => texto($d['nacionalidade'] ?? '', 60),
        'estado_civil'  => texto($d['estado_civil'] ?? '', 30),
        'profissao'     => texto($d['profissao'] ?? '', 80),
        'rg'            => texto($d['rg'] ?? '', 30),
        'endereco'      => texto($d['endereco'] ?? '', 300),
        'cidade'        => texto($d['cidade'] ?? '', 100),
        'uf'            => strtoupper(texto($d['uf'] ?? '', 2)),
    ];
    $faltando = [];
    foreach ($dados as $campo => $v) if ($v === '') $faltando[] = $campo;
    if ($faltando) erro(422, 'Preencha todos os campos obrigatórios.', ['campos' => $faltando]);
    if (mb_strlen($dados['nome']) < 5 || !str_contains($dados['nome'], ' ')) erro(422, 'Informe o nome completo.', ['campos' => ['nome']]);
    if (!cpf_valido($dados['cpf'])) erro(422, 'CPF inválido.', ['campos' => ['cpf']]);
    if (!in_array($dados['uf'], UFS, true)) erro(422, 'UF inválida.', ['campos' => ['uf']]);
    if (!in_array($dados['estado_civil'], ESTADOS_CIVIS, true)) erro(422, 'Estado civil inválido.', ['campos' => ['estado_civil']]);
    if (($in['aceite'] ?? false) !== true) erro(422, 'O produtor precisa marcar o aceite do termo.');

    $coletor = texto($in['coletor'] ?? '', 100);
    if (mb_strlen($coletor) < 3) erro(422, 'Informe o nome de quem está coletando.');

    $termo = termo();
    if ((string)($in['termo_versao'] ?? '') !== $termo['versao']) erro(409, 'O termo foi atualizado. Recarregue a página e colete de novo.', ['termoMudou' => true]);

    $png = assinatura_png((string)($in['assinatura'] ?? ''));

    $geo = null;
    if (is_array($in['geo'] ?? null)) {
        $lat = filter_var($in['geo']['lat'] ?? null, FILTER_VALIDATE_FLOAT);
        $lng = filter_var($in['geo']['lng'] ?? null, FILTER_VALIDATE_FLOAT);
        $prec = filter_var($in['geo']['precisao'] ?? null, FILTER_VALIDATE_FLOAT);
        if ($lat !== false && $lng !== false && abs($lat) <= 90 && abs($lng) <= 180) {
            $geo = json_encode(['lat' => round($lat, 6), 'lng' => round($lng, 6), 'precisao' => $prec === false ? null : round($prec)]);
        }
    }

    $reg = [
        'uuid' => $uuid,
        'criado_em' => date('c'),
        'coletor' => $coletor,
        'termo_versao' => $termo['versao'],
        'termo_hash' => $termo['hash'],
        'coletado_em' => texto($in['coletado_em'] ?? '', 40),
        'dispositivo' => $dispositivo,
        'ip' => ip(),
    ];
    $dados['data_autorizacao'] = date('d/m/Y');

    $pdo = db();
    $pdo->beginTransaction();
    try {
        $pdo->prepare('INSERT INTO autorizacoes(uuid, criado_em, coletado_em, coletor, termo_versao, termo_hash, dados_cifrados,
            assinatura_cifrada, geo_cifrado, cpf_hmac, integridade, integ_versao, dispositivo, ip, ua) VALUES(?,?,?,?,?,?,?,?,?,?,?,2,?,?,?)')
            ->execute([
                $reg['uuid'], $reg['criado_em'], $reg['coletado_em'], $reg['coletor'], $reg['termo_versao'], $reg['termo_hash'],
                cifrar(json_encode($dados, JSON_UNESCAPED_UNICODE)), cifrar(base64_encode($png)),
                $geo ? cifrar($geo) : null, hmac_cpf($dados['cpf']), integridade($reg, $dados, $png, 2, $geo), $dispositivo ?: null, $reg['ip'], ua(),
            ]);
        $id = (int)$pdo->lastInsertId();
        $pdo->commit();
    } catch (Throwable $t) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        // Mesmo uuid enviado ao mesmo tempo por dois caminhos (fila + envio direto): devolve o já gravado.
        $st = $pdo->prepare('SELECT id, criado_em FROM autorizacoes WHERE uuid = ?');
        $st->execute([$uuid]);
        if ($ja = $st->fetch()) responder(['ok' => true, 'protocolo' => protocolo((int)$ja['id'], $ja['criado_em']), 'repetido' => true]);
        throw $t;
    }
    marcar('coleta-geral');
    $prot = protocolo($id, $reg['criado_em']);
    registrar(null, 'coleta', $prot, null, $coletor);
    responder(['ok' => true, 'protocolo' => $prot]);
}

/** Aceita só PNG, confere o tamanho e redesenha a imagem (descarta qualquer conteúdo escondido no arquivo). */
function assinatura_png(string $dataUrl): string {
    if (!str_starts_with($dataUrl, 'data:image/png;base64,')) erro(422, 'Assinatura ausente.');
    $bin = base64_decode(substr($dataUrl, 22), true);
    if ($bin === false || strlen($bin) < 800) erro(422, 'Assinatura ausente ou ilegível.');
    if (strlen($bin) > MAX_ASSINATURA) erro(413, 'Imagem da assinatura grande demais.');
    if (substr($bin, 0, 8) !== "\x89PNG\r\n\x1a\n") erro(422, 'Formato de assinatura inválido.');
    $info = @getimagesizefromstring($bin);
    if (!$info || $info[2] !== IMAGETYPE_PNG || $info[0] > 2000 || $info[1] > 1200 || $info[0] < 50 || $info[1] < 20
        || $info[0] * $info[1] > MAX_ASSIN_PIXELS) erro(422, 'Assinatura inválida.');
    if (function_exists('imagecreatefromstring')) {
        $im = @imagecreatefromstring($bin);
        if (!$im) erro(422, 'Assinatura inválida.');
        imagealphablending($im, false);
        imagesavealpha($im, true);
        ob_start();
        imagepng($im, null, 9);
        $bin = (string)ob_get_clean();
        imagedestroy($im);
    }
    return $bin;
}

/* ================= sessão da gestão ================= */

function acao_eu(): void {
    $u = sessao_atual();
    if (!$u) responder(['logado' => false]);
    responder(['logado' => true, 'nome' => $u['nome'], 'email' => $u['email'], 'admin' => (int)$u['admin'] === 1, 'trocarSenha' => (bool)$u['trocar_senha'], 'csrf' => $u['csrf']]);
}

function acao_entrar(): void {
    $in = corpo_json();
    $email = strtolower(texto($in['email'] ?? '', 150));
    $senha = (string)($in['senha'] ?? '');
    // Trava por (e-mail + IP): um estranho não consegue bloquear o login de outra pessoa de outro lugar.
    $kEI = 'login-email-ip:' . hash('sha256', $email . '|' . ip());
    $kI = 'login-ip:' . ip();
    $kE = 'login-email:' . hash('sha256', $email);
    if (contar($kEI, 900) >= LIMITE_LOGIN_EMAIL_IP || contar($kI, 900) >= LIMITE_LOGIN_IP || contar($kE, 900) >= LIMITE_LOGIN_EMAIL) {
        erro(429, 'Muitas tentativas erradas. Aguarde 15 minutos.');
    }
    $st = db()->prepare('SELECT * FROM usuarios WHERE email = ?');
    $st->execute([$email]);
    $u = $st->fetch();
    // E-mail inexistente: verifica contra um hash fictício do mesmo algoritmo (mesmo tempo de resposta,
    // para não revelar quais e-mails têm acesso).
    $ficticio = defined('PASSWORD_ARGON2ID')
        ? '$argon2id$v=19$m=65536,t=4,p=1$S2pIQXk3ZURGeVdGVXRkWA$dTgkK6FHlSCSyhLVhFi0MC9jornlGVPvNMp4/a9Chv8'
        : '$2y$10$UgSpA8hnkV048Pu797M9/.d0xHmi9IW2WWXGnGQAYqB09Rom7VF5y';
    $hash = $u['senha_hash'] ?? $ficticio;
    $ok = password_verify($senha, $hash) && $u && (int)$u['ativo'] === 1;
    if (!$ok) {
        marcar($kEI); marcar($kI); marcar($kE);
        // Nunca grava texto livre do campo e-mail (pode ser a senha digitada no lugar errado).
        $alvo = filter_var($email, FILTER_VALIDATE_EMAIL) ? $email : '(e-mail inválido)';
        registrar(null, 'login_falhou', $alvo, null, $alvo);
        erro(401, 'E-mail ou senha incorretos.');
    }
    limpar_marcas($kEI);
    if (password_needs_rehash($u['senha_hash'], defined('PASSWORD_ARGON2ID') ? PASSWORD_ARGON2ID : PASSWORD_DEFAULT)) {
        db()->prepare('UPDATE usuarios SET senha_hash = ? WHERE id = ?')->execute([senha_hash($senha), $u['id']]);
    }
    $s = sessao_abrir($u);
    registrar($u, 'login');
    responder(['ok' => true, 'nome' => $u['nome'], 'email' => $u['email'], 'admin' => (int)$u['admin'] === 1, 'trocarSenha' => (bool)$u['trocar_senha'], 'csrf' => $s['csrf']]);
}

function acao_sair(): void {
    $u = sessao_atual();
    if (!$u) responder(['ok' => true]);
    exigir_csrf($u);
    registrar($u, 'logout');
    sessao_encerrar();
    responder(['ok' => true]);
}

function acao_trocar_senha(): void {
    $u = exigir_sessao(true);
    exigir_csrf($u);
    $in = corpo_json();
    $atual = (string)($in['atual'] ?? '');
    $nova = (string)($in['nova'] ?? '');
    $kT = 'troca-senha:' . $u['id'];
    if (contar($kT, 900) >= LIMITE_LOGIN_EMAIL_IP) erro(429, 'Muitas tentativas. Aguarde 15 minutos.');
    $st = db()->prepare('SELECT senha_hash FROM usuarios WHERE id = ?');
    $st->execute([$u['id']]);
    if (!password_verify($atual, (string)$st->fetchColumn())) { marcar($kT); erro(422, 'Senha atual incorreta.'); }
    if (strlen($nova) < 10) erro(422, 'A nova senha precisa ter pelo menos 10 caracteres.');
    if ($nova === $atual) erro(422, 'A nova senha precisa ser diferente da atual.');
    $parteEmail = explode('@', $u['email'])[0];
    if (strlen($parteEmail) >= 4 && stripos($nova, $parteEmail) !== false) erro(422, 'Não use o seu e-mail na senha.');
    if (in_array(strtolower($nova), ['safeagro123', 'safeagro2026', '1234567890', 'senha12345', 'safeeds123'], true)) erro(422, 'Senha fácil demais.');
    db()->prepare('UPDATE usuarios SET senha_hash = ?, trocar_senha = 0 WHERE id = ?')->execute([senha_hash($nova), $u['id']]);
    db()->prepare('DELETE FROM sessoes WHERE usuario_id = ?')->execute([$u['id']]);
    limpar_marcas($kT);
    $nova_sessao = sessao_abrir($u);
    registrar($u, 'senha_trocada');
    responder(['ok' => true, 'csrf' => $nova_sessao['csrf']]);
}

/* ================= área de gestão ================= */

function ler_registro(array $r, bool $completo = false): array {
    $dados = json_decode((string)decifrar($r['dados_cifrados']), true) ?: [];
    $item = [
        'id' => (int)$r['id'],
        'protocolo' => protocolo((int)$r['id'], $r['criado_em']),
        'criado_em' => $r['criado_em'],
        'coletor' => $r['coletor'],
        'status' => $r['status'],
        'nome' => $dados['nome'] ?? '',
        'cidade' => $dados['cidade'] ?? '',
        'uf' => $dados['uf'] ?? '',
        'cpf' => cpf_mascarar($dados['cpf'] ?? ''),
    ];
    if ($completo) {
        $png = base64_decode((string)decifrar($r['assinatura_cifrada']));
        $item['dados'] = $dados;
        $item['dados']['cpf'] = cpf_formatar($dados['cpf'] ?? '');
        $item['assinatura'] = 'data:image/png;base64,' . base64_encode($png);
        $geoJson = $r['geo_cifrado'] ? (string)decifrar($r['geo_cifrado']) : null;
        $item['geo'] = $geoJson ? json_decode($geoJson, true) : null;
        $item['coletado_em'] = $r['coletado_em'];
        $item['termo_versao'] = $r['termo_versao'];
        $item['ip'] = $r['ip'];
        $item['ua'] = $r['ua'];
        $item['revogada_em'] = $r['revogada_em'];
        $item['revogada_motivo'] = $r['revogada_motivo'];
        $item['integridade'] = $r['integridade'];
        $item['dispositivo'] = $r['dispositivo'] ? substr((string)$r['dispositivo'], 0, 8) : null;
        $item['integro'] = hash_equals($r['integridade'], integridade($r, $dados, $png, (int)($r['integ_versao'] ?? 1), $geoJson))
            && hash_equals($r['termo_hash'], termo($r['termo_versao'])['hash']);
    }
    return $item;
}

function acao_resumo(array $u): void {
    $p = db();
    $total = (int)$p->query("SELECT COUNT(*) FROM autorizacoes WHERE status = 'valida'")->fetchColumn();
    $revog = (int)$p->query("SELECT COUNT(*) FROM autorizacoes WHERE status = 'revogada'")->fetchColumn();
    // "Últimos 30 dias" = hoje + 29 dias anteriores, contando desde 00:00 do primeiro dia.
    $desde = date('Y-m-d', strtotime('-29 days'));
    $st = $p->prepare("SELECT COUNT(*) FROM autorizacoes WHERE criado_em >= ?");
    $st->execute([$desde]);
    $mes = (int)$st->fetchColumn();
    $nColetores = (int)$p->query('SELECT COUNT(DISTINCT coletor) FROM autorizacoes')->fetchColumn();
    $coletores = $p->query('SELECT coletor FROM autorizacoes GROUP BY coletor ORDER BY COUNT(*) DESC LIMIT 5')->fetchAll(PDO::FETCH_COLUMN);
    responder(['validas' => $total, 'revogadas' => $revog, 'ultimos30' => $mes, 'desde' => $desde,
        'nColetores' => $nColetores, 'coletoresTop' => $coletores]);
}

function acao_lista(array $u): void {
    $sql = 'SELECT * FROM autorizacoes WHERE 1=1';
    $par = [];
    $status = (string)($_GET['status'] ?? '');
    if (in_array($status, ['valida', 'revogada'], true)) { $sql .= ' AND status = ?'; $par[] = $status; }
    $de = (string)($_GET['de'] ?? '');
    $ate = (string)($_GET['ate'] ?? '');
    if (preg_match('/^\d{4}-\d{2}-\d{2}$/', $de)) { $sql .= ' AND criado_em >= ?'; $par[] = $de; }
    if (preg_match('/^\d{4}-\d{2}-\d{2}$/', $ate)) { $sql .= ' AND criado_em < ?'; $par[] = date('Y-m-d', strtotime($ate . ' +1 day')); }
    $coletor = texto($_GET['coletor'] ?? '', 100);
    if ($coletor !== '') { $sql .= ' AND coletor = ?'; $par[] = $coletor; }
    $q = texto($_GET['q'] ?? '', 100);
    $soDig = preg_replace('/\D/', '', $q);
    if (strlen($soDig) === 11 && cpf_valido($soDig)) { $sql .= ' AND cpf_hmac = ?'; $par[] = hmac_cpf($soDig); $q = ''; }
    $sql .= ' ORDER BY id DESC LIMIT 5000';
    $st = db()->prepare($sql);
    $st->execute($par);
    $itens = [];
    $qn = $q !== '' ? normalizar($q) : '';
    if (preg_match('/^SA-\d{4}-0*(\d+)$/i', $q, $m)) $qn = '';
    foreach ($st as $r) {
        if (isset($m[1]) && (int)$r['id'] !== (int)$m[1]) continue;
        $it = ler_registro($r);
        if ($qn !== '' && !str_contains(normalizar($it['nome'] . ' ' . $it['cidade'] . ' ' . $it['uf'] . ' ' . $it['coletor']), $qn)) continue;
        $itens[] = $it;
    }
    $coletores = db()->query('SELECT DISTINCT coletor FROM autorizacoes ORDER BY coletor')->fetchAll(PDO::FETCH_COLUMN);
    responder(['itens' => $itens, 'coletores' => $coletores]);
}

function normalizar(string $s): string {
    $s = mb_strtolower($s);
    $t = iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $s);
    return $t === false ? $s : $t;
}

function buscar_registro(int $id): array {
    $st = db()->prepare('SELECT * FROM autorizacoes WHERE id = ?');
    $st->execute([$id]);
    $r = $st->fetch();
    if (!$r) erro(404, 'Autorização não encontrada.');
    return $r;
}

function acao_ver(array $u): void {
    $r = buscar_registro((int)($_GET['id'] ?? 0));
    $it = ler_registro($r, true);
    registrar($u, 'visualizou', $it['protocolo']);
    responder($it);
}

function acao_revogar(array $u): void {
    $in = corpo_json();
    $r = buscar_registro((int)($in['id'] ?? 0));
    $motivo = texto($in['motivo'] ?? '', 300);
    if (mb_strlen($motivo) < 5) erro(422, 'Descreva o motivo da revogação.');
    if ($r['status'] === 'revogada') erro(409, 'Esta autorização já está revogada.');
    db()->prepare("UPDATE autorizacoes SET status = 'revogada', revogada_em = ?, revogada_motivo = ?, revogada_por = ? WHERE id = ?")
        ->execute([date('c'), $motivo, $u['id'], $r['id']]);
    registrar($u, 'revogou', protocolo((int)$r['id'], $r['criado_em']), $motivo);
    responder(['ok' => true]);
}

function acao_excluir(array $u): void {
    $in = corpo_json();
    $r = buscar_registro((int)($in['id'] ?? 0));
    $prot = protocolo((int)$r['id'], $r['criado_em']);
    if (texto($in['confirmacao'] ?? '', 30) !== $prot) erro(422, 'Digite o protocolo para confirmar a exclusão.');
    $motivo = texto($in['motivo'] ?? '', 300);
    if (mb_strlen($motivo) < 5) erro(422, 'Descreva o motivo da exclusão.');
    db()->prepare('DELETE FROM autorizacoes WHERE id = ?')->execute([$r['id']]);
    registrar($u, 'excluiu', $prot, $motivo);
    responder(['ok' => true]);
}

function csv_campo(string $v): string {
    if ($v !== '' && strpbrk($v[0], "=+-@\t\r") !== false) $v = "'" . $v; // impede fórmula no Excel
    return '"' . str_replace('"', '""', $v) . '"';
}

function acao_exportar(array $u): void {
    $rows = db()->query('SELECT * FROM autorizacoes ORDER BY id')->fetchAll();
    $cab = ['Protocolo', 'Status', 'Registrado em', 'Coletado por', 'Nome', 'CPF', 'RG', 'Nacionalidade', 'Estado civil', 'Profissão',
        'Endereço', 'Cidade', 'UF', 'Data da autorização', 'Versão do termo', 'Revogada em', 'Motivo da revogação'];
    $saida = "\xEF\xBB\xBF" . implode(';', array_map('csv_campo', $cab)) . "\r\n";
    foreach ($rows as $r) {
        $d = json_decode((string)decifrar($r['dados_cifrados']), true) ?: [];
        $linha = [protocolo((int)$r['id'], $r['criado_em']), $r['status'] === 'valida' ? 'válida' : 'revogada', date('d/m/Y H:i', strtotime($r['criado_em'])), $r['coletor'],
            $d['nome'] ?? '', cpf_formatar($d['cpf'] ?? ''), $d['rg'] ?? '', $d['nacionalidade'] ?? '', $d['estado_civil'] ?? '',
            $d['profissao'] ?? '', $d['endereco'] ?? '', $d['cidade'] ?? '', $d['uf'] ?? '', $d['data_autorizacao'] ?? '',
            $r['termo_versao'], $r['revogada_em'] ? date('d/m/Y', strtotime($r['revogada_em'])) : '', (string)$r['revogada_motivo']];
        $saida .= implode(';', array_map(fn($v) => csv_campo((string)$v), $linha)) . "\r\n";
    }
    registrar($u, 'exportou', null, count($rows) . ' registros');
    header('Content-Type: text/csv; charset=utf-8');
    header('Content-Disposition: attachment; filename="autorizacoes-' . date('Y-m-d') . '.csv"');
    echo $saida;
    exit;
}

function acao_usuarios(array $u): void {
    $l = db()->query('SELECT id, nome, email, ativo, admin, trocar_senha, criado_em, ultimo_acesso FROM usuarios ORDER BY nome')->fetchAll();
    foreach ($l as &$x) { $x['id'] = (int)$x['id']; $x['ativo'] = (bool)$x['ativo']; $x['admin'] = (int)$x['admin'] === 1; $x['eu'] = $x['id'] === (int)$u['id']; }
    responder(['usuarios' => $l]);
}

function acao_usuario_criar(array $u): void {
    $in = corpo_json();
    $nome = texto($in['nome'] ?? '', 100);
    $email = strtolower(texto($in['email'] ?? '', 150));
    if (mb_strlen($nome) < 3) erro(422, 'Informe o nome.');
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) erro(422, 'E-mail inválido.');
    $st = db()->prepare('SELECT 1 FROM usuarios WHERE email = ?');
    $st->execute([$email]);
    if ($st->fetchColumn()) erro(409, 'Já existe um acesso com este e-mail.');
    $admin = ($in['admin'] ?? false) === true ? 1 : 0;
    $senha = senha_gerada();
    db()->prepare('INSERT INTO usuarios(nome, email, senha_hash, ativo, admin, trocar_senha, criado_em) VALUES(?,?,?,1,?,1,?)')
        ->execute([$nome, $email, senha_hash($senha), $admin, date('c')]);
    registrar($u, 'criou_acesso', $email, $admin ? 'administrador' : 'consulta');
    responder(['ok' => true, 'senha' => $senha]);
}

function acao_usuario_ativo(array $u): void {
    $in = corpo_json();
    $id = (int)($in['id'] ?? 0);
    $ativo = ($in['ativo'] ?? false) === true;
    if ($id === (int)$u['id']) erro(422, 'Você não pode desativar o seu próprio acesso.');
    $st = db()->prepare('UPDATE usuarios SET ativo = ? WHERE id = ?');
    $st->execute([$ativo ? 1 : 0, $id]);
    if ($st->rowCount() === 0) erro(404, 'Acesso não encontrado.');
    if (!$ativo) db()->prepare('DELETE FROM sessoes WHERE usuario_id = ?')->execute([$id]);
    registrar($u, $ativo ? 'reativou_acesso' : 'desativou_acesso', (string)$id);
    responder(['ok' => true]);
}

function acao_usuario_senha(array $u): void {
    $in = corpo_json();
    $id = (int)($in['id'] ?? 0);
    if ($id === (int)$u['id']) erro(422, 'Para a sua senha use "Trocar minha senha".');
    $senha = senha_gerada();
    $st = db()->prepare('UPDATE usuarios SET senha_hash = ?, trocar_senha = 1 WHERE id = ?');
    $st->execute([senha_hash($senha), $id]);
    if ($st->rowCount() === 0) erro(404, 'Acesso não encontrado.');
    db()->prepare('DELETE FROM sessoes WHERE usuario_id = ?')->execute([$id]);
    registrar($u, 'gerou_senha', (string)$id);
    responder(['ok' => true, 'senha' => $senha]);
}

function acao_link(array $u): void {
    $c = config_ler('chave_equipe_cifrada');
    responder(['codigo' => $c ? decifrar($c) : null, 'desde' => config_ler('chave_equipe_desde')]);
}

function acao_link_novo(array $u): void {
    $codigo = chave_equipe_nova();
    registrar($u, 'novo_link_equipe');
    responder(['codigo' => $codigo, 'desde' => config_ler('chave_equipe_desde')]);
}

function acao_usuario_perfil(array $u): void {
    $in = corpo_json();
    $id = (int)($in['id'] ?? 0);
    $admin = ($in['admin'] ?? false) === true ? 1 : 0;
    if ($id === (int)$u['id']) erro(422, 'Você não pode mudar o seu próprio perfil.');
    $st = db()->prepare('UPDATE usuarios SET admin = ? WHERE id = ?');
    $st->execute([$admin, $id]);
    if ($st->rowCount() === 0) erro(404, 'Acesso não encontrado.');
    db()->prepare('DELETE FROM sessoes WHERE usuario_id = ?')->execute([$id]);
    registrar($u, 'mudou_perfil', (string)$id, $admin ? 'administrador' : 'consulta');
    responder(['ok' => true]);
}

function acao_eventos(array $u): void {
    $coletas = ($_GET['coletas'] ?? '') === '1';
    $sql = 'SELECT quando, quem, acao, alvo, detalhe, ip FROM eventos ' . ($coletas ? "WHERE acao = 'coleta'" : "WHERE acao <> 'coleta'") . ' ORDER BY id DESC LIMIT 500';
    responder(['eventos' => db()->query($sql)->fetchAll()]);
}
