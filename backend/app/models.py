from __future__ import annotations

from typing import List, Optional

from pydantic import BaseModel, Field


class Building(BaseModel):
    id: str
    name: str
    abbr: List[str] = Field(default_factory=list)
    lat: float
    lng: float
    category: str
    address: str


class CampusEvent(BaseModel):
    id: int
    title: str
    start: Optional[str] = None
    end: Optional[str] = None
    lat: Optional[float] = None
    lng: Optional[float] = None
    location: Optional[str] = None
    url: Optional[str] = None


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