'use client';

import { useState, useRef, useId, useEffect, useCallback } from 'react';
import { ModalPortal } from '@/components/ModalPortal';
import {
  identifyProductByBarcode,
  saveToScanHistory,
  loadScanHistory,
  findHistoryMatch,
  getSearchSuggestions,
  type ProductCategory,
  type ScannedProduct,
  type ScanHistoryEntry,
} from '@/lib/productScanner';
import { saveLocalProduct } from '@/features/product-detection/cache';

// ── Types ─────────────────────────────────────────────────────────────────────

type Step =
  | 'entry'
  | 'scanning'
  | 'resolving'
  | 'not-found'        // barcode read but no product matched any source
  | 'photo-capture'
  | 'photo-processing'
  | 'manual'
  | 'confirm';

// ── Constants ─────────────────────────────────────────────────────────────────

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

// ── Props ─────────────────────────────────────────────────────────────────────

export interface ProductDetectionSheetProps {
  petId: string;
  petName?: string;
  /** Category hint — narrows autocomplete suggestions */
  hint?: ProductCategory;
  onProductConfirmed: (product: ScannedProduct) => void;
  onClose: () => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function ProductDetectionSheet({
  petId,
  petName,
  hint,
  onProductConfirmed,
  onClose,
}: ProductDetectionSheetProps) {
  const uid = useId().replace(/:/g, '');
  const scanDivId = `pds-cam-${uid}`;
  const scannerRef = useRef<{ stop: () => Promise<void>; clear: () => void | Promise<void> } | null>(null);
  const cooldownRef = useRef(false);
  const photoInputRef = useRef<HTMLInputElement>(null);

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
  const scanHintTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load history on mount
  useEffect(() => {
    setHistory(loadScanHistory(petId, hint).slice(0, 5));
  }, [petId, hint]);

  // Autocomplete suggestions
  useEffect(() => {
    if (!query.trim()) {
      setSuggestions(history.map(h => h.product.name).filter(Boolean));
      return;
    }
    setSuggestions(getSearchSuggestions(query, hint, petId));
  }, [query, hint, petId, history]);

  // ── Scanner ────────────────────────────────────────────────────────────────

  const clearScanHintTimer = useCallback(() => {
    if (scanHintTimerRef.current) {
      clearTimeout(scanHintTimerRef.current);
      scanHintTimerRef.current = null;
    }
  }, []);

  const stopScanner = useCallback(async () => {
    clearScanHintTimer();
    setScanHintVisible(false);
    const s = scannerRef.current;
    scannerRef.current = null;
    if (!s) return;
    try { await s.stop(); } catch { /* already stopped */ }
    try { await s.clear(); } catch { /* already cleared */ }
  }, [clearScanHintTimer]);

  useEffect(() => () => { void stopScanner(); }, [stopScanner]);

  const startScanner = async () => {
    setStep('scanning');
    setScanHintVisible(false);
    setScanSuccess(false);
    setCameraFailed(false);
    cooldownRef.current = false;
    try {
      const { Html5Qrcode } = await import('html5-qrcode');
      const scanner = new Html5Qrcode(scanDivId);
      scannerRef.current = scanner;
      await scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 240, height: 100 } },
        async (decodedText: string) => {
          if (cooldownRef.current) return;
          cooldownRef.current = true;
          setScanSuccess(true);
          await new Promise(r => setTimeout(r, 400));
          await stopScanner();

          // History check: seen this barcode before?
          const hist = findHistoryMatch(decodedText);
          if (hist) {
            setFromHistory(true);
            setConfirmed(hist);
            setStep('confirm');
            return;
          }

          setStep('resolving');
          const product = await identifyProductByBarcode(decodedText);
          const final: ScannedProduct = {
            ...product,
            category: product.category === 'other' && hint ? hint : product.category,
          };
          if (final.found) {
            setFromHistory(false);
            setConfirmed(final);
            setStep('confirm');
          } else {
            // Barcode read but no source resolved it → show 3-option fallback
            setConfirmed({ barcode: decodedText, name: '', category: hint ?? 'other', found: false });
            setStep('not-found');
          }
        },
        () => { /* per-frame decode fail — normal, ignore */ },
      );
      // Show hint after 8s if still scanning
      scanHintTimerRef.current = setTimeout(() => setScanHintVisible(true), 8000);
    } catch {
      await stopScanner();
      setCameraFailed(true);
      setStep('photo-capture');
    }
  };

  // ── Photo ──────────────────────────────────────────────────────────────────

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
        const barcode = result.decodedText;

        const hist = findHistoryMatch(barcode);
        if (hist) {
          setFromHistory(true);
          setConfirmed(hist);
          setStep('confirm');
          return;
        }

        const product = await identifyProductByBarcode(barcode);
        const final: ScannedProduct = {
          ...product,
          category: product.category === 'other' && hint ? hint : product.category,
        };
        if (final.found) {
          setFromHistory(false);
          setConfirmed(final);
          setStep('confirm');
        } else {
          setConfirmed({ barcode, name: '', category: hint ?? 'other', found: false });
          setStep('not-found');
        }
      } catch {
        div.remove();
        // No barcode in photo → fall to manual with image as context
        setStep('manual');
      }
    } catch {
      setStep('manual');
    }
  };

  // ── Manual ─────────────────────────────────────────────────────────────────

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

  // ── Confirm ────────────────────────────────────────────────────────────────

  const handleConfirm = () => {
    if (!confirmed) return;
    // Persist to barcode cache so the next lookup for this product is instant.
    if (confirmed.barcode && confirmed.found) {
      saveLocalProduct(confirmed.barcode, {
        barcode: confirmed.barcode,
        name: confirmed.name,
        brand: confirmed.brand,
        weight: confirmed.weight,
        category: confirmed.category,
        source: 'cache',
      });
    }
    saveToScanHistory({ barcode: confirmed.barcode, product: confirmed, petId, category: confirmed.category });
    onProductConfirmed(confirmed);
  };

  // ── Back navigation ────────────────────────────────────────────────────────

  const canGoBack = step !== 'entry' && step !== 'resolving' && step !== 'photo-processing';


  const goBack = async () => {
    if (step === 'scanning') { await stopScanner(); setStep('entry'); }
    else if (step === 'not-found') { setConfirmed(null); setStep('entry'); }
    else if (step === 'confirm') { setConfirmed(null); setFromHistory(false); setStep('manual'); setQuery(''); }
    else { setStep('entry'); }
  };

  // ── Render sections ────────────────────────────────────────────────────────

  const renderEntry = () => (
    <div className="p-5 pb-8 space-y-5">
      <div className="text-center pt-2 pb-1">
        <p className="text-5xl mb-3">🔍</p>
        <h2 className="text-[19px] font-bold text-gray-900">Como quer identificar?</h2>
        <p className="text-sm text-gray-500 mt-1">Escolha o jeito mais fácil para você</p>
      </div>

      <div className="space-y-3">
        {/* Path 1 — Barcode scan */}
        <button
          type="button"
          onClick={startScanner}
          className="w-full flex items-center gap-4 p-4 bg-blue-50 border border-blue-200 rounded-2xl active:scale-[0.98] transition-all text-left"
        >
          <div className="w-12 h-12 rounded-xl bg-blue-100 flex items-center justify-center text-2xl flex-shrink-0">📷</div>
          <div className="flex-1">
            <p className="font-bold text-blue-900 text-[15px]">Escanear código de barras</p>
            <p className="text-xs text-blue-600 mt-0.5">Aponte a câmera para o código na embalagem</p>
          </div>
          <span className="text-blue-300 text-xl flex-shrink-0">›</span>
        </button>

        {/* Path 2 — Photo */}
        <button
          type="button"
          onClick={() => setStep('photo-capture')}
          className="w-full flex items-center gap-4 p-4 bg-emerald-50 border border-emerald-200 rounded-2xl active:scale-[0.98] transition-all text-left"
        >
          <div className="w-12 h-12 rounded-xl bg-emerald-100 flex items-center justify-center text-2xl flex-shrink-0">🖼️</div>
          <div className="flex-1">
            <p className="font-bold text-emerald-900 text-[15px]">Fotografar a embalagem</p>
            <p className="text-xs text-emerald-600 mt-0.5">Tire uma foto e tentamos identificar o produto</p>
          </div>
          <span className="text-emerald-300 text-xl flex-shrink-0">›</span>
        </button>

        {/* Path 3 — Manual */}
        <button
          type="button"
          onClick={() => setStep('manual')}
          className="w-full flex items-center gap-4 p-4 bg-gray-50 border border-gray-200 rounded-2xl active:scale-[0.98] transition-all text-left"
        >
          <div className="w-12 h-12 rounded-xl bg-gray-100 flex items-center justify-center text-2xl flex-shrink-0">✏️</div>
          <div className="flex-1">
            <p className="font-bold text-gray-800 text-[15px]">Digitar o nome do produto</p>
            <p className="text-xs text-gray-500 mt-0.5">Busque por nome ou marca com sugestões</p>
          </div>
          <span className="text-gray-300 text-xl flex-shrink-0">›</span>
        </button>
      </div>

      {/* History */}
      {history.length > 0 && (
        <div>
          <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-2">
            Produtos que você já usa
          </p>
          <div className="space-y-1.5">
            {history.map((h, i) => (
              <button
                key={i}
                type="button"
                onClick={() => { setFromHistory(true); setConfirmed(h.product); setStep('confirm'); }}
                className="w-full flex items-center gap-3 px-4 py-3 bg-white border border-gray-100 rounded-xl shadow-sm active:scale-[0.98] transition-all text-left"
              >
                <span className="text-xl flex-shrink-0">{CATEGORY_EMOJI[h.product.category]}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-800 truncate">{h.product.name}</p>
                  {h.product.brand && h.product.brand !== h.product.name && (
                    <p className="text-xs text-gray-400 truncate">{h.product.brand}</p>
                  )}
                </div>
                <span className="text-gray-200 text-lg flex-shrink-0">›</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  const renderScanning = () => (
    <div className="flex flex-col">
      {/* Camera area */}
      <div className="relative bg-gray-950 overflow-hidden" style={{ minHeight: 300 }}>
        <div id={scanDivId} className="w-full" style={{ minHeight: 280 }} />
        {/* Viewfinder overlay */}
        <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center">
          <div className="relative" style={{ width: 244, height: 112 }}>
            {/* Corner brackets */}
            <div className="absolute top-0 left-0 w-7 h-7 border-t-[3px] border-l-[3px] border-white rounded-tl-lg" />
            <div className="absolute top-0 right-0 w-7 h-7 border-t-[3px] border-r-[3px] border-white rounded-tr-lg" />
            <div className="absolute bottom-0 left-0 w-7 h-7 border-b-[3px] border-l-[3px] border-white rounded-bl-lg" />
            <div className="absolute bottom-0 right-0 w-7 h-7 border-b-[3px] border-r-[3px] border-white rounded-br-lg" />
            {/* Scan line */}
            <div className="absolute inset-x-4 top-[2px] h-[2px] rounded-full bg-blue-400 shadow-[0_0_6px_2px_rgba(96,165,250,0.7)] animate-scanline" />
          </div>
          <div className="mt-5 px-5 py-2 rounded-full bg-black/60 backdrop-blur-sm">
            <p className="text-white text-sm font-medium">📡 Procurando código...</p>
          </div>
        </div>
        {/* Success flash overlay */}
        {scanSuccess && (
          <div className="absolute inset-0 flex items-center justify-center bg-emerald-500/90 pointer-events-none">
            <div className="text-center text-white">
              <p className="text-4xl mb-2">✓</p>
              <p className="font-bold text-lg">Código encontrado!</p>
            </div>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="p-4 bg-white space-y-3">
        {scanHintVisible ? (
          <div className="flex items-start gap-3 px-3 py-3 bg-amber-50 border border-amber-200 rounded-xl">
            <span className="text-lg flex-shrink-0 mt-0.5">💡</span>
            <div className="flex-1">
              <p className="text-sm font-semibold text-amber-900">Está demorando?</p>
              <p className="text-xs text-amber-700 mt-0.5">Tente aproximar ou use as opções abaixo</p>
            </div>
          </div>
        ) : (
          <p className="text-xs text-gray-500 text-center leading-relaxed">
            Aponte a câmera para o <strong>código de barras</strong> na embalagem e aguarde
          </p>
        )}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={async () => { await stopScanner(); setStep('photo-capture'); }}
            className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-700 active:scale-95 transition-all"
          >
            🖼️ Usar foto
          </button>
          <button
            type="button"
            onClick={async () => { await stopScanner(); setStep('manual'); }}
            className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-700 active:scale-95 transition-all"
          >
            ✏️ Digitar
          </button>
        </div>
      </div>
    </div>
  );

  const renderResolving = () => (
    <div className="flex flex-col items-center justify-center gap-5 py-20 px-6">
      <div className="w-16 h-16 rounded-full bg-blue-50 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-blue-400 border-t-transparent rounded-full animate-spin" />
      </div>
      <div className="text-center">
        <p className="text-emerald-600 font-bold text-base mb-1">✔ Código encontrado</p>
        <p className="font-semibold text-gray-800">Identificando produto...</p>
        <p className="text-sm text-gray-400 mt-1">Consultando múltiplas fontes</p>
      </div>
    </div>
  );

  const renderPhotoCapture = () => (
    <div className="p-5 pb-8 space-y-4">
      {/* Contextual banners */}
      {cameraFailed && (
        <div className="flex items-start gap-3 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl">
          <span className="text-xl mt-0.5 flex-shrink-0">💡</span>
          <p className="text-sm text-amber-800 leading-snug">
            A câmera não abriu. Tire uma foto da embalagem — a gente tenta identificar pelo código!
          </p>
        </div>
      )}
      {!cameraFailed && confirmed?.barcode && !confirmed.found && (
        <div className="flex items-start gap-3 px-4 py-3 bg-blue-50 border border-blue-200 rounded-xl">
          <span className="text-xl mt-0.5 flex-shrink-0">📱</span>
          <p className="text-sm text-blue-800 leading-snug">
            Lemos o código, mas ainda não temos esse produto cadastrado. Uma foto da embalagem pode ajudar a identificar!
          </p>
        </div>
      )}

      <div className="text-center py-4">
        <p className="text-5xl mb-3">📦</p>
        <h3 className="text-[19px] font-bold text-gray-900">Foto da embalagem</h3>
        <p className="text-sm text-gray-500 mt-1">Tire ou escolha uma foto da embalagem do produto</p>
      </div>

      <button
        type="button"
        onClick={() => photoInputRef.current?.click()}
        className="w-full py-4 rounded-2xl bg-emerald-500 text-white text-base font-bold shadow-md active:scale-95 transition-all"
      >
        📷 Tirar foto agora
      </button>

      <button
        type="button"
        onClick={() => setStep('manual')}
        className="w-full py-3 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 active:scale-95 transition-all"
      >
        ✏️ Prefiro digitar o nome
      </button>
    </div>
  );

  const renderPhotoProcessing = () => (
    <div className="flex flex-col items-center justify-center gap-5 py-16 px-6">
      {photoUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={photoUrl}
          alt="Embalagem"
          className="w-40 h-40 rounded-2xl object-cover border border-gray-200 shadow-sm"
        />
      )}
      <div className="w-12 h-12 border-4 border-emerald-400 border-t-transparent rounded-full animate-spin" />
      <div className="text-center">
        <p className="font-semibold text-gray-800">Analisando a foto...</p>
        <p className="text-sm text-gray-400 mt-1">Procurando código de barras na imagem</p>
      </div>
    </div>
  );

  const renderManual = () => (
    <div className="p-5 pb-8 space-y-4">
      {photoUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={photoUrl}
          alt="Embalagem"
          className="w-full max-h-32 object-contain rounded-xl border border-gray-100 bg-gray-50"
        />
      )}

      <div>
        <h3 className="text-[17px] font-bold text-gray-900">
          {photoUrl ? 'O que vous vê escrito na embalagem?' : 'Qual produto é esse?'}
        </h3>
        <p className="text-xs text-gray-400 mt-1">
          {hint ? CATEGORY_HINT[hint] : CATEGORY_HINT['other']}
        </p>
      </div>

      <input
        type="text"
        value={query}
        onChange={e => setQuery(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' && query.trim()) selectManual(query.trim()); }}
        className="w-full border-2 border-gray-200 rounded-xl px-4 py-3.5 text-base focus:outline-none focus:border-blue-400 transition-colors"
        placeholder="Digitar nome ou marca..."
        autoFocus
      />

      {suggestions.length > 0 && (
        <div>
          <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-2">
            {query.trim() ? 'Sugestões' : 'Usados recentemente'}
          </p>
          <div className="space-y-1.5">
            {suggestions.map((s, i) => (
              <button
                key={i}
                type="button"
                onClick={() => selectManual(s)}
                className="w-full flex items-center gap-3 px-4 py-3 bg-white border border-gray-100 rounded-xl shadow-sm active:scale-[0.98] transition-all text-left"
              >
                <span className="text-xl flex-shrink-0">{hint ? CATEGORY_EMOJI[hint] : '📦'}</span>
                <span className="text-sm font-medium text-gray-800 flex-1 truncate">{s}</span>
                <span className="text-gray-200 text-lg flex-shrink-0">›</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {query.trim() && (
        <button
          type="button"
          onClick={() => selectManual(query.trim())}
          className="w-full py-4 rounded-2xl bg-gray-900 text-white font-bold active:scale-95 transition-all"
        >
          Usar &ldquo;{query.trim()}&rdquo;
        </button>
      )}
    </div>
  );

  const renderNotFound = () => (
    <div className="p-5 pb-8 space-y-4">
      <div className="text-center py-4">
        <p className="text-5xl mb-3">🤔</p>
        <h3 className="text-[18px] font-bold text-gray-900">Não consegui identificar</h3>
        <p className="text-sm text-gray-500 mt-1 leading-relaxed">
          Vamos resolver rápido de outro jeito:
        </p>
        {confirmed?.barcode && (
          <p className="text-xs text-gray-300 font-mono mt-2">EAN: {confirmed.barcode}</p>
        )}
      </div>

      <div className="space-y-3">
        <button
          type="button"
          onClick={() => setStep('photo-capture')}
          className="w-full flex items-center gap-4 p-4 bg-emerald-50 border border-emerald-200 rounded-2xl active:scale-[0.98] transition-all text-left"
        >
          <div className="w-12 h-12 rounded-xl bg-emerald-100 flex items-center justify-center text-2xl flex-shrink-0">📷</div>
          <div className="flex-1">
            <p className="font-bold text-emerald-900 text-[15px]">Fotografar a embalagem</p>
            <p className="text-xs text-emerald-600 mt-0.5">Tire uma foto — tentamos identificar pelo visual</p>
          </div>
          <span className="text-emerald-300 text-xl flex-shrink-0">›</span>
        </button>

        <button
          type="button"
          onClick={() => setStep('manual')}
          className="w-full flex items-center gap-4 p-4 bg-blue-50 border border-blue-200 rounded-2xl active:scale-[0.98] transition-all text-left"
        >
          <div className="w-12 h-12 rounded-xl bg-blue-100 flex items-center justify-center text-2xl flex-shrink-0">✏️</div>
          <div className="flex-1">
            <p className="font-bold text-blue-900 text-[15px]">Digitar o produto</p>
            <p className="text-xs text-blue-600 mt-0.5">Digite o nome ou marca com sugestões</p>
          </div>
          <span className="text-blue-300 text-xl flex-shrink-0">›</span>
        </button>

        <button
          type="button"
          onClick={() => { setQuery(''); setStep('manual'); }}
          className="w-full flex items-center gap-4 p-4 bg-gray-50 border border-gray-200 rounded-2xl active:scale-[0.98] transition-all text-left"
        >
          <div className="w-12 h-12 rounded-xl bg-gray-100 flex items-center justify-center text-2xl flex-shrink-0">📋</div>
          <div className="flex-1">
            <p className="font-bold text-gray-800 text-[15px]">Escolher da lista</p>
            <p className="text-xs text-gray-500 mt-0.5">Veja produtos comuns por categoria</p>
          </div>
          <span className="text-gray-300 text-xl flex-shrink-0">›</span>
        </button>
      </div>
    </div>
  );

  const renderConfirm = () => {
    if (!confirmed) return null;
    return (
      <div className="p-5 pb-8 space-y-4">
        {fromHistory && (
          <div className="flex items-center gap-3 px-4 py-3 bg-blue-50 border border-blue-200 rounded-xl">
            <span className="text-xl">⭐</span>
            <p className="text-sm font-semibold text-blue-800">
              Parece ser este produto que você já usa!
            </p>
          </div>
        )}

        {photoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={photoUrl}
            alt="Embalagem"
            className="w-full max-h-40 object-contain rounded-xl border border-gray-100 bg-gray-50"
          />
        )}

        {/* Product card */}
        <div className="rounded-2xl border-2 border-emerald-200 bg-emerald-50 p-5 space-y-3">
          <p className="text-[11px] font-bold text-emerald-600 uppercase tracking-wider">
            {fromHistory ? 'Produto reconhecido' : '✓ Encontrei este produto'}
          </p>
          <div>
            <p className="text-xl font-bold text-gray-900 leading-tight">
              {confirmed.name || 'Produto identificado'}
            </p>
            {confirmed.brand && confirmed.brand !== confirmed.name && (
              <p className="text-sm text-gray-500 mt-0.5">{confirmed.brand}</p>
            )}
            {confirmed.weight && (
              <p className="text-sm text-gray-400 mt-0.5">{confirmed.weight}</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xl">{CATEGORY_EMOJI[confirmed.category]}</span>
            <span className="text-sm text-gray-600">{CATEGORY_LABELS[confirmed.category]}</span>
            {confirmed.barcode && (
              <span className="ml-auto text-[10px] text-gray-300 font-mono">
                #{confirmed.barcode.slice(-6)}
              </span>
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={handleConfirm}
          className="w-full py-4 rounded-2xl bg-emerald-500 text-white text-base font-bold shadow-md active:scale-95 transition-all"
        >
          ✓ Está certo — usar este produto
        </button>

        <button
          type="button"
          onClick={() => { setConfirmed(null); setFromHistory(false); setStep('manual'); setQuery(''); }}
          className="w-full py-3 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 active:scale-95 transition-all"
        >
          Não, escolher outro
        </button>
      </div>
    );
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <ModalPortal>
      {/* Hidden camera/gallery input */}
      <input
        ref={photoInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={e => {
          const file = e.target.files?.[0];
          if (file) void handlePhotoFile(file);
          e.target.value = '';
        }}
      />

      <div className="fixed inset-0 z-[200] flex flex-col items-end justify-end sm:items-center sm:justify-center">
        {/* Backdrop */}
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

        {/* Sheet */}
        <div
          className="relative w-full max-w-lg bg-white rounded-t-[28px] sm:rounded-[28px] flex flex-col overflow-hidden animate-slideUp sm:animate-scaleIn shadow-2xl"
          style={{ maxHeight: '92dvh' }}
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center gap-3 px-5 pt-4 pb-3 border-b border-gray-100 flex-shrink-0">
            {canGoBack && (
              <button
                type="button"
                onClick={goBack}
                className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center text-gray-700 text-xl font-bold active:scale-95 transition-all flex-shrink-0"
                aria-label="Voltar"
              >
                ‹
              </button>
            )}
            <div className="flex-1 min-w-0">
              <h2 className="text-[16px] font-bold text-gray-900 leading-tight">{STEP_TITLE[step]}</h2>
              {petName && <p className="text-xs text-gray-400 truncate">{petName}</p>}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 hover:bg-gray-200 active:scale-95 transition-all flex-shrink-0"
              aria-label="Fechar"
            >
              ✕
            </button>
          </div>

          {/* Scrollable body */}
          <div className="flex-1 overflow-y-auto overscroll-contain">
            {step === 'entry'             && renderEntry()}
            {step === 'scanning'          && renderScanning()}
            {step === 'resolving'         && renderResolving()}
            {step === 'photo-capture'     && renderPhotoCapture()}
            {step === 'photo-processing'  && renderPhotoProcessing()}
            {step === 'manual'            && renderManual()}
            {step === 'not-found'         && renderNotFound()}
            {step === 'confirm'           && renderConfirm()}
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
