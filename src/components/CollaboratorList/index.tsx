
import { useState } from 'react';
import type { PersonNode } from '../../logic/types';
import { CloseButton } from '../CloseButton';
import { CollaboratorCard } from './components/CollaboratorCard';
import { MissingDetailsDialog } from './components/MissingDetailsDialog';
import './CollaboratorList.css';

interface CollaboratorListProps {
    nodes: Record<string, PersonNode>;
    currentUserEmail: string;
    canToggle: boolean;
    onToggleEditor: (nodeId: string, newStatus: boolean, updates?: { email?: string; phone?: string }) => void;
    onClose: () => void;
}

const PROTECTED_EMAILS = ['padmarajbhat@gmail.com', 'narasimhapbhat@gmail.com'];

export function CollaboratorList({ nodes, canToggle, onToggleEditor, onClose }: CollaboratorListProps) {
    const [searchTerm, setSearchTerm] = useState('');
    const [missingDetailsNode, setMissingDetailsNode] = useState<PersonNode | null>(null);
    const [emailInput, setEmailInput] = useState('');
    const [phoneInput, setPhoneInput] = useState('');
    const [isAdding, setIsAdding] = useState(false);

    const allMembers = Object.values(nodes);
    const filteredMembers = isAdding ? allMembers.filter(n => (n.name || '').toLowerCase().includes(searchTerm.toLowerCase()) || (n.email || '').toLowerCase().includes(searchTerm.toLowerCase())) : allMembers;
    const editors = allMembers.filter(n => n.isEditor).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    const nonEditors = isAdding ? filteredMembers.filter(n => !n.isEditor) : [];

    const formatDate = (iso: string | null) => iso ? new Date(iso).toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' }) : 'N/A';

    const handleToggleClick = (node: PersonNode, newStatus: boolean) => {
        if (!newStatus && node.email && PROTECTED_EMAILS.includes(node.email.toLowerCase())) { alert("Administrator protected."); return; }
        if (newStatus && (!node.email || !node.phone)) { setMissingDetailsNode(node); setEmailInput(node.email || ''); setPhoneInput(node.phone || ''); return; }
        onToggleEditor(node.nodeId, newStatus);
        if (newStatus) setSearchTerm('');
    };

    const handleConfirm = () => {
        if (!missingDetailsNode || !emailInput.trim() || !phoneInput.trim()) { alert("Mandatory fields missing."); return; }
        onToggleEditor(missingDetailsNode.nodeId, true, { email: emailInput.trim(), phone: phoneInput.trim() });
        setMissingDetailsNode(null); setSearchTerm('');
    };

    const renderCard = (node: PersonNode, active: boolean) => (
        <CollaboratorCard key={node.nodeId} node={node} isCurrentEditor={active} canToggle={canToggle} isProtected={!!(active && node.email && PROTECTED_EMAILS.includes(node.email.toLowerCase()))} onToggle={() => handleToggleClick(node, !active)} formatDate={formatDate} />
    );

    return (
        <div className="collaborator-overlay">
            <div className="collaborator-container">
                <div className="collaborator-header"><h2>Manage Editors</h2><CloseButton onClick={onClose} /></div>
                {!canToggle && <div className="info-banner">ℹ️ View-only mode</div>}
                <div className="collaborator-content">
                    {!isAdding ? (
                        <>
                            <div className="section"><h3>Current Editors ({editors.length})</h3>{editors.length === 0 ? <div className="empty-state">No editors</div> : editors.map(n => renderCard(n, true))}</div>
                            {canToggle && <div className="actions-footer"><button className="btn-primary full-width" onClick={() => setIsAdding(true)}>+ Add New Editor</button></div>}
                        </>
                    ) : (
                        <>
                            <div className="add-editor-header"><button className="btn-text" onClick={() => { setIsAdding(false); setSearchTerm(''); }}>← Back</button><h3>Add New Editor</h3></div>
                            <div className="search-section"><input type="text" className="search-input" placeholder="Search..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} autoFocus /></div>
                            <div className="section"><h3>Results ({nonEditors.length})</h3>{nonEditors.length === 0 ? <div className="empty-state">No results</div> : nonEditors.map(n => renderCard(n, false))}</div>
                        </>
                    )}
                </div>
            </div>
            {missingDetailsNode && <MissingDetailsDialog node={missingDetailsNode} email={emailInput} phone={phoneInput} setEmail={setEmailInput} setPhone={setPhoneInput} onCancel={() => setMissingDetailsNode(null)} onConfirm={handleConfirm} />}
        </div>
    );
}
