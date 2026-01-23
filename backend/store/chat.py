import logging
import asyncio
from google.cloud import firestore
from datetime import datetime

logger = logging.getLogger(__name__)

class ChatMixin:
    async def log_chat(self, email, role, text):
        if not email or not text: return
        
        chat_doc = {
            "email": email,
            "role": role, # 'user' or 'model'
            "text": text,
            "timestamp": firestore.SERVER_TIMESTAMP
        }
        await asyncio.to_thread(self.chats_ref.add, chat_doc)

    async def get_chat_history(self, email, limit=20):
        if not email: return []
        
        def fetch():
            from google.cloud.firestore import FieldFilter
            query = self.chats_ref.where(filter=FieldFilter("email", "==", email)).limit(100)
            docs = list(query.stream())
            return docs

        docs = await asyncio.to_thread(fetch)
        
        history = []
        for doc in docs:
            d = doc.to_dict()
            history.append(d)
            
        history.sort(key=lambda x: x.get("timestamp", datetime.min), reverse=True)
        history = history[:limit]
        
        for d in history:
            if d.get("timestamp"):
                d["timestamp"] = d["timestamp"].isoformat() if hasattr(d["timestamp"], 'isoformat') else str(d["timestamp"])

        return history[::-1] # Return oldest first (ascending)
