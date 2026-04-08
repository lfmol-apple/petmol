'use client';

import { useAuth } from '@/contexts/AuthContext';
import { WifiOff, Wifi } from 'lucide-react';
import { useEffect, useState } from 'react';

export function OfflineIndicator() {
  const { isOfflineMode } = useAuth();
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Só mostra depois de um pequeno delay para evitar flash
    if (isOfflineMode) {
      const timer = setTimeout(() => setIsVisible(true), 300);
      return () => clearTimeout(timer);
    } else {
      setIsVisible(false);
    }
  }, [isOfflineMode]);

  if (!isVisible) return null;

  return (
    <div className="fixed top-16 left-1/2 transform -translate-x-1/2 z-50">
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg shadow-lg px-4 py-2 flex items-center gap-2 animate-in slide-in-from-top duration-300">
        <WifiOff className="w-4 h-4 text-yellow-600" />
        <span className="text-sm text-yellow-800 font-medium">
          Modo offline - Visualizando dados salvos
        </span>
      </div>
    </div>
  );
}

export function ConnectivityStatus() {
  const { isOfflineMode } = useAuth();
  const [showReconnected, setShowReconnected] = useState(false);
  const [wasOffline, setWasOffline] = useState(false);

  useEffect(() => {
    if (wasOffline && !isOfflineMode) {
      // Voltou online
      setShowReconnected(true);
      const timer = setTimeout(() => setShowReconnected(false), 3000);
      return () => clearTimeout(timer);
    }
    
    if (isOfflineMode) {
      setWasOffline(true);
    }
  }, [isOfflineMode, wasOffline]);

  if (showReconnected) {
    return (
      <div className="fixed top-16 left-1/2 transform -translate-x-1/2 z-50">
        <div className="bg-green-50 border border-green-200 rounded-lg shadow-lg px-4 py-2 flex items-center gap-2 animate-in slide-in-from-top duration-300">
          <Wifi className="w-4 h-4 text-green-600" />
          <span className="text-sm text-green-800 font-medium">
            Conexão restabelecida!
          </span>
        </div>
      </div>
    );
  }

  return null;
}
