import logging
import asyncio
from google.cloud import firestore

logger = logging.getLogger(__name__)

class AuditMixin:
    async def log_audit(self, tree_id, action, user_email, summary, details=None, target_node_id=None):
        if not tree_id: return
        
        log_entry = {
            "treeId": tree_id,
            "action": action, # ADD, EDIT, DELETE
            "userEmail": user_email,
            "summary": summary,
            "details": details or {}, # Structured diff: { field: { old: ..., new: ... } }
            "targetNodeId": target_node_id,
            "timestamp": firestore.SERVER_TIMESTAMP
        }
        await asyncio.to_thread(self.audit_ref.add, log_entry)

    async def get_history_logs(self, tree_id, limit=50, node_id=None):
        if not tree_id: return []
        
        try:
            query = self.audit_ref.where("treeId", "==", tree_id)
            
            if node_id:
                query = query.where("targetNodeId", "==", node_id)
                
            # Note: Compound query with order_by("timestamp") requires an index in Firestore.
            try:
                query = query.order_by("timestamp", direction=firestore.Query.DESCENDING)
                docs = await asyncio.to_thread(lambda: list(query.limit(limit).stream()))
            except Exception as e:
                logger.warning(f"Index missing for sorted history? Fallback to memory sort. Error: {e}")
                # Fallback: Fetch without sort
                query = self.audit_ref.where("treeId", "==", tree_id)
                if node_id:
                     query = query.where("targetNodeId", "==", node_id)
                docs = await asyncio.to_thread(lambda: list(query.limit(100).stream()))
            
            logs = []
            for doc in docs:
                d = doc.to_dict()
                if d.get("timestamp"):
                    d["timestamp"] = d["timestamp"].isoformat() if hasattr(d["timestamp"], 'isoformat') else str(d["timestamp"])
                logs.append(d)
                
            # Ensure sorting if fallback was used
            logs.sort(key=lambda x: x.get("timestamp", ""), reverse=True)
            return logs[:limit]
            
        except Exception as e:
            logger.error(f"Failed to fetch history: {e}")
            return []
