/**
 * Medical Assistant - Intelligent post-visit questionnaire
 * Helps capture comprehensive medical information after clinic visits
 */

import { localTodayISO } from '@/lib/localDate';

export interface AssistantQuestion {
  id: string;
  question: string;
  type: 'text' | 'select' | 'multiselect' | 'yesno' | 'number' | 'date' | 'file';
  options?: string[];
  required: boolean;
  dependsOn?: {
    questionId: string;
    answer: string | boolean | number;
  };
  placeholder?: string;
  hint?: string;
}

export interface AssistantFlow {
  id: string;
  name: string;
  description: string;
  icon: string;
  questions: AssistantQuestion[];
}

export interface AssistantResponse {
  flowId: string;
  clinicName?: string;
  veterinarian?: string;
  answers: Record<string, unknown>;
  documents: Record<string, string[]>; // questionId -> base64 files
  completed_at: number;
}

/**
 * Pre-defined assistant flows for common scenarios
 */
export const ASSISTANT_FLOWS: Record<string, AssistantFlow> = {
  consultation: {
    id: 'consultation',
    name: 'Consulta Veterinária',
    description: 'Registro completo de consulta',
    icon: '🏥',
    questions: [
      {
        id: 'reason',
        question: 'Qual foi o motivo da consulta?',
        type: 'text',
        required: true,
        placeholder: 'Ex: Check-up de rotina, vômitos, diarreia...',
      },
      {
        id: 'symptoms',
        question: 'Quais sintomas seu pet apresentava?',
        type: 'multiselect',
        required: false,
        options: [
          'Vômito',
          'Diarreia',
          'Falta de apetite',
          'Letargia',
          'Febre',
          'Tosse',
          'Espirros',
          'Coceira',
          'Feridas',
          'Claudicação',
          'Outro',
        ],
      },
      {
        id: 'diagnosis',
        question: 'Qual foi o diagnóstico do veterinário?',
        type: 'text',
        required: true,
        placeholder: 'Ex: Gastroenterite, alergia alimentar...',
      },
      {
        id: 'exams_done',
        question: 'Foram feitos exames?',
        type: 'yesno',
        required: true,
      },
      {
        id: 'exam_types',
        question: 'Quais exames foram realizados?',
        type: 'multiselect',
        required: false,
        dependsOn: {
          questionId: 'exams_done',
          answer: true,
        },
        options: [
          'Hemograma completo',
          'Exame de urina',
          'Exame de fezes',
          'Raio-X',
          'Ultrassom',
          'Ecocardiograma',
          'Biópsia',
          'Teste de alergia',
          'Outro',
        ],
      },
      {
        id: 'exam_files',
        question: 'Faça upload dos resultados dos exames',
        type: 'file',
        required: false,
        dependsOn: {
          questionId: 'exams_done',
          answer: true,
        },
        hint: 'Tire foto ou selecione PDF dos resultados',
      },
      {
        id: 'prescription',
        question: 'Foi prescrito algum medicamento?',
        type: 'yesno',
        required: true,
      },
      {
        id: 'prescription_photo',
        question: 'Tire foto da receita',
        type: 'file',
        required: false,
        dependsOn: {
          questionId: 'prescription',
          answer: true,
        },
        hint: 'Vamos extrair automaticamente os medicamentos e doses',
      },
      {
        id: 'treatment',
        question: 'Qual tratamento foi recomendado?',
        type: 'text',
        required: false,
        placeholder: 'Descreva o tratamento completo...',
      },
      {
        id: 'diet_change',
        question: 'Foi recomendada mudança na alimentação?',
        type: 'yesno',
        required: false,
      },
      {
        id: 'diet_details',
        question: 'Detalhes da nova dieta',
        type: 'text',
        required: false,
        dependsOn: {
          questionId: 'diet_change',
          answer: true,
        },
        placeholder: 'Ex: Ração hipoalergênica, frango cozido...',
      },
      {
        id: 'follow_up',
        question: 'Foi marcado retorno?',
        type: 'yesno',
        required: false,
      },
      {
        id: 'follow_up_date',
        question: 'Data do retorno',
        type: 'date',
        required: false,
        dependsOn: {
          questionId: 'follow_up',
          answer: true,
        },
      },
      {
        id: 'cost',
        question: 'Quanto custou a consulta?',
        type: 'number',
        required: false,
        placeholder: 'Valor em R$',
      },
      {
        id: 'receipt',
        question: 'Anexar comprovante de pagamento',
        type: 'file',
        required: false,
        hint: 'Para controle financeiro',
      },
    ],
  },

  vaccination: {
    id: 'vaccination',
    name: 'Vacinação',
    description: 'Registro de vacina aplicada',
    icon: '💉',
    questions: [
      {
        id: 'vaccine_name',
        question: 'Qual vacina foi aplicada?',
        type: 'select',
        required: true,
        options: [
          'V8 / V10',
          'Raiva',
          'Leishmaniose',
          'Gripe Canina (Tosse dos Canis)',
          'Giárdia',
          'Tríplice Felina',
          'Quádrupla Felina',
          'Quíntupla Felina',
          'Leucemia Felina',
          'Outra',
        ],
      },
      {
        id: 'batch_number',
        question: 'Número do lote',
        type: 'text',
        required: false,
        placeholder: 'Código do lote da vacina',
      },
      {
        id: 'next_dose',
        question: 'Data da próxima dose',
        type: 'date',
        required: false,
        hint: 'Para vacinas que precisam de reforço',
      },
      {
        id: 'certificate',
        question: 'Foto do certificado de vacinação',
        type: 'file',
        required: false,
      },
      {
        id: 'reactions',
        question: 'Seu pet teve alguma reação?',
        type: 'yesno',
        required: false,
      },
      {
        id: 'reaction_details',
        question: 'Descreva a reação',
        type: 'text',
        required: false,
        dependsOn: {
          questionId: 'reactions',
          answer: true,
        },
      },
      {
        id: 'cost',
        question: 'Valor da vacina',
        type: 'number',
        required: false,
      },
    ],
  },

  grooming: {
    id: 'grooming',
    name: 'Banho e Tosa',
    description: 'Registro de banho e tosa',
    icon: '🛁',
    questions: [
      {
        id: 'services',
        question: 'Quais serviços foram realizados?',
        type: 'multiselect',
        required: true,
        options: [
          'Banho',
          'Tosa (máquina)',
          'Tosa (tesoura)',
          'Hidratação',
          'Escovação de dentes',
          'Corte de unhas',
          'Limpeza de ouvidos',
          'Limpeza de glândulas',
          'Perfume',
        ],
      },
      {
        id: 'behavior',
        question: 'Como seu pet se comportou?',
        type: 'select',
        required: false,
        options: ['Ótimo', 'Bom', 'Ansioso', 'Agressivo', 'Precisou de sedação'],
      },
      {
        id: 'skin_issues',
        question: 'Foi notado algum problema de pele?',
        type: 'yesno',
        required: false,
      },
      {
        id: 'skin_details',
        question: 'Detalhes do problema',
        type: 'text',
        required: false,
        dependsOn: {
          questionId: 'skin_issues',
          answer: true,
        },
      },
      {
        id: 'next_grooming',
        question: 'Data sugerida para próxima tosa',
        type: 'date',
        required: false,
      },
      {
        id: 'cost',
        question: 'Valor total',
        type: 'number',
        required: false,
      },
      {
        id: 'photo',
        question: 'Foto do resultado',
        type: 'file',
        required: false,
        hint: 'Registre o novo visual do seu pet!',
      },
    ],
  },

  surgery: {
    id: 'surgery',
    name: 'Cirurgia',
    description: 'Registro de procedimento cirúrgico',
    icon: '🏥',
    questions: [
      {
        id: 'surgery_name',
        question: 'Nome da cirurgia',
        type: 'text',
        required: true,
        placeholder: 'Ex: Castração, retirada de tumor...',
      },
      {
        id: 'anesthesia',
        question: 'Tipo de anestesia utilizada',
        type: 'text',
        required: false,
      },
      {
        id: 'complications',
        question: 'Houve complicações?',
        type: 'yesno',
        required: false,
      },
      {
        id: 'complication_details',
        question: 'Descreva as complicações',
        type: 'text',
        required: false,
        dependsOn: {
          questionId: 'complications',
          answer: true,
        },
      },
      {
        id: 'recovery_instructions',
        question: 'Instruções de recuperação',
        type: 'text',
        required: true,
        placeholder: 'Cuidados pós-operatórios, restrições...',
      },
      {
        id: 'medications',
        question: 'Medicamentos prescritos',
        type: 'text',
        required: false,
      },
      {
        id: 'prescription_photo',
        question: 'Foto da receita',
        type: 'file',
        required: false,
      },
      {
        id: 'surgical_report',
        question: 'Relatório cirúrgico',
        type: 'file',
        required: false,
        hint: 'PDF ou foto do relatório',
      },
      {
        id: 'follow_up_date',
        question: 'Data de remoção de pontos',
        type: 'date',
        required: false,
      },
      {
        id: 'cost',
        question: 'Custo total da cirurgia',
        type: 'number',
        required: false,
      },
    ],
  },
};

