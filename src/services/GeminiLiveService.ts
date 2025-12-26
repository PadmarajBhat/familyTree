
import { CONFIG } from '../config';
import { GlobalTreeService } from './GlobalTreeService';
import { getUserProfile, saveGeminiLog } from './drive';
import { GET_GEMINI_SYSTEM_PROMPT } from '../logic/prompts';

// Gemini Multimodal Live API URL
const WS_URL = 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent';



export interface LogEntry {
    type: 'info' | 'user' | 'model' | 'tool-call' | 'tool-response';
    text: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data?: any;
    timestamp: Date;
}

export class GeminiLiveService {
    private ws: WebSocket | null = null;
    private audioContext: AudioContext | null = null;
    private mediaStream: MediaStream | null = null;
    private processor: ScriptProcessorNode | AudioWorkletNode | null = null;

    private videoStream: MediaStream | null = null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private videoInterval: any | null = null;

    private isConnected: boolean = false;
    private onMessage: (text: string | null, audioData: string | null) => void;
    private onStatusChange: (status: string) => void;
    private onLog: (entry: LogEntry) => void;

    private userEmail: string | null = null;
    private logBuffer: LogEntry[] = [];
    private logFileId: string | null = null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private autosaveInterval: any | null = null;

    constructor(
        onMessage: (text: string | null, audioData: string | null) => void,
        onStatusChange: (status: string) => void,
        onLog: (entry: LogEntry) => void = () => { }
    ) {
        this.onMessage = onMessage;
        this.onStatusChange = onStatusChange;
        this.onLog = (entry) => {
            if (this.userEmail) {
                this.logBuffer.push(entry);
            }
            onLog(entry);
        };
    }

    public async connect(useVideo: boolean = false) {
        if (this.isConnected) return;

        this.onStatusChange('connecting');
        this.onLog({ type: 'info', text: 'Connecting to Gemini Live API...', timestamp: new Date() });
        console.log("Connecting to Gemini Live API...");

        const apiKey = CONFIG.API_KEY;
        if (!apiKey) {
            this.onStatusChange('error: missing api key');
            this.onLog({ type: 'info', text: 'Error: Missing API Key', timestamp: new Date() });
            return;
        }

        const url = `${WS_URL}?key=${apiKey}`;
        this.ws = new WebSocket(url);

        this.ws.onopen = async () => {
            console.log("WebSocket Connected");
            this.isConnected = true;
            this.onStatusChange('connected');
            this.onLog({ type: 'info', text: 'Connected to Gemini Live', timestamp: new Date() });

            // Start Autosave
            try {
                const profile = await getUserProfile();
                if (profile && profile.email) {
                    this.userEmail = profile.email;
                    console.log("Enabled autosave logs for", this.userEmail);

                    this.autosaveInterval = setInterval(() => {
                        this.flushLogs();
                    }, 30000); // Save every 30 seconds
                }
            } catch (e) {
                console.warn("Failed to enable autosave logs", e);
            }

            this.sendSetupMessage();
        };

        this.ws.onmessage = async (event) => {
            await this.handleMessage(event.data);
        };

        this.ws.onerror = (error) => {
            console.error("WebSocket Error:", error);
            this.onStatusChange('error');
            this.onLog({ type: 'info', text: 'WebSocket Error', timestamp: new Date() });
        };

        this.ws.onclose = (event) => {
            console.log("WebSocket Closed (Updated)", event.code, event.reason);
            this.isConnected = false;
            this.onStatusChange('disconnected');
            this.onLog({ type: 'info', text: 'Disconnected', timestamp: new Date() });

            // Cleanup
            this.flushLogs();
            if (this.autosaveInterval) {
                clearInterval(this.autosaveInterval);
                this.autosaveInterval = null;
            }

            this.stopAudio();
            this.stopVideo();
        };

        // Start Audio
        await this.startAudio();
        if (useVideo) {
            await this.startVideo();
            this.onLog({ type: 'info', text: 'Video stream started', timestamp: new Date() });
        }
    }

    public disconnect() {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }

        // Cleanup
        this.flushLogs();
        if (this.autosaveInterval) {
            clearInterval(this.autosaveInterval);
            this.autosaveInterval = null;
        }

