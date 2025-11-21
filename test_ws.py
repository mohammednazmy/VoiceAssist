#!/usr/bin/env python3
"""
Quick WebSocket client test for Phase 4 realtime endpoint.
"""
import asyncio
import websockets
import json

async def test_websocket():
    uri = "ws://localhost:8000/api/realtime/ws"

    try:
        async with websockets.connect(uri) as websocket:
            print(f"✓ Connected to {uri}")

            # Receive welcome message
            welcome = await websocket.recv()
            welcome_data = json.loads(welcome)
            print(f"✓ Received welcome: {json.dumps(welcome_data, indent=2)}")

            # Send a test message
            test_message = {
                "type": "message",
                "content": "Hello from test client!"
            }
            await websocket.send(json.dumps(test_message))
            print(f"✓ Sent test message")

            # Receive responses
            print("\n--- Receiving responses ---")
            for i in range(10):  # Receive up to 10 messages
                try:
                    response = await asyncio.wait_for(websocket.recv(), timeout=2.0)
                    response_data = json.loads(response)
                    print(f"✓ Received: type={response_data.get('type')}, message_id={response_data.get('message_id', 'N/A')}")

                    if response_data.get('type') == 'message_complete':
                        print(f"  Complete response: {response_data.get('content')}")
                        break
                except asyncio.TimeoutError:
                    print("  (timeout waiting for response)")
                    break

            print("\n✓ WebSocket test completed successfully!")

    except Exception as e:
        print(f"✗ Error: {e}")
        raise

if __name__ == "__main__":
    asyncio.run(test_websocket())
