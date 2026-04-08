/**
 * Passport Canvas Generator
 * 
 * Gera imagem 1080x1920 do Pet Passport com:
 * - Foto do pet
 * - Nome, espécie/raça, docCode
 * - Data de expedição, carimbo
 * - MRZ fake (entretenimento)
 * - Microtexto: "Entretenimento • Não é documento oficial"
 * - Marca d'água obrigatória com CTA
 * 
 * Temas: classic, cute, neon
 */

import type { PassportData, IdentityKitTheme } from './types';

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
 * Desenha texto com quebra automática
 */
function drawWrappedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number
): number {
  const words = text.split(' ');
  let line = '';
  let currentY = y;

  for (const word of words) {
    const testLine = line + word + ' ';
    const metrics = ctx.measureText(testLine);
    
    if (metrics.width > maxWidth && line !== '') {
      ctx.fillText(line, x, currentY);
      line = word + ' ';
      currentY += lineHeight;
    } else {
      line = testLine;
    }
  }
  ctx.fillText(line, x, currentY);
  return currentY + lineHeight;
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function drawGuillochePattern(ctx: CanvasRenderingContext2D, color: string) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.globalAlpha = 0.08;

  const spacing = 28;
  for (let y = -HEIGHT; y < HEIGHT * 2; y += spacing) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.bezierCurveTo(
      WIDTH * 0.25,
      y + 40,
      WIDTH * 0.75,
      y - 40,
      WIDTH,
      y
    );
    ctx.stroke();
  }

  ctx.restore();
}

/**
 * Gera imagem do Pet Passport
 */
