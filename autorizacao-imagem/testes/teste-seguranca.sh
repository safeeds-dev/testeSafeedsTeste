#!/bin/bash
# Teste automático de segurança — Autorização de imagem Safeagro
# Uso: bash teste-seguranca.sh <URL_BASE> <TOKEN_INSTALACAO> <CAMINHO_DO_banco.sqlite>
#   ex.: bash teste-seguranca.sh http://127.0.0.1:8096 token-de-teste-1234567890 ./dados/banco.sqlite
# Precisa de: bash, curl e php (CLI, com gd) no PATH. Rode contra uma instalação NOVA e de TESTE.
# O script instala o sistema, cria usuários e grava autorizações de teste.

B="${1:?informe a URL base}"
TOKEN="${2:?informe o token de instalação}"
BANCO="${3:?informe o caminho do banco.sqlite de teste}"
PHP="${PHP:-php}"
TMP=$(mktemp -d)
cd "$TMP" || exit 1
J='Content-Type: application/json'
FALHAS=0
ok(){ printf '  [OK]    %s\n' "$1"; }
ruim(){ printf '  [FALHA] %s\n' "$1"; FALHAS=$((FALHAS+1)); }
cod(){ curl -s -o /dev/null -w '%{http_code}' "$@"; }
limpar_travas(){ "$PHP" -r '$p=new PDO("sqlite:".$argv[1]); $p->exec("DELETE FROM tentativas");' "$BANCO"; }
login(){ curl -s -c "$3" -b "$3" -H "$J" -d "{\"email\":\"$1\",\"senha\":\"$2\"}" "$B/api.php?a=entrar" | grep -oE '"csrf":"[a-f0-9]+' | cut -d'"' -f4; }

# assinatura PNG válida (400x150) e PNG gigante (3000x3000)
"$PHP" -r '$im=imagecreatetruecolor(400,150); imagesavealpha($im,true); imagefill($im,0,0,imagecolorallocatealpha($im,0,0,0,127)); $c=imagecolorallocate($im,15,31,61); imagesetthickness($im,3); for($i=0;$i<40;$i++) imageline($im,10+$i*9,75+(int)(40*sin($i/2)),19+$i*9,75+(int)(40*sin(($i+1)/2)),$c); for($x=0;$x<400;$x+=3) for($y=0;$y<150;$y+=7) imagesetpixel($im,$x,$y,imagecolorallocatealpha($im,0,0,0,120)); ob_start(); imagepng($im); echo "data:image/png;base64,".base64_encode(ob_get_clean());' > sig.txt
"$PHP" -r '$im=imagecreatetruecolor(3000,3000); ob_start(); imagepng($im,null,9); echo "data:image/png;base64,".base64_encode(ob_get_clean());' > big.txt

echo "== Instalação"
R=$(curl -s "$B/instalar.php?t=$TOKEN" -d "t=$TOKEN&nome=Admin Teste&email=admin@teste.local")
S1=$(echo "$R" | grep -oE '<code>[^<]+' | cut -c7-); K=$(echo "$R" | grep -oE '\?k=[A-Za-z0-9_-]+' | cut -c4-)
[ -n "$S1" ] && [ -n "$K" ] && ok "instalado" || { ruim "instalação (o sistema precisa estar recém-copiado e sem banco)"; exit 1; }
c=$(cod "$B/instalar.php?t=$TOKEN"); [ "$c" = 404 ] && ok "instalador desativado depois do uso (404)" || ruim "instalador ainda responde: $c"

CA=$(login admin@teste.local "$S1" a.jar)
c=$(cod -b a.jar "$B/api.php?a=lista"); [ "$c" = 403 ] && ok "senha provisória bloqueia o uso até ser trocada (403)" || ruim "senha provisória: $c"
cp a.jar antigo.jar
R=$(curl -s -c a.jar -b a.jar -H "$J" -H "X-CSRF: $CA" -d "{\"atual\":\"$S1\",\"nova\":\"SenhaForte#2026x\"}" "$B/api.php?a=trocar-senha")
CA=$(echo "$R" | grep -oE '"csrf":"[a-f0-9]+' | cut -d'"' -f4)
[ -n "$CA" ] && ok "troca de senha devolve sessão nova" || ruim "troca de senha: $R"
c=$(cod -b antigo.jar "$B/api.php?a=lista"); [ "$c" = 401 ] && ok "cookie de antes da troca de senha não vale mais (401)" || ruim "sessão antiga: $c"

