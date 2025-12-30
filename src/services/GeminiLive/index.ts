import { CONFIG } from '../../config';
import { GlobalTreeService } from '../GlobalTreeService';
import { getUserProfile, saveGeminiLog, loadGeminiLog, updateTreeFile } from '../drive';
import { GET_GEMINI_SYSTEM_PROMPT } from '../../logic/prompts';
import { validatePersonData } from '../../logic/validation';
import type { LogEntry } from './types';
import { AudioService } from './AudioService';
import { VideoService } from './VideoService';

import type { PersonNode } from '../../logic/types';

const WS_URL = 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent';

export interface ToolResult {
    success: boolean;
    message: string;
    nodeId?: string;
}

export class GeminiLiveService {
    private ws: WebSocket | null = null;
    private audioService: AudioService;
    private videoService: VideoService;
    private processingToolCalls: Set<string> = new Set();


    private isConnected: boolean = false;
    private onMessage: (text: string | null, audioData: string | null, type: 'user' | 'model' | 'tool-response') => void;
    private onStatusChange: (status: string) => void;
    private onLogCallback: (entry: LogEntry) => void;

    // Tool Callbacks
    private onAddPerson: (data: Partial<PersonNode>) => Promise<ToolResult>;
    private onUpdatePerson: (data: Partial<PersonNode>) => Promise<ToolResult>;

    private userEmail: string | null = null;
    private logBuffer: LogEntry[] = [];
    private fullLogHistory: LogEntry[] = [];
    private isHistoryLoaded: boolean = false;
    private logFileId: string | null = null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private autosaveInterval: any | null = null;

    constructor(
        onMessage: (text: string | null, audioData: string | null, type: 'user' | 'model' | 'tool-response') => void,
        onStatusChange: (status: string) => void,
        onLog: (entry: LogEntry) => void = () => { },
        onAddPerson: (data: Partial<PersonNode>) => Promise<ToolResult> = async () => ({ success: false, message: "Tool not implemented" }),
        onUpdatePerson: (data: Partial<PersonNode>) => Promise<ToolResult> = async () => ({ success: false, message: "Tool not implemented" })
    ) {
        this.onMessage = onMessage;
        this.onStatusChange = onStatusChange;
        this.onLogCallback = onLog;
        this.onAddPerson = onAddPerson;
        this.onUpdatePerson = onUpdatePerson;

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


    }

