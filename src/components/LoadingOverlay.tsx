import React from 'react';

interface LoadingOverlayProps {
    message?: string;
}

export const LoadingOverlay: React.FC<LoadingOverlayProps> = ({ message = "Loading..." }) => {
    return (
        <div className="loading-overlay">
            <div className="loading-content">
                <div className="spinner"></div>
                <p>{message}</p>
            </div>
        </div>
    );
};
