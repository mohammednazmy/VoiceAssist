#!/usr/bin/env python3
"""
Fix deprecated datetime.utcnow() calls.

Replaces:
  datetime.utcnow() -> datetime.now(timezone.utc)

Also ensures the proper import:
  from datetime import datetime, timezone

Part of VoiceAssist v4.2.0 technical debt cleanup.
"""

import re
import sys
from pathlib import Path


def fix_datetime_utcnow(file_path: Path) -> tuple[bool, int]:
    """
    Fix datetime.utcnow() calls in a file.

    Returns:
        (modified, count) - whether file was modified and number of replacements
    """
    content = file_path.read_text()
    original = content

    # Count replacements
    count = len(re.findall(r'datetime\.utcnow\(\)', content))

    if count == 0:
        return False, 0

    # Replace datetime.utcnow() with datetime.now(timezone.utc)
    content = re.sub(
        r'datetime\.utcnow\(\)',
        'datetime.now(timezone.utc)',
        content
    )

    # Check if timezone is imported
    if 'from datetime import' in content:
        # Add timezone to existing import if not present
        if 'timezone' not in content:
            # Find the datetime import line and add timezone
            content = re.sub(
                r'(from datetime import datetime)(?!.*timezone)',
                r'\1, timezone',
                content
            )
            content = re.sub(
                r'(from datetime import.*?)(\n)',
                lambda m: m.group(1) + (', timezone' if 'timezone' not in m.group(1) else '') + m.group(2),
                content,
                count=1
            )
    elif 'import datetime' in content:
        # Module-level import, need to use datetime.timezone.utc
        content = re.sub(
            r'datetime\.now\(timezone\.utc\)',
            'datetime.datetime.now(datetime.timezone.utc)',
            content
        )

    if content != original:
        file_path.write_text(content)
        return True, count

    return False, 0


def main():
    """Main entry point."""
    base_path = Path('/home/asimo/VoiceAssist/services/api-gateway/app')

    total_files = 0
    total_replacements = 0
    modified_files = []

    for py_file in base_path.rglob('*.py'):
        # Skip virtual environments and cache
        if '.venv' in str(py_file) or '__pycache__' in str(py_file):
            continue

        modified, count = fix_datetime_utcnow(py_file)
        if modified:
            total_files += 1
            total_replacements += count
            modified_files.append(str(py_file.relative_to(base_path)))
            print(f"Fixed {count} occurrences in: {py_file.relative_to(base_path)}")

    print(f"\n=== Summary ===")
    print(f"Modified files: {total_files}")
    print(f"Total replacements: {total_replacements}")

    if modified_files:
        print("\nModified files:")
        for f in modified_files:
            print(f"  - {f}")

    return 0


if __name__ == '__main__':
    sys.exit(main())
