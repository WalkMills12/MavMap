from __future__ import annotations

from typing import List, Optional, Union

from pydantic import BaseModel, Field


class Building(BaseModel):
    id: str
    name: str
    abbr: List[str] = Field(default_factory=list)
    lat: float
    lng: float
    category: str
    address: str = ""
    note: Optional[str] = None  # short description, e.g. "UC food court"
    source: Optional[str] = None  # where the coordinates came from
    short: Optional[str] = None  # short display name when there's no official code ("Park North")
    description: Optional[str] = None  # what the place is
    offers: List[str] = Field(default_factory=list)  # what's there ("Computers & printing", ...)
    keywords: List[str] = Field(default_factory=list)  # search terms, e.g. "basketball", "printing"
    place_id: Optional[str] = None  # Google place id, used to fetch the building's photo
    image: Optional[str] = None  # photo URL override; wins over the Google photo


class BuildingPhoto(BaseModel):
    url: str
    author: Optional[str] = None  # photographer credit Google requires us to show
    author_url: Optional[str] = None


class PlaceInfo(BaseModel):
    """Live details from the building's Google Maps listing (not stored, only cached briefly)."""

    open_now: Optional[bool] = None
    hours: List[str] = Field(default_factory=list)  # "Monday: 7:00 AM – 11:00 PM", ...
    website: Optional[str] = None
    phone: Optional[str] = None
    summary: Optional[str] = None


class WalkingRoute(BaseModel):
    distance_m: int
    duration_s: int
    polyline: str  # Google encoded polyline
    # Where the walk actually ends for a building: a mapped door, the near side of the building,
    # or its center. The app draws the last few meters from the path to this point.
    target_lat: Optional[float] = None
    target_lng: Optional[float] = None
    target_kind: Optional[str] = None  # "door" | "side" | "center"


class Faq(BaseModel):
    id: str
    question: str
    answer: str
    keywords: List[str] = Field(default_factory=list)
    link: Optional[str] = None
    building: Optional[str] = None  # building id from buildings.json, shown as "Show on map"
    featured: bool = False


class CampusEvent(BaseModel):
    id: Union[int, str]  # events.uta.edu ids are numbers; MavEngage ids are "me-<id>"
    title: str
    start: Optional[str] = None
    end: Optional[str] = None
    lat: Optional[float] = None
    lng: Optional[float] = None
    location: Optional[str] = None
    url: Optional[str] = None
    all_day: bool = False
    room: Optional[str] = None
    address: Optional[str] = None
    description: Optional[str] = None
    types: List[str] = Field(default_factory=list)  # Localist "event_types", e.g. "Workshops"
    photo_url: Optional[str] = None
    source: str = "events.uta.edu"  # or "MavEngage"
    host: Optional[str] = None  # student org / department running it (MavEngage)


class TrafficPoint(BaseModel):
    lat: float
    lng: float
    weight: float
    label: str
    events: List[CampusEvent] = Field(default_factory=list)


class TrafficResponse(BaseModel):
    window_hours: int
    points: List[TrafficPoint]


class HealthResponse(BaseModel):
    status: str
    service: str = "mavmap"