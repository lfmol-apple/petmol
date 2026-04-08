"""
Geohash utilities for geospatial queries.
SLICE 1 - Geohash helpers
"""
import math
from typing import List, Tuple

# Base32 alphabet para geohash
BASE32 = "0123456789bcdefghjkmnpqrstuvwxyz"


def encode_geohash(lat: float, lng: float, precision: int = 6) -> str:
    """
    Encode latitude/longitude para geohash.
    
    Args:
        lat: Latitude (-90 a 90)
        lng: Longitude (-180 a 180)
        precision: Comprimento do geohash (default 6 ≈ 1.2km)
        
    Returns:
        Geohash string
        
    Precision reference:
        4: ±20km
        5: ±2.4km
        6: ±0.61km (padrão para busca urbana)
        7: ±0.076km
        8: ±0.019km
    """
    lat_min, lat_max = -90.0, 90.0
    lng_min, lng_max = -180.0, 180.0
    
    geohash = []
    bits = 0
    bit = 0
    even_bit = True
    
    while len(geohash) < precision:
        if even_bit:
            # Longitude
            mid = (lng_min + lng_max) / 2
            if lng > mid:
                bit |= (1 << (4 - bits))
                lng_min = mid
            else:
                lng_max = mid
        else:
            # Latitude
            mid = (lat_min + lat_max) / 2
            if lat > mid:
                bit |= (1 << (4 - bits))
                lat_min = mid
            else:
                lat_max = mid
        
        even_bit = not even_bit
        
        if bits < 4:
            bits += 1
        else:
            geohash.append(BASE32[bit])
            bits = 0
            bit = 0
    
    return ''.join(geohash)


def get_neighbors(geohash: str) -> List[str]:
    """
    Retorna os 8 vizinhos de um geohash (N, NE, E, SE, S, SW, W, NW).
    Útil para buscar em células adjacentes.
    
    Args:
        geohash: Geohash base
        
    Returns:
        Lista com 8 geohashes vizinhos
    """
    # Simplificação: usar apenas 4 direções principais para performance
    # Em produção, usar biblioteca pygeohash para precisão total
    neighbors = []
    
    # Decode para lat/lng aproximado
    lat, lng = decode_geohash(geohash)
    
    # Calcular deslocamento aproximado (baseado no tamanho da célula)
    precision = len(geohash)
    cell_sizes = {
        4: 20000,  # ~20km
        5: 2400,   # ~2.4km
        6: 610,    # ~610m
        7: 76,     # ~76m
        8: 19,     # ~19m
    }
    offset_meters = cell_sizes.get(precision, 610)
    
    # Conversão aproximada de metros para graus
    lat_offset = offset_meters / 111320  # 1 grau lat ≈ 111.32km
    lng_offset = offset_meters / (111320 * math.cos(math.radians(lat)))
    
    # 8 direções
    directions = [
        (lat_offset, 0),           # N
        (lat_offset, lng_offset),  # NE
        (0, lng_offset),           # E
        (-lat_offset, lng_offset), # SE
        (-lat_offset, 0),          # S
        (-lat_offset, -lng_offset),# SW
        (0, -lng_offset),          # W
        (lat_offset, -lng_offset), # NW
    ]
    
    for dlat, dlng in directions:
        neighbor_hash = encode_geohash(lat + dlat, lng + dlng, precision)
        if neighbor_hash != geohash and neighbor_hash not in neighbors:
            neighbors.append(neighbor_hash)
    
    return neighbors


def decode_geohash(geohash: str) -> Tuple[float, float]:
    """
    Decode geohash para lat/lng (centro da célula).
    
    Args:
        geohash: Geohash string
        
    Returns:
        Tuple (latitude, longitude)
    """
    lat_min, lat_max = -90.0, 90.0
    lng_min, lng_max = -180.0, 180.0
    
    even_bit = True
    
    for char in geohash:
        idx = BASE32.index(char)
        
        for i in range(4, -1, -1):
            bit = (idx >> i) & 1
            
            if even_bit:
                # Longitude
                mid = (lng_min + lng_max) / 2
                if bit == 1:
                    lng_min = mid
                else:
                    lng_max = mid
            else:
                # Latitude
                mid = (lat_min + lat_max) / 2
                if bit == 1:
                    lat_min = mid
                else:
                    lat_max = mid
            
            even_bit = not even_bit
    
    lat = (lat_min + lat_max) / 2
    lng = (lng_min + lng_max) / 2
    
    return lat, lng


def calculate_distance(lat1: float, lng1: float, lat2: float, lng2: float) -> int:
    """
    Calcula distância entre dois pontos usando fórmula de Haversine.
    
    Args:
        lat1, lng1: Coordenadas do ponto 1
        lat2, lng2: Coordenadas do ponto 2
        
    Returns:
        Distância em metros (int)
    """
    # Raio da Terra em metros
    R = 6371000
    
    # Converter para radianos
    lat1_rad = math.radians(lat1)
    lat2_rad = math.radians(lat2)
    dlat = math.radians(lat2 - lat1)
    dlng = math.radians(lng2 - lng1)
    
    # Haversine
    a = (math.sin(dlat / 2) ** 2 +
         math.cos(lat1_rad) * math.cos(lat2_rad) *
         math.sin(dlng / 2) ** 2)
    
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    
    distance = R * c
    
    return int(distance)


def get_radius_tier(radius_meters: int) -> str:
    """
    Determina o tier de raio para cache.
    
    Args:
        radius_meters: Raio em metros
        
    Returns:
        Tier string: "near", "mid", "far"
    """
    if radius_meters <= 1000:
        return "near"
    elif radius_meters <= 3000:
        return "mid"
    else:
        return "far"


def get_search_cells(lat: float, lng: float, precision: int = 6) -> List[str]:
    """
    Retorna lista de células geohash para busca (célula central + vizinhos).
    
    Args:
        lat: Latitude
        lng: Longitude
        precision: Precisão do geohash
        
    Returns:
        Lista de geohashes para buscar
    """
    center = encode_geohash(lat, lng, precision)
    neighbors = get_neighbors(center)
    
    # Centro + 8 vizinhos = 9 células
    return [center] + neighbors
