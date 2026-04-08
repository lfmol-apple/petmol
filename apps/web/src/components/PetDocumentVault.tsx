'use client';
import { getToken } from '@/lib/auth-token';
import { useState, useEffect, useRef, useMemo } from 'react';
import { AuthenticatedDocumentImage } from '@/components/AuthenticatedDocumentImage';
import { API_BASE_URL } from '@/lib/api';
import { buildDocumentFilename, fetchDocumentBlob } from '@/lib/documentFile';
import { useI18n } from '@/lib/I18nContext';
import { trackV1Metric } from '@/lib/v1Metrics';
import { groupVaultDocumentsByMonth } from '@/components/petDocuments/vaultHelpers';
import type { VaultPetDocument } from '@/components/petDocuments/types';
import { localTodayISO } from '@/lib/localDate';
import type {
  PetDocument,
  BatchDocItem,
  BatchConfirm,
  DiscoveredItem,
  EditingDoc,
  PetDocumentVaultProps,
} from '@/features/documents/types';
import { fmtBytes, fmtDate } from '@/features/documents/utils';
import { loadImageElement, buildPdfFromJpeg, convertImageFileToPdf } from '@/features/documents/fileProcessing';

// ── Establishment Input (local suggestions — sem API externa) ──────────────

const LS_RECENTS_KEY = 'petmol_recent_establishments';

function getRecentEstablishments(): string[] {
  if (typeof window === 'undefined') return [];
  try { return JSON.parse(localStorage.getItem(LS_RECENTS_KEY) || '[]'); } catch { return []; }
}

function saveRecentEstablishment(name: string) {
  if (!name.trim() || typeof window === 'undefined') return;
  try {
    const existing = getRecentEstablishments();
    const updated = [
      name.trim(),
      ...existing.filter((n) => n.toLowerCase() !== name.trim().toLowerCase()),
    ].slice(0, 20);
    localStorage.setItem(LS_RECENTS_KEY, JSON.stringify(updated));
  } catch { /* ignore */ }
}

