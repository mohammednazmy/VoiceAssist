"""Prompt Service with Multi-Level Caching and Redis Pub/Sub.

Provides dynamic AI prompt management with:
- L1 Cache: In-memory TTL cache (1-minute TTL) for sub-millisecond access
- L2 Cache: Redis distributed cache (5-minute TTL) for cross-instance consistency
- L3 Persistence: PostgreSQL for durability
- Redis Pub/Sub: Real-time propagation of prompt updates

Usage:
    from app.services.prompt_service import prompt_service

    # Get prompt for intent (with caching)
    prompt_text = await prompt_service.get_system_prompt_for_intent("diagnosis")

    # Get voice instructions
    voice_prompt = await prompt_service.get_voice_instructions()

    # CRUD operations
    prompt = await prompt_service.create_prompt(data, actor, db)
    await prompt_service.publish_prompt(prompt_id, actor, db)
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from uuid import UUID

from app.core.database import SessionLocal, redis_client
from app.core.logging import get_logger
from app.models.prompt import Prompt, PromptStatus, PromptVersion
from app.models.user import User
from cachetools import TTLCache
from sqlalchemy import and_, or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload

logger = get_logger(__name__)

# Cache configuration
PROMPT_CACHE_PREFIX = "prompt:"
PROMPT_NAME_CACHE_PREFIX = "prompt_name:"
PROMPT_INTENT_CACHE_PREFIX = "prompt_intent:"
PROMPT_CACHE_TTL = 300  # 5 minutes (L2 TTL)
LOCAL_CACHE_TTL = 60  # 1 minute (L1 TTL)
LOCAL_CACHE_MAX_SIZE = 500

# Redis Pub/Sub channel
PROMPT_UPDATES_CHANNEL = "prompt:updates"


class PromptService:
    """Service for managing AI prompts with multi-level caching.

    Three-tier caching architecture:
    - L1: In-memory TTL cache (1-minute TTL) - fastest, process-local
    - L2: Redis distributed cache (5-minute TTL) - shared across instances
    - L3: PostgreSQL persistence - source of truth

    Features:
    - Sub-millisecond prompt lookups via L1 cache
    - Cross-instance consistency via L2 (Redis)
    - Real-time propagation via Redis Pub/Sub
    - Version history with rollback capability
    - Draft/Published workflow for sandbox testing
    """

    def __init__(self):
        """Initialize prompt service with caching."""
        self.logger = get_logger(__name__)

        # L1 Cache: Local in-memory cache with TTL
        self._local_cache: TTLCache = TTLCache(maxsize=LOCAL_CACHE_MAX_SIZE, ttl=LOCAL_CACHE_TTL)
        self._cache_stats = {"l1_hits": 0, "l1_misses": 0, "l2_hits": 0, "l2_misses": 0, "l3_hits": 0, "l3_misses": 0}

        # Default prompts for fallback
        self._default_prompts = self._load_default_prompts()

    def _load_default_prompts(self) -> Dict[str, str]:
        """Load default prompts for fallback when dynamic lookup fails."""
        return {
            "intent:diagnosis": (
                "You are a medical AI assistant specializing in clinical diagnosis. "
                "Provide evidence-based diagnostic insights with appropriate citations."
            ),
            "intent:treatment": (
                "You are a medical AI assistant specializing in treatment planning. "
                "Provide evidence-based treatment recommendations with appropriate citations."
            ),
            "intent:drug": (
                "You are a medical AI assistant specializing in pharmacology. "
                "Provide evidence-based drug information with appropriate citations."
            ),
            "intent:guideline": (
                "You are a medical AI assistant specializing in clinical guidelines. "
                "Provide evidence-based guideline information with appropriate citations."
            ),
            "intent:summary": (
                "You are a medical AI assistant specializing in medical summarization. "
                "Provide clear, concise summaries with appropriate citations."
            ),
            "intent:other": (
                "You are a helpful medical AI assistant. "
                "Provide accurate, evidence-based information with appropriate citations."
            ),
            "voice:default": """You are VoiceAssist, a helpful AI assistant in voice conversation mode.

CRITICAL SPEAKING GUIDELINES (Every response will be read aloud):
1. SHORT SENTENCES ONLY - Maximum 15-20 words per sentence
2. NO ABBREVIATIONS - Say "blood pressure" not "BP", "heart rate" not "HR"
3. NO ACRONYMS WITHOUT EXPANSION - Say "electrocardiogram or ECG" first time
4. AVOID LISTS - Convert bullet points to flowing narrative
5. NO SPECIAL CHARACTERS - Don't use asterisks, hyphens, or formatting
6. NATURAL PAUSES - Use commas and periods to create breathing room
7. CONVERSATIONAL CONTRACTIONS - Use "I'm", "you're", "it's" naturally
8. ACKNOWLEDGE FIRST - Start with brief acknowledgment before answering

