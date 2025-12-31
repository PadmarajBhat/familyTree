
import React, { useEffect, useRef } from 'react';
import type { LogEntry } from '../../../services/GeminiLive/types';
import './ChatTranscript.css';

interface ChatTranscriptProps {
    logs: LogEntry[];
}

export const ChatTranscript: React.FC<ChatTranscriptProps> = ({ logs }) => {
    const chatEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (chatEndRef.current) {
            chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [logs]);

    return (
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
    );
};
