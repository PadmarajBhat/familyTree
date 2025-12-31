
import React, { useState } from 'react';
import { useGeminiLive } from './hooks/useGeminiLive';
import { ChatTranscript } from './components/ChatTranscript';
import { ChatVisualizer } from './components/ChatVisualizer';
import type { PersonNode } from '../../logic/types';
import type { ToolResult } from '../../services/GeminiLive/types';
import './GeminiLive.css';

interface GeminiLiveProps {
    onAddPerson: (data: Partial<PersonNode>) => Promise<ToolResult>;
    onUpdatePerson: (data: Partial<PersonNode>) => Promise<ToolResult>;
    onSearchNodes: (query: string) => Promise<PersonNode[]>;
    onGetRecentNodes: (limit: number) => Promise<PersonNode[]>;
    preferredVoice?: string;
}

export const GeminiLive: React.FC<GeminiLiveProps> = ({
    onAddPerson, onUpdatePerson, onSearchNodes, onGetRecentNodes, preferredVoice = "Puck"
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const { logs, connected, volume, handleToggle } = useGeminiLive({
        onAddPerson, onUpdatePerson, onSearchNodes, onGetRecentNodes, preferredVoice
    });

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
                        <ChatTranscript logs={logs} />
                        <ChatVisualizer connected={connected} volume={volume} />
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
