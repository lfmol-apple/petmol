'use client';

import { useEffect, useState } from 'react';
import { fetchDocumentBlob } from '@/lib/documentFile';

interface AuthenticatedDocumentImageProps {
  petId: string;
  docId: string;
  alt: string;
  className?: string;
  loading?: 'eager' | 'lazy';
  onError?: () => void;
}

export function AuthenticatedDocumentImage({
  petId,
  docId,
  alt,
  className,
  loading = 'lazy',
  onError,
}: AuthenticatedDocumentImageProps) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;

    fetchDocumentBlob(petId, docId)
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setBlobUrl(objectUrl);
      })
      .catch(() => {
        if (!cancelled) onError?.();
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [petId, docId, onError]);

  if (!blobUrl) {
    return <div className={className} aria-hidden="true" />;
  }

  return <img src={blobUrl} alt={alt} className={className} loading={loading} />;
}