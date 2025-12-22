
import React, { useEffect, useRef, useState } from 'react';
import { GeminiLiveService } from '../services/GeminiLiveService';
import { PCMPlayer } from '../utils/pcmPlayer';
import './GeminiLive.css';

export const GeminiLive: React.FC = () => {
    const [isOpen, setIsOpen] = useState(false);
    const [status, setStatus] = useState('disconnected');
    const [transcript, setTranscript] = useState<{ text: string; sender: 'user' | 'model' }[]>([]);
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
    }, [transcript, isOpen]);

    const handleConnect = async () => {
        if (!liveServiceRef.current) {
            audioPlayerRef.current = new PCMPlayer(24000); // 24kHz response
            liveServiceRef.current = new GeminiLiveService(
                (text, audioData) => {
                    if (text) {
                        setTranscript(prev => [...prev, { text, sender: 'model' }]);
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
                            {transcript.length === 0 && <div className="placeholder">Say "Hello" to start...</div>}
                            {transcript.map((t, i) => (
                                <div key={i} className={`message ${t.sender}`}>
                                    {t.text}
                                </div>
                            ))}
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
