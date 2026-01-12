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
        self.chats_ref = self.db.collection('chats')

    async def warmup(self):
        """Performs a lightweight query to establish the connection pool."""
        logger.info("🔥 Warming up Firestore connection...")
        try:
            # Just fetch the tree metadata doc (very small)
            await asyncio.to_thread(self.tree_ref.limit(1).get)
            logger.info("✅ Firestore connection warmed up.")
        except Exception as e:
            logger.error(f"❌ Warmup failed: {e}")

    async def log_chat(self, email, role, text):
        if not email or not text: return
        
        chat_doc = {
            "email": email,
            "role": role, # 'user' or 'model'
            "text": text,
            "timestamp": firestore.SERVER_TIMESTAMP
        }
        # Fire and forget (or await if strict)
        await asyncio.to_thread(self.chats_ref.add, chat_doc)

    async def get_chat_history(self, email, limit=20):
        if not email: return []
        
        def fetch():
            # Query by email only (no order_by) to avoid composite index requirement
            # We fetch a bit more than limit to ensure we get recent ones if possible,
            # but without order_by, order is undefined.
            # Ideally we'd scan, but for MVP let's assume not too many records or just fetch all.
            # If many records exist, this is inefficient. 
            # A better approach without index: fetch all (if small) or ask user to create index.
            # For now, let's just fetch all (assuming < 1000 messages) and sort.
            
            # Use limit(50) to prevent explosion, but we might miss recent ones if random order.
            # Actually, Firestore default order is usually ID which is random-ish.
            # We MUST rely on Firestore sorting for correctness with limit.
            # But we can't without index.
            # Let's try WITHOUT order_by and fetch limit=100, then sort.
            # Query by email only (no order_by) to avoid composite index requirement
            from google.cloud.firestore import FieldFilter
            query = self.chats_ref.where(filter=FieldFilter("email", "==", email)).limit(100)
            docs = list(query.stream())
            return docs

        docs = await asyncio.to_thread(fetch)
        
        # Convert to dict and Sort in memory by timestamp DESC
        history = []
        for doc in docs:
            d = doc.to_dict()
            # Convert timestamp to ISO string if needed
            ts = d.get("timestamp")
            if ts:
                 # Keep ts object for sorting, or convert to string
                 pass
            history.append(d)
            
        # Sort by timestamp (descending)
        # Handle cases where timestamp might be None or server_timestamp sentinel (if read immediately)
        # Firestore sets timestamp on write, so read should have it.
        history.sort(key=lambda x: x.get("timestamp", datetime.min), reverse=True)
        
        # Take top 'limit'
        history = history[:limit]
        
        # Convert timestamp to string for JSON
        for d in history:
            if d.get("timestamp"):
                d["timestamp"] = d["timestamp"].isoformat() if hasattr(d["timestamp"], 'isoformat') else str(d["timestamp"])

        return history[::-1] # Return oldest first (ascending)

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

    async def create_tree(self, name, owner_email):
        tree_id = str(uuid.uuid4())
        tree_data = {
            "treeId": tree_id,
            "treeName": name,
            "owner": owner_email,
            "createdTime": firestore.SERVER_TIMESTAMP,
            "rootNodeId": "",
            "editors": [owner_email]
        }
        await asyncio.to_thread(self.tree_ref.document(tree_id).set, tree_data)
        logger.info(f"🌳 Created new tree: {name} ({tree_id}) for {owner_email}")
        return tree_id

    async def list_trees(self, email):
        if not email: return []
        # Find trees where user is owner or editor
        # Firestore OR queries are limited, so we might need separate queries or a composed field.
        # For simplicity in V1, we check 'editors' array_contains email
        
        try:
            docs = await asyncio.to_thread(lambda: list(self.tree_ref.where('editors', 'array_contains', email).stream()))
            trees = []
            for doc in docs:
                data = doc.to_dict()
                trees.append({
                    "id": data.get("treeId"),
                    "name": data.get("treeName"),
                    "description": f"Owned by {data.get('owner')}",
                    "modifiedTime": datetime.now().isoformat() # Placeholder as we don't track tree mod time separately yet
                })
            
            return trees
        except Exception as e:
            logger.error(f"Failed to list trees: {e}")
            return []

    async def find_trees_by_email(self, email):
        # Legacy/Shim support - just list trees
        trees = await self.list_trees(email)
        return [t['name'] for t in trees]

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
                    "fatherName": parent_name,
                    "treeId": node.get("treeId"), # Return treeId for context
                    "treeName": "Unknown Tree" # Ideally fetch tree name map, simplifying for now
                })
        return results

    async def get_details(self, node_id):
        doc = await asyncio.to_thread(self.people_ref.document(node_id).get)
        return doc.to_dict() if doc.exists else None

    async def add_person(self, name, gender, relation, anchor_node_id, tree_id, **kwargs):
        new_id = str(uuid.uuid4())
        
        # If anchor_node_id is provided, verify it exists (in the same tree?)
        if anchor_node_id:
            anchor_doc = await asyncio.to_thread(self.people_ref.document(anchor_node_id).get)
            if not anchor_doc.exists:
                return None, "Anchor node not found"
        
        new_node = {
            "nodeId": new_id,
            "treeId": tree_id, 
            "name": name,
            "gender": gender,
            "parentId": None,
            "spouseIds": [],
            "childrenIds": [],
            "lastUpdated": firestore.SERVER_TIMESTAMP,
            **kwargs
        }
        
        batch = self.db.batch()
        
        if anchor_node_id:
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
        
        current_data = doc.to_dict()
        
        # Helper to merge address if passed as partial or string
        if "address" in updates:
            addr_update = updates["address"]
            if isinstance(addr_update, str):
                # If Gemini sends address as string, put it in freeform
                updates["address"] = {
                    "freeform": addr_update,
                    "city": current_data.get("address", {}).get("city", ""),
                    "state": current_data.get("address", {}).get("state", ""),
                    "country": current_data.get("address", {}).get("country", "")
                }
            elif isinstance(addr_update, dict):
                 # Merge with existing address to prevent wiping other fields if partial
                 existing_addr = current_data.get("address") or {}
                 updates["address"] = {**existing_addr, **addr_update}

        updates["lastUpdated"] = firestore.SERVER_TIMESTAMP
        await asyncio.to_thread(doc_ref.update, updates)
        return True

    async def save_node(self, node):
        node_id = node.get("nodeId")
        if not node_id: return None, "Node ID required"
        
        node["lastUpdated"] = firestore.SERVER_TIMESTAMP
        await asyncio.to_thread(self.people_ref.document(node_id).set, node, merge=True)
        return node_id, None

    async def delete_person(self, node_id):
        if not node_id: return False
        await asyncio.to_thread(self.people_ref.document(node_id).delete)
        return True

    async def get_full_tree(self, tree_id):
        start_time = datetime.now()
        logger.info(f"⏱️ Starting tree fetch for {tree_id} at {start_time}")
        
        if not tree_id:
            return None, "Tree ID is required"

        # Auto-migration for legacy 'default' tree
        if tree_id == "default":
            tree_doc_ref = self.tree_ref.document("default")
            tree_doc_snapshot = await asyncio.to_thread(tree_doc_ref.get)
            
            if not tree_doc_snapshot.exists:
                logger.info("🛠️ 'default' tree not found. Initializing and migrating legacy data...")
                # 1. Create the default tree document
                default_tree_meta = {
                    "treeId": "default",
                    "treeName": "Family Tree",
                    "owner": "system", # or "legacy"
                    "editors": [],
                    "createdTime": datetime.now(),
                    "description": "Default Family Tree"
                }
                await asyncio.to_thread(tree_doc_ref.set, default_tree_meta)
                
                # 2. Migrate existing people nodes (set treeId='default')
                def migrate_nodes():
                    batch = self.db.batch()
                    count = 0
                    # Fetch all nodes - simplistic migration for manageable datasets
                    all_nodes = self.people_ref.stream()
                    for node in all_nodes:
                        node_data = node.to_dict()
                        if node_data.get("treeId") != "default":
                            batch.update(node.reference, {"treeId": "default"})
                            count += 1
                            if count >= 400: # Firestore batch limit
                                batch.commit()
                                batch = self.db.batch()
                                count = 0
                    if count > 0:
                        batch.commit()
                    return True

                await asyncio.to_thread(migrate_nodes)
                logger.info("✅ Migration complete.")

        # Fetch tree metadata
        tree_doc = await asyncio.to_thread(self.tree_ref.document(tree_id).get)
        if not tree_doc.exists:
             logger.warning(f"Tree {tree_id} not found")
             return None, "Tree not found"
        tree_meta = tree_doc.to_dict()
        
        # Optimize: Select only fields needed for tree visualization
        field_mask = [
            'nodeId', 'name', 'gender', 'imageUrl', 
            'dob', 'dod', 'dobApprox', 'dodApprox',
            'spouseIds', 'parentId', 'childrenIds', 
            'email', 'isEditor', 'treeId', 'externalLink'
        ]
        
        nodes = {}

        # We need a lambda to run the query in the thread
        def fetch_optimized():
            # Filter by treeId
            return list(self.people_ref.where('treeId', '==', tree_id).select(field_mask).stream())

        docs = await asyncio.to_thread(fetch_optimized)
        
        # RESCUE MIGRATION: If we found no nodes for 'default', but the tree meta exists,
        # it might be a failed migration. existing nodes might still be orphans.
        if len(docs) == 0 and tree_id == "default":
             logger.info("⚠️ 'default' tree has 0 nodes. Checking for orphans to rescue...")
             def rescue_orphans():
                # Check if there are any nodes WITHOUT treeId
                orphans = list(self.people_ref.limit(5).stream())
                # Filter client-side to be sure (limit doesn't support complex filters easily in stream without index)
                # Just fetch a small batch and see if they lack treeId
                has_orphans = False
                for node in orphans:
                     if "treeId" not in node.to_dict():
                         has_orphans = True
                         break
                
                if has_orphans:
                     logger.info("🚑 Orphans detected! Running Force Migration...")
                     batch = self.db.batch()
                     count = 0
                     all_nodes = self.people_ref.stream()
                     for node in all_nodes:
                        node_data = node.to_dict()
                        if "treeId" not in node_data or node_data.get("treeId") is None:
                            batch.update(node.reference, {"treeId": "default"})
                            count += 1
                            if count >= 400:
                                batch.commit()
                                batch = self.db.batch()
                                count = 0
                     if count > 0:
                        batch.commit()
                     logger.info(f"✅ Rescued {count} orphan nodes.")
                     return True
                return False

             did_rescue = await asyncio.to_thread(rescue_orphans)
             if did_rescue:
                 # Re-fetch
                 docs = await asyncio.to_thread(fetch_optimized)

        duration = (datetime.now() - start_time).total_seconds()
        logger.info(f"⏱️ Tree fetch completed in {duration:.2f}s. Found {len(docs)} nodes.")
        
        for doc in docs:
            node = doc.to_dict()
            
            # Ensure required array fields exist as empty lists if missing
            node["spouseIds"] = node.get("spouseIds") or []
            node["childrenIds"] = node.get("childrenIds") or []
            
            # Convert timestamps
            if 'lastUpdated' in node and node['lastUpdated'] is not None:
                if hasattr(node['lastUpdated'], 'isoformat'):
                    node['lastUpdated'] = node['lastUpdated'].isoformat()
                else:
                     node['lastUpdated'] = str(node['lastUpdated'])

            nodes[node['nodeId']] = node

        result = {
            "schemaVersion": 1,
            "treeId": tree_meta.get("treeId"),
            "treeName": tree_meta.get("treeName"),
            "owner": tree_meta.get("owner"),
            "description": tree_meta.get("description"),
            "timestamp": datetime.now().isoformat(),
            "nodes": nodes,
            "marriages": [],
            "summary": [],
            "meta": {
                "nodeCount": len(nodes),
                "createdBy": tree_meta.get("owner"),
                "createdTime": str(tree_meta.get("createdTime"))
            }
        }
        
        if nodes:
             potential_roots = [nid for nid, n in nodes.items() if not n.get('parentId')]
             if potential_roots:
                 result["rootNodeId"] = potential_roots[0]
             else:
                 result["rootNodeId"] = next(iter(nodes))

        return result, None

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
                args.get("tree_id"), # Added tree_id
                phone=args.get("phone"),
                email=args.get("email"),
                dob=args.get("dob")
            )
            if err: return {"status": "error", "message": err}
            return {"status": "success", "message": f"Added {args.get('name')}", "nodeId": node_id}
        
        elif name == "update_person":
            success = await self.store.update_person(args.get("node_id"), args.get("updates", {}))
            return {"status": "success", "message": "Updated"} if success else {"status": "error", "message": "Failed"}
        
        elif name == "save_node":
            node_id, err = await self.store.save_node(args.get("node"))
            if err: return {"status": "error", "message": err}
            return {"status": "success", "nodeId": node_id}

        elif name == "delete_person":
            success = await self.store.delete_person(args.get("node_id"))
            return {"status": "success"} if success else {"status": "error", "message": "Failed"}

        elif name == "create_tree":
            tree_id = await self.store.create_tree(args.get("name"), args.get("owner"))
            return {"status": "success", "treeId": tree_id, "message": f"Created tree {args.get('name')}"}

        return {"status": "error", "message": "Unknown tool"}

    async def get_full_tree(self, tree_id):
        return await self.store.get_full_tree(tree_id)

    async def list_trees(self, email):
        return await self.store.list_trees(email)

    async def create_tree(self, name, owner):
        return await self.store.create_tree(name, owner)

# Global singleton instance (defined after class)
SHARED_STORE = FamilyTreeStore()
