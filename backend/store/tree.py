import logging
import asyncio
import uuid
from google.cloud import firestore
from datetime import datetime

logger = logging.getLogger(__name__)

class TreeMixin:
    async def warmup(self):
        """Performs a lightweight query to establish the connection pool."""
        logger.info("🔥 Warming up Firestore connection...")
        try:
            # Just fetch the tree metadata doc (very small)
            await asyncio.to_thread(self.tree_ref.limit(1).get)
            logger.info("✅ Firestore connection warmed up.")
        except Exception as e:
            logger.error(f"❌ Warmup failed: {e}")

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
        try:
            all_trees = await asyncio.to_thread(lambda: list(self.tree_ref.stream()))
            
            trees = []
            for doc in all_trees:
                data = doc.to_dict()
                ts = data.get("createdTime")
                time_str = ts.isoformat() if hasattr(ts, 'isoformat') else str(ts)
                
                nodes = data.get("nodes", {})
                is_member = False
                for node in nodes.values():
                    if node.get("email") and str(node.get("email")).lower() == email.lower():
                        is_member = True
                        break
                
                trees.append({
                    "id": data.get("treeId"),
                    "name": data.get("treeName"),
                    "description": f"Owned by {data.get('owner')}",
                    "modifiedTime": time_str,
                    "owner": data.get("owner"),
                    "editors": data.get("editors", []),
                    "isMember": is_member
                })
            
            logger.info(f"List trees: found {len(trees)} total trees (public visibility)")
            return trees
        except Exception as e:
            logger.error(f"Failed to list trees: {e}")
            return []

    async def find_trees_by_email(self, email):
        trees = await self.list_trees(email)
        return [t['name'] for t in trees]

    async def get_full_tree(self, tree_id):
        start_time = datetime.now()
        logger.info(f"⏱️ Starting tree fetch for {tree_id} at {start_time}")
        
        if not tree_id:
            return None, "Tree ID is required"

        if tree_id == "default":
            # Auto-migration logic for 'default' tree could go here if needed
            # For brevity in refactor, we assume migration isn't constantly needed
            # or we can include the lightweight check.
            pass 

        tree_doc = await asyncio.to_thread(self.tree_ref.document(tree_id).get)
        
        if not tree_doc.exists:
             logger.warning(f"Tree document {tree_id} not found by key. Trying field lookup...")
             # Handle potential int/string mismatch for treeId in metadata doc too
             search_ids = [tree_id]
             if str(tree_id).isdigit():
                 search_ids.append(int(tree_id))
             search_ids = list(set(search_ids))

             query = self.tree_ref.where("treeId", "in", search_ids).limit(1)
             docs = await asyncio.to_thread(lambda: list(query.stream()))
             if docs:
                 tree_doc = docs[0]
             else:
                 logger.warning(f"Tree {tree_id} not found by key or field (searched {search_ids})")
                 return None, "Tree not found"
        
        tree_meta = tree_doc.to_dict()
        
        field_mask = [
            'nodeId', 'name', 'gender', 'imageUrl', 
            'dob', 'dod', 'dobApprox', 'dodApprox',
            'spouseIds', 'parentId', 'childrenIds', 
            'email', 'isEditor', 'treeId', 'externalLink',
            'nameTranslations', 'phone', 'phoneE164', 'ageProvided',
            'dobInferred', 'address', 'editorSince', 'editedBy',
            'editedTime', 'lastUpdated', 'hobbies', 'education',
            'occupation', 'notes', 'location'
        ]
        
        def fetch_optimized():
            # Query for both string and integer representation of the ID if it looks numeric
            # This handles cases where legacy data stored treeId as number 1 but we query "1"
            search_ids = [tree_id]
            if str(tree_id).isdigit():
                search_ids.append(int(tree_id))
            # Remove duplicates
            search_ids = list(set(search_ids))

            results_by_id = list(self.people_ref.where('treeId', 'in', search_ids).select(field_mask).stream())
            return results_by_id

        docs = await asyncio.to_thread(fetch_optimized)
        
        duration = (datetime.now() - start_time).total_seconds()
        logger.info(f"⏱️ Tree fetch completed in {duration:.2f}s. Found {len(docs)} nodes.")
        
        nodes = {}
        for doc in docs:
            node = doc.to_dict()
            node["spouseIds"] = node.get("spouseIds") or []
            node["childrenIds"] = node.get("childrenIds") or []
            
            if 'lastUpdated' in node and node['lastUpdated'] is not None:
                if hasattr(node['lastUpdated'], 'isoformat'):
                    node['lastUpdated'] = node['lastUpdated'].isoformat()
            
            nodes[node["nodeId"]] = node

        # ---------------------------------------------------------
        # AUTO-REPAIR: Reconstruct childrenIds from parentId relationships
        # This ensures the tree structure is valid even if Firestore data is out of sync
        # ---------------------------------------------------------
        repaired_count = 0
        for node_id, node in nodes.items():
            pid = node.get("parentId")
            if pid and pid in nodes:
                parent = nodes[pid]
                if "childrenIds" not in parent:
                    parent["childrenIds"] = []
                if node_id not in parent["childrenIds"]:
                    parent["childrenIds"].append(node_id)
                    repaired_count += 1
        
        if repaired_count > 0:
            logger.info(f"🔧 Auto-Repaired {repaired_count} missing parent->child links.")
        # ---------------------------------------------------------

        tree_doc_data = {
            "schemaVersion": 1,
            "treeId": tree_meta.get("treeId"),
            "treeName": tree_meta.get("treeName"),
            "versionIndex": 1,
            "timestamp": datetime.now().isoformat(),
            "rootNodeId": tree_meta.get("rootNodeId"),
            "nodes": nodes,
            "marriages": [],
            "summary": [],
            "meta": {
                "createdBy": tree_meta.get("owner"),
                "createdTime": str(tree_meta.get("createdTime")),
                "nodeCount": len(nodes)
            }
        }
        
        return tree_doc_data, None
