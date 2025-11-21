"""
Load testing scenarios for VoiceAssist.

Available scenarios:
- user_journey: Complete user journey from registration to logout
- admin_workflow: Admin operations and document management
- stress_scenario: High-load stress testing
- spike_scenario: Sudden traffic spike testing
"""

__all__ = [
    "user_journey",
    "admin_workflow",
    "stress_scenario",
    "spike_scenario"
]
