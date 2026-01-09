#!/usr/bin/env python3
"""
WebSocket Proxy Server for Gemini Live API
Handles authentication and proxies WebSocket connections.

This server acts as a bridge between the browser client and Gemini API,
handling Google Cloud authentication automatically using default credentials.
"""

import asyncio
import websockets
import json
import ssl
import certifi
import os
from websockets.legacy.server import WebSocketServerProtocol
from websockets.legacy.protocol import WebSocketCommonProtocol
from websockets.exceptions import ConnectionClosed

# Google auth imports
import google.auth
from google.auth.transport.requests import Request

DEBUG = False  # Set to True for verbose logging
WS_PORT = 8080    # Port for WebSocket server


def generate_access_token():
    """Retrieves an access token using Google Cloud default credentials."""
    try:
        creds, _ = google.auth.default()
        if not creds.valid:
            creds.refresh(Request())
        return creds.token
    except Exception as e:
        print(f"Error generating access token: {e}")
        print("Make sure you're logged in with: gcloud auth application-default login")
        return None


async def proxy_task(
    source_websocket: WebSocketCommonProtocol,
    destination_websocket: WebSocketCommonProtocol,
    is_server: bool,
) -> None:
    source_name = "SERVER" if is_server else "CLIENT"
    dest_name = "CLIENT" if is_server else "SERVER"
    audio_chunk_count = 0
    
    try:
        async for message in source_websocket:
            try:
                # Always attempt to parse for logging purposes, but don't fail if it's binary
                try:
                    data = json.loads(message)
                    
                    if not is_server: # Client -> Server
                        if "realtime_input" in data:
                            audio_chunk_count += 1
                            if audio_chunk_count % 50 == 0: # Log every 50 chunks to avoid spam
                                print(f"📤 {source_name} -> {dest_name}: Sent {audio_chunk_count} audio chunks...")
                        elif "client_content" in data:
                            print(f"💬 {source_name} -> {dest_name}: Text/Content sent")
                        else:
                            print(f"📦 {source_name} -> {dest_name}: {list(data.keys())}")
                    
                    else: # Server -> Client
                        if "serverContent" in data:
                            sc = data["serverContent"]
                            if "modelTurn" in sc:
                                parts = sc["modelTurn"].get("parts", [])
                                for p in parts:
                                    if "inlineData" in p:
                                        print(f"🔊 {source_name} -> {dest_name}: Audio response part")
                                    if "text" in p:
                                        print(f"📝 {source_name} -> {dest_name}: Text response: {p['text'][:50]}...")
                                    if "functionCall" in p:
                                        print(f"🛠️ {source_name} -> {dest_name}: Tool Call: {p['functionCall']['name']}({p['functionCall'].get('args', {})})")
                            if "inputTranscription" in sc:
                                print(f"🎤 {source_name} -> {dest_name}: User Transcription: {sc['inputTranscription'].get('text')}")
                            if "outputTranscription" in sc:
                                text = sc["outputTranscription"].get("text")
                                if text:
                                    print(f"🗣️ {source_name} -> {dest_name}: Bot Transcription: {text}")
                            if sc.get("turnComplete"):
                                print(f"🏁 {source_name} -> {dest_name}: Turn Complete")
                        elif "setupComplete" in data:
                            print(f"✅ {source_name} -> {dest_name}: Setup Complete")
                        elif "toolCall" in data or "tool_call" in data:
                            tc_key = "toolCall" if "toolCall" in data else "tool_call"
                            tc = data[tc_key]
                            # Handle both camelCase and snake_case for function calls
                            calls = tc.get("functionCalls") or tc.get("function_calls") or []
                            for call in calls:
                                print(f"🛠️ {source_name} -> {dest_name}: Top-level Tool Call: {call['name']}({call.get('args', {})})")
                        else:
                            # Print a bit more of the dict to help debug unknown messages
                            print(f"📦 {source_name} -> {dest_name}: {list(data.keys())} - {str(data)[:200]}...")
                
                except:
                    # If parsing fails, it's likely raw binary or malformed JSON
                    if DEBUG:
                        print(f"Proxying from {source_name}: (Binary/Non-JSON)")
                
                await destination_websocket.send(message)
            except Exception as e:
                print(f"Error forwarding message: {e}")
    except ConnectionClosed as e:
        print(f"{source_name} connection closed: {e.code} - {e.reason}")
    except Exception as e:
        print(f"Unexpected error in proxy_task for {source_name}: {e}")
    finally:
        await destination_websocket.close()


