"""
Unit tests for ToolService

Tests the tool registry, execution, and OpenAI tool definition generation.
"""

import pytest
from app.services.tools.tool_service import ToolCategory, ToolDefinition, ToolResult, ToolService


class TestToolService:
    """Tests for ToolService class."""

    def setup_method(self):
        """Set up test fixtures."""
        self.service = ToolService()

    def test_register_tool(self):
        """Test registering a new tool."""
        definition = ToolDefinition(
            name="test_tool",
            description="A test tool",
            parameters={
                "type": "object",
                "properties": {
                    "arg1": {"type": "string", "description": "First argument"},
                },
                "required": ["arg1"],
            },
            category=ToolCategory.UTILITY,
        )

        self.service.register(definition)

        assert "test_tool" in self.service.list_tools()
        retrieved = self.service.get_tool("test_tool")
        assert retrieved is not None
        assert retrieved.name == "test_tool"

    def test_register_handler(self):
        """Test registering a tool handler."""

        async def test_handler(args: dict, context: dict) -> ToolResult:
            return ToolResult(success=True, data={"result": args.get("input")})

        definition = ToolDefinition(
            name="handler_test",
            description="Test handler registration",
            parameters={"type": "object", "properties": {}},
            category=ToolCategory.UTILITY,
        )

        self.service.register(definition)
        self.service.register_handler("handler_test", test_handler)

        # Handler should be registered
        assert "handler_test" in self.service.list_tools()

    def test_list_tools(self):
        """Test listing all registered tools."""
        # Register multiple tools
        for i in range(3):
            definition = ToolDefinition(
                name=f"list_test_{i}",
                description=f"Test tool {i}",
                parameters={"type": "object", "properties": {}},
                category=ToolCategory.UTILITY,
            )
            self.service.register(definition)

        tools = self.service.list_tools()

        # Should include our test tools plus any default tools
        assert "list_test_0" in [t.name if hasattr(t, "name") else str(t) for t in tools]

    def test_get_tool_not_found(self):
        """Test getting a non-existent tool."""
        result = self.service.get_tool("nonexistent_tool")
        assert result is None

    def test_get_openai_tools(self):
        """Test generating OpenAI tool definitions."""
        definition = ToolDefinition(
            name="openai_test",
            description="Test OpenAI format",
            parameters={
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "Search query"},
                },
                "required": ["query"],
            },
            category=ToolCategory.SEARCH,
        )

        self.service.register(definition)
        openai_tools = self.service.get_openai_tools()

        # Find our tool in the list
        our_tool = None
        for tool in openai_tools:
            if tool["function"]["name"] == "openai_test":
                our_tool = tool
                break

        assert our_tool is not None
        assert our_tool["type"] == "function"
        assert our_tool["function"]["description"] == "Test OpenAI format"
        assert "query" in our_tool["function"]["parameters"]["properties"]

    def test_get_openai_tools_for_realtime(self):
        """Test generating OpenAI Realtime API tool definitions."""
        definition = ToolDefinition(
            name="realtime_test",
            description="Test Realtime format",
            parameters={
                "type": "object",
                "properties": {
                    "input": {"type": "string"},
                },
                "required": ["input"],
            },
            category=ToolCategory.UTILITY,
        )

        self.service.register(definition)
        realtime_tools = self.service.get_openai_tools_for_realtime()

        # Realtime format should be similar but may have slight differences
        assert isinstance(realtime_tools, list)
        assert len(realtime_tools) > 0

    @pytest.mark.asyncio
    async def test_execute_tool_success(self):
        """Test successful tool execution."""

        async def success_handler(args: dict, context: dict) -> ToolResult:
            return ToolResult(
                success=True,
                data={"message": f"Hello, {args.get('name', 'World')}!"},
            )

        definition = ToolDefinition(
            name="exec_test",
            description="Test execution",
            parameters={
                "type": "object",
                "properties": {
                    "name": {"type": "string"},
                },
                "required": [],
            },
            category=ToolCategory.UTILITY,
        )

        self.service.register(definition)
        self.service.register_handler("exec_test", success_handler)

        result = await self.service.execute(
            tool_name="exec_test",
            arguments={"name": "Test"},
            context={"user_id": "123"},
        )

        assert result.success is True
        assert result.data["message"] == "Hello, Test!"

    @pytest.mark.asyncio
    async def test_execute_tool_not_found(self):
        """Test executing a non-existent tool."""
        result = await self.service.execute(
            tool_name="nonexistent",
            arguments={},
            context={},
        )

        assert result.success is False
        assert "not found" in result.error.lower()

    @pytest.mark.asyncio
    async def test_execute_tool_handler_error(self):
        """Test tool execution when handler raises an error."""

        async def error_handler(args: dict, context: dict) -> ToolResult:
            raise ValueError("Something went wrong")

        definition = ToolDefinition(
            name="error_test",
            description="Test error handling",
            parameters={"type": "object", "properties": {}},
            category=ToolCategory.UTILITY,
        )

        self.service.register(definition)
        self.service.register_handler("error_test", error_handler)

        result = await self.service.execute(
            tool_name="error_test",
            arguments={},
            context={},
        )

        assert result.success is False
        assert result.error is not None

    def test_tool_category_enum(self):
        """Test ToolCategory enum values."""
        assert ToolCategory.CALENDAR.value == "calendar"
        assert ToolCategory.SEARCH.value == "search"
        assert ToolCategory.MEDICAL.value == "medical"
        assert ToolCategory.KNOWLEDGE.value == "knowledge"
        assert ToolCategory.UTILITY.value == "utility"

    def test_tool_definition_defaults(self):
        """Test ToolDefinition default values."""
        definition = ToolDefinition(
            name="defaults_test",
            description="Test defaults",
            parameters={"type": "object", "properties": {}},
            category=ToolCategory.UTILITY,
        )

        assert definition.requires_auth is False
        assert definition.requires_confirmation is False
        assert definition.enabled is True

    def test_tool_result_structure(self):
        """Test ToolResult structure."""
        # Success result
        success = ToolResult(success=True, data={"key": "value"})
        assert success.success is True
        assert success.data == {"key": "value"}
        assert success.error is None

        # Error result
        error = ToolResult(success=False, error="Something failed")
        assert error.success is False
        assert error.error == "Something failed"
        assert error.data is None


class TestToolServiceIntegration:
    """Integration tests for ToolService with real tools."""

    def test_default_tools_registered(self):
        """Test that default tools are registered on import."""
        from app.services.tools import tool_service

        tools = tool_service.list_tools()
        [t.name if hasattr(t, "name") else str(t) for t in tools]

        # Check some expected default tools exist
        expected_tools = [
            "calendar_create_event",
            "calendar_list_events",
            "web_search",
            "pubmed_search",
            "medical_calculator",
            "kb_search",
        ]

        for expected in expected_tools:
            assert any(expected in str(t) for t in tools), f"Expected tool {expected} not found"

    def test_openai_tools_format_valid(self):
        """Test that OpenAI tools format is valid."""
        from app.services.tools import tool_service

        openai_tools = tool_service.get_openai_tools()

        for tool in openai_tools:
            # Each tool should have required fields
            assert "type" in tool
            assert tool["type"] == "function"
            assert "function" in tool
            assert "name" in tool["function"]
            assert "description" in tool["function"]
            assert "parameters" in tool["function"]

            # Parameters should be a valid JSON schema
            params = tool["function"]["parameters"]
            assert "type" in params
            assert params["type"] == "object"
            assert "properties" in params
