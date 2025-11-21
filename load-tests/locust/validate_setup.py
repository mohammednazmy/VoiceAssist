#!/usr/bin/env python3
"""
Validate Locust load testing setup.

Checks:
- All required files exist
- Configuration is valid
- Dependencies are installed
- VoiceAssist is reachable (optional)
"""

import sys
import os
from pathlib import Path
import importlib.util


def check_file_exists(filepath, required=True):
    """Check if file exists."""
    exists = Path(filepath).exists()
    status = "✓" if exists else "✗"
    print(f"{status} {filepath}")
    if required and not exists:
        return False
    return True


def check_module(module_name):
    """Check if Python module is available."""
    spec = importlib.util.find_spec(module_name)
    exists = spec is not None
    status = "✓" if exists else "✗"
    print(f"{status} {module_name}")
    return exists


def main():
    print("=" * 80)
    print("VoiceAssist Locust Load Testing - Setup Validation")
    print("=" * 80)
    print()

    all_good = True

    # Check core files
    print("Core Files:")
    print("-" * 80)
    core_files = [
        "locustfile.py",
        "config.py",
        "tasks.py",
        "utils.py",
        "requirements.txt",
        "run-tests.sh",
        "docker-compose.yml",
        "__init__.py"
    ]
    for f in core_files:
        if not check_file_exists(f):
            all_good = False
    print()

    # Check scenario files
    print("Scenario Files:")
    print("-" * 80)
    scenario_files = [
        "scenarios/__init__.py",
        "scenarios/user_journey.py",
        "scenarios/admin_workflow.py",
        "scenarios/stress_scenario.py",
        "scenarios/spike_scenario.py"
    ]
    for f in scenario_files:
        if not check_file_exists(f):
            all_good = False
    print()

    # Check documentation
    print("Documentation:")
    print("-" * 80)
    doc_files = [
        "README.md",
        "QUICKSTART.md",
        "IMPLEMENTATION_SUMMARY.md"
    ]
    for f in doc_files:
        check_file_exists(f, required=False)
    print()

    # Check Python dependencies
    print("Python Dependencies:")
    print("-" * 80)
    required_modules = [
        "locust",
        "requests",
        "pandas",
        "websocket"
    ]
    for module in required_modules:
        if not check_module(module):
            all_good = False
            print(f"  → Install with: pip install -r requirements.txt")
    print()

    # Test import configuration
    print("Configuration:")
    print("-" * 80)
    try:
        from config import config
        print(f"✓ Configuration loaded successfully")
        print(f"  Base URL: {config.BASE_URL}")
        print(f"  WS URL: {config.WS_URL}")
        print(f"  Test users: {len(config.TEST_USERS)}")
    except Exception as e:
        print(f"✗ Configuration error: {e}")
        all_good = False
    print()

    # Test VoiceAssist connectivity (optional)
    print("VoiceAssist Connectivity (optional):")
    print("-" * 80)
    try:
        import requests
        from config import config
        response = requests.get(f"{config.BASE_URL}/health", timeout=5)
        if response.status_code == 200:
            print(f"✓ VoiceAssist is reachable at {config.BASE_URL}")
        else:
            print(f"⚠ VoiceAssist returned status code: {response.status_code}")
    except Exception as e:
        print(f"⚠ Cannot reach VoiceAssist: {e}")
        print(f"  → Start with: docker-compose up -d")
    print()

    # Final result
    print("=" * 80)
    if all_good:
        print("✓ Setup validation PASSED - Ready for load testing!")
        print()
        print("Next steps:")
        print("  1. Start VoiceAssist: docker-compose up -d")
        print("  2. Run smoke test: ./run-tests.sh smoke")
        print("  3. Or start web UI: ./run-tests.sh web")
        sys.exit(0)
    else:
        print("✗ Setup validation FAILED - Please fix the issues above")
        print()
        print("Common fixes:")
        print("  1. Install dependencies: pip install -r requirements.txt")
        print("  2. Ensure you're in the locust directory")
        print("  3. Check file permissions: chmod +x run-tests.sh")
        sys.exit(1)


if __name__ == "__main__":
    main()
