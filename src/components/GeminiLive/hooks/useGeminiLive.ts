import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { AudioRecorder } from '../../../services/GeminiLive/lib/audio-recorder';
import { AudioStreamer } from '../../../services/GeminiLive/lib/audio-streamer/index';
import { audioContext } from '../../../services/GeminiLive/lib/utils';
import { CONFIG } from '../../../config';
import { GlobalTreeService } from '../../../services/GlobalTreeService';
import { GET_GEMINI_SYSTEM_PROMPT } from '../../../logic/prompts';
import { validatePersonData } from '../../../logic/validation';
import { appendGeminiLogToSheets, getUserProfile } from '../../../services/drive';
import type { LogEntry, ToolResult } from '../../../services/GeminiLive/types';
import type { PersonNode } from '../../../logic/types';

interface UseGeminiLiveProps {
    onAddPerson: (data: Partial<PersonNode>) => Promise<ToolResult>;
    onUpdatePerson: (nodeId: string, data: Partial<PersonNode>) => Promise<ToolResult>;
    onSearchNodes: (query: string) => Promise<PersonNode[]>;
    onGetRecentNodes: (limit: number) => Promise<PersonNode[]>;
    preferredVoice: string;
}

export function useGeminiLive({
    onAddPerson, onUpdatePerson, onSearchNodes, onGetRecentNodes, preferredVoice
}: UseGeminiLiveProps) {
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [userEmail, setUserEmail] = useState<string | null>(null);
    const [connected, setConnected] = useState(false);
    const [isActive, setIsActive] = useState(false);
    const [volume, setVolume] = useState(0);

    const logBufferRef = useRef<LogEntry[]>([]);
    const wsRef = useRef<WebSocket | null>(null);
    const isActiveRef = useRef(false); // Ref for accessing state in closures
    const audioRecorderRef = useRef<AudioRecorder | null>(null);
    const audioStreamerRef = useRef<AudioStreamer | null>(null);

    // Initial setup
    useEffect(() => {
        getUserProfile().then(p => {
            if (p?.email) setUserEmail(p.email);
        });

        // Initialize Audio Recorder
        audioRecorderRef.current = new AudioRecorder();

        // Initialize Audio Streamer
        audioContext({ id: "audio-out" }).then((ctx) => {
            audioStreamerRef.current = new AudioStreamer(ctx);
        });

        return () => {
            audioRecorderRef.current?.stop();
            wsRef.current?.close();
        };
    }, []);

    const addLog = useCallback((entry: LogEntry) => {
        setLogs(prev => [...prev, entry]);
        if (userEmail) logBufferRef.current.push(entry);
    }, [userEmail]);

    // Autosave Logs
    useEffect(() => {
        if (!userEmail) return;
        const interval = setInterval(async () => {
            if (logBufferRef.current.length === 0) return;
            const toSave = [...logBufferRef.current];
            logBufferRef.current = [];
            try {
                await appendGeminiLogToSheets(userEmail, toSave);
            } catch (e) {
                console.error("Autosave failed", e);
            }
        }, 30000);
        return () => clearInterval(interval);
    }, [userEmail]);

    // Handle Mic Toggle (Active State)
    useEffect(() => {
        isActiveRef.current = isActive; // Sync Ref
        if (!isActive) {
            // User stopped mic -> Tell Gemini to finish turn (Piggybacked or Direct)
            if (wsRef.current?.readyState === WebSocket.OPEN) {
                console.log(`Mic stopped. Sending End-of-Turn signal. (State: ${wsRef.current.readyState})`);
                wsRef.current.send(JSON.stringify({
                    endOfTurn: true
                }));
            }
        }
    }, [isActive]);
    // Handle Mic Data with Batching
    useEffect(() => {
        const recorder = audioRecorderRef.current;
        if (!recorder) return;

        const audioBuffer: any[] = [];
        let flushInterval: ReturnType<typeof setInterval> | null = null;

        const flushAudio = () => {
            if (audioBuffer.length > 0 && wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
                const chunksToSend = [...audioBuffer];
                audioBuffer.length = 0; // Clear buffer immediately

                wsRef.current.send(JSON.stringify({
                    realtimeInput: {
                        mediaChunks: chunksToSend
                    }
                }));
            }
        };

        const onData = (base64: string) => {
            if (!isActiveRef.current) return; // Drop audio if muted
            audioBuffer.push({
                mimeType: "audio/pcm",
                data: base64
            });
            // If buffer gets too large, flush immediately to avoid lag spikes
            if (audioBuffer.length >= 10) {
                flushAudio();
            }
        };

        const onVolume = (vol: number) => setVolume(vol);

        recorder.on("data", onData);
        recorder.on("volume", onVolume);

        // DEBUG: Send sample rate to backend verify mismatch
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN && recorder.audioContext) {
            console.log("Sending clientDebug sampleRate:", recorder.audioContext.sampleRate);
            wsRef.current.send(JSON.stringify({
                clientDebug: {
                    sampleRate: recorder.audioContext.sampleRate
                }
            }));
        }

        // Flush every 100ms to throttle WebSocket messages
        flushInterval = setInterval(flushAudio, 100);

        return () => {
            recorder.off("data", onData);
            recorder.off("volume", onVolume);
            if (flushInterval) clearInterval(flushInterval);
        };
    }, []);

    const connect = useCallback(async () => {
        if (connected) return;

        addLog({ type: 'info', text: "Connecting to Backend Proxy...", timestamp: new Date() });

        try {
            const ws = new WebSocket(CONFIG.BACKEND_URL);
            wsRef.current = ws;

            ws.onopen = async () => {
                setConnected(true);
                addLog({ type: 'info', text: 'Connected.', timestamp: new Date() });
                setIsActive(true); // Auto-start Mic

                // Start Mic
                try {
                    await audioRecorderRef.current?.start();
                    await audioStreamerRef.current?.resume();
                } catch (e) {
                    console.error("Mic error", e);
                    addLog({ type: 'info', text: 'Microphone access denied.', timestamp: new Date() });
                }

                // Send Setup Config
                const allNodes = GlobalTreeService.getAllNodesFlat();
                const csvContext = "NodeID,Name,Gender,ParentIDs,SpouseIDs\n" + allNodes.map(n =>
                    `${n.nodeId},${(n.name || "Unknown").replace(/,/g, " ")},${n.gender || "unknown"},${n.parentId || ""},${(n.spouseIds || []).join('|')}`
                ).join("\n");

                const config = {
                    model: "models/gemini-2.0-flash-exp",
                    generationConfig: {
                        responseModalities: ["AUDIO"],
                        speechConfig: {
                            voiceConfig: {
                                prebuiltVoiceConfig: {
                                    voiceName: preferredVoice || "Aoede"
                                }
                            }
                        }
                    },
                    systemInstruction: {
                        parts: [{ text: GET_GEMINI_SYSTEM_PROMPT(csvContext) }]
                    },
                    tools: [{
                        functionDeclarations: [
                            {
                                name: "add_person",
                                description: "Add a person to the family tree",
                                parameters: {
                                    type: "object",
                                    properties: {
                                        name: { type: "string" },
                                        gender: { type: "string", enum: ["male", "female", "other"] },
                                        dob: { type: "string", description: "Date of birth in YYYY-MM-DD format" },
                                        phone: { type: "string", description: "Mobile number" },
                                        email: { type: "string" },
                                        address: { type: "string", description: "Full address or location" },
                                        occupation: { type: "string", description: "Job title or role" },
                                        hobbies: { type: "string", description: "Comma-separated list of hobbies" },
                                        notes: { type: "string" },
                                        parent_id: { type: "string" },
                                        spouse_ids: { type: "array", items: { type: "string" } }
                                    },
                                    required: ["name"]
                                }
                            },
                            {
                                name: "update_person",
                                description: "Update details of an existing person",
                                parameters: {
                                    type: "object",
                                    properties: {
                                        node_id: { type: "string" },
                                        name: { type: "string" },
                                        gender: { type: "string", enum: ["male", "female", "other"] },
                                        dob: { type: "string", description: "Date of birth in YYYY-MM-DD format" },
                                        phone: { type: "string", description: "Mobile number" },
                                        email: { type: "string" },
                                        address: { type: "string" },
                                        occupation: { type: "string" },
                                        hobbies: { type: "string" },
                                        notes: { type: "string" }
                                    },
                                    required: ["node_id"]
                                }
                            },
                            { name: "search_family_tree", description: "Search tree", parameters: { type: "object", properties: { query: { type: "string" } } } },
                            { name: "get_recent_additions", description: "Recent adds", parameters: { type: "object", properties: { limit: { type: "integer" } } } },
                            { name: "get_person_details", description: "Get details", parameters: { type: "object", properties: { node_id: { type: "string" } } } },
                        ]
                    }]
                };
                ws.send(JSON.stringify({ setup: config }));
                console.log("Configuration sent to backend.");
            };

            ws.onclose = () => {
                setConnected(false);
                addLog({ type: 'info', text: 'Disconnected.', timestamp: new Date() });
                audioRecorderRef.current?.stop();
            };

            ws.onerror = (e) => {
                console.error("WS Error", e);
                addLog({ type: 'info', text: 'Connection Error.', timestamp: new Date() });
            };

            ws.onmessage = async (event) => {
                try {
                    const msg = JSON.parse(event.data);

                    if (msg.text) {
                        addLog({ type: 'model', text: msg.text, timestamp: new Date() });
                    }
                    else if (msg.audio) {
                        // Play Audio
                        const audioData = new Uint8Array(atob(msg.audio).split("").map(c => c.charCodeAt(0)));
                        audioStreamerRef.current?.addPCM16(audioData);
                    }
                    else if (msg.toolCall) {
                        const functionResponses = [];
                        for (const fc of msg.toolCall.functionCalls) {
                            const { name, args, id } = fc;

                            addLog({ type: 'tool-call', text: `Executing ${name}...`, timestamp: new Date() });

                            let result: any = {};
                            try {
                                if (name === "add_person") {
                                    const validation = validatePersonData(args);
                                    if (!validation.valid) {
                                        result = { error: `Validation Failed: ${validation.errors.join(", ")}` };
                                    } else {
                                        const response = await onAddPerson({
                                            name: args.name,
                                            gender: args.gender,
                                            dob: args.dob,
                                            parentId: args.parent_id,
                                            spouseIds: args.spouse_ids || (args.spouse_id ? [args.spouse_id] : []),
                                            phone: args.phone,
                                            email: args.email,
                                            address: args.address ? { freeform: args.address } : undefined,
                                            occupation: args.occupation ? { role: args.occupation, organization: '' } : undefined,
                                            hobbies: args.hobbies ? (Array.isArray(args.hobbies) ? args.hobbies : args.hobbies.split(',').map((s: string) => s.trim())) : undefined,
                                            notes: args.notes,
                                        });
                                        result = { result: response.success ? `Success: ${response.message}` : `Error: ${response.message}` };
                                    }
                                } else if (name === "update_person") {
                                    const validation = validatePersonData(args);
                                    if (!validation.valid) {
                                        result = { error: `Validation Failed: ${validation.errors.join(", ")}` };
                                    } else {
                                        const response = await onUpdatePerson(args.node_id, {
                                            name: args.name,
                                            gender: args.gender,
                                            dob: args.dob,
                                            dod: args.dod,
                                            email: args.email,
                                            phone: args.phone,
                                            address: args.address ? { freeform: args.address } : undefined,
                                            occupation: args.occupation ? { role: args.occupation, organization: '' } : undefined,
                                            hobbies: args.hobbies ? (Array.isArray(args.hobbies) ? args.hobbies : args.hobbies.split(',').map((s: string) => s.trim())) : undefined,
                                            notes: args.notes,
                                        });
                                        result = { result: response.success ? `Success: ${response.message}` : `Error: ${response.message}` };
                                    }
                                } else if (name === "search_family_tree") {
                                    const nodes = await onSearchNodes(args.query);
                                    result = { results: nodes.map(n => ({ id: n.nodeId, name: n.name })) };
                                } else if (name === "get_recent_additions") {
                                    const nodes = await onGetRecentNodes(args.limit || 10);
                                    result = { results: nodes.map(n => ({ id: n.nodeId, name: n.name })) };
                                } else if (name === "get_person_details") {
                                    const all = GlobalTreeService.getAllNodesFlat();
                                    const found = all.find(n => n.nodeId === args.node_id);
                                    result = found ? { result: found } : { error: "Person not found." };
                                }

                                addLog({ type: 'tool-response', text: JSON.stringify(result).substring(0, 100) + "...", timestamp: new Date() });
                                functionResponses.push({ name, response: result, id });
                            } catch (e: any) {
                                functionResponses.push({ name, response: { error: e.message }, id });
                            }
                        }
                        ws.send(JSON.stringify({ toolResponse: { functionResponses } }));
                    }

                } catch (e) {
                    console.error("Error processing message", e);
                }
            };

        } catch (e) {
            console.error("Connection failed", e);
        }
    }, [connected, onAddPerson, onUpdatePerson, onSearchNodes, onGetRecentNodes, preferredVoice, addLog]);

    const disconnect = useCallback(() => {
        if (wsRef.current) {
            wsRef.current.close();
            wsRef.current = null;
        }
        setConnected(false);
    }, []);

    const handleToggle = useCallback(() => {
        if (connected) {
            disconnect();
        } else {
            connect();
        }
    }, [connected, connect, disconnect]);

    const toggleMic = useCallback(() => {
        setIsActive(prev => !prev);
    }, []);

    return {
        logs,
        connected,
        isActive,
        volume,
        handleToggle,
        toggleMic
    };
}
