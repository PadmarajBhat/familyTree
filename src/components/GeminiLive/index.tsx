import React from 'react';
import type { TreeDocument, PersonNode } from '../../logic/types';
import './GeminiLive.css';
import { useGeminiLive } from './hooks/useGeminiLive';
import { GeminiOverlay } from './components/GeminiOverlay';

export const GeminiLiveButton: React.FC<{
    tree: TreeDocument | null,
    currentUser: { email: string; name: string } | null,
    onSaveMember?: (data: PersonNode, p: string | null, c: string[], s: string[], sib: string[], shadow: PersonNode[], mode: 'add' | 'edit' | null) => void;
}> = ({ tree, currentUser }) => {

    const {
        connected,
        active,
        setupComplete,
        chatMessages,
        connect,
        disconnect
    } = useGeminiLive(tree, currentUser);

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

            <GeminiOverlay
                connected={connected}
                active={active}
                setupComplete={setupComplete}
                chatMessages={chatMessages}
                onDisconnect={disconnect}
            />
        </>
    );
};
