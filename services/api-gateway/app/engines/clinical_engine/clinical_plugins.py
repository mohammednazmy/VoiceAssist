"""
Clinical Plugin Architecture - Extensible Clinical Intelligence

Allows third-party or hospital-specific clinical plugins to:
- Register custom clinical rules and logic
- Add vocabulary boosts for specialty terms
- Subscribe to clinical events
- Add voice commands for clinical functions

Phase 5 Implementation for VoiceAssist Voice Mode.
"""

import logging
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)


class PluginPriority(Enum):
    """Priority for plugin execution order"""

    CRITICAL = 0  # Execute first (safety checks)
    HIGH = 1
    NORMAL = 2
    LOW = 3


class ClinicalEventType(Enum):
    """Types of clinical events plugins can subscribe to"""

    PHI_DETECTED = "phi.detected"
    CODE_EXTRACTED = "code.extracted"
    HIGH_IMPACT_DIAGNOSIS = "high_impact.diagnosis"
    DRUG_INTERACTION = "drug.interaction"
    ALLERGY_ALERT = "allergy.alert"
    CRITICAL_LAB = "lab.critical"
    CARE_GAP = "care_gap.detected"
    MEDICATION_DISCREPANCY = "medication.discrepancy"


@dataclass
class PluginCapabilities:
    """Capabilities provided by a clinical plugin"""

    vocabulary_boost: List[str] = field(default_factory=list)
    voice_commands: Dict[str, str] = field(default_factory=dict)  # command -> description
    event_subscriptions: List[ClinicalEventType] = field(default_factory=list)
    supported_specialties: List[str] = field(default_factory=list)
    requires_features: List[str] = field(default_factory=list)  # Feature flags required


@dataclass
class PluginContext:
    """Context provided to plugin during execution"""

    session_id: str
    patient_context: Optional[Dict[str, Any]] = None
    current_text: Optional[str] = None
    extracted_codes: Optional[List[Any]] = None
    medications: Optional[List[str]] = None
    conditions: Optional[List[str]] = None
    allergies: Optional[List[str]] = None
    lab_values: Optional[Dict[str, float]] = None


@dataclass
class PluginResult:
    """Result from plugin execution"""

    success: bool
    alerts: List[Dict[str, Any]] = field(default_factory=list)
    suggestions: List[str] = field(default_factory=list)
    modified_context: Optional[Dict[str, Any]] = None
    metadata: Dict[str, Any] = field(default_factory=dict)


class BaseClinicalPlugin(ABC):
    """
    Base class for clinical plugins.

    Override to create specialty-specific or hospital-specific plugins.
    """

    plugin_id: str = "base"
    plugin_name: str = "Base Clinical Plugin"
    plugin_version: str = "1.0.0"
    priority: PluginPriority = PluginPriority.NORMAL

    def __init__(self, event_bus=None, policy_config=None):
        self.event_bus = event_bus
        self.policy_config = policy_config
        self._enabled = True
        logger.info(f"Clinical plugin initialized: {self.plugin_name}")

    @abstractmethod
    def get_capabilities(self) -> PluginCapabilities:
        """Return plugin capabilities"""

    @abstractmethod
    async def process(self, context: PluginContext) -> PluginResult:
        """Process clinical context and return results"""

    async def on_event(
        self,
        event_type: ClinicalEventType,
        event_data: Dict[str, Any],
        context: PluginContext,
    ) -> Optional[PluginResult]:
        """Handle subscribed events (override if subscribing to events)"""
        return None

    async def handle_command(
        self,
        command: str,
        args: Dict[str, Any],
        context: PluginContext,
    ) -> PluginResult:
        """Handle voice command (override if providing commands)"""
        return PluginResult(success=False)

    def is_applicable(self, context: PluginContext) -> bool:
        """Check if plugin is applicable for current context"""
        return self._enabled

    def enable(self) -> None:
        """Enable the plugin"""
        self._enabled = True

    def disable(self) -> None:
        """Disable the plugin"""
        self._enabled = False


