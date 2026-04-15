'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { BrowserCodeReader, BrowserMultiFormatReader, type IScannerControls } from '@zxing/browser';
import { BarcodeFormat, DecodeHintType } from '@zxing/library';
import { ModalPortal } from '@/components/ModalPortal';
import {
  identifyProductByBarcode,
  saveToScanHistory,
  loadScanHistory,
  getSearchSuggestions,
  type ProductCategory,
  type ScannedProduct,
  type ScanHistoryEntry,
} from '@/lib/productScanner';
import { saveLocalProduct } from '@/features/product-detection/cache';
import { confirmProductLookup } from '@/features/product-detection/resolver';

type Step =
  | 'entry'
  | 'scanning'
  | 'resolving'
  | 'not-found'
  | 'photo-capture'
  | 'photo-processing'
  | 'manual'
  | 'confirm';

const CATEGORY_LABELS: Record<ProductCategory, string> = {
  food: 'Ração / Alimento',
  antiparasite: 'Antipulgas / Carrapatos',
  dewormer: 'Vermífugo',
  collar: 'Coleira Antiparasitária',
  medication: 'Medicamento',
  hygiene: 'Higiene',
  other: 'Produto Pet',
};

const CATEGORY_EMOJI: Record<ProductCategory, string> = {
  food: '🥣',
  antiparasite: '🛡️',
  dewormer: '🪱',
  collar: '📿',
  medication: '💊',
  hygiene: '🛁',
  other: '📦',
};

const CATEGORY_HINT: Record<ProductCategory, string> = {
  food: 'Ex: Royal Canin, Premier, Hills...',
  antiparasite: 'Ex: Bravecto, Nexgard, Simparica...',
  dewormer: 'Ex: Drontal, Milbemax...',
  collar: 'Ex: Seresto, Scalibor...',
  medication: 'Ex: nome do remédio...',
  hygiene: 'Ex: shampoo, tapete higiênico...',
  other: 'Ex: nome ou marca do produto...',
};

const STEP_TITLE: Record<Step, string> = {
  entry: 'Adicionar produto',
  scanning: 'Escanear código',
  resolving: 'Identificando...',
  'not-found': 'Produto não encontrado',
  'photo-capture': 'Foto da embalagem',
  'photo-processing': 'Analisando...',
  manual: 'Buscar produto',
  confirm: 'Confirmar produto',
};

const ZXING_FORMATS = [
  BarcodeFormat.EAN_13,
  BarcodeFormat.EAN_8,
  BarcodeFormat.UPC_A,
  BarcodeFormat.UPC_E,
  BarcodeFormat.CODE_128,
  BarcodeFormat.CODE_39,
  BarcodeFormat.ITF,
];

export interface ProductDetectionSheetProps {
  petId: string;
  petName?: string;
  hint?: ProductCategory;
  onProductConfirmed: (product: ScannedProduct) => void;
  onClose: () => void;
}

