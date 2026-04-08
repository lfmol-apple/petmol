/**
 * Upload Utility
 * 
 * Compressão client-side + upload autenticado por presign
 * - Imagens: comprime para <= 300KB
 * - PDFs: mantém original dentro do limite aceito
 * - Presign + confirm para persistência confiável
 * - Progress tracking
 */

import imageCompression from 'browser-image-compression';
import { getToken } from '@/lib/auth-token';
import { API_BASE_URL } from '@/lib/api';

export interface UploadOptions {
  maxSizeMB?: number; // default: 0.3 (300KB)
  maxWidthOrHeight?: number; // default: 1920
  useWebWorker?: boolean; // default: true
  onProgress?: (progress: number) => void; // 0-100
}

export interface UploadResult {
  s3Key: string;
  publicUrl: string;
  originalSize: number;
  compressedSize: number;
  mimeType: string;
}

type UploadCategory = 'medical' | 'profile' | 'other';

function buildAuthHeaders(extraHeaders?: Record<string, string>): Record<string, string> {
  const token = getToken();
  return {
    ...(extraHeaders || {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

function toAbsoluteUploadUrl(uploadUrl: string): string {
  if (/^https?:\/\//i.test(uploadUrl)) return uploadUrl;
  return `${API_BASE_URL}${uploadUrl.startsWith('/') ? uploadUrl : `/${uploadUrl}`}`;
}

// ========================================
// Image Compression
// ========================================

export async function compressImage(
  file: File,
  options?: UploadOptions
): Promise<File> {
  const opts = {
    maxSizeMB: options?.maxSizeMB || 0.3,
    maxWidthOrHeight: options?.maxWidthOrHeight || 1920,
    useWebWorker: options?.useWebWorker !== false,
    onProgress: options?.onProgress,
  };

  try {
    console.log(`[Upload] Compressing ${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)`);
    
    const compressedFile = await imageCompression(file, opts);
    
    console.log(
      `[Upload] Compressed to ${(compressedFile.size / 1024 / 1024).toFixed(2)} MB ` +
      `(${((compressedFile.size / file.size) * 100).toFixed(0)}% of original)`
    );
    
    return compressedFile;
  } catch (error) {
    console.error('[Upload] Compression failed:', error);
    throw new Error('Image compression failed');
  }
}

// ========================================
// PDF Handling
// ========================================

export async function preparePDF(file: File): Promise<File> {
  const MAX_PDF_SIZE = 15 * 1024 * 1024; // 15MB

  if (file.size > MAX_PDF_SIZE) {
    throw new Error(`PDF too large: ${(file.size / 1024 / 1024).toFixed(2)} MB (max 15MB)`);
  }

  console.log(`[Upload] PDF OK: ${(file.size / 1024 / 1024).toFixed(2)} MB`);
  return file;
}

// ========================================
// Presigned URL Upload
// ========================================

export async function getPresignedUrl(
  fileName: string,
  mimeType: string,
  category: UploadCategory,
  size: number,
): Promise<{
  uploadUrl: string;
  s3Key: string;
  publicUrl: string;
}> {
  const response = await fetch(`${API_BASE_URL}/uploads/presign`, {
    method: 'POST',
    headers: {
      ...buildAuthHeaders({ 'Content-Type': 'application/json' }),
    },
    body: JSON.stringify({
      filename: fileName,
      content_type: mimeType,
      size,
      category,
    }),
    credentials: 'include',
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to get presigned URL: ${error}`);
  }

  const data = await response.json() as { upload_url: string; key: string };

  return {
    uploadUrl: toAbsoluteUploadUrl(data.upload_url),
    s3Key: data.key,
    publicUrl: `${API_BASE_URL}/attachments/${data.key}/download`,
  };
}

async function confirmUpload(
  key: string,
  file: File,
  category: UploadCategory,
): Promise<{ downloadUrl: string }> {
  const entityType = category === 'profile' ? 'pet_photo' : category === 'medical' ? 'medical_document' : 'other';

  const response = await fetch(`${API_BASE_URL}/uploads/confirm`, {
    method: 'POST',
    headers: buildAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({
      key,
      filename: file.name,
      content_type: file.type,
      size: file.size,
      entity_type: entityType,
    }),
    credentials: 'include',
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to confirm upload: ${error}`);
  }

  const data = await response.json() as { download_url: string };
  return { downloadUrl: toAbsoluteUploadUrl(data.download_url) };
}

export async function uploadToS3(
  file: File,
  presignedUrl: string,
  onProgress?: (progress: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    // Track progress
    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable && onProgress) {
        const percent = Math.round((e.loaded / e.total) * 100);
        onProgress(percent);
      }
    });

    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        reject(new Error(`S3 upload failed: ${xhr.status} ${xhr.statusText}`));
      }
    });

    xhr.addEventListener('error', () => {
      reject(new Error('S3 upload network error'));
    });

    xhr.addEventListener('abort', () => {
      reject(new Error('S3 upload aborted'));
    });

    xhr.open('PUT', presignedUrl);
    xhr.setRequestHeader('Content-Type', file.type);
    xhr.send(file);
  });
}

