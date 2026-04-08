"""
Product database for storing feed products.

Uses SQLite for simplicity and portability.
Stores normalized products from all affiliate feeds.
"""
import sqlite3
import json
import logging
from datetime import datetime
from pathlib import Path
from typing import List, Dict, Any, Optional
from contextlib import contextmanager

from .base import FeedProduct

logger = logging.getLogger(__name__)

# Database file location
DB_DIR = Path(__file__).parent.parent.parent / "data"
DB_FILE = DB_DIR / "products.db"


def get_db_path() -> Path:
    """Get database file path, creating directory if needed."""
    DB_DIR.mkdir(parents=True, exist_ok=True)
    return DB_FILE


@contextmanager
def get_connection():
    """Get database connection with proper cleanup."""
    conn = sqlite3.connect(get_db_path())
    conn.row_factory = sqlite3.Row
    try:
        yield conn
    finally:
        conn.close()


def init_db():
    """Initialize database tables."""
    with get_connection() as conn:
        conn.executescript("""
            -- Products table
            CREATE TABLE IF NOT EXISTS products (
                id TEXT PRIMARY KEY,
                source TEXT NOT NULL,
                store TEXT NOT NULL,
                external_id TEXT NOT NULL,
                sku TEXT,
                ean TEXT,
                title TEXT NOT NULL,
                description TEXT,
                brand TEXT,
                category TEXT,
                subcategory TEXT,
                price REAL NOT NULL,
                original_price REAL,
                currency TEXT DEFAULT 'BRL',
                in_stock INTEGER DEFAULT 1,
                stock_quantity INTEGER,
                image_url TEXT,
                product_url TEXT,
                affiliate_url TEXT,
                weight_kg REAL,
                species TEXT,
                life_stage TEXT,
                raw_data TEXT,
                imported_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                
                UNIQUE(source, store, external_id)
            );
            
            -- Indexes for fast search
            CREATE INDEX IF NOT EXISTS idx_products_store ON products(store);
            CREATE INDEX IF NOT EXISTS idx_products_brand ON products(brand);
            CREATE INDEX IF NOT EXISTS idx_products_species ON products(species);
            CREATE INDEX IF NOT EXISTS idx_products_ean ON products(ean);
            CREATE INDEX IF NOT EXISTS idx_products_title ON products(title);
            CREATE INDEX IF NOT EXISTS idx_products_price ON products(price);
            
            -- Full-text search
            CREATE VIRTUAL TABLE IF NOT EXISTS products_fts USING fts5(
                id,
                title,
                brand,
                description,
                content=products,
                content_rowid=rowid
            );
            
            -- Triggers to keep FTS in sync
            CREATE TRIGGER IF NOT EXISTS products_ai AFTER INSERT ON products BEGIN
                INSERT INTO products_fts(rowid, id, title, brand, description)
                VALUES (new.rowid, new.id, new.title, new.brand, new.description);
            END;
            
            CREATE TRIGGER IF NOT EXISTS products_ad AFTER DELETE ON products BEGIN
                INSERT INTO products_fts(products_fts, rowid, id, title, brand, description)
                VALUES ('delete', old.rowid, old.id, old.title, old.brand, old.description);
            END;
            
            CREATE TRIGGER IF NOT EXISTS products_au AFTER UPDATE ON products BEGIN
                INSERT INTO products_fts(products_fts, rowid, id, title, brand, description)
                VALUES ('delete', old.rowid, old.id, old.title, old.brand, old.description);
                INSERT INTO products_fts(rowid, id, title, brand, description)
                VALUES (new.rowid, new.id, new.title, new.brand, new.description);
            END;
            
            -- Import history
            CREATE TABLE IF NOT EXISTS import_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                source TEXT NOT NULL,
                store TEXT NOT NULL,
                status TEXT NOT NULL,
                total_products INTEGER DEFAULT 0,
                imported_products INTEGER DEFAULT 0,
                updated_products INTEGER DEFAULT 0,
                failed_products INTEGER DEFAULT 0,
                started_at TEXT,
                completed_at TEXT,
                error_message TEXT
            );
        """)
        conn.commit()
        logger.info("Database initialized")


def upsert_product(product: FeedProduct) -> bool:
    """
    Insert or update a product.
    
    Returns True if inserted, False if updated.
    """
    now = datetime.utcnow().isoformat()
    product_id = product.generate_id()
    
    with get_connection() as conn:
        cursor = conn.execute(
            "SELECT id FROM products WHERE id = ?",
            (product_id,)
        )
        exists = cursor.fetchone() is not None
        
        conn.execute("""
            INSERT INTO products (
                id, source, store, external_id, sku, ean,
                title, description, brand, category, subcategory,
                price, original_price, currency, in_stock, stock_quantity,
                image_url, product_url, affiliate_url,
                weight_kg, species, life_stage, raw_data,
                imported_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(source, store, external_id) DO UPDATE SET
                title = excluded.title,
                description = excluded.description,
                brand = excluded.brand,
                category = excluded.category,
                subcategory = excluded.subcategory,
                price = excluded.price,
                original_price = excluded.original_price,
                in_stock = excluded.in_stock,
                stock_quantity = excluded.stock_quantity,
                image_url = excluded.image_url,
                product_url = excluded.product_url,
                affiliate_url = excluded.affiliate_url,
                weight_kg = excluded.weight_kg,
                species = excluded.species,
                life_stage = excluded.life_stage,
                raw_data = excluded.raw_data,
                updated_at = excluded.updated_at
        """, (
            product_id,
            product.source,
            product.store,
            product.external_id,
            product.sku,
            product.ean,
            product.title,
            product.description,
            product.brand,
            product.category,
            product.subcategory,
            product.price,
            product.original_price,
            product.currency,
            1 if product.in_stock else 0,
            product.stock_quantity,
            product.image_url,
            product.product_url,
            product.affiliate_url,
            product.weight_kg,
            product.species,
            product.life_stage,
            json.dumps(product.raw_data) if product.raw_data else None,
            product.imported_at.isoformat(),
            now,
        ))
        conn.commit()
        
        return not exists


