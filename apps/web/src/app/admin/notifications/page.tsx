"use client";

import { useState } from "react";
import { PremiumScreenShell } from "@/components/premium";
import { useNotificationPermissionController } from "@/features/interactions/useNotificationPermissionController";

export default function AdminNotificationsPage() {
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
        activate: "Push ativado. Você receberá notificações mesmo com o app fechado.",
        deactivate: "Push desativado.",
        test: "Notificação de teste enviada! Verifique seu dispositivo.",
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
    denied: "Bloqueado pelo navegador",
    default: "Não solicitado",
  };

  return (
    <PremiumScreenShell
      title="Notificações Push"
      subtitle="Lembretes de vacinas, medicação e cuidados — chegam mesmo com o app fechado"
      backHref="/admin/dashboard"
    >
      <div className="px-4 py-6 max-w-md mx-auto space-y-6 pb-20">

        {/* Status */}
        <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-4">
          <h2 className="text-sm font-semibold text-slate-900">Status deste dispositivo</h2>

          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <p className="text-sm text-slate-600">Suporte a push</p>
              <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${isSupported ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-400"}`}>
                {isSupported ? "Suportado" : "Não suportado"}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <p className="text-sm text-slate-600">Permissão</p>
              <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${permission === "granted" ? "bg-blue-50 text-blue-700" : permission === "denied" ? "bg-red-50 text-red-600" : "bg-slate-100 text-slate-400"}`}>
                {permissionLabel[permission]}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <p className="text-sm text-slate-600">Inscrito</p>
              <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${isSubscribed ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-400"}`}>
                {isSubscribed ? "Sim — notificações ativas" : "Não"}
              </span>
            </div>
          </div>

          {permission === "denied" && (
            <p className="text-xs text-red-500 bg-red-50 px-3 py-2 rounded-xl">
              O navegador bloqueou as notificações. Abra as configurações do site e permita manualmente.
            </p>
          )}
        </div>

        {/* Feedback */}
        {feedback && (
          <p className={`text-sm font-medium px-4 py-3 rounded-2xl ${feedback.ok ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600"}`}>
            {feedback.msg}
          </p>
        )}

        {/* Ações */}
        {isSupported && (
          <div className="space-y-3">
            {!isSubscribed ? (
              <button
                type="button"
                disabled={loading === "activate" || permission === "denied"}
                onClick={handleActivate}
                className="w-full py-3.5 rounded-2xl bg-[#0056D2] text-white text-sm font-semibold disabled:opacity-50 active:opacity-80 transition-opacity"
              >
                {loading === "activate" ? "Ativando…" : "Ativar notificações push"}
              </button>
            ) : (
              <>
                <button
                  type="button"
                  disabled={loading === "test"}
                  onClick={handleTest}
                  className="w-full py-3.5 rounded-2xl bg-slate-900 text-white text-sm font-semibold disabled:opacity-40 active:opacity-80 transition-opacity"
                >
                  {loading === "test" ? "Enviando…" : "Enviar notificação de teste"}
                </button>
                <button
                  type="button"
                  disabled={loading === "deactivate"}
                  onClick={handleDeactivate}
                  className="w-full py-3 rounded-2xl bg-slate-100 text-slate-500 text-sm font-medium disabled:opacity-50 active:opacity-80 transition-opacity"
                >
                  {loading === "deactivate" ? "Desativando…" : "Desativar push"}
                </button>
              </>
            )}
          </div>
        )}

        {/* O que você vai receber */}
        <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
          <h2 className="text-sm font-semibold text-slate-900">O que você recebe</h2>
          <ul className="space-y-2 text-sm text-slate-600">
            <li className="flex items-start gap-2"><span>💊</span><span>Lembretes de medicação — no horário configurado no tratamento</span></li>
            <li className="flex items-start gap-2"><span>💉</span><span>Vacinas vencidas ou vencendo hoje — diariamente às 9h</span></li>
            <li className="flex items-start gap-2"><span>🛡️</span><span>Vermífugo, antipulgas e coleira — vencidos ou no dia configurado</span></li>
            <li className="flex items-start gap-2"><span>📅</span><span>Check-in mensal — no dia e hora que você configurou</span></li>
          </ul>
        </div>

      </div>
    </PremiumScreenShell>
  );
}


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