/**
 * Get filtered questions based on dependencies
 */
export function getVisibleQuestions(
  flow: AssistantFlow,
  answers: Record<string, unknown>
): AssistantQuestion[] {
  return flow.questions.filter((q) => {
    if (!q.dependsOn) return true;
    
    const dependentAnswer = answers[q.dependsOn.questionId];
    return dependentAnswer === q.dependsOn.answer;
  });
}

/**
 * Validate answers
 */
export function validateAnswers(
  flow: AssistantFlow,
  answers: Record<string, unknown>
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const visibleQuestions = getVisibleQuestions(flow, answers);

  for (const question of visibleQuestions) {
    if (question.required && !answers[question.id]) {
      errors.push(`"${question.question}" é obrigatório`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Save assistant response
 */
export function saveAssistantResponse(response: AssistantResponse): void {
  const responses = getAssistantResponses();
  responses.push(response);
  localStorage.setItem('petmol_assistant_responses', JSON.stringify(responses));
}

/**
 * Get all assistant responses
 */
export function getAssistantResponses(): AssistantResponse[] {
  const stored = localStorage.getItem('petmol_assistant_responses');
  if (!stored) return [];
  try {
    return JSON.parse(stored);
  } catch {
    return [];
  }
}

/**
 * Convert assistant response to structured medical data
 */
export function convertToMedicalData(response: AssistantResponse): Record<string, unknown> | null {
  const flow = ASSISTANT_FLOWS[response.flowId];
  if (!flow) return null;

  switch (response.flowId) {
    case 'consultation':
      return {
        type: 'appointment',
        data: {
          appointment_type: 'routine',
          date: localTodayISO(),
          veterinarian: response.veterinarian || '',
          clinic_name: response.clinicName || '',
          reason: response.answers.reason,
          symptoms: (response.answers.symptoms as string[] | undefined)?.join(', '),
          diagnosis: response.answers.diagnosis,
          treatment: response.answers.treatment,
          cost: response.answers.cost,
          follow_up_date: response.answers.follow_up_date,
          is_completed: true,
        },
      };

    case 'vaccination':
      return {
        type: 'vaccine',
        data: {
          vaccine_name: response.answers.vaccine_name,
          vaccine_type: 'other',
          date_administered: localTodayISO(),
          next_dose_date: response.answers.next_dose,
          veterinarian: response.veterinarian || '',
          clinic_name: response.clinicName || '',
          batch_number: response.answers.batch_number,
          notes: response.answers.reaction_details,
        },
      };

    case 'surgery':
      return {
        type: 'surgery',
        data: {
          surgery_name: response.answers.surgery_name,
          date: localTodayISO(),
          veterinarian: response.veterinarian || '',
          clinic_name: response.clinicName || '',
          description: '',
          anesthesia_used: response.answers.anesthesia,
          complications: response.answers.complication_details,
          recovery_instructions: response.answers.recovery_instructions,
          cost: response.answers.cost,
          follow_up_date: response.answers.follow_up_date,
        },
      };

    default:
      return null;
  }
}
