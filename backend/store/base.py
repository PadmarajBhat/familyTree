import logging
from google.cloud import firestore
import asyncio

logger = logging.getLogger(__name__)

class BaseStore:
    def __init__(self):
        # Initialize Firestore client (Sync)
        # We use the sync client wrapped in threads because AsyncClient has issues on Windows with gRPC
        self.db = firestore.Client(project='familytree-477808')
        self.people_ref = self.db.collection('people')
        self.tree_ref = self.db.collection('trees')
        self.users_ref = self.db.collection('users')
        self.audit_ref = self.db.collection('audit_logs')
        self.chats_ref = self.db.collection('chats')
