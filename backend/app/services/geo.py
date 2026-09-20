import math

from app.core.config import settings


def haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = math.radians(lat2 - lat1), math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def eta_minutes(distance_km: float) -> int:
    # Straight-line distance × 1.3 approximates city road distance.
    return max(2, round(distance_km * 1.3 / settings.AVG_CITY_SPEED_KMPH * 60))
