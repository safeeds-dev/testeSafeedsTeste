# Instalação em produção (Hostinger)

## 1. Onde publicar
**Recomendado:** criar um subdomínio próprio (hPanel → Domínios → Subdomínios), por exemplo `autorizacao.safeeds.ind.br`, e publicar na raiz dele.
**Alternativa:** uma pasta, por exemplo `public_html/autorizacao/`. Funciona igual, mas fica na mesma origem que o resto do site.

## 2. Gerar o token de instalação
Crie o arquivo `nucleo/instalar.txt` com um texto aleatório de 32 caracteres ou mais (uma linha, sem espaços). Exemplo no PowerShell:
```
-join ((48..57)+(97..102) | Get-Random -Count 32 | % {[char]$_}) | Out-File -Encoding ascii -NoNewline nucleo\instalar.txt
```
Sem esse arquivo, o instalador responde 404. Ele é apagado automaticamente depois de usado.

## 3. Enviar os arquivos
Envie por FTP o **conteúdo** de `codigo/`, incluindo os `.htaccess` da raiz, de `nucleo/` e de `dados/`. Muitos clientes de FTP escondem arquivos que começam com ponto.

## 4. Instalar
Abra `https://<endereço>/instalar.php?t=<conteúdo do instalar.txt>` e informe o nome e o e-mail do primeiro administrador. A tela mostra **uma única vez**:
- a senha provisória (precisa ser trocada no 1º acesso);
- o link da equipe (`…/?k=…`);
- a pasta dos dados (o esperado é aparecer "fora da pasta pública ✓").

O instalador cria `segredo.php` (chaves) e `banco.sqlite` na pasta `autorizacao-dados`, ao lado do `public_html`. Ele também grava `nucleo/local.php` com esse caminho. Depois disso, deixe `nucleo/` como somente leitura (555/444).

## 5. Guardar a chave
Baixe `segredo.php` por FTP e guarde-o fora do servidor (cofre de senhas da empresa). **Sem ele, o banco não pode ser lido.**

## 6. Checklist pós-instalação

| Teste | Esperado |
|---|---|
| `curl -sI https://<endereço>/nucleo/base.php` | 403 ou 404 |
| `curl -sI https://<endereço>/nucleo/instalar.txt` | 403 ou 404 |
| `curl -sI https://<endereço>/dados/` | 403 |
| `curl -sI https://<endereço>/error_log` | 403 ou 404 |
| `curl -sI https://<endereço>/.htaccess` | 403 |
| `curl -s https://<endereço>/api.php?a=lista` | `{"erro":"Sessão expirada…"}` (401) |
| `curl -sI http://<endereço>/` | 301 para https |
| `curl -sI https://<endereço>/api.php?a=termo` | tem `Content-Security-Policy` e `Strict-Transport-Security`; **não** tem `X-Powered-By` |
| `curl -s -X POST -H 'Content-Type: text/plain' -d '{}' https://<endereço>/api.php?a=entrar` | 415 |
| Navegador → F12 → Application → Cookies, depois do login | cookie `autz_gestao` (ou `__Host-autz_gestao` no subdomínio) com Secure, HttpOnly e SameSite=Strict |
| `instalar.php?t=…` de novo | 404 |

## 7. Operação
- **Gestão:** `https://<endereço>/gestao.html`
- **Link dos vendedores:** aba "Link da equipe". Pode ser trocado a qualquer momento, e o anterior para de funcionar na hora.
- **Backup:** `banco.sqlite` + `segredo.php`, guardados separados.
- **Mudar o termo:** criar uma versão nova em `nucleo/termo.php` e trocar `TERMO_ATUAL`. Nunca alterar uma versão já usada.
