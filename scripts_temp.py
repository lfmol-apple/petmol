import os

path = "/Users/leonardomol/PETMOL H1/apps/web/src/components/DocumentManager.tsx"
with open(path, "r") as f:
    content = f.read()

import re

old_call = """        // Simulating the API call to our new python backend
        // In production: const response = await fetch('/api/vision/documents/classify', ...)
        const classification = await mockApiCall(base64, petId);"""

new_call = """        const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'https://petshopbh.com/api';
        const response = await fetch(`${apiUrl}/vision/documents/classify`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            pet_id: petId,
            image_base64: base64.replace(/^data:image\\/[a-z]+;base64,/, '')
          })
        });

        if (!response.ok) {
          const errData = await response.json().catch(() => null);
          throw new Error(errData?.detail || `API returned ${response.status}`);
        }
        
        const classification = await response.json();"""

content = content.replace(old_call, new_call)

old_mock = """  // Mock API Call that replaces the actual backend fetch while testing
  const mockApiCall = async (base64: string, id: string) => {
    return new Promise<any>((resolve) => {
      setTimeout(() => {
        resolve({
          tipo_documento: 'exame_sangue',
          categoria_aba: 'exames',
          titulo_identificado: 'Hemograma Completo',
          data_documento: '2024-05-12',
          clinica_laboratorio: {
            nome: 'Laboratório PetVida',
            endereco: 'Rua Central, 123',
          },
          medico_veterinario: {
            nome: 'Dra. Carla',
          },
          conteudo_resumo: 'Resultados normais para plaquetas e leucócitos. Sem alterações.',
          contem_selo_vacina: false,
          contem_assinatura: true,
          confianca_leitura: 0.92
        });
      }, 1500);
    });
  };"""

content = content.replace(old_mock, "")

with open(path, "w") as f:
    f.write(content)
