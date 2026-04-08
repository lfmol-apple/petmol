/**
 * PetLexicon - Multilingual Pet Intent Classifier
 * Robust, deterministic, and locale-aware pet query detection
 */

export interface PetIntentResult {
  is_pet: boolean;
  confidence: number; // 0-1
  reason: string;
  suggested_context?: string;
  suggestions?: string[];
}

// Pet-related terms by locale (whitelist)
const PET_TERMS: Record<string, string[]> = {
  'pt-BR': [
    // Animals
    'cachorro', 'cão', 'dog', 'cães', 'cadela', 'pet', 'pets', 'animal', 'animais',
    'gato', 'gata', 'cat', 'felino', 'bichano',
    'pássaro', 'ave', 'bird', 'passarinho', 'calopsita', 'periquito', 'papagaio',
    'peixe', 'fish', 'aquário', 'betta',
    'coelho', 'rabbit', 'roedor', 'hamster', 'porquinho', 'guinea',
    'réptil', 'tartaruga', 'iguana', 'cobra',
    // Products
    'ração', 'racao', 'alimento', 'comida', 'feed', 'food',
    'petisco', 'snack', 'biscoito', 'osso', 'treat',
    'areia', 'litter', 'granulado', 'sanitária', 'sanitaria',
    'tapete', 'higiênico', 'higienico', 'fralda', 'absorvente', 'pad',
    'antipulgas', 'anti-pulgas', 'carrapato', 'flea', 'tick',
    'vermífugo', 'vermifugo', 'dewormer',
    'brinquedo', 'toy', 'bolinha', 'pelúcia', 'pelucia',
    'coleira', 'guia', 'peitoral', 'collar', 'leash',
    'caminha', 'cama', 'bed', 'casinha', 'toca',
    'bebedouro', 'comedouro', 'pote', 'tigela', 'bowl', 'feeder', 'fountain',
    'shampoo', 'condicionador', 'sabonete', 'grooming',
    'escova', 'pente', 'cortador', 'unha', 'brush', 'nail',
    'remédio', 'medicamento', 'suplemento', 'vitamina', 'medicine',
    'vacina', 'vaccine', 'veterinário', 'veterinario', 'vet',
    'transporte', 'caixa', 'bolsa', 'carrier', 'crate',
    'aquecedor', 'aquário', 'aquario', 'filtro', 'bomba', 'heater', 'tank',
    // Brands (common)
    'royal', 'canin', 'golden', 'premier', 'hills', 'pedigree', 'whiskas',
    'purina', 'nestlé', 'nestle', 'friskies', 'dog', 'chow', 'cat',
    'quatree', 'biofresh', 'magnus', 'equilibrio', 'n&d', 'farmina',
    'bravecto', 'nexgard', 'frontline', 'advantage', 'revolution',
  ],
  'en': [
    'dog', 'puppy', 'canine', 'pet', 'animal',
    'cat', 'kitten', 'feline', 'kitty',
    'bird', 'parrot', 'parakeet', 'cockatiel',
    'fish', 'aquarium', 'betta', 'goldfish',
    'rabbit', 'bunny', 'hamster', 'guinea', 'pig', 'rodent',
    'reptile', 'turtle', 'iguana', 'snake',
    'food', 'feed', 'kibble', 'treat', 'snack', 'chew',
    'litter', 'sand', 'pellet', 'clump',
    'pad', 'pee', 'training', 'diaper',
    'flea', 'tick', 'prevention', 'treatment',
    'dewormer', 'wormer',
    'toy', 'ball', 'plush', 'rope',
    'collar', 'leash', 'harness',
    'bed', 'crate', 'carrier', 'house',
    'bowl', 'feeder', 'fountain', 'waterer',
    'shampoo', 'conditioner', 'grooming', 'bath',
    'brush', 'comb', 'nail', 'clipper',
    'medicine', 'supplement', 'vitamin',
    'vaccine', 'vet', 'veterinary',
    'aquarium', 'tank', 'filter', 'heater', 'pump',
  ],
  'es': [
    'perro', 'cachorro', 'can', 'mascota', 'animal',
    'gato', 'felino', 'gatito',
    'pájaro', 'ave', 'loro', 'periquito',
    'pez', 'acuario', 'betta',
    'conejo', 'hámster', 'hamster', 'cobaya',
    'reptil', 'tortuga', 'iguana', 'serpiente',
    'comida', 'alimento', 'pienso', 'croquetas',
    'golosina', 'snack', 'hueso',
    'arena', 'arenero', 'litter',
    'pañal', 'empapador', 'toallita',
    'antipulgas', 'pulgas', 'garrapatas',
    'desparasitante',
    'juguete', 'pelota', 'peluche',
    'collar', 'correa', 'arnés', 'arnes',
    'cama', 'caseta', 'transportín', 'transportin',
    'comedero', 'bebedero', 'fuente',
    'champú', 'champu', 'acondicionador',
    'cepillo', 'peine', 'cortauñas', 'cortaunas',
    'medicamento', 'suplemento', 'vitamina',
    'vacuna', 'veterinario',
  ],
  'fr': [
    'chien', 'chiot', 'canin', 'animal', 'animaux',
    'chat', 'chaton', 'félin', 'felin',
    'oiseau', 'perroquet', 'perruche',
    'poisson', 'aquarium', 'betta',
    'lapin', 'hamster', 'cochon', "d'inde",
    'reptile', 'tortue', 'iguane', 'serpent',
    'nourriture', 'aliment', 'croquette',
    'friandise', 'snack', 'os',
    'litière', 'litiere', 'sable',
    'tapis', 'couche', 'absorbant',
    'antipuces', 'puces', 'tiques',
    'vermifuge',
    'jouet', 'balle', 'peluche',
    'collier', 'laisse', 'harnais',
    'lit', 'panier', 'cage', 'caisse',
    'gamelle', 'bol', 'fontaine',
    'shampooing', 'après-shampooing', 'apres-shampooing',
    'brosse', 'peigne', 'coupe-ongles',
    'médicament', 'medicament', 'supplément', 'supplement', 'vitamine',
    'vaccin', 'vétérinaire', 'veterinaire',
  ],
  'it': [
    'cane', 'cucciolo', 'canino', 'animale',
    'gatto', 'gattino', 'felino',
    'uccello', 'pappagallo', 'parrocchetto',
    'pesce', 'acquario', 'betta',
    'coniglio', 'criceto', 'cavia',
    'rettile', 'tartaruga', 'iguana', 'serpente',
    'cibo', 'alimento', 'crocchette',
    'snack', 'biscotto', 'osso',
    'lettiera', 'sabbia',
    'tappetino', 'pannolino', 'assorbente',
    'antipulci', 'pulci', 'zecche',
    'vermifugo',
    'giocattolo', 'palla', 'peluche',
    'collare', 'guinzaglio', 'pettorina',
    'letto', 'cuccia', 'trasportino',
    'ciotola', 'fontana', 'distributore',
    'shampoo', 'balsamo',
    'spazzola', 'pettine', 'tagliaunghie',
    'medicinale', 'integratore', 'vitamina',
    'vaccino', 'veterinario',
  ],
};

