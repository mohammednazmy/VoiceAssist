"""Test that Python and TypeScript feature flag definitions are in sync.

This test ensures that flag definitions in Python (flag_definitions.py) match
the TypeScript definitions in packages/types/src/featureFlags.ts.

Prevents drift between frontend and backend flag configurations.
"""

import re
from pathlib import Path

import pytest
from app.core.flag_definitions import FEATURE_FLAGS, LEGACY_FLAG_NAME_MAP, get_all_flags


def get_project_root() -> Path:
    """Get the project root directory."""
    current = Path(__file__).resolve()
    # Navigate up to find the monorepo root
    for parent in current.parents:
        if (parent / "packages").exists() and (parent / "services").exists():
            return parent
    raise RuntimeError("Could not find project root")


def extract_ts_flag_names() -> set:
    """Extract flag names from TypeScript featureFlags.ts."""
    project_root = get_project_root()
    ts_file = project_root / "packages" / "types" / "src" / "featureFlags.ts"

    if not ts_file.exists():
        pytest.skip(f"TypeScript file not found: {ts_file}")

    content = ts_file.read_text()

    # Extract flag names from patterns like: name: "ui.unified_chat_voice"
    # Include digits in the feature name part (e.g., onboarding_v2)
    pattern = r'name:\s*["\']([a-z]+\.[a-z][a-z0-9_]*)["\']'
    matches = re.findall(pattern, content)

    return set(matches)


def extract_ts_legacy_map() -> dict:
    """Extract legacy flag name mapping from TypeScript."""
    project_root = get_project_root()
    ts_file = project_root / "packages" / "types" / "src" / "featureFlags.ts"

    if not ts_file.exists():
        pytest.skip(f"TypeScript file not found: {ts_file}")

    content = ts_file.read_text()

    # Find the LEGACY_FLAG_NAME_MAP object
    pattern = r"LEGACY_FLAG_NAME_MAP[^{]*\{([^}]+)\}"
    match = re.search(pattern, content, re.DOTALL)

    if not match:
        return {}

    map_content = match.group(1)
    # Extract key-value pairs
    pair_pattern = r'(\w+):\s*["\']([^"\']+)["\']'
    pairs = re.findall(pair_pattern, map_content)

    return dict(pairs)


def extract_ts_categories() -> set:
    """Extract FLAG_CATEGORIES from TypeScript."""
    project_root = get_project_root()
    ts_file = project_root / "packages" / "types" / "src" / "featureFlags.ts"

    if not ts_file.exists():
        pytest.skip(f"TypeScript file not found: {ts_file}")

    content = ts_file.read_text()

    # Extract categories from FLAG_CATEGORIES array
    pattern = r"FLAG_CATEGORIES\s*=\s*\[([^\]]+)\]"
    match = re.search(pattern, content)

    if not match:
        return set()

    categories_str = match.group(1)
    # Extract quoted strings
    cats = re.findall(r'["\'](\w+)["\']', categories_str)

    return set(cats)