export async function generatePassportCanvas(
  data: PassportData,
  theme: IdentityKitTheme,
  translations: {
    title: string; // "PET PASSPORT"
    subtitle: string; // "United Republic of Pets"
    docLabel: string; // "DOC"
    name: string; // "Name"
    species: string; // "Species"
    breed: string; // "Breed"
    issued: string; // "Issued"
    signatureLabel: string; // "Tutor(a)"
    stamp: string; // "APPROVED"
    disclaimer: string; // "Entertainment Only • Not Official Document"
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
  drawGuillochePattern(ctx, colors.secondary);

  // Border decorativo
  ctx.strokeStyle = colors.accent;
  ctx.lineWidth = 6;
  ctx.strokeRect(50, 50, WIDTH - 100, HEIGHT - 100);

  // Header band
  ctx.fillStyle = colors.primary;
  ctx.fillRect(80, 80, WIDTH - 160, 220);

  // Crest (paw + crown)
  ctx.save();
  ctx.translate(160, 150);
  ctx.beginPath();
  ctx.arc(0, 0, 46, 0, Math.PI * 2);
  ctx.fillStyle = colors.accent;
  ctx.fill();
  ctx.fillStyle = colors.primary;
  ctx.beginPath();
  ctx.arc(0, 0, 40, 0, Math.PI * 2);
  ctx.fill();
  ctx.font = '28px sans-serif';
  ctx.fillStyle = colors.text;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('🐾👑', 0, 0);
  ctx.restore();

  // Title
  ctx.fillStyle = colors.text;
  ctx.font = 'bold 64px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(translations.title, WIDTH / 2 + 60, 155);

  // Subtitle
  ctx.font = '24px sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.fillText(translations.subtitle, WIDTH / 2 + 60, 195);

  // Doc code
  ctx.font = '22px sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.fillText(`${translations.docLabel}: ${data.docCode}`, WIDTH / 2 + 60, 230);

  // Photo (rounded document frame)
  const photoX = 120;
  const photoY = 340;
  const photoW = 420;
  const photoH = 520;

  try {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
      img.src = data.photoUrl;
    });

    ctx.save();
    drawRoundedRect(ctx, photoX, photoY, photoW, photoH, 24);
    ctx.clip();
    ctx.drawImage(img, photoX, photoY, photoW, photoH);
    ctx.restore();

    // Photo border
    ctx.strokeStyle = colors.accent;
    ctx.lineWidth = 5;
    drawRoundedRect(ctx, photoX, photoY, photoW, photoH, 24);
    ctx.stroke();
  } catch (err) {
    // Fallback: círculo com inicial
    ctx.fillStyle = colors.secondary;
    drawRoundedRect(ctx, photoX, photoY, photoW, photoH, 24);
    ctx.fill();
    
    ctx.fillStyle = colors.text;
    ctx.font = 'bold 140px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(data.name.charAt(0).toUpperCase(), photoX + photoW / 2, photoY + photoH / 2);
  }

  // Fields grid (2 columns)
  const fieldX = 580;
  const fieldY = 360;
  const fieldWidth = 380;
  const rowHeight = 90;

  ctx.fillStyle = colors.secondary;
  ctx.globalAlpha = 0.12;
  ctx.fillRect(fieldX - 20, fieldY - 20, fieldWidth + 40, rowHeight * 4 + 40);
  ctx.globalAlpha = 1;

  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillStyle = colors.text;

  const labelFont = '20px sans-serif';
  const valueFont = '28px sans-serif';

  const fieldItems = [
    { label: translations.name, value: data.name },
    { label: translations.species, value: data.species.toUpperCase() },
    { label: translations.breed, value: data.breed || '—' },
    { label: translations.issued, value: new Date(data.issuedAt).toLocaleDateString() },
  ];

  fieldItems.forEach((field, index) => {
    const y = fieldY + index * rowHeight;
    ctx.font = labelFont;
    ctx.fillStyle = colors.secondary;
    ctx.fillText(field.label.toUpperCase(), fieldX, y);
    ctx.font = valueFont;
    ctx.fillStyle = colors.text;
    ctx.fillText(field.value, fieldX, y + 28);
  });

  // Signature line
  const signatureY = fieldY + rowHeight * 4 + 40;
  ctx.strokeStyle = colors.secondary;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(fieldX, signatureY);
  ctx.lineTo(fieldX + fieldWidth, signatureY);
  ctx.stroke();

  ctx.font = '18px sans-serif';
  ctx.fillStyle = colors.secondary;
  ctx.fillText(translations.signatureLabel, fieldX, signatureY + 8);

  // Stamp (approved)
  ctx.save();
  ctx.translate(700, 620);
  ctx.rotate(-0.2);
  ctx.globalAlpha = 0.18;
  ctx.strokeStyle = colors.accent;
  ctx.lineWidth = 4;
  drawRoundedRect(ctx, -130, -50, 260, 100, 10);
  ctx.stroke();
  ctx.fillStyle = colors.accent;
  ctx.font = 'bold 42px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(translations.stamp.toUpperCase(), 0, 0);
  ctx.restore();

  // MRZ (Machine Readable Zone)
  const mrzY = 1180;
  ctx.fillStyle = 'rgba(0,0,0,0.08)';
  ctx.fillRect(100, mrzY, WIDTH - 200, 120);

  ctx.fillStyle = colors.text;
  ctx.font = '24px monospace';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(data.mrzLine1, 120, mrzY + 40);
  ctx.fillText(data.mrzLine2, 120, mrzY + 80);

  // Disclaimer
  ctx.font = '18px sans-serif';
  ctx.fillStyle = colors.secondary;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(translations.disclaimer, WIDTH / 2, 1350);

  // Watermark footer (growth hook)
  const watermarkY = HEIGHT - 150;
  ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
  ctx.fillRect(0, watermarkY, WIDTH, 110);

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 28px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(translations.watermark, WIDTH / 2, watermarkY + 42);
  ctx.font = '22px sans-serif';
  ctx.fillText('🐾 petmol.app', WIDTH / 2, watermarkY + 78);

  return canvas.toDataURL('image/jpeg', 0.95);
}
