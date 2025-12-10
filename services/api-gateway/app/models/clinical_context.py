"""
Clinical context model for storing patient/clinical information
"""

import uuid
from datetime import datetime
from typing import List, Optional

from app.core.database import Base
from pydantic import BaseModel
from sqlalchemy import Column, DateTime, ForeignKey, Integer, Numeric, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID


class ClinicalContext(Base):
    """Clinical context model for patient/clinical information"""

    __tablename__ = "clinical_contexts"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    session_id = Column(
        UUID(as_uuid=True),
        ForeignKey("sessions.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    # Demographics
    age = Column(Integer, nullable=True)
    gender = Column(String(50), nullable=True)
    weight_kg = Column(Numeric(5, 2), nullable=True)
    height_cm = Column(Numeric(5, 2), nullable=True)

    # Clinical data
    chief_complaint = Column(Text, nullable=True)
    problems = Column(JSONB, nullable=True)  # Array of problems/diagnoses
    medications = Column(JSONB, nullable=True)  # Array of medications
    allergies = Column(JSONB, nullable=True)  # Array of allergies

    # Vitals
    vitals = Column(JSONB, nullable=True)  # {temp, heart_rate, blood_pressure, respiratory_rate, spo2}

    # Timestamps
    last_updated = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)

    def __repr__(self):
        return f"<ClinicalContext(id={self.id}, user_id={self.user_id}, session_id={self.session_id})>"

    def to_dict(self):
        """Convert to dictionary"""
        return {
            "id": str(self.id),
            "user_id": str(self.user_id),
            "session_id": str(self.session_id) if self.session_id else None,
            "age": self.age,
            "gender": self.gender,
            "weight_kg": float(self.weight_kg) if self.weight_kg else None,
            "height_cm": float(self.height_cm) if self.height_cm else None,
            "chief_complaint": self.chief_complaint,
            "problems": self.problems or [],
            "medications": self.medications or [],
            "allergies": self.allergies or [],
            "vitals": self.vitals or {},
            "last_updated": (self.last_updated.isoformat() if self.last_updated else None),
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


# Pydantic models for API


class Vitals(BaseModel):
    """Vitals data"""

    temperature: Optional[float] = None  # Celsius
    heart_rate: Optional[int] = None  # BPM
    blood_pressure: Optional[str] = None  # e.g., "120/80"
    respiratory_rate: Optional[int] = None  # breaths per minute
    spo2: Optional[int] = None  # percentage


class ClinicalContextCreate(BaseModel):
    """Create clinical context"""

    session_id: Optional[str] = None
    age: Optional[int] = None
    gender: Optional[str] = None
    weight_kg: Optional[float] = None
    height_cm: Optional[float] = None
    chief_complaint: Optional[str] = None
    problems: Optional[List[str]] = None
    medications: Optional[List[str]] = None
    allergies: Optional[List[str]] = None
    vitals: Optional[Vitals] = None


class ClinicalContextUpdate(BaseModel):
    """Update clinical context"""

    age: Optional[int] = None
    gender: Optional[str] = None
    weight_kg: Optional[float] = None
    height_cm: Optional[float] = None
    chief_complaint: Optional[str] = None
    problems: Optional[List[str]] = None
    medications: Optional[List[str]] = None
    allergies: Optional[List[str]] = None
    vitals: Optional[Vitals] = None


class ClinicalContextResponse(BaseModel):
    """Clinical context response"""

    id: str
    user_id: str
    session_id: Optional[str] = None
    age: Optional[int] = None
    gender: Optional[str] = None
    weight_kg: Optional[float] = None
    height_cm: Optional[float] = None
    chief_complaint: Optional[str] = None
    problems: List[str] = []
    medications: List[str] = []
    allergies: List[str] = []
    vitals: dict = {}
    last_updated: str
    created_at: str

    class Config:
        from_attributes = True
