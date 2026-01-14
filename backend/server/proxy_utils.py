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
    tools_handler: ToolsHandler = None,
    user_email: str = None
) -> None:
    source_name = "SERVER" if is_server else "CLIENT"
    dest_name = "CLIENT" if is_server else "SERVER"
    audio_chunk_count = 0
    
    current_user_text = ""
    current_model_text = ""
    
    async def flush_logs(reason="Target"):
        nonlocal current_user_text, current_model_text
        if tools_handler and tools_handler.store and user_email:
            if current_user_text.strip():
                logger.info(f"💾 Logging User Turn ({reason}): {current_user_text}")
                asyncio.create_task(tools_handler.store.log_chat(user_email, "user", current_user_text))
                current_user_text = ""
            
            if current_model_text.strip():
                logger.info(f"💾 Logging Model Turn ({reason}): {current_model_text[:50]}...")
                asyncio.create_task(tools_handler.store.log_chat(user_email, "model", current_model_text))
                current_model_text = ""

    try:
        async for message in source_websocket:
            should_forward = True
            try:
                try:
                    data = json.loads(message)
                    
                    if not is_server: # Client -> Server
                        if "realtime_input" in data:
                            audio_chunk_count += 1
                            if audio_chunk_count % 50 == 0:
                                logger.info(f"📤 {source_name} -> {dest_name}: Sent {audio_chunk_count} audio chunks...")
                        elif data.get("type") == "GET_TREE":
                            should_forward = False # Consumed
                            # ... existing GET_TREE logic ...
                            logger.info(f"🌲 {source_name} -> {source_name}: Fetching full tree")
                            if tools_handler:
                                full_tree = await tools_handler.get_full_tree()
                                await source_websocket.send(json.dumps({
                                    "type": "TREE_DATA",
                                    "data": full_tree
                                }))
                            continue # Logic done
                        elif data.get("type") == "GET_CHAT_HISTORY":
                            should_forward = False # Consumed
                            # INTERCEPT: Fetch chat history
                            logger.info(f"📜 {source_name}: Fetching chat history for {user_email}")
                            try:
                                if tools_handler and tools_handler.store and user_email:
                                    history = await tools_handler.store.get_chat_history(user_email)
                                    await source_websocket.send(json.dumps({
                                        "type": "CHAT_HISTORY",
                                        "data": history
                                    }))
                            except Exception as e:
                                logger.error(f"❌ Error fetching chat history: {e}")
                            continue

                        elif "client_content" in data:
                            logger.info(f"💬 {source_name} -> {dest_name}: Text/Content sent")
                        else:
                            logger.info(f"📦 {source_name} -> {dest_name}: {list(data.keys())}")
                    
                    else: # Server -> Client
                        if "serverContent" in data:
                            sc = data["serverContent"]
                            # ... logging logic ...
                            if "modelTurn" in sc:
                                parts = sc["modelTurn"].get("parts", [])
                                for p in parts:
                                    if "text" in p:
                                        # BUFFER: Append Model Text
                                        current_model_text += p['text']
                                        # DEBUG: Uncomment to see partials if needed
                                        # logger.info(f"➕ Accumulating Model Text: {len(current_model_text)} chars")

                            if "inputTranscription" in sc:
                                text = sc['inputTranscription'].get('text')
                                if text:
                                    # BUFFER: Update User Text (keep latest correction)
                                    current_user_text = text

                            if "outputTranscription" in sc:
                                text = sc["outputTranscription"].get("text")
                                if text:
                                    logger.info(f"🗣️ {source_name} -> {dest_name}: Bot Transcription: {text}")
                                    # BUFFER: Use transcription for model text since response_modalities=["AUDIO"]
                                    current_model_text += text

                            if sc.get("turnComplete"):
                                logger.info(f"🏁 {source_name} -> {dest_name}: Turn Complete. Flushing logs...")
                                await flush_logs("TurnComplete")

                        elif "setupComplete" in data:
                            logger.info(f"✅ {source_name} -> {dest_name}: Setup Complete")
                        elif "toolCall" in data or "tool_call" in data:
                             # ... existing tool call logic ...
                             # Forward to client first
                            # Note: Logic here handles SENDING to client inside loop, but we also have 'should_forward'.
                            # Just let 'should_forward' handle the data forwarding, 
                            # AND do the interception/execution.
                            # BUT interception sends 'tool_response' BACK to server.
                            
                            tc_key = "toolCall" if "toolCall" in data else "tool_call"
                            tc = data[tc_key]
                            logger.info(f"🐛 DEBUG ToolCall Payload: {tc}")
                            
                            # We allow this message to proceed to client (should_forward = True default)
                            # But we ALSO execute it here.
                            
                            calls = tc.get("functionCalls") or tc.get("function_calls") or []
                            for call in calls:
                                logger.info(f"🛠️ {source_name} -> {dest_name}: Intercepting Tool Call: {call['name']}")
                                if tools_handler:
                                    result = await tools_handler.execute(call['name'], call.get('args', {}), user_email=user_email)
                                    
                                    function_response = {
                                        "name": call['name'],
                                        "response": result
                                    }
                                    if "id" in call: function_response["id"] = call["id"]
                                        
                                    resp_msg = { "tool_response": { "function_responses": [function_response] } }
                                    logger.info(f"✅ {dest_name} -> {source_name}: Sending Tool Response")
                                    await source_websocket.send(json.dumps(resp_msg, default=str))
                                    
                                    if call['name'] in ["add_person", "update_person"]:
                                        logger.info(f"📢 {dest_name} -> {dest_name}: Notifying Client of update")
                                        await destination_websocket.send(json.dumps({"type": "TREE_UPDATED"}))
                            
                            # The original 'toolCall' message MUST go to Client so it can display "Calling tool..."
                            # So should_forward = True is correct.
                            pass

                except Exception as e:
                    # JSON parse error or logic error
                    if DEBUG:
                         logger.error(f"Proxying error: {e}")
                    pass
                
                if should_forward:
                    await destination_websocket.send(message)

            except Exception as e:
                logger.error(f"Error forwarding message: {e}")
    except ConnectionClosed as e:
        logger.info(f"{source_name} connection closed: {e.code} - {e.reason}")
    except Exception as e:
        logger.error(f"Unexpected error in proxy_task for {source_name}: {e}")
    finally:
        # Final flush on close
        await flush_logs("ConnectionClosed")
        await destination_websocket.close()

async def create_proxy(
    client_websocket, bearer_token: str, service_url: str, server_websocket=None, user_email: str = None
) -> None:
    headers = {
        # "Content-Type": "application/json", # Remove to avoid potential header validation errors
        "Authorization": f"Bearer {bearer_token}",
    }
    ssl_context = ssl.create_default_context(cafile=certifi.where())
    
    async def run_proxy(ws):
        store = FamilyTreeStore()
        # tools = ToolsHandler(store) # New Logic needs to ensure store is passed or connected
        # Existing code instantiated ToolsHandler inside create_proxy? 
        # From previous file read, it was: tools = ToolsHandler(store)
        tools = ToolsHandler(store) 

        client_to_server_task = asyncio.create_task(proxy_task(client_websocket, ws, is_server=False, user_email=user_email, tools_handler=tools))
        server_to_client_task = asyncio.create_task(proxy_task(ws, client_websocket, is_server=True, tools_handler=tools, user_email=user_email))

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
