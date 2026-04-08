"use client";

import { useState } from "react";
import { AnimatePresence } from "framer-motion";
import { PremiumScreenShell } from "@/components/premium";
import { useMasterInteractionRules } from "@/features/interactions/useMasterInteractionRules";
import { useNotificationPermissionController } from "@/features/interactions/useNotificationPermissionController";
import { NotificationControlCard } from "@/components/NotificationControlCard";
import { NotificationControlDrawer } from "@/components/NotificationControlDrawer";
import type { CareInteractionPolicy, MasterInteractionRules } from "@/features/interactions/types";

type CareKey =
  | "food"
  | "flea_tick"
  | "dewormer"
  | "collar"
  | "vaccines"
  | "medication"
  | "grooming"
  | "documents"
  | "emergency";

interface CareDef {
  key: CareKey;
  icon: string;
  label: string;
  description: string;
  isEmergency?: boolean;
}

const CARE_DEFS: CareDef[] = [
  { key: "emergency", icon: "🚨", label: "Emergência", description: "Eventos críticos e orientações imediatas.", isEmergency: true },
  { key: "vaccines", icon: "💉", label: "Vacinas", description: "Carteira vacinal e reforços obrigatórios." },
  { key: "medication", icon: "💊", label: "Medicação", description: "Tratamentos contínuos e doses programadas." },
  { key: "dewormer", icon: "🪱", label: "Vermífugo", description: "Protocolos de vermifugação." },
  { key: "flea_tick", icon: "🐜", label: "Antipulgas", description: "Controle de pulgas e carrapatos." },
  { key: "collar", icon: "📿", label: "Coleira", description: "Coleira antiparasitária." },
  { key: "food", icon: "🍖", label: "Alimentação", description: "Reabastecimento e rotina alimentar." },
  { key: "grooming", icon: "🧼", label: "Banho e tosa", description: "Higiene e rotina estética." },
  { key: "documents", icon: "📄", label: "Documentos", description: "Certidões, laudos e documentos." },
];

function ToggleSwitch({ checked, onToggle }: { checked: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onToggle}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
        checked ? "bg-blue-500" : "bg-slate-200"
      }`}
    >
      <span
        className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
          checked ? "translate-x-5" : ""
        }`}
      />
    </button>
  );
}