echo "== Perfis (Administrador x Consulta)"
R=$(curl -s -b a.jar -H "$J" -H "X-CSRF: $CA" -d '{"nome":"Usuaria Consulta","email":"u2@teste.local"}' "$B/api.php?a=usuario-criar")
S2=$(echo "$R" | grep -oE '"senha":"[^"]+' | cut -d'"' -f4)
C2=$(login u2@teste.local "$S2" u.jar)
R=$(curl -s -c u.jar -b u.jar -H "$J" -H "X-CSRF: $C2" -d "{\"atual\":\"$S2\",\"nova\":\"OutraSenha#2026q\"}" "$B/api.php?a=trocar-senha"); C2=$(echo "$R" | grep -oE '"csrf":"[a-f0-9]+' | cut -d'"' -f4)
c=$(cod -b u.jar -H "$J" -H "X-CSRF: $C2" -d '{"id":1}' "$B/api.php?a=usuario-senha"); [ "$c" = 403 ] && ok "Consulta não gera senha de outro (403)" || ruim "usuario-senha por Consulta: $c"
c=$(cod -b u.jar -H "$J" -H "X-CSRF: $C2" -d '{}' "$B/api.php?a=exportar"); [ "$c" = 403 ] && ok "Consulta não exporta (403)" || ruim "exportar por Consulta: $c"
c=$(cod -b u.jar "$B/api.php?a=eventos"); [ "$c" = 403 ] && ok "Consulta não vê atividade (403)" || ruim "eventos por Consulta: $c"
c=$(cod -b u.jar "$B/api.php?a=link"); [ "$c" = 403 ] && ok "Consulta não vê o link da equipe (403)" || ruim "link por Consulta: $c"
c=$(cod -b u.jar -H "$J" -H "X-CSRF: $C2" -d '{"id":1,"ativo":false}' "$B/api.php?a=usuario-ativo"); [ "$c" = 403 ] && ok "Consulta não desativa ninguém (403)" || ruim "usuario-ativo por Consulta: $c"
c=$(cod -b u.jar "$B/api.php?a=lista"); [ "$c" = 200 ] && ok "Consulta lista autorizações (200)" || ruim "lista por Consulta: $c"
c=$(cod -b a.jar -H "$J" -H "X-CSRF: $CA" -d '{"id":999,"ativo":false}' "$B/api.php?a=usuario-ativo"); [ "$c" = 404 ] && ok "usuário inexistente dá 404" || ruim "usuario-ativo id inexistente: $c"
c=$(cod -b a.jar -H "$J" -d '{}' "$B/api.php?a=exportar"); [ "$c" = 403 ] && ok "POST da gestão sem X-CSRF é recusado (403)" || ruim "sem csrf: $c"
R=$(curl -s -w ' %{http_code}' -b u.jar -H "$J" -H "X-CSRF: $C2" -d '{"atual":"errada-123456","nova":"QualquerCoisa#2026"}' "$B/api.php?a=trocar-senha"); echo "$R" | grep -q ' 422$' && ok "senha atual errada na troca dá 422" || ruim "troca com senha errada: $R"

echo "== Leitura sem sessão"
for a in resumo lista "ver&id=1" usuarios eventos link; do c=$(cod "$B/api.php?a=$a"); [ "$c" = 401 ] && ok "sem login: $a → 401" || ruim "sem login: $a → $c"; done
c=$(cod "$B/comprovante.php?id=1"); [ "$c" = 302 ] && ok "comprovante sem login redireciona (302)" || ruim "comprovante sem login: $c"

echo "== CSRF / mesma origem"
c=$(cod -H 'Content-Type: text/plain' -d '{"email":"admin@teste.local","senha":"x"}' "$B/api.php?a=entrar"); [ "$c" = 415 ] && ok "POST com text/plain recusado (415)" || ruim "text/plain: $c"
c=$(cod -H "$J" -H 'Sec-Fetch-Site: cross-site' -d '{"email":"a@b.c","senha":"x"}' "$B/api.php?a=entrar"); [ "$c" = 403 ] && ok "POST de outro site recusado (403)" || ruim "cross-site: $c"
c=$(cod -H "$J" -H 'Origin: https://evil.example' -d '{"email":"a@b.c","senha":"x"}' "$B/api.php?a=entrar"); [ "$c" = 403 ] && ok "Origin estranho recusado (403)" || ruim "origin: $c"
h=$(curl -s -D - -o /dev/null -H "$J" -d '{}' "$B/api.php?a=sair" | grep -ci set-cookie); [ "$h" = 0 ] && ok "logout sem sessão não mexe no cookie" || ruim "logout sem sessão gravou cookie"

