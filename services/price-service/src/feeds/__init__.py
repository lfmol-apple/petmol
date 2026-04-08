"""
Feed importers for affiliate networks.

Supports:
- Awin (Cobasi, etc.)
- CityAds (Petz, etc.)
"""
from .base import FeedImporter, FeedProduct
from .awin import AwinFeedImporter
from .cityads import CityAdsFeedImporter

__all__ = [
    "FeedImporter",
    "FeedProduct", 
    "AwinFeedImporter",
    "CityAdsFeedImporter",
]
