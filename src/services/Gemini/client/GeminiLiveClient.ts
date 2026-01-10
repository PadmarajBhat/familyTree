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

    constructor(url: string, project: string, model: string, systemInstruction: string, voiceName: string = "Puck") {
        this.url = url;
        this.project = project;
        this.model = model;
        this.systemInstruction = systemInstruction;
        this.voiceName = voiceName;
    }

    connect() {
        if (this.connected) return;
        this.ws = new WebSocket(this.url);
        this.ws.onopen = () => {
            this.connected = true;
            this.sendSetupMessage();
            this.onOpen();
        };
        this.ws.onclose = (e) => { this.connected = false; this.onClose(e); };
        this.ws.onerror = (e) => this.onError(e);
        this.ws.onmessage = async (event) => {
            try {
                const textData = event.data instanceof Blob ? await event.data.text() : event.data;
                if (typeof textData === 'string') parseServerMessage(JSON.parse(textData), this.onMessage);
            } catch (e) { console.error("Parse failed", e); }
        };
    }

    disconnect() {
        if (this.ws) { this.ws.close(); this.ws = null; this.connected = false; }
    }

    sendAudioChunk(base64Audio: string) {
        if (!this.connected || !this.ws) return;
        this.ws.send(JSON.stringify({
            realtime_input: { media_chunks: [{ mime_type: "audio/pcm", data: base64Audio }] }
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
        this.ws.send(JSON.stringify({ service_url: serviceUrl }));

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
        this.ws.send(JSON.stringify(sessionSetup));
    }

    sendToolResponse(toolCallId: string, output: any) {
        if (!this.connected || !this.ws) return;
        this.ws.send(JSON.stringify({
            tool_response: { function_responses: [{ name: toolCallId, response: { output } }] }
        }));
    }
}
