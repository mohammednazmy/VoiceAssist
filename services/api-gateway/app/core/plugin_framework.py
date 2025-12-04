"""
Generalized Plugin Framework - Extensible Voice Mode Integration

Provides:
- Plugin registration and lifecycle management
- Vocabulary boosts for domain-specific recognition
- Event subscriptions with plugin isolation
- Voice command registration
- Organizational settings for plugin enablement
"""

import asyncio
import logging
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Any, Awaitable, Callable, Dict, List, Optional, Set, Type

logger = logging.getLogger(__name__)


class PluginStatus(Enum):
    """Plugin lifecycle status"""

    REGISTERED = "registered"
    INITIALIZING = "initializing"
    ACTIVE = "active"
    SUSPENDED = "suspended"
    ERROR = "error"
    UNLOADED = "unloaded"


@dataclass
class VocabularyBoost:
    """Vocabulary boost for improved recognition"""

    terms: List[str]
    weight: float = 1.0  # Higher = more likely to be recognized
    domain: Optional[str] = None


@dataclass
class VoiceCommand:
    """Registered voice command"""

    pattern: str  # Regex pattern to match
    handler: Callable[[str, Dict[str, Any]], Awaitable[Dict[str, Any]]]
    description: str
    examples: List[str] = field(default_factory=list)
    requires_confirmation: bool = False


@dataclass
class PluginMetadata:
    """Plugin metadata and configuration"""

    id: str
    name: str
    version: str
    description: str
    author: Optional[str] = None
    dependencies: List[str] = field(default_factory=list)
    required_permissions: List[str] = field(default_factory=list)
    domains: List[str] = field(default_factory=list)  # medical, legal, etc.


@dataclass
class PluginState:
    """Runtime state of a plugin"""

    metadata: PluginMetadata
    status: PluginStatus = PluginStatus.REGISTERED
    error_message: Optional[str] = None
    loaded_at: Optional[datetime] = None
    vocabulary_boosts: List[VocabularyBoost] = field(default_factory=list)
    voice_commands: List[VoiceCommand] = field(default_factory=list)
    event_subscriptions: List[str] = field(default_factory=list)


class VoicePlugin(ABC):
    """
    Base class for voice mode plugins.

    Plugins can:
    - Register vocabulary boosts for domain recognition
    - Subscribe to events from the event bus
    - Register voice commands
    - Provide specialized processing
    """

    @property
    @abstractmethod
    def metadata(self) -> PluginMetadata:
        """Return plugin metadata"""
        pass

    @abstractmethod
    async def initialize(self, context: "PluginContext") -> bool:
        """
        Initialize the plugin.

        Args:
            context: Plugin context with services

        Returns:
            True if initialization successful
        """
        pass

    @abstractmethod
    async def shutdown(self) -> None:
        """Clean up plugin resources"""
        pass

    def get_vocabulary_boosts(self) -> List[VocabularyBoost]:
        """Return vocabulary boosts for this plugin"""
        return []

    def get_voice_commands(self) -> List[VoiceCommand]:
        """Return voice commands for this plugin"""
        return []

    def get_event_subscriptions(self) -> Dict[str, Callable]:
        """Return event type -> handler mappings"""
        return {}


@dataclass
class PluginContext:
    """Context provided to plugins during initialization"""

    event_bus: Any
    policy_service: Any
    organization_settings: Dict[str, Any]
    logger: logging.Logger


