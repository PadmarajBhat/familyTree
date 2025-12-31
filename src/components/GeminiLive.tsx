
import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useLiveAPI } from '../hooks/useLiveAPI';
import { AudioRecorder } from '../services/GeminiLive/lib/audio-recorder';
import { CONFIG } from '../config';

import { GlobalTreeService } from '../services/GlobalTreeService';
import { GET_GEMINI_SYSTEM_PROMPT } from '../logic/prompts';
import { validatePersonData } from '../logic/validation';
import { appendGeminiLogToSheets, getUserProfile } from '../services/drive';
import type { LogEntry, ToolResult } from '../services/GeminiLive/types';
import type { PersonNode } from '../logic/types';
import type { LiveServerToolCall } from '@google/genai';
import './GeminiLive.css';

interface GeminiLiveProps {
    onAddPerson: (data: Partial<PersonNode>) => Promise<ToolResult>;
    onUpdatePerson: (data: Partial<PersonNode>) => Promise<ToolResult>;
    onSearchNodes: (query: string) => Promise<PersonNode[]>;
    onGetRecentNodes: (limit: number) => Promise<PersonNode[]>;
    preferredVoice?: string;
}

export const GeminiLive: React.FC<GeminiLiveProps> = ({
    onAddPerson,
    onUpdatePerson,
    onSearchNodes,
    onGetRecentNodes,
    preferredVoice = "Puck"
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const [logs, setLogs] = useState<LogEntry[]>([]);

    // Autosave state
    const [userEmail, setUserEmail] = useState<string | null>(null);
    const logBufferRef = useRef<LogEntry[]>([]);

    // Audio Recorder
    const [audioRecorder] = useState(() => new AudioRecorder());
    const [isMuted] = useState(false);

    const liveOptions = useMemo(() => ({ apiKey: CONFIG.API_KEY || "" }), []);
    const { client, connected, connect, disconnect, volume, setConfig } = useLiveAPI(liveOptions);

    useEffect(() => {
        console.log("GeminiLive mounted. API Key present:", !!CONFIG.API_KEY);
    }, []);

    const processingToolCalls = useRef<Set<string>>(new Set());
    const chatEndRef = useRef<HTMLDivElement>(null);

    // Initial setup for user email
    useEffect(() => {
        getUserProfile().then(p => {
            if (p?.email) setUserEmail(p.email);
        });
    }, []);

    // Scroll to bottom
    useEffect(() => {
        if (chatEndRef.current) {
            chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [logs, isOpen]);

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
            logBufferRef.current = []; // Clear buffer
            try {
                await appendGeminiLogToSheets(userEmail, toSave);
            } catch (e) {
                console.error("Autosave failed", e);
                // potentially put them back?
            }
        }, 30000); // 30s
        return () => clearInterval(interval);
    }, [userEmail]);

    const addLog = useCallback((entry: LogEntry) => {
        setLogs(prev => {
            return [...prev, entry];
        });

        // Add to autosave buffer
        if (userEmail) {
            logBufferRef.current.push(entry);
        }
    }, [userEmail]);

    // Client Events
    useEffect(() => {
        const onOpen = () => {
            addLog({ type: 'info', text: 'Connected to Gemini Live', timestamp: new Date() });
        };
        const onClose = (event: CloseEvent) => {
            const reason = event?.reason ? ` (${event.reason})` : '';
            addLog({ type: 'info', text: `Disconnected${reason}`, timestamp: new Date() });
        };
        const onError = (e: ErrorEvent) => {
            addLog({ type: 'info', text: `Error: ${e.message}`, timestamp: new Date() });
        };

        // We can use the client's "content" event for model text
        const onContent = (content: any) => {
            console.log("GeminiLive: Handling content:", content);
            if (content.modelTurn && content.modelTurn.parts) {
                const parts = content.modelTurn.parts;
                console.log("GeminiLive: Model Parts:", parts);
                for (const part of parts) {
                    if (part.text) {
                        addLog({
                            type: 'model',
                            text: part.text,
                            timestamp: new Date()
                        });
                    }
                }
            }
        };

        // Handle Tool Calls
        const onToolCall = async (toolCall: LiveServerToolCall) => {
            console.log("Tool Call:", toolCall);
            const functionResponses = [];

            if (toolCall.functionCalls) {
                for (const fc of toolCall.functionCalls) {
                    const { name, args: rawArgs, id } = fc;
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const args = rawArgs as any;
                    const callSignature = `${name}:${JSON.stringify(args)}`;

                    if (processingToolCalls.current.has(callSignature)) {
                        functionResponses.push({
                            id, name,
                            response: { result: "Duplicate call ignored." }
                        });
                        continue;
                    }
                    processingToolCalls.current.add(callSignature);

                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    let result: any = {};
                    try {
                        // Add Log
                        addLog({ type: 'tool-call', text: `Calling ${name}...`, timestamp: new Date() });

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
                                    spouseIds: args.spouse_id ? [args.spouse_id] : [],
                                    phone: args.phone,
                                    location: (args.location_district || args.location_state || args.location_country) ? {
                                        district: args.location_district,
                                        state: args.location_state,
                                        country: args.location_country,
                                        zipcode: null
                                    } : undefined,
                                    occupation: (args.occupation_role || args.occupation_org) ? {
                                        role: args.occupation_role,
                                        organization: args.occupation_org
                                    } : undefined,
                                    education: (args.education_degree || args.education_major) ? [{
                                        degree: args.education_degree,
                                        major: args.education_major
                                    }] : undefined,
                                    hobbies: args.hobbies ? (args.hobbies as string).split(',').map(s => s.trim()) : undefined
                                });
                                result = { result: response.success ? `Success: ${response.message}` : `Error: ${response.message}` };
                            }
                        } else if (name === "update_person") {
                            const validation = validatePersonData(args);
                            if (!validation.valid) {
                                result = { error: `Validation Failed: ${validation.errors.join(", ")}` };
                            } else {
                                const response = await onUpdatePerson({
                                    nodeId: args.node_id,
                                    name: args.name,
                                    dob: args.dob,
                                    dod: args.dod,
                                    gender: args.gender,
                                    email: args.email,
                                    spouseIds: args.spouse_id ? [args.spouse_id] : [],
                                    phone: args.phone,
                                    location: (args.location_district || args.location_state || args.location_country) ? {
                                        district: args.location_district,
                                        state: args.location_state,
                                        country: args.location_country,
                                        zipcode: null
                                    } : undefined,
                                    occupation: (args.occupation_role || args.occupation_org) ? {
                                        role: args.occupation_role,
                                        organization: args.occupation_org
                                    } : undefined,
                                    education: (args.education_degree || args.education_major) ? [{
                                        degree: args.education_degree,
                                        major: args.education_major
                                    }] : undefined,
                                    hobbies: args.hobbies ? (args.hobbies as string).split(',').map(s => s.trim()) : undefined
                                });
                                result = { result: response.success ? `Success: ${response.message}` : `Error: ${response.message}` };
                            }
                        } else if (name === "search_family_tree") {
                            const nodes = await onSearchNodes(args.query);
                            result = { results: nodes.map(n => ({ id: n.nodeId, name: n.name, dob: n.dob, email: n.email })) };
                        } else if (name === "get_recent_additions") {
                            const limit = typeof args.limit === 'number' ? args.limit : 10;
                            const nodes = await onGetRecentNodes(limit);
                            result = { results: nodes.map(n => ({ id: n.nodeId, name: n.name, dob: n.dob, email: n.email, added: (n as any).lastUpdated })) };
                        } else if (name === "get_person_details") {
                            const all = GlobalTreeService.getAllNodesFlat();
                            const found = all.find(n => n.nodeId === args.node_id);
                            if (found) {
                                result = {
                                    result: {
                                        nodeId: found.nodeId, name: found.name, gender: found.gender, dob: found.dob, dod: found.dod,
                                        location: found.location, occupation: found.occupation, education: found.education,
                                        hobbies: found.hobbies, phone: found.phone, email: found.email, spouseIds: found.spouseIds,
                                        parentId: found.parentId, childrenIds: found.childrenIds, notes: found.notes, address: found.address
                                    }
                                };
                            } else {
                                result = { error: "Person not found." };
                            }
                        } else {
                            result = { result: "system_error: Unknown tool." };
                        }

                        addLog({ type: 'tool-response', text: JSON.stringify(result).substring(0, 100) + "...", timestamp: new Date() });

                        functionResponses.push({
                            id: id,
                            name: name,
                            response: result
                        });

                    } catch (e: any) {
                        console.error("Tool execution error", e);
                        functionResponses.push({ id, name, response: { error: e.message } });
                    } finally {
                        processingToolCalls.current.delete(callSignature);
                    }
                }
                client.sendToolResponse({ functionResponses });
            }
        };

        client.on("open", onOpen);
        client.on("close", onClose);
        client.on("error", onError);
        client.on("content", onContent);
        client.on("toolcall", onToolCall);

        return () => {
            client.off("open", onOpen);
            client.off("close", onClose);
            client.off("error", onError);
            client.off("content", onContent);
            client.off("toolcall", onToolCall);
        };
    }, [client, addLog, onAddPerson, onUpdatePerson, onSearchNodes, onGetRecentNodes, setConfig]); // Added setConfig to deps if needed, though usually stable


    const handleToggle = () => {
        console.log("handleToggle called, connected:", connected);
        if (connected) {
            console.log("Disconnecting...");
            disconnect();
        } else {
            console.log("Starting connection process...");
            addLog({ type: 'info', text: "Connecting...", timestamp: new Date() });
            // Build Context
            const allNodes = GlobalTreeService.getAllNodesFlat();
            // Create simplified CSV Context
            const csvHeader = "NodeID,Name,Gender,ParentIDs,SpouseIDs\n";
            const csvRows = allNodes.map(n => {
                const pIds = n.parentId ? n.parentId : "";
                const sIds = n.spouseIds ? n.spouseIds.join('|') : "";
                const gender = n.gender || "unknown";
                const name = (n.name || "Unknown").replace(/,/g, " ");
                return `${n.nodeId},${name},${gender},${pIds},${sIds}`;
            });

            const csvContext = csvHeader + csvRows.join("\n");
            const systemInstructionText = GET_GEMINI_SYSTEM_PROMPT(csvContext);

            // Connect with Config
            connect({
                systemInstruction: { parts: [{ text: systemInstructionText }] },
                responseModalities: ["AUDIO" as any, "TEXT" as any],
                speechConfig: {
                    voiceConfig: {
                        prebuiltVoiceConfig: {
                            voiceName: preferredVoice
                        }
                    }
                },
                tools: [{
                    functionDeclarations: [
                        {
                            name: "add_person",
                            description: "Add a new person to the family tree. Provide as much detail as known.",
                            parameters: {
                                type: "OBJECT" as any,
                                properties: {
                                    name: { type: "STRING" as any, description: "Full name of the person." },
                                    gender: { type: "STRING" as any, enum: ["male", "female", "other"], description: "Gender. Infer from context." },
                                    dob: { type: "STRING" as any, description: "Date of Birth in YYYY-MM-DD format." },
                                    dod: { type: "STRING" as any, description: "Date of Death in YYYY-MM-DD format." },
                                    parent_id: { type: "STRING" as any, description: "ID of the parent (nodeId)." },
                                    spouse_id: { type: "STRING" as any, description: "ID of the spouse (nodeId)." },
                                    phone: { type: "STRING" as any },
                                    location_district: { type: "STRING" as any },
                                    location_state: { type: "STRING" as any },
                                    location_country: { type: "STRING" as any },
                                    occupation_role: { type: "STRING" as any },
                                    occupation_org: { type: "STRING" as any },
                                    education_degree: { type: "STRING" as any },
                                    education_major: { type: "STRING" as any },
                                    hobbies: { type: "STRING" as any },
                                    relation_type: { type: "STRING" as any }
                                },
                                required: ["name"]
                            }
                        },
                        {
                            name: "update_person",
                            description: "Update details of an existing person in the family tree.",
                            parameters: {
                                type: "OBJECT" as any,
                                properties: {
                                    node_id: { type: "STRING" as any, description: "The unique ID (nodeId)." },
                                    name: { type: "STRING" as any },
                                    dob: { type: "STRING" as any },
                                    dod: { type: "STRING" as any },
                                    gender: { type: "STRING" as any, enum: ["male", "female", "other"] },
                                    email: { type: "STRING" as any },
                                    spouse_id: { type: "STRING" as any },
                                    phone: { type: "STRING" as any },
                                    location_district: { type: "STRING" as any },
                                    location_state: { type: "STRING" as any },
                                    location_country: { type: "STRING" as any },
                                    occupation_role: { type: "STRING" as any },
                                    occupation_org: { type: "STRING" as any },
                                    education_degree: { type: "STRING" as any },
                                    education_major: { type: "STRING" as any },
                                    hobbies: { type: "STRING" as any }
                                },
                                required: ["node_id"]
                            }
                        },
                        {
                            name: "search_family_tree",
                            description: "Search the family tree directly for someone.",
                            parameters: {
                                type: "OBJECT" as any,
                                properties: { query: { type: "STRING" as any } },
                                required: ["query"]
                            }
                        },
                        {
                            name: "get_recent_additions",
                            description: "Get the last 10 people added to the family tree.",
                            parameters: {
                                type: "OBJECT" as any,
                                properties: { limit: { type: "INTEGER" as any } }
                            }
                        },
                        {
                            name: "get_person_details",
                            description: "Get FULL details for a specific person.",
                            parameters: {
                                type: "OBJECT" as any,
                                properties: { node_id: { type: "STRING" as any } },
                                required: ["node_id"]
                            }
                        }
                    ]
                }]
            });
        }
    };

    // UI Rendering
    return (
        <div className={`gemini-live-container ${isOpen ? 'open' : ''}`}>
            {!isOpen && (
                <button className="gemini-fab" onClick={() => setIsOpen(true)} title="Ask Gemini Live">
                    <span role="img" aria-label="sparkles">✨</span>
                </button>
            )}

            {isOpen && (
                <div className="gemini-panel">
                    <div className="gemini-header">
                        <h3>Gemini Live {connected ? "(On)" : ""}</h3>
                        <button className="close-btn" onClick={() => setIsOpen(false)}>×</button>
                    </div>
                    <div className="gemini-content">
                        <div className="transcript-area">
                            {logs.length === 0 && (
                                <div style={{ textAlign: 'center', color: '#9ca3af', marginTop: '50%' }}>
                                    Tap start to chat...
                                </div>
                            )}
                            {logs.map((log, i) => (
                                <div key={i} className={`message-row ${log.type}`}>
                                    {log.text}
                                </div>
                            ))}
                            <div ref={chatEndRef} />
                        </div>
                        {connected && (
                            <div className="visualizer-container">
                                <div className="pulse-indicator" style={{ transform: `scale(${1 + volume * 2})` }}>
                                    <div className="pulse-core"></div>
                                </div>
                                <div className="status-label">Listening...</div>
                            </div>
                        )}
                    </div>
                    <div className="gemini-footer">
                        <button className={`control-btn ${connected ? 'stop' : 'start'}`} onClick={handleToggle}>
                            {connected ? 'End Session' : 'Start Live Chat'}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};
