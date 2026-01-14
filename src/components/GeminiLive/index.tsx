import React, { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { GeminiLiveClient } from '../../services/Gemini/client/GeminiLiveClient';
import { AudioRecorder } from '../../services/Gemini/client/AudioRecorder';
import { AudioStreamer } from '../../services/Gemini/client/AudioStreamer';
import { GET_GEMINI_SYSTEM_PROMPT } from '../../services/Gemini/client/systemPrompt';
import type { TreeDocument, PersonNode } from '../../logic/types';
import './GeminiLive.css';

const PROJECT_ID = 'familytree-477808';
const MODEL_ID = 'gemini-live-2.5-flash-native-audio'; // Correct model for Live API from demo
const BACKEND_URL = import.meta.env.VITE_GEMINI_BACKEND_URL || 'ws://localhost:8888';

export const GeminiLiveButton: React.FC<{
    tree: TreeDocument | null,
    currentUser: { email: string; name: string } | null,
    onSaveMember?: (data: PersonNode, p: string | null, c: string[], s: string[], sib: string[], shadow: PersonNode[], mode: 'add' | 'edit' | null) => void;
}> = ({ tree, currentUser }) => {
    const { i18n } = useTranslation();
    const [connected, setConnected] = useState(false);
    const [active, setActive] = useState(false);
    const [setupComplete, setSetupComplete] = useState(false);
    const clientRef = useRef<GeminiLiveClient | null>(null);
    const recorderRef = useRef<AudioRecorder | null>(null);
    const streamerRef = useRef<AudioStreamer | null>(null);

    const activeRef = useRef(false);

    useEffect(() => {
        activeRef.current = active;
    }, [active]);

    useEffect(() => {
        // Cleanup on unmount
        return () => {
            disconnect();
        };
    }, []);

    const [chatMessages, setChatMessages] = useState<{ role: 'user' | 'assistant' | 'tool-call', text: string, timestamp: Date }[]>([]);
    const chatMessagesRef = useRef<{ role: 'user' | 'assistant' | 'tool-call', text: string, timestamp: Date }[]>([]);

    useEffect(() => {
        chatMessagesRef.current = chatMessages;
    }, [chatMessages]);


    const connect = async (preserveHistory = false) => {
        if (connected || (activeRef.current && !preserveHistory)) {
            console.log("Already connected or connecting, ignoring request.");
            return;
        }

        try {
            setActive(true);
            setConnected(false); // Reset just in case
            if (!preserveHistory) {
                setChatMessages([]); // Clear chat only on fresh connection
            }
            setSetupComplete(false);
            const recorder = new AudioRecorder();
            const streamer = new AudioStreamer();

            recorderRef.current = recorder;
            streamerRef.current = streamer;

            // Initialize Client
            // System prompt (No CSV context anymore - purely tool-based)
            let systemPrompt = GET_GEMINI_SYSTEM_PROMPT();

            // CONTEXT RESTORATION
            if (preserveHistory) {
                const previousHistory = chatMessagesRef.current;
                if (previousHistory.length > 0) {
                    console.log("♻️ Restoring Context from", previousHistory.length, "messages");
                    const historyText = previousHistory.map(m =>
                        `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.text}`
                    ).join('\n');

                    systemPrompt += `\n\n[SYSTEM: CONNECTION WAS INTERRUPTED AND RESTORED. HERE IS THE RECENT CONVERSATION CONTEXT. DO NOT REPEAT GREETINGS OR PREVIOUS MESSAGES, JUST CONTINUE THE CONVERSATION NATURALLY]\n${historyText}\n[END OF RESTORED CONTEXT]`;
                }
            }

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

            const getLanguageCode = (lang: string) => {
                const map: Record<string, string> = {
                    'kn': 'kn-IN',
                    'hi': 'hi-IN',
                    'ta': 'ta-IN',
                    'te': 'te-IN',
                    'ml': 'ml-IN',
                    'en': 'en-US'
                };
                return map[lang] || 'en-US';
            };

            const languageCode = getLanguageCode(i18n.language);
            console.log(`Setting Input Language: ${languageCode}`);

            const client = new GeminiLiveClient(BACKEND_URL, PROJECT_ID, MODEL_ID, systemPrompt, voiceName, currentUser?.email, languageCode);

            client.onOpen = () => {
                setConnected(true);
                // Start recording
                recorder.onDataAvailable = (data) => {
                    client.sendAudioChunk(data);
                };
                recorder.start();
            };

            client.onClose = (e: CloseEvent) => {
                console.log("Gemini Closed:", e.code, e.reason);
                // 1007/1006 = Network/Audio Error. 
                // 1000/1005 = Normal/No Status, BUT if `active` is true, it means we didn't initiate it -> Unexpected -> Reconnect.
                if (e.code === 1007 || e.code === 1006 || ((e.code === 1000 || e.code === 1005) && activeRef.current)) {
                    console.log("⚠️ Audio/Network Error detected. Attempting SILENT RECONNECT...");
                    // Do NOT set active=false, so UI stays in "Connecting..." mode or similar
                    // Do NOT set connected=false immediately if we want to keep chat overlay?
                    // Actually, we must set connected=false to restart the connection process properly?
                    // But we want to keep the Chat Overlay visible.
                    // The Chat Overlay renders if `connected` is true.
                    // If we set connected=false, it disappears.
                    // We need to keep connected=true visually, or introduce 'isReconnecting' state?
                    // Simplify: Just toggle connected quickly or keep it?
                    // If we keep connected=true, the 'Start/Stop' button says "End Session".
                    // But `connect()` sets `setConnected(false)` at start.

                    // Workaround: We will let it flicker briefly or rely on 'active' to keep button state?
                    // Chat overlay conditional: `{connected && (`
                    // If we want chat overlay to persist during reconnect, we need a separate state or condition.
                    // Let's rely on fast reconnect. User asked for "silent", maybe momentary flicker is okay?
                    // Or change overlay condition to `{ (connected || active) && ...`?

                    recorder.stop();
                    setConnected(false); // This will hide chat overlay momentarily
                    setTimeout(() => {
                        connect(true);
                    }, 500);
                    return;
                }

                setConnected(false);
                setActive(false);
                recorder.stop();
            };

            client.onError = (e) => {
                console.error("Gemini Client Error", e);
                // Do NOT close session here. Let onClose handle the specific error code and close logic.
            };

            client.onMessage = (msg: any) => {
                if (msg.type === 'AUDIO' && msg.data) {
                    streamer.playAudioChunk(msg.data);
                } else if (msg.type === 'SETUP_COMPLETE') {
                    console.log("Gemini Live Setup Complete");
                    setSetupComplete(true);
                    if (clientRef.current) {
                        if (preserveHistory) {
                            clientRef.current.sendTextMessage("[SYSTEM: CONNECTION RESTORED. DO NOT GREET. CONTINUE THE CONVERSATION FROM PREVIOUS CONTEXT.]");
                        } else {
                            clientRef.current.sendTextMessage("The session has started. Please greet the user in Kannada as instructed.");
                        }
                    }
                } else if (msg.type === 'CHAT_HISTORY') {
                    console.log("📜 Received Chat History:", msg.data);
                    const history = msg.data || [];
                    const formattedHistory = history.map((h: any) => ({
                        role: h.role === 'model' ? 'assistant' : 'user', // Map backend role to UI role
                        text: h.text,
                        timestamp: h.timestamp ? new Date(h.timestamp) : new Date() // Parse backend timestamp
                    }));
                    setChatMessages(prev => {
                        // Prepend history to current messages (if any) or just set it
                        // Since this comes on connect, usually we want to replace or prepend.
                        // Assuming connect happens with empty state clearly.
                        return [...formattedHistory, ...prev];
                    });
                } else if (msg.type === 'TREE_UPDATED') {
                    console.log("🌳 Server notified: Family Tree Updated!");
                    // Trigger a re-fetch of the tree if possible, or just notify user
                    // For now, we can just reload the page or trigger the parent onSaveMember if we had a way
                    // But since we are migrating to a DB, the parent should re-fetch from the new API
                    window.location.reload(); // Simple sync for now until we have real-time DB
                } else if (msg.type === 'TEXT') {
                    const text = msg.data;
                    if (text) {
                        setChatMessages(prev => {
                            const last = prev[prev.length - 1];
                            const now = new Date();
                            if (last && last.role === 'assistant') {
                                // If appending, keep original timestamp
                                return [...prev.slice(0, -1), { role: 'assistant', text: last.text + text, timestamp: last.timestamp }];
                            }
                            return [...prev, { role: 'assistant', text, timestamp: now }];
                        });
                    }
                } else if (msg.type === 'INPUT_TRANSCRIPTION') {
                    const text = msg.data?.text;
                    if (text) {
                        setChatMessages(prev => {
                            const last = prev[prev.length - 1];
                            const now = new Date();
                            if (last && last.role === 'user') {
                                return [...prev.slice(0, -1), { role: 'user', text: last.text + text, timestamp: last.timestamp }];
                            }
                            return [...prev, { role: 'user', text, timestamp: now }];
                        });
                    }
                } else if (msg.type === 'OUTPUT_TRANSCRIPTION') {
                    const text = msg.data?.text;
                    if (text) {
                        setChatMessages(prev => {
                            const last = prev[prev.length - 1];
                            const now = new Date();
                            if (last && last.role === 'assistant') {
                                return [...prev.slice(0, -1), { role: 'assistant', text: last.text + text, timestamp: last.timestamp }];
                            }
                            return [...prev, { role: 'assistant', text, timestamp: now }];
                        });
                    }
                } else if (msg.type === 'TOOL_CALL') {
                    const fn = msg.data;
                    console.log("🛠️ Received Tool Call:", fn);
                    const toolName = fn.name;
                    // Format args for display
                    let argsDisplay = "";
                    if (fn.args && typeof fn.args === 'object') {
                        // filtering out long args if needed
                        argsDisplay = JSON.stringify(fn.args);
                    }

                    setChatMessages(prev => {
                        // Deduplicate if the same tool call appears within 2000ms (incase of retries or echoes)
                        // Also check if ANY recent message is identical, not just the absolute last one
                        const isDuplicate = prev.slice(-3).some(m =>
                            m.role === 'tool-call' &&
                            m.text.includes(toolName) &&
                            (new Date().getTime() - m.timestamp.getTime() < 2000)
                        );

                        if (isDuplicate) {
                            console.log("⚠️ Ignoring duplicate tool call display:", toolName);
                            return prev;
                        }

                        return [...prev, {
                            role: 'tool-call' as any,
                            text: `🛠️ ${toolName}${argsDisplay ? `\n${JSON.stringify(JSON.parse(argsDisplay), null, 2)}` : ''}`,
                            timestamp: new Date()
                        }];
                    });
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
        activeRef.current = false; // Prevent reconnect loop
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

            {(connected || active) && (
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
                                <span className="message-timestamp">
                                    {msg.timestamp ? (
                                        (() => {
                                            const now = new Date();
                                            const isToday = now.toDateString() === msg.timestamp.toDateString();
                                            const isThisYear = now.getFullYear() === msg.timestamp.getFullYear();
                                            const timeStr = msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

                                            if (isToday) return timeStr;
                                            if (isThisYear) return `${msg.timestamp.toLocaleDateString([], { month: 'short', day: 'numeric' })}, ${timeStr}`;
                                            return `${msg.timestamp.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}, ${timeStr}`;
                                        })()
                                    ) : ''}
                                </span>
                            </div>
                        ))}
                        <div ref={(el) => el?.scrollIntoView({ behavior: 'smooth' })} />
                    </div>
                </div>
            )}
        </>
    );
};
