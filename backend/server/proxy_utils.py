import asyncio
import json
import ssl
import certifi
import os
import websockets
import logging
from websockets.exceptions import ConnectionClosed
from tools_handler import ToolsHandler, FamilyTreeStore

logger = logging.getLogger(__name__)

DEBUG = os.getenv("DEBUG", "false").lower() == "true"

async def proxy_task(
    source_websocket,
    destination_websocket,
    is_server: bool,
    tools_handler: ToolsHandler = None
) -> None:
    source_name = "SERVER" if is_server else "CLIENT"
    dest_name = "CLIENT" if is_server else "SERVER"
    audio_chunk_count = 0
    
    try:
        async for message in source_websocket:
            try:
                try:
                    data = json.loads(message)
                    
                    if not is_server: # Client -> Server
                        if "realtime_input" in data:
                            audio_chunk_count += 1
                            if audio_chunk_count % 50 == 0:
                                logger.info(f"📤 {source_name} -> {dest_name}: Sent {audio_chunk_count} audio chunks...")
                        elif data.get("type") == "GET_TREE":
                            logger.info(f"🌲 {source_name} -> {source_name}: Fetching full tree from Firestore")
                            if tools_handler:
                                # We'll need a way to get the full tree from the store
                                full_tree = await tools_handler.get_full_tree()
                                await source_websocket.send(json.dumps({
                                    "type": "TREE_DATA",
                                    "data": full_tree
                                }))
                            continue # Don't forward to Gemini
                        elif "client_content" in data:
                            logger.info(f"💬 {source_name} -> {dest_name}: Text/Content sent")
                        else:
                            logger.info(f"📦 {source_name} -> {dest_name}: {list(data.keys())}")
                    
                    else: # Server -> Client
                        if "serverContent" in data:
                            sc = data["serverContent"]
                            if "modelTurn" in sc:
                                parts = sc["modelTurn"].get("parts", [])
                                for p in parts:
                                    if "inlineData" in p:
                                        # Audio parts are frequent, log sparingly or debug level if desired
                                        # logger.debug(f"🔊 {source_name} -> {dest_name}: Audio response part")
                                        pass 
                                    if "text" in p:
                                        logger.info(f"📝 {source_name} -> {dest_name}: Text response: {p['text'][:50]}...")
                                    if "functionCall" in p:
                                        logger.info(f"🛠️ {source_name} -> {dest_name}: Tool Call: {p['functionCall']['name']}({p['functionCall'].get('args', {})})")
                            if "inputTranscription" in sc:
                                logger.info(f"🎤 {source_name} -> {dest_name}: User Transcription: {sc['inputTranscription'].get('text')}")
                            if "outputTranscription" in sc:
                                text = sc["outputTranscription"].get("text")
                                if text:
                                    logger.info(f"🗣️ {source_name} -> {dest_name}: Bot Transcription: {text}")
                            if sc.get("turnComplete"):
                                logger.info(f"🏁 {source_name} -> {dest_name}: Turn Complete")
                        elif "setupComplete" in data:
                            logger.info(f"✅ {source_name} -> {dest_name}: Setup Complete")
                        elif "toolCall" in data or "tool_call" in data:
                            tc_key = "toolCall" if "toolCall" in data else "tool_call"
                            tc = data[tc_key]
                            logger.info(f"🐛 DEBUG ToolCall Payload: {tc}")
                            
                            # Forward the tool call to the client so UI can show it
                            await destination_websocket.send(json.dumps(data))
                            
                            calls = tc.get("functionCalls") or tc.get("function_calls") or []
                            for call in calls:
                                logger.info(f"🛠️ {source_name} -> {dest_name}: Intercepting Tool Call: {call['name']} (ID: {call.get('id')})")
                                if tools_handler:
                                    result = await tools_handler.execute(call['name'], call.get('args', {}))
                                    
                                    # Gemini requires the 'id' to match the response to the request
                                    function_response = {
                                        "name": call['name'],
                                        "response": result
                                    }
                                    if "id" in call:
                                        function_response["id"] = call["id"]
                                        
                                    resp_msg = {
                                        "tool_response": {
                                            "function_responses": [function_response]
                                        }
                                    }
                                    logger.info(f"✅ {dest_name} -> {source_name}: Sending Tool Response")
                                    # Use 'default=str' to handle datetime/UUID serialization automatically
                                    await source_websocket.send(json.dumps(resp_msg, default=str))
                                    
                                    if call['name'] in ["add_person", "update_person"]:
                                        logger.info(f"📢 {dest_name} -> {dest_name}: Notifying Client of update")
                                        await destination_websocket.send(json.dumps({"type": "TREE_UPDATED"}))
                            continue
                        else:
                            logger.info(f"📦 {source_name} -> {dest_name}: {list(data.keys())} - {str(data)[:200]}...")
                
                except Exception as e:
                    if DEBUG:
                        logger.error(f"Proxying from {source_name}: (Binary/Non-JSON or Error: {e})")
                
                await destination_websocket.send(message)
            except Exception as e:
                logger.error(f"Error forwarding message: {e}")
    except ConnectionClosed as e:
        logger.info(f"{source_name} connection closed: {e.code} - {e.reason}")
    except Exception as e:
        logger.error(f"Unexpected error in proxy_task for {source_name}: {e}")
    finally:
        await destination_websocket.close()

async def create_proxy(
    client_websocket, bearer_token: str, service_url: str, server_websocket=None
) -> None:
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {bearer_token}",
    }
    ssl_context = ssl.create_default_context(cafile=certifi.where())
    
    async def run_proxy(ws):
        store = FamilyTreeStore()
        tools = ToolsHandler(store)

        client_to_server_task = asyncio.create_task(proxy_task(client_websocket, ws, is_server=False))
        server_to_client_task = asyncio.create_task(proxy_task(ws, client_websocket, is_server=True, tools_handler=tools))

        done, pending = await asyncio.wait([client_to_server_task, server_to_client_task], return_when=asyncio.FIRST_COMPLETED)
        for task in pending:
            task.cancel()
            try: await task
            except asyncio.CancelledError: pass
            
    try:
        if server_websocket:
             logger.info(f"✅ Using pre-warmed connection to Gemini API")
             await run_proxy(server_websocket)
             try: await server_websocket.close()
             except: pass
             try: await client_websocket.close()
             except: pass
        else:
            logger.info(f"Connecting to Gemini API...")
            async with websockets.connect(service_url, additional_headers=headers, ssl=ssl_context) as ws:
                logger.info(f"✅ Connected to Gemini API")
                await run_proxy(ws)
                try: await client_websocket.close()
                except: pass

    except ConnectionClosed as e:
        logger.error(f"Server connection closed unexpectedly: {e.code} - {e.reason}")
        if client_websocket.open:
            await client_websocket.close(code=e.code, reason=e.reason)
    except Exception as e:
        logger.error(f"Failed to connect to Gemini API: {e}")
        if client_websocket.open:
            await client_websocket.close(code=1008, reason="Upstream connection failed")
