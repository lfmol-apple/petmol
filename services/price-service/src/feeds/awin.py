"""
Awin Feed Importer.

Awin (formerly Zanox/Affilinet) provides XML product feeds.
Used by: Cobasi, and others.

To use:
1. Sign up at https://www.awin.com/br/afiliados
2. Apply to Cobasi program (ID: 17870)
3. Get your publisher ID and API token
4. Download product feed URL from Awin dashboard

Feed URL format:
https://productdata.awin.com/datafeed/download/apikey/XXXXX/language/pt_BR/fid/XXXXX/format/xml/

Environment variables:
- AWIN_PUBLISHER_ID: Your Awin publisher ID
- AWIN_API_KEY: Your Awin API key
- AWIN_COBASI_FEED_ID: Feed ID for Cobasi (from dashboard)
"""
import asyncio
import gzip
import io
import re
import xml.etree.ElementTree as ET
from typing import Dict, Any, AsyncGenerator, Optional
from urllib.parse import urljoin
import logging

try:
    import httpx
    HTTPX_AVAILABLE = True
except ImportError:
    HTTPX_AVAILABLE = False

from .base import FeedImporter, FeedProduct, FeedStatus

logger = logging.getLogger(__name__)


# Store configurations
AWIN_STORES = {
    "cobasi": {
        "program_id": "17870",
        "name": "Cobasi",
        "feed_id_env": "AWIN_COBASI_FEED_ID",
    },
}


class AwinFeedImporter(FeedImporter):
    """
    Import products from Awin affiliate network.
    
    Awin provides gzipped XML feeds with full product catalogs.
    """
    
    name = "awin"
    
    FEED_BASE_URL = "https://productdata.awin.com/datafeed/download"
    TIMEOUT = 300  # 5 minutes for large feeds
    
    def __init__(self, config: Dict[str, Any] = None):
        super().__init__(config)
        
        import os
        self.publisher_id = os.environ.get("AWIN_PUBLISHER_ID", "")
        self.api_key = os.environ.get("AWIN_API_KEY", "")
        
        # Feed IDs per store
        self.feed_ids = {}
        for store, info in AWIN_STORES.items():
            feed_id = os.environ.get(info["feed_id_env"], "")
            if feed_id:
                self.feed_ids[store] = feed_id
    
    def is_configured(self, store: str) -> bool:
        """Check if importer is configured for a store."""
        return bool(
            self.publisher_id and 
            self.api_key and 
            store in self.feed_ids
        )
    
    def get_feed_url(self, store: str) -> Optional[str]:
        """Build feed download URL."""
        if not self.is_configured(store):
            return None
        
        feed_id = self.feed_ids.get(store)
        if not feed_id:
            return None
        
        # Awin feed URL format
        return (
            f"{self.FEED_BASE_URL}"
            f"/apikey/{self.api_key}"
            f"/language/pt_BR"
            f"/fid/{feed_id}"
            f"/format/xml"
            f"/compression/gzip"
        )
    
    async def fetch_feed(self, store: str) -> bytes:
        """Download feed from Awin."""
        if not HTTPX_AVAILABLE:
            raise RuntimeError("httpx not installed")
        
        url = self.get_feed_url(store)
        if not url:
            raise ValueError(f"Feed not configured for store: {store}")
        
        async with httpx.AsyncClient(timeout=self.TIMEOUT) as client:
            response = await client.get(url)
            response.raise_for_status()
            
            # Decompress if gzipped
            content = response.content
            if response.headers.get("content-encoding") == "gzip" or url.endswith("gzip"):
                try:
                    content = gzip.decompress(content)
                except:
                    pass  # Already decompressed
            
            return content
    
    async def parse_feed(self, data: bytes, store: str) -> AsyncGenerator[FeedProduct, None]:
        """Parse Awin XML feed."""
        
        # Parse XML
        try:
            root = ET.fromstring(data)
        except ET.ParseError as e:
            logger.error(f"[Awin] XML parse error: {e}")
            return
        
        # Awin XML structure: <products><product>...</product></products>
        # or <datafeed><product>...</product></datafeed>
        products = root.findall(".//product")
        
        logger.info(f"[Awin] Found {len(products)} products in feed")
        
        for elem in products:
            try:
                product = self._parse_product(elem, store)
                if product:
                    yield product
            except Exception as e:
                logger.warning(f"[Awin] Failed to parse product: {e}")
                continue
            
            # Yield control to event loop periodically
            await asyncio.sleep(0)
    
    def _parse_product(self, elem: ET.Element, store: str) -> Optional[FeedProduct]:
        """Parse single product element."""
        
        def get_text(tag: str, default: str = "") -> str:
            el = elem.find(tag)
            return el.text.strip() if el is not None and el.text else default
        
        def get_float(tag: str, default: float = 0.0) -> float:
            text = get_text(tag)
            if text:
                # Remove currency symbols and normalize
                text = re.sub(r"[^\d.,]", "", text)
                text = text.replace(",", ".")
                try:
                    return float(text)
                except ValueError:
                    pass
            return default
        
        # Required fields
        external_id = get_text("aw_product_id") or get_text("product_id") or get_text("id")
        if not external_id:
            return None
        
        title = get_text("product_name") or get_text("name") or get_text("title")
        if not title:
            return None
        
        # Price
        price = get_float("search_price") or get_float("price") or get_float("aw_deep_link")
        if price <= 0:
            price = get_float("store_price") or get_float("retail_price")
        
        # Build product
        product = FeedProduct(
            source="awin",
            store=store,
            external_id=external_id,
            sku=get_text("merchant_product_id") or get_text("sku"),
            ean=get_text("ean") or get_text("upc") or get_text("isbn"),
            title=title,
            description=get_text("description") or get_text("product_short_description"),
            brand=get_text("brand_name") or get_text("brand"),
            category=get_text("category_name") or get_text("merchant_category"),
            subcategory=get_text("merchant_subcategory") or "",
            price=price,
            original_price=get_float("rrp_price") or get_float("list_price") or None,
            currency=get_text("currency", "BRL"),
            in_stock=get_text("in_stock", "1").lower() in ("1", "true", "yes", "in stock"),
            image_url=get_text("merchant_image_url") or get_text("aw_image_url") or get_text("image_url"),
            product_url=get_text("merchant_deep_link") or get_text("product_url"),
            affiliate_url=get_text("aw_deep_link") or get_text("affiliate_url"),
        )
        
        # Extract weight from title/description
        weight_match = re.search(r"(\d+(?:[.,]\d+)?)\s*kg", title.lower())
        if weight_match:
            try:
                product.weight_kg = float(weight_match.group(1).replace(",", "."))
            except ValueError:
                pass
        
        # Guess species
        title_lower = title.lower()
        if any(kw in title_lower for kw in ["cão", "cães", "cachorro", "dog"]):
            product.species = "dog"
        elif any(kw in title_lower for kw in ["gato", "gatos", "cat", "felino"]):
            product.species = "cat"
        elif any(kw in title_lower for kw in ["pássaro", "passaro", "bird", "ave"]):
            product.species = "bird"
        
        # Store raw data for debugging
        product.raw_data = {tag.tag: tag.text for tag in elem}
        
        return product


# Singleton
awin_importer = AwinFeedImporter()
