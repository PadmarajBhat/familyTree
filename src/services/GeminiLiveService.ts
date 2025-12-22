
import { CONFIG } from '../config';
import { GlobalTreeService } from './GlobalTreeService';

// Gemini Multimodal Live API URL
const WS_URL = 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent';

interface ToolCall {
    functionCalls: {
        name: string;
        args: Record<string, any>;
        id: string;
    }[];
}

export class GeminiLiveService {
    private ws: WebSocket | null = null;
    private audioContext: AudioContext | null = null;
    private mediaStream: MediaStream | null = null;
    private processor: ScriptProcessorNode | null = null;

    private videoStream: MediaStream | null = null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private videoInterval: any | null = null;

    private isConnected: boolean = false;
    private onMessage: (text: string | null, audioData: string | null) => void;
    private onStatusChange: (status: string) => void;

    constructor(
        onMessage: (text: string | null, audioData: string | null) => void,
        onStatusChange: (status: string) => void
    ) {
        this.onMessage = onMessage;
        this.onStatusChange = onStatusChange;
    }

    public async connect(useVideo: boolean = false) {
        if (this.isConnected) return;

        this.onStatusChange('connecting');
        console.log("Connecting to Gemini Live API...");

        const apiKey = CONFIG.API_KEY;
        if (!apiKey) {
            this.onStatusChange('error: missing api key');
            return;
        }

        const url = `${WS_URL}?key=${apiKey}`;
        this.ws = new WebSocket(url);

        this.ws.onopen = () => {
            console.log("WebSocket Connected");
            this.isConnected = true;
            this.onStatusChange('connected');
            this.sendSetupMessage();
        };

        this.ws.onmessage = async (event) => {
            await this.handleMessage(event.data);
        };

        this.ws.onerror = (error) => {
            console.error("WebSocket Error:", error);
            this.onStatusChange('error');
        };

        this.ws.onclose = (event) => {
            console.log("WebSocket Closed", event.code, event.reason);
            this.isConnected = false;
            this.onStatusChange('disconnected');
            this.stopAudio();
            this.stopVideo();
        };

        // Start Audio
        await this.startAudio();
        if (useVideo) {
            await this.startVideo();
        }
    }

    public disconnect() {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        this.stopAudio();
        this.stopVideo();
    }

    private sendSetupMessage() {
        if (!this.ws) return;

        const setupMsg = {
            setup: {
                model: "models/gemini-2.0-flash-exp",
                tools: [
                    {
                        functionDeclarations: [
                            {
                                name: "searchFamilyTree",
                                description: "Search for people in the family tree by name.",
                                parameters: {
                                    type: "object",
                                    properties: {
                                        query: { type: "string", description: "Name to search for" }
                                    },
                                    required: ["query"]
                                }
                            },
                            {
                                name: "getPersonDetails",
                                description: "Get detailed information about a specific person using their treeId and nodeId found from search.",
                                parameters: {
                                    type: "object",
                                    properties: {
                                        treeId: { type: "string" },
                                        nodeId: { type: "string" }
                                    },
                                    required: ["treeId", "nodeId"]
                                }
                            }
                        ]
                    }
                ],
                generationConfig: {
                    responseModalities: ["AUDIO"]
                }
            }
        };
        this.ws.send(JSON.stringify(setupMsg));
        console.log("Sent setup message");
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private async handleMessage(data: any) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let msg: any;
        if (data instanceof Blob) {
            const text = await data.text();
            msg = JSON.parse(text);
        } else {
            msg = JSON.parse(data);
        }

        // Server Content (Audio/Text)
        if (msg.serverContent) {
            if (msg.serverContent.modelTurn) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const parts = msg.serverContent.modelTurn.parts;
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                for (const part of parts) {
                    if (part.text) {
                        this.onMessage(part.text, null);
                    }
                    if (part.inlineData && part.inlineData.mimeType.startsWith('audio')) {
                        // Audio PCM?
                        this.onMessage(null, part.inlineData.data);
                    }
                }
            }
        }

