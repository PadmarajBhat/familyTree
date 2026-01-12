import asyncio
import json
import traceback
import logging
from websockets.exceptions import ConnectionClosed
from .auth import generate_access_token
from .auth import generate_access_token
from .proxy_utils import create_proxy
from tools_handler import ToolsHandler, FamilyTreeStore, SHARED_STORE
from .connection_pool import GEMINI_POOL

logger = logging.getLogger(__name__)

async def handle_websocket_client(client_websocket) -> None:
    """Handles a new WebSocket client connection using the asyncio API."""
    print(f"🔌 New WebSocket client connection from {client_websocket.remote_address}")
    try:
        # Wait for the initial setup message
        print("Waiting for setup message...")
        try:
            service_setup_message = await asyncio.wait_for(client_websocket.recv(), timeout=10.0)
            print(f"Received setup message: {service_setup_message}")
        except asyncio.TimeoutError:
            print("⏳ Connection timed out waiting for setup message")
            logger.info("⏳ Connection timed out waiting for setup message")
            if client_websocket.open:
                await client_websocket.close(code=1008, reason="Timeout")
            return

        setup_data = json.loads(service_setup_message)
        token = setup_data.get("bearer_token")
        url = setup_data.get("service_url")

        # Handle "System/Admin" mode (e.g. fetching tree data)
        if url == "dummy" and token == "dummy": # Admin mode
            logger.info("🌲 Client in Administrative mode (fetching tree data)")
            store = SHARED_STORE
            tools = ToolsHandler(store)
            logger.info("🌲 Client in Administrative mode (start)")
            
            # Simple loop to handle admin commands
            try:
                # The recv() method raises ConnectionClosed when the connection is lost
                while True:
                    logger.info("waiting for next message...")
                    message = await client_websocket.recv()
                    logger.info(f"Received message payload: {message}")
                    data = json.loads(message)
                    if data.get("type") == "GET_TREE":
                        tree_id = data.get("treeId")
                        logger.info(f"🌲 Fetching full tree from Firestore (TreeID: {tree_id})")
                        full_tree, err = await tools.get_full_tree(tree_id)
                        if full_tree:
                            logger.info(f"🌲 Tree fetched, sending {len(full_tree.get('nodes', {}))} nodes...")
                            await client_websocket.send(json.dumps({
                                "type": "TREE_DATA",
                                "data": full_tree
                            }))
                            logger.info("🌲 Tree sent success")
                        else:
                            await client_websocket.send(json.dumps({
                                "type": "ERROR",
                                "message": err or "Tree not found"
                            }))
                    elif data.get("type") == "GET_PREFS":
                        email = data.get("email")
                        logger.info(f"⚙️ Fetching preferences for {email}")
                        prefs = await store.get_user_preferences(email)
                        await client_websocket.send(json.dumps({
                            "type": "PREFS_DATA",
                            "data": prefs
                        }))
                    elif data.get("type") == "SAVE_PREFS":
                        email = data.get("email")
                        prefs = data.get("prefs", {})
                        logger.info(f"⚙️ Saving preferences for {email}: {prefs}")
                        await store.save_user_preferences(email, prefs)
                        # Optionally confirm save
                        await client_websocket.send(json.dumps({
                             "type": "PREFS_SAVED"
                        }))
                        logger.info("🌲 Tree sent success")
                    elif data.get("type") == "FIND_MY_TREES":
                        email = data.get("email")
                        logger.info(f"🔍 Searching trees for user: {email}")
                        trees = await store.list_trees(email)
                        logger.info(f"🔍 Found {len(trees)} trees")
                        await client_websocket.send(json.dumps({
                            "type": "MY_TREES_FOUND",
                            "trees": trees
                        }))
                    elif data.get("type") == "CREATE_TREE":
                        name = data.get("name")
                        owner = data.get("owner")
                        logger.info(f"🌱 Creating tree '{name}' for {owner}")
                        try:
                            tree_id = await store.create_tree(name, owner)
                            await client_websocket.send(json.dumps({
                                "type": "TREE_CREATED",
                                "treeId": tree_id,
                                "name": name
                            }))
                        except Exception as e:
                            logger.error(f"Failed to create tree: {e}")
                            await client_websocket.send(json.dumps({
                                "type": "ERROR",
                                "message": f"Failed to create tree: {str(e)}"
                            }))
                    elif data.get("type") == "SAVE_NODE":
                        logger.info("💾 Saving node...")
                        try:
                            res = await tools.execute("save_node", {"node": data.get("node")})
                            if res["status"] == "success":
                                await client_websocket.send(json.dumps({
                                    "type": "NODE_SAVED",
                                    "nodeId": res["nodeId"]
                                }))
                            else:
                                await client_websocket.send(json.dumps({
                                    "type": "ERROR",
                                    "message": res["message"]
                                }))
                        except Exception as e:
                            logger.error(f"Failed to save node: {e}")
                            await client_websocket.send(json.dumps({
                                "type": "ERROR",
                                "message": str(e)
                            }))
                    elif data.get("type") == "DELETE_NODE":
                        logger.info(f"🗑️ Deleting node {data.get('nodeId')}...")
                        try:
                            res = await tools.execute("delete_person", {"node_id": data.get("nodeId")})
                            if res["status"] == "success":
                                await client_websocket.send(json.dumps({
                                    "type": "NODE_DELETED",
                                    "nodeId": data.get("nodeId")
                                }))
                            else:
                                await client_websocket.send(json.dumps({
                                    "type": "ERROR",
                                    "message": res["message"]
                                }))
                        except Exception as e:
                            logger.error(f"Failed to delete node: {e}")
                            await client_websocket.send(json.dumps({
                                "type": "ERROR",
                                "message": str(e)
                            }))
            except ConnectionClosed as e:
                logger.info(f"👋 Admin client connection closed: {e}")
            except Exception as e:
                logger.info(f"⚠️ Error in admin loop: {e}")
                import traceback
                traceback.print_exc()
            return

        # Handle "Proxy" mode (Gemini Live)
        if not token:
            logger.info("🔑 Generating access token...")
            token = generate_access_token()
            if not token:
                if client_websocket.open:
                    await client_websocket.close(code=1008, reason="Authentication failed")
                return
        
        # Try to get a warmed-up connection
        server_ws = await GEMINI_POOL.get_connection()
        if server_ws:
             logger.info("⚡ Using warmed connection!")
             # Trigger replenishment task in background
             await GEMINI_POOL.replenish() 

        user_email = setup_data.get("user_email")
        if user_email:
            logger.info(f"👤 Proxying for user: {user_email}")

        await create_proxy(client_websocket, token, url, server_websocket=server_ws, user_email=user_email)

    except json.JSONDecodeError:
        print("❌ Invalid JSON received from client")
        if client_websocket.open:
            await client_websocket.close(code=1008, reason="Invalid JSON")
    except Exception as e:
        print(f"❌ Error handling client: {e}")
        if client_websocket.open:
            await client_websocket.close(code=1011, reason="Internal error")