class PluginRegistry:
    """
    Central registry for voice mode plugins.

    Manages:
    - Plugin registration and discovery
    - Lifecycle management (init, suspend, resume, unload)
    - Vocabulary boost aggregation
    - Voice command routing
    - Event subscription management
    """

    def __init__(
        self,
        event_bus=None,
        policy_service=None,
    ):
        self.event_bus = event_bus
        self.policy_service = policy_service

        self._plugins: Dict[str, VoicePlugin] = {}
        self._states: Dict[str, PluginState] = {}
        self._org_settings: Dict[str, Set[str]] = {}  # org_id -> enabled plugin IDs

        self._all_vocabulary: List[VocabularyBoost] = []
        self._all_commands: Dict[str, VoiceCommand] = {}

        logger.info("PluginRegistry initialized")

    async def register(
        self,
        plugin: VoicePlugin,
        auto_initialize: bool = True,
    ) -> bool:
        """
        Register a plugin with the registry.

        Args:
            plugin: Plugin instance
            auto_initialize: Initialize immediately if True

        Returns:
            True if registration successful
        """
        metadata = plugin.metadata
        plugin_id = metadata.id

        if plugin_id in self._plugins:
            logger.warning(f"Plugin {plugin_id} already registered")
            return False

        # Check dependencies
        for dep in metadata.dependencies:
            if dep not in self._plugins:
                logger.error(f"Plugin {plugin_id} missing dependency: {dep}")
                return False

        # Register
        self._plugins[plugin_id] = plugin
        self._states[plugin_id] = PluginState(
            metadata=metadata,
            status=PluginStatus.REGISTERED,
        )

        logger.info(f"Registered plugin: {plugin_id} v{metadata.version}")

        # Initialize if requested
        if auto_initialize:
            return await self.initialize_plugin(plugin_id)

        return True

    async def initialize_plugin(self, plugin_id: str) -> bool:
        """Initialize a registered plugin"""
        if plugin_id not in self._plugins:
            logger.error(f"Plugin {plugin_id} not found")
            return False

        plugin = self._plugins[plugin_id]
        state = self._states[plugin_id]

        if state.status == PluginStatus.ACTIVE:
            return True  # Already initialized

        state.status = PluginStatus.INITIALIZING

        try:
            # Create plugin context
            context = PluginContext(
                event_bus=self.event_bus,
                policy_service=self.policy_service,
                organization_settings=self._get_plugin_settings(plugin_id),
                logger=logging.getLogger(f"plugin.{plugin_id}"),
            )

            # Initialize
            success = await plugin.initialize(context)

            if success:
                state.status = PluginStatus.ACTIVE
                state.loaded_at = datetime.utcnow()

                # Register vocabulary boosts
                state.vocabulary_boosts = plugin.get_vocabulary_boosts()
                self._aggregate_vocabulary()

                # Register voice commands
                for cmd in plugin.get_voice_commands():
                    self._register_command(plugin_id, cmd)
                    state.voice_commands.append(cmd)

                # Subscribe to events
                for event_type, handler in plugin.get_event_subscriptions().items():
                    self._subscribe_plugin_event(plugin_id, event_type, handler)
                    state.event_subscriptions.append(event_type)

                logger.info(f"Initialized plugin: {plugin_id}")
                return True
            else:
                state.status = PluginStatus.ERROR
                state.error_message = "Initialization returned False"
                return False

        except Exception as e:
            state.status = PluginStatus.ERROR
            state.error_message = str(e)
            logger.error(f"Failed to initialize plugin {plugin_id}: {e}")
            return False

    async def unload_plugin(self, plugin_id: str) -> bool:
        """Unload and cleanup a plugin"""
        if plugin_id not in self._plugins:
            return False

        plugin = self._plugins[plugin_id]
        state = self._states[plugin_id]

        try:
            await plugin.shutdown()
        except Exception as e:
            logger.error(f"Error shutting down plugin {plugin_id}: {e}")

        # Remove vocabulary
        self._all_vocabulary = [v for v in self._all_vocabulary if v not in state.vocabulary_boosts]

        # Remove commands
        for cmd in state.voice_commands:
            self._all_commands.pop(cmd.pattern, None)

        # Unsubscribe events
        # (Would need to track handlers to unsubscribe)

        state.status = PluginStatus.UNLOADED
        del self._plugins[plugin_id]

        logger.info(f"Unloaded plugin: {plugin_id}")
        return True

    def _aggregate_vocabulary(self) -> None:
        """Aggregate all vocabulary boosts from active plugins"""
        self._all_vocabulary = []
        for state in self._states.values():
            if state.status == PluginStatus.ACTIVE:
                self._all_vocabulary.extend(state.vocabulary_boosts)

    def _register_command(self, plugin_id: str, command: VoiceCommand) -> None:
        """Register a voice command from a plugin"""
        self._all_commands[command.pattern] = command
        logger.debug(f"Registered command from {plugin_id}: {command.pattern}")

    def _subscribe_plugin_event(
        self,
        plugin_id: str,
        event_type: str,
        handler: Callable,
    ) -> None:
        """Subscribe a plugin to an event type"""
        if self.event_bus:

            async def wrapped_handler(event):
                try:
                    await handler(event)
                except Exception as e:
                    logger.error(f"Plugin {plugin_id} handler error for {event_type}: {e}")

            self.event_bus.subscribe(
                event_type,
                wrapped_handler,
                priority=0,
                engine=f"plugin:{plugin_id}",
            )

    def _get_plugin_settings(self, plugin_id: str) -> Dict[str, Any]:
        """Get organization-specific settings for a plugin"""
        # Would load from database/configuration
        return {}

    # === Organization Settings ===

    def enable_for_organization(
        self,
        org_id: str,
        plugin_id: str,
    ) -> bool:
        """Enable a plugin for an organization"""
        if plugin_id not in self._plugins:
            return False

        if org_id not in self._org_settings:
            self._org_settings[org_id] = set()

        self._org_settings[org_id].add(plugin_id)
        logger.info(f"Enabled plugin {plugin_id} for org {org_id}")
        return True

    def disable_for_organization(
        self,
        org_id: str,
        plugin_id: str,
    ) -> bool:
        """Disable a plugin for an organization"""
        if org_id in self._org_settings:
            self._org_settings[org_id].discard(plugin_id)
            logger.info(f"Disabled plugin {plugin_id} for org {org_id}")
            return True
        return False

    def is_enabled_for_organization(
        self,
        org_id: str,
        plugin_id: str,
    ) -> bool:
        """Check if plugin is enabled for an organization"""
        if org_id not in self._org_settings:
            return False
        return plugin_id in self._org_settings[org_id]

    def get_enabled_plugins(self, org_id: str) -> List[str]:
        """Get list of enabled plugins for an organization"""
        if org_id not in self._org_settings:
            return []
        return list(self._org_settings[org_id])

    # === Vocabulary & Commands ===

    def get_all_vocabulary(
        self,
        org_id: Optional[str] = None,
        domain: Optional[str] = None,
    ) -> List[VocabularyBoost]:
        """
        Get aggregated vocabulary boosts.

        Args:
            org_id: Filter by organization's enabled plugins
            domain: Filter by domain (medical, legal, etc.)
        """
        vocabulary = self._all_vocabulary

        if org_id:
            enabled = self.get_enabled_plugins(org_id)
            vocabulary = [
                v
                for v in vocabulary
                if any(v in self._states[pid].vocabulary_boosts for pid in enabled if pid in self._states)
            ]

        if domain:
            vocabulary = [v for v in vocabulary if v.domain == domain or v.domain is None]

        return vocabulary

    def get_vocabulary_terms(
        self,
        org_id: Optional[str] = None,
    ) -> List[str]:
        """Get flat list of vocabulary terms"""
        boosts = self.get_all_vocabulary(org_id)
        terms = []
        for boost in boosts:
            terms.extend(boost.terms)
        return list(set(terms))

    async def handle_voice_command(
        self,
        text: str,
        context: Dict[str, Any],
    ) -> Optional[Dict[str, Any]]:
        """
        Handle a voice command.

        Returns command result or None if no command matched.
        """
        import re

        for pattern, command in self._all_commands.items():
            match = re.match(pattern, text, re.IGNORECASE)
            if match:
                if command.requires_confirmation:
                    # Would implement confirmation flow
                    pass

                try:
                    result = await command.handler(text, context)
                    return {
                        "command": command.description,
                        "result": result,
                    }
                except Exception as e:
                    logger.error(f"Command handler error: {e}")
                    return {
                        "command": command.description,
                        "error": str(e),
                    }

        return None

    # === Status ===

    def get_plugin_status(self, plugin_id: str) -> Optional[PluginStatus]:
        """Get current status of a plugin"""
        state = self._states.get(plugin_id)
        return state.status if state else None

    def get_all_plugins(self) -> Dict[str, Dict[str, Any]]:
        """Get information about all registered plugins"""
        result = {}
        for plugin_id, state in self._states.items():
            result[plugin_id] = {
                "name": state.metadata.name,
                "version": state.metadata.version,
                "status": state.status.value,
                "domains": state.metadata.domains,
                "loaded_at": state.loaded_at.isoformat() if state.loaded_at else None,
                "vocabulary_count": sum(len(v.terms) for v in state.vocabulary_boosts),
                "command_count": len(state.voice_commands),
                "event_count": len(state.event_subscriptions),
            }
        return result