async def create_proxy(
    client_websocket: WebSocketCommonProtocol, bearer_token: str, service_url: str
) -> None:
    """
    Establishes a WebSocket connection to the Gemini server and creates bidirectional proxy.

    Args:
        client_websocket: The WebSocket connection of the client.
        bearer_token: The bearer token for authentication with the server.
        service_url: The url of the service to connect to.
    """
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {bearer_token}",
    }

    # Create SSL context with certifi certificates
    ssl_context = ssl.create_default_context(cafile=certifi.where())

    print(f"Connecting to Gemini API...")
    if DEBUG:
        print(f"Service URL: {service_url}")

    try:
        async with websockets.connect(
            service_url,
            additional_headers=headers,
            ssl=ssl_context
        ) as server_websocket:
            print(f"✅ Connected to Gemini API")

            # Create bidirectional proxy tasks
            client_to_server_task = asyncio.create_task(
                proxy_task(client_websocket, server_websocket, is_server=False)
            )
            server_to_client_task = asyncio.create_task(
                proxy_task(server_websocket, client_websocket, is_server=True)
            )

            # Wait for either task to complete
            done, pending = await asyncio.wait(
                [client_to_server_task, server_to_client_task],
                return_when=asyncio.FIRST_COMPLETED,
            )

            # Cancel the remaining task
            for task in pending:
                task.cancel()
                try:
                    await task
                except asyncio.CancelledError:
                    pass

            # Close connections
            try:
                await server_websocket.close()
            except:
                pass

            try:
                await client_websocket.close()
            except:
                pass

    except ConnectionClosed as e:
        print(f"Server connection closed unexpectedly: {e.code} - {e.reason}")
        if not client_websocket.closed:
            await client_websocket.close(code=e.code, reason=e.reason)
    except Exception as e:
        error_msg = f"Failed to connect to Gemini API: {e}"
        print(error_msg)
        with open("error_log.txt", "w") as f:
            f.write(error_msg)
        if not client_websocket.closed:
            await client_websocket.close(code=1008, reason="Upstream connection failed")


async def handle_websocket_client(client_websocket: WebSocketServerProtocol) -> None:
    """
    Handles a new WebSocket client connection.

    Expects first message with optional bearer_token and service_url.
    If no bearer_token provided, generates one using Google default credentials.

    Args:
        client_websocket: The WebSocket connection of the client.
    """
    print("🔌 New WebSocket client connection...")
    try:
        # Wait for the first message from the client
        service_setup_message = await asyncio.wait_for(
            client_websocket.recv(), timeout=10.0
        )
        service_setup_message_data = json.loads(service_setup_message)

        bearer_token = service_setup_message_data.get("bearer_token")
        service_url = service_setup_message_data.get("service_url")

        # If no bearer token provided, generate one using default credentials
        if not bearer_token:
            print("🔑 Generating access token using default credentials...")
            bearer_token = generate_access_token()
            if not bearer_token:
                print("❌ Failed to generate access token")
                await client_websocket.close(
                    code=1008, reason="Authentication failed"
                )
                return
            print("✅ Access token generated")

        if not service_url:
            print("❌ Error: Service URL is missing")
            await client_websocket.close(
                code=1008, reason="Service URL is required"
            )
            return

        await create_proxy(client_websocket, bearer_token, service_url)

    except asyncio.TimeoutError:
        print("⏱️ Timeout waiting for the first message from the client")
        await client_websocket.close(code=1008, reason="Timeout")
    except json.JSONDecodeError as e:
        print(f"❌ Invalid JSON in first message: {e}")
        await client_websocket.close(code=1008, reason="Invalid JSON")
    except Exception as e:
        print(f"❌ Error handling client: {e}")
        # Check if connection is still open before trying to close
        if hasattr(client_websocket, 'closed'):
            if not client_websocket.closed:
                await client_websocket.close(code=1011, reason="Internal error")
        elif hasattr(client_websocket, 'state'):
            import websockets
            if client_websocket.state != websockets.protocol.State.CLOSED:
                await client_websocket.close(code=1011, reason="Internal error")


async def start_websocket_server():
    """Start the WebSocket proxy server."""
    # Enforce Origin validation for security
    allowed_origins_env = os.getenv("ALLOWED_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173,https://padmarajbhat.github.io")
    allowed_origins = [o.strip() for o in allowed_origins_env.split(",") if o.strip()]
    
    print(f"🔒 Enforcing allowed origins: {', '.join(allowed_origins)}")
    
    async with websockets.serve(handle_websocket_client, "0.0.0.0", WS_PORT, origins=allowed_origins):
        print(f"🔌 WebSocket proxy running on port {WS_PORT}")
        # Run forever
        await asyncio.Future()


async def main():
    """
    Starts the WebSocket server.
    """
    print(f"""
╔════════════════════════════════════════════════════════════╗
║     Gemini Live API Proxy Server                          ║
╠════════════════════════════════════════════════════════════╣
║                                                            ║
║  🔌 WebSocket Proxy: ws://localhost:{WS_PORT:<5}                   ║
║                                                            ║
║  Authentication:                                           ║
║  • Uses Google Cloud default credentials                  ║
║  • Run: gcloud auth application-default login             ║
║                                                            ║
╚════════════════════════════════════════════════════════════╝
""")

    await start_websocket_server()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n👋 Servers stopped")
