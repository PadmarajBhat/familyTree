
import React from 'react';

interface ChatVisualizerProps {
    connected: boolean;
    volume: number;
}

export const ChatVisualizer: React.FC<ChatVisualizerProps> = ({ connected, volume }) => {
    if (!connected) return null;

    return (
        <div className="visualizer-container">
            <div className="pulse-indicator" style={{ transform: `scale(${1 + volume * 2})` }}>
                <div className="pulse-core"></div>
            </div>
            <div className="status-label">Listening...</div>
        </div>
    );
};
