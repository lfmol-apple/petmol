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

// ── Types ──────────────────────────────────────────────────────────────────

interface PetDocument {
  id: string;
  pet_id: string;
  kind: 'file' | 'link';
  category: string | null;
  title: string | null;
  document_date: string | null;
  establishment_name: string | null;
  notes: string | null;
  source: string;
  url_masked: string | null;
  storage_key: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  created_at: string;
  icon: string;
}

interface BatchDocItem {
  id: string;
  title: string;
  category: string;
  icon: string;
  mime_type: string | null;
  customTitle: string;
  customCategory: string;
}

interface BatchConfirm {
  docs: BatchDocItem[];
  detectedDate: string | null;
  detectedEstablishment: string | null;
  sharedDate: string;
  sharedEstablishment: string;
  saving: boolean;
}

interface DiscoveredItem {
  url: string;
  url_masked: string;
  title: string;
}

interface EditingDoc {
  id: string;
  title: string;
  category: string;
  date: string;
  establishment: string;
  saving: boolean;
}

interface Props {
  petId: string;
  onDocsChanged?: () => void;
}


function fmtBytes(n: number | null): string {
  if (!n) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function fmtDate(s: string | null): string {
  if (!s) return '';
  try {
    return new Date(s).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return s;
  }
}

function replaceFileExtension(fileName: string, ext: string): string {
  const base = fileName.replace(/\.[^/.]+$/, '');
  return `${base || 'documento'}${ext}`;
}

async function loadImageElement(file: File): Promise<HTMLImageElement> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.decoding = 'async';
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('Falha ao carregar a imagem.'));
      image.src = objectUrl;
    });
    return image;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function buildPdfFromJpeg(jpegBytes: Uint8Array, widthPx: number, heightPx: number): Uint8Array {
  const pageWidth = 595.28;
  const pageHeight = 841.89;
  const margin = 24;

  const widthPt = widthPx * 0.75;
  const heightPt = heightPx * 0.75;
  const scale = Math.min(
    (pageWidth - margin * 2) / widthPt,
    (pageHeight - margin * 2) / heightPt,
    1
  );

  const drawWidth = Math.max(1, widthPt * scale);
  const drawHeight = Math.max(1, heightPt * scale);
  const offsetX = (pageWidth - drawWidth) / 2;
  const offsetY = (pageHeight - drawHeight) / 2;
  const content = `q\n${drawWidth.toFixed(2)} 0 0 ${drawHeight.toFixed(2)} ${offsetX.toFixed(2)} ${offsetY.toFixed(2)} cm\n/Im0 Do\nQ`;

  const encoder = new TextEncoder();
  const parts: Uint8Array[] = [];
  let totalLength = 0;

  const pushText = (text: string) => {
    const bytes = encoder.encode(text);
    parts.push(bytes);
    totalLength += bytes.length;
  };

  const pushBytes = (bytes: Uint8Array) => {
    parts.push(bytes);
    totalLength += bytes.length;
  };

  const offsets: number[] = [0];
  let currentOffset = 0;
  const markObject = () => {
    offsets.push(currentOffset);
  };

  const addPart = (text: string) => {
    pushText(text);
    currentOffset = totalLength;
  };

  addPart('%PDF-1.4\n%\xFF\xFF\xFF\xFF\n');

  markObject();
  addPart('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');

  markObject();
  addPart('2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n');

  markObject();
  addPart(
    `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth.toFixed(2)} ${pageHeight.toFixed(2)}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>\nendobj\n`
  );

  markObject();
  addPart(
    `4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${widthPx} /Height ${heightPx} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpegBytes.length} >>\nstream\n`
  );
  pushBytes(jpegBytes);
  currentOffset = totalLength;
  addPart('\nendstream\nendobj\n');

  markObject();
  addPart(`5 0 obj\n<< /Length ${content.length} >>\nstream\n${content}\nendstream\nendobj\n`);

  const xrefOffset = totalLength;
  addPart(`xref\n0 ${offsets.length}\n`);
  addPart('0000000000 65535 f \n');
  for (let index = 1; index < offsets.length; index += 1) {
    addPart(`${String(offsets[index]).padStart(10, '0')} 00000 n \n`);
  }
  addPart(`trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`);

  const pdf = new Uint8Array(totalLength);
  let cursor = 0;
  for (const part of parts) {
    pdf.set(part, cursor);
    cursor += part.length;
  }
  return pdf;
}

