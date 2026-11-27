# Rodar o sistema numa máquina de teste

Basta ter o PHP 8.x com `pdo_sqlite`, `openssl`, `mbstring` e `gd`. Não precisa de Apache nem de banco externo.

```bash
# 1) copiar o código para uma pasta de teste e criar uma pasta de dados vazia
cp -r ../codigo ./site
mkdir dados

# 2) token de instalação (qualquer texto com 20+ caracteres)
printf 'token-de-teste-1234567890' > site/nucleo/instalar.txt

# 3) subir o servidor embutido do PHP (AUTZ_DADOS aponta a pasta de dados)
AUTZ_DADOS="$PWD/dados" php -S 127.0.0.1:8096 -t site
```
No Windows/PowerShell:
```powershell
$env:AUTZ_DADOS = "$PWD\dados"; php -S 127.0.0.1:8096 -t site
```

Depois, abra `http://127.0.0.1:8096/instalar.php?t=token-de-teste-1234567890`.

Observações:
- Por `127.0.0.1` o sistema aceita http, mas só no servidor embutido (`php -S`). Em produção, exige HTTPS.
- O servidor embutido **não aplica o `.htaccess`**. As regras de bloqueio de pasta e arquivo só podem ser validadas no servidor real (checklist em `INSTALACAO-PRODUCAO.md`).
- O service worker (modo offline) exige contexto seguro: funciona em `127.0.0.1`/`localhost` e em https.

## Teste automático de segurança
Com o servidor de teste no ar e **recém-instalado**:
```bash
bash teste-seguranca.sh http://127.0.0.1:8096 token-de-teste-1234567890 ./dados/banco.sqlite
```
O script instala, cria um administrador e um usuário "Consulta" e repete os ataques do pentest. Ele cobre:
- permissões por perfil;
- CSRF/origem;
- força bruta;
- tempo de resposta do login;
- tipos inválidos;
- PNG gigante;
- integridade e adulteração;
- limite de envios;
- renovação da sessão;
- cabeçalhos.

Cada item sai como `[OK]` ou `[FALHA]`.