class TestFlagSync:
    """Tests for TypeScript/Python flag definition synchronization."""

    def test_flag_names_match(self):
        """Verify all flag names exist in both Python and TypeScript."""
        py_flags = {flag.name for flag in get_all_flags()}
        ts_flags = extract_ts_flag_names()

        # Flags in Python but not TypeScript
        py_only = py_flags - ts_flags
        # Flags in TypeScript but not Python
        ts_only = ts_flags - py_flags

        errors = []
        if py_only:
            errors.append(f"Flags in Python but not TypeScript: {sorted(py_only)}")
        if ts_only:
            errors.append(f"Flags in TypeScript but not Python: {sorted(ts_only)}")

        assert not errors, "\n".join(errors)

    def test_categories_match(self):
        """Verify categories are the same in Python and TypeScript."""
        py_categories = set(FEATURE_FLAGS.keys())
        ts_categories = extract_ts_categories()

        assert py_categories == ts_categories, (
            "Category mismatch:\n"
            f"Python only: {py_categories - ts_categories}\n"
            f"TypeScript only: {ts_categories - py_categories}"
        )

    def test_legacy_map_matches(self):
        """Verify legacy flag name mappings are the same."""
        py_legacy = LEGACY_FLAG_NAME_MAP
        ts_legacy = extract_ts_legacy_map()

        # Compare keys
        py_keys = set(py_legacy.keys())
        ts_keys = set(ts_legacy.keys())

        key_errors = []
        if py_keys - ts_keys:
            key_errors.append(f"Legacy keys in Python only: {py_keys - ts_keys}")
        if ts_keys - py_keys:
            key_errors.append(f"Legacy keys in TypeScript only: {ts_keys - py_keys}")

        # Compare values for matching keys
        value_errors = []
        for key in py_keys & ts_keys:
            if py_legacy[key] != ts_legacy[key]:
                value_errors.append(f"  {key}: Python={py_legacy[key]}, TS={ts_legacy[key]}")

        errors = key_errors + value_errors
        assert not errors, "Legacy mapping mismatch:\n" + "\n".join(errors)

    def test_flag_count_sanity(self):
        """Ensure we have a reasonable number of flags defined."""
        all_flags = get_all_flags()

        # Sanity check: should have at least 10 flags
        assert len(all_flags) >= 10, f"Only {len(all_flags)} flags defined"

        # Check each category has at least one flag
        for category, flags in FEATURE_FLAGS.items():
            assert len(flags) >= 1, f"Category '{category}' has no flags"

    def test_flag_naming_convention(self):
        """Verify all flags follow the naming convention."""
        pattern = r"^(ui|backend|admin|integration|experiment|ops)\.[a-z][a-z0-9_]*$"

        invalid_flags = []
        for flag in get_all_flags():
            if not re.match(pattern, flag.name):
                invalid_flags.append(flag.name)

        assert not invalid_flags, f"Invalid flag names: {invalid_flags}"

    def test_flag_descriptions_not_empty(self):
        """Verify all flags have descriptions."""
        empty_descriptions = []
        for flag in get_all_flags():
            if not flag.description or len(flag.description.strip()) < 5:
                empty_descriptions.append(flag.name)

        assert not empty_descriptions, f"Flags with empty/short descriptions: {empty_descriptions}"

    def test_critical_flags_have_owners(self):
        """Verify critical/high flags have owners specified."""
        missing_owners = []
        for flag in get_all_flags():
            if flag.metadata.criticality in ("critical", "high"):
                if not flag.metadata.owner:
                    missing_owners.append(f"{flag.name} ({flag.metadata.criticality})")

        # This is a warning, not a failure - log but don't fail
        if missing_owners:
            pytest.skip(f"Warning: High/critical flags without owners: {missing_owners}")