def bulk_upsert_products(products: List[FeedProduct]) -> Dict[str, int]:
    """
    Bulk insert/update products.
    
    Returns counts of inserted, updated, and failed.
    """
    inserted = 0
    updated = 0
    failed = 0
    
    for product in products:
        try:
            if upsert_product(product):
                inserted += 1
            else:
                updated += 1
        except Exception as e:
            logger.warning(f"Failed to upsert product {product.external_id}: {e}")
            failed += 1
    
    return {"inserted": inserted, "updated": updated, "failed": failed}


def search_products(
    query: str,
    store: Optional[str] = None,
    species: Optional[str] = None,
    brand: Optional[str] = None,
    min_price: Optional[float] = None,
    max_price: Optional[float] = None,
    in_stock_only: bool = True,
    limit: int = 20,
    offset: int = 0,
) -> List[Dict[str, Any]]:
    """
    Search products using full-text search.
    
    Returns list of product dicts.
    """
    with get_connection() as conn:
        # Build query
        conditions = []
        params = []
        
        if query:
            # Use FTS
            conditions.append("p.id IN (SELECT id FROM products_fts WHERE products_fts MATCH ?)")
            params.append(query)
        
        if store:
            conditions.append("p.store = ?")
            params.append(store)
        
        if species:
            conditions.append("p.species = ?")
            params.append(species)
        
        if brand:
            conditions.append("p.brand LIKE ?")
            params.append(f"%{brand}%")
        
        if min_price is not None:
            conditions.append("p.price >= ?")
            params.append(min_price)
        
        if max_price is not None:
            conditions.append("p.price <= ?")
            params.append(max_price)
        
        if in_stock_only:
            conditions.append("p.in_stock = 1")
        
        where_clause = " AND ".join(conditions) if conditions else "1=1"
        
        sql = f"""
            SELECT 
                p.id, p.source, p.store, p.external_id,
                p.title, p.brand, p.category,
                p.price, p.original_price, p.currency,
                p.in_stock, p.image_url, p.product_url, p.affiliate_url,
                p.weight_kg, p.species, p.updated_at
            FROM products p
            WHERE {where_clause}
            ORDER BY p.price ASC
            LIMIT ? OFFSET ?
        """
        params.extend([limit, offset])
        
        cursor = conn.execute(sql, params)
        
        return [dict(row) for row in cursor.fetchall()]


def get_product_by_id(product_id: str) -> Optional[Dict[str, Any]]:
    """Get single product by ID."""
    with get_connection() as conn:
        cursor = conn.execute(
            "SELECT * FROM products WHERE id = ?",
            (product_id,)
        )
        row = cursor.fetchone()
        return dict(row) if row else None


def get_product_by_ean(ean: str) -> List[Dict[str, Any]]:
    """Get all products with a given EAN (from all stores)."""
    with get_connection() as conn:
        cursor = conn.execute(
            """SELECT * FROM products WHERE ean = ? AND in_stock = 1 ORDER BY price ASC""",
            (ean,)
        )
        return [dict(row) for row in cursor.fetchall()]


def get_stats() -> Dict[str, Any]:
    """Get database statistics."""
    with get_connection() as conn:
        stats = {}
        
        # Total products
        cursor = conn.execute("SELECT COUNT(*) FROM products")
        stats["total_products"] = cursor.fetchone()[0]
        
        # Products per store
        cursor = conn.execute(
            "SELECT store, COUNT(*) as count FROM products GROUP BY store"
        )
        stats["by_store"] = {row["store"]: row["count"] for row in cursor.fetchall()}
        
        # Products per species
        cursor = conn.execute(
            "SELECT species, COUNT(*) as count FROM products WHERE species != '' GROUP BY species"
        )
        stats["by_species"] = {row["species"]: row["count"] for row in cursor.fetchall()}
        
        # In stock
        cursor = conn.execute("SELECT COUNT(*) FROM products WHERE in_stock = 1")
        stats["in_stock"] = cursor.fetchone()[0]
        
        # Last update
        cursor = conn.execute("SELECT MAX(updated_at) FROM products")
        stats["last_updated"] = cursor.fetchone()[0]
        
        return stats


def record_import(
    source: str,
    store: str,
    status: str,
    total: int = 0,
    imported: int = 0,
    updated: int = 0,
    failed: int = 0,
    started_at: Optional[str] = None,
    completed_at: Optional[str] = None,
    error: Optional[str] = None,
):
    """Record an import in history."""
    with get_connection() as conn:
        conn.execute("""
            INSERT INTO import_history (
                source, store, status, total_products,
                imported_products, updated_products, failed_products,
                started_at, completed_at, error_message
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            source, store, status, total,
            imported, updated, failed,
            started_at, completed_at, error
        ))
        conn.commit()


def get_import_history(limit: int = 10) -> List[Dict[str, Any]]:
    """Get recent import history."""
    with get_connection() as conn:
        cursor = conn.execute(
            """SELECT * FROM import_history ORDER BY id DESC LIMIT ?""",
            (limit,)
        )
        return [dict(row) for row in cursor.fetchall()]


# Initialize on import
init_db()
