import type { MultimodalLiveResponseMessage } from './types';
import { FUNCTION_DECLARATIONS } from './tools';
import { parseServerMessage } from './GeminiLiveClient/messageParser';

export class GeminiLiveClient {
    public onOpen: () => void = () => { };
    public onClose: (event: CloseEvent) => void = () => { };
    public onMessage: (message: MultimodalLiveResponseMessage) => void = () => { };
    public onError: (error: Event) => void = () => { };

    private ws: WebSocket | null = null;
    private url: string;
    private project: string;
    private model: string;
    private connected: boolean = false;
    private systemInstruction: string;
    private voiceName: string;
    private currentUserEmail: string | undefined;

    constructor(url: string, project: string, model: string, systemInstruction: string, voiceName: string = "Puck", currentUserEmail?: string) {
        this.url = url;
        this.project = project;
        this.model = model;
        this.systemInstruction = systemInstruction;
        this.voiceName = voiceName;
        this.currentUserEmail = currentUserEmail;
    }

    connect() {
        if (this.connected) return;
        this.ws = new WebSocket(this.url);
        this.ws.onopen = () => {
            this.connected = true;
            this.sendSetupMessage();
            this.onOpen();
            // Fetch history immediately on connect
            this.getHistory();
        };
        this.ws.onclose = (e) => { this.connected = false; this.onClose(e); };
        this.ws.onerror = (e) => this.onError(e);
        this.ws.onmessage = async (event) => {
            try {
                let textData;
                if (event.data instanceof Blob) {
                    textData = await event.data.text();
                } else {
                    textData = event.data;
                }

                const rawObj = JSON.parse(textData);

                // Handle CHAT_HISTORY separately as it's our custom type, not Gemini's
                if (rawObj.type === "CHAT_HISTORY") {
                    this.onMessage(rawObj);
                    return;
                }

                parseServerMessage(rawObj, this.onMessage);
            } catch (e) { console.error("Parse failed", e); }
        };
    }

    disconnect() {
        if (this.ws) { this.ws.close(); this.ws = null; this.connected = false; }
    }

    getHistory() {
        if (!this.connected || !this.ws) return;
        this.ws.send(JSON.stringify({ type: "GET_CHAT_HISTORY" }));
    }

    sendAudioChunk(base64Audio: string) {
        if (!this.connected || !this.ws) return;
        // console.log("Sending Audio Chunk:", base64Audio.length, "chars");
        this.ws.send(JSON.stringify({
            realtime_input: { media_chunks: [{ mime_type: "audio/pcm;rate=16000", data: base64Audio }] }
        }));
    }

    sendTextMessage(text: string) {
        if (!this.connected || !this.ws) return;
        this.ws.send(JSON.stringify({
            client_content: { turns: [{ role: "user", parts: [{ text }] }], turn_complete: true }
        }));
    }

    private sendSetupMessage() {
        if (!this.ws) return;
        const serviceUrl = `wss://us-central1-aiplatform.googleapis.com/ws/google.cloud.aiplatform.v1beta1.LlmBidiService/BidiGenerateContent`;
        // Pass user_email so backend knows who to log for
        this.ws.send(JSON.stringify({ service_url: serviceUrl, user_email: this.currentUserEmail }));

        const modelUri = `projects/${this.project}/locations/us-central1/publishers/google/models/${this.model}`;
        const sessionSetup = {
            setup: {
                model: modelUri,
                generation_config: {
                    response_modalities: ["AUDIO"],
                    speech_config: { voice_config: { prebuilt_voice_config: { voice_name: this.voiceName } } }
                },
                system_instruction: { parts: [{ text: this.systemInstruction }] },
                tools: [{ function_declarations: FUNCTION_DECLARATIONS }],
                input_audio_transcription: {},
                output_audio_transcription: {}
            }
        };
        console.log("Sending Setup Message:", JSON.stringify(sessionSetup, null, 2));
        this.ws.send(JSON.stringify(sessionSetup));
    }

    sendToolResponse(toolCallId: string, output: any) {
        if (!this.connected || !this.ws) return;
        this.ws.send(JSON.stringify({
            tool_response: { function_responses: [{ name: toolCallId, response: { output } }] }
        }));
    }
}