        // Tool Call
        if (msg.toolCall) {
            const toolCall = msg.toolCall as ToolCall;
            console.log("Received Tool Call:", toolCall);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const responses: any[] = [];

            for (const call of toolCall.functionCalls) {
                if (call.name === 'searchFamilyTree') {
                    const query = call.args.query;
                    console.log(`Executing tool searchFamilyTree: ${query}`);
                    const results = GlobalTreeService.searchAllTrees(query);
                    // Limit results to avoid token limit?
                    const limitedResults = results.slice(0, 5).map(r => ({
                        treeId: r.treeId,
                        treeName: r.treeName,
                        name: r.node.name,
                        nodeId: r.node.nodeId,
                        gender: r.node.gender,
                        born: r.node.dob,
                        parent: r.parentName
                    }));
                    responses.push({
                        id: call.id,
                        name: call.name,
                        // response field structure for Bidi
                        response: {
                            name: call.name,
                            content: { results: limitedResults }
                        }
                    });
                } else if (call.name === 'getPersonDetails') {
                    const { treeId, nodeId } = call.args;
                    console.log(`Executing tool getPersonDetails: ${treeId} ${nodeId}`);
                    const node = GlobalTreeService.getNode(treeId, nodeId);
                    responses.push({
                        id: call.id,
                        name: call.name,
                        response: {
                            name: call.name,
                            content: { person: node } // Send full node details
                        }
                    });
                }
            }

            // Send Tool Response
            const responseMsg = {
                toolResponse: {
                    functionResponses: responses
                }
            };
            this.ws?.send(JSON.stringify(responseMsg));
        }
    }

    private async startAudio() {
        try {
            this.mediaStream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    channelCount: 1,
                    sampleRate: 16000 // Desired, but browser may ignore
                }
            });

            this.audioContext = new AudioContext({ sampleRate: 16000 });
            const source = this.audioContext.createMediaStreamSource(this.mediaStream);

            // Use ScriptProcessor for simplicity (AudioWorklet is better but more files)
            // bufferSize 4096 gives ~250ms chunks at 16kHz
            this.processor = this.audioContext.createScriptProcessor(4096, 1, 1);

            this.processor.onaudioprocess = (e) => {
                if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

                const inputData = e.inputBuffer.getChannelData(0);
                // Convert Float32 to PCM 16-bit Little Endian
                const pcmData = this.floatTo16BitPCM(inputData);

                // Base64 encode
                const base64Audio = this.arrayBufferToBase64(pcmData);

                this.ws.send(JSON.stringify({
                    realtimeInput: {
                        mediaChunks: [
                            {
                                mimeType: "audio/pcm;rate=16000",
                                data: base64Audio
                            }
                        ]
                    }
                }));
            };

            source.connect(this.processor);
            this.processor.connect(this.audioContext.destination);

        } catch (e) {
            console.error("Audio Access Error", e);
            this.onStatusChange('audio_error');
        }
    }

    private stopAudio() {
        if (this.processor) {
            this.processor.disconnect();
            this.processor = null;
        }
        if (this.mediaStream) {
            this.mediaStream.getTracks().forEach(track => track.stop());
            this.mediaStream = null;
        }
        if (this.audioContext) {
            this.audioContext.close();
            this.audioContext = null;
        }
    }

    private async startVideo() {
        try {
            this.videoStream = await navigator.mediaDevices.getUserMedia({
                video: {
                    width: { ideal: 640 },
                    height: { ideal: 480 },
                    frameRate: { ideal: 5 }
                }
            });

            const track = this.videoStream.getVideoTracks()[0];
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const imageCapture = new (window as any).ImageCapture(track);

            this.videoInterval = setInterval(async () => {
                if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

                try {
                    const blob = await imageCapture.takePhoto();
                    const base64 = await this.blobToBase64(blob);

                    this.ws.send(JSON.stringify({
                        realtimeInput: {
                            mediaChunks: [
                                {
                                    mimeType: "image/jpeg",
                                    data: base64
                                }
                            ]
                        }
                    }));
                } catch (e) {
                    console.error("Frame capture error", e);
                }
            }, 1000); // 1 FPS, can increase
        } catch (e) {
            console.error("Video Access Error", e);
            this.onStatusChange('video_error');
        }
    }

    private stopVideo() {
        if (this.videoInterval) {
            clearInterval(this.videoInterval);
            this.videoInterval = null;
        }
        if (this.videoStream) {
            this.videoStream.getTracks().forEach(track => track.stop());
            this.videoStream = null;
        }
    }

    private blobToBase64(blob: Blob): Promise<string> {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => {
                const result = reader.result as string;
                // remove data:image/jpeg;base64,
                const base64 = result.split(',')[1];
                resolve(base64);
            };
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    }

    private floatTo16BitPCM(output: Float32Array) {
        const buffer = new ArrayBuffer(output.length * 2);
        const view = new DataView(buffer);
        for (let i = 0; i < output.length; i++) {
            const s = Math.max(-1, Math.min(1, output[i]));
            view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
        }
        return buffer;
    }

    private arrayBufferToBase64(buffer: ArrayBuffer) {
        let binary = '';
        const bytes = new Uint8Array(buffer);
        const len = bytes.byteLength;
        for (let i = 0; i < len; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return window.btoa(binary);
    }
}
