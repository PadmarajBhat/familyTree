import os
import uuid
from google.cloud import firestore
from datetime import datetime
import asyncio
import logging

logger = logging.getLogger(__name__)

class FamilyTreeStore:
    def __init__(self):
        # Initialize Firestore client (Sync)
        # We use the sync client wrapped in threads because AsyncClient has issues on Windows with gRPC
        self.db = firestore.Client(project='familytree-477808')
        self.people_ref = self.db.collection('people')
        self.tree_ref = self.db.collection('trees')
        self.users_ref = self.db.collection('users')

    async def warmup(self):
        """Performs a lightweight query to establish the connection pool."""
        logger.info("🔥 Warming up Firestore connection...")
        try:
            # Just fetch the tree metadata doc (very small)
            await asyncio.to_thread(self.tree_ref.document('default').get)
            logger.info("✅ Firestore connection warmed up.")
        except Exception as e:
            logger.error(f"❌ Warmup failed: {e}")



    async def get_user_preferences(self, email):
        if not email: return {}
        doc = await asyncio.to_thread(self.users_ref.document(email).get)
        return doc.to_dict() if doc.exists else {}

    async def save_user_preferences(self, email, prefs):
        if not email: return False
        doc_ref = self.users_ref.document(email)
        # Use set with merge=True to update existing or create new
        await asyncio.to_thread(doc_ref.set, prefs, merge=True)
        return True

    async def find_trees_by_email(self, email):
        if not email: return []
        # Since currently all people are in one "Global" tree view (from the backend perspective of a single people collection),
        # we return the default tree name if the user exists in the people collection.
        # Future-proof: This query could filter by specific treeIds if we added that field.
        docs = await asyncio.to_thread(lambda: list(self.people_ref.where('email', '==', email).stream()))
        
        if len(docs) > 0:
            return ["Family Tree"] # The default name used by frontend shim
        return []

    async def search(self, query):
        query = query.lower()
        results = []
        # Run sync stream in thread
        docs = await asyncio.to_thread(lambda: list(self.people_ref.stream()))
        
        # 1. Build local lookup for parent resolution
        id_to_name = {}
        all_nodes = []
        for doc in docs:
            data = doc.to_dict()
            id_to_name[data.get("nodeId")] = data.get("name", "Unknown")
            all_nodes.append(data)

        # 2. Filter and enrich
        for node in all_nodes:
            if query in node.get("name", "").lower():
                parent_name = None
                parent_id = node.get("parentId")
                if parent_id and parent_id in id_to_name:
                    parent_name = id_to_name[parent_id]
                
                results.append({
                    "nodeId": node.get("nodeId"),
                    "name": node.get("name"),
                    "gender": node.get("gender"),
                    "fatherName": parent_name 
                })
        return results

    async def get_details(self, node_id):
        doc = await asyncio.to_thread(self.people_ref.document(node_id).get)
        return doc.to_dict() if doc.exists else None

    async def add_person(self, name, gender, relation, anchor_node_id, **kwargs):
        new_id = str(uuid.uuid4())
        anchor_doc = await asyncio.to_thread(self.people_ref.document(anchor_node_id).get)
        
        if not anchor_doc.exists:
            return None, "Anchor node not found"
        
        new_node = {
            "nodeId": new_id,
            "name": name,
            "gender": gender,
            "parentId": None,
            "spouseIds": [],
            "childrenIds": [],
            "lastUpdated": firestore.SERVER_TIMESTAMP,
            **kwargs
        }
        
        batch = self.db.batch()
        rel = relation.lower()
        if "father" in rel or "mother" in rel:
            new_node["childrenIds"] = [anchor_node_id]
            batch.update(self.people_ref.document(anchor_node_id), {"parentId": new_id})
        elif "son" in rel or "daughter" in rel:
            new_node["parentId"] = anchor_node_id
            batch.update(self.people_ref.document(anchor_node_id), {
                "childrenIds": firestore.ArrayUnion([new_id])
            })
        elif "wife" in rel or "husband" in rel or "spouse" in rel:
            new_node["spouseIds"] = [anchor_node_id]
            batch.update(self.people_ref.document(anchor_node_id), {
                "spouseIds": firestore.ArrayUnion([new_id])
            })
            
        batch.set(self.people_ref.document(new_id), new_node)
        await asyncio.to_thread(batch.commit)
        return new_id, None

    async def update_person(self, node_id, updates):
        doc_ref = self.people_ref.document(node_id)
        doc = await asyncio.to_thread(doc_ref.get)
        if not doc.exists:
            return False
        
        updates["lastUpdated"] = firestore.SERVER_TIMESTAMP
        await asyncio.to_thread(doc_ref.update, updates)
        return True

    async def get_full_tree(self):
        start_time = datetime.now()
        logger.info(f"⏱️ Starting tree fetch at {start_time}")
        
        tree_doc = await asyncio.to_thread(self.tree_ref.document('default').get)
        tree_data = tree_doc.to_dict() if tree_doc.exists else {}
        
        # Optimize: Select only fields needed for tree visualization to reduce payload and latency
        field_mask = [
            'nodeId', 'name', 'gender', 'imageUrl', 
            'dob', 'dod', 'dobApprox', 'dodApprox',
            'spouseIds', 'parentId', 'childrenIds', 
            'email', 'isEditor'
        ]
        
        nodes = {} # Restore missing initialization

        # We need a lambda to run the query in the thread
        def fetch_optimized():
            return list(self.people_ref.select(field_mask).stream())

        docs = await asyncio.to_thread(fetch_optimized)
        
        duration = (datetime.now() - start_time).total_seconds()
        logger.info(f"⏱️ Tree fetch completed in {duration:.2f}s. Found {len(docs)} nodes.")
        
        for doc in docs:
            # When using select(), to_dict() only contains the selected fields
            # Warning: accessing other fields would return None or not exist in the dict
            node = doc.to_dict()
            
            # Ensure required array fields exist as empty lists if missing
            node["spouseIds"] = node.get("spouseIds") or []
            node["childrenIds"] = node.get("childrenIds") or []
            # Convert timestamps to ISO strings for JSON serialization
            if 'lastUpdated' in node and node['lastUpdated'] is not None:
                if hasattr(node['lastUpdated'], 'isoformat'):
                    node['lastUpdated'] = node['lastUpdated'].isoformat()
                else:
                    node['lastUpdated'] = str(node['lastUpdated'])
            nodes[node['nodeId']] = node
            
        return {
            "nodes": nodes,
            "rootNodeId": tree_data.get("rootNodeId"),
            "treeName": tree_data.get("treeName", "Family Tree"),
            "meta": {"lastUpdated": datetime.now().isoformat()}
        }

