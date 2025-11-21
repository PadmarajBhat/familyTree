import React from 'react';
import type { PersonNode } from '../logic/types';

interface PersonDetailProps {
    node: PersonNode;
    onClose: () => void;
    onEdit: () => void;
}

export const PersonDetail: React.FC<PersonDetailProps> = ({ node, onClose, onEdit }) => {
    return (
        <div className="person-detail-overlay">
            <div className="person-detail-card">
                <button className="close-btn" onClick={onClose}>X</button>
                <h2>{node.name || "Unknown"}</h2>
                {node.imageUrl && <img src={node.imageUrl} alt={node.name || "Profile"} className="profile-pic" />}
                <p><strong>Born:</strong> {node.dob || "Unknown"}</p>
                <p><strong>Died:</strong> {node.dod || "-"}</p>
                <p><strong>Phone:</strong> {node.phone || "-"}</p>
                <p><strong>Email:</strong> {node.email || "-"}</p>
                <p><strong>Address:</strong> {node.address.freeform || "-"}</p>

                <button onClick={onEdit}>Edit</button>
            </div>
        </div>
    );
};