async function convertImageFileToPdf(file: File): Promise<File> {
  const image = await loadImageElement(file);
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth || image.width;
  canvas.height = image.naturalHeight || image.height;

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Não foi possível preparar a imagem para PDF.');

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

  const jpegBlob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Não foi possível gerar o PDF da foto.'));
    }, 'image/jpeg', 0.92);
  });

  const jpegBytes = new Uint8Array(await jpegBlob.arrayBuffer());
  const pdfBytes = buildPdfFromJpeg(jpegBytes, canvas.width, canvas.height);
  const pdfBuffer = new ArrayBuffer(pdfBytes.byteLength);
  new Uint8Array(pdfBuffer).set(pdfBytes);
  return new File([pdfBuffer], replaceFileExtension(file.name, '.pdf'), {
    type: 'application/pdf',
    lastModified: Date.now(),
  });
}

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

export function PetDocumentVault({ petId, onDocsChanged }: Props) {
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

  const closeViewer = () => {
    if (viewerUrl && viewerUrl.startsWith('blob:')) URL.revokeObjectURL(viewerUrl);
    setViewerUrl(null);
    setViewerApiUrl(null);
    setViewerError(null);
    setViewerLoading(false);
    setViewerZoom(1);
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
            /* dvh garante que respeita a barra dinâmica do Safari iOS */
            width: '100dvw', height: '100dvh',
            overflow: 'hidden',
            paddingTop: 'env(safe-area-inset-top)',
            paddingBottom: 'env(safe-area-inset-bottom)',
            paddingLeft: 'env(safe-area-inset-left)',
            paddingRight: 'env(safe-area-inset-right)',
          }}
        >
          {/* ── Toolbar ── */}
          <div
            style={{
              flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '12px 16px',
              backgroundColor: 'rgba(0,0,0,0.90)',
              gap: 10,
              minHeight: 56,
            }}
          >
            <span style={{ color: '#fff', fontSize: 14, fontWeight: 600, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginRight: 8 }}>
              {viewerTitle || 'Carregando...'}
            </span>
            {/* Abrir/Download só ficam disponíveis quando o blob está pronto */}
            {viewerUrl && (
              <>
                {(viewerMime === 'image' || viewerMime === 'pdf') && (
                  <>
                    <button
                      onClick={() => setViewerZoom((z) => Math.max(0.75, Number((z - 0.25).toFixed(2))))}
                      style={{ color: '#fff', fontSize: 13, border: '1px solid rgba(255,255,255,0.4)', borderRadius: 10, padding: '7px 12px', background: 'rgba(255,255,255,0.15)', whiteSpace: 'nowrap', flexShrink: 0 }}
                    >
                      －
                    </button>
                    <span style={{ color: 'rgba(255,255,255,0.9)', fontSize: 12, minWidth: 46, textAlign: 'center' }}>
                      {Math.round(viewerZoom * 100)}%
                    </span>
                    <button
                      onClick={() => setViewerZoom((z) => Math.min(3, Number((z + 0.25).toFixed(2))))}
                      style={{ color: '#fff', fontSize: 13, border: '1px solid rgba(255,255,255,0.4)', borderRadius: 10, padding: '7px 12px', background: 'rgba(255,255,255,0.15)', whiteSpace: 'nowrap', flexShrink: 0 }}
                    >
                      ＋
                    </button>
                  </>
                )}
                <a
                  href={viewerUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: '#fff', fontSize: 13, border: '1px solid rgba(255,255,255,0.4)', borderRadius: 10, padding: '7px 14px', background: 'rgba(255,255,255,0.15)', textDecoration: 'none', whiteSpace: 'nowrap', flexShrink: 0, fontWeight: 600 }}
                  onClick={(e) => e.stopPropagation()}
                >
                  ↗ Abrir
                </a>
                <a
                  href={viewerUrl}
                  download={viewerTitle || 'documento'}
                  style={{ color: '#fff', fontSize: 13, border: '1px solid rgba(255,255,255,0.4)', borderRadius: 10, padding: '7px 12px', background: 'rgba(255,255,255,0.15)', textDecoration: 'none', whiteSpace: 'nowrap', flexShrink: 0 }}
                  onClick={(e) => e.stopPropagation()}
                >
                  ⬇️
                </a>
              </>
            )}
            <button
              onClick={closeViewer}
              style={{ width: 38, height: 38, borderRadius: '50%', background: 'rgba(255,255,255,0.2)', border: 'none', color: '#fff', fontSize: 20, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
            >
              ✕
            </button>
          </div>

          {/* ── Content area ── */}
          <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', position: 'relative', backgroundColor: '#111' }}>

            {/* Loading spinner */}
            {viewerLoading && (
              <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
                <div style={{
                  width: 48, height: 48, border: '4px solid rgba(255,255,255,0.2)',
                  borderTopColor: '#fff', borderRadius: '50%',
                  animation: 'spin 0.8s linear infinite',
                }} />
                <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 14 }}>Carregando documento...</p>
              </div>
            )}

            {/* Error state */}
            {!viewerLoading && viewerError && (
              <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, padding: 32, textAlign: 'center' }}>
                <span style={{ fontSize: 56 }}>⚠️</span>
                <p style={{ color: 'rgba(255,255,255,0.85)', fontSize: 15, lineHeight: 1.5 }}>{viewerError}</p>
              </div>
            )}

            {/* Image — scroll interno + zoom assistido */}
            {!viewerLoading && !viewerError && viewerMime === 'image' && viewerUrl && (
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  overflow: 'auto',
                  WebkitOverflowScrolling: 'touch',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: 12,
                  backgroundColor: '#000',
                }}
              >
                <img
                  src={viewerUrl}
                  alt={viewerTitle}
                  style={{
                    display: 'block',
                    width: `${viewerZoom * 100}%`,
                    maxWidth: `${viewerZoom * 100}%`,
                    height: 'auto',
                    objectFit: 'contain',
                    touchAction: 'pinch-zoom',
                    userSelect: 'none',
                  }}
                />
              </div>
            )}

            {/* PDF — scroll interno + zoom assistido */}
            {!viewerLoading && !viewerError && viewerMime === 'pdf' && viewerUrl && (
              isIOS ? (
                // iOS: <embed> com URL direta — o WebKit renderiza inline fit-to-width sem abrir nova aba
                <embed
                  src={viewerUrl}
                  type="application/pdf"
                  style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 'none', display: 'block' }}
                />
              ) : (
                // Android / Desktop — iframe com blob funciona bem
                <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column' }}>
                  <div style={{ flex: 1, overflow: 'auto', WebkitOverflowScrolling: 'touch', background: '#1a1a1a' }}>
                    <div
                      style={{
                        width: `${viewerZoom * 100}%`,
                        minWidth: '100%',
                        height: '100%',
                        margin: '0 auto',
                      }}
                    >
                      <iframe
                        src={viewerUrl}
                        title={viewerTitle}
                        style={{ width: '100%', height: '100%', border: 'none', display: 'block', minHeight: 0 }}
                      />
                    </div>
                  </div>
                  <div style={{ flexShrink: 0, padding: '8px 16px', backgroundColor: 'rgba(0,0,0,0.85)', display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'center' }}>
                    <a href={viewerUrl} target="_blank" rel="noopener noreferrer"
                      style={{ background: '#2563eb', color: '#fff', fontSize: 14, fontWeight: 700, padding: '9px 22px', borderRadius: 10, textDecoration: 'none' }}>
                      Abrir no leitor ↗
                    </a>
                    <a href={viewerUrl} download={viewerTitle || 'documento.pdf'}
                      style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13, textDecoration: 'underline' }}>
                      Baixar
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

                    <div className="flex flex-wrap gap-2">
                      {(doc.kind === 'file' || doc.kind === 'link') && (
                        <button
                          onClick={() => handleView(doc)}
                          className="px-3 py-1.5 bg-[#0056D2] text-white rounded-lg text-xs font-medium hover:bg-[#0047ad] transition-colors"
                        >
                          👁️ Ver
                        </button>
                      )}
                      <button
                        onClick={() => startEdit(doc)}
                        className="px-3 py-1.5 bg-gray-100 text-gray-600 rounded-lg text-xs font-medium hover:bg-gray-200 transition-colors"
                      >
                        ✏️ Editar
                      </button>
                      <button
                        onClick={() => handleDelete(doc.id)}
                        className="px-3 py-1.5 bg-red-50 text-red-600 rounded-lg text-xs font-medium hover:bg-red-100 transition-colors"
                      >
                        🗑️ Excluir
                      </button>
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
