import React from 'react';
import './CloseButton.css';

interface CloseButtonProps {
    onClick: () => void;
    className?: string;
}

export const CloseButton: React.FC<CloseButtonProps> = ({ onClick, className = '' }) => {
    return (
        <button
            className={`common-close-button ${className}`}
            onClick={(e) => {
                e.stopPropagation();
                onClick();
            }}
            aria-label="Close"
        >
            ×
        </button>
    );
};
