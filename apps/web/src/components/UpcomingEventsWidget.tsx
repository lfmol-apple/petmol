'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { API_BASE_URL } from '@/lib/api';
import { BrandedCard } from '@/components/brand';

interface Event {
  id: string;
  pet_id: string;
  type: string;
  status: string;
  scheduled_at: string;
  title: string;
  location_name: string | null;
}

const EVENT_ICONS: Record<string, string> = {
  bath: '🛁',
  grooming: '✂️',
  bath_grooming: '🛁✂️',
  vaccine: '💉',
  dewormer: '💊',
  flea_tick: '🦟',
  vet_appointment: '🏥',
  medication: '💊',
  other: '📅',
};

export default function UpcomingEventsWidget() {
  const { token, isAuthenticated } = useAuth();
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isAuthenticated) {
      loadUpcomingEvents();
    }
  }, [isAuthenticated]);

  const loadUpcomingEvents = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/events/upcoming/summary?days=7&limit=3`, {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {},
        credentials: 'include',
      });

      if (response.ok) {
        const data = await response.json();
        setEvents(data);
      }
    } catch (error) {
      console.error('Erro ao carregar eventos próximos:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-xl p-6 shadow-sm">
        <div className="animate-pulse">
          <div className="h-6 bg-gray-200 rounded w-1/3 mb-4"></div>
          <div className="space-y-3">
            <div className="h-16 bg-gray-100 rounded"></div>
            <div className="h-16 bg-gray-100 rounded"></div>
          </div>
        </div>
      </div>
    );
  }

  if (events.length === 0) {
    return null; // Não mostrar nada se não houver eventos - os cards de EventsCards já cobrem isso
  }

  return (
    <BrandedCard theme="ocean" className="" innerClassName="">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold text-white">📅 Próximos 7 Dias</h2>
        <Link href="/home/events" className="text-sm text-white/70 hover:text-white font-medium">
          Ver todos
        </Link>
      </div>

      <div className="space-y-3">
        {events.map((event) => {
          const eventDate = new Date(event.scheduled_at);
          const isToday = eventDate.toDateString() === new Date().toDateString();
          const icon = EVENT_ICONS[event.type] || EVENT_ICONS.other;

          return (
            <Link
              key={event.id}
              href={`/home/events/${event.id}`}
              className="block p-3 bg-white/10 hover:bg-white/20 rounded-lg transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="text-2xl">{icon}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-white truncate">{event.title}</p>
                    {isToday && (
                      <span className="px-2 py-0.5 bg-yellow-400/20 text-yellow-200 text-xs font-medium rounded-full">
                        Hoje
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-sm text-white/60">
                    <span>📅 {eventDate.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}</span>
                    {event.location_name && (
                      <span className="truncate">📍 {event.location_name}</span>
                    )}
                  </div>
                </div>
              </div>
            </Link>
          );
        })}
      </div>

      <div className="mt-4 pt-4 border-t border-white/20">
        <Link
          href="/home/events/new"
          className="block w-full py-2 text-center bg-white/10 text-white font-medium rounded-lg hover:bg-white/20 transition-colors"
        >
          + Criar Novo Evento
        </Link>
      </div>
    </BrandedCard>
  );
}
