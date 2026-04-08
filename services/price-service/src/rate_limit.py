"""
Simple in-memory rate limiter for FastAPI.

Uses a sliding window approach with IP-based tracking.
Not suitable for distributed deployments - use Redis for that.
"""
import time
from collections import defaultdict
from functools import wraps
from typing import Dict, List, Tuple, Callable
from fastapi import HTTPException, Request
import logging

logger = logging.getLogger(__name__)


class RateLimiter:
    """
    Simple in-memory rate limiter with sliding window.
    
    For production with multiple workers, use Redis-based rate limiting.
    """
    
    def __init__(self):
        # IP -> list of (timestamp, count) for sliding window
        self._requests: Dict[str, List[float]] = defaultdict(list)
        self._cleanup_interval = 60  # seconds
        self._last_cleanup = time.time()
    
    def _cleanup(self):
        """Remove old entries to prevent memory bloat."""
        now = time.time()
        if now - self._last_cleanup < self._cleanup_interval:
            return
        
        cutoff = now - 300  # Keep last 5 minutes
        for ip in list(self._requests.keys()):
            self._requests[ip] = [t for t in self._requests[ip] if t > cutoff]
            if not self._requests[ip]:
                del self._requests[ip]
        
        self._last_cleanup = now
    
    def _get_client_ip(self, request: Request) -> str:
        """Get client key, preferring stable device ID over IP."""
        # Priority 1: Stable per-device client ID (works globally behind Cloudflare)
        cid = request.headers.get("X-PETMOL-CLIENT-ID")
        if cid:
            return f"cid:{cid.strip()}"
        
        # Priority 2: Cloudflare headers (most reliable for real client IP)
        cf_ip = request.headers.get("CF-Connecting-IP") or request.headers.get("True-Client-IP")
        if cf_ip:
            return cf_ip.split(",")[0].strip()
        
        # Priority 3: X-Forwarded-For (standard proxy header)
        forwarded = request.headers.get("X-Forwarded-For")
        if forwarded:
            return forwarded.split(",")[0].strip()
        
        # Priority 4: X-Real-IP (nginx)
        real_ip = request.headers.get("X-Real-IP")
        if real_ip:
            return real_ip.strip()
        
        # Fallback: direct client
        return request.client.host if request.client else "unknown"
    
    def check_rate_limit(
        self, 
        request: Request, 
        max_requests: int, 
        window_seconds: int
    ) -> Tuple[bool, int, int]:
        """
        Check if request is within rate limit.
        
        Returns:
            (is_allowed, remaining, retry_after)
        """
        self._cleanup()
        
        ip = self._get_client_ip(request)
        now = time.time()
        window_start = now - window_seconds
        
        # Get requests in current window
        self._requests[ip] = [t for t in self._requests[ip] if t > window_start]
        current_count = len(self._requests[ip])
        
        if current_count >= max_requests:
            # Rate limited
            oldest = min(self._requests[ip]) if self._requests[ip] else now
            retry_after = int(oldest + window_seconds - now) + 1
            return False, 0, retry_after
        
        # Allow request
        self._requests[ip].append(now)
        remaining = max_requests - current_count - 1
        
        return True, remaining, 0


# Global instance
rate_limiter = RateLimiter()


def rate_limit(max_requests: int = 60, window_seconds: int = 60):
    """
    Decorator to rate limit an endpoint.
    
    Usage:
        @app.get("/endpoint")
        @rate_limit(max_requests=30, window_seconds=60)
        async def endpoint(request: Request):
            ...
    """
    def decorator(func: Callable):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            # Find Request object in args/kwargs
            request = None
            for arg in args:
                if isinstance(arg, Request):
                    request = arg
                    break
            if not request:
                request = kwargs.get('request')
            
            if request:
                allowed, remaining, retry_after = rate_limiter.check_rate_limit(
                    request, max_requests, window_seconds
                )
                
                if not allowed:
                    logger.warning(f"Rate limit exceeded for {rate_limiter._get_client_ip(request)}")
                    raise HTTPException(
                        status_code=429,
                        detail=f"Too many requests. Try again in {retry_after} seconds.",
                        headers={
                            "Retry-After": str(retry_after),
                            "X-RateLimit-Remaining": "0",
                        }
                    )
            
            return await func(*args, **kwargs)
        
        return wrapper
    return decorator
