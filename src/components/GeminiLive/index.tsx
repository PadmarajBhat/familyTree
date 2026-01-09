import React, { useState, useRef, useEffect } from 'react';
import { GeminiLiveClient } from '../../services/Gemini/client/GeminiLiveClient';
import { AudioRecorder } from '../../services/Gemini/client/AudioRecorder';
import { AudioStreamer } from '../../services/Gemini/client/AudioStreamer';
import { GET_GEMINI_SYSTEM_PROMPT } from '../../services/Gemini/client/systemPrompt';
import type { TreeDocument, PersonNode } from '../../logic/types';
import './GeminiLive.css';

const PROJECT_ID = 'familytree-477808';
const MODEL_ID = 'gemini-live-2.5-flash-native-audio'; // Correct model for Live API from demo
const BACKEND_URL = import.meta.env.VITE_GEMINI_BACKEND_URL || 'ws://localhost:8080';

export const GeminiLiveButton: React.FC<{
    tree: TreeDocument | null,
    currentUser: { email: string; name: string } | null,
    onSaveMember: (data: PersonNode, p: string | null, c: string[], s: string[], sib: string[], shadow: PersonNode[], mode: 'add' | 'edit' | null) => void;
}> = ({ tree, currentUser, onSaveMember }) => {
    const [connected, setConnected] = useState(false);
    const [active, setActive] = useState(false);
    const [setupComplete, setSetupComplete] = useState(false);
    const clientRef = useRef<GeminiLiveClient | null>(null);
    const recorderRef = useRef<AudioRecorder | null>(null);
    const streamerRef = useRef<AudioStreamer | null>(null);

    useEffect(() => {
        // Cleanup on unmount
        return () => {
            disconnect();
        };
    }, []);

    const [chatMessages, setChatMessages] = useState<{ role: 'user' | 'assistant', text: string }[]>([]);

    const treeToCSV = (tree: TreeDocument | null): string => {
        if (!tree || !tree.nodes) return '';
        const rows = Object.values(tree.nodes).map(node => {
            const parentIds = node.parentId ? node.parentId : '';
            const spouseIds = (node.spouseIds || []).join('|');
            return `${node.nodeId}, "${node.name || 'Unknown'}", ${node.gender || 'unknown'}, "${parentIds}", "${spouseIds}"`;
        });
        return rows.join('\n');
    };

    const handleGeminiToolCall = async (client: GeminiLiveClient, call: { name: string, args: any }) => {
        console.log("Gemini Tool Call:", call);
        let result: any = { status: "error", message: "Unknown tool" };

        try {
            if (call.name === 'get_person_details') {
                const node = tree?.nodes[call.args.node_id];
                result = node ? { status: "success", data: node } : { status: "error", message: "Person not found" };
            }
            else if (call.name === 'search_family_tree' && tree) {
                const query = (call.args.query || '').toLowerCase();
                const matches = Object.values(tree.nodes)
                    .filter(n => (n.name || '').toLowerCase().includes(query))
                    .map(n => ({ nodeId: n.nodeId, name: n.name, gender: n.gender }));
                result = { status: "success", matches };
            }
            else if (call.name === 'update_person' && tree) {
                const node = tree.nodes[call.args.node_id];
                if (node) {
                    const updatedNode = { ...node, ...call.args.updates };
                    // Handle nested objects if Gemini sends them
                    if (call.args.updates.location) updatedNode.location = { ...node.location, ...call.args.updates.location };
                    if (call.args.updates.occupation) updatedNode.occupation = { ...node.occupation, ...call.args.updates.occupation };

                    await onSaveMember(updatedNode, updatedNode.parentId, updatedNode.childrenIds, updatedNode.spouseIds, [], [], 'edit');
                    result = { status: "success", message: `Updated ${node.name}` };
                } else {
                    result = { status: "error", message: "Node not found" };
                }
            }
            else if (call.name === 'add_person' && tree) {
                const { name, gender, relation, anchor_node_id, phone, email, dob } = call.args;
                const anchorNode = tree.nodes[anchor_node_id];
                if (!anchorNode) {
                    result = { status: "error", message: "Anchor person not found" };
                } else {
                    const newNode: PersonNode = {
                        nodeId: `person_${Date.now()}`,
                        name,
                        gender,
                        phone: phone || '',
                        phoneE164: '',
                        email: email || '',
                        dob: dob || '',
                        dobApprox: { known: false, year: null, month: null, day: null },
                        dod: null,
                        dodApprox: { known: false, year: null, month: null, day: null },
                        ageProvided: null,
                        dobInferred: false,
                        address: { freeform: '' },
                        imageUrl: null,
                        isEditor: false,
                        editorSince: null,
                        editedBy: currentUser?.email || 'unknown',
                        editedTime: new Date().toISOString(),
                        spouseIds: [],
                        childrenIds: [],
                        parentId: null
                    };

                    let newParentId = null;
                    let newSpouseIds: string[] = [];
                    let newChildrenIds: string[] = [];

                    const rel = relation.toLowerCase();
                    if (rel.includes('father') || rel.includes('mother')) {
                        // New person is parent of anchor
                        newChildrenIds = [anchor_node_id];
                    } else if (rel.includes('son') || rel.includes('daughter')) {
                        // New person is child of anchor
                        newParentId = anchor_node_id;
                    } else if (rel.includes('wife') || rel.includes('husband') || rel.includes('spouse')) {
                        newSpouseIds = [anchor_node_id];
                    }

                    await onSaveMember(newNode, newParentId, newChildrenIds, newSpouseIds, [], [], 'add');
                    result = { status: "success", message: `Added ${name} as ${relation} of ${anchorNode.name}`, nodeId: newNode.nodeId };
                }
            }
        } catch (e) {
            console.error("Tool execution failed", e);
            result = { status: "error", message: String(e) };
        }

        client.sendToolResponse(call.name, result);
    };

    const connect = async () => {
        if (connected) return;

        try {
            setActive(true);
            setChatMessages([]); // Clear chat on new connection

            // Initialize Audio
            const recorder = new AudioRecorder();
            const streamer = new AudioStreamer();

            recorderRef.current = recorder;
            streamerRef.current = streamer;

            // Initialize Client
            const contextData = treeToCSV(tree);
            const systemPrompt = GET_GEMINI_SYSTEM_PROMPT(contextData);

            // Determine user gender and select voice
            let voiceName = "Puck"; // Default
            if (currentUser && tree && tree.nodes) {
                const userNode = Object.values(tree.nodes).find(n => n.email === currentUser.email);
                if (userNode) {
                    if (userNode.gender === 'male') {
                        voiceName = "Kore"; // Female
                    } else if (userNode.gender === 'female') {
                        voiceName = "Charon"; // Male
                    }
                }
            }
            console.log(`Selecting voice: ${voiceName} for user: ${currentUser?.email}`);

            const client = new GeminiLiveClient(BACKEND_URL, PROJECT_ID, MODEL_ID, systemPrompt, voiceName);

            client.onOpen = () => {
                setConnected(true);
                // Start recording
                recorder.onDataAvailable = (data) => {
                    client.sendAudioChunk(data);
                };
                recorder.start();
            };

            client.onClose = () => {
                setConnected(false);
                setActive(false);
                recorder.stop();
            };

            client.onError = (e) => {
                console.error("Gemini Client Error", e);
                setConnected(false);
                setActive(false);
            };

            client.onMessage = (msg) => {
                if (msg.type === 'AUDIO' && msg.data) {
                    streamer.playAudioChunk(msg.data);
                } else if (msg.type === 'SETUP_COMPLETE') {
                    console.log("Gemini Live Setup Complete");
                    setSetupComplete(true);
                } else if (msg.type === 'TOOL_CALL') {
                    handleGeminiToolCall(client, msg.data);
                } else if (msg.type === 'TEXT') {
                    const text = msg.data;
                    if (text) {
                        setChatMessages(prev => {
                            const last = prev[prev.length - 1];
                            if (last && last.role === 'assistant') {
                                return [...prev.slice(0, -1), { role: 'assistant', text: last.text + text }];
                            }
                            return [...prev, { role: 'assistant', text }];
                        });
                    }
                } else if (msg.type === 'INPUT_TRANSCRIPTION') {
                    const text = msg.data?.text;
                    if (text) {
                        setChatMessages(prev => {
                            const last = prev[prev.length - 1];
                            if (last && last.role === 'user') {
                                return [...prev.slice(0, -1), { role: 'user', text: last.text + text }];
                            }
                            return [...prev, { role: 'user', text }];
                        });
                    }
                } else if (msg.type === 'OUTPUT_TRANSCRIPTION') {
                    const text = msg.data?.text;
                    if (text) {
                        setChatMessages(prev => {
                            const last = prev[prev.length - 1];
                            if (last && last.role === 'assistant') {
                                return [...prev.slice(0, -1), { role: 'assistant', text: last.text + text }];
                            }
                            return [...prev, { role: 'assistant', text }];
                        });
                    }
                }
            };

            clientRef.current = client;
            client.connect();

        } catch (e) {
            console.error("Failed to connect", e);
            setActive(false);
        }
    };

    const disconnect = () => {
        if (clientRef.current) {
            clientRef.current.disconnect();
            clientRef.current = null;
        }
        if (recorderRef.current) {
            recorderRef.current.stop();
            recorderRef.current = null;
        }
        setConnected(false);
        setActive(false);
        setSetupComplete(false);
    };

    const handleClick = () => {
        console.log("Gemini Live Button Clicked! Connected:", connected, "Active:", active);
        if (connected) {
            disconnect();
        } else {
            connect();
        }
    };

    return (
        <>
            <button
                className={`gemini-live-btn ${connected ? 'connected' : ''} ${active ? 'active' : ''}`}
                onClick={handleClick}
                disabled={active && !connected}
                title="Start Gemini Live Conversation"
            >
                <div className="btn-content">
                    {connected ? (
                        <>
                            <span className="icon">🛑</span>
                            <span className="text">End Session</span>
                        </>
                    ) : (
                        <>
                            <span className="icon">✨</span>
                            <span className="text">{active ? 'Connecting...' : 'Gemini Live'}</span>
                        </>
                    )}
                </div>
                {connected && <div className="pulse-ring"></div>}
            </button>

            {connected && (
                <div className="chat-overlay">
                    <div className="chat-header">
                        <span>Gemini Live</span>
                        <button className="close-btn" onClick={disconnect} title="End Session">×</button>
                    </div>
                    <div className="chat-messages">
                        {!setupComplete ? (
                            <div className="status-container">
                                <div className="mic-outer">
                                    <div className="mic-inner">⌛</div>
                                </div>
                                <div className="status-badge loading">Please Wait</div>
                                <div className="status-instruction">Initializing Gemini Session...</div>
                            </div>
                        ) : chatMessages.length === 0 ? (
                            <div className="status-container">
                                <div className="mic-outer">
                                    <div className="mic-pulse"></div>
                                    <div className="mic-inner">🎙️</div>
                                </div>
                                <div className="status-badge ready">Ready to Speak</div>
                                <div className="status-instruction">The Family Tree assistant is listening. Go ahead and say something!</div>
                                <div className="waveform">
                                    <div className="wave-bar"></div><div className="wave-bar"></div><div className="wave-bar"></div><div className="wave-bar"></div><div className="wave-bar"></div>
                                </div>
                            </div>
                        ) : null}

                        {chatMessages.map((msg, i) => (
                            <div key={i} className={`message-bubble ${msg.role}`}>
                                {msg.text}
                            </div>
                        ))}
                        <div ref={(el) => el?.scrollIntoView({ behavior: 'smooth' })} />
                    </div>
                </div>
            )}
        </>
    );
};
