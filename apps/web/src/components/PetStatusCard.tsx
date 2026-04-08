'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useI18n } from '@/lib/I18nContext';
import { PawWatermark } from '@/components/brand';
import { getHealthProfile, getHealthSummary, getUpcomingVaccines, getActivePrescriptions } from '@/lib/petHealth';
import type { PetHealthProfile } from '@/lib/petHealth';

interface PetStatusCardProps {
  petId: string;
}

interface HealthIndicator {
  icon: string;
  label: string;
  status: 'ok' | 'warning' | 'critical' | 'unknown';
  message: string;
  href: string;
  daysUntil?: number;
}

export function PetStatusCard({ petId }: PetStatusCardProps) {
  const { t } = useI18n();
  const [profile, setProfile] = useState<PetHealthProfile | null>(null);
  const [indicators, setIndicators] = useState<HealthIndicator[]>([]);

  useEffect(() => {
    loadPetStatus();
  }, [petId]);

  const getDaysSince = (dateStr: string): number => {
    const date = new Date(dateStr);
    const now = new Date();
    return Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
  };

  const getDaysUntil = (dateStr: string): number => {
    const date = new Date(dateStr);
    const now = new Date();
    return Math.floor((date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  };

  const loadPetStatus = () => {
    try {
      const petProfile = getHealthProfile(petId);
      if (!petProfile) return;
      
      setProfile(petProfile);

      const upcomingVaccines = getUpcomingVaccines(petId, 90); // 90 dias
      const activeMeds = getActivePrescriptions(petId);

      const healthIndicators: HealthIndicator[] = [];

      // 1. Vacinas
      const vaccineDueDate = upcomingVaccines.length > 0 ? upcomingVaccines[0].next_dose_date : null;
      let vaccineStatus: 'ok' | 'warning' | 'critical' = 'ok';
      let vaccineMessage = 'Em dia';
      let vaccineDays: number | undefined;

      if (vaccineDueDate) {
        vaccineDays = getDaysUntil(vaccineDueDate);
        if (vaccineDays < 0) {
          vaccineStatus = 'critical';
          vaccineMessage = `Atrasada ${Math.abs(vaccineDays)}d`;
        } else if (vaccineDays <= 7) {
          vaccineStatus = 'critical';
          vaccineMessage = `${vaccineDays}d para vencer`;
        } else if (vaccineDays <= 30) {
          vaccineStatus = 'warning';
          vaccineMessage = `${vaccineDays}d para vencer`;
        } else {
          vaccineStatus = 'ok';
          vaccineMessage = `Próxima em ${vaccineDays}d`;
        }
      } else {
        vaccineStatus = 'ok';
        vaccineMessage = 'Não registrada';
      }

      healthIndicators.push({
        icon: '💉',
        label: t('common.vaccines'),
        status: vaccineStatus,
        message: vaccineMessage,
        href: `/health/${petId}/vaccines`,
        daysUntil: vaccineDays
      });

      // 2. Vermífugo (baseado em última aplicação - deve ser a cada 3 meses)
      const lastDeworming = petProfile.prescriptions
        ?.filter(p => p.medication_name.toLowerCase().includes('vermif') || 
                      p.medication_name.toLowerCase().includes('worm'))
        .sort((a, b) => new Date(b.start_date).getTime() - new Date(a.start_date).getTime())[0];

      let dewormingStatus: 'ok' | 'warning' | 'critical' | 'unknown' = 'unknown';
      let dewormingMessage = 'Não registrado';
      let dewormingDays: number | undefined;

      if (lastDeworming) {
        const daysSince = getDaysSince(lastDeworming.start_date);
        dewormingDays = 90 - daysSince;
        
        if (daysSince > 120) { // Mais de 4 meses
          dewormingStatus = 'critical';
          dewormingMessage = `Atrasado ${daysSince - 90}d`;
        } else if (daysSince > 90) { // Mais de 3 meses
          dewormingStatus = 'warning';
          dewormingMessage = `Atrasado ${daysSince - 90}d`;
        } else {
          dewormingStatus = 'ok';
          dewormingMessage = `Aplicado há ${daysSince}d`;
        }
      }

      healthIndicators.push({
        icon: '🐛',
        label: 'Vermífugo',
        status: dewormingStatus,
        message: dewormingMessage,
        href: `/health/${petId}/prescriptions`,
        daysUntil: dewormingDays
      });

      // 3. Coleira Leishmaniose (validade típica 6 meses)
      const lastLeishCollar = petProfile.prescriptions
        ?.filter(p => p.medication_name.toLowerCase().includes('leish') || 
                      p.medication_name.toLowerCase().includes('coleira'))
        .sort((a, b) => new Date(b.start_date).getTime() - new Date(a.start_date).getTime())[0];

      let leishStatus: 'ok' | 'warning' | 'critical' | 'unknown' = 'unknown';
      let leishMessage = 'Não registrado';
      let leishDays: number | undefined;

      if (profile && profile.species === 'dog') { // Só relevante para cães
        if (lastLeishCollar) {
          const daysSince = getDaysSince(lastLeishCollar.start_date);
          leishDays = 180 - daysSince;
          
          if (daysSince > 210) { // Mais de 7 meses
            leishStatus = 'critical';
            leishMessage = `Vencida há ${daysSince - 180}d`;
          } else if (daysSince > 180) { // Mais de 6 meses
            leishStatus = 'warning';
            leishMessage = `Vencida há ${daysSince - 180}d`;
          } else if (daysSince > 150) { // Perto de vencer
            leishStatus = 'warning';
            leishMessage = `${180 - daysSince}d para trocar`;
          } else {
            leishStatus = 'ok';
            leishMessage = `Válida (${daysSince}d)`;
          }
        } else {
          leishStatus = 'warning';
          leishMessage = 'Não registrada';
        }

        healthIndicators.push({
          icon: '🦟',
          label: 'Leish. Coleira',
          status: leishStatus,
          message: leishMessage,
          href: `/health/${petId}/prescriptions`,
          daysUntil: leishDays
        });
      }

      // 4. Medicamentos Ativos
      const medsStatus: 'ok' | 'warning' | 'critical' | 'unknown' = activeMeds.length > 0 ? 'warning' : 'ok';
      const medsMessage = activeMeds.length > 0 
        ? `${activeMeds.length} ativa(s)`
        : 'Nenhuma ativa';

      healthIndicators.push({
        icon: '💊',
        label: 'Medicação',
        status: medsStatus,
        message: medsMessage,
        href: `/health/${petId}/prescriptions`,
        daysUntil: undefined
      });

      // 5. Exames/Checkup (recomendado anual)
      const lastExam = petProfile.exams
        ?.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];

      let examStatus: 'ok' | 'warning' | 'critical' | 'unknown' = 'unknown';
      let examMessage = 'Não registrado';
      let examDays: number | undefined;

      if (lastExam) {
        const daysSince = getDaysSince(lastExam.date);
        examDays = 365 - daysSince;
        
        if (daysSince > 400) {
          examStatus = 'warning';
          examMessage = `Há ${Math.floor(daysSince / 30)}m`;
        } else if (daysSince > 365) {
          examStatus = 'warning';
          examMessage = `Há ${Math.floor(daysSince / 30)}m`;
        } else {
          examStatus = 'ok';
          examMessage = `Há ${Math.floor(daysSince / 30)}m`;
        }
      }

      healthIndicators.push({
        icon: '🩺',
        label: 'Checkup',
        status: examStatus,
        message: examMessage,
        href: `/health/${petId}/exams`,
        daysUntil: examDays
      });

      // 6. Próxima Consulta
      const nextAppointment = petProfile.appointments
        ?.filter(a => new Date(a.date) > new Date())
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())[0];

      let appointmentStatus: 'ok' | 'warning' | 'critical' | 'unknown' = 'ok';
      let appointmentMessage = 'Nenhuma agendada';
      let appointmentDays: number | undefined;

      if (nextAppointment) {
        appointmentDays = getDaysUntil(nextAppointment.date);
        
        if (appointmentDays <= 1) {
          appointmentStatus = 'critical';
          appointmentMessage = appointmentDays === 0 ? 'Hoje!' : 'Amanhã!';
        } else if (appointmentDays <= 7) {
          appointmentStatus = 'warning';
          appointmentMessage = `Em ${appointmentDays}d`;
        } else {
          appointmentStatus = 'ok';
          appointmentMessage = `Em ${appointmentDays}d`;
        }
      }

      healthIndicators.push({
        icon: '📅',
        label: 'Consulta',
        status: appointmentStatus,
        message: appointmentMessage,
        href: `/health/${petId}/appointments`,
        daysUntil: appointmentDays
      });

      setIndicators(healthIndicators);
    } catch (error) {
      console.error('Error loading pet status:', error);
    }
  };

  if (!profile) return null;

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ok': return 'bg-green-100 border-green-300 text-green-800';
      case 'warning': return 'bg-amber-100 border-amber-300 text-amber-800';
      case 'critical': return 'bg-red-100 border-red-300 text-red-800';
      default: return 'bg-slate-100 border-slate-300 text-slate-600';
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'ok': return '✅';
      case 'warning': return '⚠️';
      case 'critical': return '🚨';
      default: return '❓';
    }
  };

  return (
    <div className="relative bg-gradient-to-br from-white to-slate-50 border-2 border-slate-200 rounded-3xl shadow-xl hover:shadow-2xl transition-all duration-300 overflow-hidden">
      <PawWatermark opacity={0.06} scale={1.4} colorClass="text-slate-500" position="br" />
      {/* FOTO GRANDE EM DESTAQUE */}
      <div className="block">
        <div className="relative h-96 bg-gradient-to-br from-purple-400 to-blue-500 overflow-hidden group">
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-purple-300 to-blue-400">
            <div className="text-[12rem] opacity-90">
              {profile.species === 'dog' ? '🐕' : profile.species === 'cat' ? '🐱' : '🐾'}
            </div>
          </div>
          {profile.photo && (() => {
            const configured = String(process.env.NEXT_PUBLIC_PHOTOS_BASE_URL ?? process.env.NEXT_PUBLIC_SITE_URL ?? '')
              .replace(/\/api\/?$/, '')
              .replace(/\/$/, '');
            const base = configured || (typeof window !== 'undefined' ? window.location.origin : '');
            const normalized = String(profile.photo).replace(/^\/+/, '');
            const photoPath = normalized.startsWith('uploads/') ? `/${normalized}` : `/uploads/${normalized}`;
            const src = profile.photo.startsWith('http') || profile.photo.startsWith('data:')
              ? profile.photo
              : `${base}${photoPath}`;
            return (
              <img 
                src={src} 
                alt={profile.pet_name}
                className="absolute inset-0 w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                onError={(e) => (e.currentTarget.style.display = 'none')}
              />
            );
          })()}
          
          {/* Overlay com nome e info */}
          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/95 via-black/70 to-transparent p-6">
            <h2 className="text-4xl font-bold text-white drop-shadow-lg mb-2">
              {profile.pet_name}
            </h2>
            <div className="flex items-center gap-3 text-white/95 font-medium text-lg mb-3">
              <span>{profile.breed || (profile.species === 'dog' ? 'Cachorro' : 'Gato')}</span>
              {profile.birth_date && (
                <>
                  <span>•</span>
                  <span>{new Date().getFullYear() - new Date(profile.birth_date).getFullYear()} anos</span>
                </>
              )}
            </div>
            <div className="flex items-center gap-2 text-white/90 text-sm font-semibold">
              <span>📊</span>
              <span>Monitor de Saúde</span>
            </div>
          </div>
        </div>
      </div>

      {/* INDICADORES DE SAÚDE - Grid 2x3 */}
      <div className="p-6">
        <div className="grid grid-cols-2 gap-4">
          {indicators.map((indicator, index) => (
            <Link 
              key={index}
              href={indicator.href}
              className={`block p-4 border-2 rounded-2xl transition-all hover:scale-105 hover:shadow-lg ${getStatusColor(indicator.status)}`}
            >
              <div className="flex items-center gap-3">
                <span className="text-4xl">{indicator.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-bold">{indicator.label}</span>
                    <span className="text-xl">{getStatusBadge(indicator.status)}</span>
                  </div>
                  <div className="text-xs font-semibold opacity-90 truncate">
                    {indicator.message}
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>

        {/* Footer com link para perfil completo */}
        <Link 
          href={`/health/${petId}`}
          className="mt-5 pt-4 border-t-2 border-slate-200 flex items-center justify-center gap-2 text-sm hover:bg-purple-50 -mx-6 -mb-6 px-6 pb-6 rounded-b-3xl transition-colors group"
        >
          <span className="text-slate-700 font-semibold">Ver Perfil Completo de Saúde</span>
          <span className="text-purple-600 font-bold text-lg group-hover:translate-x-1 transition-transform">
            →
          </span>
        </Link>
      </div>
    </div>
  );
}
