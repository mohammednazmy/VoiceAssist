"""
Configuration file for Locust load testing.

Contains all configuration parameters for VoiceAssist load tests including:
- Base URLs
- Test users and credentials
- API endpoints
- Task weights
- Wait times
"""
import os
from dataclasses import dataclass
from typing import Dict, List


@dataclass
class TestUser:
    """Test user credentials."""
    email: str
    password: str
    full_name: str
    role: str


@dataclass
class LoadTestConfig:
    """Main configuration for load tests."""

    # Base URLs
    BASE_URL: str = os.getenv("VOICEASSIST_BASE_URL", "http://localhost:8000")
    WS_URL: str = os.getenv("VOICEASSIST_WS_URL", "ws://localhost:8000")

    # Authentication
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15

    # API Endpoints
    ENDPOINTS = {
        # Authentication
        "register": "/api/auth/register",
        "login": "/api/auth/login",
        "refresh": "/api/auth/refresh",
        "logout": "/api/auth/logout",
        "me": "/api/auth/me",

        # Health
        "health": "/health",
        "health_detailed": "/health/detailed",

        # Chat (if using REST)
        "chat": "/api/chat",

        # Conversations (history)
        "conversations": "/api/conversations",
        "conversation": "/api/conversations/{conversation_id}",
        "conversation_messages": "/api/conversations/{conversation_id}/messages",

        # Export
        "export_markdown": "/api/sessions/{session_id}/export/markdown",
        "export_pdf": "/api/sessions/{session_id}/export/pdf",

        # Admin - Knowledge Base
        "admin_kb_documents": "/api/admin/kb/documents",
        "admin_kb_document": "/api/admin/kb/documents/{document_id}",

        # Admin - Cache
        "admin_cache_stats": "/api/admin/cache/stats",
        "admin_cache_clear": "/api/admin/cache/clear",

        # Admin - Feature Flags
        "admin_feature_flags": "/api/admin/feature-flags",
        "admin_feature_flag": "/api/admin/feature-flags/{flag_id}",

        # Admin - Panel
        "admin_dashboard": "/api/admin/dashboard",
        "admin_users": "/api/admin/users",
        "admin_sessions": "/api/admin/sessions",

        # Metrics
        "metrics": "/metrics",

        # Integrations
        "integrations_nextcloud": "/api/integrations/nextcloud",
        "integrations_calendar": "/api/integrations/calendar",
        "integrations_files": "/api/integrations/files",

        # WebSocket
        "websocket": "/api/realtime/ws",
    }

    # Test Users
    TEST_USERS: List[TestUser] = None

    def __post_init__(self):
        """Initialize test users."""
        self.TEST_USERS = [
            # Regular users (70%)
            TestUser(
                email="user1@test.com",
                password="testpass123",
                full_name="Test User 1",
                role="user"
            ),
            TestUser(
                email="user2@test.com",
                password="testpass123",
                full_name="Test User 2",
                role="user"
            ),
            TestUser(
                email="user3@test.com",
                password="testpass123",
                full_name="Test User 3",
                role="user"
            ),
            TestUser(
                email="user4@test.com",
                password="testpass123",
                full_name="Test User 4",
                role="user"
            ),
            TestUser(
                email="user5@test.com",
                password="testpass123",
                full_name="Test User 5",
                role="user"
            ),
            TestUser(
                email="user6@test.com",
                password="testpass123",
                full_name="Test User 6",
                role="user"
            ),
            TestUser(
                email="user7@test.com",
                password="testpass123",
                full_name="Test User 7",
                role="user"
            ),

            # Power users (20%)
            TestUser(
                email="poweruser1@test.com",
                password="testpass123",
                full_name="Power User 1",
                role="power_user"
            ),
            TestUser(
                email="poweruser2@test.com",
                password="testpass123",
                full_name="Power User 2",
                role="power_user"
            ),

            # Admin users (10%)
            TestUser(
                email="admin@test.com",
                password="testpass123",
                full_name="Admin User",
                role="admin"
            ),
        ]

    # Task Weights - Define probability distribution for tasks
    TASK_WEIGHTS = {
        # Regular User Tasks (70% of load)
        "regular_user": {
            "chat_query": 50,           # Most common action
            "simple_question": 20,       # Quick questions
            "check_history": 10,         # View past conversations
            "view_profile": 5,           # Check user profile
            "health_check": 5,           # Monitor health
        },

        # Power User Tasks (20% of load)
        "power_user": {
            "complex_query": 30,         # Detailed medical queries
            "multi_turn_conversation": 25,  # Multiple message exchanges
            "search_documents": 15,      # Search knowledge base
            "integration_actions": 15,   # Use integrations
            "export_data": 10,           # Export results
            "check_metrics": 5,          # View metrics
        },

        # Admin Tasks (10% of load)
        "admin_user": {
            "upload_document": 25,       # Upload KB documents
            "manage_documents": 20,      # List/delete documents
            "view_dashboard": 15,        # Admin dashboard
            "manage_users": 15,          # User management
            "cache_management": 10,      # Cache operations
            "feature_flags": 10,         # Feature flag management
            "view_metrics": 5,           # System metrics
        }
    }

    # Wait Times (seconds) - Realistic think time between actions
    WAIT_TIMES = {
        "regular_user": {
            "min": 2,
            "max": 8
        },
        "power_user": {
            "min": 3,
            "max": 12
        },
        "admin_user": {
            "min": 5,
            "max": 15
        },
        "websocket": {
            "min": 1,
            "max": 5
        }
    }

    # Sample Queries for Chat Testing
    SAMPLE_QUERIES = {
        "simple": [
            "What is hypertension?",
            "What are the symptoms of diabetes?",
            "How is asthma treated?",
            "What is the normal blood pressure range?",
            "What causes migraines?",
        ],
        "moderate": [
            "What are the treatment options for type 2 diabetes in elderly patients?",
            "How do I manage a patient with both COPD and heart failure?",
            "What are the contraindications for ACE inhibitors?",
            "What is the differential diagnosis for chest pain?",
            "When should I refer a patient with chronic kidney disease?",
        ],
        "complex": [
            "I have a 65-year-old male patient with diabetes, hypertension, and recent MI. "
            "What are the evidence-based guidelines for medication management?",

            "A 45-year-old female presents with fatigue, weight gain, and cold intolerance. "
            "What diagnostic workup should I order and what are the treatment options?",

            "My patient has poorly controlled asthma despite maximal inhaler therapy. "
            "What are the next steps in management including biologics?",

            "How do I approach a patient with suspected sepsis in the emergency department? "
            "What are the SIRS criteria and sepsis-3 definitions?",

            "What is the current evidence for anticoagulation in atrial fibrillation? "
            "How do I calculate stroke risk and bleeding risk?",
        ],
        "multi_turn": [
            ["What is pneumonia?",
             "What are the treatment guidelines?",
             "When should I hospitalize a patient?"],

            ["Tell me about heart failure.",
             "What are the stages?",
             "How is stage C treated?",
             "What are the indications for device therapy?"],

            ["What is COPD?",
             "How do I assess severity?",
             "What inhalers should I prescribe for moderate COPD?"],
        ]
    }

    # Document Upload Test Files
    TEST_DOCUMENTS = {
        "small": {
            "filename": "test_guideline_small.txt",
            "content": "Sample medical guideline for testing. " * 100,  # ~4KB
            "title": "Small Test Guideline"
        },
        "medium": {
            "filename": "test_guideline_medium.txt",
            "content": "Sample medical guideline for testing. " * 1000,  # ~40KB
            "title": "Medium Test Guideline"
        },
        "large": {
            "filename": "test_guideline_large.txt",
            "content": "Sample medical guideline for testing. " * 10000,  # ~400KB
            "title": "Large Test Guideline"
        }
    }

    # WebSocket Message Types
    WS_MESSAGE_TYPES = {
        "message": "message",
        "ping": "ping",
    }

    # Performance Thresholds (milliseconds)
    PERFORMANCE_THRESHOLDS = {
        "auth_login": 1000,           # Login should be under 1s
        "chat_query": 3000,           # Chat query under 3s
        "document_upload": 10000,     # Document upload under 10s
        "admin_dashboard": 2000,      # Dashboard load under 2s
        "health_check": 500,          # Health check under 500ms
        "websocket_message": 5000,    # WebSocket response under 5s
    }

    # Rate Limiting - Expected rate limits from API
    RATE_LIMITS = {
        "register": {"requests": 5, "period": 3600},      # 5/hour
        "login": {"requests": 10, "period": 60},          # 10/minute
        "refresh": {"requests": 20, "period": 60},        # 20/minute
    }

    # Distributed Testing
    DISTRIBUTED = {
        "master_host": os.getenv("LOCUST_MASTER_HOST", "localhost"),
        "master_port": int(os.getenv("LOCUST_MASTER_PORT", "5557")),
        "worker_count": int(os.getenv("LOCUST_WORKER_COUNT", "4")),
    }

    # Test Duration and User Counts
    TEST_SCENARIOS = {
        "smoke": {
            "users": 10,
            "spawn_rate": 2,
            "duration": "2m",
        },
        "load": {
            "users": 100,
            "spawn_rate": 10,
            "duration": "10m",
        },
        "stress": {
            "users": 500,
            "spawn_rate": 50,
            "duration": "15m",
        },
        "spike": {
            "users": 1000,
            "spawn_rate": 200,
            "duration": "5m",
        },
        "soak": {
            "users": 100,
            "spawn_rate": 10,
            "duration": "60m",
        },
    }


# Global config instance
config = LoadTestConfig()
