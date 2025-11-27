# API Reference

**Last Updated:** 2025-11-27

The VoiceAssist API provides comprehensive REST endpoints for building medical AI assistant applications.

## Documentation

- **[Complete REST API Reference](api-reference/rest-api.md)** - Full endpoint documentation with examples
- **OpenAPI/Swagger UI** - Interactive docs at `http://localhost:8000/docs`
- **ReDoc** - Alternative docs at `http://localhost:8000/redoc`

## Quick Reference

### Base URLs

- **Production:** `https://assist.asimo.io`
- **Development:** `http://localhost:8000`

### Authentication

All authenticated endpoints require a Bearer token:

```
Authorization: Bearer <access_token>
```

### Core Endpoint Groups

| Group          | Prefix                     | Description                       |
| -------------- | -------------------------- | --------------------------------- |
| Authentication | `/api/auth`                | Login, register, token management |
| Users          | `/api/users`               | User profile and admin operations |
| Conversations  | `/conversations`           | Chat sessions and branching       |
| Admin Panel    | `/api/admin/panel`         | Dashboard, metrics, audit logs    |
| Knowledge Base | `/api/admin/kb`            | Document management               |
| Cache          | `/api/admin/cache`         | Cache statistics and control      |
| Feature Flags  | `/api/admin/feature-flags` | Feature toggle management         |
| Health         | `/health`, `/ready`        | Service health checks             |
| Metrics        | `/metrics`                 | Prometheus metrics                |
| Voice          | `/api/voice`               | Voice session management          |
| WebSocket      | `/ws`                      | Real-time chat                    |

For complete documentation with request/response examples, see [api-reference/rest-api.md](api-reference/rest-api.md).
