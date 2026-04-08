"""Pets module."""
from . import models as _models
from .router import router as pets_router

__all__ = ["pets_router"]