// Non-pet terms (blacklist - obvious non-pet items)
const NON_PET_TERMS: string[] = [
  // Home/construction
  'escada', 'ladder', 'escalera', 'échelle', 'scala',
  'cimento', 'cement', 'cemento', 'ciment',
  'tijolo', 'brick', 'ladrillo', 'brique', 'mattone',
  'tinta', 'paint', 'pintura', 'peinture', 'vernice',
  'prego', 'nail', 'clavo', 'clou', 'chiodo',
  'martelo', 'hammer', 'martillo', 'marteau',
  'parafuso', 'screw', 'tornillo', 'vis', 'vite',
  // Vehicles
  'carro', 'car', 'coche', 'voiture', 'auto',
  'pneu', 'tire', 'neumático', 'pneu', 'pneumatico',
  'moto', 'motorcycle', 'motocicleta', 'moto',
  'bicicleta', 'bicycle', 'bici', 'vélo', 'velo', 'bicicletta',
  // Electronics & Electrical
  'fusível', 'fusivel', 'fuse', 'fusible', 'fusibile',
  'disjuntor', 'breaker', 'disyuntor', 'disjoncteur',
  'tomada', 'outlet', 'socket', 'enchufe', 'prise', 'presa',
  'interruptor', 'switch', 'interrupteur', 'interruttore',
  'fio', 'wire', 'cable', 'câble', 'cavo',
  'lâmpada', 'lampada', 'bulb', 'bombilla', 'ampoule', 'lampadina',
  'notebook', 'laptop', 'portátil', 'portatil', 'ordinateur',
  'celular', 'phone', 'teléfono', 'telefono', 'téléphone',
  'iphone', 'samsung', 'xiaomi', 'motorola',
  'televisão', 'televisao', 'television', 'tv', 'télévision', 'televisione',
  'computador', 'computer', 'ordenador', 'ordinateur',
  // Appliances
  'geladeira', 'refrigerator', 'nevera', 'réfrigérateur', 'frigidaire', 'frigorifero',
  'fogão', 'fogao', 'stove', 'cocina', 'cuisinière', 'cuisiniere', 'fornello',
  'microondas', 'microwave', 'micro-ondes',
  'lavadora', 'washing', 'laveuse',
  // Furniture (non-pet)
  'sofá', 'sofa', 'canapé', 'canape', 'divano',
  'mesa', 'table', 'tavolo',
  'cadeira', 'chair', 'silla', 'chaise', 'sedia',
  'guarda-roupa', 'wardrobe', 'armario', 'armoire',
  // Clothing
  'camisa', 'shirt', 'chemise', 'camicia',
  'calça', 'calca', 'pants', 'pantalón', 'pantalon', 'pantaloni',
  'sapato', 'shoe', 'zapato', 'chaussure', 'scarpa',
  'vestido', 'dress', 'robe', 'vestito',
  // Food (human)
  'arroz', 'rice', 'riz', 'riso',
  'feijão', 'feijao', 'beans', 'frijoles', 'haricots', 'fagioli',
  'macarrão', 'macarrao', 'pasta', 'pâtes', 'pates',
  'cerveja', 'beer', 'cerveza', 'bière', 'biere', 'birra',
  // Tools
  'furadeira', 'drill', 'taladro', 'perceuse', 'trapano',
  'serra', 'saw', 'sierra', 'scie', 'sega',
  'chave', 'wrench', 'llave', 'clé', 'cle', 'chiave',
];