class ToolsHandler:
    def __init__(self, store: FamilyTreeStore):
        self.store = store

    async def execute(self, name, args):
        logger.info(f"🛠️ Executing Firestore-backed tool: {name}({args})")
        if name == "get_person_details":
            node = await self.store.get_details(args.get("node_id"))
            return {"status": "success", "data": node} if node else {"status": "error", "message": "Person not found"}
        
        elif name == "search_family_tree":
            matches = await self.store.search(args.get("query", ""))
            return {"status": "success", "matches": matches}
        
        elif name == "add_person":
            node_id, err = await self.store.add_person(
                args.get("name"),
                args.get("gender"),
                args.get("relation"),
                args.get("anchor_node_id"),
                phone=args.get("phone"),
                email=args.get("email"),
                dob=args.get("dob")
            )
            if err: return {"status": "error", "message": err}
            return {"status": "success", "message": f"Added {args.get('name')}", "nodeId": node_id}
        
        elif name == "update_person":
            success = await self.store.update_person(args.get("node_id"), args.get("updates", {}))
            return {"status": "success", "message": "Updated"} if success else {"status": "error", "message": "Failed"}
        
        return {"status": "error", "message": "Unknown tool"}

    async def get_full_tree(self):
        return await self.store.get_full_tree()

# Global singleton instance (defined after class)
SHARED_STORE = FamilyTreeStore()
