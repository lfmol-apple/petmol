/**
 * Hook para usar o Identity Kit
 * 
 * Facilita geração e compartilhamento de artefatos:
 * - Pet Passport
 * - Emergency QR Card
 * - Missing Poster (futuro)
 */

import { useState, useCallback } from 'react';
import { useI18n } from '@/lib/I18nContext';
import type { IdentityKitTheme, PassportData, QRCardData } from '@/lib/identityKit/types';
import { 
  ensurePetIdentity, 
  saveGeneratedArtifact, 
  incrementShareCount,
  generateMRZ,
  trackIdentityKitEvent
} from '@/lib/identityKit/store';
import { generatePassportCanvas } from '@/lib/identityKit/passportCanvas';
import { generateQRCardCanvas } from '@/lib/identityKit/qrCardCanvas';

export interface GenerateOptions {
  petId: string;
  petName: string;
  species: 'dog' | 'cat' | 'other';
  breed?: string;
  photoUrl: string;
  theme?: IdentityKitTheme;
}

export function useIdentityKit() {
  const { geo, t } = useI18n();
  const [generating, setGenerating] = useState(false);
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const API = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000';

  /**
   * Gera Pet Passport
   */
  const generatePassport = useCallback(async (options: GenerateOptions): Promise<string> => {
    setGenerating(true);
    try {
      // Ensure pet identity exists
      const identity = await ensurePetIdentity(
        options.petId,
        options.petName,
        options.species,
        options.breed,
        options.photoUrl
      );

      const theme = options.theme || identity.preferredTheme || 'classic';

      // Generate MRZ
      const { line1, line2 } = generateMRZ(
        identity.name,
        identity.species,
        identity.breed,
        identity.docCode
      );

      const passportData: PassportData = {
        ...identity,
        mrzLine1: line1,
        mrzLine2: line2,
      };

      // Generate image
      const imageDataUrl = await generatePassportCanvas(passportData, theme, {
        title: t('identity_kit.passport_title'),
        subtitle: t('identity_kit.passport_subtitle'),
        docLabel: t('identity_kit.doc_label'),
        name: t('identity_kit.name'),
        species: t('identity_kit.species'),
        breed: t('identity_kit.breed'),
        issued: t('identity_kit.issued'),
        signatureLabel: t('identity_kit.signature_label'),
        stamp: t('identity_kit.stamp'),
        disclaimer: t('identity_kit.disclaimer'),
        watermark: t('identity_kit.watermark'),
      });

      // Save artifact
      await saveGeneratedArtifact({
        type: 'passport',
        petId: options.petId,
        theme,
        imageUri: imageDataUrl,
        width: 1080,
        height: 1920,
        generatedAt: new Date().toISOString(),
      });

      // Track event
      await trackIdentityKitEvent(
        {
          event: 'identitykit_generated',
          type: 'passport',
          theme,
          petId: options.petId,
          country: geo.country,
          locale: geo.locale,
          timestamp: new Date().toISOString(),
        },
        API
      );

      setGeneratedImage(imageDataUrl);
      return imageDataUrl;
    } finally {
      setGenerating(false);
    }
  }, [geo.country, geo.locale, t, API]);

  /**
   * Gera Emergency QR Card
   */
  const generateQRCard = useCallback(async (options: GenerateOptions): Promise<string> => {
    setGenerating(true);
    try {
      // Ensure pet identity exists
      const identity = await ensurePetIdentity(
        options.petId,
        options.petName,
        options.species,
        options.breed,
        options.photoUrl
      );

      const theme = options.theme || identity.preferredTheme || 'classic';

      // Generate QR URL (will point to public page)
      const qrUrl = `https://petmol.app/e/${identity.docCode}`;

      const qrData: QRCardData = {
        ...identity,
        qrUrl,
        message: t('identity_kit.qr_message'),
      };

      // Generate image
      const imageDataUrl = await generateQRCardCanvas(qrData, theme, {
        title: t('identity_kit.qr_title'),
        message: t('identity_kit.qr_message'),
        name: t('identity_kit.name'),
        watermark: t('identity_kit.watermark'),
      });

      // Save artifact
      await saveGeneratedArtifact({
        type: 'qr_card',
        petId: options.petId,
        theme,
        imageUri: imageDataUrl,
        width: 1080,
        height: 1920,
        generatedAt: new Date().toISOString(),
      });

      // Track event
      await trackIdentityKitEvent(
        {
          event: 'identitykit_generated',
          type: 'qr_card',
          theme,
          petId: options.petId,
          country: geo.country,
          locale: geo.locale,
          timestamp: new Date().toISOString(),
        },
        API
      );

      setGeneratedImage(imageDataUrl);
      return imageDataUrl;
    } finally {
      setGenerating(false);
    }
  }, [geo.country, geo.locale, t, API]);

  /**
   * Compartilha imagem gerada
   */
  const shareImage = useCallback(async (imageDataUrl: string, artifactType: 'passport' | 'qr_card') => {
    try {
      // Convert data URL to blob
      const response = await fetch(imageDataUrl);
      const blob = await response.blob();
      
      // Check if Web Share API is available
      if (navigator.share && navigator.canShare && navigator.canShare({ files: [new File([blob], 'petmol.jpg', { type: 'image/jpeg' })] })) {
        const file = new File([blob], `petmol_${artifactType}.jpg`, { type: 'image/jpeg' });
        
        await navigator.share({
          files: [file],
          title: 'PETMOL Identity Kit',
          text: t('identity_kit.watermark'),
        });

        // Track share
        await trackIdentityKitEvent(
          {
            event: 'identitykit_shared',
            type: artifactType,
            theme: 'classic', // We don't have theme here
            petId: 'unknown', // We don't have petId here
            country: geo.country,
            locale: geo.locale,
            timestamp: new Date().toISOString(),
          },
          API
        );
      } else {
        // Fallback: download
        const link = document.createElement('a');
        link.href = imageDataUrl;
        link.download = `petmol_${artifactType}.jpg`;
        link.click();
      }
    } catch (err) {
      console.error('[identity kit share]', err);
      // Fallback: download
      const link = document.createElement('a');
      link.href = imageDataUrl;
      link.download = `petmol_${artifactType}.jpg`;
      link.click();
    }
  }, [geo.country, geo.locale, t, API]);

  return {
    generating,
    generatedImage,
    generatePassport,
    generateQRCard,
    shareImage,
    clearGenerated: () => setGeneratedImage(null),
  };
}
