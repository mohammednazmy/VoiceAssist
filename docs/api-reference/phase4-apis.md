---
title: Phase 4 API Reference
slug: api-reference/phase4-apis
summary: >-
  API documentation for Phase 4 features including Analytics Dashboard,
  Multi-Tenancy Organizations, Learning Mode, and Enhanced PDF Processing.
status: stable
stability: production
owner: backend
lastUpdated: "2025-12-11"
audience:
  - human
  - agent
  - backend
  - frontend
tags:
  - api
  - analytics
  - organizations
  - learning
  - pdf
category: api
relatedServices:
  - api-gateway
version: 1.0.0
---

# Phase 4 API Reference

**Last Updated:** 2025-12-11

This document covers the API endpoints added in Phase 4:
- Analytics Dashboard API
- Organizations (Multi-Tenancy) API
- Learning Mode (Flashcards) API
- Enhanced PDF Processing API

## Table of Contents

1. [Analytics Dashboard API](#analytics-dashboard-api)
2. [Organizations API](#organizations-api)
3. [Learning Mode API](#learning-mode-api)
4. [Enhanced PDF Processing API](#enhanced-pdf-processing-api)

---

## Analytics Dashboard API

Base path: `/api/admin/analytics`

All endpoints require admin authentication.

### Get Analytics Summary

Retrieve aggregated analytics summary for a time period.

```
GET /api/admin/analytics/summary
```

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `start_date` | string (ISO 8601) | Yes | Start of date range |
| `end_date` | string (ISO 8601) | Yes | End of date range |
| `organization_id` | string | No | Filter by organization (multi-tenant) |

**Response:**

```json
{
  "period": {
    "start": "2025-12-01T00:00:00Z",
    "end": "2025-12-11T23:59:59Z"
  },
  "conversations": {
    "total": 1523,
    "active": 342,
    "completed": 1181
  },
  "users": {
    "total": 156,
    "active_today": 45,
    "active_this_week": 98
  },
  "tokens": {
    "total_input": 4523891,
    "total_output": 2891234,
    "by_model": {
      "gpt-4": { "input": 3000000, "output": 2000000 },
      "gpt-4-vision": { "input": 523891, "output": 391234 },
      "whisper": { "minutes": 1234.5 }
    }
  },
  "costs": {
    "total_cents": 45623,
    "by_service": {
      "openai_gpt4": 35000,
      "openai_whisper": 7500,
      "openai_tts": 3123
    }
  },
  "performance": {
    "avg_response_time_ms": 342,
    "p95_response_time_ms": 890,
    "error_rate": 0.023
  }
}
```

### Get Time Series Metrics

Retrieve metrics over time for charts and graphs.

```
GET /api/admin/analytics/timeseries
```

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `start_date` | string (ISO 8601) | Yes | Start of date range |
| `end_date` | string (ISO 8601) | Yes | End of date range |
| `metric_type` | string | Yes | One of: `conversations`, `tokens`, `costs`, `errors`, `users` |
| `granularity` | string | No | One of: `hour`, `day`, `week` (default: `day`) |
| `organization_id` | string | No | Filter by organization |

**Response:**

```json
{
  "metric_type": "conversations",
  "granularity": "day",
  "data": [
    { "timestamp": "2025-12-01T00:00:00Z", "value": 145 },
    { "timestamp": "2025-12-02T00:00:00Z", "value": 167 },
    { "timestamp": "2025-12-03T00:00:00Z", "value": 134 }
  ]
}
```

### Get Cost Breakdown

Detailed cost breakdown by service and organization.

```
GET /api/admin/analytics/costs
```

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `start_date` | string (ISO 8601) | Yes | Start of date range |
| `end_date` | string (ISO 8601) | Yes | End of date range |
| `group_by` | string | No | One of: `service`, `organization`, `day` |

**Response:**

```json
{
  "total_cents": 45623,
  "currency": "USD",
  "breakdown": [
    {
      "group": "openai_gpt4",
      "total_cents": 35000,
      "input_tokens": 3000000,
      "output_tokens": 2000000
    },
    {
      "group": "openai_whisper",
      "total_cents": 7500,
      "minutes_processed": 1234.5
    }
  ]
}
```

### Get Error Analytics

Retrieve error statistics and trends.

```
GET /api/admin/analytics/errors
```

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `start_date` | string (ISO 8601) | Yes | Start of date range |
| `end_date` | string (ISO 8601) | Yes | End of date range |
| `status` | string | No | Filter by status: `open`, `resolved`, `ignored` |

**Response:**

```json
{
  "summary": {
    "total": 234,
    "open": 12,
    "resolved": 198,
    "ignored": 24
  },
  "by_category": [
    { "category": "api_error", "count": 89 },
    { "category": "timeout", "count": 67 },
    { "category": "rate_limit", "count": 45 }
  ],
  "recent_errors": [
    {
      "id": "err_123",
      "category": "api_error",
      "message": "OpenAI API timeout",
      "count": 5,
      "first_seen": "2025-12-10T14:23:00Z",
      "last_seen": "2025-12-11T09:45:00Z",
      "status": "open"
    }
  ]
}
```

---

## Organizations API

Base path: `/api/admin/organizations`

Multi-tenancy organization management endpoints.

### List Organizations

```
GET /api/admin/organizations
```

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `page` | integer | No | Page number (default: 1) |
| `per_page` | integer | No | Items per page (default: 20, max: 100) |
| `status` | string | No | Filter by status: `active`, `suspended`, `pending` |
| `plan` | string | No | Filter by plan: `starter`, `professional`, `enterprise` |
| `search` | string | No | Search by name or slug |

**Response:**

```json
{
  "organizations": [
    {
      "id": "org_abc123",
      "name": "Medical Center A",
      "slug": "medical-center-a",
      "plan": "professional",
      "status": "active",
      "member_count": 25,
      "created_at": "2025-06-15T10:00:00Z",
      "quotas": {
        "max_users": 50,
        "max_documents": 1000,
        "max_storage_mb": 10240
      },
      "usage": {
        "users": 25,
        "documents": 342,
        "storage_mb": 4567
      }
    }
  ],
  "pagination": {
    "page": 1,
    "per_page": 20,
    "total": 45,
    "total_pages": 3
  }
}
```

### Create Organization

```
POST /api/admin/organizations
```

**Request Body:**

```json
{
  "name": "New Medical Center",
  "slug": "new-medical-center",
  "plan": "professional",
  "owner_email": "admin@newmedical.com",
  "settings": {
    "default_language": "en",
    "enable_voice": true,
    "enable_learning": true
  },
  "quotas": {
    "max_users": 50,
    "max_documents": 1000,
    "max_storage_mb": 10240
  }
}
```

**Response:**

```json
{
  "id": "org_xyz789",
  "name": "New Medical Center",
  "slug": "new-medical-center",
  "status": "active",
  "created_at": "2025-12-11T15:30:00Z",
  "owner": {
    "id": "user_123",
    "email": "admin@newmedical.com"
  }
}
```

### Get Organization Details

```
GET /api/admin/organizations/{organization_id}
```

**Response:**

```json
{
  "id": "org_abc123",
  "name": "Medical Center A",
  "slug": "medical-center-a",
  "plan": "professional",
  "status": "active",
  "created_at": "2025-06-15T10:00:00Z",
  "settings": {
    "default_language": "en",
    "enable_voice": true,
    "enable_learning": true,
    "custom_branding": {
      "logo_url": "https://...",
      "primary_color": "#1e40af"
    }
  },
  "quotas": {
    "max_users": 50,
    "max_documents": 1000,
    "max_storage_mb": 10240,
    "max_api_calls_per_month": 100000
  },
  "usage": {
    "users": 25,
    "documents": 342,
    "storage_mb": 4567,
    "api_calls_this_month": 45678
  },
  "members": [
    {
      "id": "user_123",
      "email": "admin@medical.com",
      "role": "owner",
      "joined_at": "2025-06-15T10:00:00Z"
    }
  ]
}
```

### Update Organization

```
PATCH /api/admin/organizations/{organization_id}
```

**Request Body:**

```json
{
  "name": "Updated Medical Center",
  "plan": "enterprise",
  "settings": {
    "enable_learning": false
  }
}
```

### Suspend Organization

```
POST /api/admin/organizations/{organization_id}/suspend
```

**Request Body:**

```json
{
  "reason": "Payment overdue",
  "notify_members": true
}
```

### Organization Members

#### List Members

```
GET /api/admin/organizations/{organization_id}/members
```

#### Invite Member

```
POST /api/admin/organizations/{organization_id}/members
```

**Request Body:**

```json
{
  "email": "newuser@medical.com",
  "role": "member"
}
```

**Roles:** `owner`, `admin`, `member`, `viewer`

#### Update Member Role

```
PATCH /api/admin/organizations/{organization_id}/members/{user_id}
```

**Request Body:**

```json
{
  "role": "admin"
}
```

#### Remove Member

```
DELETE /api/admin/organizations/{organization_id}/members/{user_id}
```

### Organization Audit Logs

```
GET /api/admin/organizations/{organization_id}/audit-logs
```

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `page` | integer | No | Page number |
| `per_page` | integer | No | Items per page |
| `action` | string | No | Filter by action type |
| `actor_id` | string | No | Filter by user who performed action |

**Response:**

```json
{
  "logs": [
    {
      "id": "log_123",
      "action": "member.invited",
      "actor": {
        "id": "user_123",
        "email": "admin@medical.com"
      },
      "target": {
        "type": "user",
        "id": "user_456",
        "email": "newuser@medical.com"
      },
      "metadata": {
        "role": "member"
      },
      "timestamp": "2025-12-11T14:30:00Z",
      "ip_address": "192.168.1.100"
    }
  ],
  "pagination": { ... }
}
```

---

## Learning Mode API

Base path: `/api/admin/learning`

Flashcard and spaced repetition learning endpoints.

### List Decks

```
GET /api/admin/learning/decks
```

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `organization_id` | string | No | Filter by organization |
| `created_by` | string | No | Filter by creator user ID |
| `search` | string | No | Search by deck name |

**Response:**

```json
{
  "decks": [
    {
      "id": "deck_123",
      "name": "Cardiology Basics",
      "description": "Essential cardiology concepts",
      "organization_id": "org_abc",
      "created_by": "user_123",
      "card_count": 156,
      "stats": {
        "new": 23,
        "learning": 45,
        "review": 67,
        "mastered": 21
      },
      "settings": {
        "new_cards_per_day": 20,
        "reviews_per_day": 100,
        "ease_factor": 2.5
      },
      "created_at": "2025-10-15T10:00:00Z",
      "updated_at": "2025-12-11T09:00:00Z"
    }
  ]
}
```

### Create Deck

```
POST /api/admin/learning/decks
```

**Request Body:**

```json
{
  "name": "Pharmacology 101",
  "description": "Drug mechanisms and interactions",
  "organization_id": "org_abc",
  "settings": {
    "new_cards_per_day": 15,
    "reviews_per_day": 80
  }
}
```

### Get Deck Details

```
GET /api/admin/learning/decks/{deck_id}
```

### Update Deck

```
PATCH /api/admin/learning/decks/{deck_id}
```

### Delete Deck

```
DELETE /api/admin/learning/decks/{deck_id}
```

### List Cards in Deck

```
GET /api/admin/learning/decks/{deck_id}/cards
```

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `status` | string | No | Filter by: `new`, `learning`, `review`, `mastered`, `suspended` |
| `page` | integer | No | Page number |
| `per_page` | integer | No | Items per page |

**Response:**

```json
{
  "cards": [
    {
      "id": "card_456",
      "deck_id": "deck_123",
      "front": "What is the primary mechanism of action for ACE inhibitors?",
      "back": "ACE inhibitors block the angiotensin-converting enzyme, preventing the conversion of angiotensin I to angiotensin II, leading to vasodilation and reduced blood pressure.",
      "status": "review",
      "ease_factor": 2.6,
      "interval_days": 7,
      "repetitions": 5,
      "next_review": "2025-12-18T10:00:00Z",
      "tags": ["pharmacology", "cardiovascular"],
      "created_at": "2025-11-01T10:00:00Z"
    }
  ],
  "pagination": { ... }
}
```

### Create Card

```
POST /api/admin/learning/decks/{deck_id}/cards
```

**Request Body:**

```json
{
  "front": "What are the classic signs of heart failure?",
  "back": "The classic signs include: dyspnea, orthopnea, paroxysmal nocturnal dyspnea, peripheral edema, and jugular venous distension.",
  "tags": ["cardiology", "diagnosis"]
}
```

### Update Card

```
PATCH /api/admin/learning/cards/{card_id}
```

### Delete Card

```
DELETE /api/admin/learning/cards/{card_id}
```

### Bulk Import Cards

```
POST /api/admin/learning/decks/{deck_id}/import
```

**Request Body (JSON format):**

```json
{
  "format": "json",
  "cards": [
    {
      "front": "Question 1",
      "back": "Answer 1",
      "tags": ["tag1"]
    },
    {
      "front": "Question 2",
      "back": "Answer 2"
    }
  ]
}
```

**Request Body (CSV format):**

```json
{
  "format": "csv",
  "data": "front,back,tags\n\"Question 1\",\"Answer 1\",\"tag1,tag2\"\n\"Question 2\",\"Answer 2\",\"\""
}
```

**Response:**

```json
{
  "imported": 2,
  "skipped": 0,
  "errors": []
}
```

### Export Deck

```
GET /api/admin/learning/decks/{deck_id}/export
```

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `format` | string | No | Export format: `json`, `csv`, `anki` (default: `json`) |

### Learning Statistics

```
GET /api/admin/learning/stats
```

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `organization_id` | string | No | Filter by organization |
| `user_id` | string | No | Filter by user |
| `start_date` | string | No | Start of date range |
| `end_date` | string | No | End of date range |

**Response:**

```json
{
  "total_decks": 15,
  "total_cards": 2345,
  "cards_by_status": {
    "new": 234,
    "learning": 456,
    "review": 1234,
    "mastered": 421
  },
  "reviews_completed": 12345,
  "reviews_by_rating": {
    "again": 1234,
    "hard": 2345,
    "good": 6789,
    "easy": 1977
  },
  "average_ease_factor": 2.45,
  "retention_rate": 0.87
}
```

---

## Enhanced PDF Processing API

Base path: `/api/admin/kb` (Knowledge Base)

Enhanced PDF processing with GPT-4 Vision integration.

### Get Document Enhanced Content

Retrieve the enhanced structure with AI-processed content blocks.

```
GET /api/admin/kb/documents/{document_id}/enhanced-content
```

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `page` | integer | No | Specific page number (1-indexed) |

**Response:**

```json
{
  "document_id": "doc_123",
  "total_pages": 47,
  "processing_stage": "complete",
  "processing_progress": 100,
  "pages": [
    {
      "page_number": 1,
      "content_blocks": [
        {
          "type": "heading",
          "content": "Cardiovascular Physiology",
          "bbox": [50, 72, 300, 100],
          "style": { "font_size": 18, "is_header": true }
        },
        {
          "type": "text",
          "content": "The cardiovascular system consists of the heart and blood vessels...",
          "bbox": [50, 120, 550, 400]
        },
        {
          "type": "table",
          "headers": ["Maneuver", "Effect on Murmur"],
          "rows": [
            ["Valsalva", "Decreases most murmurs except HCM and MVP"],
            ["Squatting", "Increases most murmurs except HCM"]
          ],
          "caption": "Table 1.1: Maneuvers affecting heart murmurs",
          "bbox": [50, 420, 550, 580]
        },
        {
          "type": "figure",
          "figure_id": "fig_1_1",
          "caption": "Cardiac auscultation points",
          "description": "Diagram showing the four main cardiac auscultation points: aortic (right second intercostal space), pulmonic (left second intercostal space), tricuspid (left lower sternal border), and mitral (cardiac apex).",
          "bbox": [100, 600, 500, 750]
        }
      ],
      "voice_narration": "This page introduces cardiovascular physiology, covering the basic anatomy and the maneuvers used to differentiate heart murmurs. Key points include the effects of Valsalva and squatting on murmur intensity.",
      "raw_text": "CARDIOVASCULAR PHYSIOLOGY..."
    }
  ],
  "metadata": {
    "processed_at": "2025-12-11T14:30:00Z",
    "processing_cost_cents": 60,
    "ocr_corrections": 12
  }
}
```

### Get Page Image

Retrieve the rendered page image for side-by-side viewing.

```
GET /api/admin/kb/documents/{document_id}/page-image/{page_number}
```

**Response:** JPEG image (Content-Type: image/jpeg)

### Update Page Content

Admin edit of page content blocks and voice narration.

```
PUT /api/admin/kb/documents/{document_id}/page/{page_number}/content
```

**Request Body:**

```json
{
  "content_blocks": [
    {
      "type": "heading",
      "content": "Cardiovascular Physiology (Corrected)"
    },
    {
      "type": "text",
      "content": "Updated text content..."
    },
    {
      "type": "table",
      "headers": ["Maneuver", "Effect"],
      "rows": [["Valsalva", "Decreases most murmurs"]]
    }
  ],
  "voice_narration": "Updated voice narration text..."
}
```

**Response:**

```json
{
  "success": true,
  "page_number": 1,
  "updated_at": "2025-12-11T15:00:00Z"
}
```

### Regenerate Page Analysis

Re-run GPT-4 Vision analysis for a single page.

```
POST /api/admin/kb/documents/{document_id}/page/{page_number}/regenerate
```

**Response:**

```json
{
  "success": true,
  "page_number": 1,
  "job_id": "job_xyz",
  "estimated_cost_cents": 1.3
}
```

### Get Processing Status

Check the status of document processing.

```
GET /api/admin/kb/documents/{document_id}/processing-status
```

**Response:**

```json
{
  "document_id": "doc_123",
  "status": "analyzing",
  "stage": "gpt4_vision_analyze",
  "progress": 65,
  "pages_processed": 31,
  "total_pages": 47,
  "estimated_completion": "2025-12-11T14:45:00Z",
  "cost_so_far_cents": 40
}
```

### Trigger Enhanced Processing

Start or restart enhanced processing for a document.

```
POST /api/admin/kb/documents/{document_id}/process-enhanced
```

**Request Body:**

```json
{
  "force": false,
  "pages": null
}
```

| Field | Type | Description |
|-------|------|-------------|
| `force` | boolean | Re-process even if already complete |
| `pages` | array | Specific pages to process (null = all) |

**Response:**

```json
{
  "job_id": "job_abc123",
  "document_id": "doc_123",
  "status": "queued",
  "estimated_cost_cents": 60,
  "estimated_duration_seconds": 300
}
```

---

## Error Responses

All endpoints return standard error responses:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid date format",
    "details": {
      "field": "start_date",
      "expected": "ISO 8601 format"
    }
  }
}
```

**Common Error Codes:**

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `UNAUTHORIZED` | 401 | Missing or invalid authentication |
| `FORBIDDEN` | 403 | Insufficient permissions |
| `NOT_FOUND` | 404 | Resource not found |
| `VALIDATION_ERROR` | 400 | Invalid request parameters |
| `QUOTA_EXCEEDED` | 429 | Organization quota exceeded |
| `INTERNAL_ERROR` | 500 | Internal server error |

---

## Rate Limits

| Endpoint Category | Rate Limit |
|-------------------|------------|
| Analytics queries | 60/minute |
| Organization CRUD | 30/minute |
| Learning operations | 100/minute |
| PDF processing | 10/minute |
| Page regeneration | 5/minute |

Rate limit headers are included in all responses:

```
X-RateLimit-Limit: 60
X-RateLimit-Remaining: 45
X-RateLimit-Reset: 1702300000
```
