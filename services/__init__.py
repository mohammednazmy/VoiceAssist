"""
Compatibility package for `services.api_gateway`.

Some tests import `services.api_gateway.app.main` assuming a dotted
package layout. The canonical backend lives under `services/api-gateway/`.

This package provides a thin alias so that those imports resolve
without modifying the canonical backend structure.
"""

