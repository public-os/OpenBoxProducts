"""
Delivery distance & charge calculation.

Shop (Shastri Nagar Metro Station, Delhi — SHOP_LATITUDE/SHOP_LONGITUDE) se
customer ke shipping address ki doori nikal kar charge decide hota hai:

    distance <= FREE_DELIVERY_RADIUS_KM  ->  free delivery (Rs.0)
    distance  > FREE_DELIVERY_RADIUS_KM  ->  flat DELIVERY_CHARGE (Rs.40)

Address free-text hota hai isliye pehle geocode karke lat/lng nikalta hai:
  1. GOOGLE_MAPS_API_KEY set ho toh Google Geocoding (Indian addresses par
     sabse accurate), fail hone par
  2. OpenStreetMap Nominatim (free, koi key nahi) — countrycodes=in restriction

Distance haversine (straight-line) hai — road distance se thoda kam aata hai,
par threshold setting (60 km) usi hisaab se tune karna simple rehta hai.
"""

import logging
import math
from decimal import Decimal

import requests
from django.conf import settings

logger = logging.getLogger(__name__)

NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
GOOGLE_GEOCODE_URL = "https://maps.googleapis.com/maps/api/geocode/json"
GEOCODE_TIMEOUT = 8
# Nominatim usage policy: proper User-Agent identifying the app is mandatory
NOMINATIM_HEADERS = {"User-Agent": "OpenBox-store/1.0 (delivery distance check)"}

ADDRESS_HINT = (
    "Address locate nahi ho payi. Please address me apna area, city aur "
    "PIN code likhkar dobara try karo."
)


def haversine_km(lat1, lon1, lat2, lon2):
    """Do lat/lng points ke beech great-circle distance (km)."""
    radius = 6371.0088
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = (
        math.sin(dphi / 2) ** 2
        + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    )
    return 2 * radius * math.asin(math.sqrt(a))


def delivery_charge_for(distance_km):
    """Rule: free radius ke andar Rs.0, uske bahar flat DELIVERY_CHARGE."""
    if distance_km <= settings.FREE_DELIVERY_RADIUS_KM:
        return Decimal("0")
    return Decimal(str(settings.DELIVERY_CHARGE))


def calculate_delivery(address):
    """
    Customer address -> (distance_km, delivery_charge, state).

    state:
      'ok'         — geocode ho gaya, distance/charge bharosemand hai
      'unresolved' — services theek hain par address match nahi hui
                     (caller ko ADDRESS_HINT ke saath 400 dena chahiye)
      'error'      — geocode service down/unreachable; fail-open: free delivery
                     default taaki checkout kabhi block na ho (logger.warning
                     se owner review kar sakta hai)
    """
    address = (address or "").strip()
    if not address:
        return None, Decimal("0"), "unresolved"

    try:
        coords = geocode_address(address)
    except requests.RequestException as geo_err:
        logger.warning(
            "calculate_delivery: geocode service down (address=%r): %s",
            address[:100], geo_err,
        )
        return None, Decimal("0"), "error"

    if coords is None:
        return None, Decimal("0"), "unresolved"

    distance_km = round(
        haversine_km(settings.SHOP_LATITUDE, settings.SHOP_LONGITUDE, *coords), 1
    )
    return distance_km, delivery_charge_for(distance_km), "ok"


def geocode_address(address):
    """Address text -> (lat, lon) | None.

    Google key ho toh pehle Google, wahan na mile toh Nominatim. Nominatim
    down ho toh RequestException upar jaata hai ('error' state ke liye) —
    'address nahi mili' aur 'service down' alag cheezein hain.
    """
    address = (address or "").strip()
    if len(address) < 6:
        return None

    if settings.GOOGLE_MAPS_API_KEY:
        coords = _geocode_google(address)
        if coords is not None:
            return coords

    return _geocode_nominatim(address)


def _geocode_google(address):
    """Google Geocoding API — koi bhi problem par None (Nominatim fallback chalega)."""
    try:
        res = requests.get(
            GOOGLE_GEOCODE_URL,
            params={
                "address": address,
                "key": settings.GOOGLE_MAPS_API_KEY,
                "region": "in",
                "components": "country:IN",
            },
            timeout=GEOCODE_TIMEOUT,
        )
        if res.status_code != 200:
            logger.warning("Google geocode HTTP %s: %s", res.status_code, res.text[:200])
            return None
        results = res.json().get("results") or []
        if not results:
            return None
        location = results[0]["geometry"]["location"]
        return float(location["lat"]), float(location["lng"])
    except (requests.RequestException, KeyError, IndexError, TypeError, ValueError) as err:
        logger.warning("Google geocode fail (%s) — Nominatim fallback", err)
        return None


def _geocode_nominatim(address):
    """OpenStreetMap Nominatim search — India-restricted, first match."""
    res = requests.get(
        NOMINATIM_URL,
        params={
            "q": address,
            "format": "jsonv2",
            "limit": 1,
            "countrycodes": "in",
        },
        headers=NOMINATIM_HEADERS,
        timeout=GEOCODE_TIMEOUT,
    )
    # Non-200 = service problem, "khali result" nahi — upar 'error' state ke liye raise
    res.raise_for_status()
    data = res.json()
    if not data:
        return None
    return float(data[0]["lat"]), float(data[0]["lon"])
