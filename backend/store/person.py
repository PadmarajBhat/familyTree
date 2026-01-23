import logging
import asyncio
import uuid
import difflib
from google.cloud import firestore
from googletrans import Translator

logger = logging.getLogger(__name__)

class PersonMixin:
    async def get_person_details(self, node_id):
        if not node_id: return None
        doc = await asyncio.to_thread(self.people_ref.document(node_id).get)
        if doc.exists:
            return doc.to_dict()
        return None

    async def save_node(self, node, user_email=None):
        node_id = node.get("nodeId")
        if not node_id: return None, "Node ID required"
        
        doc_ref = self.people_ref.document(node_id)
        doc = await asyncio.to_thread(doc_ref.get)
        
        diff = {}
        action = "ADD"
        
        if doc.exists:
            action = "EDIT"
            existing = doc.to_dict()
            check_fields = ["name", "gender", "dob", "dod", "occupation", "education", "phone", "email", "address"]
            for field in check_fields:
                old_val = existing.get(field)
                new_val = node.get(field)
                if str(old_val) != str(new_val):
                     diff[field] = {"old": old_val, "new": new_val}
        
        node["lastUpdated"] = firestore.SERVER_TIMESTAMP
        if user_email:
             node["editedBy"] = user_email
             
        await asyncio.to_thread(doc_ref.set, node, merge=True)
        
        if user_email: 
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

    async def update_person(self, node_id, updates):
        doc_ref = self.people_ref.document(node_id)
        doc = await asyncio.to_thread(doc_ref.get)
        if not doc.exists: return False
        
        current_data = doc.to_dict()
        if "address" in updates:
            addr_update = updates["address"]
            if isinstance(addr_update, str):
                updates["address"] = {
                    "freeform": addr_update,
                    "city": current_data.get("address", {}).get("city", ""),
                    "state": current_data.get("address", {}).get("state", ""),
                    "country": current_data.get("address", {}).get("country", "")
                }
            elif isinstance(addr_update, dict):
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

    async def search(self, query, tree_id=None):
        query = query.lower()
        results = []
        
        # Optimize: Filter by tree_id if provided
        if tree_id:
            search_ids = [tree_id]
            if str(tree_id).isdigit():
                search_ids.append(int(tree_id))
            search_ids = list(set(search_ids))
            # Find people in this tree
            docs_stream = self.people_ref.where('treeId', 'in', search_ids).stream()
            docs = await asyncio.to_thread(list, docs_stream)
        else:
            # Fallback to full scan (avoid if possible)
            docs = await asyncio.to_thread(lambda: list(self.people_ref.stream()))
        
        id_to_name = {}
        all_nodes = []
        for doc in docs:
            data = doc.to_dict()
            id_to_name[data.get("nodeId")] = data.get("name", "Unknown")
            all_nodes.append(data)

        for node in all_nodes:
            name = node.get("name", "").lower()
            is_match = False
            
            if query in name:
                is_match = True
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
                    "treeId": node.get("treeId"),
                    # Placeholder, properly populated below
                    "treeName": "Unknown Tree" 
                })

        # Populate Tree Names
        tree_ids = list(set([r["treeId"] for r in results if r.get("treeId")]))
        tree_names_map = {}
        
        if tree_ids:
            # Check if we have a way to batch fetch. Doc IDs usually match treeId.
            # We try to fetch by ID first.
            refs = [self.tree_ref.document(str(tid)) for tid in tree_ids]
            if refs:
                 snapshots = await asyncio.to_thread(self.db.get_all, refs)
                 for snap in snapshots:
                     if snap.exists:
                         tree_names_map[snap.id] = snap.to_dict().get("treeName", "Unknown Tree")
            
            # For any missing ones (e.g. integer mismatch or field mismatch), try query
            missing_ids = [tid for tid in tree_ids if str(tid) not in tree_names_map]
            for tid in missing_ids:
                try:
                    q = self.tree_ref.where("treeId", "==", tid).limit(1)
                    docs = await asyncio.to_thread(lambda: list(q.stream()))
                    if docs:
                        tree_names_map[tid] = docs[0].to_dict().get("treeName", "Unknown Tree")
                except Exception:
                    pass

        # Apply names
        for r in results:
            tid = r.get("treeId")
            # Try both string and raw match
            name = tree_names_map.get(str(tid)) or tree_names_map.get(tid)
            if name:
                r["treeName"] = name

        return results

    async def add_person(self, name=None, gender=None, relation=None, anchor_node_id=None, tree_id=None, **kwargs):
        # Support treeId from kwargs if tree_id arg is None
        if not tree_id:
             tree_id = kwargs.get("treeId")
        
        # Support other fields from both camelCase and snake_case
        name = name or kwargs.get("name")
        gender = gender or kwargs.get("gender")
        relation = relation or kwargs.get("relation")
        anchor_node_id = anchor_node_id or kwargs.get("anchor_node_id") or kwargs.get("anchorNodeId")

        logger.info(f"➕ add_person called: name={name}, anchor={anchor_node_id}, tree_id={tree_id}")

        new_id = str(uuid.uuid4())
        
        if anchor_node_id:
            anchor_doc = await asyncio.to_thread(self.people_ref.document(anchor_node_id).get)
            if not anchor_doc.exists: return None, "Anchor node not found"
            if not tree_id:
                tree_id = anchor_doc.to_dict().get("treeId")
        
        if not tree_id:
            logger.error("❌ Failed to add person: tree_id is Missing!")
            return None, "tree_id is required when creating a root/unlinked node"

        name_translations = {}
        try:
            translator = Translator()
            target_langs = ['kn', 'hi', 'ta', 'te', 'ml']
            def do_translate():
                results = {}
                for lang in target_langs:
                    try:
                        res = translator.translate(name, dest=lang)
                        if res and res.text: results[lang] = res.text
                    except Exception: pass
                return results
            name_translations = await asyncio.to_thread(do_translate)
        except Exception as e:
            logger.error(f"Global translation error: {e}")

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
                anchor_data = anchor_doc.to_dict()
                existing_parent_id = anchor_data.get("parentId")
                if existing_parent_id:
                    new_node["parentId"] = existing_parent_id
                    batch.update(self.people_ref.document(existing_parent_id), {
                        "childrenIds": firestore.ArrayUnion([new_id])
                    })
                else:
                    parent_id = str(uuid.uuid4())
                    parent_node = {
                        "nodeId": parent_id,
                        "treeId": tree_id,
                        "name": "Unknown Parent",
                        "gender": "male",
                        "parentId": None,
                        "spouseIds": [],
                        "childrenIds": [anchor_node_id, new_id],
                        "lastUpdated": firestore.SERVER_TIMESTAMP
                    }
                    batch.set(self.people_ref.document(parent_id), parent_node)
                    batch.update(self.people_ref.document(anchor_node_id), {"parentId": parent_id})
                    new_node["parentId"] = parent_id
            
        batch.set(self.people_ref.document(new_id), new_node)
        await asyncio.to_thread(batch.commit)

        user_email = kwargs.get("user_email")
        if user_email: 
            await self.log_audit(tree_id, "ADD", user_email, f"Added {name}", details=new_node, target_node_id=new_id)

        return new_node, None

    async def find_relationship(self, node_id_1, node_id_2):
        if not node_id_1 or not node_id_2: return None
        if node_id_1 == node_id_2: return "Same person"

        docs = await asyncio.to_thread(lambda: list(self.people_ref.stream()))
        graph = {}
        nodes_map = {}
        
        for doc in docs:
            data = doc.to_dict()
            nid = data.get("nodeId")
            nodes_map[nid] = data
            if nid not in graph: graph[nid] = set()
            
            pid = data.get("parentId")
            if pid:
                if pid not in graph: graph[pid] = set()
                graph[pid].add(nid)
                graph[nid].add(pid)
            
            for sid in data.get("spouseIds", []):
                if sid not in graph: graph[sid] = set()
                graph[sid].add(nid)
                graph[nid].add(sid)
                
            for cid in data.get("childrenIds", []):
                if cid not in graph: graph[cid] = set()
                graph[cid].add(nid)
                graph[nid].add(cid)

        queue = [[node_id_1]]
        visited = {node_id_1}
        
        while queue:
            path = queue.pop(0)
            node = path[-1]
            if node == node_id_2:
                enriched_path = []
                for idx, path_nid in enumerate(path):
                    node_data = nodes_map.get(path_nid, {})
                    step = {
                        "nodeId": path_nid,
                        "name": node_data.get("name", "Unknown"),
                        "gender": node_data.get("gender"),
                    }
                    if idx < len(path) - 1:
                        next_nid = path[idx + 1]
                        if node_data.get("parentId") == next_nid:
                            step["relationshipToNext"] = "Child of"
                        elif next_nid in node_data.get("childrenIds", []):
                             step["relationshipToNext"] = "Parent of"
                        elif next_nid in node_data.get("spouseIds", []):
                             step["relationshipToNext"] = "Spouse of"
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
                    
        return None
