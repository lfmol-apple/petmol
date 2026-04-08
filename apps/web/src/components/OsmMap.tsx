'use client';

import { useEffect, useRef } from 'react';

interface Marker {
  id: string;
  lat: number;
  lng: number;
  title: string;
  subtitle?: string;
}

interface OsmMapProps {
  center: { lat: number; lng: number };
  markers: Marker[];
  zoom?: number;
  className?: string;
}

export function OsmMap({ center, markers, zoom = 13, className = 'w-full h-96' }: OsmMapProps) {
  const mapRef = useRef<ReturnType<typeof import('leaflet')['map']> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Dynamically import Leaflet (client-only)
    import('leaflet').then((L) => {
      if (!containerRef.current) return;
      if (mapRef.current) {
        mapRef.current.remove();
      }

      // Create map
      const map = L.map(containerRef.current).setView([center.lat, center.lng], zoom);

      // Add OSM tile layer
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 19,
      }).addTo(map);

      // Add markers
      markers.forEach((marker) => {
        const icon = L.divIcon({
          className: 'custom-marker',
          html: `
            <div style="
              background: #ef4444;
              width: 32px;
              height: 32px;
              border-radius: 50% 50% 50% 0;
              transform: rotate(-45deg);
              border: 3px solid white;
              box-shadow: 0 2px 8px rgba(0,0,0,0.3);
              display: flex;
              align-items: center;
              justify-content: center;
            ">
              <span style="transform: rotate(45deg); font-size: 16px;">📍</span>
            </div>
          `,
          iconSize: [32, 32],
          iconAnchor: [16, 32],
          popupAnchor: [0, -32],
        });

        const markerInstance = L.marker([marker.lat, marker.lng], { icon }).addTo(map);

        const popupContent = `
          <div style="padding: 4px;">
            <strong style="font-size: 14px;">${marker.title}</strong>
            ${marker.subtitle ? `<div style="font-size: 12px; color: #666; margin-top: 2px;">${marker.subtitle}</div>` : ''}
          </div>
        `;

        markerInstance.bindPopup(popupContent);
      });

      // Fit bounds if multiple markers
      if (markers.length > 1) {
        const bounds = L.latLngBounds(markers.map(m => [m.lat, m.lng]));
        map.fitBounds(bounds, { padding: [50, 50] });
      }

      mapRef.current = map;
    });

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [center, markers, zoom]);

  return <div ref={containerRef} className={className} />;
}
