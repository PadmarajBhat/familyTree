
import React from 'react';
import type { PersonNode } from '../../../logic/types';

interface MissingDetailsDialogProps {
    node: PersonNode;
    email: string;
    phone: string;
    setEmail: (val: string) => void;
    setPhone: (val: string) => void;
    onCancel: () => void;
    onConfirm: () => void;
}

export const MissingDetailsDialog: React.FC<MissingDetailsDialogProps> = ({ node, email, phone, setEmail, setPhone, onCancel, onConfirm }) => {
    return (
        <div className="details-dialog-overlay">
            <div className="details-dialog">
                <h3>Missing Details</h3>
                <p>To make <strong>{node.name}</strong> an editor, Email ID and Phone Number are mandatory.</p>
                <div className="input-group">
                    <label>Email ID *</label>
                    <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Enter email" />
                </div>
                <div className="input-group">
                    <label>Phone Number *</label>
                    <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Enter phone" />
                </div>
                <div className="dialog-actions">
                    <button className="dialog-button cancel" onClick={onCancel}>Cancel</button>
                    <button className="dialog-button confirm" onClick={onConfirm}>Save & Make Editor</button>
                </div>
            </div>
        </div>
    );
};