class ClinicalPluginRegistry:
    """
    Registry for clinical plugins.

    Manages plugin lifecycle and execution.
    """

    def __init__(self, event_bus=None, policy_config=None):
        self.event_bus = event_bus
        self.policy_config = policy_config
        self._plugins: Dict[str, BaseClinicalPlugin] = {}
        self._event_subscriptions: Dict[ClinicalEventType, List[str]] = {}
        self._command_handlers: Dict[str, str] = {}  # command -> plugin_id
        self._specialty_plugins: Dict[str, List[str]] = {}  # specialty -> plugin_ids
        logger.info("ClinicalPluginRegistry initialized")

    def register(self, plugin: BaseClinicalPlugin) -> bool:
        """
        Register a clinical plugin.

        Args:
            plugin: Plugin instance to register

        Returns:
            True if registered successfully
        """
        if plugin.plugin_id in self._plugins:
            logger.warning(f"Plugin already registered: {plugin.plugin_id}")
            return False

        # Check required features
        capabilities = plugin.get_capabilities()
        if capabilities.requires_features and self.policy_config:
            features = getattr(self.policy_config, "features", {})
            for required in capabilities.requires_features:
                if not features.get(required, False):
                    logger.warning(f"Plugin {plugin.plugin_id} requires feature {required}")
                    return False

        # Register plugin
        self._plugins[plugin.plugin_id] = plugin

        # Register event subscriptions
        for event_type in capabilities.event_subscriptions:
            if event_type not in self._event_subscriptions:
                self._event_subscriptions[event_type] = []
            self._event_subscriptions[event_type].append(plugin.plugin_id)

        # Register command handlers
        for command in capabilities.voice_commands.keys():
            self._command_handlers[command] = plugin.plugin_id

        # Register specialty associations
        for specialty in capabilities.supported_specialties:
            if specialty not in self._specialty_plugins:
                self._specialty_plugins[specialty] = []
            self._specialty_plugins[specialty].append(plugin.plugin_id)

        logger.info(f"Registered plugin: {plugin.plugin_name} v{plugin.plugin_version}")
        return True

    def unregister(self, plugin_id: str) -> bool:
        """Unregister a plugin"""
        if plugin_id not in self._plugins:
            return False

        plugin = self._plugins[plugin_id]
        capabilities = plugin.get_capabilities()

        # Remove event subscriptions
        for event_type in capabilities.event_subscriptions:
            if event_type in self._event_subscriptions:
                self._event_subscriptions[event_type] = [
                    p for p in self._event_subscriptions[event_type] if p != plugin_id
                ]

        # Remove command handlers
        for command in capabilities.voice_commands.keys():
            if self._command_handlers.get(command) == plugin_id:
                del self._command_handlers[command]

        # Remove specialty associations
        for specialty in capabilities.supported_specialties:
            if specialty in self._specialty_plugins:
                self._specialty_plugins[specialty] = [p for p in self._specialty_plugins[specialty] if p != plugin_id]

        del self._plugins[plugin_id]
        logger.info(f"Unregistered plugin: {plugin_id}")
        return True

    def get_plugin(self, plugin_id: str) -> Optional[BaseClinicalPlugin]:
        """Get a plugin by ID"""
        return self._plugins.get(plugin_id)

    def get_plugins_for_specialty(
        self,
        specialty: str,
    ) -> List[BaseClinicalPlugin]:
        """Get all plugins supporting a specialty"""
        plugin_ids = self._specialty_plugins.get(specialty, [])
        return [self._plugins[pid] for pid in plugin_ids if pid in self._plugins]

    async def process_all(
        self,
        context: PluginContext,
        specialty: Optional[str] = None,
    ) -> List[PluginResult]:
        """
        Run all applicable plugins on context.

        Args:
            context: Clinical context to process
            specialty: Optional specialty to filter plugins

        Returns:
            List of results from all plugins
        """
        results = []

        # Get plugins to run
        if specialty:
            plugins = self.get_plugins_for_specialty(specialty)
        else:
            plugins = list(self._plugins.values())

        # Sort by priority
        plugins.sort(key=lambda p: p.priority.value)

        # Run each applicable plugin
        for plugin in plugins:
            if plugin.is_applicable(context):
                try:
                    result = await plugin.process(context)
                    results.append(result)

                    # Stop if critical plugin returns alerts
                    if plugin.priority == PluginPriority.CRITICAL and result.alerts:
                        logger.warning(f"Critical plugin {plugin.plugin_id} raised alerts")
                        break
                except Exception as e:
                    logger.error(f"Plugin {plugin.plugin_id} error: {e}")

        return results

    async def dispatch_event(
        self,
        event_type: ClinicalEventType,
        event_data: Dict[str, Any],
        context: PluginContext,
    ) -> List[PluginResult]:
        """
        Dispatch event to subscribed plugins.

        Args:
            event_type: Type of clinical event
            event_data: Event data
            context: Clinical context

        Returns:
            List of results from handling plugins
        """
        results = []
        plugin_ids = self._event_subscriptions.get(event_type, [])

        for plugin_id in plugin_ids:
            plugin = self._plugins.get(plugin_id)
            if plugin and plugin.is_applicable(context):
                try:
                    result = await plugin.on_event(event_type, event_data, context)
                    if result:
                        results.append(result)
                except Exception as e:
                    logger.error(f"Plugin {plugin_id} event handler error: {e}")

        return results

    async def handle_command(
        self,
        command: str,
        args: Dict[str, Any],
        context: PluginContext,
    ) -> Optional[PluginResult]:
        """
        Handle a voice command.

        Args:
            command: Command name
            args: Command arguments
            context: Clinical context

        Returns:
            Result from handling plugin, or None
        """
        plugin_id = self._command_handlers.get(command)
        if not plugin_id:
            return None

        plugin = self._plugins.get(plugin_id)
        if not plugin:
            return None

        try:
            return await plugin.handle_command(command, args, context)
        except Exception as e:
            logger.error(f"Plugin {plugin_id} command handler error: {e}")
            return PluginResult(success=False)

    def get_all_vocabulary(self) -> List[str]:
        """Get combined vocabulary from all plugins"""
        vocab = []
        for plugin in self._plugins.values():
            capabilities = plugin.get_capabilities()
            vocab.extend(capabilities.vocabulary_boost)
        return list(set(vocab))

    def get_all_commands(self) -> Dict[str, str]:
        """Get all available commands with descriptions"""
        commands = {}
        for plugin in self._plugins.values():
            capabilities = plugin.get_capabilities()
            commands.update(capabilities.voice_commands)
        return commands

    def get_registry_stats(self) -> Dict[str, Any]:
        """Get statistics about the plugin registry"""
        return {
            "total_plugins": len(self._plugins),
            "event_subscriptions": {e.value: len(p) for e, p in self._event_subscriptions.items()},
            "command_count": len(self._command_handlers),
            "specialty_count": len(self._specialty_plugins),
            "plugins": [
                {
                    "id": p.plugin_id,
                    "name": p.plugin_name,
                    "version": p.plugin_version,
                    "priority": p.priority.value,
                    "enabled": p._enabled,
                }
                for p in self._plugins.values()
            ],
        }


