/**
 * Anti-spam utilities for Event Engine
 * 
 * - Global cooldown (24h entre prompts)
 * - Quiet hours (22h-8h sem prompts)
 * - Place-specific cooldown (7 dias)
 */

import { getConfig, updateConfig } from './storage';
import { EventEngineConfig } from './types';

export interface LastPromptInfo {
  timestamp: string; // ISO date
  place_id: string;
  candidate_id: string;
}

const LAST_PROMPT_KEY = 'petmol_event_engine_last_prompt';

/**
 * Verifica se estamos em quiet hours (horário de silêncio)
 */
export function isQuietHours(config: EventEngineConfig): boolean {
  if (!config.quiet_hours.enabled) return false;

  const now = new Date();
  const hour = now.getHours();
  const { start_hour, end_hour } = config.quiet_hours;

  // Handle overnight range (e.g., 22h-8h)
  if (start_hour > end_hour) {
    return hour >= start_hour || hour < end_hour;
  }

  return hour >= start_hour && hour < end_hour;
}

/**
 * Verifica cooldown global (24h entre prompts)
 */
export function checkGlobalCooldown(config: EventEngineConfig): {
  canPrompt: boolean;
  lastPrompt?: LastPromptInfo;
  remainingMinutes?: number;
} {
  const lastPromptStr = localStorage.getItem(LAST_PROMPT_KEY);
  if (!lastPromptStr) return { canPrompt: true };

  const lastPrompt: LastPromptInfo = JSON.parse(lastPromptStr);
  const lastTime = new Date(lastPrompt.timestamp).getTime();
  const now = Date.now();
  const cooldownMs = config.global_pause_hours * 60 * 60 * 1000;

  const elapsed = now - lastTime;
  const remaining = cooldownMs - elapsed;

  if (remaining <= 0) {
    return { canPrompt: true, lastPrompt };
  }

  return {
    canPrompt: false,
    lastPrompt,
    remainingMinutes: Math.ceil(remaining / (60 * 1000)),
  };
}

/**
 * Registra que um prompt foi exibido
 */
export function recordPrompt(place_id: string, candidate_id: string): void {
  const info: LastPromptInfo = {
    timestamp: new Date().toISOString(),
    place_id,
    candidate_id,
  };

  localStorage.setItem(LAST_PROMPT_KEY, JSON.stringify(info));
}

/**
 * Verifica se pode exibir prompt (valida quiet hours + cooldown global)
 */
export async function canShowPrompt(): Promise<{
  allowed: boolean;
  reason?: 'quiet_hours' | 'global_cooldown';
  remainingMinutes?: number;
}> {
  const config = await getConfig();

  // Check quiet hours first
  if (isQuietHours(config)) {
    return {
      allowed: false,
      reason: 'quiet_hours',
    };
  }

  // Check global cooldown
  const cooldown = checkGlobalCooldown(config);
  if (!cooldown.canPrompt) {
    return {
      allowed: false,
      reason: 'global_cooldown',
      remainingMinutes: cooldown.remainingMinutes,
    };
  }

  return { allowed: true };
}

/**
 * Limpa cooldown global (para testes/debug)
 */
export function clearGlobalCooldown(): void {
  localStorage.removeItem(LAST_PROMPT_KEY);
}

/**
 * Pausa todos os prompts por X horas
 */
export async function pauseAllPrompts(hours: number): Promise<void> {
  const config = await getConfig();
  await updateConfig({
    global_pause_hours: hours,
  });

  // Record fake prompt to trigger cooldown
  recordPrompt('__pause__', '__pause__');
}

/**
 * Ativa/desativa quiet hours
 */
export async function setQuietHours(
  enabled: boolean,
  start_hour?: number,
  end_hour?: number
): Promise<void> {
  const config = await getConfig();
  
  await updateConfig({
    quiet_hours: {
      ...config.quiet_hours,
      enabled,
      ...(start_hour !== undefined && { start_hour }),
      ...(end_hour !== undefined && { end_hour }),
    },
  });
}
