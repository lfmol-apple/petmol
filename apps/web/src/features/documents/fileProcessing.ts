import { replaceFileExtension } from '@/features/documents/utils';

export async function loadImageElement(file: File): Promise<HTMLImageElement> {
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

export function buildPdfFromJpeg(jpegBytes: Uint8Array, widthPx: number, heightPx: number): Uint8Array {
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

export async function convertImageFileToPdf(file: File): Promise<File> {
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
