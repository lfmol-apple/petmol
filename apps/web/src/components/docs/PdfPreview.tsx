'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

// Worker via CDN — evita complicações com webpack/SSR no Next.js
pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

interface PdfPreviewProps {
  fileUrl: string;
  downloadUrl?: string;
  onError?: (msg: string) => void;
}

export function PdfPreview({ fileUrl, downloadUrl, onError }: PdfPreviewProps) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [numPages, setNumPages] = useState<number>(0);
  const [pageNumber, setPageNumber] = useState(1);
  const [containerWidth, setContainerWidth] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  // Medir largura do container com ResizeObserver
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = Math.floor(entry.contentRect.width);
        if (w > 0) setContainerWidth(w);
      }
    });
    ro.observe(el);
    // valor inicial imediato
    const w = Math.floor(el.clientWidth);
    if (w > 0) setContainerWidth(w);
    return () => ro.disconnect();
  }, []);

  // Carregar PDF como blob + objectURL
  useEffect(() => {
    let aborted = false;
    let createdUrl: string | null = null;

    setLoading(true);
    setError(null);
    setObjectUrl(null);
    setPageNumber(1);
    setNumPages(0);

    fetch(fileUrl)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.blob();
      })
      .then((blob) => {
        if (aborted) return;
        createdUrl = URL.createObjectURL(blob);
        setObjectUrl(createdUrl);
      })
      .catch(() => {
        if (!aborted) {
          const msg = 'Não foi possível carregar o PDF';
          setError(msg);
          onError?.(msg);
        }
      })
      .finally(() => {
        if (!aborted) setLoading(false);
      });

    return () => {
      aborted = true;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
      setObjectUrl(null);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileUrl]);

  // Loading state
  if (loading) {
    return (
      <div style={{
        position: 'absolute', inset: 0,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: 14,
      }}>
        <div style={{
          width: 40, height: 40,
          border: '4px solid rgba(255,255,255,0.12)',
          borderTopColor: '#818cf8',
          borderRadius: '50%',
          animation: 'pdfSpin 0.8s linear infinite',
        }} />
        <style>{`@keyframes pdfSpin { to { transform: rotate(360deg); } }`}</style>
        <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: 14, margin: 0 }}>Carregando PDF…</p>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div style={{
        position: 'absolute', inset: 0,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        gap: 16, padding: 32, textAlign: 'center',
      }}>
        <span style={{ fontSize: 44 }}>⚠️</span>
        <p style={{ color: 'rgba(255,255,255,0.75)', fontSize: 14, margin: 0, lineHeight: 1.5 }}>{error}</p>
        {downloadUrl && (
          <a
            href={downloadUrl}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              background: '#4f46e5', color: 'white', fontWeight: 700, fontSize: 14,
              padding: '12px 24px', borderRadius: 12, textDecoration: 'none',
            }}
          >
            ↓ Baixar PDF
          </a>
        )}
      </div>
    );
  }

  return (
    /* Container principal — scrollável verticalmente, sem overflow horizontal */
    <div
      ref={containerRef}
      style={{
        position: 'absolute', inset: 0,
        overflowY: 'auto',
        overflowX: 'hidden',
        backgroundColor: '#1c1c1e',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
      }}
    >
      {objectUrl && containerWidth > 0 && (
        <Document
          file={objectUrl}
          onLoadSuccess={({ numPages: n }) => setNumPages(n)}
          onLoadError={() => {
            const msg = 'Erro ao decodificar o PDF';
            setError(msg);
            onError?.(msg);
          }}
          loading={null}
        >
          <Page
            pageNumber={pageNumber}
            width={containerWidth}
            renderTextLayer={false}
            renderAnnotationLayer={false}
          />
        </Document>
      )}

      {/* Paginação — fixa na parte inferior quando há múltiplas páginas */}
      {numPages > 1 && (
        <div style={{
          flexShrink: 0, width: '100%',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16,
          padding: '12px 16px',
          background: 'rgba(0,0,0,0.82)',
          position: 'sticky', bottom: 0,
          borderTop: '1px solid rgba(255,255,255,0.08)',
        }}>
          <button
            onClick={() => setPageNumber((p) => Math.max(1, p - 1))}
            disabled={pageNumber <= 1}
            style={{
              padding: '9px 20px', borderRadius: 10, border: 'none',
              background: pageNumber <= 1 ? 'rgba(255,255,255,0.06)' : '#4f46e5',
              color: 'white', fontWeight: 700, fontSize: 14,
              cursor: pageNumber <= 1 ? 'default' : 'pointer',
              opacity: pageNumber <= 1 ? 0.35 : 1,
              touchAction: 'manipulation',
            }}
          >
            ‹ Anterior
          </button>
          <span style={{ color: 'rgba(255,255,255,0.55)', fontSize: 14, fontVariantNumeric: 'tabular-nums' }}>
            {pageNumber} / {numPages}
          </span>
          <button
            onClick={() => setPageNumber((p) => Math.min(numPages, p + 1))}
            disabled={pageNumber >= numPages}
            style={{
              padding: '9px 20px', borderRadius: 10, border: 'none',
              background: pageNumber >= numPages ? 'rgba(255,255,255,0.06)' : '#4f46e5',
              color: 'white', fontWeight: 700, fontSize: 14,
              cursor: pageNumber >= numPages ? 'default' : 'pointer',
              opacity: pageNumber >= numPages ? 0.35 : 1,
              touchAction: 'manipulation',
            }}
          >
            Próxima ›
          </button>
        </div>
      )}
    </div>
  );
}
