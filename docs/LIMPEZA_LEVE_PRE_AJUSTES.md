# PETMOL - Limpeza leve pre-ajustes

Objetivo: organizar a base sem remocoes destrutivas.

## Fonte oficial atual
- Base de codigo: `PETMOL VL` (local).
- Banco oficial de trabalho: PostgreSQL (`petmol_dev`).
- Storage oficial local: `services/price-service/uploads`.

## Candidatos a revisao (nao removidos)

### Componentes com indicio de orfandade (ocorrencia unica)
- `apps/web/src/components/PetPanel.tsx`
- `apps/web/src/components/AdminGuard.tsx`
- `apps/web/src/components/AuthGate.tsx`
- `apps/web/src/components/FamilyManager.tsx`
- `apps/web/src/components/GlobalPriceCompare.tsx`
- `apps/web/src/components/IdentityKitPanel.tsx`
- `apps/web/src/components/InteractiveMap.tsx`
- `apps/web/src/components/LanguageCountrySelector.tsx`
- `apps/web/src/components/LogoutOTPModal.tsx`
- `apps/web/src/components/ShoppingSearchModal.tsx`
- `apps/web/src/components/VigiaAIButton.tsx`

### Sobreposicoes de experiencia (revisar consolidacao posterior)
- `apps/web/src/components/home/VetHistoryModal.tsx`
- `apps/web/src/components/home/HealthModal.tsx`

### Scripts com sinal de legado
- `package.json` raiz: scripts `mobile*` apontam para `apps/mobile` (pasta nao encontrada).

## Artefatos e higiene (nao destrutivo)
- Manter `backups/` fora de versionamento.
- Manter `uploads/` fora de versionamento.
- Evitar commit de dumps SQL e artefatos zip locais.

## Pendencias para limpeza pesada (fase posterior)
- Confirmar uso real dos candidatos via telemetria/navegacao.
- Mover codigo realmente inativo para subpasta de legado ou remover com seguranca.
- Padronizar scripts raiz para evitar comandos quebrados.
