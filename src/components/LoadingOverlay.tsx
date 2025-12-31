import React from 'react';
import './LoadingOverlay.css';

interface LoadingOverlayProps {
    message?: string;
}

export const LoadingOverlay: React.FC<LoadingOverlayProps & { onForceUnlock?: () => void }> = ({ message = "Loading...", onForceUnlock }) => {
    const isWaiting = message.toLowerCase().includes('waiting for lock');

    return (
        <div className="loading-overlay">
            <div className="loading-content">
                <div className="spinner"></div>
                <p>{message}</p>
                {isWaiting && onForceUnlock && (
                    <div style={{ marginTop: '20px' }}>
                        <p style={{ fontSize: '0.8em', color: '#666', marginBottom: '10px' }}>
                            Is this taking too long?
                        </p>
                        <button
                            className="secondary-btn"
                            style={{ padding: '5px 10px', fontSize: '0.9em', background: '#ffebee', color: '#c62828', border: '1px solid #ef5350' }}
                            onClick={(e) => {
                                e.stopPropagation();
                                if (window.confirm("Are you sure you want to force unlock? This may overwrite unsaved changes if another user is actively saving.")) {
                                    onForceUnlock();
                                }
                            }}
                        >
                            Force Unlock
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};
