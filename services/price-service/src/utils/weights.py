"""
Weight parsing utility for PETMOL.

Robustly parses weight strings like:
- "15 kg", "10,1kg", "3kg", "100g", "1.5 kg", "15kg"
- Returns weight in kilograms, or None if not parseable.
"""
import re
from typing import Optional


def parse_weight_to_kg(text: Optional[str]) -> Optional[float]:
    """
    Parse a weight string and return the value in kilograms.
    
    Examples:
        "15 kg" -> 15.0
        "10,1kg" -> 10.1
        "100g" -> 0.1
        "1.5 kg" -> 1.5
        "3kg" -> 3.0
        "500 g" -> 0.5
        "invalid" -> None
        None -> None
    
    Returns:
        Weight in kg as float, or None if not parseable.
    """
    if not text:
        return None
    
    # Normalize: lowercase, strip
    text = text.lower().strip()
    
    # Replace comma with dot for decimal separator
    text = text.replace(",", ".")
    
    # Pattern to match number + optional space + unit
    # Supports: kg, g, quilos, gramas, etc.
    pattern = r"^\s*(\d+(?:\.\d+)?)\s*(kg|g|quilos?|gramas?|kilo?s?)?\s*$"
    
    match = re.match(pattern, text)
    if not match:
        # Try to extract just a number + unit from anywhere in the string
        # e.g., "Ração Premium 15kg para cães" -> extract "15kg"
        extract_pattern = r"(\d+(?:[.,]\d+)?)\s*(kg|g)\b"
        extract_match = re.search(extract_pattern, text.replace(",", "."))
        if extract_match:
            value_str = extract_match.group(1)
            unit = extract_match.group(2)
            try:
                value = float(value_str)
                if unit == "g":
                    return round(value / 1000.0, 4)
                return round(value, 4)
            except ValueError:
                return None
        return None
    
    value_str = match.group(1)
    unit = match.group(2) or "kg"  # Default to kg if no unit
    
    try:
        value = float(value_str)
    except ValueError:
        return None
    
    # Convert to kg based on unit
    if unit in ("g", "gramas", "grama"):
        return round(value / 1000.0, 4)
    elif unit in ("kg", "quilos", "quilo", "kilos", "kilo"):
        return round(value, 4)
    
    return None


def calculate_price_per_kg(price: Optional[float], weight_kg: Optional[float]) -> Optional[float]:
    """
    Calculate price per kilogram.
    
    Args:
        price: Price in currency
        weight_kg: Weight in kilograms
        
    Returns:
        Price per kg rounded to 2 decimals, or None if cannot calculate.
    """
    if price is None or weight_kg is None or weight_kg <= 0:
        return None
    
    return round(price / weight_kg, 2)


def format_weight_kg(weight_kg: Optional[float]) -> Optional[str]:
    """
    Format weight for display.
    
    Args:
        weight_kg: Weight in kilograms
        
    Returns:
        Formatted string like "15 kg" or "500 g", or None.
    """
    if weight_kg is None:
        return None
    
    if weight_kg < 1:
        # Display in grams for weights less than 1kg
        grams = int(weight_kg * 1000)
        return f"{grams} g"
    
    # Display in kg
    if weight_kg == int(weight_kg):
        return f"{int(weight_kg)} kg"
    return f"{weight_kg:.1f} kg"
