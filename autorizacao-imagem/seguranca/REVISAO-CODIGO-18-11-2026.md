# Revisão de código — 18/11/2026

Revisão completa de todos os arquivos (PHP, JavaScript, service worker), feita depois das correções do pentest de 16/11/2026. Objetivos: achar bugs, brechas restantes e regressões, além de limpar o código.
**Todos os itens abaixo foram corrigidos e retestados** com o script `testes/teste-seguranca.sh` e com o fluxo completo no navegador: coleta, envio, PDF, histórico, fila e gestão.

## Bugs corrigidos

| # | Gravidade | Onde | Problema | Correção |
|---|---|---|---|---|
| R-01 | Média | `form.js` (envio + fila) | A coleta era enviada pela tela de conferência e, ao mesmo tempo, podia ser reenviada pela fila automática. O servidor não duplicava (envio idempotente por `uuid`), mas o celular registrava a mesma coleta duas vezes no histórico e contava em dobro em "hoje". | A fila ignora o item que está sendo enviado pela tela, e o histórico não aceita protocolo repetido. |
| R-02 | Média | `api.php` `coletar` | Dois envios simultâneos do mesmo `uuid` batiam no índice único e geravam erro 500 sem desfazer a transação. | `try/rollBack`; se o `uuid` já existir, devolve o protocolo gravado (`repetido: true`). |
| R-03 | Média | `api.php` `trocar-senha` + `gestao.js` | Senha atual errada respondia **401**, que a tela trata como "sessão expirada": a pessoa era jogada para o login. Também não havia limite de tentativas nessa rota. | Responde **422** e limita a 5 tentativas em 15 min por usuário. |
| R-04 | Baixa | `api.php` `trocar-senha` | A regra "não use o seu e-mail na senha" comparava com a parte antes do `@`. Com e-mails curtos (ex.: `jo@…`), quase qualquer senha era recusada. | A regra só vale se essa parte tiver 4 ou mais caracteres. |
| R-05 | Média | `api.php` `resumo` | "Pessoas coletando" nunca passava de **12** (a consulta tinha `LIMIT 12`). | `COUNT(DISTINCT coletor)` separado; a tela mostra até 5 iniciais e "+N". |
| R-06 | Baixa | `api.php` `resumo` | "Últimos 30 dias" contava a partir de agora menos 30 dias, mas a tela dizia "desde" uma data de 29 dias atrás, 00:00. | Um só período: hoje + 29 dias anteriores, desde 00:00. |
| R-07 | Baixa | `form.js` | Limite de envio (429) ou erro do servidor aparecia como "sem internet". | A mensagem agora diz que o sistema não conseguiu receber e que a coleta ficou guardada e vai ser reenviada. |

## Segurança

| # | Gravidade | Onde | Problema | Correção |
|---|---|---|---|---|
| S-01 | Baixa | `api.php` `csv_campo` | A proteção contra fórmula no CSV não cobria campos que começam com tab ou CR (lista OWASP). | Também prefixa `\t` e `\r`. |
| S-02 | Baixa | `base.php` `segredo()` | Um `segredo.php` corrompido gerava erro de tipo no PHP. | Validação e falha controlada (`segredo_invalido`). |
| S-03 | Baixa | `api.php` `trocar-senha` | Sem limite de tentativas de senha atual (ver R-03). | 5 em 15 min por usuário. |

## Limpeza e manutenção

- A migração do banco agora roda **uma vez** por versão de esquema (`PRAGMA user_version = 2`), e não mais em toda requisição.
- Nomes antigos atualizados:
  - "painel" → "gestão" (código, comentários e cookie `autz_gestao`);
  - `exigir_admin()` → `exigir_sessao()` (ela exige login de qualquer perfil, não perfil de administrador);
  - `telaPainel` → `telaGestao`.
- Removidos:
  - parâmetro sem uso de `cabecalhos_seguranca()`;
  - função `compartilharPDF()` sem uso;
  - dados `porDia`/`porColetor` que a tela não usava mais;
  - segunda decifragem da localização no detalhe.
- Versão do sistema: `1.1.0`. Cache do service worker: `autz-v9`, para que os celulares peguem os arquivos novos.
- **Varredura automática de sobras (19/11):** um script cruzou todas as classes CSS, funções JS/PHP e constantes com o código que as usa. Removido o que sobrou de versões anteriores do visual:
  - a classe `.btn-claro`;
  - uma regra de fundo sem efeito na caixa de assinatura;
  - uma regra de espaçamento sem efeito na tela de sucesso;
  - um `counter-reset` sem uso;
  - a constante `AUTZ_VERSAO`, que nada lia; a versão ficou no cabeçalho de `base.php`.

  Também foi juntado um comentário duplicado no login e corrigido o recuo do bloco `try` da coleta. Resultado da varredura final: **nenhuma classe, função ou constante sem uso**.

## Verificações de compatibilidade

- Um banco criado nas versões anteriores foi atualizado para o esquema 2 sem perda: as 3 autorizações existentes continuam com a integridade conferindo (v1), e o primeiro usuário virou administrador.
- O reenvio do mesmo `uuid` devolve o protocolo já gravado.
- O fluxo completo no navegador funcionou: dados → termo → assinatura → envio → protocolo → PDF (293 KB). O histórico não duplica, a fila fica vazia e não há erros de JavaScript.
- Todos os arquivos PHP passaram em `php -l` e todos os JS em `node --check`.
