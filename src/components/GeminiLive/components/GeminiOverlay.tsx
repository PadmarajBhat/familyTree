import React, { useRef, useEffect } from 'react';
import type { ChatMessage } from '../hooks/useGeminiLive';

interface GeminiOverlayProps {
    connected: boolean;
    active: boolean;
    setupComplete: boolean;
    chatMessages: ChatMessage[];
    onDisconnect: () => void;
}

export const GeminiOverlay: React.FC<GeminiOverlayProps> = ({
    connected,
    active,
    setupComplete,
    chatMessages,
    onDisconnect
}) => {
    const messagesEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [chatMessages]);

    if (!connected && !active) return null;

    return (
        <div className="chat-overlay">
            <div className="chat-header">
                <span>Gemini Live</span>
                <button className="close-btn" onClick={onDisconnect} title="End Session">×</button>
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
                <div ref={messagesEndRef} />
            </div>
        </div>
    );
};
