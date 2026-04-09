'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { buildDocumentFilename, fetchDocumentBlob, triggerBrowserDownload } from '@/lib/documentFile';
import { ModalPortal } from '@/components/ModalPortal';

export interface DocPreviewItem {
  docId: string;
  title: string;
  subtitle?: string;
  icon?: string;
  date?: string;
  location?: string | null;
  mimeType: string;
  petId: string;
  storageKey?: string | null;
}

interface DocumentPreviewModalProps {
  doc: DocPreviewItem;
  siblings: DocPreviewItem[];
  siblingIdx: number;
  onClose: () => void;
  onNavigate: (direction: -1 | 1) => void;
}

const tap: React.CSSProperties = {
  touchAction: 'manipulation',
  WebkitTapHighlightColor: 'transparent',
  userSelect: 'none',
  cursor: 'pointer',
} as React.CSSProperties;

function touchDist(t: TouchList) {
  const dx = t[0].clientX - t[1].clientX;
  const dy = t[0].clientY - t[1].clientY;
  return Math.sqrt(dx * dx + dy * dy);
}
function touchMid(t: TouchList) {
  return { x: (t[0].clientX + t[1].clientX) / 2, y: (t[0].clientY + t[1].clientY) / 2 };
}

export function DocumentPreviewModal({
  doc,
  siblings,
  siblingIdx,
  onClose,
  onNavigate,
}: DocumentPreviewModalProps) {
  const [fileBlobUrl, setFileBlobUrl] = useState<string | null>(null);
  const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null);
  const [docLoading, setDocLoading] = useState(false);
  const [docError, setDocError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });

  const overlayRef = useRef<HTMLDivElement>(null);
  const fileBlobRef = useRef<string | null>(null);
  const pdfInnerBlobRef = useRef<string | null>(null);
  const zoomRef = useRef(1);
  const panRef = useRef({ x: 0, y: 0 });
  zoomRef.current = zoom;
  panRef.current = pan;

  const gestureRef = useRef({
    mode: 'idle' as 'idle' | 'pinch' | 'pan',
    startDist: 0, startZoom: 1,
    startPanX: 0, startPanY: 0,
    startMidX: 0, startMidY: 0,
    startX: 0, startY: 0,
  });
  const lastTap = useRef(0);

  const isPdf = doc.mimeType === 'application/pdf';
  const isImg = doc.mimeType?.startsWith('image/');
  const zoomable = isPdf || isImg;
  const canPrev = siblingIdx > 0;
  const canNext = siblingIdx < siblings.length - 1;
  const total = siblings.length;
  const downloadName = buildDocumentFilename(doc.title, doc.mimeType, doc.storageKey);

  const handleDownload = useCallback(() => {
    if (!fileBlobUrl) return;
    triggerBrowserDownload(fileBlobUrl, downloadName);
  }, [downloadName, fileBlobUrl]);

  const handleOpen = useCallback(() => {
    if (!fileBlobUrl) return;
    window.open(fileBlobUrl, '_blank', 'noopener,noreferrer');
  }, [fileBlobUrl]);

  useEffect(() => {
    let cancelled = false;
    setDocLoading(true);
    setDocError(null);
    setFileBlobUrl(prev => { if (prev) URL.revokeObjectURL(prev); return null; });
    setPdfBlobUrl(prev => { if (prev) URL.revokeObjectURL(prev); return null; });
    if (fileBlobRef.current) { URL.revokeObjectURL(fileBlobRef.current); fileBlobRef.current = null; }
    if (pdfInnerBlobRef.current) { URL.revokeObjectURL(pdfInnerBlobRef.current); pdfInnerBlobRef.current = null; }

    fetchDocumentBlob(doc.petId, doc.docId)
      .then((blob) => {
        if (cancelled) return;
        const objectUrl = URL.createObjectURL(blob);
        fileBlobRef.current = objectUrl;
        setFileBlobUrl(objectUrl);

        if (!isPdf) {
          setDocLoading(false);
          return;
        }

        pdfInnerBlobRef.current = objectUrl;
        const html = [
          '<!DOCTYPE html><html><head>',
          '<meta charset="utf-8">',
          '<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">',
          '<style>*{margin:0;padding:0;box-sizing:border-box}html,body{width:100%;height:100%;overflow:hidden;background:#525659}embed{display:block;width:100%;height:100%}</style>',
          '</head><body>',
          `<embed src="${objectUrl}" type="application/pdf" width="100%" height="100%">`,
          '</body></html>',
        ].join('\n');
        const htmlBlob = new Blob([html], { type: 'text/html' });
        setPdfBlobUrl(URL.createObjectURL(htmlBlob));
        setDocLoading(false);
      })
      .catch(() => {
        if (!cancelled) {
          setFileBlobUrl(null);
          setPdfBlobUrl(null);
          setDocError('Não foi possível carregar o documento.');
          setDocLoading(false);
        }
      });

    return () => {
      cancelled = true;
      setFileBlobUrl(prev => { if (prev) URL.revokeObjectURL(prev); return null; });
      setPdfBlobUrl(prev => { if (prev) URL.revokeObjectURL(prev); return null; });
      if (fileBlobRef.current) { URL.revokeObjectURL(fileBlobRef.current); fileBlobRef.current = null; }
      if (pdfInnerBlobRef.current) { URL.revokeObjectURL(pdfInnerBlobRef.current); pdfInnerBlobRef.current = null; }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc.docId, doc.petId, isPdf]);

  useEffect(() => { setZoom(1); setPan({ x: 0, y: 0 }); }, [doc.docId]);

  const resetZoom = useCallback(() => { setZoom(1); setPan({ x: 0, y: 0 }); }, []);
  const bumpZoom = useCallback((delta: number) => {
    setZoom(z => {
      const nz = Math.min(5, Math.max(1, z + delta));
      if (nz <= 1) setPan({ x: 0, y: 0 });
      return nz;
    });
  }, []);

  // Native touch listeners on overlay — only reliable cross-platform approach
  // (iOS Safari: iframe/img capture all touches; React synthetic events on parent don't fire)
  useEffect(() => {
    const el = overlayRef.current;
    if (!el) return;

    const onStart = (e: TouchEvent) => {
      e.preventDefault();
      const t = e.touches;
      const g = gestureRef.current;
      if (t.length === 2) {
        g.mode = 'pinch';
        g.startDist = touchDist(t);
        g.startZoom = zoomRef.current;
        g.startPanX = panRef.current.x;
        g.startPanY = panRef.current.y;
        g.startMidX = touchMid(t).x;
        g.startMidY = touchMid(t).y;
      } else if (t.length === 1) {
        const now = Date.now();
        if (now - lastTap.current < 280) {
          if (zoomRef.current > 1) { setZoom(1); setPan({ x: 0, y: 0 }); }
          else setZoom(2.5);
          lastTap.current = 0;
        } else {
          lastTap.current = now;
        }
        g.mode = 'pan';
        g.startZoom = zoomRef.current;
        g.startPanX = panRef.current.x;
        g.startPanY = panRef.current.y;
        g.startX = t[0].clientX;
        g.startY = t[0].clientY;
      }
    };

    const onMove = (e: TouchEvent) => {
      e.preventDefault();
      const t = e.touches;
      const g = gestureRef.current;
      if (t.length === 2 && g.mode === 'pinch') {
        const ratio = touchDist(t) / g.startDist;
        const nz = Math.min(5, Math.max(1, g.startZoom * ratio));
        const m = touchMid(t);
        setZoom(nz);
        setPan({ x: g.startPanX + (m.x - g.startMidX), y: g.startPanY + (m.y - g.startMidY) });
      } else if (t.length === 1 && g.mode === 'pan' && g.startZoom > 1) {
        setPan({ x: g.startPanX + (t[0].clientX - g.startX), y: g.startPanY + (t[0].clientY - g.startY) });
      }
    };

    const onEnd = () => {
      gestureRef.current.mode = 'idle';
      if (zoomRef.current <= 1) { setZoom(1); setPan({ x: 0, y: 0 }); }
    };

    el.addEventListener('touchstart', onStart, { passive: false });
    el.addEventListener('touchmove', onMove, { passive: false });
    el.addEventListener('touchend', onEnd);
    el.addEventListener('touchcancel', onEnd);
    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onEnd);
      el.removeEventListener('touchcancel', onEnd);
    };
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft' && canPrev) onNavigate(-1);
      if (e.key === 'ArrowRight' && canNext) onNavigate(1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, onNavigate, canPrev, canNext]);

  const formattedDate = doc.date
    ? new Date(doc.date + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })
    : null;

  const zoomBadge = zoom > 1 && (
    <button
      onClick={resetZoom}
      style={{
        ...tap,
        position: 'absolute', bottom: 12, right: 12,
        background: 'rgba(0,0,0,0.65)', color: '#fff',
        border: 'none', borderRadius: 20,
        padding: '4px 12px', fontSize: 12, fontWeight: 600, zIndex: 10,
      }}
    >
      {Math.round(zoom * 100)}% &middot; resetar
    </button>
  );

  return (
    <ModalPortal>
    <div
      className="fixed inset-0 z-[200] flex flex-col bg-slate-900/98 backdrop-blur-3xl"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      {/* HEADER */}
      <div
        className="flex items-center gap-2 px-3 flex-shrink-0 bg-slate-900/60 backdrop-blur-md border-b border-white/10"
        style={{
          paddingTop: 'calc(0.5rem + env(safe-area-inset-top))',
          paddingBottom: '0.5rem',
        }}
      >
        <button onClick={onClose} style={{ ...tap, width: 44, height: 44, borderRadius: 12, background: 'rgba(255,255,255,0.12)', color: '#fff', fontSize: 18, flexShrink: 0, border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          &#10005;
        </button>

        <div className="flex-1 min-w-0">
          <p className="text-white font-semibold text-sm truncate leading-tight">{doc.title}</p>
          {(formattedDate || doc.location) && (
            <p className="text-slate-400 text-xs truncate">{formattedDate}{doc.location ? ` \u00b7 ${doc.location}` : ''}</p>
          )}
        </div>

        {zoomable && (
          <div className="flex gap-1 flex-shrink-0">
            <button onClick={() => bumpZoom(-0.75)} style={{ ...tap, width: 36, height: 36, borderRadius: 10, background: zoom > 1 ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.08)', color: zoom > 1 ? '#fff' : 'rgba(255,255,255,0.3)', fontSize: 18, border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }} title="Reduzir">
              &minus;
            </button>
            <button onClick={() => bumpZoom(0.75)} style={{ ...tap, width: 36, height: 36, borderRadius: 10, background: 'rgba(255,255,255,0.12)', color: '#fff', fontSize: 18, border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }} title="Ampliar">
              +
            </button>
          </div>
        )}

        <button onClick={handleDownload} disabled={!fileBlobUrl} style={{ ...tap, width: 44, height: 44, borderRadius: 12, background: 'rgba(255,255,255,0.12)', color: '#fff', fontSize: 16, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none', border: 'none', opacity: fileBlobUrl ? 1 : 0.5 }} title="Baixar">
          &#11015;&#65039;
        </button>
      </div>

      {/* CONTEUDO */}
      <div className="flex-1 overflow-hidden relative w-full h-full" style={{ minHeight: 0 }}>

        {/* IMAGEM */}
        {isImg && (
          <div style={{ width: '100%', height: '100%', overflow: 'hidden', position: 'relative' }}>
            {fileBlobUrl && (
            <img
              src={fileBlobUrl}
              alt={doc.title}
              style={{
                width: '100%', height: '100%', objectFit: 'contain',
                transform: `scale(${zoom}) translate(${pan.x / zoom}px, ${pan.y / zoom}px)`,
                transformOrigin: 'center center',
                willChange: 'transform',
                transition: zoom === 1 ? 'transform 0.25s ease' : 'none',
                userSelect: 'none', WebkitUserSelect: 'none',
                pointerEvents: 'none',
              } as React.CSSProperties}
              draggable={false}
            />
            )}
            {/* Overlay permanente: intercepta pinch mesmo sobre o img */}
            <div ref={overlayRef} style={{ position: 'absolute', inset: 0, touchAction: 'none', cursor: zoom > 1 ? 'grab' : 'default' }} />
            {zoomBadge}
          </div>
        )}

        {/* PDF loading */}
        {docLoading && (
          <div className="flex flex-col items-center justify-center h-full gap-4">
            <div className="w-10 h-10 border-4 border-white/20 border-t-blue-400 rounded-full animate-spin" />
            <p className="text-slate-400 text-sm">Carregando documento...</p>
          </div>
        )}

        {/* PDF renderizado */}
        {isPdf && !docLoading && pdfBlobUrl && (
          <div style={{ width: '100%', height: '100%', overflow: 'hidden', position: 'relative' }}>
            <iframe
              src={pdfBlobUrl}
              title={doc.title}
              style={{
                position: 'absolute',
                top: 0, left: 0,
                width: '100%',
                height: '100%',
                border: 'none',
                backgroundColor: '#525659',
                transform: `scale(${zoom}) translate(${pan.x / zoom}px, ${pan.y / zoom}px)`,
                transformOrigin: 'center center',
                willChange: 'transform',
                transition: zoom === 1 ? 'transform 0.25s ease' : 'none',
                pointerEvents: 'none',
              }}
            />
            {/* Overlay PERMANENTE sobre o iframe - unica forma de capturar pinch no iOS */}
            <div
              ref={overlayRef}
              style={{ position: 'absolute', inset: 0, touchAction: 'none', cursor: zoom > 1 ? 'grab' : 'default' }}
            />
            {zoomBadge}
            {zoom === 1 && (
              <div style={{ position: 'absolute', bottom: 12, left: '50%', transform: 'translateX(-50%)', background: 'rgba(0,0,0,0.45)', color: 'rgba(255,255,255,0.65)', borderRadius: 20, padding: '3px 10px', fontSize: 11, pointerEvents: 'none', whiteSpace: 'nowrap' }}>
                pinch ou + para ampliar
              </div>
            )}
          </div>
        )}

        {/* PDF sem blob */}
        {isPdf && !docLoading && !pdfBlobUrl && (
          <div className="flex flex-col items-center justify-center h-full gap-5 px-6 text-center">
            <span className="text-7xl">&#128196;</span>
            <p className="text-white font-semibold">{doc.title}</p>
            <p className="text-slate-400 text-sm">{docError || 'N&#227;o foi poss&#237;vel carregar o PDF.'}</p>
            <button onClick={handleOpen} disabled={!fileBlobUrl} style={{ ...tap, textDecoration: 'none', border: 'none' }} className="flex items-center gap-2 px-6 py-3 bg-blue-500 text-white rounded-2xl text-sm font-bold shadow-lg active:opacity-80 disabled:opacity-50">
              &#128194; Abrir PDF
            </button>
          </div>
        )}

        {/* Outro formato */}
        {!isImg && !isPdf && (
          <div className="flex flex-col items-center justify-center h-full gap-4 text-center px-6">
            <span className="text-7xl">{doc.icon || '&#128206;'}</span>
            <p className="text-white font-semibold">{doc.title}</p>
            <p className="text-slate-400 text-sm">Este formato n&#227;o suporta pr&#233;-visualiza&#231;&#227;o.</p>
            <button onClick={handleDownload} disabled={!fileBlobUrl} style={{ ...tap, textDecoration: 'none', border: 'none' }} className="flex items-center gap-2 px-6 py-3 bg-slate-700 text-white rounded-2xl text-sm font-medium active:opacity-80 disabled:opacity-50">
              &#11015;&#65039; Baixar arquivo
            </button>
          </div>
        )}
      </div>

      {/* FOOTER */}
      {total > 1 ? (
        <div className="flex items-center flex-shrink-0 bg-slate-900/60 backdrop-blur-md border-t border-white/10 h-16 sm:h-20">
          <button onClick={() => onNavigate(-1)} disabled={!canPrev} className="w-20 h-full flex items-center justify-center text-4xl disabled:opacity-30 active:scale-95 transition-transform text-white border-none bg-transparent">&#8249;</button>
          <div className="flex-1 flex flex-col items-center justify-center min-w-0 px-2">
            <p className="text-white text-xs sm:text-sm font-semibold truncate max-w-full leading-tight drop-shadow-sm">{doc.title}</p>
            <p className="text-slate-400 text-xs sm:text-[13px] tabular-nums mt-0.5">{siblingIdx + 1} de {total}</p>
          </div>
          <button onClick={() => onNavigate(1)} disabled={!canNext} className="w-20 h-full flex items-center justify-center text-4xl disabled:opacity-30 active:scale-95 transition-transform text-white border-none bg-transparent">&#8250;</button>
        </div>
      ) : (
        <div className="flex items-center justify-center flex-shrink-0 bg-slate-900/60 backdrop-blur-md border-t border-white/10 h-[72px]">
          <button onClick={handleDownload} disabled={!fileBlobUrl} className="flex items-center justify-center gap-2 px-8 py-3 bg-white/10 hover:bg-white/20 rounded-2xl text-sm font-semibold text-white transition-all active:scale-95 border-none disabled:opacity-50">
            &#11015;&#65039; Salvar Arquivo
          </button>
        </div>
      )}
    </div>
    </ModalPortal>
  );
}
