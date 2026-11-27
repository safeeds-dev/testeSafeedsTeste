# Autorização de uso de imagem, voz e depoimentos — Safeagro
### Pacote para validação do TI

**Versão:** 1.1.0 · **Data:** 18/11/2026 · **Responsável pelo pedido:** Marketing (Jonas)

O sistema substitui o Microsoft Forms usado pelos técnicos e vendedores de campo para coletar a autorização de uso de imagem dos produtores. A diferença em relação ao Forms é que o produtor **assina com o dedo na tela do celular**. O sistema também funciona **sem internet** e envia as coletas quando o sinal volta. Os dados pessoais ficam **cifrados** no servidor.

---

## 1. O que há neste pacote

| Pasta / arquivo | Conteúdo |
|---|---|
| `codigo/` | Código-fonte completo, exatamente o que vai para o servidor. Não inclui banco, chaves nem token de instalação. |
| `seguranca/RELATORIO-pentest-16-11-2026.md` | Teste de invasão + auditoria (16/11/2026): achados, evidências e correções sugeridas. |
| `seguranca/STATUS-CORRECOES.md` | O que foi corrigido e retestado e o que depende de configuração ou decisão. |
| `seguranca/REVISAO-CODIGO-18-11-2026.md` | Segunda revisão de código (bugs + segurança) e o que foi feito em cada item. |
| `testes/teste-seguranca.sh` | Script automático (bash + curl) que repete os ataques do pentest contra uma instalação de teste. |
| `testes/COMO-RODAR-LOCAL.md` | Como subir o sistema numa máquina de teste com o servidor embutido do PHP. |
| `INSTALACAO-PRODUCAO.md` | Passo a passo de publicação na Hostinger e o checklist pós-instalação. |

---

## 2. Arquitetura

```
Celular do vendedor (navegador / PWA)            Navegador do gestor (desktop)
  index.html + form.js                              gestao.html + gestao.js
  ├─ sem login: só ENVIA                           ├─ login (sessão em banco)
  ├─ fila offline (IndexedDB)                      ├─ perfis Administrador / Consulta
  ├─ assinatura em canvas → PNG                    └─ comprovante.php (HTML para imprimir/PDF)
  └─ PDF da via do produtor gerado no aparelho
            │  HTTPS, JSON, header X-Equipe                    │ HTTPS, cookie HttpOnly + X-CSRF
            ▼                                                   ▼
                       api.php  (roteador ?a=<ação>)
                       nucleo/base.php  (banco, cripto, sessão, limites, validação)
                       nucleo/termo.php (texto versionado do termo)
                                    │
                    pasta de dados FORA do public_html
                    ├─ banco.sqlite   (SQLite; dados pessoais cifrados)
                    ├─ segredo.php    (chaves AES-256 e HMAC; gerado na instalação)
                    └─ php-erros.log
```

- **Linguagem:** PHP 8.0+ (testado em 8.2), sem frameworks e sem dependências externas (nada de Composer, CDN ou fontes de terceiros).
- **Front-end:** HTML, CSS e JavaScript puros. A fonte Montserrat vai junto no pacote. A CSP é estrita (`script-src 'self'`, sem inline).
- **Banco:** SQLite (`pdo_sqlite`). A migração é aditiva e automática.
- **Hospedagem prevista:** Hostinger compartilhada (LiteSpeed). Recomendação: **subdomínio próprio** (ver §6).

### Extensões PHP exigidas
`pdo_sqlite`, `openssl` (com `aes-256-gcm`), `mbstring`. Opcionais: `gd` (redesenha a imagem da assinatura e descarta conteúdo escondido), `iconv` (busca sem acento).

---

## 3. Modelo de segurança (resumo)

