from __future__ import annotations

from typing import List, Optional

from pydantic import BaseModel, Field


class Photo(BaseModel):
    url: str  # image to display (a ~800px Wikimedia Commons thumbnail)
    author: Optional[str] = None
    license: Optional[str] = None  # e.g. "CC BY-SA 4.0"
    page: Optional[str] = None  # Commons file page (credit link)


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
    photo: Optional[Photo] = None


class Faq(BaseModel):
    id: str
    question: str
    answer: str
    keywords: List[str] = Field(default_factory=list)
    link: Optional[str] = None
    building: Optional[str] = None  # building id from buildings.json, shown as "Show on map"
    featured: bool = False


class CampusEvent(BaseModel):
    id: int
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
    ics_url: Optional[str] = None  # Localist's official .ics for this event
    experience: Optional[str] = None  # "inperson" | "virtual" | "hybrid"


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
