"""
Service layer for places search with partners priority + Google Places fallback.
SLICE 1 - Service Search Logic
"""
import json
import os
from datetime import datetime, timedelta
from typing import List, Optional, Dict, Any
from sqlalchemy.orm import Session
from sqlalchemy import and_, or_

from .models import Partner, PlacesCache, PlaceContactCache, AnalyticsClick
from .schemas import (
    PlaceResult, 
    SearchMeta, 
    ServiceSearchResponse,
    PlaceContactResponse,
    AnalyticsClickCreate
)
from .geohash import (
    encode_geohash, 
    get_search_cells, 
    calculate_distance,
    get_radius_tier
)


# Service type mapping para Google Places API
SERVICE_TYPE_MAPPING = {
    "banho_tosa": ["pet_grooming", "pet_store"],
    "vet_clinic": ["veterinary_care"],
    "emergencia": ["veterinary_care", "animal_hospital"],
    "petshop": ["pet_store"],
}


def search_partners(
    db: Session,
    lat: float,
    lng: float,
    service: str,
    radius_meters: int,
    limit: int = 20
) -> List[PlaceResult]:
    """
    Busca partners próximos usando geohash.
    Prioriza partner_level maior.
    
    Args:
        db: Database session
        lat, lng: Coordenadas de busca
        service: Tipo de serviço
        radius_meters: Raio de busca
        limit: Limite de resultados
        
    Returns:
        Lista de PlaceResult (partners)
    """
    # Gerar células de busca (centro + vizinhos)
    precision = 6  # ~610m por célula
    search_cells = get_search_cells(lat, lng, precision)
    
    # Buscar partners nas células
    partners = db.query(Partner).filter(
        and_(
            Partner.geohash.in_(search_cells),
            Partner.service_type == service,
            Partner.is_active == True
        )
    ).order_by(
        Partner.partner_level.desc(),  # Level 2 antes de Level 1
        Partner.rating.desc()
    ).limit(limit * 2).all()  # Buscar mais para filtrar por distância
    
    # Calcular distâncias e filtrar
    results = []
    for partner in partners:
        distance = calculate_distance(lat, lng, partner.lat, partner.lng)
        
        if distance <= radius_meters:
            results.append(PlaceResult(
                id=partner.google_place_id or partner.id,
                name=partner.name,
                display_name=partner.display_name,
                lat=partner.lat,
                lng=partner.lng,
                formatted_address=partner.formatted_address,
                rating=partner.rating,
                user_rating_count=partner.user_rating_count,
                business_status="OPERATIONAL",
                distance_meters=distance,
                is_partner=True,
                partner_level=partner.partner_level,
                is_verified=partner.is_verified,
                phone=partner.phone,
                whatsapp=partner.whatsapp,
                website=partner.website
            ))
    
    # Ordenar por partner_level desc, depois distância
    results.sort(key=lambda x: (-x.partner_level if x.partner_level else 0, x.distance_meters))
    
    return results[:limit]


async def search_google_places(
    lat: float,
    lng: float,
    service: str,
    radius_meters: int,
    limit: int = 20
) -> List[PlaceResult]:
    """
    Busca lugares no Google Places API (New) com FieldMask mínimo.
    
    Args:
        lat, lng: Coordenadas
        service: Tipo de serviço
        radius_meters: Raio
        limit: Limite
        
    Returns:
        Lista de PlaceResult (Google)
    """
    # Verificar API key
    api_key = os.getenv("GOOGLE_PLACES_KEY") or os.getenv("GOOGLE_API_KEY")
    if not api_key:
        return []
    
    # Mapear serviço para tipos do Places API
    place_types = SERVICE_TYPE_MAPPING.get(service, ["pet_store"])
    
    results = []
    
    try:
        import httpx
        
        # Places API (New) - Nearby Search
        url = "https://places.googleapis.com/v1/places:searchNearby"
        
        headers = {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": api_key,
            "X-Goog-FieldMask": "places.id,places.displayName,places.location,places.rating,places.userRatingCount,places.businessStatus"
        }
        
        payload = {
            "locationRestriction": {
                "circle": {
                    "center": {
                        "latitude": lat,
                        "longitude": lng
                    },
                    "radius": min(radius_meters, 5000)  # Max 5km
                }
            },
            "includedTypes": place_types,
            "maxResultCount": limit,
            "rankPreference": "DISTANCE"
        }
        
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(url, json=payload, headers=headers)
            
            if response.status_code == 200:
                data = response.json()
                places = data.get("places", [])
                
                for place in places:
                    place_id = place.get("id")
                    display_name = place.get("displayName", {}).get("text", "")
                    location = place.get("location", {})
                    place_lat = location.get("latitude")
                    place_lng = location.get("longitude")
                    
                    if place_id and place_lat and place_lng:
                        distance = calculate_distance(lat, lng, place_lat, place_lng)
                        
                        results.append(PlaceResult(
                            id=place_id,
                            name=display_name,
                            lat=place_lat,
                            lng=place_lng,
                            rating=place.get("rating"),
                            user_rating_count=place.get("userRatingCount"),
                            business_status=place.get("businessStatus"),
                            distance_meters=distance,
                            is_partner=False
                        ))
    
    except Exception as e:
        print(f"Google Places API error: {e}")
        # Falhar silenciosamente, retornar lista vazia
    
    return results


