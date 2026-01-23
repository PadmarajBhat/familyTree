import os
import uuid
from google.cloud import firestore
from datetime import datetime
import asyncio
import logging
import difflib
from googletrans import Translator

logger = logging.getLogger(__name__)

class FamilyTreeStore:
    def __init__(self):
        # Initialize Firestore client (Sync)
        # We use the sync client wrapped in threads because AsyncClient has issues on Windows with gRPC
        self.db = firestore.Client(project='familytree-477808')
        self.people_ref = self.db.collection('people')
        self.tree_ref = self.db.collection('trees')
        self.users_ref = self.db.collection('users')
        self.audit_ref = self.db.collection('audit_logs')
        self.chats_ref = self.db.collection('chats')

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
            # If (treeId, timestamp) index exists, good.
            # If (treeId, targetNodeId, timestamp) index exists, good.
            # Without index, this might fail or require client-side sorting.
            # For robustness in this MVP without claiming index creation:
            # We will fetch a bit more and sort in memory if the specific index is missing/erroring
            # BUT sticking to simple valid queries is better.
            # Let's try to order by timestamp. If it fails, we catch and sort manually.
            try:
                query = query.order_by("timestamp", direction=firestore.Query.DESCENDING)
                docs = await asyncio.to_thread(lambda: list(query.limit(limit).stream()))
            except Exception as e:
                logger.warning(f"Index missing for sorted history? Fallback to memory sort. Error: {e}")
                # Fallback: Fetch without sort (limit might be risky if data is huge, but fine for MVP)
                query = self.audit_ref.where("treeId", "==", tree_id)
                if node_id:
                     query = query.where("targetNodeId", "==", node_id)
                # Fetch recent 100 or so? defaults to arbitrary order w/o sort
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



    # ... (skipping update_person for a moment to focus on save_node which is primary for UI)

    async def save_node(self, node, user_email=None):
        node_id = node.get("nodeId")
        if not node_id: return None, "Node ID required"
        
        # 1. Fetch existing for Diff
        doc_ref = self.people_ref.document(node_id)
        doc = await asyncio.to_thread(doc_ref.get)
        
        diff = {}
        action = "ADD"
        
        if doc.exists:
            action = "EDIT"
            existing = doc.to_dict()
            # Calculate simple diff of scalar fields
            check_fields = ["name", "gender", "dob", "dod", "occupation", "education", "phone", "email", "address"]
            for field in check_fields:
                old_val = existing.get(field)
                new_val = node.get(field)
                
                # Normalize for comparison
                if old_val != new_val:
                    # Deep check for objects like address/occupation needed?
                    # For now strictly compare
                    if str(old_val) != str(new_val):
                         diff[field] = {"old": old_val, "new": new_val}
        
        node["lastUpdated"] = firestore.SERVER_TIMESTAMP
        if user_email:
             node["editedBy"] = user_email
             
        await asyncio.to_thread(doc_ref.set, node, merge=True)
        
        # Log it
        if user_email: # Only log if we know who
            tree_id = node.get("treeId")
            
            summary = ""
            if action == "ADD":
                summary = f"Added {node.get('name')}"
            else:
                fields = ", ".join(diff.keys())
                summary = f"Updated {node.get('name')} with {fields}" if fields else f"Updated {node.get('name')}"
            
            await self.log_audit(tree_id, action, user_email, summary, diff, node_id)
            
        return node_id, None

    async def delete_person(self, node_id, user_email=None):
        if not node_id: return False
        
        # Fetch name for log
        doc = await asyncio.to_thread(self.people_ref.document(node_id).get)
        name = "Unknown"
        tree_id = None
        if doc.exists:
            data = doc.to_dict()
            name = data.get("name", "Unknown")
            tree_id = data.get("treeId")
            
        await asyncio.to_thread(self.people_ref.document(node_id).delete)
        
        if user_email and tree_id:
            await self.log_audit(tree_id, "DELETE", user_email, f"Deleted {name}", target_node_id=node_id)
            
        return True

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
        # Return ALL trees for visibility
        try:
            # Query all trees
            all_trees = await asyncio.to_thread(lambda: list(self.tree_ref.stream()))
            
            trees = []
            for doc in all_trees:
                data = doc.to_dict()
                # Handle timestamp safely
                ts = data.get("createdTime")
                time_str = ts.isoformat() if hasattr(ts, 'isoformat') else str(ts)
                
                # Check if user is a member in this tree
                nodes = data.get("nodes", {})
                is_member = False
                for node in nodes.values():
                    # Check email case-insensitively
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
            name = node.get("name", "").lower()
            is_match = False
            
            # Exact or Substring match
            if query in name:
                is_match = True
            # Fuzzy match for typos
            elif len(query) > 3 and difflib.SequenceMatcher(None, query, name).ratio() > 0.7:
                is_match = True

            if is_match:
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

    async def find_relationship(self, node_id_1, node_id_2):
        """
        Finds the shortest path between two people in the family tree.
        Returns a list of people in the path.
        """
        if not node_id_1 or not node_id_2:
            return None
        
        if node_id_1 == node_id_2:
            return "Same person"

        # 1. Fetch ALL nodes to build graph (expensive but necessary for global path)
        # Optimization: Caching? For now, raw fetch.
        docs = await asyncio.to_thread(lambda: list(self.people_ref.stream()))
        
        graph = {}
        nodes_map = {}
        
        for doc in docs:
            data = doc.to_dict()
            nid = data.get("nodeId")
            nodes_map[nid] = data
            
            if nid not in graph: graph[nid] = set()
            
            # Parent <-> Child
            pid = data.get("parentId")
            if pid:
                if pid not in graph: graph[pid] = set()
                graph[pid].add(nid)
                graph[nid].add(pid)
            
            # Spouse <-> Spouse
            for sid in data.get("spouseIds", []):
                if sid not in graph: graph[sid] = set()
                graph[sid].add(nid)
                graph[nid].add(sid)
                
            # Children <-> Parent (redundant if parentId set, but good for completeness)
            for cid in data.get("childrenIds", []):
                if cid not in graph: graph[cid] = set()
                graph[cid].add(nid)
                graph[nid].add(cid)

        # 2. BFS
        queue = [[node_id_1]]
        visited = {node_id_1}
        
        while queue:
            path = queue.pop(0)
            node = path[-1]
            
            if node == node_id_2:
                # Path found! Enrich it.
                enriched_path = []
                for idx, path_nid in enumerate(path):
                    node_data = nodes_map.get(path_nid, {})
                    step = {
                        "nodeId": path_nid,
                        "name": node_data.get("name", "Unknown"),
                        "gender": node_data.get("gender"),
                    }
                    
                    # Describe relationship to NEXT node
                    if idx < len(path) - 1:
                        next_nid = path[idx + 1]
                        # Determine relation
                        if node_data.get("parentId") == next_nid:
                            step["relationshipToNext"] = "Child of"
                        elif next_nid in node_data.get("childrenIds", []):
                             children = node_data.get("childrenIds", [])
                             # Determine birth order (assuming childrenIds is sorted by birth, or we should sort by DOB if available)
                             # Since childrenIds is usually Append-only or sorted by frontend, we'll trust order or try to sort by DOB from nodes_map?
                             # Let's try to sort siblings by DOB if available.
                             siblings_data = [nodes_map.get(cid) for cid in children if nodes_map.get(cid)]
                             
                             # Sort by DOB (if available), then by creation time or whatever
                             def get_dob(d):
                                 return d.get("dob") or "9999-99-99"
                             
                             siblings_data.sort(key=get_dob)
                             sorted_ids = [d["nodeId"] for d in siblings_data]
                             
                             try:
                                 rank = sorted_ids.index(next_nid) + 1
                                 total = len(sorted_ids)
                                 
                                 next_node_data = nodes_map.get(next_nid, {})
                                 next_gender = next_node_data.get("gender")
                                 
                                 # Gender specific rank
                                 same_gender_siblings = [s for s in siblings_data if s.get("gender") == next_gender]
                                 same_gender_ids = [s["nodeId"] for s in same_gender_siblings]
                                 gender_rank = same_gender_ids.index(next_nid) + 1
                                 total_gender = len(same_gender_ids)
                                 
                                 step["birthOrder"] = {
                                     "rank": rank,
                                     "total": total,
                                     "genderRank": gender_rank,
                                     "totalGender": total_gender
                                 }
                                 
                                 step["relationshipToNext"] = "Parent of" 
                                 if node_data.get("gender") == "male": step["relationshipToNext"] = "Father of"
                                 elif node_data.get("gender") == "female": step["relationshipToNext"] = "Mother of"
                                 
                                 # Add readable string for LLM
                                 ordinal = lambda n: "%d%s" % (n,"tsnrhtdd"[(n//10%10!=1)*(n%10<4)*n%10::4])
                                 gender_noun = "son" if next_gender == "male" else ("daughter" if next_gender == "female" else "child")
                                 step["relationshipDetail"] = f"{ordinal(gender_rank)} {gender_noun} (out of {total_gender})"
                                 
                             except ValueError:
                                 pass # Should not happen if data consistent
                        elif next_nid in node_data.get("spouseIds", []):
                             step["relationshipToNext"] = "Spouse of"
                             if node_data.get("gender") == "male": step["relationshipToNext"] = "Husband of"
                             elif node_data.get("gender") == "female": step["relationshipToNext"] = "Wife of"
                        else:
                            step["relationshipToNext"] = "Related to"
                            
                    enriched_path.append(step)
                return enriched_path
            
            for neighbor in graph.get(node, []):
                if neighbor not in visited:
                    visited.add(neighbor)
                    new_path = list(path)
                    new_path.append(neighbor)
                    queue.append(new_path)
                    
        return None # No path found
        doc = await asyncio.to_thread(self.people_ref.document(node_id).get)
        if not doc.exists: return None
        
        data = doc.to_dict()
        
        # Enrich with related names for LLM readability
        ids_to_fetch = []
        if data.get("parentId"): ids_to_fetch.append(data.get("parentId"))
        if data.get("spouseIds"): ids_to_fetch.extend(data.get("spouseIds"))
        if data.get("childrenIds"): ids_to_fetch.extend(data.get("childrenIds"))
        
        ids_to_fetch = list(set(ids_to_fetch))
        
        if ids_to_fetch:
            # Batch fetch related nodes to get names
            refs = [self.people_ref.document(nid) for nid in ids_to_fetch]
            try:
                 # Run get_all in thread
                snapshots = await asyncio.to_thread(lambda: list(self.db.get_all(refs)))
                id_map = {d.id: d.to_dict().get("name", "Unknown") for d in snapshots if d.exists}
                
                data["relatedNames"] = {
                    "parent": id_map.get(data.get("parentId")),
                    "spouses": [id_map.get(sid) for sid in data.get("spouseIds", []) if sid in id_map],
                    "children": [id_map.get(cid) for cid in data.get("childrenIds", []) if cid in id_map]
                }
            except Exception as e:
                logger.error(f"Failed to fetch related names: {e}")
                
        return data

    async def add_person(self, name, gender, relation, anchor_node_id, tree_id, **kwargs):
        new_id = str(uuid.uuid4())
        
        # If anchor_node_id is provided, verify it exists and get tree_id
        if anchor_node_id:
            anchor_doc = await asyncio.to_thread(self.people_ref.document(anchor_node_id).get)
            if not anchor_doc.exists:
                return None, "Anchor node not found"
            
            # If tree_id not explicitly passed, inherit from anchor
            if not tree_id:
                tree_id = anchor_doc.to_dict().get("treeId")

        # --- Name Translation Logic ---
        name_translations = {}
        try:
            translator = Translator()
            target_langs = ['kn', 'hi', 'ta', 'te', 'ml']
            # Run translation in thread to avoid blocking loop
            # googletrans is sync
            def do_translate():
                results = {}
                for lang in target_langs:
                    try:
                        res = translator.translate(name, dest=lang)
                        if res and res.text:
                            results[lang] = res.text
                    except Exception as e:
                        logger.warning(f"Translation failed for {lang}: {e}")
                return results

            name_translations = await asyncio.to_thread(do_translate)
            logger.info(f"Generated translations for {name}: {name_translations}")
        except Exception as e:
            logger.error(f"Global translation error: {e}")
        # -----------------------------

        new_node = {
            "nodeId": new_id,
            "treeId": tree_id, 
            "name": name,
            "gender": gender,
            "nameTranslations": name_translations,
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
            elif "brother" in rel or "sister" in rel or "sibling" in rel:
                # Sibling logic: Find anchor's parent
                anchor_data = anchor_doc.to_dict()
                existing_parent_id = anchor_data.get("parentId")
                
                if existing_parent_id:
                    # Anchor has a parent, add new node as child of that parent
                    new_node["parentId"] = existing_parent_id
                    batch.update(self.people_ref.document(existing_parent_id), {
                        "childrenIds": firestore.ArrayUnion([new_id])
                    })
                else:
                    # Anchor has no parent, create a placeholder "Unknown Parent"
                    parent_id = str(uuid.uuid4())
                    parent_node = {
                        "nodeId": parent_id,
                        "treeId": tree_id,
                        "name": "Unknown Parent",
                        "gender": "male", # Default or infer? Safe default.
                        "parentId": None,
                        "spouseIds": [],
                        "childrenIds": [anchor_node_id, new_id],
                        "lastUpdated": firestore.SERVER_TIMESTAMP
                    }
                    batch.set(self.people_ref.document(parent_id), parent_node)
                    
                    # Update anchor to point to new parent
                    batch.update(self.people_ref.document(anchor_node_id), {"parentId": parent_id})
                    
                    # New node points to new parent
                    new_node["parentId"] = parent_id
            
        batch.set(self.people_ref.document(new_id), new_node)
        await asyncio.to_thread(batch.commit)

        # Log the addition
        user_email = kwargs.get("user_email") # Ensure user_email is passed to add_person or available
        if user_email: 
            await self.log_audit(tree_id, "ADD", user_email, f"Added {name}", details=new_node, target_node_id=new_id)

        return new_node, None
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

        if "location" in updates:
            loc_update = updates["location"]
            if isinstance(loc_update, dict):
                 existing_loc = current_data.get("location") or {}
                 updates["location"] = {**existing_loc, **loc_update}

        updates["lastUpdated"] = firestore.SERVER_TIMESTAMP
        await asyncio.to_thread(doc_ref.update, updates)
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
        
        # Fallback: If not found by ID, try searching by treeId field
        if not tree_doc.exists:
             logger.warning(f"Tree document {tree_id} not found by key. Trying field lookup...")
             # Query where treeId == tree_id
             # Note: limit(1).get() returns a generator of snapshots
             query = self.tree_ref.where("treeId", "==", tree_id).limit(1)
             docs = await asyncio.to_thread(lambda: list(query.stream()))
             if docs:
                 tree_doc = docs[0]
             else:
                 logger.warning(f"Tree {tree_id} not found by key or field")
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
            # Filter by treeId (field)
            results_by_id = list(self.people_ref.where('treeId', '==', tree_id).select(field_mask).stream())
            
            # If the Document Key differs from the tree_id field (e.g. legacy/sample tree),
            # check if nodes are linked by the Document Key instead.
            doc_key = tree_doc.id 
            if doc_key != tree_id:
                logger.info(f"🔎 Checking for nodes linked by Document Key: {doc_key}")
                results_by_key = list(self.people_ref.where('treeId', '==', doc_key).select(field_mask).stream())
                if results_by_key:
                    logger.info(f"✅ Found {len(results_by_key)} nodes linked by Key. Merging...")
                    # Combine and deduplicate by nodeId
                    seen = set(d.get('nodeId') for d in results_by_id)
                    for d in results_by_key:
                         # Snapshot to dict handled later? No, select() returns snapshots.
                         # We deal with snapshots here.
                         data = d.to_dict()
                         if data.get('nodeId') not in seen:
                             results_by_id.append(d)
                             seen.add(data.get('nodeId'))
            return results_by_id

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

    async def execute(self, name, args, user_email=None):
        logger.info(f"🛠️ Executing Firestore-backed tool: {name}({args}) for {user_email}")

        # Permission Check for Write Operations
        WRITE_TOOLS = ["add_person", "update_person", "delete_person", "save_node", "create_tree"]
        ALLOWED_EDITORS = ["narasimhapbhat@gmail.com", "padmarajbhat@gmail.com"]

        if name in WRITE_TOOLS:
            if not user_email:
                 # If no user context, DENY by default for safety (or allow if system/admin? We assume Live needs auth)
                 return {"status": "error", "message": "Authentication required for updates"}
            
            if user_email.lower() not in [e.lower() for e in ALLOWED_EDITORS]:
                logger.warning(f"⛔ PERMISSION DENIED: {user_email} tried to call {name}")
                return {"status": "error", "message": f"Permission Denied: You ({user_email}) are not authorized to make changes."}

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
                args.get("tree_id"),
                phone=args.get("phone"),
                email=args.get("email"),
                dob=args.get("dob"),
                user_email=user_email
            )
            # Add audit log for add_person (harder since we don't have diff or user_email easily here without kwargs update)
            # Ideally user_email is passed to execute.
            if user_email and not err:
                 pass # TODO: Add log_audit call here cleanly or inside add_person using passed email
            
            if err: return {"status": "error", "message": err}
            return {"status": "success", "message": f"Added {args.get('name')}", "nodeId": node_id}
        
        elif name == "update_person":
            success = await self.store.update_person(args.get("node_id"), args.get("updates", {}))
            return {"status": "success", "message": "Updated"} if success else {"status": "error", "message": "Failed"}
        
        elif name == "save_node":
            # Pass user_email to save_node for audit logging
            node_id, err = await self.store.save_node(args.get("node"), user_email=user_email)
            if err: return {"status": "error", "message": err}
            return {"status": "success", "nodeId": node_id}

        elif name == "delete_person":
            # Pass user_email to delete_person for audit logging
            success = await self.store.delete_person(args.get("node_id"), user_email=user_email)
            return {"status": "success"} if success else {"status": "error", "message": "Failed"}

        elif name == "create_tree":
            tree_id = await self.store.create_tree(args.get("name"), args.get("owner"))
            return {"status": "success", "treeId": tree_id, "message": f"Created tree {args.get('name')}"}

        elif name == "get_history":
            logs = await self.store.get_history_logs(
                args.get("treeId"), 
                limit=args.get("limit", 50),
                node_id=args.get("nodeId") # Support filtering
            )
            return {"status": "success", "logs": logs}

        return {"status": "error", "message": "Unknown tool"}

    async def get_full_tree(self, tree_id):
        return await self.store.get_full_tree(tree_id)

    async def list_trees(self, email):
        return await self.store.list_trees(email)

    async def create_tree(self, name, owner):
        return await self.store.create_tree(name, owner)

# Global singleton instance (defined after class)
SHARED_STORE = FamilyTreeStore()