// ---------------------------------------------------------------------------
// Push control section
// ---------------------------------------------------------------------------
function PushControlSection() {
  const {
    isSupported,
    isSubscribed,
    permission,
    requestPermission,
    subscribeToPush,
    unsubscribe,
    sendTestNotification,
  } = useNotificationPermissionController();

  const [loading, setLoading] = useState<"activate" | "deactivate" | "test" | null>(null);
  const [feedback, setFeedback] = useState<{ ok: boolean; msg: string } | null>(null);

  const withLoading = async (
    key: "activate" | "deactivate" | "test",
    fn: () => Promise<unknown>
  ) => {
    setLoading(key);
    setFeedback(null);
    try {
      await fn();
      const msgs = {
        activate: "Push ativado com sucesso.",
        deactivate: "Push desativado.",
        test: "Push de teste enviado! Verifique seu dispositivo.",
      };
      setFeedback({ ok: true, msg: msgs[key] });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro desconhecido.";
      setFeedback({ ok: false, msg });
    } finally {
      setLoading(null);
    }
  };

  const handleActivate = () =>
    withLoading("activate", async () => {
      const granted = permission === "granted" ? true : await requestPermission();
      if (!granted) throw new Error("Permissão negada pelo navegador.");
      const sub = await subscribeToPush();
      if (!sub) throw new Error("Não foi possível criar subscription.");
    });

  const handleDeactivate = () => withLoading("deactivate", unsubscribe);
  const handleTest = () => withLoading("test", sendTestNotification);

  const permissionLabel: Record<NotificationPermission, string> = {
    granted: "Permitido",
    denied: "Bloqueado",
    default: "Não solicitado",
  };

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold text-slate-900">Push no celular</h2>
      <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-4">
        {/* Status */}
        <div className="flex flex-wrap gap-2">
          <span
            className={`text-[11px] font-medium px-3 py-1 rounded-full ring-1 ${
              isSupported
                ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                : "bg-slate-100 text-slate-400 ring-slate-200"
            }`}
          >
            {isSupported ? "Suportado" : "Não suportado"}
          </span>
          <span
            className={`text-[11px] font-medium px-3 py-1 rounded-full ring-1 ${
              permission === "granted"
                ? "bg-blue-50 text-blue-700 ring-blue-200"
                : "bg-slate-100 text-slate-400 ring-slate-200"
            }`}
          >
            {permissionLabel[permission]}
          </span>
          <span
            className={`text-[11px] font-medium px-3 py-1 rounded-full ring-1 ${
              isSubscribed
                ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                : "bg-slate-100 text-slate-400 ring-slate-200"
            }`}
          >
            {isSubscribed ? "Assinado" : "Não assinado"}
          </span>
        </div>

        {!isSupported && (
          <p className="text-xs text-slate-400">
            Este dispositivo/navegador não suporta Web Push.
          </p>
        )}

        {/* Feedback */}
        {feedback && (
          <p
            className={`text-xs font-medium px-3 py-2 rounded-xl ${
              feedback.ok
                ? "bg-emerald-50 text-emerald-700"
                : "bg-red-50 text-red-600"
            }`}
          >
            {feedback.msg}
          </p>
        )}

        {/* Ações */}
        {isSupported && (
          <div className="flex flex-wrap gap-2">
            {!isSubscribed ? (
              <button
                type="button"
                disabled={loading === "activate"}
                onClick={handleActivate}
                className="px-4 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-semibold disabled:opacity-50 active:opacity-80 transition-opacity"
              >
                {loading === "activate" ? "Ativando…" : "Ativar push"}
              </button>
            ) : (
              <button
                type="button"
                disabled={loading === "deactivate"}
                onClick={handleDeactivate}
                className="px-4 py-2.5 rounded-xl bg-slate-200 text-slate-700 text-sm font-semibold disabled:opacity-50 active:opacity-80 transition-opacity"
              >
                {loading === "deactivate" ? "Desativando…" : "Desativar push"}
              </button>
            )}
            <button
              type="button"
              disabled={!isSubscribed || loading === "test"}
              onClick={handleTest}
              className="px-4 py-2.5 rounded-xl bg-slate-900 text-white text-sm font-semibold disabled:opacity-40 active:opacity-80 transition-opacity"
            >
              {loading === "test" ? "Enviando…" : "Enviar teste"}
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

export default function AdminNotificationsPage() {
  const { rules, updateRules, getCarePolicy } = useMasterInteractionRules();
  const [selectedKey, setSelectedKey] = useState<CareKey | null>(null);

  const selectedDef = CARE_DEFS.find((d) => d.key === selectedKey) ?? null;
  const selectedPolicy = selectedKey ? getCarePolicy(selectedKey) : null;

  const handlePolicyChange = (key: CareKey, next: CareInteractionPolicy) => {
    updateRules({ ...rules, carePolicies: { ...rules.carePolicies, [key]: next } });
  };

  const ch = rules.channels;
  const toggleChannel = (channel: keyof typeof ch) =>
    updateRules({ ...rules, channels: { ...ch, [channel]: { ...ch[channel], enabled: !ch[channel].enabled } } });

  return (
    <PremiumScreenShell
      title="Painel de Notificações"
      subtitle="Controle quando o PETMOL avisa, como aparece e para onde o tutor vai depois"
      backHref="/admin/dashboard"
    >
      <div className="px-4 py-5 max-w-2xl mx-auto space-y-8 pb-20">

        {/* RESUMO GLOBAL */}
        <div className="flex flex-wrap gap-2">
          {[
            { active: ch.homePanel.enabled, on: "Home ativa", off: "Home desativada" },
            { active: ch.internalCenter.enabled, on: "Central ativa", off: "Central desativada" },
            { active: rules.multipet.grouping !== "none", on: "Multipet ativo", off: "Multipet livre" },
          ].map(({ active, on, off }) => (
            <span
              key={on}
              className={`text-[11px] font-medium px-3 py-1 rounded-full ring-1 ${
                active
                  ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                  : "bg-slate-100 text-slate-500 ring-slate-200"
              }`}
            >
              {active ? on : off}
            </span>
          ))}
          <span
            className={`text-[11px] font-medium px-3 py-1 rounded-full ring-1 ${
              rules.externalChannels.pushNotifications.active
                ? "bg-blue-50 text-blue-700 ring-blue-200"
                : "bg-slate-100 text-slate-500 ring-slate-200"
            }`}
          >
            {rules.externalChannels.pushNotifications.active ? "Push ativo" : "Push inativo"}
          </span>
          <span className="text-[11px] font-medium px-3 py-1 rounded-full bg-slate-100 text-slate-500 ring-1 ring-slate-200">Browser desligado</span>
        </div>

        {/* CUIDADOS */}
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-slate-900">Cuidados</h2>
          <p className="text-xs text-slate-400">
            Toque em “Configurar” para ajustar disparo, duração, aparência, ação e conversão.
          </p>
          <div className="grid sm:grid-cols-2 gap-3">
            {CARE_DEFS.map((def) => {
              const policy = getCarePolicy(def.key);
              if (!policy) return null;
              return (
                <NotificationControlCard
                  key={def.key}
                  icon={def.icon}
                  label={def.label}
                  policy={policy}
                  onConfigure={() => setSelectedKey(def.key)}
                />
              );
            })}
          </div>
        </section>

        {/* CANAIS GLOBAIS */}
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-slate-900">Canais globais</h2>
          <div className="rounded-2xl border border-slate-200 bg-white divide-y divide-slate-100 overflow-hidden">
            {[
              { key: "homePanel" as const, label: "Home", desc: "Cards de cuidado na tela inicial." },
              { key: "internalCenter" as const, label: "Central interna", desc: "Fila principal de interações." },
              { key: "homeBadge" as const, label: "Badges", desc: "Indicadores visuais de pendências." },
            ].map(({ key, label, desc }) => (
              <div key={key} className="flex items-center justify-between gap-3 px-4 py-3.5">
                <div>
                  <p className="text-sm font-medium text-slate-800">{label}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{desc}</p>
                </div>
                <ToggleSwitch checked={ch[key].enabled} onToggle={() => toggleChannel(key)} />
              </div>
            ))}
            {/* Push — canal ativo e controlável */}
            <div className="flex items-center justify-between gap-3 px-4 py-3.5">
              <div>
                <p className="text-sm font-medium text-slate-800">Push no celular</p>
                <p className="text-xs text-slate-400 mt-0.5">Notificação mesmo com o app fechado.</p>
              </div>
              <ToggleSwitch
                checked={rules.externalChannels.pushNotifications.active}
                onToggle={() =>
                  updateRules({
                    ...rules,
                    externalChannels: {
                      ...rules.externalChannels,
                      pushNotifications: {
                        ...rules.externalChannels.pushNotifications,
                        active: !rules.externalChannels.pushNotifications.active,
                      },
                    },
                  })
                }
              />
            </div>
            {/* Browser — opcional, desligado por padrão */}
            <div className="flex items-center justify-between gap-3 px-4 py-3.5 opacity-40">
              <div>
                <p className="text-sm font-medium text-slate-800">Browser notifications</p>
                <p className="text-xs text-slate-400 mt-0.5">Desligado por padrão — sem pedido automático.</p>
              </div>
              <div className="relative h-6 w-11 shrink-0 rounded-full bg-slate-200">
                <span className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow-sm" />
              </div>
            </div>
          </div>
        </section>

        {/* PUSH */}
        <PushControlSection />

        {/* MULTIPET */}
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-slate-900">Multi-pet</h2>
          <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs text-slate-400 block">Quando há muitos cuidados pendentes</label>
              <select
                value={rules.multipet.multiplePendingBehavior}
                onChange={(e) =>
                  updateRules({
                    ...rules,
                    multipet: {
                      ...rules.multipet,
                      multiplePendingBehavior: e.target.value as MasterInteractionRules["multipet"]["multiplePendingBehavior"],
                    },
                  })
                }
                className="w-full rounded-xl border border-slate-200 px-3 py-3 bg-white text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-300"
              >
                <option value="summarize">Resumir — máximo por pet</option>
                <option value="stack">Mostrar tudo</option>
                <option value="highest-only">Só o mais urgente</option>
              </select>
            </div>
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-slate-800">Vencidos primeiro</p>
                <p className="text-xs text-slate-400 mt-0.5">Interações em atraso sobem ao topo.</p>
              </div>
              <ToggleSwitch
                checked={rules.multipet.showOverdueFirst}
                onToggle={() =>
                  updateRules({ ...rules, multipet: { ...rules.multipet, showOverdueFirst: !rules.multipet.showOverdueFirst } })
                }
              />
            </div>
          </div>
        </section>

      </div>

      {/* DRAWER */}
      <AnimatePresence>
        {selectedKey && selectedDef && selectedPolicy && (
          <NotificationControlDrawer
            key={selectedKey}
            icon={selectedDef.icon}
            label={selectedDef.label}
            description={selectedDef.description}
            policy={selectedPolicy}
            isEmergency={selectedDef.isEmergency}
            onChange={(next) => handlePolicyChange(selectedKey, next)}
            onClose={() => setSelectedKey(null)}
          />
        )}
      </AnimatePresence>
    </PremiumScreenShell>
  );
}
