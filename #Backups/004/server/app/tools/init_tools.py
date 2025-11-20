"""
VoiceAssist V2 - Tool Initialization

Initialize and register all tools with the tool registry.

This module should be called at application startup to register all available tools.
"""

import logging

logger = logging.getLogger(__name__)


def initialize_tools():
    """
    Initialize and register all tools.

    Call this function during application startup to register all tools
    with the global tool registry.

    Usage:
        from app.tools.init_tools import initialize_tools
        initialize_tools()
    """
    logger.info("Initializing VoiceAssist tools...")

    # Import and register tool modules
    from app.tools.calendar_tool import register_calendar_tools
    from app.tools.nextcloud_tool import register_nextcloud_tools
    from app.tools.medical_search_tool import register_medical_search_tools
    from app.tools.calculator_tool import register_calculator_tools
    from app.tools.diagnosis_tool import register_diagnosis_tools
    from app.tools.web_search_tool import register_web_search_tools

    # Register all tools
    register_calendar_tools()
    register_nextcloud_tools()
    register_medical_search_tools()
    register_calculator_tools()
    register_diagnosis_tools()
    register_web_search_tools()

    # Log summary
    from app.tools.registry import TOOL_REGISTRY
    logger.info(f"Initialized {len(TOOL_REGISTRY)} tools:")
    for name, definition in TOOL_REGISTRY.items():
        logger.info(
            f"  - {name}: {definition.category.value}, "
            f"PHI={definition.requires_phi}, "
            f"Confirmation={definition.requires_confirmation}, "
            f"Risk={definition.risk_level.value}"
        )

    logger.info("Tool initialization complete")


def get_tool_summary():
    """Get summary of all registered tools"""
    from app.tools.registry import TOOL_REGISTRY

    summary = {
        "total_tools": len(TOOL_REGISTRY),
        "by_category": {},
        "by_phi_status": {"requires_phi": 0, "no_phi": 0},
        "by_confirmation": {"requires_confirmation": 0, "no_confirmation": 0},
        "by_risk_level": {"low": 0, "medium": 0, "high": 0}
    }

    for definition in TOOL_REGISTRY.values():
        # Category count
        category = definition.category.value
        summary["by_category"][category] = summary["by_category"].get(category, 0) + 1

        # PHI status
        if definition.requires_phi:
            summary["by_phi_status"]["requires_phi"] += 1
        else:
            summary["by_phi_status"]["no_phi"] += 1

        # Confirmation requirement
        if definition.requires_confirmation:
            summary["by_confirmation"]["requires_confirmation"] += 1
        else:
            summary["by_confirmation"]["no_confirmation"] += 1

        # Risk level
        risk = definition.risk_level.value
        summary["by_risk_level"][risk] += 1

    return summary