# === Example Plugin Implementation ===


class KnowledgeBasePlugin(VoicePlugin):
    """
    Example plugin for knowledge base integration.

    Provides:
    - KB-specific vocabulary boosts
    - Search voice commands
    - Event handling for context updates
    """

    @property
    def metadata(self) -> PluginMetadata:
        return PluginMetadata(
            id="kb_integration",
            name="Knowledge Base Integration",
            version="1.0.0",
            description="Integrates knowledge base search and retrieval",
            domains=["general"],
        )

    async def initialize(self, context: PluginContext) -> bool:
        self._event_bus = context.event_bus
        self._logger = context.logger
        self._logger.info("KnowledgeBasePlugin initialized")
        return True

    async def shutdown(self) -> None:
        pass

    def get_vocabulary_boosts(self) -> List[VocabularyBoost]:
        return [
            VocabularyBoost(
                terms=["search", "find", "look up", "knowledge base", "article"],
                weight=1.2,
            ),
        ]

    def get_voice_commands(self) -> List[VoiceCommand]:
        async def search_handler(text: str, context: Dict) -> Dict:
            # Would implement actual search
            return {"status": "search_executed", "query": text}

        return [
            VoiceCommand(
                pattern=r"search (for |the )?(.+)",
                handler=search_handler,
                description="Search the knowledge base",
                examples=["search for API documentation", "search authentication guide"],
            ),
        ]


# Global plugin registry instance
_plugin_registry_instance: Optional[PluginRegistry] = None


def get_plugin_registry() -> PluginRegistry:
    """Get the global plugin registry instance"""
    global _plugin_registry_instance
    if _plugin_registry_instance is None:
        from app.core.event_bus import get_event_bus
        from app.core.policy_config import get_policy_service

        _plugin_registry_instance = PluginRegistry(
            event_bus=get_event_bus(),
            policy_service=get_policy_service(),
        )
    return _plugin_registry_instance


def reset_plugin_registry() -> None:
    """Reset the global plugin registry (for testing)"""
    global _plugin_registry_instance
    _plugin_registry_instance = None


__all__ = [
    "VoicePlugin",
    "PluginMetadata",
    "PluginStatus",
    "PluginState",
    "PluginContext",
    "PluginRegistry",
    "VocabularyBoost",
    "VoiceCommand",
    "get_plugin_registry",
    "reset_plugin_registry",
    "KnowledgeBasePlugin",
]
