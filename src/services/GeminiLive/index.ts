import { CONFIG } from '../../config';
import { GlobalTreeService } from '../GlobalTreeService';
import { getUserProfile, saveGeminiLog } from '../drive';
import { GET_GEMINI_SYSTEM_PROMPT } from '../../logic/prompts';
import type { LogEntry } from './types';
import { AudioService } from './AudioService';
import { VideoService } from './VideoService';
import { SpeechService } from './SpeechService';

const WS_URL = 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent';

export class GeminiLiveService {
    private ws: WebSocket | null = null;
    private audioService: AudioService;
    private videoService: VideoService;
    private speechService: SpeechService;

    private isConnected: boolean = false;
    private onMessage: (text: string | null, audioData: string | null) => void;
    private onStatusChange: (status: string) => void;
    private onLogCallback: (entry: LogEntry) => void;

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
        this.onLogCallback = onLog;

        this.audioService = new AudioService(
            (base64Data) => this.sendAudioChunk(base64Data),
            (error) => {
                console.error("Audio Service Error:", error);
                this.onStatusChange('audio_error');
            }
        );

        this.videoService = new VideoService(
            (base64Data) => this.sendVideoFrame(base64Data),
            (error) => {
                console.error("Video Service Error:", error);
                this.onStatusChange('video_error');
            }
        );