# ============================================================
# Example Specialty Plugins
# ============================================================


class CardiologyPlugin(BaseClinicalPlugin):
    """
    Cardiology-specific clinical plugin.

    Provides:
    - Cardiac vocabulary boosts
    - ACS protocol activation command
    - Cardiac biomarker monitoring
    """

    plugin_id = "cardiology"
    plugin_name = "Cardiology Clinical Plugin"
    plugin_version = "1.0.0"
    priority = PluginPriority.HIGH

    # Critical cardiac codes
    CRITICAL_CODES = {
        "I21.0",
        "I21.01",
        "I21.02",
        "I21.3",
        "I21.4",  # MI
        "I46.9",  # Cardiac arrest
        "I49.01",  # VFib
    }

    def get_capabilities(self) -> PluginCapabilities:
        return PluginCapabilities(
            vocabulary_boost=[
                "STEMI",
                "NSTEMI",
                "troponin",
                "BNP",
                "NT-proBNP",
                "ejection fraction",
                "cath lab",
                "PCI",
                "CABG",
                "atrial fibrillation",
                "CHF",
                "CAD",
                "ACS",
                "thrombolysis",
                "antiplatelet",
                "anticoagulation",
            ],
            voice_commands={
                "activate_acs_protocol": "Activate acute coronary syndrome protocol",
                "check_cardiac_risk": "Calculate cardiac risk score",
                "review_troponins": "Review serial troponin values",
            },
            event_subscriptions=[
                ClinicalEventType.HIGH_IMPACT_DIAGNOSIS,
                ClinicalEventType.CRITICAL_LAB,
            ],
            supported_specialties=["cardiology", "emergency", "critical_care"],
        )

    async def process(self, context: PluginContext) -> PluginResult:
        alerts = []
        suggestions = []

        # Check for critical cardiac codes
        if context.extracted_codes:
            for code in context.extracted_codes:
                if hasattr(code, "code") and code.code in self.CRITICAL_CODES:
                    alerts.append(
                        {
                            "type": "cardiac_emergency",
                            "severity": "critical",
                            "message": f"Critical cardiac diagnosis: {code.code}",
                            "recommendations": [
                                "Activate ACS protocol",
                                "12-lead ECG stat",
                                "Serial troponins",
                            ],
                        }
                    )

        # Check cardiac labs
        if context.lab_values:
            troponin = context.lab_values.get("troponin", 0)
            if troponin > 0.04:
                alerts.append(
                    {
                        "type": "elevated_troponin",
                        "severity": "high",
                        "message": f"Elevated troponin: {troponin} ng/mL",
                        "recommendations": [
                            "Consider ACS workup",
                            "Serial troponins",
                            "Cardiology consult",
                        ],
                    }
                )

            bnp = context.lab_values.get("bnp", 0)
            if bnp > 500:
                suggestions.append(f"Elevated BNP ({bnp}) - consider heart failure exacerbation")

        return PluginResult(
            success=True,
            alerts=alerts,
            suggestions=suggestions,
        )

    async def on_event(
        self,
        event_type: ClinicalEventType,
        event_data: Dict[str, Any],
        context: PluginContext,
    ) -> Optional[PluginResult]:
        if event_type == ClinicalEventType.CRITICAL_LAB:
            test_name = event_data.get("test_name", "")
            if test_name == "troponin":
                return PluginResult(
                    success=True,
                    alerts=[
                        {
                            "type": "troponin_alert",
                            "severity": "critical",
                            "message": "Critical troponin - evaluate for ACS",
                        }
                    ],
                )
        return None

    async def handle_command(
        self,
        command: str,
        args: Dict[str, Any],
        context: PluginContext,
    ) -> PluginResult:
        if command == "activate_acs_protocol":
            return PluginResult(
                success=True,
                suggestions=[
                    "ACS Protocol Activated:",
                    "1. 12-lead ECG",
                    "2. Aspirin 325mg",
                    "3. P2Y12 inhibitor",
                    "4. Heparin/enoxaparin",
                    "5. Cardiology consult",
                    "6. Consider cath lab activation",
                ],
            )
        return PluginResult(success=False)


