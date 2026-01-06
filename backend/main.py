import os
import json
import base64
import asyncio
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from google import genai

load_dotenv()

app = FastAPI()

# SECURITY: Configure CORS
# In production, replace "*" with your specific frontend domain
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

API_KEY = os.getenv("GOOGLE_API_KEY")
if not API_KEY:
    print("Warning: GOOGLE_API_KEY not set in environment")

client = genai.Client(api_key=API_KEY, http_options={'api_version': 'v1alpha'})

@app.get("/")
async def health_check():
    return {"status": "ok", "service": "ftv1-backend"}

import re

def to_snake_case(name):
    name = re.sub('(.)([A-Z][a-z]+)', r'\1_\2', name)
    return re.sub('([a-z0-9])([A-Z])', r'\1_\2', name).lower()

def recursive_to_snake_case(data):
    if isinstance(data, dict):
        return {to_snake_case(k): recursive_to_snake_case(v) for k, v in data.items()}
    elif isinstance(data, list):
        return [recursive_to_snake_case(item) for item in data]
    else:
        return data

import traceback

def log_traffic(char):
    with open("traffic.log", "a") as f:
        f.write(char)

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    print("New Connection Established (StdOut Works)")
    log_traffic("C") # Connected

    try:
        msg_text = await websocket.receive_text()
        init_message = json.loads(msg_text)
        
        # Parse and convert config to snake_case for Python SDK
        raw_setup = init_message.get("setup", {})
        setup_config = recursive_to_snake_case(raw_setup)
        
        print(f"Received setup config keys: {list(setup_config.keys())}")

        model_id = setup_config.get("model", "models/gemini-2.0-flash-exp")
        
        # Extract config parts
        live_config = {}
        if "generation_config" in setup_config:
            live_config["generation_config"] = setup_config["generation_config"]
        if "generation_config" not in live_config:
            live_config["generation_config"] = {}
        live_config["generation_config"]["response_modalities"] = ["AUDIO"]
        live_config["generation_config"]["speech_config"] = {
            "voice_config": {"prebuilt_voice_config": {"voice_name": "Puck"}},
        }

        if "system_instruction" in setup_config:
            live_config["system_instruction"] = setup_config["system_instruction"]
        
        # DEBUG: Re-enable tools
        if "tools" in setup_config:
            live_config["tools"] = setup_config["tools"]

        # Connect to Gemini
        try:
            print(f"Connecting to Gemini with config keys: {list(live_config.keys())}")
            
            async with client.aio.live.connect(model=model_id, config=live_config) as session:
                print("Connected to Gemini Live (REAL API)")
                
                async def receive_from_client():
                    """Reads from Frontend -> Sends to Gemini"""
                    try:
                        print("Starting client receiver loop...")
                        while True:
                            data = await websocket.receive_text()
                            message = json.loads(data)
                            print(f"DEBUG: Received message keys: {list(message.keys())}") 
                            
                            if message.get("endOfTurn"):
                                print("Received Piggybacked End-of-Turn signal.")
                                log_traffic("E")
                                await session.send(input="", end_of_turn=True)

                            if "realtimeInput" in message:
                                if "mediaChunks" in message["realtimeInput"]:
                                    for chunk in message["realtimeInput"]["mediaChunks"]:
                                        if chunk["mimeType"] == "audio/pcm":
                                              log_traffic("R")
                                              await session.send(input={"data": chunk["data"], "mime_type": "audio/pcm"})
                                              log_traffic("S")

                            elif "client_content" in message:
                                content = message['client_content']
                                print(f"DEBUG: Handling client_content: {content}") 
                                if "turn_complete" in content and content["turn_complete"]:
                                    print("Received End-of-Turn signal from client.")
                                    log_traffic("E")
                                    # Send empty input to force turn completion
                                    await session.send(input="", end_of_turn=True)
                                else:
                                    print(f"Received text from client: {content}")
                                    await session.send(input=content, end_of_turn=True)
                            
                            elif "clientDebug" in message:
                                print(f"!!! CLIENT DEBUG !!!: {message['clientDebug']}")

                            elif "toolResponse" in message:
                                print(f"Sending tool response: {str(message['toolResponse'])[:100]}...")
                                await session.send(input=message["toolResponse"], end_of_turn=False)

                    except WebSocketDisconnect:
                        print("Client disconnected from receive_from_client")
                    except Exception as e:
                        print(f"Error receiving from client: {e}")
                        print(traceback.format_exc())

                async def receive_from_gemini():
                    """Reads from Gemini -> Sends to Frontend"""
                    try:
                        # log_to_file("Starting Gemini receiver loop...") # This function doesn't exist
                        print("Starting Gemini receiver loop...")
                        async for response in session.receive():
                            server_content = response.server_content
                            if server_content is None:
                                continue

                            model_turn = server_content.model_turn
                            if model_turn:
                                 for part in model_turn.parts:
                                     print(f"Gemini Part: {part}")
                                     with open("gemini_trace.log", "a") as f:
                                         f.write(f"{str(part)}\n")
                                     
                                     if part.inline_data:
                                         # log_to_file("G->F: Audio Received") # Too verbose
                                         base64_audio = base64.b64encode(part.inline_data.data).decode("utf-8")
                                         log_traffic("A")
                                         await websocket.send_json({"audio": base64_audio})
                                     if part.text:
                                         log_to_file(f"G->F: Text: {part.text}")
                                         await websocket.send_json({"text": part.text})

                            # SAFEGUARD: Check for tool_call attribute safely
                            tool_call = getattr(server_content, "tool_call", None)
                            
                            # Debugging: If tool_call is missing but we suspect it's there
                            # if not tool_call:
                            #     log_to_file(f"Server Content Attributes: {dir(server_content)}")

                            if tool_call:
                                 print(f"Tool call received: {tool_call}")
                                 function_calls = []
                                 for fc in tool_call.function_calls:
                                     function_calls.append({
                                         "name": fc.name,
                                         "args": fc.args, 
                                         "id": fc.id
                                     })
                                 await websocket.send_json({"toolCall": { "functionCalls": function_calls }})

                    except Exception as e:
                        print(f"Error receiving from Gemini: {e}")
                        print(traceback.format_exc())
                
                await asyncio.gather(receive_from_client(), receive_from_gemini())

        except Exception as e:
            print(f"!!! GEMINI ERROR: {e} !!!")
            print(f"Gemini Connection Failed: {e}")
            print(traceback.format_exc())
            await websocket.close(code=1011, reason=f"Gemini Error: {str(e)}")

    except WebSocketDisconnect:
        print("WebSocket disconnected")
    except Exception as e:
        print(f"Connection error: {e}")
        print(traceback.format_exc())
        try:
            await websocket.close()
        except:
            pass
