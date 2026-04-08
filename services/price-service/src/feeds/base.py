"""
Base classes for feed importers.

Feed importers download product catalogs from affiliate networks
and store them in the local database.
"""
import asyncio
import hashlib
import logging
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime
from typing import List, Dict, Any, Optional, AsyncGenerator
from enum import Enum

logger = logging.getLogger(__name__)


class FeedStatus(str, Enum):
    PENDING = "pending"
    DOWNLOADING = "downloading"
    PARSING = "parsing"
    IMPORTING = "importing"
    COMPLETED = "completed"
    ERROR = "error"


@dataclass
class FeedProduct:
    """
    Normalized product from affiliate feed.
    
    All feeds are normalized to this format before storage.
    """
    # Identification
    source: str                    # "awin", "cityads"
    store: str                     # "cobasi", "petz"
    external_id: str               # Product ID from store
    sku: str = ""                  # SKU if available
    ean: str = ""                  # EAN/barcode if available
    
    # Product info
    title: str = ""
    description: str = ""
    brand: str = ""
    category: str = ""
    subcategory: str = ""
    
    # Pricing
    price: float = 0.0
    original_price: Optional[float] = None
    currency: str = "BRL"
    
    # Availability
    in_stock: bool = True
    stock_quantity: Optional[int] = None
    
    # Media
    image_url: str = ""
    product_url: str = ""          # Original URL (without affiliate params)
    
    # Affiliate link
    affiliate_url: str = ""        # URL with affiliate tracking
    
    # Metadata
    weight_kg: Optional[float] = None
    species: str = ""              # "dog", "cat", "bird", etc.
    life_stage: str = ""           # "puppy", "adult", "senior"
    
    # Internal
    raw_data: Dict[str, Any] = field(default_factory=dict)
    imported_at: datetime = field(default_factory=datetime.utcnow)
    
    def generate_id(self) -> str:
        """Generate unique ID for this product."""
        key = f"{self.source}:{self.store}:{self.external_id}"
        return hashlib.md5(key.encode()).hexdigest()[:16]


@dataclass
class FeedResult:
    """Result of a feed import operation."""
    source: str
    store: str
    status: FeedStatus
    total_products: int = 0
    imported_products: int = 0
    updated_products: int = 0
    failed_products: int = 0
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    error_message: Optional[str] = None
    
    @property
    def duration_seconds(self) -> Optional[float]:
        if self.started_at and self.completed_at:
            return (self.completed_at - self.started_at).total_seconds()
        return None


class FeedImporter(ABC):
    """
    Base class for feed importers.
    
    Each affiliate network has its own importer that:
    1. Downloads the feed (XML, CSV, JSON)
    2. Parses products
    3. Normalizes to FeedProduct format
    4. Yields products for storage
    """
    
    name: str = "base"
    
    def __init__(self, config: Dict[str, Any] = None):
        self.config = config or {}
        self._status = FeedStatus.PENDING
        self._last_import: Optional[FeedResult] = None
    
    @property
    def status(self) -> FeedStatus:
        return self._status
    
    @abstractmethod
    async def fetch_feed(self, store: str) -> bytes:
        """
        Download feed data from affiliate network.
        
        Args:
            store: Store identifier (e.g., "cobasi", "petz")
            
        Returns:
            Raw feed data (XML, CSV, etc.)
        """
        pass
    
    @abstractmethod
    async def parse_feed(self, data: bytes, store: str) -> AsyncGenerator[FeedProduct, None]:
        """
        Parse feed data and yield normalized products.
        
        Args:
            data: Raw feed data
            store: Store identifier
            
        Yields:
            FeedProduct objects
        """
        pass
    
    async def import_feed(self, store: str) -> FeedResult:
        """
        Full import: download, parse, and return products.
        
        This is the main entry point for importing a feed.
        """
        result = FeedResult(
            source=self.name,
            store=store,
            status=FeedStatus.DOWNLOADING,
            started_at=datetime.utcnow(),
        )
        
        try:
            # Download
            self._status = FeedStatus.DOWNLOADING
            logger.info(f"[{self.name}] Downloading feed for {store}...")
            data = await self.fetch_feed(store)
            logger.info(f"[{self.name}] Downloaded {len(data)} bytes")
            
            # Parse
            self._status = FeedStatus.PARSING
            result.status = FeedStatus.PARSING
            products = []
            
            async for product in self.parse_feed(data, store):
                products.append(product)
                result.total_products += 1
                
                # Log progress every 1000 products
                if result.total_products % 1000 == 0:
                    logger.info(f"[{self.name}] Parsed {result.total_products} products...")
            
            result.imported_products = len(products)
            result.status = FeedStatus.COMPLETED
            result.completed_at = datetime.utcnow()
            
            logger.info(
                f"[{self.name}] Import completed: {result.imported_products} products "
                f"in {result.duration_seconds:.1f}s"
            )
            
        except Exception as e:
            result.status = FeedStatus.ERROR
            result.error_message = str(e)
            result.completed_at = datetime.utcnow()
            logger.error(f"[{self.name}] Import failed: {e}")
        
        self._status = result.status
        self._last_import = result
        return result
    
    def get_info(self) -> Dict[str, Any]:
        """Get importer status info."""
        return {
            "name": self.name,
            "status": self._status.value,
            "last_import": {
                "store": self._last_import.store if self._last_import else None,
                "status": self._last_import.status.value if self._last_import else None,
                "products": self._last_import.imported_products if self._last_import else 0,
                "completed_at": self._last_import.completed_at.isoformat() if self._last_import and self._last_import.completed_at else None,
            } if self._last_import else None,
        }