        this.speechService = new SpeechService(
            (text, isFinal) => {
                if (isFinal) {
                    console.log("User Transcript (Final):", text);
                    this.onLog({
                        type: 'user',
                        text: text,
                        timestamp: new Date(),
                        data: { isTranscript: true }
                    });
                } else {
                    // console.log("User Transcript (Interim):", text);
                }
            },
            (entry) => this.onLog(entry)
        );
    }

    private onLog(entry: LogEntry) {
        if (this.userEmail) {
            this.logBuffer.push(entry);
        }
        this.onLogCallback(entry);
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

            this.setupAutosave();
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
            this.cleanup();
        };

        if (useVideo) {
            await this.videoService.start();
            this.onLog({ type: 'info', text: 'Video stream started', timestamp: new Date() });
        }
    }

    public disconnect() {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        this.cleanup();
    }

    private cleanup() {
        this.flushLogs();
        if (this.autosaveInterval) {
            clearInterval(this.autosaveInterval);
            this.autosaveInterval = null;
        }
        this.audioService.stop();
        this.videoService.stop();
        this.speechService.stop();
    }

    private async setupAutosave() {
        try {
            const profile = await getUserProfile();
            if (profile && profile.email) {
                this.userEmail = profile.email;
                console.log("Enabled autosave logs for", this.userEmail);
                this.autosaveInterval = setInterval(() => {
                    this.flushLogs();
                }, 30000);
            }
        } catch (e) {
            console.warn("Failed to enable autosave logs", e);
        }
    }

    private async flushLogs() {
        if (!this.userEmail || this.logBuffer.length === 0) return;

        const logsToSave = [...this.logBuffer];
        this.logBuffer = [];

        console.log(`Autosaving ${logsToSave.length} logs for ${this.userEmail}...`);
        const fileId = await saveGeminiLog(this.userEmail, logsToSave, this.logFileId);
        if (fileId) {
            this.logFileId = fileId;
        }
    }

    private sendSetupMessage() {
        if (!this.ws) return;

        const allNodes = GlobalTreeService.getAllNodesFlat();
        const contextData = allNodes.map(n => ({
            id: n.nodeId,
            name: n.name,
            gender: n.gender,
            spouses: n.spouseIds,
            children: n.childrenIds,
            parents: n.parentId ? [n.parentId] : [],
            dob: n.dob,
            loc: n.location?.district || n.location?.state
        }));

        const jsonContext = JSON.stringify(contextData);
        console.log(`Injecting ${contextData.length} nodes into context (~${jsonContext.length} chars)`);

        const systemInstructionText = GET_GEMINI_SYSTEM_PROMPT(jsonContext);

        const setupMsg = {
            setup: {
                model: "models/gemini-2.0-flash-exp",
                systemInstruction: { parts: [{ text: systemInstructionText }] },
                tools: [{
                    functionDeclarations: [{
                        name: "report_response",
                        description: "Reports the exact text of your spoken response to the user's screen. You MUST call this tool whenever you speak.",
                        parameters: {
                            type: "OBJECT",
                            properties: {
                                text: { type: "STRING", description: "The text of the response you are speaking." },
                                user_transcript: { type: "STRING", description: "The text of what the user just said, as you understood it. If you heard nothing, return empty string." }
                            },
                            required: ["text"]
                        }
                    }]
                }],
                toolConfig: { functionCallingConfig: { mode: "ANY" } },
                generationConfig: {
                    speechConfig: {
                        voiceConfig: {
                            prebuiltVoiceConfig: { voiceName: "Aoede" }
                        }
                    }
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

        if (msg.setupComplete) {
            console.log("Setup Complete received. Starting Audio...");
            this.onLog({ type: 'info', text: 'Setup Complete. Starting Audio...', timestamp: new Date() });

            // Start both Audio Stream (Input) and Speech Recognition (STT)
            await this.audioService.start();
            this.speechService.start();
            return;
        }

        // console.log("Full Gemini Message:", JSON.stringify(msg, null, 2));

        if (msg.serverContent) {
            if (msg.serverContent.modelTurn) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const parts = msg.serverContent.modelTurn.parts;
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                for (const part of parts) {
                    if (part.text) {
                        console.log("Creating Text Bubble:", part.text);
                        this.onMessage(part.text, null);
                        this.onLog({ type: 'model', text: part.text, timestamp: new Date() });
                    }
                    if (part.inlineData && part.inlineData.mimeType.startsWith('audio')) {
                        this.onMessage(null, part.inlineData.data);
                    }
                }
            }
        }

        if (msg.toolCall) {
            console.log("Received Tool Call:", msg.toolCall);
            const toolCall = msg.toolCall;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const transcriptCall = toolCall.functionCalls.find((fc: any) => fc.name === "report_response");

            if (transcriptCall) {
                const text = transcriptCall.args.text;
                console.log("FORCE TRANSCRIPT:", text);

                // REMOVED: this.onMessage(text, null); // Handled by onLog below

                if (transcriptCall.args.user_transcript) {
                    const userText = transcriptCall.args.user_transcript;
                    console.log("FORCE USER TRANSCRIPT:", userText);
                    this.onLog({
                        type: 'user',
                        text: userText,
                        timestamp: new Date(),
                        data: { isTranscript: true }
                    });
                }

                this.onLog({ type: 'model', text: text, timestamp: new Date() });

                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const functionResponses = toolCall.functionCalls.map((fc: any) => ({
                    id: fc.id,
                    name: fc.name,
                    response: { result: "Transcript displayed to user." }
                }));

                this.ws?.send(JSON.stringify({ toolResponse: { functionResponses } }));
                return;
            }

            console.log("Received Unexpected Tool Call:", msg.toolCall);
            this.onLog({ type: 'info', text: `⚠️ Unexpected tool call. Sending correction...`, timestamp: new Date() });

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const functionResponses = toolCall.functionCalls.map((fc: any) => ({
                id: fc.id,
                name: fc.name,
                response: { result: "system_error: Tools are disabled. Use the provided JSON context to answer." }
            }));
            this.ws?.send(JSON.stringify({ toolResponse: { functionResponses } }));
        }
    }

    private sendAudioChunk(base64Audio: string) {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
        this.ws.send(JSON.stringify({
            realtimeInput: {
                mediaChunks: [{ mimeType: "audio/pcm;rate=16000", data: base64Audio }]
            }
        }));
    }

    private sendVideoFrame(base64Image: string) {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
        this.ws.send(JSON.stringify({
            realtimeInput: {
                mediaChunks: [{ mimeType: "image/jpeg", data: base64Image }]
            }
        }));
    }
}
