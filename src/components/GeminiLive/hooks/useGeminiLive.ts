import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { GeminiLiveClient } from '../../../services/Gemini/client/GeminiLiveClient';
import { AudioRecorder } from '../../../services/Gemini/client/AudioRecorder';
import { AudioStreamer } from '../../../services/Gemini/client/AudioStreamer';
import { GET_GEMINI_SYSTEM_PROMPT } from '../../../services/Gemini/client/systemPrompt';
import type { TreeDocument } from '../../../logic/types';

const PROJECT_ID = 'familytree-477808';
const MODEL_ID = 'gemini-live-2.5-flash-native-audio';
const BACKEND_URL = import.meta.env.VITE_GEMINI_BACKEND_URL || 'ws://localhost:8888';

export interface ChatMessage {
    role: 'user' | 'assistant' | 'tool-call';
    text: string;
    timestamp: Date;
}

export const useGeminiLive = (
    tree: TreeDocument | null,
    currentUser: { email: string; name: string } | null
) => {
    const { i18n } = useTranslation();
    const [connected, setConnected] = useState(false);
    const [active, setActive] = useState(false);
    const [setupComplete, setSetupComplete] = useState(false);
    const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);

    const clientRef = useRef<GeminiLiveClient | null>(null);
    const recorderRef = useRef<AudioRecorder | null>(null);
    const streamerRef = useRef<AudioStreamer | null>(null);
    const activeRef = useRef(false);
    const reconnectAttemptsRef = useRef(0);
    const chatMessagesRef = useRef<ChatMessage[]>([]);
    const connectionTimeoutRef = useRef<number | null>(null);
    const autoCloseTimeoutRef = useRef<number | null>(null);

    const MAX_RECONNECT_ATTEMPTS = 3;

    useEffect(() => {
        activeRef.current = active;
        if (!active) {
            reconnectAttemptsRef.current = 0;
        }
    }, [active]);

    useEffect(() => {
        chatMessagesRef.current = chatMessages;
    }, [chatMessages]);

    useEffect(() => {
        return () => {
            disconnect();
        };
    }, []);

    const resetAutoCloseTimer = () => {
        if (autoCloseTimeoutRef.current) clearTimeout(autoCloseTimeoutRef.current);
        autoCloseTimeoutRef.current = setTimeout(() => {
            console.log("⏱️ Auto-closing session due to 30s inactivity.");
            disconnect();
        }, 30000);
    };

    const disconnect = () => {
        if (connectionTimeoutRef.current) clearTimeout(connectionTimeoutRef.current);
        if (autoCloseTimeoutRef.current) clearTimeout(autoCloseTimeoutRef.current);

        activeRef.current = false;

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

    const connect = async (preserveHistory = false) => {
        if (connected || (activeRef.current && !preserveHistory)) {
            console.log("Already connected or connecting, ignoring request.");
            return;
        }

        try {
            setActive(true);
            setConnected(false);
            if (!preserveHistory) {
                setChatMessages([]);
            }
            setSetupComplete(false);

            const recorder = new AudioRecorder();
            const streamer = new AudioStreamer();
            recorderRef.current = recorder;
            streamerRef.current = streamer;

            if (connectionTimeoutRef.current) clearTimeout(connectionTimeoutRef.current);
            connectionTimeoutRef.current = setTimeout(() => {
                console.warn("Connection timed out. Resetting state.");
                disconnect();
            }, 10000);

            let systemPrompt = GET_GEMINI_SYSTEM_PROMPT();

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

            let voiceName = "Puck";
            if (currentUser && tree && tree.nodes) {
                const userNode = Object.values(tree.nodes).find(n => n.email === currentUser.email);
                if (userNode) {
                    if (userNode.gender === 'male') voiceName = "Kore";
                    else if (userNode.gender === 'female') voiceName = "Charon";
                }
            }

            const getLanguageCode = (lang: string) => {
                const map: Record<string, string> = {
                    'kn': 'kn-IN', 'hi': 'hi-IN', 'ta': 'ta-IN', 'te': 'te-IN', 'ml': 'ml-IN', 'en': 'en-US'
                };
                return map[lang] || 'en-US';
            };
            const languageCode = getLanguageCode(i18n.language);

            const client = new GeminiLiveClient(BACKEND_URL, PROJECT_ID, MODEL_ID, systemPrompt, voiceName, currentUser?.email, languageCode);

            client.onOpen = () => {
                if (connectionTimeoutRef.current) clearTimeout(connectionTimeoutRef.current);
                if (!activeRef.current) {
                    client.disconnect();
                    return;
                }
                setConnected(true);
                reconnectAttemptsRef.current = 0;
                resetAutoCloseTimer();
                recorder.onDataAvailable = (data) => client.sendAudioChunk(data);
                recorder.start();
            };

            client.onClose = (e: CloseEvent) => {
                console.log("Gemini Closed:", e.code, e.reason);
                if (connectionTimeoutRef.current) clearTimeout(connectionTimeoutRef.current);

                if (activeRef.current && (e.code === 1007 || e.code === 1006 || e.code === 1000 || e.code === 1005)) {
                    if (reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS) {
                        reconnectAttemptsRef.current += 1;
                        console.log(`⚠️ Attempting SILENT RECONNECT (${reconnectAttemptsRef.current}/${MAX_RECONNECT_ATTEMPTS})...`);
                        recorder.stop();
                        setConnected(false);
                        setTimeout(() => connect(true), 500 * reconnectAttemptsRef.current);
                        return;
                    }
                }
                disconnect();
            };

            client.onError = (e) => console.error("Gemini Client Error", e);

            client.onMessage = (msg: any) => {
                if (['AUDIO', 'TEXT', 'INPUT_TRANSCRIPTION', 'OUTPUT_TRANSCRIPTION', 'TOOL_CALL'].includes(msg.type)) {
                    resetAutoCloseTimer();
                }

                if (msg.type === 'AUDIO' && msg.data) {
                    streamer.playAudioChunk(msg.data);
                } else if (msg.type === 'SETUP_COMPLETE') {
                    setSetupComplete(true);
                    if (clientRef.current) {
                        if (preserveHistory) {
                            clientRef.current.sendTextMessage("[SYSTEM: CONNECTION RESTORED. DO NOT GREET.]");
                        } else {
                            clientRef.current.sendTextMessage("The session has started. Please greet the user in Kannada as instructed.");
                        }
                    }
                } else if (msg.type === 'CHAT_HISTORY') {
                    const history = msg.data || [];
                    const formattedHistory = history.map((h: any) => ({
                        role: h.role === 'model' ? 'assistant' : (h.role === 'tool-call' ? 'tool-call' : 'user'),
                        text: h.text,
                        timestamp: h.timestamp ? new Date(h.timestamp) : new Date()
                    }));
                    setChatMessages(prev => [...formattedHistory, ...prev]);
                } else if (msg.type === 'TREE_UPDATED') {
                    window.location.reload();
                } else if (msg.type === 'TEXT') {
                    const text = msg.data;
                    if (text) {
                        setChatMessages(prev => {
                            const last = prev[prev.length - 1];
                            const now = new Date();
                            if (last && last.role === 'assistant') {
                                return [...prev.slice(0, -1), { role: 'assistant', text: last.text + text, timestamp: last.timestamp }];
                            }
                            return [...prev, { role: 'assistant' as const, text, timestamp: now }];
                        });
                    }
                } else if (msg.type === 'INPUT_TRANSCRIPTION') {
                    const text = msg.data?.text;
                    if (text) {
                        setChatMessages(prev => {
                            const last = prev[prev.length - 1];
                            const now = new Date();
                            if (last && last.role === 'user') {
                                resetAutoCloseTimer();
                                return [...prev.slice(0, -1), { role: 'user', text: last.text + text, timestamp: last.timestamp }];
                            }
                            return [...prev, { role: 'user' as const, text, timestamp: now }];
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
                            return [...prev, { role: 'assistant' as const, text, timestamp: now }];
                        });
                    }
                } else if (msg.type === 'TOOL_CALL') {
                    const fn = msg.data;
                    const toolName = fn.name;
                    let argsDisplay = "";
                    if (fn.args && typeof fn.args === 'object') {
                        argsDisplay = JSON.stringify(fn.args);
                    }

                    setChatMessages(prev => {
                        const isDuplicate = prev.slice(-3).some(m =>
                            m.role === 'tool-call' &&
                            m.text.includes(toolName) &&
                            (new Date().getTime() - m.timestamp.getTime() < 2000)
                        );
                        if (isDuplicate) return prev;
                        return [...prev, {
                            role: 'tool-call' as const,
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

    return {
        connected,
        active,
        setupComplete,
        chatMessages,
        connect,
        disconnect
    };
};