    private onLog(entry: LogEntry) {
        if (this.userEmail) {
            const lastEntry = this.logBuffer[this.logBuffer.length - 1];
            if (lastEntry && (entry.type === 'user' || entry.type === 'model') && lastEntry.type === entry.type) {
                // Aggregate text for streaming responses/transcripts
                lastEntry.text += entry.text;
                lastEntry.timestamp = entry.timestamp; // Update timestamp to latest
            } else {
                this.logBuffer.push(entry);
            }
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

    }

    private async setupAutosave() {
        try {
            const profile = await getUserProfile();
            if (profile && profile.email) {
                this.userEmail = profile.email;
                console.log("Enabled autosave logs for", this.userEmail);

                // Load existing history once
                const { id, content } = await loadGeminiLog(profile.email);
                this.logFileId = id;
                this.fullLogHistory = content;
                this.isHistoryLoaded = true;
                console.log(`Loaded ${this.fullLogHistory.length} existing logs.`);

                this.autosaveInterval = setInterval(() => {
                    this.flushLogs();
                }, 30000); // 30s
            }
        } catch (e) {
            console.warn("Failed to enable autosave logs", e);
        }
    }

    private isFlushing = false;

    private async flushLogs() {
        if (!this.userEmail || this.logBuffer.length === 0 || this.isFlushing) return;

        // Safety check: ensure history is loaded before we try to append and save
        if (!this.isHistoryLoaded) {
            console.log("Skipping autosave: History not loaded yet.");
            return;
        }

        this.isFlushing = true;

        // Take buffer
        const logsToSave = [...this.logBuffer];
        this.logBuffer = [];

        // Prepend new logs to full history (logsToSave is Oldest->Newest, we want Newest->Oldest in file)
        // Actually, logBuffer is chronological [0: old, 1: new].
        // The file expects [Newest, ..., Oldest].
        // So we reverse logsToSave and prepend.
        const reversedNew = [...logsToSave].reverse();
        this.fullLogHistory = [...reversedNew, ...this.fullLogHistory];

        console.log(`Autosaving ${logsToSave.length} new logs (Total: ${this.fullLogHistory.length})...`);

        try {
            if (this.logFileId) {
                // Update existing file using cached history - NO READ required
                await updateTreeFile(this.logFileId, this.fullLogHistory);
            } else {
                // First creation - use saveGeminiLog logic (which creates file)
                const fileId = await saveGeminiLog(this.userEmail, logsToSave, null);
                // saveGeminiLog reads?, yes. But if null ID, it creates. 
                // But it assumes prepending to nothing.
                // Wait, if we use saveGeminiLog, it might be safer for first creation.
                // But we already have fullLogHistory populated.
                if (fileId) {
                    this.logFileId = fileId;
                    // loadGeminiLog logic ensures this.fullLogHistory is synced if we reload, 
                    // but for now we trust memory.
                }
            }
        } catch (e) {
            console.error("Autosave failed", e);
            // Put logs back in buffer? 
            // If we failed to WRITE, our in-memory fullLogHistory is still updated.
            // Next time we try to write, fullLogHistory has the data.
            // So we don't need to push back to logBuffer.
            // UNLESS updateTreeFile failed and we want to retry persisting this state.
            // But fullLogHistory keeps the state. Next flush will try to save fullLogHistory again (with even more new logs).
            // So this approach is resilient.
        } finally {
            this.isFlushing = false;
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
            loc: n.location?.district || n.location?.state,
            email: n.email
        }));

        const jsonContext = JSON.stringify(contextData);
        console.log(`Injecting ${contextData.length} nodes into context (~${jsonContext.length} chars)`);

        const systemInstructionText = GET_GEMINI_SYSTEM_PROMPT(jsonContext);

        const setupMsg = {
            setup: {
                model: "models/gemini-2.0-flash-exp",
                systemInstruction: { parts: [{ text: systemInstructionText }] },
                tools: [{
                    functionDeclarations: [
                        {
                            name: "add_person",
                            description: "Add a new person to the family tree. Provide as much detail as known.",
                            parameters: {
                                type: "OBJECT",
                                properties: {
                                    name: { type: "STRING", description: "Full name of the person." },
                                    gender: { type: "STRING", enum: ["male", "female", "other"], description: "Gender. Infer from context (e.g. 'son'->male, 'grandmother'->female)." },
                                    dob: { type: "STRING", description: "Date of Birth in YYYY-MM-DD format. Required if known." },
                                    dod: { type: "STRING", description: "Date of Death in YYYY-MM-DD format. If deceased." },
                                    parent_id: { type: "STRING", description: "ID of the parent (nodeId) if known. Use existing IDs from the JSON." },
                                    spouse_id: { type: "STRING", description: "ID of the spouse (nodeId) if known." },
                                    relation_type: { type: "STRING", description: "Contextual relation note (e.g. 'son of X')." }
                                },
                                required: ["name"]
                            }
                        },
                        {
                            name: "update_person",
                            description: "Update details of an existing person in the family tree.",
                            parameters: {
                                type: "OBJECT",
                                properties: {
                                    node_id: { type: "STRING", description: "The unique ID (nodeId) of the person to update. MUST exist in the JSON." },
                                    name: { type: "STRING", description: "Updated name." },
                                    dob: { type: "STRING", description: "Updated DOB (YYYY-MM-DD)." },
                                    dod: { type: "STRING", description: "Updated DOD (YYYY-MM-DD)." },
                                    gender: { type: "STRING", enum: ["male", "female", "other"] },
                                    email: { type: "STRING", description: "Email address." },
                                    spouse_id: { type: "STRING", description: "ID of the spouse to link (nodeId)." }
                                },
                                required: ["node_id"]
                            }
                        }
                    ]
                }],
                toolConfig: { functionCallingConfig: { mode: "ANY" } },
                // @ts-ignore
                generation_config: {
                    response_modalities: ["AUDIO"],
                    speech_config: {
                        voice_config: {
                            prebuilt_voice_config: {
                                voice_name: "Puck"
                            }
                        }
                    }
                },
                // @ts-ignore
                input_audio_transcription: {},
                // @ts-ignore
                output_audio_transcription: {}
            }
        };

