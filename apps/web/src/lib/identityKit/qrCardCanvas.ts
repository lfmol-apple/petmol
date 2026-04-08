/**
 * QR Card Canvas Generator
 * 
 * Gera imagem 1080x1920 do Emergency QR Card com:
 * - "Se eu me perdi, escaneie" (i18n)
 * - QR code grande apontando para https://petmol.app/p/{code}
 * - Foto do pet
 * - Nome do pet
 * - Marca d'água obrigatória com CTA
 * 
 * Temas: classic, cute, neon
 */

import QRCode from 'qrcode';
import type { QRCardData, IdentityKitTheme } from './types';

const WIDTH = 1080;
const HEIGHT = 1920;

interface ThemeColors {
  background: string;
  primary: string;
  secondary: string;
  text: string;
  accent: string;
}

const THEMES: Record<IdentityKitTheme, ThemeColors> = {
  classic: {
    background: '#1a1a2e',
    primary: '#16213e',
    secondary: '#0f3460',
    text: '#eee',
    accent: '#e94560',
  },
  cute: {
    background: '#ffe5e5',
    primary: '#ffcce7',
    secondary: '#ffa3d7',
    text: '#5a3d5c',
    accent: '#ff6b9d',
  },
  neon: {
    background: '#0a0e27',
    primary: '#1a1f4e',
    secondary: '#2d3561',
    text: '#00ffff',
    accent: '#ff00ff',
  },
};

/**
 * Gera imagem do Emergency QR Card
 */
export async function generateQRCardCanvas(
  data: QRCardData,
  theme: IdentityKitTheme,
  translations: {
    title: string; // "EMERGENCY QR"
    message: string; // "If I'm lost, please scan"
    name: string; // "Name"
    watermark: string; // "Generated on PETMOL — Create yours"
  }
): Promise<string> {
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext('2d');
  
  if (!ctx) throw new Error('Canvas context not available');

  const colors = THEMES[theme];

  // Background
  ctx.fillStyle = colors.background;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // Border decorativo
  ctx.strokeStyle = colors.accent;
  ctx.lineWidth = 12;
  ctx.strokeRect(30, 30, WIDTH - 60, HEIGHT - 60);

  // Header
  ctx.fillStyle = colors.primary;
  ctx.fillRect(60, 60, WIDTH - 120, 180);

  ctx.fillStyle = colors.text;
  ctx.font = 'bold 64px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(translations.title, WIDTH / 2, 160);

  // Mensagem principal
  ctx.font = 'bold 48px sans-serif';
  ctx.fillStyle = colors.accent;
  ctx.textAlign = 'center';
  
  const message = data.message || translations.message;
  const words = message.split(' ');
  let line = '';
  let y = 320;
  const maxWidth = WIDTH - 200;

  for (let i = 0; i < words.length; i++) {
    const testLine = line + words[i] + ' ';
    const metrics = ctx.measureText(testLine);
    
    if (metrics.width > maxWidth && i > 0) {
      ctx.fillText(line, WIDTH / 2, y);
      line = words[i] + ' ';
      y += 60;
    } else {
      line = testLine;
    }
  }
  ctx.fillText(line, WIDTH / 2, y);

  // QR Code (grande e centralizado)
  const qrSize = 600;
  const qrX = (WIDTH - qrSize) / 2;
  const qrY = 450;

  try {
    const qrDataUrl = await QRCode.toDataURL(data.qrUrl, {
      width: qrSize,
      margin: 1,
      color: {
        dark: theme === 'neon' ? '#00ffff' : theme === 'cute' ? '#5a3d5c' : '#1a1a2e',
        light: theme === 'neon' ? '#0a0e27' : theme === 'cute' ? '#ffe5e5' : '#ffffff',
      },
    });

    const qrImg = new Image();
    await new Promise((resolve, reject) => {
      qrImg.onload = resolve;
      qrImg.onerror = reject;
      qrImg.src = qrDataUrl;
    });

    // Fundo branco para QR
    if (theme !== 'cute') {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(qrX - 20, qrY - 20, qrSize + 40, qrSize + 40);
    }

    ctx.drawImage(qrImg, qrX, qrY, qrSize, qrSize);

    // Borda do QR
    ctx.strokeStyle = colors.accent;
    ctx.lineWidth = 8;
    ctx.strokeRect(qrX - 20, qrY - 20, qrSize + 40, qrSize + 40);
  } catch (err) {
    console.error('QR generation failed:', err);
    // Fallback: texto
    ctx.fillStyle = colors.text;
    ctx.font = '32px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('QR CODE', WIDTH / 2, qrY + qrSize / 2);
  }

  // Foto do pet (pequena, no canto)
  const photoSize = 200;
  const photoX = WIDTH / 2;
  const photoY = 1180;

  try {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
      img.src = data.photoUrl;
    });

    ctx.save();
    ctx.beginPath();
    ctx.arc(photoX, photoY, photoSize / 2, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(img, photoX - photoSize / 2, photoY - photoSize / 2, photoSize, photoSize);
    ctx.restore();

    // Borda da foto
    ctx.strokeStyle = colors.accent;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(photoX, photoY, photoSize / 2, 0, Math.PI * 2);
    ctx.stroke();
  } catch (err) {
    // Fallback: círculo com inicial
    ctx.fillStyle = colors.secondary;
    ctx.beginPath();
    ctx.arc(photoX, photoY, photoSize / 2, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.fillStyle = colors.text;
    ctx.font = 'bold 60px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(data.name.charAt(0).toUpperCase(), photoX, photoY);
  }

  // Nome do pet
  ctx.fillStyle = colors.text;
  ctx.font = 'bold 52px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(data.name.toUpperCase(), WIDTH / 2, 1330);

  // Doc code
  ctx.font = '28px monospace';
  ctx.fillStyle = colors.secondary;
  ctx.fillText(data.docCode, WIDTH / 2, 1390);

  // Marca d'água obrigatória (growth hook)
  const watermarkY = HEIGHT - 140;
  ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
  ctx.fillRect(0, watermarkY, WIDTH, 100);

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 32px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(translations.watermark, WIDTH / 2, watermarkY + 35);
  
  ctx.font = '24px sans-serif';
  ctx.fillText('🐾 petmol.app', WIDTH / 2, watermarkY + 70);

  return canvas.toDataURL('image/jpeg', 0.95);
}
