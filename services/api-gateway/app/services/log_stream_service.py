"""In-memory log streaming broker for WebSocket subscribers."""

from __future__ import annotations

import asyncio
import logging
from collections import deque
from datetime import datetime, timezone
from typing import Any, Deque, Dict, Optional, Tuple
from uuid import uuid4


class LogStreamBroker:
    """Publishes log records to registered async queues with filtering."""

    def __init__(self, buffer_size: int = 500, queue_size: int = 100):
        self.buffer: Deque[Dict[str, Any]] = deque(maxlen=buffer_size)
        self.queue_size = queue_size
        self.listeners: Dict[str, Tuple[asyncio.Queue, Dict[str, Any]]] = {}

    @staticmethod
    def _matches_filters(entry: Dict[str, Any], filters: Dict[str, Any]) -> bool:
        service = filters.get("service")
        level = filters.get("level")
        since: Optional[datetime] = filters.get("since")

        if service and entry.get("service") != service:
            return False
        if level and entry.get("level") != level:
            return False
        if since:
            try:
                entry_ts = datetime.fromisoformat(entry.get("timestamp").replace("Z", "+00:00"))
                if entry_ts < since:
                    return False
            except Exception:
                # If timestamp parsing fails, allow the entry through to avoid losing logs
                pass
        return True

    def publish(self, entry: Dict[str, Any]):
        """Add entry to buffer and fan-out to listeners with backpressure handling."""

        self.buffer.append(entry)

        for queue, filters in list(self.listeners.values()):
            if not self._matches_filters(entry, filters):
                continue

            if queue.full():
                try:
                    _ = queue.get_nowait()
                except asyncio.QueueEmpty:
                    pass
            try:
                queue.put_nowait(entry)
            except asyncio.QueueFull:
                # If still full after dropping one, skip to avoid blocking logging path
                continue

    def register_listener(self, filters: Dict[str, Any]) -> Tuple[str, asyncio.Queue]:
        listener_id = str(uuid4())
        queue: asyncio.Queue = asyncio.Queue(maxsize=self.queue_size)
        self.listeners[listener_id] = (queue, filters)
        return listener_id, queue

    def unregister_listener(self, listener_id: str):
        self.listeners.pop(listener_id, None)

    def get_buffered(self, filters: Dict[str, Any]) -> list[Dict[str, Any]]:
        return [entry for entry in list(self.buffer) if self._matches_filters(entry, filters)]


class StreamingLogHandler(logging.Handler):
    """Logging handler that forwards records to the log stream broker."""

    def __init__(self, broker: LogStreamBroker):
        super().__init__()
        self.broker = broker

    def emit(self, record: logging.LogRecord) -> None:
        try:
            timestamp = datetime.fromtimestamp(record.created, timezone.utc).isoformat().replace(
                "+00:00", "Z"
            )
            entry = {
                "timestamp": timestamp,
                "level": record.levelname.lower(),
                "message": record.getMessage(),
                "logger": record.name,
                "service": getattr(record, "service_name", "api-gateway"),
                "request_id": getattr(record, "request_id", None),
                "extra": {
                    key: value
                    for key, value in record.__dict__.items()
                    if key
                    not in {
                        "args",
                        "asctime",
                        "created",
                        "exc_info",
                        "exc_text",
                        "filename",
                        "funcName",
                        "levelname",
                        "levelno",
                        "lineno",
                        "module",
                        "msecs",
                        "message",
                        "msg",
                        "name",
                        "pathname",
                        "process",
                        "processName",
                        "relativeCreated",
                        "stack_info",
                        "thread",
                        "threadName",
                    }
                },
            }
            loop = asyncio.get_event_loop()
            loop.call_soon_threadsafe(self.broker.publish, entry)
        except Exception:
            # Avoid raising within logging path
            pass


_broker = LogStreamBroker()
_handler = StreamingLogHandler(_broker)


def get_log_stream_handler() -> StreamingLogHandler:
    return _handler


def register_log_listener(filters: Dict[str, Any]) -> Tuple[str, asyncio.Queue]:
    return _broker.register_listener(filters)


def unregister_log_listener(listener_id: str):
    _broker.unregister_listener(listener_id)


def get_buffered_logs(filters: Dict[str, Any]) -> list[Dict[str, Any]]:
    return _broker.get_buffered(filters)
