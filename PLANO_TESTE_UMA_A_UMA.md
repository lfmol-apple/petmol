# PLANO TESTE UMA A UMA

## Alimentação
- pré-condição: produção desktop e celular exibem o mesmo `build xxxx`
- dado do usuário necessário: plano ativo com `estimated_end_date` ou `next_purchase_date`
- condição de disparo: `days_left <= 5`, após 11h BRT, máximo 1 push por dia por plano
- logs esperados: `[food_push] job_start`, `[food_push] plans_count`, `[food_push] eligibility`, `[food_push] attempt_send`, `[food_push] send_success` ou motivo de skip
- resultado esperado no celular: push real com título `A ração está acabando`
- resultado esperado no desktop: nenhum push simulado pelo frontend; somente o mesmo comportamento da produção web e, se permitido pelo navegador, o push real via SW
- como saber que passou: push chegou, link abriu `/home?modal=food&petId=...&action=buy`, e não houve segundo envio no mesmo dia

## Medicação
- pré-condição: push permission ativa e subscription válida
- dado do usuário necessário: medicação cadastrada com horário explícito de lembrete
- condição de disparo: horário configurado do item, com deduplicação diária
- logs esperados: logs do job de medicação e confirmação do envio
- resultado esperado no celular: push real no horário configurado
- resultado esperado no desktop: sem bridge/dispatcher gerando UI paralela; apenas push real se o navegador suportar e estiver inscrito
- como saber que passou: o mesmo item dispara uma vez, com deep link de medicação, sem alerta paralelo no frontend

## Vacina
- pré-condição: registro explícito de vacina com `alert_days_before` e `reminder_time`
- dado do usuário necessário: vacina cadastrada no pet alvo
- condição de disparo: data dentro da janela `due_date - alert_days_before`, no horário configurado
- logs esperados: `care_eval` seguido de `care_push_sent`
- resultado esperado no celular: push real da vacina
- resultado esperado no desktop: nenhuma simulação; apenas mesma build e eventual push real do navegador
- como saber que passou: deep link abre `/home?modal=vaccines&petId=...`

## Vermífugo
- pré-condição: controle explícito de vermífugo cadastrado
- dado do usuário necessário: registro com data de vencimento, `alert_days_before` e horário
- condição de disparo: janela ativa e horário configurado
- logs esperados: `care_eval` e `care_push_sent` no domínio de vermífugo
- resultado esperado no celular: push real do vermífugo
- resultado esperado no desktop: sem dispatcher e sem bridge; somente comportamento equivalente da build atual
- como saber que passou: deep link abre `/home?modal=vermifugo&petId=...`

## Antipulgas/Coleira
- pré-condição: controle explícito do tipo antipulgas ou coleira
- dado do usuário necessário: registro com data e horário configurados
- condição de disparo: janela ativa e horário configurado
- logs esperados: `care_eval` e `care_push_sent` do domínio correspondente
- resultado esperado no celular: push real do antipulgas ou da coleira
- resultado esperado no desktop: nenhuma camada paralela ativa
- como saber que passou: deep link abre `/home?modal=antipulgas&petId=...` ou `/home?modal=coleira&petId=...`

## Banho/Tosa
- pré-condição: grooming cadastrado com `scheduled_time`
- dado do usuário necessário: registro explícito de banho/tosa
- condição de disparo: janela ativa e horário configurado
- logs esperados: `care_eval` e `care_push_sent` para `grooming-*`
- resultado esperado no celular: push real de banho/tosa
- resultado esperado no desktop: sem simulação por bridge/dispatcher
- como saber que passou: deep link abre `/home?modal=grooming&petId=...`

## Complexidade residual explícita
- alimentação está pronta para teste simples e isolado.
- medicação depende do job já existente e continua baseada em cadastro explícito.
- vacina, vermífugo, antipulgas, coleira e banho/tosa continuam no job simples de `send_care_pushes`; ainda compartilham a mesma função backend, mas sem camada paralela no frontend e sem `send_care_urgent_pushes`.
- monthly docs e no-control estão desligados e não entram neste plano de teste.