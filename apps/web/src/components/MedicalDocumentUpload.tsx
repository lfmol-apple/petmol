/**
 * MedicalDocumentUpload Component
 *
 * Fluxo leve e direto para upload de documento médico no contexto do pet.
 */

'use client';

import { useCallback, useMemo, useState } from 'react';
import { API_BASE_URL } from '@/lib/api';
import { getToken } from '@/lib/auth-token';
import { UploadResult, validateFile } from '@/lib/upload/uploadUtils';
import { useI18n } from '@/lib/I18nContext';
import { v1HelperTextClass, v1InputClass, v1PrimaryCtaClass, v1SelectionCardActiveClass, v1SelectionCardBaseClass, v1SelectionCardIdleClass, v1SupportCardClass } from '@/lib/v1OnboardingStyles';
import { localTodayISO } from '@/lib/localDate';

interface MedicalDocumentUploadProps {
  petId: string;
  onSuccess: (result: UploadResult, metadata: DocumentMetadata) => void;
  onError?: (error: string) => void;
}

interface DocumentMetadata {
  type: 'exam' | 'vaccine' | 'diagnosis' | 'prescription' | 'other';
  title: string;
  date?: string;
}

export function MedicalDocumentUpload({
  petId,
  onSuccess,
  onError,
}: MedicalDocumentUploadProps) {
  const { t } = useI18n();

  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [showMetadataForm, setShowMetadataForm] = useState(false);

  const [docType, setDocType] = useState<DocumentMetadata['type']>('exam');
  const [docTitle, setDocTitle] = useState('');
  const [docDate, setDocDate] = useState(localTodayISO());
  const [dragActive, setDragActive] = useState(false);

  const documentOptions = useMemo(
    () => [
      { value: 'exam', label: t('upload.type_exam'), icon: '🔬' },
      { value: 'vaccine', label: t('upload.type_vaccine'), icon: '💉' },
      { value: 'diagnosis', label: t('upload.type_diagnosis'), icon: '🏥' },
      { value: 'prescription', label: t('upload.type_prescription'), icon: '💊' },
      { value: 'other', label: t('upload.type_other'), icon: '📋' },
    ],
    [t]
  );

  const inputId = `medical-upload-${petId}`;

  const handleFileSelect = useCallback((selectedFile: File) => {
    const validation = validateFile(selectedFile);
    if (!validation.valid) {
      onError?.(validation.error || t('upload.invalid_file'));
      return;
    }

    setFile(selectedFile);

    if (selectedFile.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (e) => {
        setPreview(e.target?.result as string);
      };
      reader.readAsDataURL(selectedFile);
    } else {
      setPreview(null);
    }

    setShowMetadataForm(true);
    const baseName = selectedFile.name.replace(/\.[^/.]+$/, '');
    setDocTitle(baseName);
  }, [onError]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) {
      handleFileSelect(droppedFile);
    }
  }, [handleFileSelect]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
  }, []);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      handleFileSelect(selectedFile);
    }
  }, [handleFileSelect]);

  const uploadDocument = useCallback(async (selectedFile: File, metadata: DocumentMetadata) => {
    const token = getToken();
    if (!token) {
      throw new Error('Sessão inválida. Faça login novamente.');
    }

    const formData = new FormData();
    formData.append('files', selectedFile);
    formData.append('create_timeline_event', 'false');
    formData.append('category', metadata.type === 'diagnosis' ? 'report' : metadata.type);
    formData.append('title', metadata.title);
    if (metadata.date) formData.append('document_date', metadata.date);

    const response = await new Promise<Record<string, unknown>>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${API_BASE_URL}/pets/${petId}/documents/upload`);
      xhr.withCredentials = true;
      xhr.setRequestHeader('Authorization', `Bearer ${token}`);

      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          setProgress(Math.round((event.loaded / event.total) * 100));
        }
      };

      xhr.onload = () => {
        try {
          const data = xhr.responseText ? JSON.parse(xhr.responseText) : {};
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve(data);
            return;
          }
          reject(new Error(data?.detail || `Erro ${xhr.status}`));
        } catch {
          reject(new Error(`Erro ${xhr.status}`));
        }
      };

      xhr.onerror = () => reject(new Error('Erro de rede ao enviar documento.'));
      xhr.onabort = () => reject(new Error('Upload cancelado.'));
      xhr.send(formData);
    });

    const createdDocs = Array.isArray(response.created) ? response.created as Array<Record<string, unknown>> : [];
    const createdDoc = createdDocs[0];
    if (!createdDoc) {
      throw new Error('O documento foi enviado, mas o servidor não retornou confirmação.');
    }

    const result: UploadResult = {
      s3Key: String(createdDoc.storage_key || createdDoc.id || selectedFile.name),
      publicUrl: `${API_BASE_URL}/pets/${petId}/documents/${String(createdDoc.id)}/file`,
      originalSize: selectedFile.size,
      compressedSize: selectedFile.size,
      mimeType: String(createdDoc.mime_type || selectedFile.type),
    };

    return result;
  }, [petId]);

  const handleUpload = useCallback(async () => {
    if (!file) return;

    setUploading(true);
    setProgress(0);

    try {
      const metadata: DocumentMetadata = {
        type: docType,
        title: docTitle.trim() || file.name,
        date: docDate,
      };

      const result = await uploadDocument(file, metadata);

      onSuccess(result, metadata);

      setFile(null);
      setPreview(null);
      setShowMetadataForm(false);
      setDocTitle('');
      setProgress(0);
      
    } catch (error: unknown) {
      console.error('[Upload] Error:', error);
      onError?.(error instanceof Error ? error.message : t('upload.upload_failed'));
    } finally {
      setUploading(false);
    }
  }, [file, docType, docTitle, docDate, onSuccess, onError]);

  const handleCancel = useCallback(() => {
    setFile(null);
    setPreview(null);
    setShowMetadataForm(false);
    setDocTitle('');
    setProgress(0);
  }, []);

  if (showMetadataForm && file) {
    return (
      <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_24px_60px_rgba(15,23,42,0.08)] sm:p-6">
        <div className={`mb-5 ${v1SupportCardClass}`}>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Documento</p>
          <h3 className="mt-1 text-lg font-bold text-slate-900">Confirme o contexto do arquivo</h3>
          <p className={`mt-2 ${v1HelperTextClass}`}>Um título claro e o tipo do documento já bastam para salvar tudo com menos atrito.</p>
        </div>

        <div className="mb-5">
          <label className="mb-2 block text-sm font-semibold text-slate-700">
            {t('upload.preview')}
          </label>

          {preview ? (
            <img
              src={preview}
              alt={t('upload.preview_alt')}
              className="h-48 w-full rounded-2xl bg-slate-100 object-contain"
            />
          ) : (
            <div className="flex h-48 w-full items-center justify-center rounded-2xl bg-slate-100">
              <div className="text-center">
                <span className="text-6xl">📄</span>
                <p className="mt-2 text-sm text-slate-500">
                  {file.name}
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="mb-5">
          <label className="mb-3 block text-sm font-semibold text-slate-700">
            {t('upload.what_is_this')}
          </label>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {documentOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setDocType(option.value as DocumentMetadata['type'])}
                className={`${v1SelectionCardBaseClass} ${docType === option.value ? v1SelectionCardActiveClass : v1SelectionCardIdleClass}`}
              >
                <span className="text-3xl block mb-2">{option.icon}</span>
                <span className="text-sm font-semibold text-slate-800">
                  {option.label}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="mb-5">
          <label className="mb-2 block text-sm font-semibold text-slate-700">
            {t('upload.title_optional')}
          </label>
          <input
            type="text"
            value={docTitle}
            onChange={(e) => setDocTitle(e.target.value)}
            placeholder={t('upload.title_placeholder')}
            className={v1InputClass}
          />
        </div>

        <div className="mb-5">
          <label className="mb-2 block text-sm font-semibold text-slate-700">
            {t('upload.date')}
          </label>
          <input
            type="date"
            value={docDate}
            onChange={(e) => setDocDate(e.target.value)}
            max={localTodayISO()}
            className={v1InputClass}
          />
        </div>

        {uploading && (
          <div className="mb-5 rounded-2xl bg-slate-50 p-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm text-slate-500">
                {t('upload.uploading')}
              </span>
              <span className="text-sm font-semibold text-[#0056D2]">
                {progress}%
              </span>
            </div>
            <div className="h-2.5 w-full rounded-full bg-slate-200">
              <div
                className="h-2.5 rounded-full bg-gradient-to-r from-[#0056D2] to-[#1c78ff] transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        <div className="flex gap-3">
          <button
            type="button"
            onClick={handleCancel}
            disabled={uploading}
            className="flex-1 rounded-2xl border border-slate-300 py-3 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {t('upload.cancel')}
          </button>
          <button
            type="button"
            onClick={handleUpload}
            disabled={uploading || !docTitle.trim()}
            className={v1PrimaryCtaClass}
          >
            {uploading ? t('upload.uploading') : t('upload.confirm')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      className={`rounded-[28px] border-2 border-dashed p-8 text-center transition-colors ${dragActive ? 'border-[#0056D2] bg-blue-50' : 'border-slate-300 bg-white hover:border-slate-400'} cursor-pointer`}
    >
      <div className="mb-4 text-6xl">📎</div>
      <h3 className="mb-2 text-lg font-bold text-slate-800">
        {t('upload.drop_or_click')}
      </h3>
      <p className={`mb-4 ${v1HelperTextClass}`}>
        {t('upload.accepted_formats')}
      </p>

      <input
        type="file"
        accept="image/*,application/pdf"
        onChange={handleInputChange}
        className="hidden"
        id={inputId}
      />
      <label
        htmlFor={inputId}
        className="inline-flex rounded-2xl bg-gradient-to-r from-[#0056D2] to-[#1c78ff] px-5 py-3 text-sm font-semibold text-white shadow-[0_14px_26px_rgba(0,86,210,0.18)] transition-all hover:opacity-95 cursor-pointer"
      >
        {t('upload.select_file')}
      </label>
      <p className="mt-3 text-xs text-slate-400">Imagem ou PDF, com título e tipo definidos em seguida.</p>
    </div>
  );
}