RESPONSE STRUCTURE:
- Start with a brief acknowledgment (1-2 words: "Sure.", "Got it.", "Okay.")
- Give the core answer in 2-3 short sentences
- Offer to elaborate if complex ("Would you like more details on that?")

EXAMPLE - BAD (written style):
"HTN management includes: 1) lifestyle modifications 2) pharmacotherapy with ACE-I or ARBs 3) regular BP monitoring..."

EXAMPLE - GOOD (spoken style):
"High blood pressure is managed in a few ways. First, lifestyle changes like diet and exercise.
Then medications if needed. Do you want more details?"

Remember: You're SPEAKING, not writing. Keep it brief and natural.""",
        }

    # ==================== Cache Operations ====================

    def _get_cache_key(self, key_type: str, identifier: str) -> str:
        """Generate Redis cache key."""
        prefix_map = {
            "id": PROMPT_CACHE_PREFIX,
            "name": PROMPT_NAME_CACHE_PREFIX,
            "intent": PROMPT_INTENT_CACHE_PREFIX,
        }
        return f"{prefix_map.get(key_type, PROMPT_CACHE_PREFIX)}{identifier}"

    async def _get_from_local_cache(self, cache_key: str) -> Optional[Dict[str, Any]]:
        """Get from L1 (local in-memory) cache."""
        try:
            if cache_key in self._local_cache:
                self._cache_stats["l1_hits"] += 1
                self.logger.debug(f"L1 cache hit: {cache_key}")
                return self._local_cache[cache_key]
            self._cache_stats["l1_misses"] += 1
            return None
        except Exception as e:
            self.logger.warning(f"L1 cache error: {e}")
            return None

    async def _set_local_cache(self, cache_key: str, data: Dict[str, Any]) -> None:
        """Set in L1 (local in-memory) cache."""
        try:
            self._local_cache[cache_key] = data
            self.logger.debug(f"Set L1 cache: {cache_key}")
        except Exception as e:
            self.logger.warning(f"L1 cache set error: {e}")

    async def _invalidate_local_cache(self, cache_key: str) -> None:
        """Invalidate L1 cache entry."""
        try:
            if cache_key in self._local_cache:
                del self._local_cache[cache_key]
                self.logger.debug(f"Invalidated L1 cache: {cache_key}")
        except Exception as e:
            self.logger.warning(f"L1 cache invalidate error: {e}")

    async def _get_from_redis_cache(self, cache_key: str) -> Optional[Dict[str, Any]]:
        """Get from L2 (Redis) cache."""
        try:
            cached_value = redis_client.get(cache_key)
            if cached_value:
                self._cache_stats["l2_hits"] += 1
                self.logger.debug(f"L2 cache hit: {cache_key}")
                return json.loads(cached_value)
            self._cache_stats["l2_misses"] += 1
            return None
        except Exception as e:
            self.logger.warning(f"L2 cache error: {e}")
            return None

    async def _set_cache(self, cache_key: str, data: Dict[str, Any]) -> None:
        """Set in both L1 and L2 caches."""
        # Set in L1
        await self._set_local_cache(cache_key, data)

        # Set in L2 (Redis)
        try:
            redis_client.setex(cache_key, PROMPT_CACHE_TTL, json.dumps(data))
            self.logger.debug(f"Set L2 cache: {cache_key}")
        except Exception as e:
            self.logger.warning(f"L2 cache set error: {e}")

    async def _invalidate_cache(self, prompt_id: UUID, name: str) -> None:
        """Invalidate all cache entries for a prompt."""
        cache_keys = [
            self._get_cache_key("id", str(prompt_id)),
            self._get_cache_key("name", name),
        ]

        # Also invalidate intent cache if applicable
        if name.startswith("intent:"):
            intent = name.split(":", 1)[1] if ":" in name else name
            cache_keys.append(self._get_cache_key("intent", f"chat:{intent}"))
        elif name.startswith("voice:"):
            cache_keys.append(self._get_cache_key("intent", "voice:default"))

        for cache_key in cache_keys:
            await self._invalidate_local_cache(cache_key)
            try:
                redis_client.delete(cache_key)
            except Exception as e:
                self.logger.warning(f"L2 cache invalidate error for {cache_key}: {e}")

    async def _publish_update(self, prompt_id: UUID, name: str, action: str, version: int = None) -> None:
        """Publish prompt update event via Redis Pub/Sub."""
        try:
            message = json.dumps(
                {
                    "event": action,
                    "prompt_id": str(prompt_id),
                    "prompt_name": name,
                    "version": version,
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                }
            )
            redis_client.publish(PROMPT_UPDATES_CHANNEL, message)
            self.logger.info(f"Published prompt update: {action} for {name}")
        except Exception as e:
            self.logger.warning(f"Failed to publish update: {e}")

    # ==================== Runtime Lookups ====================

    async def get_system_prompt_for_intent(
        self, intent: str, prompt_type: str = "chat", db: Optional[Session] = None
    ) -> str:
        """Get the active system prompt for a given intent.

        This is the primary method used by llm_client.py for chat prompts.

        Args:
            intent: The intent category (diagnosis, treatment, etc.)
            prompt_type: The prompt type (chat, voice)
            db: Optional database session

        Returns:
            The active system prompt text, or fallback default
        """
        prompt_name = f"intent:{intent}"
        cache_key = self._get_cache_key("intent", f"{prompt_type}:{intent}")

        # L1 Cache lookup
        cached = await self._get_from_local_cache(cache_key)
        if cached:
            return cached.get("published_content") or cached.get("system_prompt", "")

        # L2 Cache lookup
        cached = await self._get_from_redis_cache(cache_key)
        if cached:
            await self._set_local_cache(cache_key, cached)
            return cached.get("published_content") or cached.get("system_prompt", "")

        # L3 Database lookup
        should_close_db = False
        if db is None:
            db = SessionLocal()
            should_close_db = True

        try:
            prompt = (
                db.query(Prompt)
                .filter(
                    and_(
                        Prompt.name == prompt_name,
                        Prompt.status == PromptStatus.PUBLISHED.value,
                        Prompt.is_active is True,
                    )
                )
                .first()
            )

            if prompt:
                self._cache_stats["l3_hits"] += 1
                prompt_data = prompt.to_dict()
                await self._set_cache(cache_key, prompt_data)
                return prompt.get_active_content()
            else:
                self._cache_stats["l3_misses"] += 1
                # Return fallback default
                return self._default_prompts.get(prompt_name, self._default_prompts.get("intent:other", ""))

        except Exception as e:
            self.logger.error(f"Failed to get prompt for intent '{intent}': {e}")
            return self._default_prompts.get(prompt_name, self._default_prompts.get("intent:other", ""))
        finally:
            if should_close_db:
                db.close()

    async def get_voice_instructions(
        self, persona: Optional[str] = None, conversation_id: Optional[str] = None, db: Optional[Session] = None
    ) -> str:
        """Get voice mode system instructions.

        This is the primary method used by realtime_voice_service.py.

        Args:
            persona: Optional persona name to use
            conversation_id: Optional conversation ID for context
            db: Optional database session

        Returns:
            The voice instructions text
        """
        prompt_name = f"persona:{persona}" if persona else "voice:default"
        cache_key = self._get_cache_key("name", prompt_name)

        # L1 Cache lookup
        cached = await self._get_from_local_cache(cache_key)
        if cached:
            instructions = cached.get("published_content") or cached.get("system_prompt", "")
            if conversation_id:
                instructions += f"\nResuming conversation: {conversation_id}"
            return instructions

        # L2 Cache lookup
        cached = await self._get_from_redis_cache(cache_key)
        if cached:
            await self._set_local_cache(cache_key, cached)
            instructions = cached.get("published_content") or cached.get("system_prompt", "")
            if conversation_id:
                instructions += f"\nResuming conversation: {conversation_id}"
            return instructions

        # L3 Database lookup
        should_close_db = False
        if db is None:
            db = SessionLocal()
            should_close_db = True

        try:
            prompt = (
                db.query(Prompt)
                .filter(
                    and_(
                        Prompt.name == prompt_name,
                        Prompt.status == PromptStatus.PUBLISHED.value,
                        Prompt.is_active is True,
                    )
                )
                .first()
            )

            if prompt:
                self._cache_stats["l3_hits"] += 1
                prompt_data = prompt.to_dict()
                await self._set_cache(cache_key, prompt_data)
                instructions = prompt.get_active_content()
            else:
                self._cache_stats["l3_misses"] += 1
                # Try voice:default fallback
                if persona:
                    return await self.get_voice_instructions(persona=None, conversation_id=conversation_id, db=db)
                instructions = self._default_prompts.get("voice:default", "")

            if conversation_id:
                instructions += f"\nResuming conversation: {conversation_id}"
            return instructions

        except Exception as e:
            self.logger.error(f"Failed to get voice instructions: {e}")
            return self._default_prompts.get("voice:default", "")
        finally:
            if should_close_db:
                db.close()

    async def get_rag_instructions(self, db: Optional[Session] = None) -> str:
        """Get the RAG orchestrator instructions.

        This is used by rag_service.py to get the dynamic instructions
        for the query orchestrator.

        Returns:
            The RAG instructions text, or fallback default
        """
        prompt_name = "system:rag_instructions"
        cache_key = self._get_cache_key("name", prompt_name)

        # L1 Cache lookup
        cached = await self._get_from_local_cache(cache_key)
        if cached:
            return cached.get("published_content") or cached.get("system_prompt", "")

        # L2 Cache lookup
        cached = await self._get_from_redis_cache(cache_key)
        if cached:
            await self._set_local_cache(cache_key, cached)
            return cached.get("published_content") or cached.get("system_prompt", "")

        # L3 Database lookup
        should_close_db = False
        if db is None:
            db = SessionLocal()
            should_close_db = True

        try:
            prompt = (
                db.query(Prompt)
                .filter(
                    and_(
                        Prompt.name == prompt_name,
                        Prompt.status == PromptStatus.PUBLISHED.value,
                        Prompt.is_active is True,
                    )
                )
                .first()
            )

            if prompt:
                self._cache_stats["l3_hits"] += 1
                prompt_data = prompt.to_dict()
                await self._set_cache(cache_key, prompt_data)
                return prompt.get_active_content()
            else:
                self._cache_stats["l3_misses"] += 1
                # Return fallback default
                return self._get_default_rag_instructions()

        except Exception as e:
            self.logger.error(f"Failed to get RAG instructions: {e}")
            return self._get_default_rag_instructions()
        finally:
            if should_close_db:
                db.close()

    def _get_default_rag_instructions(self) -> str:
        """Get default RAG instructions for fallback."""
        return """You are a knowledgeable and friendly medical assistant helping users understand health information.

Guidelines:
- Answer questions directly, then offer to explore further
- Explain medical concepts in plain language
- Use natural language - contractions are fine
- Acknowledge when a topic is complex or when concerns are valid
- If you don't know something, say so warmly

Important: Always recommend consulting a healthcare provider for specific medical advice."""

    async def get_prompt_with_settings(self, name: str, db: Optional[Session] = None) -> Optional[Dict[str, Any]]:
        """Get a prompt with its model settings (temperature, max_tokens).

        Returns the full prompt data including temperature and max_tokens
        for use by rag_service.py and llm_client.py.

        Args:
            name: The prompt name (e.g., "intent:diagnosis")
            db: Optional database session

        Returns:
            Dict with prompt data including temperature, max_tokens, model_name
        """
        cache_key = self._get_cache_key("name", name)

        # L1 Cache lookup
        cached = await self._get_from_local_cache(cache_key)
        if cached:
            return cached

        # L2 Cache lookup
        cached = await self._get_from_redis_cache(cache_key)
        if cached:
            await self._set_local_cache(cache_key, cached)
            return cached

        # L3 Database lookup
        should_close_db = False
        if db is None:
            db = SessionLocal()
            should_close_db = True

        try:
            prompt = db.query(Prompt).filter(and_(Prompt.name == name, Prompt.is_active is True)).first()

            if prompt:
                self._cache_stats["l3_hits"] += 1
                prompt_data = prompt.to_dict()
                await self._set_cache(cache_key, prompt_data)
                return prompt_data
            else:
                self._cache_stats["l3_misses"] += 1
                return None

        except Exception as e:
            self.logger.error(f"Failed to get prompt with settings '{name}': {e}")
            return None
        finally:
            if should_close_db:
                db.close()

    # ==================== CRUD Operations ====================

    async def get_prompt(self, prompt_id: UUID, db: Session) -> Optional[Prompt]:
        """Get a prompt by ID."""
        try:
            return (
                db.query(Prompt)
                .options(joinedload(Prompt.created_by), joinedload(Prompt.updated_by))
                .filter(Prompt.id == prompt_id)
                .first()
            )
        except Exception as e:
            self.logger.error(f"Failed to get prompt {prompt_id}: {e}")
            return None

    async def get_prompt_by_name(self, name: str, db: Session) -> Optional[Prompt]:
        """Get a prompt by name."""
        try:
            return (
                db.query(Prompt)
                .options(joinedload(Prompt.created_by), joinedload(Prompt.updated_by))
                .filter(Prompt.name == name)
                .first()
            )
        except Exception as e:
            self.logger.error(f"Failed to get prompt by name '{name}': {e}")
            return None

    async def list_prompts(
        self,
        db: Session,
        prompt_type: Optional[str] = None,
        status: Optional[str] = None,
        intent_category: Optional[str] = None,
        is_active: Optional[bool] = None,
        search: Optional[str] = None,
        page: int = 1,
        page_size: int = 20,
        sort_by: str = "updated_at",
        sort_order: str = "desc",
    ) -> tuple[List[Prompt], int]:
        """List prompts with filtering and pagination."""
        try:
            query = db.query(Prompt).options(joinedload(Prompt.created_by), joinedload(Prompt.updated_by))

            # Apply filters
            if prompt_type:
                query = query.filter(Prompt.prompt_type == prompt_type)
            if status:
                query = query.filter(Prompt.status == status)
            if intent_category:
                query = query.filter(Prompt.intent_category == intent_category)
            if is_active is not None:
                query = query.filter(Prompt.is_active == is_active)
            if search:
                search_term = f"%{search}%"
                query = query.filter(
                    or_(
                        Prompt.name.ilike(search_term),
                        Prompt.display_name.ilike(search_term),
                        Prompt.description.ilike(search_term),
                    )
                )

            # Get total count
            total = query.count()

            # Apply sorting
            sort_column = getattr(Prompt, sort_by, Prompt.updated_at)
            if sort_order == "desc":
                query = query.order_by(sort_column.desc())
            else:
                query = query.order_by(sort_column.asc())

            # Apply pagination
            offset = (page - 1) * page_size
            prompts = query.offset(offset).limit(page_size).all()

            return prompts, total

        except Exception as e:
            self.logger.error(f"Failed to list prompts: {e}")
            return [], 0

    async def create_prompt(
        self,
        name: str,
        display_name: str,
        system_prompt: str,
        prompt_type: str = "chat",
        description: Optional[str] = None,
        intent_category: Optional[str] = None,
        temperature: Optional[float] = None,
        max_tokens: Optional[int] = None,
        model_name: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
        actor: Optional[User] = None,
        db: Session = None,
    ) -> Optional[Prompt]:
        """Create a new prompt."""
        should_close_db = False
        if db is None:
            db = SessionLocal()
            should_close_db = True

        try:
            prompt = Prompt(
                name=name,
                display_name=display_name,
                description=description,
                prompt_type=prompt_type,
                intent_category=intent_category,
                system_prompt=system_prompt,
                temperature=temperature,
                max_tokens=max_tokens,
                model_name=model_name,
                status=PromptStatus.DRAFT.value,
                is_active=True,
                current_version=1,
                prompt_metadata=metadata,
                created_by_id=actor.id if actor else None,
                updated_by_id=actor.id if actor else None,
            )

            db.add(prompt)
            db.commit()
            db.refresh(prompt)

            # Create initial version
            version = PromptVersion(
                prompt_id=prompt.id,
                version_number=1,
                system_prompt=system_prompt,
                prompt_type=prompt_type,
                intent_category=intent_category,
                version_metadata=metadata,
                change_summary="Initial version",
                changed_by_id=actor.id if actor else None,
                changed_by_email=actor.email if actor else None,
                status=PromptStatus.DRAFT.value,
            )
            db.add(version)
            db.commit()

            self.logger.info(f"Created prompt: {name}")
            return prompt

        except IntegrityError:
            db.rollback()
            self.logger.warning(f"Prompt already exists: {name}")
            return None
        except Exception as e:
            db.rollback()
            self.logger.error(f"Failed to create prompt: {e}")
            return None
        finally:
            if should_close_db:
                db.close()

    async def update_prompt(
        self,
        prompt_id: UUID,
        display_name: Optional[str] = None,
        description: Optional[str] = None,
        system_prompt: Optional[str] = None,
        intent_category: Optional[str] = None,
        temperature: Optional[float] = None,
        max_tokens: Optional[int] = None,
        model_name: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
        is_active: Optional[bool] = None,
        change_summary: Optional[str] = None,
        actor: Optional[User] = None,
        db: Session = None,
    ) -> Optional[Prompt]:
        """Update a prompt (creates new version if content changes)."""
        should_close_db = False
        if db is None:
            db = SessionLocal()
            should_close_db = True

        try:
            prompt = await self.get_prompt(prompt_id, db)
            if not prompt:
                self.logger.warning(f"Prompt not found: {prompt_id}")
                return None

            content_changed = False

            # Update fields
            if display_name is not None:
                prompt.display_name = display_name
            if description is not None:
                prompt.description = description
            if system_prompt is not None and system_prompt != prompt.system_prompt:
                prompt.system_prompt = system_prompt
                content_changed = True
            if intent_category is not None:
                prompt.intent_category = intent_category
            if temperature is not None:
                prompt.temperature = temperature
            if max_tokens is not None:
                prompt.max_tokens = max_tokens
            if model_name is not None:
                prompt.model_name = model_name
            if metadata is not None:
                prompt.prompt_metadata = metadata
            if is_active is not None:
                prompt.is_active = is_active

            prompt.updated_at = datetime.now(timezone.utc)
            prompt.updated_by_id = actor.id if actor else None

            # Create new version if content changed
            if content_changed:
                prompt.current_version += 1
                version = PromptVersion(
                    prompt_id=prompt.id,
                    version_number=prompt.current_version,
                    system_prompt=system_prompt,
                    prompt_type=prompt.prompt_type,
                    intent_category=prompt.intent_category,
                    version_metadata=prompt.prompt_metadata,
                    change_summary=change_summary or "Content updated",
                    changed_by_id=actor.id if actor else None,
                    changed_by_email=actor.email if actor else None,
                    status=prompt.status,
                )
                db.add(version)

            db.commit()
            db.refresh(prompt)

            # Invalidate cache
            await self._invalidate_cache(prompt.id, prompt.name)

            # Publish update event
            await self._publish_update(prompt.id, prompt.name, "prompt_updated", prompt.current_version)

            self.logger.info(f"Updated prompt: {prompt.name}")
            return prompt

        except Exception as e:
            db.rollback()
            self.logger.error(f"Failed to update prompt: {e}")
            return None
        finally:
            if should_close_db:
                db.close()

    async def publish_prompt(
        self, prompt_id: UUID, change_summary: Optional[str] = None, actor: Optional[User] = None, db: Session = None
    ) -> Optional[Prompt]:
        """Publish a prompt (make draft content live)."""
        should_close_db = False
        if db is None:
            db = SessionLocal()
            should_close_db = True

        try:
            prompt = await self.get_prompt(prompt_id, db)
            if not prompt:
                self.logger.warning(f"Prompt not found: {prompt_id}")
                return None

            # Copy draft to published
            prompt.published_content = prompt.system_prompt
            prompt.status = PromptStatus.PUBLISHED.value
            prompt.published_at = datetime.now(timezone.utc)
            prompt.updated_at = datetime.now(timezone.utc)
            prompt.updated_by_id = actor.id if actor else None

            # Update or create version with published status
            latest_version = (
                db.query(PromptVersion)
                .filter(
                    and_(PromptVersion.prompt_id == prompt.id, PromptVersion.version_number == prompt.current_version)
                )
                .first()
            )

            if latest_version:
                latest_version.status = PromptStatus.PUBLISHED.value
                if change_summary:
                    latest_version.change_summary = change_summary
            else:
                # Create new published version
                prompt.current_version += 1
                version = PromptVersion(
                    prompt_id=prompt.id,
                    version_number=prompt.current_version,
                    system_prompt=prompt.system_prompt,
                    prompt_type=prompt.prompt_type,
                    intent_category=prompt.intent_category,
                    version_metadata=prompt.prompt_metadata,
                    change_summary=change_summary or "Published",
                    changed_by_id=actor.id if actor else None,
                    changed_by_email=actor.email if actor else None,
                    status=PromptStatus.PUBLISHED.value,
                )
                db.add(version)

            db.commit()
            db.refresh(prompt)

            # Invalidate and update cache
            await self._invalidate_cache(prompt.id, prompt.name)
            await self._set_cache(self._get_cache_key("name", prompt.name), prompt.to_dict())

            # Publish update event
            await self._publish_update(prompt.id, prompt.name, "prompt_published", prompt.current_version)

            self.logger.info(f"Published prompt: {prompt.name}")
            return prompt

        except Exception as e:
            db.rollback()
            self.logger.error(f"Failed to publish prompt: {e}")
            return None
        finally:
            if should_close_db:
                db.close()

    async def rollback_to_version(
        self,
        prompt_id: UUID,
        version_number: int,
        reason: Optional[str] = None,
        actor: Optional[User] = None,
        db: Session = None,
    ) -> Optional[Prompt]:
        """Rollback prompt to a previous version."""
        should_close_db = False
        if db is None:
            db = SessionLocal()
            should_close_db = True

        try:
            prompt = await self.get_prompt(prompt_id, db)
            if not prompt:
                self.logger.warning(f"Prompt not found: {prompt_id}")
                return None

            # Get the target version
            target_version = (
                db.query(PromptVersion)
                .filter(and_(PromptVersion.prompt_id == prompt_id, PromptVersion.version_number == version_number))
                .first()
            )

            if not target_version:
                self.logger.warning(f"Version {version_number} not found for prompt {prompt_id}")
                return None

            # Create new version with rollback content
            prompt.current_version += 1
            prompt.system_prompt = target_version.system_prompt
            prompt.published_content = target_version.system_prompt
            prompt.prompt_metadata = target_version.version_metadata
            prompt.updated_at = datetime.now(timezone.utc)
            prompt.updated_by_id = actor.id if actor else None

            rollback_version = PromptVersion(
                prompt_id=prompt.id,
                version_number=prompt.current_version,
                system_prompt=target_version.system_prompt,
                prompt_type=prompt.prompt_type,
                intent_category=prompt.intent_category,
                version_metadata=target_version.version_metadata,
                change_summary=reason or f"Rolled back to version {version_number}",
                changed_by_id=actor.id if actor else None,
                changed_by_email=actor.email if actor else None,
                status=prompt.status,
            )
            db.add(rollback_version)

            db.commit()
            db.refresh(prompt)

            # Invalidate cache
            await self._invalidate_cache(prompt.id, prompt.name)

            # Publish update event
            await self._publish_update(prompt.id, prompt.name, "prompt_rolled_back", prompt.current_version)

            self.logger.info(f"Rolled back prompt {prompt.name} to version {version_number}")
            return prompt

        except Exception as e:
            db.rollback()
            self.logger.error(f"Failed to rollback prompt: {e}")
            return None
        finally:
            if should_close_db:
                db.close()

    async def delete_prompt(self, prompt_id: UUID, actor: Optional[User] = None, db: Session = None) -> bool:
        """Archive (soft delete) a prompt."""
        should_close_db = False
        if db is None:
            db = SessionLocal()
            should_close_db = True

        try:
            prompt = await self.get_prompt(prompt_id, db)
            if not prompt:
                self.logger.warning(f"Prompt not found: {prompt_id}")
                return False

            prompt.status = PromptStatus.ARCHIVED.value
            prompt.is_active = False
            prompt.updated_at = datetime.now(timezone.utc)
            prompt.updated_by_id = actor.id if actor else None

            db.commit()

            # Invalidate cache
            await self._invalidate_cache(prompt.id, prompt.name)

            # Publish update event
            await self._publish_update(prompt.id, prompt.name, "prompt_deleted")

            self.logger.info(f"Archived prompt: {prompt.name}")
            return True

        except Exception as e:
            db.rollback()
            self.logger.error(f"Failed to delete prompt: {e}")
            return False
        finally:
            if should_close_db:
                db.close()

    async def archive_prompt(self, prompt_id: UUID, actor: Optional[User] = None, db: Session = None) -> bool:
        """Archive a prompt (sets status to archived).

        This is an explicit archive operation that preserves the prompt
        for reference but removes it from active use.
        """
        should_close_db = False
        if db is None:
            db = SessionLocal()
            should_close_db = True

        try:
            prompt = await self.get_prompt(prompt_id, db)
            if not prompt:
                self.logger.warning(f"Prompt not found: {prompt_id}")
                return False

            prompt.status = PromptStatus.ARCHIVED.value
            prompt.is_active = False
            prompt.updated_at = datetime.now(timezone.utc)
            prompt.updated_by_id = actor.id if actor else None

            db.commit()

            # Invalidate cache
            await self._invalidate_cache(prompt.id, prompt.name)

            # Publish update event
            await self._publish_update(prompt.id, prompt.name, "prompt_archived")

            self.logger.info(f"Archived prompt: {prompt.name}")
            return True

        except Exception as e:
            db.rollback()
            self.logger.error(f"Failed to archive prompt: {e}")
            return False
        finally:
            if should_close_db:
                db.close()

    async def get_versions(self, prompt_id: UUID, db: Session) -> List[PromptVersion]:
        """Get all versions for a prompt."""
        try:
            return (
                db.query(PromptVersion)
                .filter(PromptVersion.prompt_id == prompt_id)
                .order_by(PromptVersion.version_number.desc())
                .all()
            )
        except Exception as e:
            self.logger.error(f"Failed to get versions for prompt {prompt_id}: {e}")
            return []

    async def get_version(self, prompt_id: UUID, version_number: int, db: Session) -> Optional[PromptVersion]:
        """Get a specific version."""
        try:
            return (
                db.query(PromptVersion)
                .filter(and_(PromptVersion.prompt_id == prompt_id, PromptVersion.version_number == version_number))
                .first()
            )
        except Exception as e:
            self.logger.error(f"Failed to get version {version_number}: {e}")
            return None

    async def duplicate_prompt(
        self,
        prompt_id: UUID,
        new_name: str,
        new_display_name: Optional[str] = None,
        actor: Optional[User] = None,
        db: Session = None,
    ) -> Optional[Prompt]:
        """Duplicate a prompt with a new name."""
        should_close_db = False
        if db is None:
            db = SessionLocal()
            should_close_db = True

        try:
            original = await self.get_prompt(prompt_id, db)
            if not original:
                self.logger.warning(f"Original prompt not found: {prompt_id}")
                return None

            return await self.create_prompt(
                name=new_name,
                display_name=new_display_name or f"{original.display_name} (Copy)",
                description=original.description,
                prompt_type=original.prompt_type,
                intent_category=original.intent_category,
                system_prompt=original.system_prompt,
                temperature=original.temperature,
                max_tokens=original.max_tokens,
                model_name=original.model_name,
                metadata=original.prompt_metadata,
                actor=actor,
                db=db,
            )

        except Exception as e:
            self.logger.error(f"Failed to duplicate prompt: {e}")
            return None
        finally:
            if should_close_db:
                db.close()

    # ==================== Cache Management ====================

    async def warm_cache(self, db: Optional[Session] = None) -> int:
        """Warm cache with all published prompts on startup."""
        should_close_db = False
        if db is None:
            db = SessionLocal()
            should_close_db = True

        try:
            prompts = (
                db.query(Prompt)
                .filter(and_(Prompt.status == PromptStatus.PUBLISHED.value, Prompt.is_active is True))
                .all()
            )

            for prompt in prompts:
                prompt_data = prompt.to_dict()
                await self._set_cache(self._get_cache_key("name", prompt.name), prompt_data)
                await self._set_cache(self._get_cache_key("id", str(prompt.id)), prompt_data)

                # Also cache by intent for quick lookup
                if prompt.intent_category:
                    await self._set_cache(
                        self._get_cache_key("intent", f"{prompt.prompt_type}:{prompt.intent_category}"), prompt_data
                    )

            self.logger.info(f"Prompt cache warmed: {len(prompts)} prompts cached")
            return len(prompts)

        except Exception as e:
            self.logger.error(f"Failed to warm prompt cache: {e}")
            return 0
        finally:
            if should_close_db:
                db.close()

    def get_cache_stats(self) -> Dict[str, Any]:
        """Get cache statistics for monitoring."""
        total_l1 = self._cache_stats["l1_hits"] + self._cache_stats["l1_misses"]
        total_l2 = self._cache_stats["l2_hits"] + self._cache_stats["l2_misses"]

        return {
            "l1_cache": {
                "hits": self._cache_stats["l1_hits"],
                "misses": self._cache_stats["l1_misses"],
                "hit_rate": (self._cache_stats["l1_hits"] / total_l1 * 100) if total_l1 > 0 else 0,
                "size": len(self._local_cache),
                "max_size": LOCAL_CACHE_MAX_SIZE,
                "ttl_seconds": LOCAL_CACHE_TTL,
            },
            "l2_cache": {
                "hits": self._cache_stats["l2_hits"],
                "misses": self._cache_stats["l2_misses"],
                "hit_rate": (self._cache_stats["l2_hits"] / total_l2 * 100) if total_l2 > 0 else 0,
                "ttl_seconds": PROMPT_CACHE_TTL,
            },
            "l3_database": {
                "hits": self._cache_stats["l3_hits"],
                "misses": self._cache_stats["l3_misses"],
            },
        }


# Global singleton instance
prompt_service = PromptService()