def get_cached_places(
    db: Session,
    lat: float,
    lng: float,
    service: str,
    radius_meters: int
) -> Optional[List[PlaceResult]]:
    """
    Busca lugares no cache por geohash + tier.
    
    Args:
        db: Database session
        lat, lng: Coordenadas
        service: Tipo de serviço
        radius_meters: Raio
        
    Returns:
        Lista de PlaceResult se cache válido, None caso contrário
    """
    # Gerar chave de cache
    geohash = encode_geohash(lat, lng, precision=6)
    tier = get_radius_tier(radius_meters)
    cache_key = f"{service}:{tier}:{geohash}"
    
    # Buscar cache
    cached = db.query(PlacesCache).filter(
        and_(
            PlacesCache.id == cache_key,
            PlacesCache.expires_at > datetime.utcnow()
        )
    ).first()
    
    if not cached:
        return None
    
    # Deserializar resultados
    try:
        places_data = json.loads(cached.places)
        results = [PlaceResult(**place) for place in places_data]
        return results
    except Exception:
        return None


def save_to_cache(
    db: Session,
    lat: float,
    lng: float,
    service: str,
    radius_meters: int,
    results: List[PlaceResult],
    ttl_days: int = 30
):
    """
    Salva resultados no cache com TTL.
    
    Args:
        db: Database session
        lat, lng: Coordenadas
        service: Tipo de serviço
        radius_meters: Raio
        results: Resultados a cachear
        ttl_days: TTL em dias (padrão 30)
    """
    geohash = encode_geohash(lat, lng, precision=6)
    tier = get_radius_tier(radius_meters)
    cache_key = f"{service}:{tier}:{geohash}"
    
    # Serializar resultados
    places_json = json.dumps([r.model_dump() for r in results])
    
    # Criar ou atualizar cache
    expires_at = datetime.utcnow() + timedelta(days=ttl_days)
    
    cached = db.query(PlacesCache).filter(PlacesCache.id == cache_key).first()
    
    if cached:
        cached.places = places_json
        cached.result_count = len(results)
        cached.updated_at = datetime.utcnow()
        cached.expires_at = expires_at
    else:
        cached = PlacesCache(
            id=cache_key,
            service=service,
            tier=tier,
            geohash=geohash,
            center_lat=lat,
            center_lng=lng,
            radius_meters=radius_meters,
            places=places_json,
            result_count=len(results),
            expires_at=expires_at
        )
        db.add(cached)
    
    db.commit()


