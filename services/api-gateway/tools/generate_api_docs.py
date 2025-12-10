#!/usr/bin/env python3
"""
API Documentation Generator

Generates machine-readable API documentation from the FastAPI OpenAPI spec.
Works in two modes:
1. Fetch from running service (default: http://localhost:8000)
2. Parse from saved openapi.json file

Usage:
    # From running service
    python tools/generate_api_docs.py --format all

    # From saved spec file
    python tools/generate_api_docs.py --format all --spec-file openapi.json

    # Output to stdout
    python tools/generate_api_docs.py --format json
    python tools/generate_api_docs.py --format markdown
"""

import argparse
import json
import sys
import urllib.error
import urllib.request
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


def fetch_openapi_spec(base_url: str) -> dict | None:
    """Fetch OpenAPI spec from running service."""
    try:
        url = f"{base_url}/openapi.json"
        with urllib.request.urlopen(url, timeout=10) as response:
            return json.loads(response.read().decode())
    except urllib.error.URLError as e:
        print(f"Could not fetch from {base_url}: {e}", file=sys.stderr)
        return None
    except Exception as e:
        print(f"Error fetching spec: {e}", file=sys.stderr)
        return None


def load_openapi_spec(file_path: Path) -> dict | None:
    """Load OpenAPI spec from file."""
    try:
        return json.loads(file_path.read_text())
    except Exception as e:
        print(f"Error loading spec from {file_path}: {e}", file=sys.stderr)
        return None


def extract_routes(spec: dict) -> list[dict[str, Any]]:
    """Extract route information from OpenAPI spec."""
    routes = []

    paths = spec.get("paths", {})
    for path, path_item in paths.items():
        for method, operation in path_item.items():
            if method in ["get", "post", "put", "delete", "patch"]:
                route_info = {
                    "path": path,
                    "method": method.upper(),
                    "operation_id": operation.get("operationId", ""),
                    "summary": operation.get("summary", ""),
                    "description": operation.get("description", ""),
                    "tags": operation.get("tags", []),
                    "deprecated": operation.get("deprecated", False),
                    "security": operation.get("security", []),
                    "parameters": len(operation.get("parameters", [])),
                    "request_body": "requestBody" in operation,
                    "responses": list(operation.get("responses", {}).keys()),
                }
                routes.append(route_info)

    return routes


def group_routes_by_tag(routes: list[dict]) -> dict[str, list[dict]]:
    """Group routes by their primary tag."""
    grouped = defaultdict(list)

    for route in routes:
        # Use first tag or 'untagged'
        tag = route["tags"][0] if route["tags"] else "untagged"
        grouped[tag].append(route)

    # Sort routes within each group by path
    for tag in grouped:
        grouped[tag].sort(key=lambda r: (r["path"], r["method"]))

    return dict(sorted(grouped.items()))


def generate_json_output(spec: dict, routes: list[dict], grouped: dict) -> dict:
    """Generate JSON output structure."""
    info = spec.get("info", {})

    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "app_name": info.get("title", "VoiceAssist API"),
        "app_version": info.get("version", "unknown"),
        "openapi_version": spec.get("openapi", "3.0.0"),
        "openapi_url": "/openapi.json",
        "docs_url": "/docs",
        "redoc_url": "/redoc",
        "summary": {
            "total_routes": len(routes),
            "total_tags": len(grouped),
            "tags": list(grouped.keys()),
        },
        "routes_by_tag": grouped,
        "all_routes": routes,
    }