function EstablishmentInput({
  value,
  onChange,
  historyNames,
  placeholder,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  historyNames: string[];
  placeholder?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const recents = getRecentEstablishments();

  const allNames = [
    ...recents,
    ...historyNames.filter((n) => !recents.some((r) => r.toLowerCase() === n.toLowerCase())),
  ];

  const filtered = value.trim().length === 0
    ? allNames.slice(0, 8)
    : allNames.filter((n) => n.toLowerCase().includes(value.trim().toLowerCase())).slice(0, 8);

  return (
    <div className="relative">
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder={placeholder ?? 'Ex: Clínica VetCenter'}
        className={className}
        autoComplete="off"
      />
      {open && filtered.length > 0 && (
        <ul className="absolute z-50 left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-52 overflow-y-auto">
          {filtered.map((name, i) => {
            const isRecent = recents.some((r) => r.toLowerCase() === name.toLowerCase());
            return (
              <li
                key={i}
                onMouseDown={() => { onChange(name); setOpen(false); }}
                className="px-3 py-2 text-sm hover:bg-blue-50 cursor-pointer border-b border-gray-100 last:border-0 flex items-center gap-2"
              >
                <span>{isRecent ? '🕐' : '🏥'}</span>
                <span className="text-gray-800">{name}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// ── Main component ──────────────────────────────────────────────────────────

export function PetDocumentVault({ petId, onDocsChanged }: PetDocumentVaultProps) {
  const { t } = useI18n();

  const CATEGORY_TABS = [
    { id: 'all',          label: t('doc.cat.all'),           icon: '📁' },
    { id: 'vaccine',      label: t('common.vaccines'),       icon: '💉' },
    { id: 'exam',         label: t('doc.cat.exams'),         icon: '🔬' },
    { id: 'prescription', label: t('doc.cat.prescriptions'), icon: '📋' },
    { id: 'report',       label: t('doc.cat.reports'),       icon: '📄' },
    { id: 'photo',        label: t('doc.cat.photos'),        icon: '📸' },
    { id: 'other',        label: t('doc.cat.others'),        icon: '📎' },
  ];

  const CATEGORY_OPTIONS = [
    { value: 'exam',         label: '🔬 ' + t('upload.type_exam') },
    { value: 'vaccine',      label: '💉 ' + t('common.vaccine') },
    { value: 'prescription', label: '📋 ' + t('upload.type_prescription') },
    { value: 'report',       label: '📄 ' + t('upload.type_report') },
    { value: 'photo',        label: '📸 ' + t('upload.type_photo') },
    { value: 'other',        label: '📎 ' + t('upload.type_other') },
  ];

  const [docs, setDocs] = useState<PetDocument[]>([]);
  const [loading, setLoading] = useState(true);

  // Upload state
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [cameraUploadMode, setCameraUploadMode] = useState<'image' | 'pdf'>('image');

  // Batch confirmation (replaces old per-doc ConfirmItem[])
  const [batchConfirm, setBatchConfirm] = useState<BatchConfirm | null>(null);

  // Per-doc inline editing
  const [editingDoc, setEditingDoc] = useState<EditingDoc | null>(null);

  // Full-screen document viewer
  const [viewerUrl, setViewerUrl] = useState<string | null>(null);   // blob: URL
  const [viewerApiUrl, setViewerApiUrl] = useState<string | null>(null); // API URL (fallback)
  const [viewerMime, setViewerMime] = useState<string>('');
  const [viewerTitle, setViewerTitle] = useState<string>('');
  const [viewerLoading, setViewerLoading] = useState(false);
  const [viewerError, setViewerError] = useState<string | null>(null);
  const [isIOS, setIsIOS] = useState(false);
  const [viewerZoom, setViewerZoom] = useState(1);
  const [viewerDocIndex, setViewerDocIndex] = useState<number>(-1);
  const [viewerEditOpen, setViewerEditOpen] = useState(false);
  const [viewerDeleteOpen, setViewerDeleteOpen] = useState(false);
  const viewerSwipeRef = useRef<{ x: number; y: number } | null>(null);
  // docId → blob URL; lifecycle managed by evictDistantCache + closeViewer
  const viewerBlobCache = useRef<Map<string, string>>(new Map());

  const closeViewer = () => {
    viewerBlobCache.current.forEach(blobUrl => URL.revokeObjectURL(blobUrl));
    viewerBlobCache.current.clear();
    setViewerUrl(null);
    setViewerApiUrl(null);
    setViewerError(null);
    setViewerLoading(false);
    setViewerZoom(1);
    setViewerEditOpen(false);
    setViewerDeleteOpen(false);
  };

  // Add-link state
  const [showLinkForm, setShowLinkForm] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [linkTitle, setLinkTitle] = useState('');
  const [linkCategory, setLinkCategory] = useState('other');
  const [savingLink, setSavingLink] = useState(false);
  const [createTimelineEvent, setCreateTimelineEvent] = useState(true);

  // Import state
  const [showImportForm, setShowImportForm] = useState(false);
  const [importUrl, setImportUrl] = useState('');
  const [importing, setImporting] = useState(false);
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const [discovered, setDiscovered] = useState<DiscoveredItem[]>([]);
  const [selectedDiscover, setSelectedDiscover] = useState<Set<string>>(new Set());
  const [importCategory, setImportCategory] = useState('other');

  // ── Fetch ──────────────────────────────────────────────────────────────

  const fetchDocs = async () => {
    const token = getToken();
    if (!token || !petId) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/pets/${petId}/documents`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        console.log('[PetDocumentVault] docs recebidos:', data.length, data);
        setDocs(Array.isArray(data) ? data : []);
      } else {
        console.error('[PetDocumentVault] erro ao buscar docs:', res.status, await res.text());
      }
    } catch (e) {
      console.error('[PetDocumentVault] fetchDocs exception:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDocs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [petId]);

  useEffect(() => {
    // iPad com Safari desktop UA não inclui 'iPad' — detectar via maxTouchPoints
    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent)
      || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    setIsIOS(ios);
  }, []);

  // ── Filtered docs ─────────────────────────────────────────────────────

  const filtered = docs;
  const groupedDocs = useMemo(
    () => groupVaultDocumentsByMonth(filtered as VaultPetDocument[]),
    [filtered]
  );

  const navigableDocs = useMemo(
    () => docs.filter((d) => !((d.kind === 'link') && !!d.url_masked) && !!d.storage_key),
    [docs]
  );

  // ── Upload ────────────────────────────────────────────────────────────

  const handleUpload = async (files: FileList | File[]) => {
    const token = getToken();
    if (!token || !petId || uploading) return;
    setUploading(true);
    try {
      const form = new FormData();
      Array.from(files).forEach((f) => form.append('files', f));
      form.append('create_timeline_event', createTimelineEvent ? 'true' : 'false');
      const res = await fetch(`${API_BASE_URL}/pets/${petId}/documents/upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      if (res.ok) {
        const data = await res.json();
        trackV1Metric('document_uploaded', {
          pet_id: petId,
          file_count: Array.from(files).length,
          source: 'pet_document_vault',
        });
        await fetchDocs();

        const created: { id: string; title?: string; category?: string; icon?: string; mime_type?: string; document_date?: string; establishment_name?: string }[] = data.created || [];

        // Pick best AI-detected values across the whole batch
        const detectedDate = created.find((d) => d.document_date)?.document_date || null;
        const detectedEstablishment =
          created.find((d) => d.establishment_name)?.establishment_name || null;

        // Always show BatchConfirm so user names & confirms the entire batch at once
        if (created.length > 0) {
          const batchDocs: BatchDocItem[] = created.map((d) => ({
            id: d.id,
            title: d.title || 'Documento',
            category: d.category || 'other',
            icon: d.icon || '📄',
            mime_type: d.mime_type || null,
            customTitle: d.title || 'Documento',
            customCategory: d.category || 'other',
          }));

          setBatchConfirm({
            docs: batchDocs,
            detectedDate,
            detectedEstablishment,
            sharedDate: detectedDate || localTodayISO(),
            sharedEstablishment: detectedEstablishment || '',
            saving: false,
          });
        }

        if (data.errors?.length && !data.zip_extracted) {
          alert(`⚠️ ${data.errors.join('\n')}`);
        }
      } else {
        const err = await res.json().catch(() => ({}));
        alert(err.detail || 'Erro ao enviar arquivo');
      }
    } catch {
      alert('Erro ao enviar arquivo');
    } finally {
      setUploading(false);
    }
  };

  const openCameraPicker = (mode: 'image' | 'pdf') => {
    setCameraUploadMode(mode);
    if (cameraInputRef.current) {
      cameraInputRef.current.value = '';
      cameraInputRef.current.click();
    }
  };

  const handleCameraSelection = async (files: FileList) => {
    if (!files.length) return;
    if (cameraUploadMode === 'image') {
      await handleUpload(files);
      return;
    }

    setUploading(true);
    try {
      const convertedFiles = await Promise.all(
        Array.from(files).map(async (file) => {
          if (file.type === 'application/pdf') return file;
          if (!file.type.startsWith('image/')) return file;
          return convertImageFileToPdf(file);
        })
      );
      await handleUpload(convertedFiles);
    } catch (error) {
      console.error('[PetDocumentVault] erro ao converter foto em PDF:', error);
      alert('Não foi possível converter a foto em PDF. Tente novamente.');
      setUploading(false);
    }
  };

  const handleSaveBatch = async () => {
    if (!batchConfirm) return;
    const token = getToken();
    if (!token) return;
    setBatchConfirm((prev) => prev ? { ...prev, saving: true } : prev);
    try {
      // 1) Bulk apply shared date + establishment to all docs in this batch
      await fetch(`${API_BASE_URL}/pets/${petId}/documents`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          doc_ids: batchConfirm.docs.map((d) => d.id),
          document_date: batchConfirm.sharedDate || null,
          establishment_name: batchConfirm.sharedEstablishment.trim() || null,
        }),
      });
      // 2) Per-doc PATCH for title + category if user changed them
      await Promise.all(
        batchConfirm.docs
          .filter((d) => d.customTitle !== d.title || d.customCategory !== d.category)
          .map((d) =>
            fetch(`${API_BASE_URL}/pets/${petId}/documents/${d.id}`, {
              method: 'PATCH',
              headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({ title: d.customTitle, category: d.customCategory }),
            })
          )
      );
      setBatchConfirm(null);
      if (batchConfirm.sharedEstablishment.trim()) {
        saveRecentEstablishment(batchConfirm.sharedEstablishment.trim());
      }
      await fetchDocs();
      onDocsChanged?.();
    } catch {
      // silent
    } finally {
      setBatchConfirm((prev) => prev ? { ...prev, saving: false } : prev);
    }
  };

  // ── Per-doc inline edit ────────────────────────────────────────────────

  const startEdit = (doc: PetDocument) => {
    setEditingDoc({
      id: doc.id,
      title: doc.title || 'Documento',
      category: doc.category || 'other',
      date: doc.document_date || localTodayISO(),
      establishment: doc.establishment_name || '',
      saving: false,
    });
  };

  const handleSaveEdit = async () => {
    if (!editingDoc) return;
    const token = getToken();
    if (!token) return;
    setEditingDoc((prev) => prev ? { ...prev, saving: true } : prev);
    try {
      const res = await fetch(`${API_BASE_URL}/pets/${petId}/documents/${editingDoc.id}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: editingDoc.title.trim() || null,
          category: editingDoc.category,
          document_date: editingDoc.date || null,
          establishment_name: editingDoc.establishment.trim() || null,
        }),
      });
      if (res.ok) {
        if (editingDoc.establishment.trim()) saveRecentEstablishment(editingDoc.establishment.trim());
        setEditingDoc(null);
        await fetchDocs();
        onDocsChanged?.();
      }
    } catch {
      // silent
    } finally {
      setEditingDoc((prev) => prev ? { ...prev, saving: false } : prev);
    }
  };

  // ── Add link ──────────────────────────────────────────────────────────

  const handleAddLink = async () => {
    const token = getToken();
    if (!token || !linkUrl.trim() || savingLink) return;
    setSavingLink(true);
    try {
      const res = await fetch(`${API_BASE_URL}/pets/${petId}/documents/link`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url: linkUrl.trim(), title: linkTitle.trim() || undefined, category: linkCategory, create_timeline_event: createTimelineEvent }),
      });
      if (res.ok) {
        setShowLinkForm(false);
        setLinkUrl('');
        setLinkTitle('');
        await fetchDocs();
      } else {
        const err = await res.json().catch(() => ({}));
        alert(err.detail || 'Erro ao salvar link');
      }
    } catch {
      alert('Erro ao salvar link');
    } finally {
      setSavingLink(false);
    }
  };

  // ── Import ────────────────────────────────────────────────────────────

  const handleImportLink = async () => {
    const token = getToken();
    if (!token || !importUrl.trim() || importing) return;
    setImporting(true);
    setImportStatus(null);
    setDiscovered([]);
    try {
      const res = await fetch(`${API_BASE_URL}/pets/${petId}/documents/import-link`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url: importUrl.trim(), category: importCategory }),
      });
      const data = await res.json();
      if (!res.ok) {
        setImportStatus(data.detail || 'Erro ao importar');
        return;
      }
      if (data.link_saved) {
        setImportStatus('✅ Salvo como link (download não disponível)');
        await fetchDocs();
      } else if (data.imported?.length > 0) {
        setImportStatus(`✅ ${data.imported.length} arquivo(s) importado(s)`);
        await fetchDocs();
      } else if (data.discovered?.length > 0) {
        setDiscovered(data.discovered);
        setSelectedDiscover(new Set(data.discovered.map((d: DiscoveredItem) => d.url)));
        setImportStatus(`🔍 ${data.discovered.length} arquivo(s) encontrado(s). Selecione para baixar:`);
      } else {
        setImportStatus('⚠️ Nenhum arquivo encontrado no link');
      }
    } catch {
      setImportStatus('Erro de conexão');
    } finally {
      setImporting(false);
    }
  };

  const handleImportItems = async () => {
    const token = getToken();
    if (!token || !selectedDiscover.size || importing) return;
    setImporting(true);
    try {
      const items = discovered
        .filter((d) => selectedDiscover.has(d.url))
        .map((d) => ({ url: d.url, title: d.title }));
      const res = await fetch(`${API_BASE_URL}/pets/${petId}/documents/import-items`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ items, category: importCategory }),
      });
      const data = await res.json();
      if (res.ok) {
        const count = data.imported?.length ?? 0;
        const errs = data.errors?.length ?? 0;
        setImportStatus(`✅ ${count} importado(s)${errs ? `, ${errs} falha(s)` : ''}`);
        setDiscovered([]);
        await fetchDocs();
      } else {
        setImportStatus(data.detail || 'Erro ao importar itens');
      }
    } catch {
      setImportStatus('Erro de conexão');
    } finally {
      setImporting(false);
    }
  };

  // ── Delete ────────────────────────────────────────────────────────────

  const handleDelete = async (docId: string) => {
    if (!confirm('Excluir este documento?')) return;
    const token = getToken();
    if (!token) return;
    const res = await fetch(`${API_BASE_URL}/pets/${petId}/documents/${docId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok || res.status === 204) {
      setDocs((prev) => prev.filter((d) => d.id !== docId));
    }
  };

  const handleDeleteAll = async () => {
    if (!confirm(`Excluir TODOS os ${docs.length} documentos? Esta ação não pode ser desfeita.`)) return;
    const token = getToken();
    if (!token) return;
    const res = await fetch(`${API_BASE_URL}/pets/${petId}/documents`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const data = await res.json();
      setDocs([]);
      alert(`🗑️ ${data.deleted} documento(s) excluído(s).`);
    }
  };

  // ── View ──────────────────────────────────────────────────────────────

  const handleView = async (doc: PetDocument) => {
    if (doc.kind === 'link' && doc.url_masked) {
      alert(`🔗 Link salvo:\n${doc.url_masked}\n\n(URL real ocultada por segurança)`);
      return;
    }
    if (!doc.storage_key) return;

    const apiUrl = `${API_BASE_URL}/pets/${petId}/documents/${doc.id}/file`;

    // Detectar mime
    const mt = doc.mime_type ?? '';
    const nameForExt = doc.storage_key || doc.title || '';
    const ext = nameForExt.split('.').pop()?.toLowerCase() ?? '';
    const imageExts = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'heic', 'heif', 'bmp'];
    const mime = mt.startsWith('image/') || imageExts.includes(ext) ? 'image'
               : mt === 'application/pdf' || ext === 'pdf' ? 'pdf'
               : 'other';

    setViewerDocIndex(navigableDocs.findIndex((d) => d.id === doc.id));
    setViewerTitle(doc.title ?? 'Documento');
    setViewerMime(mime);
    setViewerApiUrl(apiUrl);
    setViewerUrl(null);
    setViewerError(null);
    setViewerZoom(1);

    const popup = isIOS ? window.open('', '_blank', 'noopener,noreferrer') : null;

    setViewerLoading(true);
    try {
      const blob = await fetchDocumentBlob(petId, doc.id, { download: mime === 'other' });
      const blobUrl = URL.createObjectURL(blob);
      viewerBlobCache.current.set(doc.id, blobUrl);
      setViewerUrl(blobUrl);

      if (popup) {
        popup.location.href = blobUrl;
        if (mime === 'other') {
          const fileName = buildDocumentFilename(doc.title ?? 'Documento', doc.mime_type ?? '', doc.storage_key);
          const link = popup.document.createElement('a');
          link.href = blobUrl;
          link.download = fileName;
          popup.document.body.appendChild(link);
          link.click();
        }
        return;
      }

      if (mime === 'other') {
        const fileName = buildDocumentFilename(doc.title ?? 'Documento', doc.mime_type ?? '', doc.storage_key);
        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        link.remove();
      }
    } catch (err: unknown) {
      if (popup) popup.close();
      console.error('[handleView] erro ao baixar arquivo:', err);
      setViewerError('Não foi possível carregar o arquivo.');
    } finally {
      setViewerLoading(false);
    }
  };

  // ── Viewer navigation & prefetch cache ──────────────────────────────

  const prefetchDocBlob = async (doc: PetDocument) => {
    if (viewerBlobCache.current.has(doc.id)) return;
    try {
      const blob = await fetchDocumentBlob(petId, doc.id, { download: false });
      // Guard against race: another navigation may have cached it while we awaited
      if (!viewerBlobCache.current.has(doc.id)) {
        viewerBlobCache.current.set(doc.id, URL.createObjectURL(blob));
      }
    } catch { /* silent — prefetch failure is non-fatal */ }
  };

  const evictDistantCache = (currentId: string, prevId?: string, nextId?: string) => {
    const keep = new Set([currentId, prevId, nextId].filter(Boolean) as string[]);
    viewerBlobCache.current.forEach((blobUrl, docId) => {
      if (!keep.has(docId)) {
        URL.revokeObjectURL(blobUrl);
        viewerBlobCache.current.delete(docId);
      }
    });
  };

  const loadViewerDoc = async (doc: PetDocument, atIndex: number) => {
    const mt = doc.mime_type ?? '';
    const nameForExt = doc.storage_key || doc.title || '';
    const ext = nameForExt.split('.').pop()?.toLowerCase() ?? '';
    const imageExts = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'heic', 'heif', 'bmp'];
    const mime = mt.startsWith('image/') || imageExts.includes(ext) ? 'image'
               : mt === 'application/pdf' || ext === 'pdf' ? 'pdf'
               : 'other';
    setViewerTitle(doc.title ?? 'Documento');
    setViewerMime(mime);
    setViewerError(null);
    setViewerZoom(1);

    const cached = viewerBlobCache.current.get(doc.id);
    if (cached) {
      // Cache hit — instant display, no spinner
      setViewerUrl(cached);
      setViewerLoading(false);
    } else {
      setViewerUrl(null);
      setViewerLoading(true);
      try {
        const blob = await fetchDocumentBlob(petId, doc.id, { download: false });
        const blobUrl = URL.createObjectURL(blob);
        viewerBlobCache.current.set(doc.id, blobUrl);
        setViewerUrl(blobUrl);
      } catch {
        setViewerError('Não foi possível carregar o arquivo.');
      } finally {
        setViewerLoading(false);
      }
    }

    // Prefetch immediate neighbors in background
    const prev = atIndex > 0 ? navigableDocs[atIndex - 1] : null;
    const next = atIndex < navigableDocs.length - 1 ? navigableDocs[atIndex + 1] : null;
    if (prev) void prefetchDocBlob(prev);
    if (next) void prefetchDocBlob(next);

    // Evict anything not in {current, prev, next} to bound memory
    evictDistantCache(doc.id, prev?.id, next?.id);
  };

  const navigateViewer = async (delta: -1 | 1) => {
    const nextIdx = viewerDocIndex + delta;
    if (nextIdx < 0 || nextIdx >= navigableDocs.length) return;
    setViewerDocIndex(nextIdx);
    await loadViewerDoc(navigableDocs[nextIdx], nextIdx);
  };

  // ── Total size ────────────────────────────────────────────────────────

  const totalBytes = docs.reduce((acc, d) => acc + (d.size_bytes ?? 0), 0);

  // ── Render ────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">

      {/* ── FULL-SCREEN DOCUMENT VIEWER ─────────────────────────────── */}
      {(viewerLoading || viewerUrl || viewerError) && (
        <div
          style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            zIndex: 500, backgroundColor: '#000',
            display: 'flex', flexDirection: 'column',
            width: '100dvw', height: '100dvh',
            overflow: 'hidden',
          }}
          onTouchStart={(e) => {
            viewerSwipeRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
          }}
          onTouchEnd={(e) => {
            if (!viewerSwipeRef.current || viewerZoom > 1) { viewerSwipeRef.current = null; return; }
            const dx = e.changedTouches[0].clientX - viewerSwipeRef.current.x;
            const dy = e.changedTouches[0].clientY - viewerSwipeRef.current.y;
            viewerSwipeRef.current = null;
            if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
              void navigateViewer(dx < 0 ? 1 : -1);
            }
          }}
        >
          {/* ── Toolbar ── */}
          <div
            style={{
              flexShrink: 0,
              display: 'flex', alignItems: 'center',
              paddingTop: 'calc(10px + env(safe-area-inset-top))',
              paddingBottom: 10,
              paddingLeft: 'calc(10px + env(safe-area-inset-left))',
              paddingRight: 'calc(10px + env(safe-area-inset-right))',
              background: 'linear-gradient(to bottom, rgba(0,0,0,0.95) 0%, rgba(0,0,0,0.75) 100%)',
              gap: 8,
              minHeight: 'calc(60px + env(safe-area-inset-top))',
              borderBottom: '1px solid rgba(255,255,255,0.07)',
            }}
          >
            {/* Close — leftmost for natural thumb reach */}
            <button
              onClick={closeViewer}
              style={{
                width: 44, height: 44, borderRadius: 12, flexShrink: 0,
                background: 'rgba(255,255,255,0.13)', border: 'none',
                color: '#fff', fontSize: 16, fontWeight: 700,
                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                WebkitTapHighlightColor: 'transparent',
              } as React.CSSProperties}
              aria-label="Fechar"
            >
              ✕
            </button>

            {/* Title */}
            <div style={{ flex: 1, minWidth: 0, paddingLeft: 2 }}>
              <p style={{
                color: '#fff', fontSize: 14, fontWeight: 600, margin: 0,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1.3,
              }}>
                {viewerTitle || (viewerLoading ? 'Carregando…' : 'Documento')}
              </p>
            </div>

            {/* Position indicator */}
            {navigableDocs.length > 1 && viewerDocIndex >= 0 && (
              <span style={{
                color: 'rgba(255,255,255,0.35)', fontSize: 11, flexShrink: 0,
                fontFeatureSettings: '"tnum"', userSelect: 'none',
              } as React.CSSProperties}>
                {viewerDocIndex + 1}<span style={{ opacity: 0.5, margin: '0 1px' }}>/</span>{navigableDocs.length}
              </span>
            )}

            {/* Actions — only when blob ready */}
            {viewerUrl && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>

                {/* Zoom pill — image and PDF only */}
                {(viewerMime === 'image' || viewerMime === 'pdf') && (
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 0,
                    background: 'rgba(255,255,255,0.11)', borderRadius: 12,
                    border: '1px solid rgba(255,255,255,0.1)',
                    overflow: 'hidden',
                  }}>
                    <button
                      onClick={() => setViewerZoom((z) => Math.max(0.75, Number((z - 0.25).toFixed(2))))}
                      style={{
                        width: 38, height: 40, background: 'transparent', border: 'none',
                        color: viewerZoom > 0.75 ? '#fff' : 'rgba(255,255,255,0.3)',
                        fontSize: 19, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        WebkitTapHighlightColor: 'transparent',
                      } as React.CSSProperties}
                      aria-label="Reduzir zoom"
                    >
                      −
                    </button>
                    <span style={{
                      color: 'rgba(255,255,255,0.75)', fontSize: 11, minWidth: 32, textAlign: 'center',
                      fontFeatureSettings: '"tnum"', letterSpacing: -0.2, userSelect: 'none',
                    }}>
                      {Math.round(viewerZoom * 100)}%
                    </span>
                    <button
                      onClick={() => setViewerZoom((z) => Math.min(3, Number((z + 0.25).toFixed(2))))}
                      style={{
                        width: 38, height: 40, background: 'transparent', border: 'none',
                        color: viewerZoom < 3 ? '#fff' : 'rgba(255,255,255,0.3)',
                        fontSize: 19, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        WebkitTapHighlightColor: 'transparent',
                      } as React.CSSProperties}
                      aria-label="Aumentar zoom"
                    >
                      +
                    </button>
                  </div>
                )}

                {/* Download */}
                <a
                  href={viewerUrl}
                  download={viewerTitle || 'documento'}
                  style={{
                    width: 44, height: 44, borderRadius: 12, flexShrink: 0,
                    background: 'rgba(255,255,255,0.13)', color: '#fff', fontSize: 17,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    textDecoration: 'none', WebkitTapHighlightColor: 'transparent',
                  } as React.CSSProperties}
                  onClick={(e) => e.stopPropagation()}
                  aria-label="Baixar"
                  title="Baixar"
                >
                  ↓
                </a>

                {/* Open in new tab */}
                <a
                  href={viewerUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    width: 44, height: 44, borderRadius: 12, flexShrink: 0,
                    background: 'rgba(255,255,255,0.13)', color: '#fff', fontSize: 16,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    textDecoration: 'none', WebkitTapHighlightColor: 'transparent',
                  } as React.CSSProperties}
                  onClick={(e) => e.stopPropagation()}
                  aria-label="Abrir em nova aba"
                  title="Abrir"
                >
                  ↗
                </a>

                {/* Edit */}
                <button
                  onClick={() => {
                    const doc = navigableDocs[viewerDocIndex];
                    if (!doc) return;
                    startEdit(doc);
                    setViewerEditOpen(true);
                  }}
                  style={{
                    width: 44, height: 44, borderRadius: 12, flexShrink: 0,
                    background: 'rgba(255,255,255,0.13)', border: 'none',
                    color: '#fff', fontSize: 16,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
                  } as React.CSSProperties}
                  aria-label="Editar documento"
                  title="Editar"
                >
                  ✏️
                </button>

                {/* Delete */}
                <button
                  onClick={() => setViewerDeleteOpen(true)}
                  style={{
                    width: 44, height: 44, borderRadius: 12, flexShrink: 0,
                    background: 'rgba(220,38,38,0.22)', border: 'none',
                    color: '#fca5a5', fontSize: 16,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
                  } as React.CSSProperties}
                  aria-label="Excluir documento"
                  title="Excluir"
                >
                  🗑️
                </button>
              </div>
            )}
          </div>

          {/* ── Edit bottom sheet ── */}
          {viewerEditOpen && editingDoc && (
            <>
              {/* Backdrop */}
              <div
                onClick={() => setViewerEditOpen(false)}
                style={{
                  position: 'absolute', inset: 0, zIndex: 20,
                  background: 'rgba(0,0,0,0.55)',
                  animation: 'vaultFadeIn 0.18s ease',
                }}
              />
              <style>{`
                @keyframes vaultFadeIn { from { opacity: 0 } to { opacity: 1 } }
                @keyframes vaultSlideUp { from { transform: translateY(100%) } to { transform: translateY(0) } }
              `}</style>
              {/* Sheet */}
              <div
                style={{
                  position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 21,
                  background: '#fff', borderRadius: '20px 20px 0 0',
                  boxShadow: '0 -8px 40px rgba(0,0,0,0.4)',
                  paddingBottom: 'env(safe-area-inset-bottom)',
                  display: 'flex', flexDirection: 'column',
                  maxHeight: '72dvh',
                  animation: 'vaultSlideUp 0.22s cubic-bezier(0.32,0.72,0,1)',
                }}
              >
                {/* Sheet handle */}
                <div style={{ flexShrink: 0, display: 'flex', justifyContent: 'center', padding: '10px 0 4px' }}>
                  <div style={{ width: 36, height: 4, borderRadius: 2, background: 'rgba(0,0,0,0.14)' }} />
                </div>

                {/* Sheet header */}
                <div style={{
                  flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '6px 20px 12px',
                  borderBottom: '1px solid #f0f0f0',
                }}>
                  <p style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#111', letterSpacing: -0.3 }}>
                    Editar documento
                  </p>
                  <button
                    onClick={() => setViewerEditOpen(false)}
                    style={{
                      width: 32, height: 32, borderRadius: 10,
                      background: '#f4f4f5', border: 'none', fontSize: 14, color: '#555',
                      cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      WebkitTapHighlightColor: 'transparent',
                    } as React.CSSProperties}
                  >
                    ✕
                  </button>
                </div>

                {/* Scrollable form body */}
                <div style={{ overflowY: 'auto', flex: 1, padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>

                  {/* Nome */}
                  <div>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#888', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.4 }}>Nome</label>
                    <input
                      type="text"
                      value={editingDoc.title}
                      onChange={(e) => setEditingDoc((p) => p ? { ...p, title: e.target.value } : p)}
                      style={{
                        width: '100%', boxSizing: 'border-box', border: '1.5px solid #e4e4e7',
                        borderRadius: 12, padding: '11px 14px', fontSize: 15, color: '#111',
                        outline: 'none', background: '#fafafa',
                      }}
                    />
                  </div>

                  {/* Categoria */}
                  <div>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#888', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.4 }}>Categoria</label>
                    <select
                      value={editingDoc.category}
                      onChange={(e) => setEditingDoc((p) => p ? { ...p, category: e.target.value } : p)}
                      style={{
                        width: '100%', boxSizing: 'border-box', border: '1.5px solid #e4e4e7',
                        borderRadius: 12, padding: '11px 14px', fontSize: 15, color: '#111',
                        outline: 'none', background: '#fafafa', appearance: 'none',
                      }}
                    >
                      {CATEGORY_OPTIONS.map((c) => (
                        <option key={c.value} value={c.value}>{c.label}</option>
                      ))}
                    </select>
                  </div>

                  {/* Data */}
                  <div>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#888', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.4 }}>📅 Data</label>
                    <input
                      type="date"
                      value={editingDoc.date}
                      onChange={(e) => setEditingDoc((p) => p ? { ...p, date: e.target.value } : p)}
                      style={{
                        width: '100%', boxSizing: 'border-box', border: '1.5px solid #e4e4e7',
                        borderRadius: 12, padding: '11px 14px', fontSize: 15, color: '#111',
                        outline: 'none', background: '#fafafa',
                      }}
                    />
                  </div>

                  {/* Estabelecimento */}
                  <div>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#888', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.4 }}>🏥 Estabelecimento</label>
                    <EstablishmentInput
                      value={editingDoc.establishment}
                      onChange={(v) => setEditingDoc((p) => p ? { ...p, establishment: v } : p)}
                      historyNames={(docs.map((d) => d.establishment_name).filter((v, i, a) => !!v && a.indexOf(v) === i) as string[])}
                      className=""
                      placeholder="Ex: Clínica VetCenter"
                    />
                  </div>
                </div>

                {/* Footer actions */}
                <div style={{
                  flexShrink: 0, display: 'flex', gap: 10, padding: '12px 20px 16px',
                  borderTop: '1px solid #f0f0f0',
                }}>
                  <button
                    onClick={() => setViewerEditOpen(false)}
                    style={{
                      flex: 0, padding: '13px 22px', borderRadius: 14, cursor: 'pointer',
                      background: '#f4f4f5', border: 'none', fontSize: 14, fontWeight: 600, color: '#555',
                      WebkitTapHighlightColor: 'transparent',
                    } as React.CSSProperties}
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={async () => {
                      await handleSaveEdit();
                      setViewerEditOpen(false);
                      // refresh viewer title after save
                      if (editingDoc) setViewerTitle(editingDoc.title.trim() || viewerTitle);
                    }}
                    disabled={editingDoc.saving}
                    style={{
                      flex: 1, padding: '13px 20px', borderRadius: 14, cursor: 'pointer',
                      background: '#0056D2', border: 'none', fontSize: 14, fontWeight: 700, color: '#fff',
                      WebkitTapHighlightColor: 'transparent',
                      opacity: editingDoc.saving ? 0.6 : 1,
                    } as React.CSSProperties}
                  >
                    {editingDoc.saving ? '⏳ Salvando…' : '✓ Salvar'}
                  </button>
                </div>
              </div>
            </>
          )}

          {/* ── Delete confirmation sheet ── */}
          {viewerDeleteOpen && (() => {
            const doc = navigableDocs[viewerDocIndex];
            return (
              <>
                {/* Backdrop */}
                <div
                  onClick={() => setViewerDeleteOpen(false)}
                  style={{
                    position: 'absolute', inset: 0, zIndex: 20,
                    background: 'rgba(0,0,0,0.65)',
                    animation: 'vaultFadeIn 0.18s ease',
                  }}
                />
                {/* Sheet */}
                <div
                  style={{
                    position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 21,
                    background: '#fff', borderRadius: '20px 20px 0 0',
                    boxShadow: '0 -8px 40px rgba(0,0,0,0.45)',
                    paddingBottom: 'env(safe-area-inset-bottom)',
                    display: 'flex', flexDirection: 'column',
                    animation: 'vaultSlideUp 0.22s cubic-bezier(0.32,0.72,0,1)',
                  }}
                >
                  {/* Handle */}
                  <div style={{ flexShrink: 0, display: 'flex', justifyContent: 'center', padding: '10px 0 4px' }}>
                    <div style={{ width: 36, height: 4, borderRadius: 2, background: 'rgba(0,0,0,0.14)' }} />
                  </div>

                  {/* Body */}
                  <div style={{ padding: '12px 24px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {/* Icon */}
                    <div style={{ width: 52, height: 52, borderRadius: 16, background: '#fef2f2', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, marginBottom: 4 }}>
                      🗑️
                    </div>
                    <p style={{ margin: 0, fontSize: 17, fontWeight: 700, color: '#111', letterSpacing: -0.3 }}>
                      Excluir documento?
                    </p>
                    <p style={{ margin: 0, fontSize: 14, color: '#666', lineHeight: 1.5 }}>
                      <strong style={{ color: '#333' }}>&ldquo;{doc?.title || 'Documento'}&rdquo;</strong> será removido permanentemente. Esta ação não pode ser desfeita.
                    </p>
                  </div>

                  {/* Actions */}
                  <div style={{
                    display: 'flex', gap: 10, padding: '0 20px 16px',
                    borderTop: '1px solid #f0f0f0', paddingTop: 12,
                  }}>
                    <button
                      onClick={() => setViewerDeleteOpen(false)}
                      style={{
                        flex: 1, padding: '13px 20px', borderRadius: 14,
                        background: '#f4f4f5', border: 'none',
                        fontSize: 14, fontWeight: 600, color: '#555',
                        cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
                      } as React.CSSProperties}
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={async () => {
                        const docId = navigableDocs[viewerDocIndex]?.id;
                        if (!docId) return;
                        const token = getToken();
                        if (!token) return;
                        const res = await fetch(
                          `${API_BASE_URL}/pets/${petId}/documents/${docId}`,
                          { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } },
                        );
                        if (res.ok || res.status === 204) {
                          setDocs((prev) => prev.filter((d) => d.id !== docId));
                          closeViewer();
                        }
                      }}
                      style={{
                        flex: 1, padding: '13px 20px', borderRadius: 14,
                        background: '#dc2626', border: 'none',
                        fontSize: 14, fontWeight: 700, color: '#fff',
                        cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
                      } as React.CSSProperties}
                    >
                      Excluir
                    </button>
                  </div>
                </div>
              </>
            );
          })()}

          {/* ── Content area ── */}
          <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', position: 'relative', backgroundColor: '#111' }}>

            {/* Navigation arrows */}
            {navigableDocs.length > 1 && viewerZoom <= 1 && (
              <>
                <button
                  onClick={() => { void navigateViewer(-1); }}
                  style={{
                    position: 'absolute', left: 6, top: '50%', transform: 'translateY(-50%)',
                    zIndex: 10, width: 44, height: 72, borderRadius: 12,
                    background: 'rgba(0,0,0,0.38)', border: '1px solid rgba(255,255,255,0.1)',
                    color: '#fff', fontSize: 30,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    cursor: viewerDocIndex <= 0 ? 'default' : 'pointer',
                    opacity: viewerDocIndex <= 0 ? 0 : 0.7,
                    transition: 'opacity 0.2s',
                    pointerEvents: viewerDocIndex <= 0 ? 'none' : 'auto',
                    WebkitTapHighlightColor: 'transparent',
                  } as React.CSSProperties}
                  aria-label="Documento anterior"
                >
                  ‹
                </button>
                <button
                  onClick={() => { void navigateViewer(1); }}
                  style={{
                    position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)',
                    zIndex: 10, width: 44, height: 72, borderRadius: 12,
                    background: 'rgba(0,0,0,0.38)', border: '1px solid rgba(255,255,255,0.1)',
                    color: '#fff', fontSize: 30,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    cursor: viewerDocIndex >= navigableDocs.length - 1 ? 'default' : 'pointer',
                    opacity: viewerDocIndex >= navigableDocs.length - 1 ? 0 : 0.7,
                    transition: 'opacity 0.2s',
                    pointerEvents: viewerDocIndex >= navigableDocs.length - 1 ? 'none' : 'auto',
                    WebkitTapHighlightColor: 'transparent',
                  } as React.CSSProperties}
                  aria-label="Próximo documento"
                >
                  ›
                </button>
              </>
            )}

            {/* Loading */}
            {viewerLoading && (
              <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 20 }}>
                <div style={{
                  width: 52, height: 52,
                  border: '3px solid rgba(255,255,255,0.08)',
                  borderTopColor: 'rgba(255,255,255,0.8)',
                  borderRadius: '50%',
                  animation: 'vaultSpin 0.7s linear infinite',
                }} />
                <style>{`@keyframes vaultSpin { to { transform: rotate(360deg); } }`}</style>
                <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: 14, margin: 0, letterSpacing: 0.1 }}>Carregando documento…</p>
              </div>
            )}

            {/* Error */}
            {!viewerLoading && viewerError && (
              <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, padding: '32px 24px', textAlign: 'center' }}>
                <div style={{
                  width: 72, height: 72, borderRadius: 20, fontSize: 34,
                  background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.2)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  ⚠️
                </div>
                <div style={{ maxWidth: 260 }}>
                  <p style={{ color: '#fff', fontSize: 16, fontWeight: 600, margin: '0 0 8px', letterSpacing: -0.2 }}>
                    Não foi possível carregar
                  </p>
                  <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13, lineHeight: 1.55, margin: 0 }}>
                    {viewerError}
                  </p>
                </div>
                <button
                  onClick={closeViewer}
                  style={{
                    marginTop: 8, padding: '12px 28px', borderRadius: 14, cursor: 'pointer',
                    background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.18)',
                    color: '#fff', fontSize: 14, fontWeight: 600,
                    WebkitTapHighlightColor: 'transparent',
                  } as React.CSSProperties}
                >
                  Fechar
                </button>
              </div>
            )}

            {/* Image — scroll + zoom assistido */}
            {!viewerLoading && !viewerError && viewerMime === 'image' && viewerUrl && (
              <div
                style={{
                  position: 'absolute', inset: 0,
                  overflow: 'auto',
                  WebkitOverflowScrolling: 'touch',
                  overscrollBehavior: 'contain',
                  display: 'flex',
                  alignItems: viewerZoom <= 1 ? 'center' : 'flex-start',
                  justifyContent: viewerZoom <= 1 ? 'center' : 'flex-start',
                  padding: viewerZoom <= 1 ? 16 : 0,
                  backgroundColor: '#000',
                } as React.CSSProperties}
              >
                <img
                  src={viewerUrl}
                  alt={viewerTitle}
                  style={{
                    display: 'block',
                    width: `${viewerZoom * 100}%`,
                    maxWidth: viewerZoom <= 1 ? '100%' : 'none',
                    height: 'auto',
                    objectFit: 'contain',
                    touchAction: 'pan-x pan-y',
                    userSelect: 'none',
                    WebkitUserSelect: 'none',
                    borderRadius: viewerZoom <= 1 ? 8 : 0,
                    transition: 'width 0.2s ease, border-radius 0.15s ease',
                  } as React.CSSProperties}
                  draggable={false}
                />
              </div>
            )}

            {/* PDF — scroll + zoom assistido */}
            {!viewerLoading && !viewerError && viewerMime === 'pdf' && viewerUrl && (
              isIOS ? (
                // iOS: <embed> com URL direta — o WebKit renderiza inline sem abrir nova aba
                <embed
                  src={viewerUrl}
                  type="application/pdf"
                  style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 'none', display: 'block' }}
                />
              ) : (
                // Android / Desktop — iframe com blob funciona bem
                <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column' }}>
                  <div style={{ flex: 1, overflow: 'auto', WebkitOverflowScrolling: 'touch', overscrollBehavior: 'contain', background: '#1a1a1a' } as React.CSSProperties}>
                    <div
                      style={{
                        width: `${viewerZoom * 100}%`,
                        minWidth: '100%',
                        height: '100%',
                        margin: '0 auto',
                        transition: 'width 0.2s ease',
                      }}
                    >
                      <iframe
                        src={viewerUrl}
                        title={viewerTitle}
                        style={{ width: '100%', height: '100%', border: 'none', display: 'block', minHeight: 0 }}
                      />
                    </div>
                  </div>
                  <div style={{
                    flexShrink: 0,
                    padding: '12px 16px',
                    paddingBottom: 'calc(12px + env(safe-area-inset-bottom))',
                    backgroundColor: 'rgba(0,0,0,0.92)',
                    display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'center',
                    borderTop: '1px solid rgba(255,255,255,0.08)',
                  }}>
                    <a
                      href={viewerUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        flex: 1, maxWidth: 240, background: '#2563eb', color: '#fff',
                        fontSize: 14, fontWeight: 700, padding: '13px 20px', borderRadius: 14,
                        textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                        WebkitTapHighlightColor: 'transparent',
                      } as React.CSSProperties}
                    >
                      Abrir no leitor ↗
                    </a>
                    <a
                      href={viewerUrl}
                      download={viewerTitle || 'documento.pdf'}
                      style={{
                        width: 50, height: 50, borderRadius: 14, flexShrink: 0,
                        background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.15)',
                        color: '#fff', fontSize: 20,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        textDecoration: 'none', WebkitTapHighlightColor: 'transparent',
                      } as React.CSSProperties}
                      aria-label="Baixar PDF"
                    >
                      ↓
                    </a>
                  </div>
                </div>
              )
            )}
          </div>
        </div>
      )}

      {/* ── Upload zone ─────────────────────────────────────────────── */}
      <div
        className="border-2 border-dashed border-blue-300 rounded-xl p-4 sm:p-8 bg-blue-50/50 hover:bg-blue-50 transition-colors cursor-pointer group"
        onClick={() => fileInputRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          if (e.dataTransfer.files.length) handleUpload(e.dataTransfer.files);
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*,.pdf,.doc,.docx,.zip"
          className="hidden"
          onChange={(e) => e.target.files && handleUpload(e.target.files)}
        />
        {/* Scanner input – sem capture → iOS mostra "Digitalizar Documentos" */}
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*,application/pdf"
          capture="environment"
          className="hidden"
          onChange={(e) => e.target.files && handleCameraSelection(e.target.files)}
        />
        <div className="text-center pointer-events-none">
          <div className="text-3xl sm:text-5xl mb-2 sm:mb-3 group-hover:scale-110 transition-transform">
            {uploading ? '⏳' : '📤'}
          </div>
          <h3 className="text-sm sm:text-lg font-bold text-gray-800 mb-1">
            {uploading ? 'Enviando…' : 'Upload de Documentos'}
          </h3>
          <p className="text-xs text-gray-600 mb-2 hidden sm:block">Arraste arquivos aqui ou clique para selecionar. Você também pode usar a câmera logo abaixo.</p>
          <div className="flex items-center justify-center gap-2 text-xs text-gray-500 flex-wrap">
            <span>✓ PDF</span>
            <span>✓ Imagens</span>
            <span>✓ ZIP</span>
            <span>✓ Foto pela câmera</span>
            <span>✓ Foto convertida em PDF</span>
            <span>✓ 20MB · ZIP até 100MB</span>
          </div>
        </div>
      </div>

      {/* ── Quick add buttons ────────────────────────────────────────── */}
      <div className="flex gap-2 flex-wrap">
        <button
          onClick={() => openCameraPicker('image')}
          disabled={uploading}
          className="px-4 py-2 bg-[#0056D2] text-white rounded-lg text-sm font-medium hover:bg-[#0047ad] disabled:opacity-50 transition-colors flex items-center gap-2 shadow-sm"
        >
          📷 Abrir câmera e guardar foto
        </button>
        <button
          onClick={() => openCameraPicker('pdf')}
          disabled={uploading}
          className="px-4 py-2 bg-amber-500 text-white rounded-lg text-sm font-medium hover:bg-amber-600 disabled:opacity-50 transition-colors flex items-center gap-2 shadow-sm"
        >
          📄 Transformar foto em PDF
        </button>
        {/* Botões desabilitados — descomentar para reativar:
        <button onClick={() => { setShowLinkForm((v) => !v); setShowImportForm(false); }}
          className="px-4 py-2 bg-indigo-100 text-indigo-700 rounded-lg text-sm font-medium hover:bg-indigo-200 transition-colors flex items-center gap-2">
          Adicionar Link
        </button>
        <button onClick={() => { setShowImportForm((v) => !v); setShowLinkForm(false); }}
          className="px-4 py-2 bg-emerald-100 text-emerald-700 rounded-lg text-sm font-medium hover:bg-emerald-200 transition-colors flex items-center gap-2">
          Importar do Portal
        </button>
        */}
      </div>
      {/* ── BATCH CONFIRM MODAL OVERLAY ──────────────────────────────── */}
      {batchConfirm && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center p-4">
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/60" onClick={() => setBatchConfirm(null)} />

          {/* Sheet */}
          <div className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl flex flex-col max-h-[85dvh]">

            {/* Header */}
            <div className="px-5 pt-4 pb-3 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <span className="text-2xl">📋</span>
                <div className="flex-1">
                  <h4 className="font-bold text-gray-900 text-base">
                    {batchConfirm.docs.length === 1
                      ? 'Confirmar documento'
                      : `Confirmar ${batchConfirm.docs.length} documentos`}
                  </h4>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {batchConfirm.detectedDate || batchConfirm.detectedEstablishment
                      ? '✅ IA preencheu alguns campos — confirme ou corrija.'
                      : 'Preencha data e local válidos para todos os documentos desta entrada.'}
                  </p>
                </div>
              </div>
            </div>

            {/* Scrollable body */}
            <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">

              {/* Shared date + establishment */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-gray-700 mb-1.5 block">
                    📅 Data do atendimento
                    {batchConfirm.detectedDate && (
                      <span className="ml-1 text-green-600 font-normal">(detectada pela IA ✓)</span>
                    )}
                  </label>
                  <input
                    type="date"
                    value={batchConfirm.sharedDate}
                    onChange={(e) =>
                      setBatchConfirm((prev) => prev ? { ...prev, sharedDate: e.target.value } : prev)
                    }
                    className="w-full border-2 border-amber-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 bg-amber-50"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-700 mb-1.5 block">
                    🏥 Estabelecimento
                    {batchConfirm.detectedEstablishment && (
                      <span className="ml-1 text-green-600 font-normal">(detectado pela IA ✓)</span>
                    )}
                  </label>
                  <EstablishmentInput
                    value={batchConfirm.sharedEstablishment}
                    onChange={(v) =>
                      setBatchConfirm((prev) => prev ? { ...prev, sharedEstablishment: v } : prev)
                    }
                    historyNames={(docs.map((d) => d.establishment_name).filter((v, i, a) => !!v && a.indexOf(v) === i) as string[])}
                    placeholder="Ex: Clínica VetCenter"
                    className="w-full border-2 border-amber-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 bg-amber-50"
                  />
                </div>
              </div>

              {/* Per-doc list */}
              <div className="space-y-2">
                <p className="text-xs font-semibold text-gray-600">
                  {batchConfirm.docs.length > 1
                    ? `${batchConfirm.docs.length} documentos — edite nome ou categoria se necessário:`
                    : 'Edite o nome ou categoria se necessário:'}
                </p>
                {batchConfirm.docs.map((item, idx) => (
                  <div key={item.id} className="bg-gray-50 border border-gray-200 rounded-xl p-3">
                    <div className="flex items-center gap-2 text-xs text-gray-500 mb-2">
                      <span>{item.icon}</span>
                      {batchConfirm.docs.length > 1 && (
                        <span className="text-gray-400 shrink-0">#{idx + 1}</span>
                      )}
                    </div>
                    <input
                      type="text"
                      value={item.customTitle}
                      onChange={(e) =>
                        setBatchConfirm((prev) =>
                          prev ? {
                            ...prev,
                            docs: prev.docs.map((d) =>
                              d.id === item.id ? { ...d, customTitle: e.target.value } : d
                            ),
                          } : prev
                        )
                      }
                      placeholder="Nome do documento"
                      className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-amber-300 bg-white"
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Footer actions */}
            <div className="px-5 py-4 border-t border-gray-100 flex gap-3">
              <button
                onClick={() => setBatchConfirm(null)}
                className="px-4 py-3 text-sm text-gray-500 hover:text-gray-700 border border-gray-200 rounded-xl transition-colors flex-shrink-0"
              >
                Pular
              </button>
              <button
                onClick={handleSaveBatch}
                disabled={batchConfirm.saving}
                className="flex-1 py-3 bg-amber-500 text-white rounded-xl text-sm font-bold hover:bg-amber-600 disabled:opacity-50 transition-colors shadow-sm"
              >
                {batchConfirm.saving
                  ? '⏳ Salvando…'
                  : `✓ Salvar ${batchConfirm.docs.length > 1 ? 'todos os documentos' : 'documento'}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Add link form ────────────────────────────────────────────── */}
      {showLinkForm && (
        <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 space-y-3">
          <h4 className="font-bold text-indigo-800 text-sm">🔗 Salvar link externo</h4>
          <input
            type="url"
            placeholder="https://..."
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
          />
          <input
            type="text"
            placeholder="Título (opcional)"
            value={linkTitle}
            onChange={(e) => setLinkTitle(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
          />
          <select
            value={linkCategory}
            onChange={(e) => setLinkCategory(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
          >
            {CATEGORY_OPTIONS.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
          <label className="flex items-center gap-2 text-xs text-indigo-700 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={createTimelineEvent}
              onChange={(e) => setCreateTimelineEvent(e.target.checked)}
              className="rounded accent-indigo-600"
            />
            Registrar na linha do tempo
          </label>
          <div className="flex gap-2">
            <button
              onClick={handleAddLink}
              disabled={!linkUrl.trim() || savingLink}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
              {savingLink ? 'Salvando…' : 'Salvar Link'}
            </button>
            <button
              onClick={() => setShowLinkForm(false)}
              className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200 transition-colors"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* ── Import form ──────────────────────────────────────────────── */}
      {showImportForm && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 space-y-3">
          <h4 className="font-bold text-emerald-800 text-sm">⬇️ Importar do portal veterinário</h4>
          <p className="text-xs text-emerald-700">
            Cole o link do portal (ex: max.cfaz.net). O servidor tentará baixar os arquivos automaticamente.
          </p>
          <input
            type="url"
            placeholder="https://..."
            value={importUrl}
            onChange={(e) => setImportUrl(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
          />
          <select
            value={importCategory}
            onChange={(e) => setImportCategory(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
          >
            {CATEGORY_OPTIONS.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>

          <div className="flex gap-2">
            <button
              onClick={handleImportLink}
              disabled={!importUrl.trim() || importing}
              className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 transition-colors"
            >
              {importing ? 'Importando…' : 'Tentar Importar'}
            </button>
            <button
              onClick={() => { setShowImportForm(false); setDiscovered([]); setImportStatus(null); }}
              className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200 transition-colors"
            >
              Cancelar
            </button>
          </div>

          {importStatus && (
            <p className="text-sm text-emerald-800 bg-emerald-100 rounded-lg px-3 py-2">{importStatus}</p>
          )}

          {/* Discovered items checklist */}
          {discovered.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-emerald-800">Selecione os arquivos para baixar:</span>
                <button
                  onClick={() =>
                    setSelectedDiscover(
                      selectedDiscover.size === discovered.length
                        ? new Set()
                        : new Set(discovered.map((d) => d.url))
                    )
                  }
                  className="text-xs text-emerald-600 underline"
                >
                  {selectedDiscover.size === discovered.length ? 'Desmarcar todos' : 'Marcar todos'}
                </button>
              </div>
              {discovered.map((item) => (
                <label key={item.url} className="flex items-start gap-2 p-2 bg-white rounded-lg border border-emerald-200 cursor-pointer hover:bg-emerald-50 transition-colors">
                  <input
                    type="checkbox"
                    checked={selectedDiscover.has(item.url)}
                    onChange={(e) => {
                      const next = new Set(selectedDiscover);
                      if (e.target.checked) next.add(item.url);
                      else next.delete(item.url);
                      setSelectedDiscover(next);
                    }}
                    className="mt-0.5 accent-emerald-600"
                  />
                  <span className="text-xs text-gray-700 break-all">{item.title}</span>
                </label>
              ))}
              <button
                onClick={handleImportItems}
                disabled={!selectedDiscover.size || importing}
                className="w-full px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 transition-colors"
              >
                {importing ? 'Baixando…' : `⬇️ Baixar ${selectedDiscover.size} arquivo(s)`}
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Documents list ─────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-gray-500">{docs.length} documento{docs.length !== 1 ? 's' : ''}</span>
        {docs.length > 0 && (
          <button
            onClick={handleDeleteAll}
            className="px-3 py-1.5 bg-red-50 text-red-500 rounded-lg text-xs font-medium hover:bg-red-100 transition-colors"
          >
            🗑️ Excluir tudo
          </button>
        )}
      </div>
      <div className="space-y-4">
        {loading && (
          <div className="py-8 text-center text-gray-500 text-sm">⏳ Carregando documentos…</div>
        )}

        {!loading && filtered.length === 0 && (
          <div className="py-8 text-center text-gray-400 text-sm">
            <div className="text-4xl mb-3">📂</div>
            <p>Nenhum documento ainda.</p>
            <p className="mt-1 text-xs">Use o upload ou adicione um link acima.</p>
          </div>
        )}

        {groupedDocs.map(([groupLabel, groupItems]) => (
          <div key={groupLabel} className="space-y-2">
            <div className="sticky top-0 z-10 bg-gray-50/95 backdrop-blur px-2 py-1 rounded-md text-xs font-semibold text-gray-600">
              {groupLabel}
            </div>
            {groupItems.map((doc) => {
          const isEditing = editingDoc?.id === doc.id;

          return (
            <div
              key={doc.id}
              className="bg-white border border-gray-200 rounded-xl p-4 hover:shadow-md transition-all"
            >
              {isEditing && editingDoc ? (
                /* ── Inline edit form ── */
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                    <span>{doc.icon}</span>
                    <span>Editar documento</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div className="sm:col-span-2">
                      <label className="text-xs text-gray-500 mb-1 block">Nome</label>
                      <input
                        type="text"
                        value={editingDoc.title}
                        onChange={(e) => setEditingDoc((p) => p ? { ...p, title: e.target.value } : p)}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">Categoria</label>
                      <select
                        value={editingDoc.category}
                        onChange={(e) => setEditingDoc((p) => p ? { ...p, category: e.target.value } : p)}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                      >
                        {CATEGORY_OPTIONS.map((c) => (
                          <option key={c.value} value={c.value}>{c.label}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">📅 Data</label>
                      <input
                        type="date"
                        value={editingDoc.date}
                        onChange={(e) => setEditingDoc((p) => p ? { ...p, date: e.target.value } : p)}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="text-xs text-gray-500 mb-1 block">🏥 Estabelecimento</label>
                      <EstablishmentInput
                        value={editingDoc.establishment}
                        onChange={(v) => setEditingDoc((p) => p ? { ...p, establishment: v } : p)}
                        historyNames={(docs.map((d) => d.establishment_name).filter((v, i, a) => !!v && a.indexOf(v) === i) as string[])}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                      />
                    </div>
                  </div>
                  <div className="flex gap-2 justify-end">
                    <button
                      onClick={() => setEditingDoc(null)}
                      className="px-3 py-1.5 text-xs text-gray-500 hover:text-gray-700 transition-colors"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={handleSaveEdit}
                      disabled={editingDoc.saving}
                      className="px-4 py-1.5 bg-[#0056D2] text-white rounded-lg text-xs font-medium hover:bg-[#0047ad] disabled:opacity-50 transition-colors"
                    >
                      {editingDoc.saving ? 'Salvando…' : '✓ Salvar'}
                    </button>
                  </div>
                </div>
              ) : (
                /* ── Normal doc card ── */
                <div className="flex items-start gap-3">
                  {/* Thumbnail para imagens / ícone para o resto */}
                  {(() => {
                    const mt = doc.mime_type ?? '';
                    const nameForExt = doc.storage_key || doc.title || '';
                    const ext = nameForExt.split('.').pop()?.toLowerCase() ?? '';
                    const isImg = mt.startsWith('image/') || ['jpg','jpeg','png','webp','gif','heic','heif','bmp'].includes(ext);
                    if (isImg && doc.storage_key) {
                      return (
                        <button
                          type="button"
                          onClick={() => handleView(doc)}
                          className="shrink-0 w-16 h-16 rounded-xl overflow-hidden border border-gray-200 shadow-sm hover:opacity-90 transition-opacity"
                        >
                          <AuthenticatedDocumentImage petId={petId} docId={doc.id} alt={doc.title ?? ''} className="w-full h-full object-cover" loading="lazy" />
                        </button>
                      );
                    }
                    return <div className="text-2xl sm:text-3xl select-none shrink-0">{doc.icon}</div>;
                  })()}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2 mb-1.5">
                      <h4 className="font-bold text-gray-800 text-sm truncate">{doc.title || 'Documento'}</h4>
                      {doc.size_bytes && (
                        <span className="text-xs text-gray-400 whitespace-nowrap shrink-0">{fmtBytes(doc.size_bytes)}</span>
                      )}
                    </div>

                    {/* Date + Establishment row */}
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 mb-2">
                      {doc.document_date && (
                        <span className="text-xs text-gray-500 flex items-center gap-1">
                          📅 {fmtDate(doc.document_date)}
                        </span>
                      )}
                      {doc.establishment_name && (
                        <span className="text-xs text-indigo-600 flex items-center gap-1">
                          🏥 {doc.establishment_name}
                        </span>
                      )}
                      {!doc.document_date && (
                        <span className="text-xs text-amber-500 italic">Sem data — ✏️ Editar</span>
                      )}
                    </div>

                    {doc.url_masked && (
                      <p className="text-xs text-gray-400 truncate mb-2">{doc.url_masked}</p>
                    )}

                    <div className="flex items-center gap-2">
                      {/* Primary action */}
                      {(doc.kind === 'file' || doc.kind === 'link') && (
                        <button
                          onClick={() => handleView(doc)}
                          className="px-4 py-1.5 bg-[#0056D2] text-white rounded-lg text-xs font-semibold hover:bg-[#0047ad] transition-colors shrink-0"
                        >
                          Ver
                        </button>
                      )}

                      {/* Secondary actions — icon-only, muted */}
                      <div className="flex items-center gap-1 ml-auto">
                        <button
                          onClick={() => startEdit(doc)}
                          title="Editar"
                          className="w-7 h-7 flex items-center justify-center rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors text-sm"
                        >
                          ✏️
                        </button>
                        <button
                          onClick={() => handleDelete(doc.id)}
                          title="Excluir"
                          className="w-7 h-7 flex items-center justify-center rounded-md text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors text-sm"
                        >
                          🗑️
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