echo "== Registro de atividade"
curl -s -o /dev/null -H "$J" -d '{"email":"MinhaSenhaSecreta123","senha":"x"}' "$B/api.php?a=entrar"
R=$(curl -s -b a.jar "$B/api.php?a=eventos"); echo "$R" | grep -q MinhaSenhaSecreta && ruim "texto livre do campo e-mail aparece na atividade" || ok "texto do campo e-mail não aparece na atividade"

echo "== Tempo de resposta do login (e-mail existente x inexistente; devem ser parecidos)"
for i in 1 2 3; do
  a=$(curl -s -o /dev/null -w '%{time_total}' -H "$J" -d '{"email":"admin@teste.local","senha":"errada-x"}' "$B/api.php?a=entrar")
  b=$(curl -s -o /dev/null -w '%{time_total}' -H "$J" -d "{\"email\":\"naoexiste$i@teste.local\",\"senha\":\"errada-x\"}" "$B/api.php?a=entrar")
  echo "    existente=${a}s  inexistente=${b}s"
done

echo "== Força bruta no login (5 erros por e-mail+IP)"
limpar_travas
for i in 1 2 3 4 5; do curl -s -o /dev/null -H "$J" -d '{"email":"admin@teste.local","senha":"errada"}' "$B/api.php?a=entrar"; done
c=$(cod -H "$J" -d '{"email":"admin@teste.local","senha":"SenhaForte#2026x"}' "$B/api.php?a=entrar"); [ "$c" = 429 ] && ok "6ª tentativa do mesmo IP bloqueada, mesmo com a senha certa (429)" || ruim "6ª tentativa: $c"
limpar_travas

