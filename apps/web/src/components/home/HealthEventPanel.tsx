'use client';

import type { Dispatch, SetStateAction } from 'react';
import type { EventFormState } from '@/hooks/usePetEventManagement';
import type { PetEventRecord } from '@/lib/petEvents';
import type { DocFolderModalState, VetHistoryDocument } from '@/lib/types/homeForms';

interface HealthEventPanelProps {
  selectedPetId: string | null;
  eventFormData: EventFormState;
  setEventFormData: Dispatch<SetStateAction<EventFormState>>;
  editingEventId: string | null;
  eventSaving: boolean;
  attachDocFiles: File[];
  setAttachDocFiles: (files: File[]) => void;
  petEvents: PetEventRecord[];
  eventsLoading: boolean;
  eventTypeLocked: boolean;
  vetHistoryDocs: VetHistoryDocument[];
  setDocFolderModal: Dispatch<SetStateAction<DocFolderModalState>>;
  saveEvent: () => Promise<void>;
  cancelEventForm: () => void;
  openEditEvent: (event: PetEventRecord) => void;
  handleDeleteEvent: (eventId: string) => void;
}

export function HealthEventPanel({
  eventFormData,
  setEventFormData,
  editingEventId,
  eventSaving,
  attachDocFiles,
  setAttachDocFiles,
  petEvents,
  eventsLoading,
  eventTypeLocked,
  vetHistoryDocs,
  setDocFolderModal,
  saveEvent,
  cancelEventForm,
  openEditEvent,
  handleDeleteEvent,
}: HealthEventPanelProps) {
  const t_type = eventFormData.type;

  const titleLabel =
    t_type === 'cirurgia'
      ? 'Procedimento *'
      : t_type === 'exame_lab' || t_type === 'exame_imagem'
        ? 'Nome do exame / exame solicitado *'
        : 'Descrição / Motivo *';

  const titlePlaceholder =
    t_type === 'exame_lab'
      ? 'Ex: Hemograma, Bioquímica, Urinalise...'
      : t_type === 'exame_imagem'
        ? 'Ex: Raio-X tórax, Ecocardiograma, Ultrassom abdominal...'
        : t_type === 'cirurgia'
          ? 'Ex: Castração, Exérese de nódulo...'
          : t_type === 'odonto'
            ? 'Ex: Limpeza dentária, Extração...'
            : t_type === 'emergencia'
              ? 'Ex: Ingestão de corpo estranho, Convulsão...'
              : 'Ex: Consulta de rotina, check-up...';

  const localLabel = t_type === 'exame_lab' ? 'Laboratório' : 'Clínica / Hospital';

  const profLabel =
    t_type === 'cirurgia'
      ? 'Cirurgião'
      : t_type === 'exame_lab' || t_type === 'exame_imagem'
        ? 'Médico solicitante'
        : 'Veterinário';

  const nextLabel =
    t_type === 'consulta' || t_type === 'retorno'
      ? 'Próximo retorno'
      : t_type === 'odonto'
        ? 'Próxima limpeza'
        : 'Próxima data';

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center">
        <h3 className="text-base font-bold text-gray-800">Consultas, Exames &amp; Procedimentos</h3>
      </div>

      {/* Formulário de novo evento */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 space-y-3">
        <h4 className="font-bold text-gray-800 text-sm">
          {editingEventId ? '✏️ Editar registro' : 'Novo registro médico'}
        </h4>

        {/* Tipo — oculto quando pré-escolhido pelo menu de navegação */}
        {!eventTypeLocked && (
          <div>
            <label className="text-xs text-gray-500 font-medium block mb-1">Tipo *</label>
            <select
              value={t_type}
              onChange={e =>
                setEventFormData(prev => ({
                  ...prev,
                  type: e.target.value,
                  title: '',
                  result: '',
                  severity: 'moderada',
                }))
              }
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
            >
              <option value="consulta">🩺 Consulta veterinária</option>
              <option value="retorno">🔁 Retorno / Revisão</option>
              <option value="exame_lab">🔬 Exame laboratorial</option>
              <option value="exame_imagem">📷 Exame de imagem (raio-x, eco, ultrassom)</option>
              <option value="cirurgia">✂️ Cirurgia / Procedimento cirúrgico</option>
              <option value="odonto">🦷 Procedimento odontológico</option>
              <option value="emergencia">🚨 Emergência</option>
              <option value="outro">📝 Outro</option>
            </select>
          </div>
        )}

        {/* Título - label / placeholder adapta ao tipo */}
        <div>
          <label className="text-xs text-gray-500 font-medium block mb-1">{titleLabel}</label>
          <input
            type="text"
            placeholder={titlePlaceholder}
            value={eventFormData.title}
            onChange={e => setEventFormData(prev => ({ ...prev, title: e.target.value }))}
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
          />
        </div>

        {/* Data e hora */}
        <div>
          <label className="text-xs text-gray-500 font-medium block mb-1">Data e hora *</label>
          <input
            type="datetime-local"
            value={eventFormData.scheduled_at}
            onChange={e => setEventFormData(prev => ({ ...prev, scheduled_at: e.target.value }))}
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
          />
        </div>

        {/* Local + Profissional */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs text-gray-500 font-medium block mb-1">{localLabel}</label>
            <input
              type="text"
              placeholder={t_type === 'exame_lab' ? 'Ex: Laboratório CEPAM' : 'Clínica / hospital'}
              value={eventFormData.location_name}
              onChange={e =>
                setEventFormData(prev => ({
                  ...prev,
                  location_name: e.target.value.toUpperCase(),
                }))
              }
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 font-medium block mb-1">{profLabel}</label>
            <input
              type="text"
              placeholder="Dr. Nome"
              value={eventFormData.professional_name}
              onChange={e =>
                setEventFormData(prev => ({ ...prev, professional_name: e.target.value }))
              }
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
            />
          </div>
        </div>

        {/* EMERGÊNCIA: gravidade */}
        {t_type === 'emergencia' && (
          <div>
            <label className="text-xs text-gray-500 font-medium block mb-1">Gravidade</label>
            <select
              value={eventFormData.severity}
              onChange={e => setEventFormData(prev => ({ ...prev, severity: e.target.value }))}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
            >
              <option value="leve">🟡 Leve</option>
              <option value="moderada">🟠 Moderada</option>
              <option value="grave">🔴 Grave</option>
              <option value="critica">⚫ Crítica</option>
            </select>
          </div>
        )}

        {/* Custo + Próxima data */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs text-gray-500 font-medium block mb-1">Custo (R$)</label>
            <input
              type="number"
              step="0.01"
              min="0"
              placeholder="0,00"
              value={eventFormData.cost}
              onChange={e => setEventFormData(prev => ({ ...prev, cost: e.target.value }))}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
            />
          </div>
          {t_type !== 'emergencia' && t_type !== 'exame_imagem' && (
            <div>
              <label className="text-xs text-gray-500 font-medium block mb-1">{nextLabel}</label>
              <input
                type="date"
                value={eventFormData.next_due_date}
                onChange={e => setEventFormData(prev => ({ ...prev, next_due_date: e.target.value }))}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
              />
            </div>
          )}
        </div>

        {/* CIRURGIA: retorno pós-op */}
        {t_type === 'cirurgia' && (
          <div>
            <label className="text-xs text-gray-500 font-medium block mb-1">
              Retorno pós-operatório
            </label>
            <input
              type="date"
              value={eventFormData.next_due_date}
              onChange={e => setEventFormData(prev => ({ ...prev, next_due_date: e.target.value }))}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
            />
          </div>
        )}

        {/* Anexar documentos */}
        <div>
          <label className="text-xs text-gray-500 font-medium block mb-1">
            📎 Documentos / Laudos (opcional)
          </label>
          <input
            type="file"
            multiple
            accept="image/*,.pdf"
            onChange={e => setAttachDocFiles(Array.from(e.target.files || []))}
            className="w-full text-xs text-gray-500 file:mr-2 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
          />
          {attachDocFiles.length > 0 && (
            <p className="text-xs text-blue-600 mt-1">
              ✓ {attachDocFiles.length} arquivo(s) pronto(s) para enviar com o registro
            </p>
          )}
        </div>

        {/* Botões */}
        <div className="flex gap-2 pt-1">
          <button
            onClick={cancelEventForm}
            className="flex-1 border border-gray-200 text-gray-600 text-sm font-semibold py-2 rounded-xl hover:bg-gray-50 active:scale-95 transition-all"
          >
            {editingEventId ? 'Cancelar' : 'Limpar'}
          </button>
          <button
            disabled={eventSaving || !eventFormData.title.trim() || !eventFormData.scheduled_at}
            onClick={saveEvent}
            className="flex-1 bg-blue-600 text-white text-sm font-bold py-2 rounded-xl hover:bg-blue-700 disabled:opacity-50 active:scale-95 transition-all"
          >
            {eventSaving
              ? 'Salvando...'
              : attachDocFiles.length > 0
                ? `Salvar + enviar ${attachDocFiles.length} doc(s)`
                : 'Salvar'}
          </button>
        </div>
      </div>

      {/* Lista de eventos */}
      {(() => {
        const seenIds = new Set<string>();
        const manualEvents = petEvents.filter(ev => {
          if (ev.source === 'document') return false;
          if (ev.type === 'medicacao' || ev.type === 'medication') return false;
          // Filtro defensivo: ocultar eventos auto-gerados de lembrete de vacina
          if (ev.type === 'vaccine') return false;
          if (seenIds.has(ev.id)) return false;
          seenIds.add(ev.id);
          return true;
        });

        if (eventsLoading)
          return <div className="text-center py-8 text-gray-400 text-sm">Carregando...</div>;

        if (manualEvents.length === 0)
          return (
            <div className="text-center py-10 text-gray-400">
              <div className="text-4xl mb-2">📋</div>
              <p className="text-sm">Nenhum evento registrado</p>
              <p className="text-xs mt-1">
                Use &ldquo;+ Registrar&rdquo; para adicionar consultas, exames e mais
              </p>
            </div>
          );

        return (
          <div className="space-y-2">
            {manualEvents.map(ev => {
              const typeIcons: Record<string, string> = {
                consulta: '🩺',
                retorno: '🔁',
                exame_lab: '🔬',
                exame_imagem: '📷',
                cirurgia: '✂️',
                odonto: '🦷',
                emergencia: '🚨',
                outro: '📝',
                exame: '🔬',
                vacina: '💉',
                banho: '🛁',
                bath: '🛁',
                grooming: '🛁',
                vaccine: '💉',
                vet: '🩺',
                exam: '🔬',
                emergency: '🚨',
                other: '📝',
              };
              const icon = typeIcons[ev.type] || '📝';
              const dateStr = new Intl.DateTimeFormat('pt-BR', {
                day: '2-digit',
                month: 'short',
                year: 'numeric',
              }).format(new Date((ev.scheduled_at || '').replace(' ', 'T')));
              const evDocs = vetHistoryDocs.filter(d => d.event_id === ev.id);
              const badgeCls =
                ev.status === 'completed'
                  ? 'bg-green-100 text-green-700'
                  : 'bg-yellow-100 text-yellow-700';
              const badgeTxt = ev.status === 'completed' ? 'Feito' : 'Pendente';

              return (
                <div key={ev.id} className="bg-white rounded-xl border border-gray-200 p-3">
                  <div className="flex items-start gap-3">
                    <span className="text-2xl leading-none flex-shrink-0 mt-0.5">{icon}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate">{ev.title}</p>
                      <p className="text-xs text-gray-500">
                        {dateStr}
                        {ev.location_name ? ` · ${ev.location_name}` : ''}
                        {ev.professional_name ? ` · ${ev.professional_name}` : ''}
                      </p>
                      {ev.cost != null && (
                        <p className="text-xs text-green-700 font-medium mt-0.5">
                          R$ {Number(ev.cost).toFixed(2)}
                        </p>
                      )}
                      {ev.notes && !ev.notes.startsWith('vaccine_id=') && (
                        <p className="text-xs text-gray-400 mt-0.5 truncate">{ev.notes}</p>
                      )}
                    </div>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${badgeCls}`}
                    >
                      {badgeTxt}
                    </span>
                  </div>
                  <div className="flex gap-2 mt-2 pl-9">
                    {evDocs.length > 0 && (
                      <button
                        onClick={() =>
                          setDocFolderModal({
                            cat: evDocs[0]?.category || 'other',
                            title: ev.title,
                            icon,
                            color: 'blue',
                            docs: evDocs,
                          })
                        }
                        className="flex-1 text-xs font-medium text-indigo-600 border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 rounded-lg py-1.5 transition-colors"
                      >
                        👁️ {evDocs.length === 1 ? '1 Documento' : `${evDocs.length} Documentos`}
                      </button>
                    )}
                    <button
                      onClick={() => openEditEvent(ev)}
                      className="flex-1 text-xs font-medium text-blue-600 border border-blue-200 bg-blue-50 hover:bg-blue-100 rounded-lg py-1.5 transition-colors"
                    >
                      ✏️ Editar
                    </button>
                    <button
                      onClick={() => handleDeleteEvent(ev.id)}
                      className="flex-1 text-xs font-medium text-red-600 border border-red-200 bg-red-50 hover:bg-red-100 rounded-lg py-1.5 transition-colors"
                    >
                      🗑 Excluir
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        );
      })()}
    </div>
  );
}