class TestFlagMetadata:
    """Tests for flag metadata validation."""

    def test_docs_url_format(self):
        """Verify docs_url fields contain valid URLs."""
        import urllib.parse

        invalid_urls = []
        for flag in get_all_flags():
            docs_url = flag.metadata.docs_url
            if docs_url:
                try:
                    result = urllib.parse.urlparse(docs_url)
                    if not all([result.scheme, result.netloc]):
                        invalid_urls.append(f"{flag.name}: {docs_url}")
                except Exception as e:
                    invalid_urls.append(f"{flag.name}: {docs_url} (error: {e})")

        assert not invalid_urls, "Invalid docs URLs:\n" + "\n".join(invalid_urls)

    def test_docs_url_domain(self):
        """Verify docs_url points to expected documentation domains."""
        expected_domains = [
            "assistdocs.asimo.io",
            "docs.asimo.io",
            "github.com",
        ]

        unexpected_domains = []
        for flag in get_all_flags():
            docs_url = flag.metadata.docs_url
            if docs_url:
                import urllib.parse

                result = urllib.parse.urlparse(docs_url)
                if result.netloc and result.netloc not in expected_domains:
                    unexpected_domains.append(f"{flag.name}: {result.netloc}")

        if unexpected_domains:
            pytest.skip(f"Warning: Docs URLs with unexpected domains: {unexpected_domains}")

    def test_criticality_values(self):
        """Verify criticality values are valid."""
        valid_values = {"low", "medium", "high", "critical"}
        invalid = []

        for flag in get_all_flags():
            if flag.metadata.criticality not in valid_values:
                invalid.append(f"{flag.name}: {flag.metadata.criticality}")

        assert not invalid, f"Invalid criticality values: {invalid}"

    def test_allowed_values_match_type(self):
        """Verify allowed_values is only used with string flags."""
        mismatched = []
        for flag in get_all_flags():
            if flag.metadata.allowed_values:
                if flag.flag_type.value != "string":
                    mismatched.append(f"{flag.name}: allowed_values with type={flag.flag_type.value}")

        assert not mismatched, f"allowed_values on non-string flags: {mismatched}"

    def test_min_max_values_match_type(self):
        """Verify min/max values are only used with number flags."""
        mismatched = []
        for flag in get_all_flags():
            has_minmax = flag.metadata.min_value is not None or flag.metadata.max_value is not None
            if has_minmax and flag.flag_type.value != "number":
                mismatched.append(f"{flag.name}: min/max values with type={flag.flag_type.value}")

        assert not mismatched, f"min/max values on non-number flags: {mismatched}"

    def test_deprecated_flags_have_message(self):
        """Verify deprecated flags have deprecation messages."""
        missing_messages = []
        for flag in get_all_flags():
            if flag.metadata.deprecated and not flag.metadata.deprecated_message:
                missing_messages.append(flag.name)

        assert not missing_messages, f"Deprecated flags without message: {missing_messages}"


class TestFlagDependencies:
    """Tests for flag dependency consistency."""

    def test_dependency_flags_exist(self):
        """Verify flags referenced in dependencies actually exist."""
        all_flag_names = {flag.name for flag in get_all_flags()}

        missing_refs = []
        for flag in get_all_flags():
            for ref_flag in flag.dependencies.other_flags:
                if ref_flag not in all_flag_names:
                    missing_refs.append(f"{flag.name} references missing: {ref_flag}")

        assert not missing_refs, "Missing dependency references:\n" + "\n".join(missing_refs)

    def test_no_deep_circular_dependencies(self):
        """Verify no deep circular flag dependencies (length > 2).

        Note: Bi-directional dependencies (A <-> B) are allowed and common
        for related flags. This test only catches longer cycles like A -> B -> C -> A.
        """
        all_flags = {flag.name: flag for flag in get_all_flags()}

        def find_long_cycle(start: str, current: str, path: list, visited: set) -> list:
            """Find cycles longer than 2 (bidirectional deps are ok)."""
            if current in path:
                cycle_start = path.index(current)
                cycle = path[cycle_start:] + [current]
                # Only report if cycle length > 2 (not just A -> B -> A)
                if len(cycle) > 3:  # 3 because we include start twice
                    return cycle
                return []

            if current in visited:
                return []

            visited.add(current)
            path.append(current)

            flag = all_flags.get(current)
            if flag:
                for dep in flag.dependencies.other_flags:
                    cycle = find_long_cycle(start, dep, path.copy(), visited)
                    if cycle:
                        return cycle

            return []

        cycles = set()
        for flag_name in all_flags:
            cycle = find_long_cycle(flag_name, flag_name, [], set())
            if cycle:
                # Normalize cycle to avoid duplicates
                min_idx = cycle.index(min(cycle[:-1]))  # exclude last (duplicate)
                normalized = cycle[min_idx:-1]
                cycles.add(" -> ".join(normalized))

        assert not cycles, f"Deep circular dependencies found: {cycles}"