| Tema | Como está feito |
|---|---|
| Quem envia | Formulário público liberado por um **código de equipe** de 144 bits (`?k=`). No servidor fica só o HMAC do código, e ele pode ser trocado na hora pela gestão. O formulário **não tem nenhuma rota de leitura**. |
| Quem lê | Só a **gestão**: login com e-mail e senha (Argon2id), senha provisória com troca obrigatória e perfis **Administrador** (tudo) e **Consulta** (só lista, detalhe e comprovante). A permissão é checada **no servidor**, rota a rota. |
| Sessão | Token aleatório de 256 bits; no banco fica só o SHA-256. Cookie `HttpOnly`, `Secure`, `SameSite=Strict`, com prefixo `__Host-` quando o sistema está na raiz de um subdomínio. Expira em 12 h no máximo ou após 2 h parado. É renovada ao trocar a senha e derrubada ao desativar o usuário. |
| CSRF | Todo POST exige `Content-Type: application/json` e a mesma origem (`Sec-Fetch-Site`/`Origin`). As rotas da gestão exigem também o header `X-CSRF`, ligado à sessão. |
| Dados em repouso | Nome, CPF, RG, endereço, assinatura, localização e o código da equipe ficam cifrados com **AES-256-GCM** (IV aleatório por registro). O CPF tem um índice de busca por **HMAC-SHA256**. |
| Integridade | Cada autorização guarda um **HMAC** de todos os dados, da assinatura, do texto do termo, do horário, do aparelho, da localização e do IP. O comprovante e o detalhe mostram se ele confere. |
| Força bruta | Login: 5 erros por e-mail+IP, 20 por IP e 60 por e-mail em 15 min. Código da equipe: 30 erros por IP/h. Envio: 60 tentativas por IP/h e 400 envios no total por hora. |
| Entrada | Validação no servidor (CPF com dígito verificador, UF e estado civil em lista fechada, tamanhos máximos). O PNG da assinatura passa por checagem de assinatura de arquivo, dimensão e pixels **antes** de decodificar e depois é redesenhado pelo GD. |
| Saída | O DOM é montado só com `textContent` (sem `innerHTML` com dado), o PHP usa `htmlspecialchars` e o CSV é protegido contra fórmula. |
| Cabeçalhos | CSP estrita, HSTS, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy: no-referrer`, `noindex`, `Cache-Control: no-store` na API, sem `X-Powered-By`. |
| Arquivos | O `.htaccess` nega `nucleo/`, `dados/`, `*.sqlite*`, `error_log`, logs, backups e arquivos ocultos. Os PHP internos respondem 404 se forem chamados direto. |
| Auditoria | A tabela `eventos` registra login, logout, senha errada, visualização, comprovante, revogação, exclusão, exportação, acessos e link. A tela separa as ações da equipe das coletas recebidas. |
| Offline | O service worker guarda só a "casca" (HTML, CSS, JS, fontes, ícones). A API e a gestão nunca passam pelo cache. A fila offline fica no IndexedDB do aparelho até o envio, e as coletas recusadas expiram em 7 dias. |

---

## 4. API (`api.php?a=<ação>`)

| Método e ação | Acesso | Função |
|---|---|---|
| `GET termo` | público | Texto e versão do termo, listas de UF e estado civil |
| `POST equipe` | público | Confere se o código da equipe é válido |
| `POST coletar` | código da equipe (`X-Equipe`) | Grava uma autorização (idempotente por `uuid`) |
| `GET eu` | público | Estado da sessão, perfil e CSRF |
| `POST entrar` / `POST sair` | público | Login / logout |
| `POST trocar-senha` | sessão (mesmo com senha provisória) | Troca a própria senha e renova a sessão |
| `GET resumo` · `GET lista` · `GET ver` | sessão: Consulta ou Administrador | Indicadores, lista com filtros, detalhe |
| `POST revogar` · `POST excluir` · `POST exportar` | Administrador | Revogação, exclusão definitiva (LGPD), CSV |
| `GET usuarios` · `POST usuario-criar` · `POST usuario-ativo` · `POST usuario-senha` · `POST usuario-perfil` | Administrador | Gestão de acessos |
| `GET link` · `POST link-novo` | Administrador | Ver ou trocar o código da equipe |
| `GET eventos` | Administrador | Registro de atividade |
| `comprovante.php?id=` | sessão | Comprovante para imprimir ou salvar em PDF |
| `instalar.php?t=` | token de instalação de uso único | Cria as chaves, o banco e o 1º administrador; depois responde 404 |

---

## 5. Banco de dados (SQLite)

`usuarios` · `sessoes` · `tentativas` · `config` · `autorizacoes` · `eventos`. O esquema está em `codigo/nucleo/base.php` (função `migrar`).

Em `autorizacoes`, os campos `dados_cifrados`, `assinatura_cifrada` e `geo_cifrado` são cifrados. Ficam em claro só os campos operacionais: protocolo/id, datas, coletor, versão e hash do termo, status, IP, user-agent e identificador aleatório do aparelho.

**Backup:** copiar `banco.sqlite` **e** `segredo.php`. Sem o `segredo.php`, o banco não pode ser lido. Guarde os dois em lugares diferentes.

---

## 6. Pontos para o TI decidir ou configurar

1. **Subdomínio próprio** (recomendado, ex.: `autorizacao.safeeds.ind.br`). Isola o sistema do resto do site e ativa o cookie `__Host-`.
2. **Conta da hospedagem:** não instalar outros sistemas (WordPress etc.) na mesma conta da Hostinger. Na hospedagem compartilhada, todos os sites da conta rodam com o mesmo usuário e poderiam ler as chaves.
3. **CDN/proxy:** se a CDN da Hostinger ou o Cloudflare estiverem ativos, confirmar que `REMOTE_ADDR` é o IP real do cliente (os limites por IP dependem disso).
4. **PHP no hPanel:** `display_errors=Off` e `expose_php=Off`.
5. **LGPD (jurídico):** aviso de privacidade (tratamento de CPF, RG, endereço, localização e IP) e política de retenção. O texto do termo é versionado em `nucleo/termo.php`.
6. **Backup** periódico do banco e cópia do `segredo.php` fora do servidor.

---

## 7. Limitações conhecidas

- Os dados de uma coleta feita sem sinal ficam no celular (IndexedDB, sem cifra própria) até serem enviados. A mitigação depende do aparelho: bloqueio de tela e não compartilhar o celular.
- O PDF da via do produtor é gerado no celular e pode ficar na pasta de downloads se o vendedor escolher "Salvar".
- A busca na gestão decifra os registros em memória. É adequado para milhares de registros; acima de algumas dezenas de milhares, vale paginar.
- Como o formulário não tem login, o nome de quem coleta é declarado por quem está com o link. O identificador do aparelho e o IP ajudam a rastrear abusos, e o link pode ser trocado a qualquer momento.
