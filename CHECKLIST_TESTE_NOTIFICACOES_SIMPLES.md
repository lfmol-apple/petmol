# CHECKLIST TESTE NOTIFICACOES SIMPLES

PASSO 1
- abrir produção no desktop
- abrir produção no celular
- confirmar o mesmo marcador visual `build xxxx` nos dois

PASSO 2
- confirmar permissão de notificação ativa no dispositivo de teste
- condição esperada: `Notification.permission = granted`
- log esperado: nenhum erro de permissão no console do navegador
- push esperado: nenhum ainda
- deep link esperado: não se aplica

PASSO 3
- confirmar subscription ativa
- condição esperada: endpoint salvo em `/notifications/subscribe`
- log esperado: `PushAutoRefresh` sem erro ou renovação concluída
- push esperado: nenhum ainda
- deep link esperado: não se aplica

PASSO 4
- testar alimentação isoladamente
- cadastrar plano ativo com `estimated_end_date` ou `next_purchase_date` em até 5 dias
- condição esperada: após 11h BRT, 1 push no máximo por dia para o plano
- log esperado: `[food_push] job_start`, `[food_push] plans_count`, `[food_push] eligibility`, `[food_push] attempt_send`, `[food_push] send_success` ou motivo de skip
- push esperado: `A ração está acabando` / `Faltam X dias. Hora de comprar.`
- deep link esperado: `/home?modal=food&petId=...&action=buy`

PASSO 5
- testar medicação isoladamente
- cadastrar medicação com lembrete explícito em horário conhecido
- condição esperada: disparo no horário configurado, sem frontend simular alerta
- log esperado: envio do job de medicação e tag diária deduplicada
- push esperado: lembrete da medicação cadastrada
- deep link esperado: modal de medicação do pet configurado

PASSO 6
- testar vacina isoladamente
- cadastrar vacina com `alert_days_before` e `reminder_time`
- condição esperada: disparo a partir da janela calculada e no horário configurado
- log esperado: `care_eval` e `care_push_sent` para domínio de vacina
- push esperado: alerta da vacina cadastrada
- deep link esperado: `/home?modal=vaccines&petId=...`

PASSO 7
- testar vermífugo isoladamente
- cadastrar controle explícito do tipo vermífugo com horário configurado
- condição esperada: disparo no horário configurado dentro da janela ativa
- log esperado: `care_eval` e `care_push_sent` para domínio `parasite-dewormer`
- push esperado: alerta do vermífugo cadastrado
- deep link esperado: `/home?modal=vermifugo&petId=...`

PASSO 8
- testar antipulgas/coleira isoladamente
- cadastrar controle explícito do tipo antipulgas ou coleira com horário configurado
- condição esperada: disparo no horário configurado dentro da janela ativa
- log esperado: `care_eval` e `care_push_sent` para domínio `parasite-flea_tick` ou `parasite-collar`
- push esperado: alerta do antipulgas ou da coleira cadastrada
- deep link esperado: `/home?modal=antipulgas&petId=...` ou `/home?modal=coleira&petId=...`

PASSO 9
- testar banho/tosa isoladamente
- cadastrar grooming com `alert_days_before` e `scheduled_time`
- condição esperada: disparo no horário configurado dentro da janela ativa
- log esperado: `care_eval` e `care_push_sent` para domínio `grooming-*`
- push esperado: alerta de banho/tosa cadastrado
- deep link esperado: `/home?modal=grooming&petId=...`