echo "== Envio público (formulário)"
c=$(cod -H "$J" -H "X-Equipe: codigo-errado-1234567890" -d '{}' "$B/api.php?a=coletar"); [ "$c" = 403 ] && ok "código de equipe errado recusado (403)" || ruim "código errado: $c"
c=$(cod -H "$J" -H "X-Equipe: $K" -d '{"uuid":123,"dados":"x","coletor":[1]}' "$B/api.php?a=coletar"); [ "$c" = 400 ] && ok "tipos inválidos dão 400 (não 500)" || ruim "tipos: $c"
printf '{"uuid":"aaaaaaaa-1111-4111-8111-111111111111","dados":{"nome":"Teste Grande","cpf":"52998224725","rg":"1","nacionalidade":"B","estado_civil":"Casado(a)","profissao":"P","endereco":"E","cidade":"C","uf":"PR"},"aceite":true,"assinatura":"%s","coletor":"Teste","termo_versao":"1"}' "$(cat big.txt)" > big.json
R=$(curl -s -w ' %{http_code}' -H "$J" -H "X-Equipe: $K" --data-binary @big.json "$B/api.php?a=coletar"); echo "$R" | grep -q ' 422$' && ok "PNG 3000×3000 recusado antes de decodificar (422)" || ruim "png grande: $R"
printf '{"uuid":"bbbbbbbb-2222-4222-8222-222222222222","dados":{"nome":"Maria Reteste","cpf":"12345678900","rg":"12","nacionalidade":"Brasileira","estado_civil":"Casado(a)","profissao":"Produtora rural","endereco":"Linha 1","cidade":"Toledo","uf":"PR"},"aceite":true,"assinatura":"%s","coletor":"Vendedor","termo_versao":"1"}' "$(cat sig.txt)" > cpf.json
R=$(curl -s -w ' %{http_code}' -H "$J" -H "X-Equipe: $K" --data-binary @cpf.json "$B/api.php?a=coletar"); echo "$R" | grep -q ' 422$' && ok "CPF inválido recusado (422)" || ruim "cpf inválido: $R"
printf '{"uuid":"cccccccc-2222-4222-8222-222222222222","dados":{"nome":"<script>alert(1)</script> Silva","cpf":"52998224725","rg":"12","nacionalidade":"Brasileira","estado_civil":"Casado(a)","profissao":"Produtora rural","endereco":"=HYPERLINK(\\"x\\")","cidade":"Toledo","uf":"PR"},"aceite":true,"assinatura":"%s","geo":{"lat":-24.7,"lng":-53.7,"precisao":10},"coletor":"Vendedor","coletado_em":"2026-11-18T10:00:00-03:00","dispositivo":"dddddddd-3333-4333-8333-333333333333","termo_versao":"1"}' "$(cat sig.txt)" > ok.json
R=$(curl -s -H "$J" -H "X-Equipe: $K" --data-binary @ok.json "$B/api.php?a=coletar"); echo "$R" | grep -q '"ok":true' && ok "coleta válida aceita" || ruim "coleta válida: $R"
R=$(curl -s -H "$J" -H "X-Equipe: $K" --data-binary @ok.json "$B/api.php?a=coletar"); echo "$R" | grep -q '"repetido":true' && ok "reenvio do mesmo uuid é idempotente" || ruim "reenvio: $R"
ID=$(curl -s -b a.jar "$B/api.php?a=lista" | grep -oE '"id":[0-9]+' | head -1 | cut -d: -f2)
curl -s -b a.jar "$B/api.php?a=ver&id=$ID" | grep -q '"integro":true' && ok "integridade (HMAC v2) confere" || ruim "integridade v2"
H=$(curl -s -b a.jar "$B/comprovante.php?id=$ID"); echo "$H" | grep -q '&lt;script&gt;' && ! echo "$H" | grep -q '<script>alert' && ok "comprovante escapa HTML" || ruim "comprovante sem escape"
CSV=$(curl -s -b a.jar -H "$J" -H "X-CSRF: $CA" -d '{}' "$B/api.php?a=exportar"); echo "$CSV" | grep -q "\"'=HYPERLINK" && ok "CSV neutraliza fórmula" || ruim "CSV com fórmula"
"$PHP" -r '$p=new PDO("sqlite:".$argv[1]); $p->exec("UPDATE autorizacoes SET dispositivo=\x27eeeeeeee-0000-4000-8000-000000000000\x27 WHERE id=".(int)$argv[2]);' "$BANCO" "$ID"
curl -s -b a.jar "$B/api.php?a=ver&id=$ID" | grep -q '"integro":false' && ok "adulteração direta no banco é detectada" || ruim "adulteração não detectada"
"$PHP" -r '$p=new PDO("sqlite:".$argv[1]); $r=$p->query("SELECT dados_cifrados FROM autorizacoes LIMIT 1")->fetchColumn(); echo (str_contains($r,"52998224725")||str_contains($r,"Silva"))?"claro":"cifrado";' "$BANCO" | grep -q cifrado && ok "dados pessoais cifrados no arquivo do banco" || ruim "dados em claro no banco"

echo "== Limite de envios por IP (conta toda tentativa)"
n=0; for i in $(seq 1 65); do c=$(cod -H "$J" -H "X-Equipe: $K" -d '{"uuid":"x"}' "$B/api.php?a=coletar"); [ "$c" = 429 ] && { n=$i; break; }; done
[ "$n" -gt 0 ] && ok "bloqueado na tentativa $n (limite 60/h por IP, incluindo as anteriores)" || ruim "sem bloqueio em 65 tentativas"
limpar_travas

echo "== Cabeçalhos"
HD=$(curl -s -D - -o /dev/null "$B/api.php?a=termo")
echo "$HD" | grep -qi '^x-powered-by' && ruim "X-Powered-By presente" || ok "sem X-Powered-By"
echo "$HD" | grep -qi "^content-security-policy: default-src 'self'" && ok "CSP presente" || ruim "CSP ausente"
echo "$HD" | grep -qi '^x-frame-options: DENY' && ok "X-Frame-Options: DENY" || ruim "X-Frame-Options ausente"
echo "$HD" | grep -qi '^cache-control: no-store' && ok "API com Cache-Control: no-store" || ruim "cache-control"

echo
[ "$FALHAS" = 0 ] && echo "RESULTADO: tudo OK" || echo "RESULTADO: $FALHAS falha(s)"
rm -rf "$TMP"
