
import React, { useEffect, useRef, useState } from 'react';
import { GeminiLiveService, type ToolResult } from '../services/GeminiLive';
import { type LogEntry } from '../services/GeminiLive/types';
import { PCMPlayer } from '../utils/pcmPlayer';
import type { PersonNode } from '../logic/types';
import './GeminiLive.css';

interface GeminiLiveProps {
    onAddPerson: (data: Partial<PersonNode>) => Promise<ToolResult>;
    onUpdatePerson: (data: Partial<PersonNode>) => Promise<ToolResult>;
}

export const GeminiLive: React.FC<GeminiLiveProps> = ({ onAddPerson, onUpdatePerson }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [status, setStatus] = useState('disconnected');
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [isVideoEnabled, setIsVideoEnabled] = useState(false);

    // Services
    const liveServiceRef = useRef<GeminiLiveService | null>(null);
    const audioPlayerRef = useRef<PCMPlayer | null>(null);
    const chatEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        // Cleanup on unmount
        return () => {
            handleDisconnect();
        };
    }, []);

    useEffect(() => {
        if (chatEndRef.current) {
            chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [logs, isOpen]);

    const handleConnect = async () => {
        if (!liveServiceRef.current) {
            audioPlayerRef.current = new PCMPlayer(24000); // 24kHz response
            liveServiceRef.current = new GeminiLiveService(
                (text, audioData, type) => {
                    if (text) {
                        setLogs(prev => {
                            const lastEntry = prev[prev.length - 1];
                            const isNewEntry = !lastEntry || lastEntry.type !== type;

                            if (isNewEntry) {
                                // Create new bubble
                                return [...prev, {
                                    type: type as 'user' | 'model',
                                    text: text,
                                    timestamp: new Date(),
                                    data: type === 'user' ? { isTranscript: true } : undefined
                                } as LogEntry];
                            } else {
                                // Update existing bubble
                                const updatedLogs = [...prev];
                                const updatedEntry = { ...lastEntry };

                                // Append for both model and user (streaming deltas)
                                updatedEntry.text += text;

                                updatedEntry.timestamp = new Date(); // Update timestamp to latest activity
                                updatedLogs[updatedLogs.length - 1] = updatedEntry;
                                return updatedLogs;
                            }
                        });
                    }
                    if (audioData) {
                        audioPlayerRef.current?.play(audioData);
                    }
                },
                (newStatus) => {
                    setStatus(newStatus);
                    if (newStatus === 'disconnected') {
                        handleDisconnect();
                    }
                },
                (logEntry) => {
                    // Ignore model and user text entries from here to avoid duplication/fragmentation,
                    // as they are handled by onMessage for streaming.
                    if (logEntry.type === 'model' || logEntry.type === 'user') return;

                    console.log("REACT: Received log entry:", logEntry);
                    setLogs(prev => [...prev, logEntry]);
                },
                onAddPerson,
                onUpdatePerson
            );
        }

        await liveServiceRef.current.connect(isVideoEnabled);
    };

    const handleDisconnect = () => {
        liveServiceRef.current?.disconnect();
        liveServiceRef.current = null;
        audioPlayerRef.current?.stop();
        audioPlayerRef.current = null;
        setStatus('disconnected');
    };

    const toggleOpen = () => {
        setIsOpen(!isOpen);
    };

    // Helper to render log entries
    const renderLogEntry = (entry: LogEntry, index: number) => {
        if (entry.type === 'tool-call' || entry.type === 'tool-response' || entry.type === 'info') {
            const isError = entry.text.includes('⚠️');
            return (
                <div key={index} className="system-bubble">
                    <div className="system-content" style={isError ? { color: '#ef4444', background: 'rgba(239,68,68,0.1)' } : {}}>
                        {entry.type === 'tool-call' ? '🛠️' : entry.type === 'info' ? 'ℹ️' : '✅'} {entry.text}
                    </div>
                </div>
            );
        }

        const isUser = entry.type === 'user';
        const isTranscript = isUser && entry.data?.isTranscript;

        return (
            <div key={index} className={`message-row ${isUser ? 'user' : 'model'}`}>
                <div className="message-avatar">
                    {isUser ? '👤' : '✨'}
                </div>
                <div className="message-bubble">
                    {entry.text}
                    {isTranscript && (
                        <div className="transcript-indicator">
                            <span role="img" aria-label="microphone" title="Transcribed from audio">🎙️</span>
                        </div>
                    )}
                </div>
            </div>
        );
    };

    return (
        <div className={`gemini-live-container ${isOpen ? 'open' : ''}`}>
            {!isOpen && (
                <button className="gemini-fab" onClick={toggleOpen} title="Ask Gemini Live">
                    <span role="img" aria-label="sparkles">✨</span>
                </button>
            )}

            {isOpen && (
                <div className="gemini-panel">
                    <div className="gemini-header">
                        <h3>Gemini Live</h3>
                        <button className="close-btn" onClick={toggleOpen}>×</button>
                    </div>

                    <div className="gemini-content">
                        <div className="transcript-area">
                            {logs.length === 0 && (
                                <div style={{ textAlign: 'center', color: '#9ca3af', marginTop: '50%' }}>
                                    Tap start to chat with your family tree...
                                </div>
                            )}
                            {logs.map((log, i) => renderLogEntry(log, i))}
                            <div ref={chatEndRef} />
                        </div>

                        {status === 'connected' && (
                            <div className="visualizer-container">
                                <div className="pulse-indicator">
                                    <div className="pulse-core"></div>
                                </div>
                                <div className="status-label">
                                    {isVideoEnabled ? "Watching & Listening..." : "Listening..."}
                                </div>
                            </div>
                        )}
                    </div>


                    <div className="gemini-footer">
                        <div className="media-controls">
                            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#4b5563', marginBottom: '12px' }}>
                                <input
                                    type="checkbox"
                                    checked={isVideoEnabled}
                                    onChange={(e) => setIsVideoEnabled(e.target.checked)}
                                    disabled={status === 'connected'}
                                />
                                Enable Camera
                            </label>
                        </div>

                        {status === 'disconnected' ? (
                            <button className="control-btn start" onClick={handleConnect}>
                                Start Live Chat
                            </button>
                        ) : (
                            <button className="control-btn stop" onClick={handleDisconnect}>
                                End Session
                            </button>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};
