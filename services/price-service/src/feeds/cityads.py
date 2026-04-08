"""
CityAds Feed Importer.

CityAds provides XML/CSV product feeds.
Used by: Petz, and others.

To use:
1. Sign up at https://cityads.com/br/webmaster
2. Apply to Petz program
3. Get your webmaster ID and API token
4. Download product feed URL from CityAds dashboard

Feed URL format varies by advertiser.

Environment variables:
- CITYADS_WEBMASTER_ID: Your CityAds webmaster ID
- CITYADS_API_KEY: Your CityAds API key  
- CITYADS_PETZ_FEED_URL: Full feed URL for Petz
"""
import asyncio
import gzip
import re
import xml.etree.ElementTree as ET
from typing import Dict, Any, AsyncGenerator, Optional
import logging

try:
    import httpx
    HTTPX_AVAILABLE = True
except ImportError:
    HTTPX_AVAILABLE = False

from .base import FeedImporter, FeedProduct, FeedStatus

logger = logging.getLogger(__name__)


# Store configurations
CITYADS_STORES = {
    "petz": {
        "name": "Petz",
        "feed_url_env": "CITYADS_PETZ_FEED_URL",
    },
}


class CityAdsFeedImporter(FeedImporter):
    """
    Import products from CityAds affiliate network.
    
    CityAds provides XML or CSV feeds depending on the advertiser.
    """
    
    name = "cityads"
    
    TIMEOUT = 300  # 5 minutes for large feeds
    
    def __init__(self, config: Dict[str, Any] = None):
        super().__init__(config)
        
        import os
        self.webmaster_id = os.environ.get("CITYADS_WEBMASTER_ID", "")
        self.api_key = os.environ.get("CITYADS_API_KEY", "")
        
        # Feed URLs per store (full URLs from dashboard)
        self.feed_urls = {}
        for store, info in CITYADS_STORES.items():
            url = os.environ.get(info["feed_url_env"], "")
            if url:
                self.feed_urls[store] = url
    
    def is_configured(self, store: str) -> bool:
        """Check if importer is configured for a store."""
        return store in self.feed_urls and bool(self.feed_urls[store])
    
    async def fetch_feed(self, store: str) -> bytes:
        """Download feed from CityAds."""
        if not HTTPX_AVAILABLE:
            raise RuntimeError("httpx not installed")
        
        url = self.feed_urls.get(store)
        if not url:
            raise ValueError(f"Feed not configured for store: {store}")
        
        async with httpx.AsyncClient(timeout=self.TIMEOUT) as client:
            response = await client.get(url)
            response.raise_for_status()
            
            # Decompress if gzipped
            content = response.content
            if response.headers.get("content-encoding") == "gzip":
                try:
                    content = gzip.decompress(content)
                except:
                    pass
            
            return content
    
    async def parse_feed(self, data: bytes, store: str) -> AsyncGenerator[FeedProduct, None]:
        """Parse CityAds feed (XML or CSV)."""
        
        # Try XML first
        try:
            content = data.decode("utf-8")
        except UnicodeDecodeError:
            content = data.decode("latin-1")
        
        if content.strip().startswith("<?xml") or content.strip().startswith("<"):
            async for product in self._parse_xml(content, store):
                yield product
        else:
            async for product in self._parse_csv(content, store):
                yield product
    
    async def _parse_xml(self, content: str, store: str) -> AsyncGenerator[FeedProduct, None]:
        """Parse XML feed."""
        try:
            root = ET.fromstring(content)
        except ET.ParseError as e:
            logger.error(f"[CityAds] XML parse error: {e}")
            return
        
        # Find products (various possible structures)
        products = (
            root.findall(".//product") or
            root.findall(".//item") or
            root.findall(".//offer")
        )
        
        logger.info(f"[CityAds] Found {len(products)} products in XML feed")
        
        for elem in products:
            try:
                product = self._parse_xml_product(elem, store)
                if product:
                    yield product
            except Exception as e:
                logger.warning(f"[CityAds] Failed to parse product: {e}")
                continue
            
            await asyncio.sleep(0)
    
    async def _parse_csv(self, content: str, store: str) -> AsyncGenerator[FeedProduct, None]:
        """Parse CSV feed."""
        import csv
        from io import StringIO
        
        reader = csv.DictReader(StringIO(content), delimiter=";")
        
        count = 0
        for row in reader:
            try:
                product = self._parse_csv_product(row, store)
                if product:
                    yield product
                    count += 1
            except Exception as e:
                logger.warning(f"[CityAds] Failed to parse row: {e}")
                continue
            
            if count % 1000 == 0:
                await asyncio.sleep(0)
        
        logger.info(f"[CityAds] Parsed {count} products from CSV feed")
    
    def _parse_xml_product(self, elem: ET.Element, store: str) -> Optional[FeedProduct]:
        """Parse single XML product element."""
        
        def get_text(tag: str, default: str = "") -> str:
            el = elem.find(tag)
            return el.text.strip() if el is not None and el.text else default
        
        def get_float(tag: str, default: float = 0.0) -> float:
            text = get_text(tag)
            if text:
                text = re.sub(r"[^\d.,]", "", text)
                text = text.replace(",", ".")
                try:
                    return float(text)
                except ValueError:
                    pass
            return default
        
        external_id = get_text("id") or get_text("product_id") or get_text("sku")
        if not external_id:
            return None
        
        title = get_text("name") or get_text("title") or get_text("product_name")
        if not title:
            return None
        
        price = get_float("price") or get_float("sale_price")
        
        product = FeedProduct(
            source="cityads",
            store=store,
            external_id=external_id,
            sku=get_text("sku") or get_text("mpn"),
            ean=get_text("ean") or get_text("gtin") or get_text("upc"),
            title=title,
            description=get_text("description") or get_text("short_description"),
            brand=get_text("brand") or get_text("manufacturer"),
            category=get_text("category") or get_text("product_type"),
            price=price,
            original_price=get_float("regular_price") or get_float("old_price") or None,
            currency=get_text("currency", "BRL"),
            in_stock=get_text("availability", "in stock").lower() in ("in stock", "1", "true", "yes"),
            image_url=get_text("image") or get_text("image_url") or get_text("picture"),
            product_url=get_text("url") or get_text("link") or get_text("product_url"),
            affiliate_url=get_text("affiliate_url") or get_text("tracking_url") or "",
        )
        
        # Extract weight
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
        
        product.raw_data = {tag.tag: tag.text for tag in elem}
        
        return product
    
    def _parse_csv_product(self, row: Dict[str, str], store: str) -> Optional[FeedProduct]:
        """Parse single CSV row."""
        
        def get(key: str, default: str = "") -> str:
            # Try various key formats
            for k in [key, key.lower(), key.upper(), key.replace("_", " ")]:
                if k in row and row[k]:
                    return row[k].strip()
            return default
        
        def get_float(key: str, default: float = 0.0) -> float:
            text = get(key)
            if text:
                text = re.sub(r"[^\d.,]", "", text)
                text = text.replace(",", ".")
                try:
                    return float(text)
                except ValueError:
                    pass
            return default
        
        external_id = get("id") or get("product_id") or get("sku")
        if not external_id:
            return None
        
        title = get("name") or get("title") or get("product_name")
        if not title:
            return None
        
        price = get_float("price") or get_float("sale_price")
        
        product = FeedProduct(
            source="cityads",
            store=store,
            external_id=external_id,
            sku=get("sku") or get("mpn"),
            ean=get("ean") or get("gtin"),
            title=title,
            description=get("description"),
            brand=get("brand") or get("manufacturer"),
            category=get("category"),
            price=price,
            original_price=get_float("regular_price") or get_float("old_price") or None,
            currency="BRL",
            in_stock=get("availability", "in stock").lower() in ("in stock", "1", "true", "yes"),
            image_url=get("image") or get("image_url"),
            product_url=get("url") or get("link"),
            affiliate_url=get("affiliate_url") or get("tracking_url") or "",
        )
        
        # Extract weight
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
        elif any(kw in title_lower for kw in ["gato", "gatos", "cat"]):
            product.species = "cat"
        
        product.raw_data = dict(row)
        
        return product


# Singleton
cityads_importer = CityAdsFeedImporter()
