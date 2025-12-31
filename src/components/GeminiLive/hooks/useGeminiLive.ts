
import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useLiveAPI } from '../../../hooks/useLiveAPI';
import { AudioRecorder } from '../../../services/GeminiLive/lib/audio-recorder';
import { CONFIG } from '../../../config';
import { GlobalTreeService } from '../../../services/GlobalTreeService';
import { GET_GEMINI_SYSTEM_PROMPT } from '../../../logic/prompts';
import { validatePersonData } from '../../../logic/validation';
import { appendGeminiLogToSheets, getUserProfile } from '../../../services/drive';
import type { LogEntry, ToolResult } from '../../../services/GeminiLive/types';
import type { PersonNode } from '../../../logic/types';
import type { LiveServerToolCall } from '@google/genai';

interface UseGeminiLiveProps {
    onAddPerson: (data: Partial<PersonNode>) => Promise<ToolResult>;
    onUpdatePerson: (data: Partial<PersonNode>) => Promise<ToolResult>;
    onSearchNodes: (query: string) => Promise<PersonNode[]>;
    onGetRecentNodes: (limit: number) => Promise<PersonNode[]>;
    preferredVoice: string;
}

export function useGeminiLive({
    onAddPerson, onUpdatePerson, onSearchNodes, onGetRecentNodes, preferredVoice
}: UseGeminiLiveProps) {
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [userEmail, setUserEmail] = useState<string | null>(null);
    const logBufferRef = useRef<LogEntry[]>([]);
    const [audioRecorder] = useState(() => new AudioRecorder());
    const [isMuted] = useState(false);

    const liveOptions = useMemo(() => ({ apiKey: CONFIG.API_KEY || "" }), []);
    const { client, connected, connect, disconnect, volume } = useLiveAPI(liveOptions);

    const processingToolCalls = useRef<Set<string>>(new Set());

    // Initial setup for user email
    useEffect(() => {
        getUserProfile().then(p => {
            if (p?.email) setUserEmail(p.email);
        });
    }, []);

    // Audio Recording Logic
    useEffect(() => {
        const onData = (base64: string) => {
            client.sendRealtimeInput([{ mimeType: "audio/pcm;rate=16000", data: base64 }]);
        };

        if (connected && !isMuted && audioRecorder) {
            audioRecorder.on("data", onData).start();
        } else {
            audioRecorder.stop();
        }

        return () => {
            audioRecorder.off("data", onData);
        };
    }, [connected, isMuted, client, audioRecorder]);

    // Autosave Interval
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

    const addLog = useCallback((entry: LogEntry) => {
        setLogs(prev => [...prev, entry]);
        if (userEmail) logBufferRef.current.push(entry);
    }, [userEmail]);

    // Client Events
    useEffect(() => {
        const onOpen = () => addLog({ type: 'info', text: 'Connected to Gemini Live', timestamp: new Date() });
        const onClose = (event: CloseEvent) => {
            const reason = event?.reason ? ` (${event.reason})` : '';
            addLog({ type: 'info', text: `Disconnected${reason}`, timestamp: new Date() });
        };
        const onError = (e: ErrorEvent) => addLog({ type: 'info', text: `Error: ${e.message}`, timestamp: new Date() });

        const onContent = (content: any) => {
            if (content.modelTurn && content.modelTurn.parts) {
                for (const part of content.modelTurn.parts) {
                    if (part.text) {
                        addLog({ type: 'model', text: part.text, timestamp: new Date() });
                    }
                }
            }
        };

        const onToolCall = async (toolCall: LiveServerToolCall) => {
            const functionResponses = [];
            if (toolCall.functionCalls) {
                for (const fc of toolCall.functionCalls) {
                    const { name, args: rawArgs, id } = fc;
                    const args = rawArgs as any;
                    const callSignature = `${name}:${JSON.stringify(args)}`;

                    if (processingToolCalls.current.has(callSignature)) {
                        functionResponses.push({ id, name, response: { result: "Duplicate call ignored." } });
                        continue;
                    }
                    processingToolCalls.current.add(callSignature);

                    let result: any = {};
                    try {
                        addLog({ type: 'tool-call', text: `Calling ${name}...`, timestamp: new Date() });

                        if (name === "add_person") {
                            const validation = validatePersonData(args);
                            if (!validation.valid) {
                                result = { error: `Validation Failed: ${validation.errors.join(", ")}` };
                            } else {
                                const response = await onAddPerson({
                                    name: args.name, gender: args.gender, dob: args.dob, parentId: args.parent_id,
                                    spouseIds: args.spouse_id ? [args.spouse_id] : [], phone: args.phone,
                                    location: args.location_district || args.location_state ? {
                                        district: args.location_district || null,
                                        state: args.location_state || null,
                                        country: args.location_country || null,
                                        zipcode: null
                                    } : undefined,
                                    occupation: args.occupation_role || args.occupation_org ? {
                                        role: args.occupation_role, organization: args.occupation_org
                                    } : undefined,
                                });
                                result = { result: response.success ? `Success: ${response.message}` : `Error: ${response.message}` };
                            }
                        } else if (name === "update_person") {
                            const validation = validatePersonData(args);
                            if (!validation.valid) {
                                result = { error: `Validation Failed: ${validation.errors.join(", ")}` };
                            } else {
                                const response = await onUpdatePerson({
                                    nodeId: args.node_id, name: args.name, dob: args.dob, dod: args.dod, gender: args.gender,
                                    email: args.email, spouseIds: args.spouse_id ? [args.spouse_id] : [],
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
                        functionResponses.push({ id, name, response: result });
                    } catch (e: any) {
                        functionResponses.push({ id, name, response: { error: e.message } });
                    } finally {
                        processingToolCalls.current.delete(callSignature);
                    }
                }
                client.sendToolResponse({ functionResponses });
            }
        };

        client.on("open", onOpen).on("close", onClose).on("error", onError).on("content", onContent).on("toolcall", onToolCall);
        return () => {
            client.off("open", onOpen).off("close", onClose).off("error", onError).off("content", onContent).off("toolcall", onToolCall);
        };
    }, [client, addLog, onAddPerson, onUpdatePerson, onSearchNodes, onGetRecentNodes]);

    const handleToggle = () => {
        if (connected) {
            disconnect();
        } else {
            addLog({ type: 'info', text: "Connecting...", timestamp: new Date() });
            const allNodes = GlobalTreeService.getAllNodesFlat();
            const csvContext = "NodeID,Name,Gender,ParentIDs,SpouseIDs\n" + allNodes.map(n =>
                `${n.nodeId},${(n.name || "Unknown").replace(/,/g, " ")},${n.gender || "unknown"},${n.parentId || ""},${(n.spouseIds || []).join('|')}`
            ).join("\n");

            connect({
                systemInstruction: { parts: [{ text: GET_GEMINI_SYSTEM_PROMPT(csvContext) }] },
                responseModalities: ["audio" as any, "text" as any],
                speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: preferredVoice } } },
                tools: [{
                    functionDeclarations: [
                        { name: "add_person", description: "Add a person", parameters: { type: "OBJECT" as any, properties: { name: { type: "STRING" as any } }, required: ["name"] } },
                        { name: "update_person", description: "Update a person", parameters: { type: "OBJECT" as any, properties: { node_id: { type: "STRING" as any } }, required: ["node_id"] } },
                        { name: "search_family_tree", description: "Search tree", parameters: { type: "OBJECT" as any, properties: { query: { type: "STRING" as any } } } },
                        { name: "get_recent_additions", description: "Recent adds", parameters: { type: "OBJECT" as any, properties: { limit: { type: "INTEGER" as any } } } },
                        { name: "get_person_details", description: "Get details", parameters: { type: "OBJECT" as any, properties: { node_id: { type: "STRING" as any } } } },
                    ]
                }]
            });
        }
    };

    return { logs, connected, volume, handleToggle };
}
