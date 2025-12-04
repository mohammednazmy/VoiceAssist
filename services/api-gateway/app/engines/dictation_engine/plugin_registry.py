"""
Plugin Registry - Dictation Plugin Management

Central registry for all dictation plugins.
Allows hospitals to enable/disable plugins at granular level.
"""

import logging
from typing import Callable, Dict, List, Optional

logger = logging.getLogger(__name__)


class PluginRegistry:
    """
    Central registry for dictation plugins.

    Manages plugin registration, discovery, and access.
    Supports organization-level plugin enablement.
    """

    def __init__(self):
        self._plugins: Dict[str, "DictationPlugin"] = {}
        self._enabled_plugins: Dict[str, Dict[str, bool]] = {}  # org_id -> plugin_id -> enabled
        logger.info("PluginRegistry initialized")

    async def load_default_plugins(
        self,
        ehr_data_service=None,
        event_bus=None,
        policy_service=None,
        epic_adapter=None,
        audit_service=None,
    ):
        """Load built-in plugins"""
        from .plugins.ehr_commands import EHRCommandExecutor
        from .plugins.ehr_query import EHRDiscrepancyPlugin, EHRQueryPlugin
        from .plugins.emergency import EmergencyPlugin
        from .plugins.radiology import RadiologyPlugin
        from .plugins.soap import SOAPPlugin

        self.register(SOAPPlugin())
        self.register(RadiologyPlugin())
        self.register(EmergencyPlugin())

        # Phase 6: EHR read plugins
        if ehr_data_service or policy_service:
            self.register(
                EHRQueryPlugin(
                    ehr_data_service=ehr_data_service,
                    event_bus=event_bus,
                    policy_service=policy_service,
                )
            )
            self.register(
                EHRDiscrepancyPlugin(
                    ehr_data_service=ehr_data_service,
                    event_bus=event_bus,
                    policy_service=policy_service,
                )
            )

        # Phase 6b: EHR write command executor
        if epic_adapter or policy_service:
            self.register(
                EHRCommandExecutor(
                    epic_adapter=epic_adapter,
                    event_bus=event_bus,
                    policy_service=policy_service,
                    audit_service=audit_service,
                )
            )

        logger.info(f"Loaded {len(self._plugins)} default plugins")

    def register(self, plugin: "DictationPlugin") -> None:
        """Register a plugin"""
        self._plugins[plugin.plugin_id] = plugin
        logger.info(f"Registered plugin: {plugin.plugin_id}")

    def unregister(self, plugin_id: str) -> bool:
        """Unregister a plugin"""
        if plugin_id in self._plugins:
            del self._plugins[plugin_id]
            return True
        return False

    def get_plugin(self, plugin_id: str) -> Optional["DictationPlugin"]:
        """Get plugin by ID"""
        return self._plugins.get(plugin_id)

    def list_plugins(self) -> List[str]:
        """List all registered plugin IDs"""
        return list(self._plugins.keys())

    def get_all_plugins(self) -> Dict[str, "DictationPlugin"]:
        """Get all registered plugins"""
        return self._plugins.copy()

    def is_plugin_enabled(self, plugin_id: str, org_id: str) -> bool:
        """Check if plugin is enabled for organization"""
        org_config = self._enabled_plugins.get(org_id, {})
        return org_config.get(plugin_id, True)  # Default enabled

    def set_plugin_enabled(
        self,
        plugin_id: str,
        org_id: str,
        enabled: bool,
    ) -> bool:
        """Enable/disable plugin for organization"""
        if plugin_id not in self._plugins:
            return False

        if org_id not in self._enabled_plugins:
            self._enabled_plugins[org_id] = {}

        self._enabled_plugins[org_id][plugin_id] = enabled
        return True

    def get_enabled_plugins(
        self,
        org_id: str,
    ) -> List["DictationPlugin"]:
        """Get all enabled plugins for organization"""
        result = []
        for plugin_id, plugin in self._plugins.items():
            if self.is_plugin_enabled(plugin_id, org_id):
                result.append(plugin)
        return result


class DictationPlugin:
    """
    Base class for dictation plugins.

    Plugins define:
    - Sections: Note structure
    - Voice commands: Custom commands
    - Vocabulary boost: STT improvements
    """

    plugin_id: str = "base"
    plugin_name: str = "Base Plugin"
    sections: List[str] = []
    vocabulary_boost: List[str] = []
    voice_commands: Dict[str, Callable] = {}

    def __init__(self):
        logger.debug(f"Initialized plugin: {self.plugin_id}")

    async def on_activate(self, context: Dict) -> None:
        """Called when plugin is activated for a session"""

    async def on_deactivate(self, context: Dict) -> None:
        """Called when plugin is deactivated"""

    async def format_note(self, note: "DictationNote") -> str:
        """Format note for output/export"""
        lines = [f"=== {self.plugin_name} Note ===\n"]
        for section_name in self.sections:
            section = note.sections.get(section_name)
            if section and section.content:
                lines.append(f"## {section_name.upper()}")
                lines.append(section.content)
                lines.append("")
        return "\n".join(lines)


__all__ = ["PluginRegistry", "DictationPlugin"]