        this.stopAudio();
        this.stopVideo();
    }

    private async flushLogs() {
        if (!this.userEmail || this.logBuffer.length === 0) return;

        const logsToSave = [...this.logBuffer];
        this.logBuffer = []; // Clear buffer immediately to avoid duplicates in next batch

        console.log(`Autosaving ${logsToSave.length} logs for ${this.userEmail}...`);
        const fileId = await saveGeminiLog(this.userEmail, logsToSave, this.logFileId);
        if (fileId) {
            this.logFileId = fileId;
        }
    }

    private sendSetupMessage() {
        if (!this.ws) return;

        // 1. Get All Tree Data
        const allNodes = GlobalTreeService.getAllNodesFlat();

        // 2. Optimize Data for Token Size
        // We strip unnecessary fields to keep context small and focused on relationships
        const contextData = allNodes.map(n => ({
            id: n.nodeId,
            name: n.name,
            gender: n.gender,
            spouses: n.spouseIds,
            children: n.childrenIds,
            parents: n.parentId ? [n.parentId] : [], // Normalize to array for easier reading
            // Add other critical fields if needed (DOB, Location)
            dob: n.dob,
            loc: n.location?.district || n.location?.state
        }));

        const jsonContext = JSON.stringify(contextData);
        console.log(`Injecting ${contextData.length} nodes into context (~${jsonContext.length} chars)`);

        // 3. Construct System Prompt
        const systemInstructionText = GET_GEMINI_SYSTEM_PROMPT(jsonContext);

        const setupMsg = {
            setup: {
                model: "models/gemini-2.0-flash-exp",
                systemInstruction: {
                    parts: [
                        { text: systemInstructionText }
                    ]
                },
                // Explicitly disable tools to prevent hallucination
                tools: [],
                toolConfig: {
                    functionCallingConfig: {
                        mode: "NONE"
                    }
                },
                generationConfig: {
                    responseModalities: ["AUDIO", "TEXT"]
                }
            }
        };
        this.ws.send(JSON.stringify(setupMsg));
        console.log("Sent setup message with Full Context & Tools Disabled");
        this.onLog({ type: 'info', text: 'Sent setup message (Full Context)', timestamp: new Date() });
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

        // console.log("Gemini Message:", msg); // DEBUG

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
            console.log("Received Unexpected Tool Call:", msg.toolCall);
            this.onLog({
                type: 'info',
                text: `⚠️ Unexpected tool call. Sending correction...`,
                timestamp: new Date()
            });

            // Send a "compliance" response to snap the model out of tool mode
            // We pretend we are the tool system returning an error/instruction
            const toolCall = msg.toolCall;
            const functionResponses = toolCall.functionCalls.map((fc: any) => ({
                id: fc.id,
                name: fc.name,
                response: {
                    result: "system_error: Tools are disabled. Use the provided JSON context to answer."
                }
            }));

            const responseMsg = {
                toolResponse: {
                    functionResponses
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

            // Load the worklet
            try {
                // Use resolved path or just name if served from same base
                await this.audioContext.audioWorklet.addModule('audio-processor.js');
            } catch (e) {
                console.error("Failed to load audio-processor.js", e);
                // Fallback or error handling
            }

            const source = this.audioContext.createMediaStreamSource(this.mediaStream);

            // Use AudioWorklet
            const workletNode = new AudioWorkletNode(this.audioContext, 'audio-processor');

            workletNode.port.onmessage = (event) => {
                if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

                const inputData = event.data; // Float32Array from processor

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

            source.connect(workletNode);
            // Worklet might not need destination connection if it doesn't output audio, 
            // but connecting to destination keeps the graph alive in some implementations.
            // If the worklet outputs silence, this is fine. 
            // Our processor returns true but doesn't fill output buffer, so fine.
            workletNode.connect(this.audioContext.destination);

            // Store for cleanup
            // We can reuse the `processor` variable but it's typed as ScriptProcessorNode
            // We should update the type definition or just cast it for now if we don't want to change type signatures everywhere
            // Better to update the type definition.
            // For now, let's treat `processor` as any or update the class property.
            this.processor = workletNode as unknown as ScriptProcessorNode;

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
