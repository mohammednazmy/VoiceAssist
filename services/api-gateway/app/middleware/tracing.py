"""OpenTelemetry tracing configuration for distributed tracing.

Sets up tracing with Jaeger and OTLP exporters for comprehensive
distributed tracing across all services and external calls.
"""
import logging
from typing import Optional
from opentelemetry import trace
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from opentelemetry.sdk.resources import Resource, SERVICE_NAME, SERVICE_VERSION
from opentelemetry.exporter.jaeger.thrift import JaegerExporter
from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
from opentelemetry.instrumentation.sqlalchemy import SQLAlchemyInstrumentor
from opentelemetry.instrumentation.redis import RedisInstrumentor
from opentelemetry.instrumentation.httpx import HTTPXClientInstrumentor
from fastapi import FastAPI

logger = logging.getLogger(__name__)


def setup_tracing(
    app: FastAPI,
    service_name: str = "voiceassist-api-gateway",
    service_version: str = "2.0.0",
    jaeger_host: Optional[str] = None,
    jaeger_port: int = 6831,
    otlp_endpoint: Optional[str] = None,
    enable_tracing: bool = True
) -> Optional[TracerProvider]:
    """Set up OpenTelemetry tracing with Jaeger and OTLP exporters.

    Args:
        app: FastAPI application instance
        service_name: Name of the service for tracing
        service_version: Version of the service
        jaeger_host: Jaeger agent hostname (optional)
        jaeger_port: Jaeger agent port (default 6831)
        otlp_endpoint: OTLP collector endpoint (optional)
        enable_tracing: Enable/disable tracing (default True)

    Returns:
        TracerProvider instance if tracing is enabled, None otherwise
    """
    if not enable_tracing:
        logger.info("Tracing is disabled")
        return None

    try:
        # Create resource with service information
        resource = Resource.create({
            SERVICE_NAME: service_name,
            SERVICE_VERSION: service_version,
            "deployment.environment": "production",  # TODO: Get from config
            "service.namespace": "voiceassist",
        })

        # Create tracer provider
        provider = TracerProvider(resource=resource)

        # Add Jaeger exporter if configured
        if jaeger_host:
            try:
                jaeger_exporter = JaegerExporter(
                    agent_host_name=jaeger_host,
                    agent_port=jaeger_port,
                )
                provider.add_span_processor(BatchSpanProcessor(jaeger_exporter))
                logger.info(f"Jaeger exporter configured: {jaeger_host}:{jaeger_port}")
            except Exception as e:
                logger.warning(f"Failed to configure Jaeger exporter: {e}")

        # Add OTLP exporter if configured
        if otlp_endpoint:
            try:
                otlp_exporter = OTLPSpanExporter(
                    endpoint=otlp_endpoint,
                    insecure=True  # TODO: Use TLS in production
                )
                provider.add_span_processor(BatchSpanProcessor(otlp_exporter))
                logger.info(f"OTLP exporter configured: {otlp_endpoint}")
            except Exception as e:
                logger.warning(f"Failed to configure OTLP exporter: {e}")

        # Set as global tracer provider
        trace.set_tracer_provider(provider)

        # Instrument FastAPI
        FastAPIInstrumentor.instrument_app(app)
        logger.info("FastAPI instrumented for tracing")

        # Instrument SQLAlchemy
        try:
            SQLAlchemyInstrumentor().instrument()
            logger.info("SQLAlchemy instrumented for tracing")
        except Exception as e:
            logger.warning(f"Failed to instrument SQLAlchemy: {e}")

        # Instrument Redis
        try:
            RedisInstrumentor().instrument()
            logger.info("Redis instrumented for tracing")
        except Exception as e:
            logger.warning(f"Failed to instrument Redis: {e}")

        # Instrument HTTPX (for external API calls)
        try:
            HTTPXClientInstrumentor().instrument()
            logger.info("HTTPX instrumented for tracing")
        except Exception as e:
            logger.warning(f"Failed to instrument HTTPX: {e}")

        logger.info(f"Tracing initialized for service: {service_name}")
        return provider

    except Exception as e:
        logger.error(f"Failed to initialize tracing: {e}", exc_info=True)
        return None


def get_tracer(name: str = "voiceassist") -> trace.Tracer:
    """Get a tracer for creating custom spans.

    Args:
        name: Name of the tracer

    Returns:
        Tracer instance
    """
    return trace.get_tracer(name)


def create_span(name: str, attributes: Optional[dict] = None):
    """Context manager to create a custom span.

    Usage:
        with create_span("my_operation", {"user_id": user_id}):
            # Do work
            pass

    Args:
        name: Name of the span
        attributes: Optional attributes to add to the span
    """
    tracer = get_tracer()
    span = tracer.start_span(name)

    if attributes:
        for key, value in attributes.items():
            span.set_attribute(key, value)

    return span


class TracingHelper:
    """Helper class for adding custom tracing to services."""

    @staticmethod
    def trace_rag_query(query: str, user_id: Optional[str] = None):
        """Create a span for RAG query processing.

        Args:
            query: The query text
            user_id: Optional user ID

        Returns:
            Span context manager
        """
        attributes = {
            "query.length": len(query),
            "query.type": "rag",
        }
        if user_id:
            attributes["user.id"] = user_id

        return create_span("rag.query", attributes)

    @staticmethod
    def trace_vector_search(query: str, top_k: int = 5):
        """Create a span for vector search.

        Args:
            query: Search query
            top_k: Number of results

        Returns:
            Span context manager
        """
        return create_span("vector.search", {
            "query.length": len(query),
            "search.top_k": top_k,
        })

    @staticmethod
    def trace_document_indexing(document_id: str, file_type: str):
        """Create a span for document indexing.

        Args:
            document_id: Document identifier
            file_type: File extension

        Returns:
            Span context manager
        """
        return create_span("document.index", {
            "document.id": document_id,
            "document.type": file_type,
        })

    @staticmethod
    def trace_external_api(service: str, operation: str):
        """Create a span for external API call.

        Args:
            service: Service name (openai, nextcloud, etc.)
            operation: Operation name

        Returns:
            Span context manager
        """
        return create_span(f"{service}.{operation}", {
            "service.name": service,
            "operation": operation,
        })

    @staticmethod
    def trace_database_operation(operation: str, table: Optional[str] = None):
        """Create a span for database operation.

        Args:
            operation: Operation type (select, insert, update, delete)
            table: Optional table name

        Returns:
            Span context manager
        """
        attributes = {"db.operation": operation}
        if table:
            attributes["db.table"] = table

        return create_span(f"db.{operation}", attributes)

    @staticmethod
    def add_span_event(name: str, attributes: Optional[dict] = None):
        """Add an event to the current span.

        Args:
            name: Event name
            attributes: Optional event attributes
        """
        span = trace.get_current_span()
        if span:
            span.add_event(name, attributes or {})

    @staticmethod
    def add_span_error(exception: Exception):
        """Record an exception in the current span.

        Args:
            exception: The exception to record
        """
        span = trace.get_current_span()
        if span:
            span.record_exception(exception)
            span.set_status(trace.Status(trace.StatusCode.ERROR, str(exception)))

    @staticmethod
    def add_span_attributes(**kwargs):
        """Add attributes to the current span.

        Args:
            **kwargs: Key-value pairs to add as attributes
        """
        span = trace.get_current_span()
        if span:
            for key, value in kwargs.items():
                span.set_attribute(key, value)
