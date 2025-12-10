"""
Dictation Plugins

This package contains specialty-specific dictation plugins.

Phase 6: Added EHR query plugins for Epic FHIR integration.
Phase 6b: Added EHR command executor for write operations.
"""

from .base import BaseDictationPlugin
from .ehr_commands import EHRCommandExecutor
from .ehr_query import EHRDiscrepancyPlugin, EHRQueryPlugin
from .emergency import EmergencyPlugin
from .radiology import RadiologyPlugin
from .soap import SOAPPlugin

__all__ = [
    "BaseDictationPlugin",
    "SOAPPlugin",
    "RadiologyPlugin",
    "EmergencyPlugin",
    # Phase 6: EHR plugins
    "EHRQueryPlugin",
    "EHRDiscrepancyPlugin",
    # Phase 6b: EHR command executor
    "EHRCommandExecutor",
]