// ========================================
// Full Upload Flow
// ========================================

export async function uploadFile(
  file: File,
  category: UploadCategory,
  options?: UploadOptions
): Promise<UploadResult> {
  const originalSize = file.size;
  let processedFile = file;

  // Compress images
  if (file.type.startsWith('image/')) {
    processedFile = await compressImage(file, options);
  }
  // Validate PDFs
  else if (file.type === 'application/pdf') {
    processedFile = await preparePDF(file);
  }

  const compressedSize = processedFile.size;

  // Get presigned URL
  const { uploadUrl, s3Key, publicUrl } = await getPresignedUrl(
    processedFile.name,
    processedFile.type,
    category,
    processedFile.size,
  );

  // Upload to S3
  await uploadToS3(processedFile, uploadUrl, options?.onProgress);

  const { downloadUrl } = await confirmUpload(s3Key, processedFile, category);

  console.log(`[Upload] Success: ${s3Key}`);

  return {
    s3Key,
    publicUrl: downloadUrl || publicUrl,
    originalSize,
    compressedSize,
    mimeType: processedFile.type,
  };
}

// ========================================
// Batch Upload
// ========================================

export async function uploadMultiple(
  files: File[],
  category: UploadCategory,
  onFileProgress?: (index: number, progress: number) => void
): Promise<UploadResult[]> {
  const results: UploadResult[] = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    
    try {
      const result = await uploadFile(file, category, {
        onProgress: (progress) => {
          onFileProgress?.(i, progress);
        },
      });
      
      results.push(result);
    } catch (error) {
      console.error(`[Upload] File ${i} failed:`, error);
      throw error;
    }
  }

  return results;
}

// ========================================
// Helper: File Validation
// ========================================

export function validateFile(file: File): {
  valid: boolean;
  error?: string;
} {
  const ALLOWED_TYPES = [
    'image/jpeg',
    'image/png',
    'image/webp',
    'application/pdf',
  ];

  const imageLimit = 5 * 1024 * 1024;
  const pdfLimit = 15 * 1024 * 1024;

  if (file.type === 'application/pdf' && file.size > pdfLimit) {
    return {
      valid: false,
      error: `PDF muito grande: ${(file.size / 1024 / 1024).toFixed(2)} MB (máx. 15MB)`,
    };
  }

  if (file.type.startsWith('image/') && file.size > imageLimit) {
    return {
      valid: false,
      error: `Imagem muito grande: ${(file.size / 1024 / 1024).toFixed(2)} MB (máx. 5MB)`,
    };
  }

  if (!ALLOWED_TYPES.includes(file.type)) {
    return {
      valid: false,
      error: `Tipo de arquivo não suportado: ${file.type}`,
    };
  }

  return { valid: true };
}
