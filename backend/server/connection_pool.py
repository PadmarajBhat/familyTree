import asyncio
import logging
import ssl
import certifi
import websockets
import os

logger = logging.getLogger(__name__)

# Constants (should match client_handler/proxy_utils)
HOST = "us-central1-aiplatform.googleapis.com"
SERVICE_URL = f"wss://{HOST}/ws/google.cloud.aiplatform.v1beta1.LlmBidiService/BidiGenerateContent"

class GeminiConnectionPool:
    _instance = None
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(GeminiConnectionPool, cls).__new__(cls)
            cls._instance.pool = asyncio.Queue(maxsize=1) # Keep 1 warmed up for now
            cls._instance.lock = asyncio.Lock()
        return cls._instance

    async def warmup(self, bearer_token: str, model: str):
        """
        Creates a connection and puts it in the pool.
        """
        if self.pool.full():
            return

        try:
            logger.info("🔥 Warming up Gemini connection...")
            
            # If token provided (replenish), use it.
            # If not (boot time), try to fetch ADC.
            token = bearer_token
            
            if not token:
                import google.auth
                from google.auth.transport.requests import Request
                
                # Vertex AI requires cloud-platform scope
                creds, _ = google.auth.default(scopes=["https://www.googleapis.com/auth/cloud-platform"])
                if not creds.valid:
                    request = Request()
                    creds.refresh(request)
                token = creds.token
            
            headers = {
                "Content-Type": "application/json",
                "Authorization": f"Bearer {token}",
            }
            
            ssl_context = ssl.create_default_context(cafile=certifi.where())
            
            # We connect to the Vertex AI endpoint
            ws = await websockets.connect(SERVICE_URL, additional_headers=headers, ssl=ssl_context)
            
            logger.info("✅ Warmed up Gemini connection ready!")
            await self.pool.put(ws)
            
        except Exception as e:
            logger.error(f"❌ Warmup failed: {e}")

    async def get_connection(self):
        if not self.pool.empty():
            logger.info("⚡ Using warmed-up connection from pool")
            return await self.pool.get()
        return None
        
    async def replenish(self):
        """Triggered after taking a connection to prep the next one"""
        if not self.pool.full():
             asyncio.create_task(self.warmup(None, None))

GEMINI_POOL = GeminiConnectionPool()