export function ProductDetectionSheetGold({
  petId,
  petName,
  hint,
  onProductConfirmed,
  onClose,
}: ProductDetectionSheetProps) {
  const cooldownRef = useRef(false);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const zxingControlsRef = useRef<IScannerControls | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const scanningActiveRef = useRef(false);
  const playTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resolveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeResolveRef = useRef(0);
  const scanHintTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scannerBootingRef = useRef(false);

  const [step, setStep] = useState<Step>('entry');
  const [confirmed, setConfirmed] = useState<ScannedProduct | null>(null);
  const [fromHistory, setFromHistory] = useState(false);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [cameraFailed, setCameraFailed] = useState(false);
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [history, setHistory] = useState<ScanHistoryEntry[]>([]);
  const [scanHintVisible, setScanHintVisible] = useState(false);
  const [scanSuccess, setScanSuccess] = useState(false);
  const [detectedBarcode, setDetectedBarcode] = useState('');
  const [scannerError, setScannerError] = useState<string | null>(null);

  useEffect(() => {
    setHistory(loadScanHistory(petId, hint).slice(0, 5));
  }, [petId, hint]);

  useEffect(() => {
    if (!query.trim()) {
      setSuggestions(history.map(item => item.product.name).filter(Boolean));
      return;
    }
    setSuggestions(getSearchSuggestions(query, hint, petId));
  }, [query, hint, petId, history]);

  const clearScanHintTimer = useCallback(() => {
    if (scanHintTimerRef.current) {
      clearTimeout(scanHintTimerRef.current);
      scanHintTimerRef.current = null;
    }
  }, []);

  const clearPlayTimeout = useCallback(() => {
    if (playTimeoutRef.current) {
      clearTimeout(playTimeoutRef.current);
      playTimeoutRef.current = null;
    }
  }, []);

  const clearResolveTimeout = useCallback(() => {
    if (resolveTimeoutRef.current) {
      clearTimeout(resolveTimeoutRef.current);
      resolveTimeoutRef.current = null;
    }
  }, []);

  const waitForVideoElement = useCallback(async () => {
    for (let attempt = 0; attempt < 120; attempt += 1) {
      if (videoRef.current) return videoRef.current;
      await new Promise(resolve => requestAnimationFrame(() => resolve(undefined)));
    }

    throw new Error('camera_element_missing');
  }, []);

  const waitForVideoMetadata = useCallback(async (video: HTMLVideoElement) => {
    if (video.videoWidth > 0 && video.videoHeight > 0) {
      console.info('[ProductScanner] videoReady', {
        videoWidth: video.videoWidth,
        videoHeight: video.videoHeight,
      });
      return;
    }

    await new Promise<void>((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        cleanup();
        reject(new Error('video_dimensions_timeout'));
      }, 5000);

      const onLoadedMetadata = () => {
        if (video.videoWidth > 0 && video.videoHeight > 0) {
          cleanup();
          console.info('[ProductScanner] videoReady', {
            videoWidth: video.videoWidth,
            videoHeight: video.videoHeight,
          });
          resolve();
        }
      };

      const cleanup = () => {
        window.clearTimeout(timeout);
        video.removeEventListener('loadedmetadata', onLoadedMetadata);
      };

      video.addEventListener('loadedmetadata', onLoadedMetadata);
      onLoadedMetadata();
    });
  }, []);

  const openRearCameraStream = useCallback(async () => {
    const baseVideoConstraints: MediaTrackConstraints = {
      width: { ideal: 1280 },
      height: { ideal: 720 },
      frameRate: { ideal: 30, max: 30 },
    };

    try {
      return await navigator.mediaDevices.getUserMedia({
        video: {
          ...baseVideoConstraints,
          facingMode: { exact: 'environment' },
        },
        audio: false,
      });
    } catch {
      return navigator.mediaDevices.getUserMedia({
        video: {
          ...baseVideoConstraints,
          facingMode: { ideal: 'environment' },
        },
        audio: false,
      });
    }
  }, []);

  const stopScanner = useCallback(async () => {
    scanningActiveRef.current = false;
    scannerBootingRef.current = false;
    clearScanHintTimer();
    clearPlayTimeout();
    setScanHintVisible(false);

    const controls = zxingControlsRef.current;
    zxingControlsRef.current = null;
    if (controls) {
      try {
        controls.stop();
      } catch {
        // Scanner may already be stopped.
      }
    }

    const video = videoRef.current;
    if (video) {
      video.pause();
      video.srcObject = null;
    }

    const stream = mediaStreamRef.current;
    mediaStreamRef.current = null;
    if (stream) {
      for (const track of stream.getTracks()) track.stop();
    }

    BrowserCodeReader.releaseAllStreams();
  }, [clearPlayTimeout, clearScanHintTimer]);

  useEffect(() => () => {
    clearResolveTimeout();
    clearPlayTimeout();
    void stopScanner();
  }, [clearPlayTimeout, clearResolveTimeout, stopScanner]);

  const resolveDetectedBarcode = useCallback(async (barcode: string) => {
    const resolveId = ++activeResolveRef.current;

    clearResolveTimeout();
    setDetectedBarcode(barcode);
    setStep('resolving');

    resolveTimeoutRef.current = setTimeout(() => {
      if (activeResolveRef.current !== resolveId) return;
      activeResolveRef.current += 1;
      setConfirmed({ barcode, name: '', category: hint ?? 'other', found: false });
      setStep('manual');
    }, 6000);

    const product = await identifyProductByBarcode(barcode);
    if (activeResolveRef.current !== resolveId) return;

    clearResolveTimeout();
    const final: ScannedProduct = {
      ...product,
      category: product.category === 'other' && hint ? hint : product.category,
    };

    if (final.found) {
      setFromHistory(false);
      setConfirmed(final);
      setStep('confirm');
      return;
    }

    if (final.queued) {
      setConfirmed({
        barcode,
        name: '',
        category: hint ?? 'other',
        found: false,
        queued: true,
        queueMessage: final.queueMessage,
      });
      setStep('not-found');
      return;
    }

    setConfirmed({ barcode, name: '', category: hint ?? 'other', found: false });
    setStep('manual');
  }, [clearResolveTimeout, hint]);

  const handleDetectedBarcode = useCallback(async (rawBarcode: string) => {
    const barcode = rawBarcode.replace(/\D/g, '');
    if (!/^\d{8,14}$/.test(barcode)) return;
    if (cooldownRef.current) return;

    cooldownRef.current = true;
    setDetectedBarcode(barcode);
    setScanSuccess(true);
    console.info('[ProductScanner] barcodeDetected', { barcode });

    setTimeout(() => {
      cooldownRef.current = false;
    }, 1500);

    await new Promise(resolve => setTimeout(resolve, 220));
    await stopScanner();
    await resolveDetectedBarcode(barcode);
  }, [resolveDetectedBarcode, stopScanner]);

  const beginScanner = useCallback(async () => {
    if (scannerBootingRef.current) return;

    await stopScanner();
    scannerBootingRef.current = true;

    setScanHintVisible(false);
    setScanSuccess(false);
    setCameraFailed(false);
    setScannerError(null);
    setDetectedBarcode('');
    cooldownRef.current = false;

    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('camera_unavailable');
      }

      const video = await waitForVideoElement();
      const stream = await openRearCameraStream();
      console.info('[ProductScanner] streamOpened', {
        tracks: stream.getVideoTracks().map(track => ({
          label: track.label,
          readyState: track.readyState,
          settings: track.getSettings(),
        })),
      });
      const hints = new Map<DecodeHintType, unknown>([
        [DecodeHintType.POSSIBLE_FORMATS, ZXING_FORMATS],
        [DecodeHintType.TRY_HARDER, true],
      ]);
      const reader = new BrowserMultiFormatReader(hints, {
        delayBetweenScanAttempts: 80,
        delayBetweenScanSuccess: 500,
        tryPlayVideoTimeout: 3500,
      });

      scanningActiveRef.current = true;
      video.setAttribute('playsinline', 'true');
      video.muted = true;
      video.autoplay = true;
      video.srcObject = stream;
      mediaStreamRef.current = stream;

      playTimeoutRef.current = setTimeout(() => {
        if (!scanningActiveRef.current) return;
        setCameraFailed(true);
        setScannerError('video_play_timeout');
        void stopScanner().finally(() => setStep('photo-capture'));
      }, 2500);

      await video.play();
      clearPlayTimeout();
      console.info('[ProductScanner] playResolved');
      await waitForVideoMetadata(video);
      console.info('[ProductScanner] decodeStarted', {
        videoWidth: video.videoWidth,
        videoHeight: video.videoHeight,
      });

      const controls = await reader.decodeFromVideoElement(video, (result) => {
        if (!scanningActiveRef.current || !result) return;
        void handleDetectedBarcode(result.getText());
      });
      zxingControlsRef.current = controls;
      scannerBootingRef.current = false;

      scanHintTimerRef.current = setTimeout(() => setScanHintVisible(true), 8000);
    } catch (error) {
      await stopScanner();
      setCameraFailed(true);
      setScannerError(error instanceof Error ? error.message : 'camera_error');
      setStep('photo-capture');
      scannerBootingRef.current = false;
    }
  }, [handleDetectedBarcode, openRearCameraStream, stopScanner, waitForVideoElement, waitForVideoMetadata]);

  useEffect(() => {
    if (step !== 'scanning') return;
    void beginScanner();
  }, [beginScanner, step]);

  const startScanner = () => {
    setStep('scanning');
    setScanHintVisible(false);
    setScanSuccess(false);
    setCameraFailed(false);
    setScannerError(null);
    setDetectedBarcode('');
    cooldownRef.current = false;
  };

  const handlePhotoFile = async (file: File) => {
    const url = URL.createObjectURL(file);
    setPhotoUrl(url);
    setStep('photo-processing');

    try {
      const { Html5Qrcode } = await import('html5-qrcode');
      const tempId = `pds-file-${Date.now()}`;
      const div = document.createElement('div');
      div.id = tempId;
      div.style.cssText = 'position:absolute;left:-9999px;opacity:0;pointer-events:none;width:1px;height:1px;';
      document.body.appendChild(div);

      const scanner = new Html5Qrcode(tempId);
      try {
        const result = await scanner.scanFileV2(file, false);
        div.remove();
        await resolveDetectedBarcode(result.decodedText);
      } catch {
        div.remove();
        setStep('manual');
      }
    } catch {
      setStep('manual');
    }
  };

  const selectManual = (name: string) => {
    const product: ScannedProduct = {
      barcode: confirmed?.barcode ?? '',
      name,
      category: hint ?? 'other',
      found: true,
    };
    setFromHistory(false);
    setConfirmed(product);
    setStep('confirm');
  };

  const handleConfirm = () => {
    if (!confirmed) return;

    if (confirmed.barcode && confirmed.found) {
      saveLocalProduct(confirmed.barcode, {
        barcode: confirmed.barcode,
        name: confirmed.name,
        brand: confirmed.brand,
        weight: confirmed.weight,
        category: confirmed.category,
        source: 'cache',
      });
      void confirmProductLookup({
        barcode: confirmed.barcode,
        name: confirmed.name,
        brand: confirmed.brand,
        category: confirmed.category,
        manufacturer: confirmed.manufacturer,
        presentation: confirmed.presentation ?? confirmed.weight,
        source: 'user_confirmed',
      });
    }

    saveToScanHistory({ barcode: confirmed.barcode, product: confirmed, petId, category: confirmed.category });
    onProductConfirmed(confirmed);
  };

  const canGoBack = step !== 'entry' && step !== 'resolving' && step !== 'photo-processing';
  const immersiveMode = step === 'scanning' || step === 'resolving';

  const goBack = async () => {
    if (step === 'scanning') {
      await stopScanner();
      setStep('entry');
      return;
    }

    if (step === 'not-found') {
      setConfirmed(null);
      setStep('entry');
      return;
    }

    if (step === 'confirm') {
      setConfirmed(null);
      setFromHistory(false);
      setStep('manual');
      setQuery('');
      return;
    }

    setStep('entry');
  };

  const renderEntry = () => (
    <div className="space-y-5 p-5 pb-8">
      <div className="pb-1 pt-2 text-center">
        <p className="mb-3 text-5xl">🔍</p>
        <h2 className="text-[19px] font-bold text-gray-900">Como quer identificar?</h2>
        <p className="mt-1 text-sm text-gray-500">Escolha o jeito mais fácil para você</p>
      </div>

      <div className="space-y-3">
        <button
          type="button"
          onClick={startScanner}
          className="w-full rounded-2xl border border-blue-200 bg-blue-50 p-4 text-left transition-all active:scale-[0.98]"
        >
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-blue-100 text-2xl">📷</div>
            <div className="flex-1">
              <p className="text-[15px] font-bold text-blue-900">Escanear código de barras</p>
              <p className="mt-0.5 text-xs text-blue-600">Câmera traseira em tela cheia e leitura contínua</p>
            </div>
            <span className="flex-shrink-0 text-xl text-blue-300">›</span>
          </div>
        </button>

        <button
          type="button"
          onClick={() => setStep('photo-capture')}
          className="w-full rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-left transition-all active:scale-[0.98]"
        >
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-2xl">🖼️</div>
            <div className="flex-1">
              <p className="text-[15px] font-bold text-emerald-900">Fotografar a embalagem</p>
              <p className="mt-0.5 text-xs text-emerald-600">Tire uma foto e tentamos identificar o produto</p>
            </div>
            <span className="flex-shrink-0 text-xl text-emerald-300">›</span>
          </div>
        </button>

        <button
          type="button"
          onClick={() => setStep('manual')}
          className="w-full rounded-2xl border border-gray-200 bg-gray-50 p-4 text-left transition-all active:scale-[0.98]"
        >
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-gray-100 text-2xl">✏️</div>
            <div className="flex-1">
              <p className="text-[15px] font-bold text-gray-800">Digitar o nome do produto</p>
              <p className="mt-0.5 text-xs text-gray-500">Busque por nome ou marca com sugestões</p>
            </div>
            <span className="flex-shrink-0 text-xl text-gray-300">›</span>
          </div>
        </button>
      </div>

      {history.length > 0 && (
        <div>
          <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-gray-400">
            Produtos que você já usa
          </p>
          <div className="space-y-1.5">
            {history.map((item, index) => (
              <button
                key={index}
                type="button"
                onClick={() => {
                  setFromHistory(true);
                  setConfirmed(item.product);
                  setStep('confirm');
                }}
                className="w-full rounded-xl border border-gray-100 bg-white px-4 py-3 text-left shadow-sm transition-all active:scale-[0.98]"
              >
                <div className="flex items-center gap-3">
                  <span className="flex-shrink-0 text-xl">{CATEGORY_EMOJI[item.product.category]}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-gray-800">{item.product.name}</p>
                    {item.product.brand && item.product.brand !== item.product.name && (
                      <p className="truncate text-xs text-gray-400">{item.product.brand}</p>
                    )}
                  </div>
                  <span className="flex-shrink-0 text-lg text-gray-200">›</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  const renderScanning = () => (
    <div className="relative min-h-dvh bg-black">
      <video ref={videoRef} className="absolute inset-0 h-full w-full object-cover" muted playsInline autoPlay />

      <div className="absolute inset-x-0 top-0 z-20 flex items-center justify-between px-4 pt-[max(env(safe-area-inset-top),16px)]">
        <button
          type="button"
          onClick={goBack}
          className="flex h-11 w-11 items-center justify-center rounded-full bg-black/45 text-2xl text-white backdrop-blur"
          aria-label="Voltar"
        >
          ‹
        </button>
        <button
          type="button"
          onClick={onClose}
          className="flex h-11 w-11 items-center justify-center rounded-full bg-black/45 text-xl text-white backdrop-blur"
          aria-label="Fechar"
        >
          ✕
        </button>
      </div>

      <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center px-6">
        <div className="absolute inset-0 bg-black/32" />
        <div className="relative h-[28dvh] max-h-[260px] w-[86vw] max-w-xl rounded-[36px] border-[3px] border-white/95 shadow-[0_0_0_9999px_rgba(0,0,0,0.38)]">
          <div className="absolute inset-x-8 top-0 h-[3px] rounded-full bg-cyan-300 shadow-[0_0_14px_rgba(34,211,238,0.9)] animate-scanline" />
          <div className="absolute left-0 top-0 h-10 w-10 rounded-tl-[30px] border-l-[5px] border-t-[5px] border-cyan-300" />
          <div className="absolute right-0 top-0 h-10 w-10 rounded-tr-[30px] border-r-[5px] border-t-[5px] border-cyan-300" />
          <div className="absolute bottom-0 left-0 h-10 w-10 rounded-bl-[30px] border-b-[5px] border-l-[5px] border-cyan-300" />
          <div className="absolute bottom-0 right-0 h-10 w-10 rounded-br-[30px] border-b-[5px] border-r-[5px] border-cyan-300" />
        </div>

        <div className="relative mt-8 rounded-full bg-black/55 px-5 py-3 text-center backdrop-blur">
          <p className="text-base font-bold text-white">Aponte para o código de barras</p>
          <p className="mt-1 text-sm text-white/75">Leitura contínua ativa na câmera traseira</p>
        </div>
      </div>

      <div className="absolute inset-x-0 bottom-0 z-20 px-4 pb-[max(env(safe-area-inset-bottom),16px)]">
        <div className="rounded-[28px] bg-black/58 p-4 text-white backdrop-blur-xl">
          {scanHintVisible ? (
            <div className="mb-3 rounded-2xl border border-amber-300/40 bg-amber-400/12 px-4 py-3">
              <p className="text-sm font-semibold text-amber-100">Não consegui ler. Vamos por outro caminho</p>
              <p className="mt-1 text-xs text-amber-50/80">Aproxime mais o código ou use foto, digitação e lista abaixo.</p>
            </div>
          ) : (
            <div className="mb-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
              <p className="text-sm font-semibold text-white">Scanner rápido ativado</p>
              <p className="mt-1 text-xs text-white/70">Procurando código... leitura contínua com ZXing e debounce curto.</p>
            </div>
          )}

          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={async () => {
                await stopScanner();
                setStep('photo-capture');
              }}
              className="rounded-2xl border border-white/15 bg-white/10 px-2 py-3 text-xs font-semibold text-white"
            >
              Fotografar embalagem
            </button>
            <button
              type="button"
              onClick={async () => {
                await stopScanner();
                setStep('manual');
              }}
              className="rounded-2xl border border-white/15 bg-white/10 px-2 py-3 text-xs font-semibold text-white"
            >
              Digitar produto
            </button>
            <button
              type="button"
              onClick={goBack}
              className="rounded-2xl border border-white/15 bg-white/10 px-2 py-3 text-xs font-semibold text-white"
            >
              Fechar / Voltar
            </button>
          </div>
        </div>
      </div>

      {scanSuccess && (
        <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center bg-emerald-400/35 backdrop-blur-[2px]">
          <div className="rounded-[28px] border border-emerald-200/60 bg-emerald-500/90 px-8 py-6 text-center text-white shadow-2xl">
            <p className="text-5xl">✔</p>
            <p className="mt-3 text-xl font-bold">Código encontrado</p>
            {detectedBarcode && <p className="mt-1 text-sm text-emerald-50/85">{detectedBarcode}</p>}
          </div>
        </div>
      )}
    </div>
  );

  const renderResolving = () => (
    <div className="relative min-h-dvh overflow-hidden bg-[radial-gradient(circle_at_top,_rgba(34,197,94,0.28),_transparent_30%),linear-gradient(180deg,_#031525_0%,_#07111c_100%)] px-6 py-16 text-white">
      <div className="absolute inset-x-0 top-0 z-10 flex justify-end px-4 pt-[max(env(safe-area-inset-top),16px)]">
        <button
          type="button"
          onClick={onClose}
          className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-xl text-white backdrop-blur"
          aria-label="Fechar"
        >
          ✕
        </button>
      </div>

      <div className="relative z-10 flex min-h-[70dvh] flex-col items-center justify-center gap-6 text-center">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-white/10 backdrop-blur">
          <div className="h-10 w-10 rounded-full border-4 border-cyan-300 border-t-transparent animate-spin" />
        </div>
        <div>
          <p className="text-xl font-bold text-emerald-300">✔ Código encontrado</p>
          {detectedBarcode && <p className="mt-2 text-sm text-white/70">EAN {detectedBarcode}</p>}
        </div>
        <div>
          <p className="text-2xl font-bold">Identificando produto...</p>
          <p className="mt-2 text-sm text-white/70">Consultando Cosmos, cache local e fontes globais.</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
          <p className="text-sm text-white/80">Se demorar mais de 2 segundos, abrimos o fallback automaticamente.</p>
        </div>
      </div>
    </div>
  );

  const renderPhotoCapture = () => (
    <div className="space-y-4 p-5 pb-8">
      {cameraFailed && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <span className="mt-0.5 flex-shrink-0 text-xl">💡</span>
          <div>
            <p className="text-sm leading-snug text-amber-800">
              A câmera não abriu. Tire uma foto da embalagem ou digite o produto.
            </p>
            {scannerError && <p className="mt-1 text-xs text-amber-700">Motivo: {scannerError}</p>}
          </div>
        </div>
      )}

      {!cameraFailed && confirmed?.barcode && !confirmed.found && (
        <div className="flex items-start gap-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3">
          <span className="mt-0.5 flex-shrink-0 text-xl">📱</span>
          <p className="text-sm leading-snug text-blue-800">
            Lemos o código, mas ainda não temos esse produto cadastrado. Uma foto da embalagem pode ajudar.
          </p>
        </div>
      )}

      <div className="py-4 text-center">
        <p className="mb-3 text-5xl">📦</p>
        <h3 className="text-[19px] font-bold text-gray-900">Foto da embalagem</h3>
        <p className="mt-1 text-sm text-gray-500">Tire ou escolha uma foto da embalagem do produto</p>
      </div>

      <button
        type="button"
        onClick={startScanner}
        className="w-full rounded-2xl border border-blue-200 bg-blue-50 py-4 text-base font-bold text-blue-900 shadow-sm transition-all active:scale-95"
      >
        📷 Tentar escanear agora
      </button>

      <button
        type="button"
        onClick={() => photoInputRef.current?.click()}
        className="w-full rounded-2xl bg-emerald-500 py-4 text-base font-bold text-white shadow-md transition-all active:scale-95"
      >
        📷 Tirar foto agora
      </button>

      <button
        type="button"
        onClick={() => setStep('manual')}
        className="w-full rounded-xl border border-gray-200 py-3 text-sm font-semibold text-gray-600 transition-all active:scale-95"
      >
        ✏️ Prefiro digitar o nome
      </button>
    </div>
  );

  const renderPhotoProcessing = () => (
    <div className="flex flex-col items-center justify-center gap-5 px-6 py-16">
      {photoUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={photoUrl}
          alt="Embalagem"
          className="h-40 w-40 rounded-2xl border border-gray-200 object-cover shadow-sm"
        />
      )}
      <div className="h-12 w-12 rounded-full border-4 border-emerald-400 border-t-transparent animate-spin" />
      <div className="text-center">
        <p className="font-semibold text-gray-800">Analisando a foto...</p>
        <p className="mt-1 text-sm text-gray-400">Procurando código de barras na imagem</p>
      </div>
    </div>
  );

  const renderManual = () => (
    <div className="space-y-4 p-5 pb-8">
      {photoUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={photoUrl}
          alt="Embalagem"
          className="max-h-32 w-full rounded-xl border border-gray-100 bg-gray-50 object-contain"
        />
      )}

      <div>
        <h3 className="text-[17px] font-bold text-gray-900">
          {photoUrl ? 'O que você vê escrito na embalagem?' : 'Qual produto é esse?'}
        </h3>
        <p className="mt-1 text-xs text-gray-400">{hint ? CATEGORY_HINT[hint] : CATEGORY_HINT.other}</p>
      </div>

      <button
        type="button"
        onClick={startScanner}
        className="w-full rounded-2xl border border-blue-200 bg-blue-50 py-3.5 text-sm font-bold text-blue-900 transition-all active:scale-95"
      >
        📷 Voltar para escanear
      </button>

      <input
        type="text"
        value={query}
        onChange={event => setQuery(event.target.value)}
        onKeyDown={event => {
          if (event.key === 'Enter' && query.trim()) selectManual(query.trim());
        }}
        className="w-full rounded-xl border-2 border-gray-200 px-4 py-3.5 text-base transition-colors focus:border-blue-400 focus:outline-none"
        placeholder="Digitar nome ou marca..."
        autoFocus
      />

      {suggestions.length > 0 && (
        <div>
          <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-gray-400">
            {query.trim() ? 'Sugestões' : 'Usados recentemente'}
          </p>
          <div className="space-y-1.5">
            {suggestions.map((suggestion, index) => (
              <button
                key={index}
                type="button"
                onClick={() => selectManual(suggestion)}
                className="w-full rounded-xl border border-gray-100 bg-white px-4 py-3 text-left shadow-sm transition-all active:scale-[0.98]"
              >
                <div className="flex items-center gap-3">
                  <span className="flex-shrink-0 text-xl">{hint ? CATEGORY_EMOJI[hint] : '📦'}</span>
                  <span className="flex-1 truncate text-sm font-medium text-gray-800">{suggestion}</span>
                  <span className="flex-shrink-0 text-lg text-gray-200">›</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {query.trim() && (
        <button
          type="button"
          onClick={() => selectManual(query.trim())}
          className="w-full rounded-2xl bg-gray-900 py-4 font-bold text-white transition-all active:scale-95"
        >
          Usar &ldquo;{query.trim()}&rdquo;
        </button>
      )}
    </div>
  );

  const renderNotFound = () => (
    <div className="space-y-4 p-5 pb-8">
      <div className="py-4 text-center">
        <p className="mb-3 text-5xl">{confirmed?.queued ? '📬' : '🤔'}</p>
        <h3 className="text-[18px] font-bold text-gray-900">
          {confirmed?.queued ? 'Produto enviado para fila de catalogação' : 'Não consegui ler. Vamos por outro caminho'}
        </h3>
        <p className="mt-1 text-sm leading-relaxed text-gray-500">
          {confirmed?.queued
            ? (confirmed.queueMessage || 'Produto enviado para fila de catalogação')
            : 'Use foto, digitação ou escolha da lista para continuar sem travar.'}
        </p>
        {confirmed?.barcode && <p className="mt-2 font-mono text-xs text-gray-300">EAN: {confirmed.barcode}</p>}
      </div>

      <div className="space-y-3">
        <button
          type="button"
          onClick={startScanner}
          className="w-full rounded-2xl border border-blue-200 bg-blue-50 p-4 text-left transition-all active:scale-[0.98]"
        >
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-blue-100 text-2xl">📷</div>
            <div className="flex-1">
              <p className="text-[15px] font-bold text-blue-900">Tentar escanear novamente</p>
              <p className="mt-0.5 text-xs text-blue-600">Reabrir a câmera e ler o código de barras</p>
            </div>
            <span className="flex-shrink-0 text-xl text-blue-300">›</span>
          </div>
        </button>

        <button
          type="button"
          onClick={() => setStep('photo-capture')}
          className="w-full rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-left transition-all active:scale-[0.98]"
        >
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-2xl">📷</div>
            <div className="flex-1">
              <p className="text-[15px] font-bold text-emerald-900">Fotografar a embalagem</p>
              <p className="mt-0.5 text-xs text-emerald-600">Tire uma foto e tentamos identificar pelo visual</p>
            </div>
            <span className="flex-shrink-0 text-xl text-emerald-300">›</span>
          </div>
        </button>

        <button
          type="button"
          onClick={() => setStep('manual')}
          className="w-full rounded-2xl border border-blue-200 bg-blue-50 p-4 text-left transition-all active:scale-[0.98]"
        >
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-blue-100 text-2xl">✏️</div>
            <div className="flex-1">
              <p className="text-[15px] font-bold text-blue-900">Digitar o produto</p>
              <p className="mt-0.5 text-xs text-blue-600">Digite o nome ou marca com sugestões</p>
            </div>
            <span className="flex-shrink-0 text-xl text-blue-300">›</span>
          </div>
        </button>

        <button
          type="button"
          onClick={() => {
            setQuery('');
            setStep('manual');
          }}
          className="w-full rounded-2xl border border-gray-200 bg-gray-50 p-4 text-left transition-all active:scale-[0.98]"
        >
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-gray-100 text-2xl">📋</div>
            <div className="flex-1">
              <p className="text-[15px] font-bold text-gray-800">Escolher da lista</p>
              <p className="mt-0.5 text-xs text-gray-500">Veja produtos comuns por categoria</p>
            </div>
            <span className="flex-shrink-0 text-xl text-gray-300">›</span>
          </div>
        </button>
      </div>
    </div>
  );

  const renderConfirm = () => {
    if (!confirmed) return null;

    return (
      <div className="space-y-4 p-5 pb-8">
        {fromHistory && (
          <div className="flex items-center gap-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3">
            <span className="text-xl">⭐</span>
            <p className="text-sm font-semibold text-blue-800">Parece ser este produto que você já usa!</p>
          </div>
        )}

        {photoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={photoUrl}
            alt="Embalagem"
            className="max-h-40 w-full rounded-xl border border-gray-100 bg-gray-50 object-contain"
          />
        )}

        <div className="space-y-3 rounded-2xl border-2 border-emerald-200 bg-emerald-50 p-5">
          <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-600">
            {fromHistory ? 'Produto reconhecido' : '✓ Encontrei este produto'}
          </p>
          <div>
            <p className="text-xl font-bold leading-tight text-gray-900">{confirmed.name || 'Produto identificado'}</p>
            {confirmed.brand && confirmed.brand !== confirmed.name && (
              <p className="mt-0.5 text-sm text-gray-500">{confirmed.brand}</p>
            )}
            {confirmed.weight && <p className="mt-0.5 text-sm text-gray-400">{confirmed.weight}</p>}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xl">{CATEGORY_EMOJI[confirmed.category]}</span>
            <span className="text-sm text-gray-600">{CATEGORY_LABELS[confirmed.category]}</span>
            {confirmed.barcode && (
              <span className="ml-auto font-mono text-[10px] text-gray-300">#{confirmed.barcode.slice(-6)}</span>
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={handleConfirm}
          className="w-full rounded-2xl bg-emerald-500 py-4 text-base font-bold text-white shadow-md transition-all active:scale-95"
        >
          ✓ Está certo — usar este produto
        </button>

        <button
          type="button"
          onClick={() => {
            setConfirmed(null);
            setFromHistory(false);
            setStep('manual');
            setQuery('');
          }}
          className="w-full rounded-xl border border-gray-200 py-3 text-sm font-semibold text-gray-600 transition-all active:scale-95"
        >
          Não, escolher outro
        </button>
      </div>
    );
  };

  return (
    <ModalPortal>
      <input
        ref={photoInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={event => {
          const file = event.target.files?.[0];
          if (file) void handlePhotoFile(file);
          event.target.value = '';
        }}
      />

      <div className="fixed inset-0 z-[200] flex flex-col items-end justify-end sm:items-center sm:justify-center">
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

        <div
          className={immersiveMode
            ? 'relative h-full w-full overflow-hidden bg-black'
            : 'relative flex w-full max-w-lg flex-col overflow-hidden rounded-t-[28px] bg-white shadow-2xl animate-slideUp sm:rounded-[28px] sm:animate-scaleIn'}
          style={immersiveMode ? undefined : { maxHeight: '92dvh' }}
          onClick={event => event.stopPropagation()}
        >
          {!immersiveMode && (
            <div className="flex flex-shrink-0 items-center gap-3 border-b border-gray-100 px-5 pb-3 pt-4">
              {canGoBack && (
                <button
                  type="button"
                  onClick={goBack}
                  className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-gray-100 text-xl font-bold text-gray-700 transition-all active:scale-95"
                  aria-label="Voltar"
                >
                  ‹
                </button>
              )}
              <div className="min-w-0 flex-1">
                <h2 className="text-[16px] font-bold leading-tight text-gray-900">{STEP_TITLE[step]}</h2>
                {petName && <p className="truncate text-xs text-gray-400">{petName}</p>}
              </div>
              <button
                type="button"
                onClick={onClose}
                className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-500 transition-all hover:bg-gray-200 active:scale-95"
                aria-label="Fechar"
              >
                ✕
              </button>
            </div>
          )}

          <div className={immersiveMode ? 'h-full' : 'flex-1 overflow-y-auto overscroll-contain'}>
            {step === 'entry' && renderEntry()}
            {step === 'scanning' && renderScanning()}
            {step === 'resolving' && renderResolving()}
            {step === 'photo-capture' && renderPhotoCapture()}
            {step === 'photo-processing' && renderPhotoProcessing()}
            {step === 'manual' && renderManual()}
            {step === 'not-found' && renderNotFound()}
            {step === 'confirm' && renderConfirm()}
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}

export const ProductDetectionSheet = ProductDetectionSheetGold;
