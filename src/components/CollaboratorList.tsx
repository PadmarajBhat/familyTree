import { useState } from 'react';
import type { PersonNode } from '../logic/types';
import { calculateAge } from '../logic/dateUtils';
import { getPhotoUrl } from '../services/drive';
import { CloseButton } from './CloseButton';
import './CollaboratorList.css';

interface CollaboratorListProps {
    nodes: Record<string, PersonNode>;
    currentUserEmail: string;
    canToggle: boolean;
    onToggleEditor: (nodeId: string, newStatus: boolean, updates?: { email?: string; phone?: string }) => void;
    onSetDefaultTree?: (email: string) => void;
    onClose: () => void;
}

const PROTECTED_EMAILS = ['padmarajbhat@gmail.com', 'narasimhapbhat@gmail.com'];

export function CollaboratorList({ nodes, canToggle, onToggleEditor, onSetDefaultTree, onClose }: CollaboratorListProps) {
    const [searchTerm, setSearchTerm] = useState('');
    const [missingDetailsNode, setMissingDetailsNode] = useState<PersonNode | null>(null);
    const [emailInput, setEmailInput] = useState('');
    const [phoneInput, setPhoneInput] = useState('');

    const allMembers = Object.values(nodes);

    // Filter based on search
    const filteredMembers = allMembers.filter(node =>
        (node.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (node.email || '').toLowerCase().includes(searchTerm.toLowerCase())
    );

    // Separate editors and non-editors from filtered list
    const editors = filteredMembers.filter(node => node.isEditor);
    const nonEditors = filteredMembers.filter(node => !node.isEditor);

    const formatDate = (isoString: string | null) => {
        if (!isoString) return 'N/A';
        const date = new Date(isoString);
        return date.toLocaleDateString('en-IN', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
    };

    const handleToggleClick = (node: PersonNode, newStatus: boolean) => {
        // Check protected emails
        if (!newStatus && node.email && PROTECTED_EMAILS.includes(node.email.toLowerCase())) {
            alert("This administrator cannot be removed.");
            return;
        }

        if (newStatus) {
            // Adding as editor - check for mandatory fields
            if (!node.email || !node.phone) {
                setMissingDetailsNode(node);
                setEmailInput(node.email || '');
                setPhoneInput(node.phone || '');
                return;
            }
        }

        onToggleEditor(node.nodeId, newStatus);
    };

    const handleConfirmDetails = () => {
        if (!missingDetailsNode) return;

        if (!emailInput.trim() || !phoneInput.trim()) {
            alert("Email and Phone are mandatory for editors.");
            return;
        }

        onToggleEditor(missingDetailsNode.nodeId, true, {
            email: emailInput.trim(),
            phone: phoneInput.trim()
        });
        setMissingDetailsNode(null);
    };

    const renderMemberCard = (node: PersonNode, isCurrentEditor: boolean) => {
        const age = calculateAge(node.dob, node.dod);
        const ageText = age !== null ? ` (${age})` : '';
        const imageUrl = getPhotoUrl(node.imageUrl) ?? undefined;
        const isProtected = !!(isCurrentEditor && node.email && PROTECTED_EMAILS.includes(node.email.toLowerCase()));

        return (
            <div key={node.nodeId} className="collaborator-card">
                <div className="card-left">
                    {imageUrl ? (
                        <img src={imageUrl} alt={node.name || 'Member'} className="member-avatar" />
                    ) : (
                        <div className="member-avatar-placeholder">
                            {node.name ? node.name.charAt(0).toUpperCase() : '?'}
                        </div>
                    )}
                    <div className="collaborator-info">
                        <div className="collaborator-name">
                            {node.name || 'Unknown'}{ageText}
                        </div>
                        <div className="collaborator-details">
                            <div>{node.email ? `📧 ${node.email}` : '📧 No Email'}</div>
                            <div>{node.phone ? `📞 ${node.phone}` : '📞 No Phone'}</div>
                            {isCurrentEditor && node.editorSince && (
                                <div className="editor-since">
                                    ✓ Editor since {formatDate(node.editorSince)}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
                <button
                    className={`toggle-button ${isCurrentEditor ? 'remove' : 'add'}`}
                    onClick={() => handleToggleClick(node, !isCurrentEditor)}
                    disabled={!canToggle || (isProtected ?? false)}
                    title={
                        isProtected ? 'Protected Administrator' :
                            !canToggle ? 'Only editors can modify permissions' :
                                isCurrentEditor ? 'Remove editor access' : 'Grant editor access'
                    }
                >
                    {isCurrentEditor ? 'Remove' : 'Add'}
                </button>
                {isCurrentEditor && onSetDefaultTree && node.email && (
                    <button
                        className="btn-text small"
                        onClick={() => onSetDefaultTree(node.email!)}
                        title="Set current tree as default for this user"
                        style={{ marginLeft: '10px', fontSize: '0.8em' }}
                    >
                        Set Default Tree
                    </button>
                )}
            </div>
        );
    };

    return (
        <div className="collaborator-overlay">
            <div className="collaborator-container">
                <div className="collaborator-header">
                    <h2>Manage Editors</h2>
                    <CloseButton onClick={onClose} />
                </div>

                {!canToggle && (
                    <div className="info-banner">
                        ℹ️ You can view collaborators but only editors can modify permissions
                    </div>
                )}

                <div className="collaborator-content">
                    <div className="search-section">
                        <input
                            type="text"
                            className="search-input"
                            placeholder="Search members by name or email..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>

                    <div className="section">
                        <h3>Current Editors ({editors.length})</h3>
                        {editors.length === 0 ? (
                            <div className="empty-state">No editors found</div>
                        ) : (
                            <div className="collaborator-list">
                                {editors.map(node => renderMemberCard(node, true))}
                            </div>
                        )}
                    </div>

                    <div className="section">
                        <h3>Other Members ({nonEditors.length})</h3>
                        {nonEditors.length === 0 ? (
                            <div className="empty-state">No other members found matching search</div>
                        ) : (
                            <div className="collaborator-list">
                                {nonEditors.map(node => renderMemberCard(node, false))}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {missingDetailsNode && (
                <div className="details-dialog-overlay">
                    <div className="details-dialog">
                        <h3>Missing Details</h3>
                        <p>
                            To make <strong>{missingDetailsNode.name}</strong> an editor,
                            Email ID and Phone Number are mandatory. Please provide them below.
                        </p>
                        <div className="input-group">
                            <label>Email ID *</label>
                            <input
                                type="email"
                                value={emailInput}
                                onChange={(e) => setEmailInput(e.target.value)}
                                placeholder="Enter email address"
                            />
                        </div>
                        <div className="input-group">
                            <label>Phone Number *</label>
                            <input
                                type="tel"
                                value={phoneInput}
                                onChange={(e) => setPhoneInput(e.target.value)}
                                placeholder="Enter phone number"
                            />
                        </div>
                        <div className="dialog-actions">
                            <button
                                className="dialog-button cancel"
                                onClick={() => setMissingDetailsNode(null)}
                            >
                                Cancel
                            </button>
                            <button
                                className="dialog-button confirm"
                                onClick={handleConfirmDetails}
                            >
                                Save & Make Editor
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
