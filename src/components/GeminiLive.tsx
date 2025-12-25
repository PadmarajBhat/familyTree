
import React, { useEffect, useRef, useState } from 'react';
import { GeminiLiveService, type LogEntry } from '../services/GeminiLiveService';
import { PCMPlayer } from '../utils/pcmPlayer';
import './GeminiLive.css';

export const GeminiLive: React.FC = () => {
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
                (text, audioData) => {
                    if (text) {
                        setLogs(prev => [...prev, { type: 'model', text, timestamp: new Date() }]);
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
                    setLogs(prev => [...prev, logEntry]);
                }
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
        switch (entry.type) {
            case 'user':
                return (
                    <div key={index} className="message user">
                        {entry.text}
                    </div>
                );
            case 'model':
                return (
                    <div key={index} className="message model">
                        {entry.text}
                    </div>
                );
            case 'tool-call':
                return (
                    <div key={index} className="message tool-call">
                        {entry.text}
                        {entry.data && (
                            <pre className="tool-data">{JSON.stringify(entry.data, null, 2)}</pre>
                        )}
                    </div>
                );
            case 'tool-response':
                return (
                    <div key={index} className="message tool-response">
                        {entry.text}
                    </div>
                );
            case 'info':
                return (
                    <div key={index} className="message system-info">
                        <small>{entry.text}</small>
                    </div>
                );
            default:
                return null;
        }
    };

    return (
        <div className={`gemini-live-container ${isOpen ? 'open' : ''}`}>
            {!isOpen && (
                <button className="gemini-fab" onClick={toggleOpen} title="Ask Gemini Live">
                    ✨
                </button>
            )}

            {isOpen && (
                <div className="gemini-panel glass-panel">
                    <div className="gemini-header">
                        <h3>Gemini Live</h3>
                        <div className="gemini-controls">
                            <button className="close-btn" onClick={toggleOpen}>×</button>
                        </div>
                    </div>

                    <div className="gemini-content">
                        <div className="transcript-area">
                            {logs.length === 0 && <div className="placeholder">Say "Hello" to start...</div>}
                            {logs.map((log, i) => renderLogEntry(log, i))}
                            <div ref={chatEndRef} />
                        </div>

                        {status === 'connected' && (
                            <div className="visualizer">
                                <div className="pulse-ring"></div>
                                <div className="status-text">
                                    {isVideoEnabled ? "Listening & Watching..." : "Listening..."}
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="gemini-footer">
                        <div className="media-controls">
                            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', marginBottom: '8px' }}>
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
                            <button className="start-btn" onClick={handleConnect}>
                                Start Live Conversation
                            </button>
                        ) : (
                            <button className="stop-btn" onClick={handleDisconnect}>
                                End Session
                            </button>
                        )}
                        <div className={`connection-status ${status}`}>
                            {status}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