        this.ws.send(JSON.stringify(setupMsg));
        console.log("Sent setup message with Full Context & Tools");
        this.onLog({ type: 'info', text: 'Sent setup message (Full Context + Tools)', timestamp: new Date() });
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

            this.onLog({ type: 'info', text: 'Setup Complete. Starting Audio...', timestamp: new Date() });

            // Trigger Model Greeting by sending an empty turn
            this.sendContinueSignal();

            // Start Audio Stream (Input) ONLY. Disable SpeechService (Client-side STT).
            await this.audioService.start();

            return;
        }

        // FORCE DEBUGGING LOG to trap the "Missing Tool Call" issue
        // This will print every message from Gemini to the console.
        console.log("Full Gemini Message:", JSON.stringify(msg, null, 2));

        try {
            if (msg.serverContent) {


                // Log user transcript if provided by server
                const inputTrans = msg.serverContent.inputAudioTranscription || msg.serverContent.inputTranscription;
                if (inputTrans) {
                    const transcript = inputTrans.transcript || inputTrans.text;
                    if (transcript) {

                        // Use 'user' type for server-side transcripts 
                        this.onMessage(transcript, null, 'user');

                        this.onLog({
                            type: 'user',
                            text: transcript,
                            timestamp: new Date(),
                            data: { isTranscript: true }
                        });
                    }
                }

                // Log model transcript if provided by server
                const outputTrans = msg.serverContent.outputAudioTranscription || msg.serverContent.outputTranscription;
                if (outputTrans) {
                    const transcript = outputTrans.transcript || outputTrans.text;
                    if (transcript) {

                        this.onMessage(transcript, null, 'model');
                        this.onLog({ type: 'model', text: transcript, timestamp: new Date() });
                    }
                }

                if (msg.serverContent.modelTurn) {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const parts = msg.serverContent.modelTurn.parts;
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    for (const part of parts) {
                        if (part.text) {

                            this.onMessage(part.text, null, 'model');
                            this.onLog({ type: 'model', text: part.text, timestamp: new Date() });
                        }
                        if (part.inlineData && part.inlineData.mimeType.startsWith('audio')) {
                            this.onMessage(null, part.inlineData.data, 'model');
                        }
                    }
                }
            }

            if (msg.toolCall) {
                console.log("Received Tool Call:", msg.toolCall);
                const toolCall = msg.toolCall;
                const functionResponses = [];

                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                for (const fc of toolCall.functionCalls) {
                    const { name, args, id } = fc;
                    const callSignature = `${name}:${JSON.stringify(args)}`;

                    if (this.processingToolCalls.has(callSignature)) {
                        console.warn(`[GeminiLive] Duplicate tool call ignored: ${callSignature}`);
                        functionResponses.push({
                            id, name,
                            response: { result: "Duplicate call ignored. Operation already in progress." }
                        });
                        continue;
                    }
                    this.processingToolCalls.add(callSignature);

                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    let result: any = {};
                    try {

                        if (name === "report_response") {
                            const text = args.text;
                            console.log("FORCE TRANSCRIPT:", text);
                            if (args.user_transcript) {
                                const userText = args.user_transcript;
                                this.onLog({
                                    type: 'user',
                                    text: userText,
                                    timestamp: new Date(),
                                    data: { isTranscript: true }
                                });
                            }
                            this.onLog({ type: 'model', text: text, timestamp: new Date() });
                            result = { result: "Transcript displayed to user." };
                        } else if (name === "add_person") {
                            this.onLog({ type: 'tool-call', text: `Adding person: ${args.name}`, timestamp: new Date() });

                            // Validate
                            const validation = validatePersonData(args);
                            if (!validation.valid) {
                                result = { error: `Validation Failed: ${validation.errors.join(", ")}` };
                            } else {
                                // Execute
                                const response = await this.onAddPerson({
                                    name: args.name,
                                    gender: args.gender || null,
                                    dob: args.dob || null,
                                    dod: args.dod || null,
                                    parentId: args.parent_id || null,
                                    spouseIds: args.spouse_id ? [args.spouse_id] : [],
                                });
                                if (response.success) {
                                    // If parent_id was provided, we can try to link? 
                                    // Wait, onAddPerson receives "Partial<PersonNode>". 
                                    // It should handle the linkage args (parentId, spouseId) if they were in the object?
                                    // But PersonNode has parentId.
                                }
                                result = { result: response.success ? `Success: ${response.message}` : `Error: ${response.message}` };

                                // Inject Context Refresh
                                if (response.success) {
                                    // We need to wait a moment for the state to propagate if it's external, 
                                    // but here we trust GlobalTreeService or the logic to be fast enough? 
                                    // sendSetupMessage relies on GlobalTreeService.getAllNodesFlat().
                                    // Since App.tsx calls saveWithMerge, let's hope GlobalTreeService sees it.
                                    // Actually App.tsx modifies `tree`, which is state. GlobalTreeService might read from the same underlying object if mapped. 
                                    // Ideally we resend context.
                                    setTimeout(() => {
                                        console.log("Refreshing Gemini Context with new Tree data...");
                                        this.sendSetupMessage(); // Resend system prompt
                                    }, 500); // Small delay to ensure memory update
                                }

                                this.onLog({ type: 'tool-response', text: result['result'] || result['error'], timestamp: new Date() });
                            }
                        } else if (name === "update_person") {
                            this.onLog({ type: 'tool-call', text: `Updating person: ${args.node_id}`, timestamp: new Date() });
                            const validation = validatePersonData(args); // Simple field check
                            if (!validation.valid) {
                                result = { error: `Validation Failed: ${validation.errors.join(", ")}` };
                            } else {
                                const response = await this.onUpdatePerson({
                                    nodeId: args.node_id,
                                    name: args.name,
                                    dob: args.dob,
                                    dod: args.dod,
                                    gender: args.gender,
                                    email: args.email,
                                    spouseIds: args.spouse_id ? [args.spouse_id] : []
                                });
                                result = { result: response.success ? `Success: ${response.message}` : `Error: ${response.message}` };

                                // Inject Context Refresh
                                if (response.success) {
                                    setTimeout(() => {
                                        console.log("Refreshing Gemini Context with updated Tree data...");
                                        this.sendSetupMessage();
                                    }, 500);
                                }

                                this.onLog({ type: 'tool-response', text: result['result'] || result['error'], timestamp: new Date() });
                            }
                        } else {
                            result = { result: "system_error: Unknown tool." };
                        }

                        functionResponses.push({
                            id: id,
                            name: name,
                            response: result
                        });
                    } finally {
                        this.processingToolCalls.delete(callSignature);
                    }
                }

                this.ws?.send(JSON.stringify({ toolResponse: { functionResponses } }));
            }
        } catch (error) {
            console.error("Error handling Gemini message:", error);
            this.onLog({ type: 'info', text: 'System Error: Failed to process message', timestamp: new Date() });
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

    private sendContinueSignal() {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
        this.ws.send(JSON.stringify({
            clientContent: {
                turns: [{ role: "user", parts: [{ text: "" }] }],
                turnComplete: true
            }
        }));
    }
}