class OncologyPlugin(BaseClinicalPlugin):
    """
    Oncology-specific clinical plugin.

    Provides:
    - Oncology vocabulary boosts
    - Chemotherapy safety checks
    - Tumor marker monitoring
    """

    plugin_id = "oncology"
    plugin_name = "Oncology Clinical Plugin"
    plugin_version = "1.0.0"
    priority = PluginPriority.HIGH

    # High-risk chemotherapy agents
    HIGH_RISK_CHEMO = {
        "doxorubicin",
        "cyclophosphamide",
        "methotrexate",
        "vincristine",
        "cisplatin",
        "carboplatin",
    }

    def get_capabilities(self) -> PluginCapabilities:
        return PluginCapabilities(
            vocabulary_boost=[
                "chemotherapy",
                "immunotherapy",
                "tumor marker",
                "CEA",
                "CA-125",
                "PSA",
                "AFP",
                "staging",
                "metastasis",
                "remission",
                "progression",
                "neutropenic fever",
                "mucositis",
            ],
            voice_commands={
                "check_chemo_safety": "Check chemotherapy safety parameters",
                "review_tumor_markers": "Review tumor marker trends",
            },
            event_subscriptions=[
                ClinicalEventType.DRUG_INTERACTION,
                ClinicalEventType.CRITICAL_LAB,
            ],
            supported_specialties=["oncology", "hematology"],
        )

    async def process(self, context: PluginContext) -> PluginResult:
        alerts = []
        suggestions = []

        # Check for chemotherapy in medications
        if context.medications:
            for med in context.medications:
                if med.lower() in self.HIGH_RISK_CHEMO:
                    alerts.append(
                        {
                            "type": "high_risk_chemotherapy",
                            "severity": "high",
                            "message": f"High-risk chemotherapy: {med}",
                            "recommendations": [
                                "Verify CBC before administration",
                                "Check renal/hepatic function",
                                "Confirm antiemetic regimen",
                                "Review cumulative dose",
                            ],
                        }
                    )

        # Check for neutropenia in labs
        if context.lab_values:
            anc = context.lab_values.get("anc", context.lab_values.get("wbc", 0) * 0.5)
            if anc < 500:
                alerts.append(
                    {
                        "type": "severe_neutropenia",
                        "severity": "critical",
                        "message": f"Severe neutropenia (ANC: {anc})",
                        "recommendations": [
                            "Hold chemotherapy",
                            "Evaluate for infection",
                            "Consider G-CSF",
                        ],
                    }
                )

        return PluginResult(
            success=True,
            alerts=alerts,
            suggestions=suggestions,
        )

    async def handle_command(
        self,
        command: str,
        args: Dict[str, Any],
        context: PluginContext,
    ) -> PluginResult:
        if command == "check_chemo_safety":
            suggestions = [
                "Chemotherapy Safety Check:",
                "1. Verify current CBC and ANC",
                "2. Check creatinine and eGFR",
                "3. Review hepatic function",
                "4. Confirm cumulative dose limits",
                "5. Verify consent and plan",
            ]
            return PluginResult(success=True, suggestions=suggestions)
        return PluginResult(success=False)


# Global registry instance
_plugin_registry_instance: Optional[ClinicalPluginRegistry] = None


def get_clinical_plugin_registry(
    event_bus=None,
    policy_config=None,
) -> ClinicalPluginRegistry:
    """Get or create the global plugin registry"""
    global _plugin_registry_instance
    if _plugin_registry_instance is None:
        _plugin_registry_instance = ClinicalPluginRegistry(event_bus, policy_config)
    return _plugin_registry_instance


def reset_clinical_plugin_registry() -> None:
    """Reset the global plugin registry (for testing)"""
    global _plugin_registry_instance
    _plugin_registry_instance = None


__all__ = [
    # Core classes
    "BaseClinicalPlugin",
    "ClinicalPluginRegistry",
    "PluginCapabilities",
    "PluginContext",
    "PluginResult",
    "PluginPriority",
    "ClinicalEventType",
    # Example plugins
    "CardiologyPlugin",
    "OncologyPlugin",
    # Factory functions
    "get_clinical_plugin_registry",
    "reset_clinical_plugin_registry",
]
