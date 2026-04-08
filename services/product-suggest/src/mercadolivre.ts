import axios, { AxiosInstance } from 'axios';
import NodeCache from 'node-cache';
import Bottleneck from 'bottleneck';

interface MLSearchResult {
  id: string;
  title: string;
  permalink: string;
  thumbnail: string;
  price?: number;
  currency_id?: string;
  seller?: {
    id: number;
    nickname: string;
  };
  available_quantity?: number;
}

interface MLSearchResponse {
  results: MLSearchResult[];
  paging: {
    total: number;
    offset: number;
    limit: number;
  };
}

interface ProductSuggestion {
  item_id: string;
  title: string;
  normalized_title: string;
  permalink: string;
  thumbnail: string;
  price?: number;
  currency?: string;
  seller_name?: string;
  relevance_score: number;
}

export interface SearchParams {
  query: string;
  species?: 'dog' | 'cat';
  intent?: 'vaccine' | 'parasite';
  limit?: number;
}

export class MercadoLivreClient {
  private client: AxiosInstance;
  private cache: NodeCache;
  private limiter: Bottleneck;
  private readonly SITE_ID = 'MLB'; // Brasil
  private readonly BASE_URL = 'https://api.mercadolibre.com';
  
  // Categorias relevantes no Mercado Livre
  private readonly CATEGORIES = {
    petShop: 'MLB1071',
    petMedicine: 'MLB263532'
  };

  constructor() {
    this.client = axios.create({
      baseURL: this.BASE_URL,
      timeout: 5000,
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'PETMOL-ProductSuggest/1.0'
      }
    });

    // Cache com TTL de 7 dias (604800 segundos)
    this.cache = new NodeCache({
      stdTTL: 604800,
      checkperiod: 86400, // Limpa cache expirado a cada 24h
      useClones: false
    });

    // Rate limiting: máximo 10 requests por segundo
    this.limiter = new Bottleneck({
      minTime: 100, // 100ms entre requests = 10/seg
      maxConcurrent: 2
    });
  }

  /**
   * Normaliza uma string para comparação e cache
   */
  private normalizeString(str: string): string {
    return str
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // Remove acentos
      .replace(/[^a-z0-9\s]/g, '') // Remove caracteres especiais
      .trim()
      .replace(/\s+/g, ' '); // Normaliza espaços
  }

  /**
   * Gera chave de cache baseada nos parâmetros
   */
  private getCacheKey(params: SearchParams): string {
    const normalized = this.normalizeString(params.query);
    return `ml:${normalized}:${params.species || 'all'}:${params.intent || 'all'}`;
  }

  /**
   * Calcula score de relevância para um produto
   */
  private calculateRelevanceScore(
    result: MLSearchResult,
    searchQuery: string,
    catalogAliases?: string[]
  ): number {
    let score = 50; // Base score
    const normalizedTitle = this.normalizeString(result.title);
    const normalizedQuery = this.normalizeString(searchQuery);
    const queryTerms = normalizedQuery.split(' ');

    // +30 pontos se contém todos os termos da busca
    const containsAllTerms = queryTerms.every(term => 
      normalizedTitle.includes(term)
    );
    if (containsAllTerms) score += 30;

    // +20 pontos se o título começa com o query
    if (normalizedTitle.startsWith(normalizedQuery)) {
      score += 20;
    }

    // +15 pontos se corresponde a aliases do catálogo
    if (catalogAliases && catalogAliases.length > 0) {
      const hasAlias = catalogAliases.some(alias => 
        normalizedTitle.includes(this.normalizeString(alias))
      );
      if (hasAlias) score += 15;
    }

    // -20 pontos se for "kit" ou "combo" (pode ser ambíguo)
    if (normalizedTitle.match(/\b(kit|combo|pack)\b/)) {
      score -= 20;
    }

    // +10 pontos se tem disponibilidade
    if (result.available_quantity && result.available_quantity > 0) {
      score += 10;
    }

    // -15 pontos se for usado/recondicionado
    if (normalizedTitle.match(/\b(usado|recondicionado|seminovo)\b/)) {
      score -= 15;
    }

    return Math.max(0, Math.min(100, score)); // Clamp entre 0-100
  }

  /**
   * Busca produtos no Mercado Livre
   */
  async searchProducts(params: SearchParams): Promise<ProductSuggestion[]> {
    const cacheKey = this.getCacheKey(params);
    
    // Tenta buscar do cache
    const cached = this.cache.get<ProductSuggestion[]>(cacheKey);
    if (cached) {
      console.log(`[ML] Cache hit para: ${params.query}`);
      return cached;
    }

    console.log(`[ML] Buscando: ${params.query}`);

    try {
      // Prepara query com contexto adicional
      let searchQuery = params.query;
      
      // Adiciona contexto de espécie
      if (params.species === 'dog') {
        searchQuery += ' cachorro cão';
      } else if (params.species === 'cat') {
        searchQuery += ' gato felino';
      }

      // Adiciona contexto de intenção
      if (params.intent === 'vaccine') {
        searchQuery += ' vacina';
      } else if (params.intent === 'parasite') {
        searchQuery += ' antipulgas carrapato vermifugo';
      }

      // Faz a busca com rate limiting
      const response = await this.limiter.schedule(() =>
        this.client.get<MLSearchResponse>(`/sites/${this.SITE_ID}/search`, {
          params: {
            q: searchQuery,
            category: this.CATEGORIES.petShop,
            limit: params.limit || 20,
            sort: 'relevance',
            condition: 'new' // Apenas produtos novos
          }
        })
      );

      const results = response.data.results || [];

      // Mapeia e pontua resultados
      const suggestions: ProductSuggestion[] = results
        .map(result => ({
          item_id: result.id,
          title: result.title,
          normalized_title: this.normalizeString(result.title),
          permalink: result.permalink,
          thumbnail: result.thumbnail,
          price: result.price,
          currency: result.currency_id,
          seller_name: result.seller?.nickname,
          relevance_score: this.calculateRelevanceScore(result, params.query)
        }))
        .filter(s => s.relevance_score >= 30) // Filtra resultados com score muito baixo
        .sort((a, b) => b.relevance_score - a.relevance_score)
        .slice(0, params.limit || 10);

      // Armazena no cache
      this.cache.set(cacheKey, suggestions);

      console.log(`[ML] Encontrados ${suggestions.length} produtos para: ${params.query}`);
      return suggestions;

    } catch (error) {
      if (axios.isAxiosError(error)) {
        console.error('[ML] Erro na API:', error.response?.status, error.message);
        
        // Se for erro de rate limit, retorna cache vazio temporário
        if (error.response?.status === 429) {
          console.warn('[ML] Rate limit atingido, retornando cache vazio');
          return [];
        }
      } else {
        console.error('[ML] Erro desconhecido:', error);
      }
      
      // Em caso de erro, retorna array vazio (offline-first)
      return [];
    }
  }

  /**
   * Limpa o cache (útil para testes ou manutenção)
   */
  clearCache(): void {
    this.cache.flushAll();
    console.log('[ML] Cache limpo');
  }

  /**
   * Retorna estatísticas do cache
   */
  getCacheStats() {
    return this.cache.getStats();
  }
}

// Singleton instance
let clientInstance: MercadoLivreClient | null = null;

export function getMercadoLivreClient(): MercadoLivreClient {
  if (!clientInstance) {
    clientInstance = new MercadoLivreClient();
  }
  return clientInstance;
}