async def search_services(
    db: Session,
    lat: float,
    lng: float,
    service: str,
    radius_meters: int = 2000,
    limit: int = 20
) -> ServiceSearchResponse:
    """
    Busca serviços com priorização de partners + cache + Google Places fallback.
    
    Ordem de prioridade:
    1. Partners (Level 2)
    2. Partners (Level 1)
    3. Google Places (cache ou API)
    
    Args:
        db: Database session
        lat, lng: Coordenadas
        service: Tipo de serviço
        radius_meters: Raio
        limit: Limite de resultados
        
    Returns:
        ServiceSearchResponse com results + meta
    """
    # 1. Buscar partners
    partners = search_partners(db, lat, lng, service, radius_meters, limit)
    
    # 2. Verificar cache do Google Places
    cache_hit = False
    google_results = get_cached_places(db, lat, lng, service, radius_meters)
    
    if google_results is not None:
        cache_hit = True
    else:
        # 3. Fallback para Google Places API
        google_results = await search_google_places(lat, lng, service, radius_meters, limit)
        
        # Salvar no cache
        if google_results:
            save_to_cache(db, lat, lng, service, radius_meters, google_results)
    
    # 4. Merge: Partners primeiro, depois Google
    # Dedupe por place_id
    seen_ids = set()
    merged = []
    
    for place in partners:
        if place.id not in seen_ids:
            merged.append(place)
            seen_ids.add(place.id)
    
    for place in google_results:
        if place.id not in seen_ids:
            merged.append(place)
            seen_ids.add(place.id)
    
    # Limitar resultados
    final_results = merged[:limit]
    
    # 5. Metadata
    geohash = encode_geohash(lat, lng, precision=6)
    tier = get_radius_tier(radius_meters)
    
    meta = SearchMeta(
        cache_hit=cache_hit,
        partners_count=len(partners),
        google_count=len(google_results) if google_results else 0,
        total_count=len(final_results),
        tier=tier,
        radius_meters=radius_meters,
        geohash=geohash,
        service_type=service
    )
    
    return ServiceSearchResponse(results=final_results, meta=meta)


async def get_place_contact(
    db: Session,
    place_id: str
) -> PlaceContactResponse:
    """
    Busca contatos de um lugar (cache ou API on-demand).
    
    Args:
        db: Database session
        place_id: Google Place ID
        
    Returns:
        PlaceContactResponse
    """
    # 1. Verificar cache
    cached = db.query(PlaceContactCache).filter(
        and_(
            PlaceContactCache.place_id == place_id,
            PlaceContactCache.expires_at > datetime.utcnow()
        )
    ).first()
    
    if cached:
        return PlaceContactResponse(
            place_id=place_id,
            national_phone_number=cached.national_phone_number,
            formatted_phone_number=cached.formatted_phone_number,
            website_uri=cached.website_uri,
            business_status=cached.business_status,
            cached=True
        )
    
    # 2. Buscar na API
    api_key = os.getenv("GOOGLE_PLACES_KEY") or os.getenv("GOOGLE_API_KEY")
    if not api_key:
        return PlaceContactResponse(place_id=place_id, cached=False)
    
    try:
        import httpx
        
        url = f"https://places.googleapis.com/v1/places/{place_id}"
        
        headers = {
            "X-Goog-Api-Key": api_key,
            "X-Goog-FieldMask": "nationalPhoneNumber,formattedPhoneNumber,websiteUri,businessStatus"
        }
        
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(url, headers=headers)
            
            if response.status_code == 200:
                data = response.json()
                
                # Salvar no cache
                expires_at = datetime.utcnow() + timedelta(days=30)
                
                contact_cache = PlaceContactCache(
                    place_id=place_id,
                    national_phone_number=data.get("nationalPhoneNumber"),
                    formatted_phone_number=data.get("formattedPhoneNumber"),
                    website_uri=data.get("websiteUri"),
                    business_status=data.get("businessStatus"),
                    expires_at=expires_at
                )
                
                db.add(contact_cache)
                db.commit()
                
                return PlaceContactResponse(
                    place_id=place_id,
                    national_phone_number=data.get("nationalPhoneNumber"),
                    formatted_phone_number=data.get("formattedPhoneNumber"),
                    website_uri=data.get("websiteUri"),
                    business_status=data.get("businessStatus"),
                    cached=False
                )
    
    except Exception as e:
        print(f"Error fetching place contact: {e}")
    
    return PlaceContactResponse(place_id=place_id, cached=False)


def track_analytics_click(db: Session, click_data: AnalyticsClickCreate):
    """
    Registra click de analytics sem PII.
    
    Args:
        db: Database session
        click_data: Dados do click
    """
    click = AnalyticsClick(
        lead_id=click_data.lead_id,
        place_id=click_data.place_id,
        place_name=click_data.place_name,
        action=click_data.action,
        source=click_data.source,
        service=click_data.service,
        country_code=click_data.country_code,
        app_version=click_data.app_version,
        platform=click_data.platform
    )
    
    db.add(click)
    db.commit()