def generate_markdown_output(spec: dict, routes: list[dict], grouped: dict) -> str:
    """Generate Markdown documentation."""
    info = spec.get("info", {})
    app_name = info.get("title", "VoiceAssist API")
    app_version = info.get("version", "unknown")

    lines = [
        "---",
        "title: API Routes Reference",
        "slug: api-reference/routes",
        "summary: Auto-generated route listing from OpenAPI specification.",
        "status: stable",
        "stability: production",
        "owner: backend",
        f'lastUpdated: "{datetime.now(timezone.utc).strftime("%Y-%m-%d")}"',
        'audience: ["human", "agent", "backend", "frontend"]',
        'tags: ["api", "routes", "auto-generated"]',
        'relatedServices: ["api-gateway"]',
        'version: "1.0.0"',
        "---",
        "",
        "# API Routes Reference",
        "",
        f"**Generated:** {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S')} UTC",
        f"**App:** {app_name}",
        f"**Version:** {app_version}",
        "",
        "---",
        "",
        "## Summary",
        "",
        f"- **Total Routes:** {len(routes)}",
        f"- **Total Tags/Modules:** {len(grouped)}",
        "",
        "### Tags Overview",
        "",
        "| Tag | Routes | Description |",
        "|-----|--------|-------------|",
    ]

    # Tag descriptions from OpenAPI spec
    tag_descriptions = {}
    for tag_info in spec.get("tags", []):
        tag_descriptions[tag_info.get("name", "")] = tag_info.get("description", "")

    # Fallback descriptions
    default_descriptions = {
        "health": "Service health and readiness checks",
        "auth": "Authentication (login, register, tokens)",
        "oauth": "OAuth2 provider integration (Google, Microsoft)",
        "users": "User profile and management",
        "conversations": "Chat sessions and branching",
        "voice": "Voice input/output and transcription",
        "admin-panel": "Dashboard, metrics, audit logs",
        "admin-kb": "Knowledge base document management",
        "admin-cache": "Cache statistics and control",
        "admin-feature-flags": "Feature toggle management",
        "integrations": "Nextcloud and external services",
        "medical": "Medical AI and RAG queries",
        "external-medical": "External medical APIs (PubMed, etc.)",
        "clinical": "Clinical context management",
        "attachments": "File attachments in chat",
        "folders": "Conversation organization",
        "export": "Conversation and data export",
        "sharing": "Conversation sharing",
        "realtime": "WebSocket connections",
        "metrics": "Prometheus metrics",
    }

    for tag, tag_routes in grouped.items():
        desc = tag_descriptions.get(tag) or default_descriptions.get(tag, "")
        lines.append(f"| {tag} | {len(tag_routes)} | {desc} |")

    lines.extend(
        [
            "",
            "---",
            "",
            "## Routes by Tag",
            "",
        ]
    )

    for tag, tag_routes in grouped.items():
        tag_title = tag.replace("-", " ").replace("_", " ").title()
        lines.append(f"### {tag_title}")
        lines.append("")
        lines.append("| Method | Path | Summary | Auth |")
        lines.append("|--------|------|---------|------|")

        for route in tag_routes:
            method = route["method"]
            path = route["path"]
            summary = route["summary"][:60] + "..." if len(route["summary"]) > 60 else route["summary"]
            deprecated = " *(deprecated)*" if route["deprecated"] else ""
            auth = "Yes" if route["security"] else "No"
            lines.append(f"| `{method}` | `{path}` | {summary}{deprecated} | {auth} |")

        lines.append("")

    lines.extend(
        [
            "---",
            "",
            "## Authentication",
            "",
            "Most endpoints require authentication via Bearer token:",
            "",
            "```",
            "Authorization: Bearer <access_token>",
            "```",
            "",
            "Obtain tokens via `/api/auth/login` or `/api/auth/register`.",
            "",
            "---",
            "",
            "## OpenAPI Specification",
            "",
            "The complete OpenAPI 3.0 specification is available at:",
            "",
            "- **Swagger UI:** `/docs`",
            "- **ReDoc:** `/redoc`",
            "- **OpenAPI JSON:** `/openapi.json`",
            "",
            "---",
            "",
            "*This document is auto-generated from the OpenAPI specification.*",
            "*Do not edit manually - regenerate using `tools/generate_api_docs.py`.*",
            "",
        ]
    )

    return "\n".join(lines)


def main():
    parser = argparse.ArgumentParser(description="Generate API documentation from OpenAPI spec")
    parser.add_argument(
        "--format",
        choices=["json", "markdown", "all"],
        default="all",
        help="Output format (default: all)",
    )
    parser.add_argument(
        "--base-url",
        default="http://localhost:8000",
        help="Base URL of running service (default: http://localhost:8000)",
    )
    parser.add_argument(
        "--spec-file",
        type=Path,
        help="Path to openapi.json file (alternative to fetching from service)",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=Path(__file__).parent.parent.parent.parent / "docs" / "api-reference",
        help="Output directory for 'all' format",
    )

    args = parser.parse_args()

    # Get OpenAPI spec
    spec = None
    if args.spec_file:
        spec = load_openapi_spec(args.spec_file)
    else:
        spec = fetch_openapi_spec(args.base_url)

    if not spec:
        print("Error: Could not obtain OpenAPI specification.", file=sys.stderr)
        print("Try running the service or providing a --spec-file.", file=sys.stderr)
        sys.exit(1)

    # Extract and group routes
    routes = extract_routes(spec)
    grouped = group_routes_by_tag(routes)

    if args.format == "json":
        output = generate_json_output(spec, routes, grouped)
        print(json.dumps(output, indent=2, default=str))

    elif args.format == "markdown":
        output = generate_markdown_output(spec, routes, grouped)
        print(output)

    else:  # all
        args.output_dir.mkdir(parents=True, exist_ok=True)

        # Write JSON
        json_path = args.output_dir / "api-routes.json"
        json_output = generate_json_output(spec, routes, grouped)
        json_path.write_text(json.dumps(json_output, indent=2, default=str))
        print(f"Written: {json_path}")

        # Write Markdown
        md_path = args.output_dir / "API_ROUTES.md"
        md_output = generate_markdown_output(spec, routes, grouped)
        md_path.write_text(md_output)
        print(f"Written: {md_path}")

        print(f"\nGenerated documentation for {len(routes)} routes in {len(grouped)} tags")


if __name__ == "__main__":
    main()
