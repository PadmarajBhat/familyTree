import logging
from store.base import BaseStore
from store.audit import AuditMixin
from store.chat import ChatMixin
from store.user import UserMixin
from store.tree import TreeMixin
from store.person import PersonMixin

logger = logging.getLogger(__name__)

class FamilyTreeStore(BaseStore, AuditMixin, ChatMixin, UserMixin, TreeMixin, PersonMixin):
    """
    Main Store class that composes all functionality via Mixins.
    Refactored to split logic into backend/store/*.py
    """
    def __init__(self):
        super().__init__()

# Singleton instance
SHARED_STORE = FamilyTreeStore()

class ToolsHandler:
    def __init__(self, store: FamilyTreeStore):
        self.store = store

    async def get_full_tree(self, tree_id="default"):
        res = await self.store.get_full_tree(tree_id)
        logger.info(f"DEBUG: store.get_full_tree returned type {type(res)}")
        # Check if it's a tuple
        if isinstance(res, tuple) and len(res) == 2:
             tree, error = res
        else:
             # Fallback if it returns just tree (dict)
             # This should not happen if store/tree.py is correct, but handles the zombie file case
             tree, error = res, None
        
        if error:
            logger.error(f"Failed to get tree: {error}")
            return None
        logger.info(f"🌳 ToolsHandler returning tree data with keys: {list(tree.keys()) if tree else 'None'}")
        return tree

    async def execute(self, tool_name, args, user_email=None):
        logger.info(f"🔧 Executing tool: {tool_name} with args: {args}")
        try:
            if tool_name == "get_person_details":
                return await self.store.get_person_details(args.get("node_id") or args.get("nodeId"))
            elif tool_name == "add_person":
                node_id, err = await self.store.add_person(**args, user_email=user_email)
                if err: return {"status": "error", "message": err}
                return {"status": "success", "nodeId": node_id}
            elif tool_name == "update_person":
                 success = await self.store.update_person(args.get("node_id") or args.get("nodeId"), args)
                 return {"status": "success"} if success else {"status": "error", "message": "Failed to update"}
            elif tool_name == "delete_person":
                success = await self.store.delete_person(args.get("node_id") or args.get("nodeId"), user_email=user_email)
                return {"status": "success"} if success else {"status": "error", "message": "Failed to delete"}
            elif tool_name == "save_node":
                node_id, err = await self.store.save_node(args.get("node"), user_email=user_email)
                if err: return {"status": "error", "message": err}
                return {"status": "success", "nodeId": node_id}
            elif tool_name == "find_relationship":
                return await self.store.find_relationship(args.get("node_id_1"), args.get("node_id_2"))
            elif tool_name == "search":
                # Pass tree_id to contextually search
                return await self.store.search(args.get("query"), tree_id=args.get("tree_id") or args.get("treeId"))
            # Add other tools as needed
            elif tool_name == "get_full_tree":
                res = await self.store.get_full_tree(args.get("tree_id") or "default")
                if isinstance(res, tuple) and len(res) == 2:
                     t, err = res
                     if err: return {"error": err}
                     return t
                return res # Assume it's the data dict if not tuple
            else:
                logger.warning(f"Unknown tool: {tool_name}")
                return {"error": f"Unknown tool: {tool_name}"}
        except Exception as e:
            logger.error(f"Error executing {tool_name}: {e}")
            return {"status": "error", "message": str(e)}
