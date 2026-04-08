'use client'

import { useEffect } from 'react'
import { API_BASE_URL } from '@/lib/api'

interface ProviderSheetProps {
  isOpen: boolean
  onClose: () => void
  placeId: string
  placeName: string
  lat?: number
  lng?: number
  category?: string
}

type Provider = 'waze' | 'gmaps' | 'apple'

export default function ProviderSheet({
  isOpen,
  onClose,
  placeId,
  placeName,
  lat,
  lng,
  category = 'other',
}: ProviderSheetProps) {
  // Close on ESC key
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    if (isOpen) {
      window.addEventListener('keydown', handleEsc)
      // Prevent body scroll
      document.body.style.overflow = 'hidden'
    }
    return () => {
      window.removeEventListener('keydown', handleEsc)
      document.body.style.overflow = 'unset'
    }
  }, [isOpen, onClose])

  const handleProviderClick = (provider: Provider) => {
    // Build handoff URL with provider parameter
    const params = new URLSearchParams({
      place_id: placeId,
      service_category: category,
      place_name: placeName,
      provider,
    })
    if (lat) params.set('lat', lat.toString())
    if (lng) params.set('lng', lng.toString())

    const url = `${API_BASE_URL}/handoff/directions?${params.toString()}`
    
    // Open in new tab (for deep links, browser will handle native app)
    window.open(url, '_blank')
    
    // Close sheet
    onClose()
  }

  if (!isOpen) return null

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40 transition-opacity"
        onClick={onClose}
      />

      {/* Sheet */}
      <div className="fixed inset-x-0 bottom-0 z-50 animate-slide-up">
        <div className="bg-white rounded-t-3xl shadow-2xl max-w-lg mx-auto">
          {/* Handle */}
          <div className="flex justify-center pt-3 pb-2">
            <div className="w-12 h-1.5 bg-gray-300 rounded-full" />
          </div>

          {/* Header */}
          <div className="px-6 pb-4 border-b border-gray-200">
            <h3 className="text-lg font-bold text-gray-900">Escolha o app de navegação</h3>
            <p className="text-sm text-gray-600 mt-1 truncate">{placeName}</p>
          </div>

          {/* Provider Options */}
          <div className="p-6 space-y-3">
            {/* Waze */}
            <button
              onClick={() => handleProviderClick('waze')}
              className="w-full flex items-center gap-4 p-4 bg-gradient-to-r from-cyan-50 to-blue-50 hover:from-cyan-100 hover:to-blue-100 border-2 border-cyan-200 rounded-2xl transition-all duration-200 transform hover:scale-[1.02] active:scale-[0.98]"
            >
              <div className="w-12 h-12 bg-cyan-500 rounded-xl flex items-center justify-center text-2xl shadow-md">
                🚗
              </div>
              <div className="flex-1 text-left">
                <div className="font-bold text-gray-900">Waze</div>
                <div className="text-xs text-gray-600">Rotas inteligentes com trânsito em tempo real</div>
              </div>
              <div className="text-gray-400">→</div>
            </button>

            {/* Google Maps */}
            <button
              onClick={() => handleProviderClick('gmaps')}
              className="w-full flex items-center gap-4 p-4 bg-gradient-to-r from-green-50 to-emerald-50 hover:from-green-100 hover:to-emerald-100 border-2 border-green-200 rounded-2xl transition-all duration-200 transform hover:scale-[1.02] active:scale-[0.98]"
            >
              <div className="w-12 h-12 bg-green-500 rounded-xl flex items-center justify-center text-2xl shadow-md">
                🗺️
              </div>
              <div className="flex-1 text-left">
                <div className="font-bold text-gray-900">Google Maps</div>
                <div className="text-xs text-gray-600">Navegação completa com Street View</div>
              </div>
              <div className="text-gray-400">→</div>
            </button>

            {/* Apple Maps */}
            <button
              onClick={() => handleProviderClick('apple')}
              className="w-full flex items-center gap-4 p-4 bg-gradient-to-r from-gray-50 to-slate-50 hover:from-gray-100 hover:to-slate-100 border-2 border-gray-200 rounded-2xl transition-all duration-200 transform hover:scale-[1.02] active:scale-[0.98]"
            >
              <div className="w-12 h-12 bg-gray-700 rounded-xl flex items-center justify-center text-2xl shadow-md">
                🍎
              </div>
              <div className="flex-1 text-left">
                <div className="font-bold text-gray-900">Apple Maps</div>
                <div className="text-xs text-gray-600">Integrado com dispositivos Apple</div>
              </div>
              <div className="text-gray-400">→</div>
            </button>
          </div>

          {/* Cancel */}
          <div className="px-6 pb-6">
            <button
              onClick={onClose}
              className="w-full py-3 text-gray-600 font-medium hover:bg-gray-100 rounded-xl transition-colors"
            >
              Cancelar
            </button>
          </div>
        </div>
      </div>

      <style jsx>{`
        @keyframes slide-up {
          from {
            transform: translateY(100%);
          }
          to {
            transform: translateY(0);
          }
        }
        .animate-slide-up {
          animation: slide-up 0.3s ease-out;
        }
      `}</style>
    </>
  )
}
