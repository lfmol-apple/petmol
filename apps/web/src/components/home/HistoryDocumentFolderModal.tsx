'use client';

import { AuthenticatedDocumentImage } from '@/components/AuthenticatedDocumentImage';
import type { DocFolderModalState, VetHistoryDocument } from '@/lib/types/homeForms';
import { ModalPortal } from '@/components/ModalPortal';

interface HistoryDocumentFolderModalProps {
  petId: string | null;
  docFolderModal: Exclude<DocFolderModalState, null>;
  onClose: () => void;
  onDeleteAll: () => void;
  onOpenViewer: (doc: VetHistoryDocument) => void;
  onDeleteDocument: (docId: string, docTitle: string) => void;
}

export function HistoryDocumentFolderModal({
  petId,
  docFolderModal,
  onClose,
  onDeleteAll,
  onOpenViewer,
  onDeleteDocument,
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
      <div className="bg-white w-full rounded-2xl max-w-lg max-h-[92dvh] flex flex-col overflow-hidden shadow-2xl">
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

        <div className="flex-1 overflow-y-auto divide-y divide-gray-100">
          {docFolderModal.docs.length === 0 ? (
            <div className="py-12 text-center text-gray-400 text-sm">Nenhum arquivo</div>
          ) : (
            docFolderModal.docs.map((doc, index) => {
              const docDate = doc.document_date || doc.created_at?.split('T')[0];
              const isImg = doc.mime_type?.startsWith('image/');
              const isPdf = doc.mime_type === 'application/pdf';

              return (
                <div key={doc.id ?? index} className="flex items-center gap-4 px-5 py-4 hover:bg-gray-50 transition-colors">
                  <div className={`w-14 h-14 rounded-lg ${palette.bg} flex items-center justify-center flex-shrink-0 overflow-hidden border border-gray-200`}>
                    {isImg && doc.storage_key && doc.id && petId ? (
                      <AuthenticatedDocumentImage
                        petId={petId}
                        docId={doc.id}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <span className="text-2xl">{isPdf ? '📵' : docFolderModal.icon}</span>
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 text-sm truncate">{doc.title || 'Documento'}</p>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      {docDate && (
                        <span className="text-xs text-gray-500">📅 {new Date(docDate + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
                      )}
                      {doc.establishment_name && (
                        <span className="text-xs text-indigo-600 truncate max-w-[140px]">🏥 {doc.establishment_name}</span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {doc.storage_key && doc.id && doc.mime_type && (
                      <button
                        onClick={() => onOpenViewer(doc)}
                        className="flex items-center gap-1 px-3 py-2 bg-[#0056D2] hover:bg-[#0047ad] text-white rounded-xl text-xs font-semibold transition-colors shadow-sm"
                      >
                        👁️ Ver
                      </button>
                    )}
                    {doc.id && (
                      <button
                        onClick={() => onDeleteDocument(doc.id!, doc.title || 'Documento')}
                        className="w-9 h-9 flex items-center justify-center bg-red-50 hover:bg-red-100 text-red-500 rounded-xl transition-colors border border-red-100"
                        title="Excluir documento"
                      >
                        🗑️
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
    </ModalPortal>
  );
}