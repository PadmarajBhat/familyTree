
const { WebSocketServer, WebSocket } = require('ws');
require('dotenv').config();

const PORT = 3000;
const wss = new WebSocketServer({ port: PORT });
const API_KEY = process.env.GOOGLE_API_KEY;
const MODEL = "models/gemini-2.0-flash-exp";
const HOST = "generativelanguage.googleapis.com";
const WS_URL = `wss://${HOST}/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${API_KEY}`;

console.log(`Node.js Gemini Backend running on port ${PORT}`);

if (!API_KEY) {
    console.error("CRITICAL ERROR: GOOGLE_API_KEY is missing via .env");
}

wss.on('connection', (clientWs) => {
    console.log("New Client Connected");

    let geminiWs = null;

    // Helper to send to Client safely
    const sendToClient = (msg) => {
        if (clientWs.readyState === WebSocket.OPEN) {
            clientWs.send(JSON.stringify(msg));
        }
    };

    // Helper to send to Gemini safely
    const sendToGemini = (msg) => {
        if (geminiWs && geminiWs.readyState === WebSocket.OPEN) {
            geminiWs.send(JSON.stringify(msg));
        }
    };

    clientWs.on('message', async (rawMsg) => {
        try {
            const msg = JSON.parse(rawMsg);

            // 1. SETUP
            if (msg.setup) {
                console.log("Connecting to Gemini...");
                geminiWs = new WebSocket(WS_URL);

                geminiWs.on('open', () => {
                    console.log("Connected to Gemini Bidi Endpoint");

                    // Manual Mapping to avoid corrupting Schema keys
                    const setupMsg = {
                        setup: {
                            model: MODEL,
                            generation_config: {
                                response_modalities: ["AUDIO"],
                                speech_config: {
                                    voice_config: {
                                        prebuilt_voice_config: {
                                            voice_name: msg.setup.generationConfig?.speechConfig?.voiceConfig?.prebuiltVoiceConfig?.voiceName || "Aoede"
                                        }
                                    }
                                }
                            },
                            system_instruction: msg.setup.systemInstruction ? {
                                parts: msg.setup.systemInstruction.parts
                            } : undefined,
                            tools: msg.setup.tools ? msg.setup.tools.map(t => ({
                                function_declarations: t.functionDeclarations // Map camelCase to snake_case only here
                            })) : undefined
                        }
                    };

                    console.log("Sending Setup:", JSON.stringify(setupMsg));
                    sendToGemini(setupMsg);
                });

                geminiWs.on('message', (data) => {
                    try {
                        const strData = data.toString();
                        const response = JSON.parse(strData);

                        // Handle ServerContent
                        if (response.serverContent) {
                            const content = response.serverContent;

                            // 1. Model Turn (Text/Audio)
                            if (content.modelTurn) {
                                for (const part of content.modelTurn.parts) {
                                    if (part.text) {
                                        console.log("G->N: Text received:", part.text);
                                        sendToClient({ text: part.text });
                                    }
                                    if (part.inlineData) {
                                        // console.log("G->N: Audio received");
                                        sendToClient({ audio: part.inlineData.data });
                                    }
                                }
                            }

                            // 2. Tool Call
                            if (content.toolCall) {
                                console.log("G->N: Tool Call received:", JSON.stringify(content.toolCall));
                                sendToClient({ toolCall: { functionCalls: content.toolCall.functionCalls } });
                            }
                        }

                        // Tool Call at root or safe check
                        if (response.toolCall) {
                            console.log("G->N: Tool Call (Root) received:", JSON.stringify(response.toolCall));
                            sendToClient({ toolCall: { functionCalls: response.toolCall.functionCalls } });
                        }

                    } catch (e) {
                        console.error("Error parsing Gemini message:", e);
                    }
                });

                geminiWs.on('close', (code, reason) => {
                    console.log(`Gemini Closed. Code: ${code}, Reason: ${reason ? reason.toString() : "No reason"}`);
                });
                geminiWs.on('error', (e) => console.error("Gemini Error:", e));
            }

            // 1.5 END OF TURN (Signal from client)
            if (msg.endOfTurn) {
                console.log("Sending End-of-Turn signal to Gemini");
                sendToGemini({
                    client_content: {
                        turns: [
                            {
                                role: "user",
                                parts: [{ text: "" }]
                            }
                        ],
                        turn_complete: true
                    }
                });
            }

            // 2. AUDIO INPUT
            if (msg.realtimeInput) {
                // Map camelCase to snake_case
                const realtimeInput = {
                    realtime_input: {
                        media_chunks: msg.realtimeInput.mediaChunks.map(c => ({
                            mime_type: c.mimeType || "audio/pcm",
                            data: c.data
                        }))
                    }
                };
                sendToGemini(realtimeInput);
            }

            // 3. TOOL RESPONSE
            if (msg.toolResponse) {
                // Frontend sends: { toolResponse: { functionResponses: [...] } }
                // API Expects: { tool_response: { function_responses: [...] } }
                const toolResponse = {
                    tool_response: {
                        function_responses: msg.toolResponse.functionResponses.map(fr => ({
                            name: fr.name,
                            response: { result: fr.response },
                            id: fr.id
                        }))
                    }
                };
                sendToGemini(toolResponse);
            }

            // 4. CLIENT CONTENT (Text input)
            if (msg.client_content) {
                // Forward as client_content (snake_case)
                const clientContent = {
                    client_content: {
                        turns: [
                            {
                                role: "user",
                                parts: [{ text: msg.client_content }]
                            }
                        ],
                        turn_complete: true
                    }
                };
                sendToGemini(clientContent);
            }

        } catch (e) {
            console.error("Error parsing Client message:", e);
        }
    });

    clientWs.on('close', () => {
        console.log("Client Disconnected");
        if (geminiWs) geminiWs.close();
    });
});
