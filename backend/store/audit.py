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

    def _force_serialize(self, obj):
        if hasattr(obj, 'isoformat'):
            return obj.isoformat()
        if isinstance(obj, dict):
            return {k: self._force_serialize(v) for k, v in obj.items()}
        if isinstance(obj, list):
            return [self._force_serialize(v) for v in obj]
        return obj

    async def get_history_logs(self, tree_id, limit=50, node_id=None):
        if not tree_id: return []
        
        try:
            # Handle potential int/string mismatch for treeId
            search_ids = [tree_id]
            if str(tree_id).isdigit():
                search_ids.append(int(tree_id))
            search_ids = list(set(search_ids))

            query = self.audit_ref.where("treeId", "in", search_ids)
            
            if node_id:
                query = query.where("targetNodeId", "==", node_id)
                
            # Note: Compound query with order_by("timestamp") requires an index in Firestore.
            try:
                query = query.order_by("timestamp", direction=firestore.Query.DESCENDING)
                docs = await asyncio.to_thread(lambda: list(query.limit(limit).stream()))
            except Exception as e:
                logger.warning(f"Index missing for sorted history? Fallback to memory sort. Error: {e}")
                # Fallback: Fetch without sort
                query = self.audit_ref.where("treeId", "in", search_ids)
                if node_id:
                     query = query.where("targetNodeId", "==", node_id)
                docs = await asyncio.to_thread(lambda: list(query.limit(100).stream()))
            
            logs = []
            for doc in docs:
                d = doc.to_dict()
                logs.append(self._force_serialize(d))
                
            # Ensure sorting if fallback was used
            logs.sort(key=lambda x: x.get("timestamp", ""), reverse=True)
            return logs[:limit]
            
        except Exception as e:
            logger.error(f"Failed to fetch history: {e}")
            return []
