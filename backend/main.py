#!/usr/bin/env python3
"""
WebSocket Proxy Server for Gemini Live API
Main entry point.
"""

import asyncio
import os
import sys
import websockets
import logging

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger("ProxyServer")

# Add current directory to path to ensure modules are found
current_dir = os.path.dirname(os.path.abspath(__file__))
if current_dir not in sys.path:
    sys.path.append(current_dir)

from server.client_handler import handle_websocket_client
from tools_handler import SHARED_STORE
from server.connection_pool import GEMINI_POOL

WS_PORT = int(os.getenv("PORT", os.getenv("WS_PORT", "8888")))

async def start_websocket_server():
    """Start the WebSocket proxy server."""
    # DEBUG: Allow all origins to rule out CORS issues
    print(f"🔒 Enforcing allowed origins: *")
    
    try:
        logger.info("🔥 Starting server warmup...")
        await SHARED_STORE.warmup()
        # Trigger Gemini connection warmup in background
        asyncio.create_task(GEMINI_POOL.warmup(None, None))
        # Enable reuse_address to avoid "Address already in use" errors on restart
        async with websockets.serve(
            handle_websocket_client, 
            "0.0.0.0", # Bind to all IPv4 interfaces for Cloud Run support
            WS_PORT, 
            reuse_address=True,
            origins=None,
            ping_interval=20, # Send ping every 20s to keep connection alive
            ping_timeout=20
        ):
            logger.info(f"🔌 WebSocket proxy running on port {WS_PORT}")
            # Use an event to keep the server running
            await asyncio.Future()  # run forever
    except OSError as e:
        if e.errno == 10048:
            logger.error(f"Port {WS_PORT} is already in use. Please close any application using this port and try again.")
        else:
            logger.error(f"Network error starting server: {e}")
        sys.exit(1)
    except Exception as e:
        logger.error(f"Unexpected error starting server: {e}")
        sys.exit(1)

async def main():
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
    except Exception as e:
        logger.error(f"Fatal error: {e}")
        sys.exit(1)