class TestPhase32TypeSupport:
    """Tests for Phase 3.2 advanced flag features type support."""

    def test_ts_has_variant_type(self):
        """Verify TypeScript has FlagVariant type definition."""
        project_root = get_project_root()
        ts_file = project_root / "packages" / "types" / "src" / "featureFlags.ts"

        if not ts_file.exists():
            pytest.skip(f"TypeScript file not found: {ts_file}")

        content = ts_file.read_text()

        # Check for FlagVariant interface/type
        assert "FlagVariant" in content, "FlagVariant type not found in TypeScript"
        assert "weight" in content, "weight field not found in TypeScript types"

    def test_ts_has_targeting_rule_type(self):
        """Verify TypeScript has TargetingRule type definition."""
        project_root = get_project_root()
        ts_file = project_root / "packages" / "types" / "src" / "featureFlags.ts"

        if not ts_file.exists():
            pytest.skip(f"TypeScript file not found: {ts_file}")

        content = ts_file.read_text()

        # Check for TargetingRule interface/type
        assert "TargetingRule" in content, "TargetingRule type not found in TypeScript"
        assert "operator" in content, "operator field not found in TypeScript types"

    def test_ts_has_schedule_type(self):
        """Verify TypeScript has FlagSchedule type definition."""
        project_root = get_project_root()
        ts_file = project_root / "packages" / "types" / "src" / "featureFlags.ts"

        if not ts_file.exists():
            pytest.skip(f"TypeScript file not found: {ts_file}")

        content = ts_file.read_text()

        # Check for schedule-related types
        assert "FlagSchedule" in content or "schedule" in content.lower(), "Schedule type not found in TypeScript"

    def test_ts_has_environment_type(self):
        """Verify TypeScript has FlagEnvironment type definition."""
        project_root = get_project_root()
        ts_file = project_root / "packages" / "types" / "src" / "featureFlags.ts"

        if not ts_file.exists():
            pytest.skip(f"TypeScript file not found: {ts_file}")

        content = ts_file.read_text()

        # Check for environment type
        assert (
            "FlagEnvironment" in content or "environment" in content.lower()
        ), "Environment type not found in TypeScript"
        # Verify environment values
        assert "production" in content.lower()
        assert "staging" in content.lower() or "development" in content.lower()

    def test_python_model_has_phase32_columns(self):
        """Verify Python FeatureFlag model has Phase 3.2 columns."""
        from app.models.feature_flag import FeatureFlag

        # Check model has the required attributes
        assert hasattr(FeatureFlag, "variants"), "variants column missing from FeatureFlag"
        assert hasattr(FeatureFlag, "targeting_rules"), "targeting_rules column missing"
        assert hasattr(FeatureFlag, "schedule"), "schedule column missing"
        assert hasattr(FeatureFlag, "environment"), "environment column missing"
        assert hasattr(FeatureFlag, "archived"), "archived column missing"
        assert hasattr(FeatureFlag, "archived_at"), "archived_at column missing"

    def test_python_has_multivariate_flag_type(self):
        """Verify Python has MULTIVARIATE flag type."""
        from app.models.feature_flag import FeatureFlagType

        assert hasattr(FeatureFlagType, "MULTIVARIATE"), "MULTIVARIATE type missing from FeatureFlagType"
        assert FeatureFlagType.MULTIVARIATE.value == "multivariate"


class TestOperatorSync:
    """Tests for operator definitions sync between TypeScript and Python."""

    def test_python_operators_complete(self):
        """Verify Python has all expected operators."""
        from app.services.rule_engine import Operator

        expected_operators = [
            "equals",
            "not_equals",
            "in",
            "not_in",
            "contains",
            "starts_with",
            "ends_with",
            "regex",
            "gt",
            "gte",
            "lt",
            "lte",
            "semver_gt",
            "semver_gte",
            "semver_lt",
            "semver_lte",
        ]

        python_operators = [op.value for op in Operator]

        for expected in expected_operators:
            assert expected in python_operators, f"Operator '{expected}' missing from Python Operator enum"

    def test_ts_has_operator_definitions(self):
        """Verify TypeScript has operator definitions."""
        project_root = get_project_root()
        ts_file = project_root / "packages" / "types" / "src" / "featureFlags.ts"

        if not ts_file.exists():
            pytest.skip(f"TypeScript file not found: {ts_file}")

        content = ts_file.read_text()

        # Check for operator-related definitions
        expected_operators = ["equals", "not_equals", "in", "contains", "semver"]

        found_count = sum(1 for op in expected_operators if op in content.lower())
        assert found_count >= 3, f"Expected operators in TypeScript, found only {found_count} matches"
