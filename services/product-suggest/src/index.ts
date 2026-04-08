import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { getMercadoLivreClient, SearchParams } from './mercadolivre';

dotenv.config();

const app = express();
const PORT = process.env.PRODUCT_SUGGEST_PORT || 3002;

// Middleware
app.use(cors());
app.use(express.json());

// Feature flag
const FEATURE_ENABLED = process.env.ENABLE_ONLINE_PRODUCT_SUGGEST !== 'false';

// Health check
app.get('/health', (req: Request, res: Response) => {
  res.json({ 
    status: 'ok', 
    service: 'product-suggest',
    feature_enabled: FEATURE_ENABLED,
    timestamp: new Date().toISOString()
  });
});

// Endpoint principal de busca de produtos
app.get('/api/search', async (req: Request, res: Response) => {
  try {
    // Verifica feature flag
    if (!FEATURE_ENABLED) {
      return res.status(503).json({
        error: 'Feature disabled',
        message: 'Online product suggestions are currently disabled',
        offline_mode: true
      });
    }

    const { q, species, intent, limit } = req.query;

    // Validação
    if (!q || typeof q !== 'string') {
      return res.status(400).json({
        error: 'Missing query parameter',
        message: 'Query parameter "q" is required'
      });
    }

    if (q.length < 2) {
      return res.status(400).json({
        error: 'Query too short',
        message: 'Query must be at least 2 characters'
      });
    }

    // Validação de espécie
    if (species && !['dog', 'cat'].includes(species as string)) {
      return res.status(400).json({
        error: 'Invalid species',
        message: 'Species must be "dog" or "cat"'
      });
    }

    // Validação de intenção
    if (intent && !['vaccine', 'parasite'].includes(intent as string)) {
      return res.status(400).json({
        error: 'Invalid intent',
        message: 'Intent must be "vaccine" or "parasite"'
      });
    }

    const searchParams: SearchParams = {
      query: q,
      species: species as 'dog' | 'cat' | undefined,
      intent: intent as 'vaccine' | 'parasite' | undefined,
      limit: limit ? parseInt(limit as string, 10) : 10
    };

    // Log sem PII
    console.log('[API] Search request:', {
      query_length: q.length,
      species: species || 'all',
      intent: intent || 'all',
      timestamp: new Date().toISOString()
    });

    const client = getMercadoLivreClient();
    const results = await client.searchProducts(searchParams);

    res.json({
      success: true,
      count: results.length,
      results,
      cached: false, // Será true se vier do cache do client
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('[API] Error processing search:', error);
    
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to process search request',
      offline_mode: true // Cliente deve usar modo offline
    });
  }
});

// Endpoint de estatísticas do cache (admin)
app.get('/api/cache/stats', (req: Request, res: Response) => {
  try {
    const client = getMercadoLivreClient();
    const stats = client.getCacheStats();
    
    res.json({
      success: true,
      stats,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('[API] Error getting cache stats:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to get cache statistics'
    });
  }
});

// Endpoint para limpar cache (admin)
app.post('/api/cache/clear', (req: Request, res: Response) => {
  try {
    // TODO: Adicionar autenticação admin
    const client = getMercadoLivreClient();
    client.clearCache();
    
    res.json({
      success: true,
      message: 'Cache cleared successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('[API] Error clearing cache:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to clear cache'
    });
  }
});

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({
    error: 'Not found',
    message: 'Endpoint not found'
  });
});

// Error handler
app.use((err: Error, req: Request, res: Response, next: express.NextFunction) => {
  console.error('[API] Unhandled error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'An error occurred'
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════╗
║   PETMOL Product Suggest Service          ║
║   Port: ${PORT}                           ║
║   Feature: ${FEATURE_ENABLED ? 'ENABLED' : 'DISABLED'}                     ║
║   Environment: ${process.env.NODE_ENV || 'development'}            ║
╚════════════════════════════════════════════╝
  `);
});

export default app;
