'use client';

import { PetDocumentVault } from '@/components/PetDocumentVault';
import type { DocFolderModalState, VetHistoryDocument } from '@/lib/types/homeForms';
import { ModalPortal } from '@/components/ModalPortal';

interface HistoryDocumentFolderModalProps {
  petId: string | null;
  docFolderModal: Exclude<DocFolderModalState, null>;
  onClose: () => void;
  onDeleteAll: () => void;
  onOpenViewer: (doc: VetHistoryDocument) => void;
  onDeleteDocument: (docId: string, docTitle: string) => void;
  onDocsChanged?: () => void;
}

export function HistoryDocumentFolderModal({
  petId,
  docFolderModal,
  onClose,
  onDeleteAll,
  onOpenViewer,
  onDeleteDocument,
  onDocsChanged,
}: HistoryDocumentFolderModalProps) {
  const folderColors: Record<string, { bg: string; header: string }> = {
    blue: { bg: 'bg-blue-100', header: 'from-[#0056D2] to-[#0047ad]' },
    green: { bg: 'bg-green-100', header: 'from-green-600 to-green-700' },
    purple: { bg: 'bg-purple-100', header: 'from-purple-600 to-purple-700' },
    indigo: { bg: 'bg-indigo-100', header: 'from-indigo-600 to-indigo-700' },
    pink: { bg: 'bg-pink-100', header: 'from-pink-600 to-pink-700' },
    gray: { bg: 'bg-gray-100', header: 'from-gray-600 to-gray-700' },
    amber: { bg: 'bg-amber-100', header: 'from-amber-600 to-amber-700' },
  };

  const palette = folderColors[docFolderModal.color] || folderColors.blue;

  return (
    <ModalPortal>
    <div className="fixed inset-0 bg-black bg-opacity-70 flex flex-col items-center justify-center p-4 z-[190]">
      <div className="w-full max-w-lg max-h-[92dvh] flex flex-col overflow-hidden bg-white/95 backdrop-blur-xl rounded-[32px] shadow-premium border border-white/60">
        <div className={`flex items-center justify-between px-4 py-3 bg-gradient-to-r ${palette.header} text-white rounded-t-2xl flex-shrink-0`}>
          <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
            <span className="text-2xl flex-shrink-0">{docFolderModal.icon}</span>
            <div className="min-w-0">
              <p className="font-bold text-sm sm:text-lg leading-tight truncate">{docFolderModal.title}</p>
              <p className="text-white/70 text-xs">{docFolderModal.docs.length} {docFolderModal.docs.length === 1 ? 'arquivo' : 'arquivos'}</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
            <button
              onClick={onDeleteAll}
              className="flex items-center gap-1 px-2 sm:px-3 py-1.5 bg-red-500/80 hover:bg-red-500 active:bg-red-600 text-white rounded-lg text-xs font-semibold transition-colors"
              style={{ touchAction: 'manipulation' }}
            >
              🗑️ <span className="hidden sm:inline">Excluir todos</span><span className="sm:hidden">Excluir</span>
            </button>
            <button
              onClick={onClose}
              className="w-8 h-8 sm:w-9 sm:h-9 flex items-center justify-center bg-white/20 hover:bg-white/30 rounded-lg text-lg transition-colors"
              style={{ touchAction: 'manipulation' }}
            >
              ✕
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {petId ? (
            <PetDocumentVault
              petId={petId}
              eventId={docFolderModal.docs[0]?.event_id ?? null}
              onDocsChanged={onDocsChanged}
            />
          ) : (
            <div className="py-12 text-center text-gray-400 text-sm">Pet não identificado</div>
          )}
        </div>
      </div>
    </div>
    </ModalPortal>
  );
}