// Pet suggestions by locale (when non-pet detected)
const PET_SUGGESTIONS: Record<string, string[]> = {
  'pt-BR': [
    'ração para cachorro',
    'ração para gato',
    'petiscos',
    'brinquedos para pet',
    'areia sanitária',
    'antipulgas',
  ],
  'en': [
    'dog food',
    'cat food',
    'pet treats',
    'pet toys',
    'cat litter',
    'flea treatment',
  ],
  'es': [
    'comida para perros',
    'comida para gatos',
    'golosinas para mascotas',
    'juguetes para mascotas',
    'arena para gatos',
    'antipulgas',
  ],
  'fr': [
    'nourriture pour chien',
    'nourriture pour chat',
    'friandises pour animaux',
    'jouets pour animaux',
    'litière pour chat',
    'antipuces',
  ],
  'it': [
    'cibo per cani',
    'cibo per gatti',
    'snack per animali',
    'giocattoli per animali',
    'lettiera per gatti',
    'antipulci',
  ],
};

/**
 * Check if query has pet intent
 */
export function isPetQuery(query: string, locale: string = 'pt-BR'): PetIntentResult {
  const q = query.toLowerCase().trim();
  
  if (q.length < 2) {
    return {
      is_pet: false,
      confidence: 0,
      reason: 'query_too_short',
    };
  }

  // Check blacklist first (strong negative signal)
  const hasBlacklistTerm = NON_PET_TERMS.some(term => {
    const pattern = new RegExp(`\\b${term.toLowerCase()}\\b`, 'i');
    return pattern.test(q);
  });

  if (hasBlacklistTerm) {
    return {
      is_pet: false,
      confidence: 0.9,
      reason: 'non_pet_term_detected',
      suggestions: PET_SUGGESTIONS[locale] || PET_SUGGESTIONS['en'],
    };
  }

  // Check whitelist (positive signals)
  const terms = PET_TERMS[locale] || PET_TERMS['en'];
  const matchingTerms = terms.filter(term => {
    const pattern = new RegExp(`\\b${term.toLowerCase()}\\b`, 'i');
    return pattern.test(q);
  });

  if (matchingTerms.length > 0) {
    // Strong pet signal
    const confidence = Math.min(0.95, 0.6 + (matchingTerms.length * 0.15));
    return {
      is_pet: true,
      confidence,
      reason: 'pet_terms_found',
    };
  }

  // Check if contains "pet" explicitly
  if (/\bpet\b/i.test(q)) {
    return {
      is_pet: true,
      confidence: 0.85,
      reason: 'explicit_pet_mention',
    };
  }

  // Ambiguous - low confidence, assume pet with context injection
  return {
    is_pet: true,
    confidence: 0.3,
    reason: 'ambiguous_assume_pet',
    suggested_context: 'pet',
  };
}

/**
 * Sanitize and build final pet query with context
 */
export function sanitizeAndBuildPetQuery(
  query: string,
  locale: string = 'pt-BR'
): { final_q: string; inferred_category?: string; inferred_species?: string } {
  const q = query.trim();
  const intent = isPetQuery(q, locale);

  // If not pet, return empty
  if (!intent.is_pet) {
    return { final_q: '' };
  }

  // If has explicit pet context, return as-is
  if (intent.confidence > 0.7 && !intent.suggested_context) {
    return { final_q: q };
  }

  // Low confidence - inject context
  const contextMap: Record<string, string> = {
    'pt-BR': 'pet',
    'en': 'pet',
    'es': 'mascota',
    'fr': 'animal',
    'it': 'animale',
  };

  const context = intent.suggested_context || contextMap[locale] || 'pet';
  const final_q = q.toLowerCase().includes(context.toLowerCase()) 
    ? q 
    : `${q} ${context}`;

  return { final_q };
}
