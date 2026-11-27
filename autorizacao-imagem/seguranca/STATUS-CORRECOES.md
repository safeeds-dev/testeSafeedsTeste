# Segurança — status das correções (16/11/2026)

O relatório completo do teste está em `RELATORIO-pentest-16-11-2026.md`.
Todas as correções abaixo foram **retestadas** com os mesmos ataques, numa instalação limpa.

## Corrigido e retestado

| ID | O que era | O que mudou | Reteste |
|---|---|---|---|
| A-01 | Qualquer usuário da gestão tomava a conta de outro | Perfis **Administrador** e **Consulta**. A Consulta só vê e abre comprovante; trocar senha, desativar, exportar, excluir, revogar, ver atividade e ver o link são só do administrador (bloqueio no servidor). | Consulta → 403 em tudo isso; a lista continua 200 |
| A-02 | Qualquer pessoa travava o login do admin | A trava agora é por **e-mail + IP** (5 erros), mais um teto por IP (20) e um teto alto por e-mail (60, contra ataque distribuído) | 6ª tentativa do mesmo IP → 429 |
| A-03 | Spam de autorizações falsas com o link | Toda tentativa conta no limite por IP (60/h), há um teto geral de 400/h e um **identificador do aparelho** aparece no detalhe. A atividade separa "Ações da equipe" de "Coletas", então spam não esconde o que o pessoal fez. | Bloqueado na 58ª tentativa |
| A-04 | Descobrir pelo tempo quais e-mails existem | Hash fictício do mesmo algoritmo (Argon2id) | 0,41/0,39 s · 0,55/0,51 s · 0,51/0,47 s (antes 0,36 s contra 0,73 s) |
| A-05 | Outro site logava ou deslogava a pessoa | Todo POST exige JSON e a mesma origem; `sair` sem sessão não mexe em nada | text/plain → 415; outro site → 403 |
| A-06 | Senha digitada no campo e-mail ia para a atividade | Só grava se for um e-mail válido | Não aparece |
| A-07 | PNG gigante | Teto de 2000×1200 e 1,44 MP, conferido **antes** de decodificar | 3000×3000 → 422 |
| A-08 | Tipo errado gerava erro 500 | Validação aceita qualquer tipo sem quebrar | → 400 |
| A-09 | `X-Powered-By` | Removido no PHP e no `.htaccess` | Ausente |
| L-03 (parte) | Integridade não cobria localização nem aparelho | Integridade **v2** também cobre localização, horário do aparelho, aparelho e IP | Adulteração detectada |
| L-06 | O service worker trocava a casca offline | Só a página do formulário vira cópia offline | — |
| L-07 | Token e CSRF não renovavam ao trocar senha | Ao trocar a senha, todas as sessões caem e abre uma nova | Cookie antigo → 401 |
| L-08 | Corrida no instalador | Transação exclusiva (`BEGIN IMMEDIATE`) | — |
| L-09 | Desativar id inexistente respondia "ok" | Agora → 404 | 404 |
| P-01 | `.htaccess` não bloqueava `error_log`, journal e backups | Regra ampliada; o log de erros do PHP vai para a pasta de dados; HSTS também nos estáticos | Conferir no ar |
| L-02 (parte) | Coletas recusadas ficavam no celular para sempre | Somem sozinhas depois de 7 dias | — |

## Depende de decisão ou de configuração (não é código)

1. **L-01 — usar um subdomínio próprio (recomendado).** Exemplo: `autorizacao.safeeds.ind.br`, em vez de `safeeds.ind.br/autorizacao`. Hoje o sistema divide a "origem" com o resto do site: uma falha em qualquer outra página de safeeds.ind.br poderia ler os dados da gestão. Com o subdomínio, o cookie vira `__Host-` automaticamente e fica isolado. Na Hostinger: hPanel → Domínios → Subdomínios.
2. **L-04 — LGPD (jurídico).** O termo não informa o tratamento de CPF, RG, endereço, localização e IP, nem por quanto tempo esses dados ficam guardados. Falta um aviso de privacidade aprovado pelo jurídico e uma política de retenção (por exemplo: apagar revogadas após X anos).
3. **L-03 — a chave fica no mesmo servidor do banco.** Isso é inevitável em hospedagem compartilhada. Mitigações: não instalar outros sistemas (WordPress etc.) na mesma conta e guardar o backup do `segredo.php` fora do servidor.
4. **L-05 — CDN/proxy.** Se a Hostinger CDN ou o Cloudflare estiverem ligados, conferir se o IP registrado é o do celular e não o do proxy.
5. **L-02 — celular do vendedor.** Coletas sem sinal ficam no aparelho até serem enviadas. Orientar a equipe a usar bloqueio de tela e a apagar os PDFs depois de enviar ao produtor.

## Conferir depois de subir (2 minutos)
Estes endereços devem responder **403 ou 404**:
`/autorizacao/nucleo/base.php` · `/autorizacao/dados/` · `/autorizacao/error_log` · `/autorizacao/.htaccess` · `/autorizacao/nucleo/instalar.txt` (depois de instalar).

No navegador, F12 → Application → Cookies: o cookie da gestão precisa ter **Secure, HttpOnly e SameSite=Strict**.
