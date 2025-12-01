import React, { useMemo } from 'react';
import type { PersonNode, TreeDocument } from '../logic/types';
import { CloseButton } from './CloseButton';
import { getPhotoUrl } from '../services/drive';
import { TreeView } from './TreeView';
import './PersonDetail.css';

interface PersonDetailProps {
    node: PersonNode;
    tree: TreeDocument;
    onClose: () => void;
    onEdit: () => void;
    onDelete: (nodeId: string) => void;
    onNodeClick: (nodeId: string) => void;
}

export const PersonDetail: React.FC<PersonDetailProps> = ({ node, tree, onClose, onEdit, onDelete, onNodeClick }) => {
    const isOrphan = !node.parentId && node.childrenIds.length === 0 && node.spouseIds.length === 0;

    // Filter fields to show only non-empty ones
    const fields = [
        { label: 'Born', value: node.dob },
        { label: 'Died', value: node.dod },
        { label: 'Phone', value: node.phone },
        { label: 'Email', value: node.email },
        { label: 'Address', value: node.address.freeform },
    ].filter(field => field.value && field.value.trim() !== '');

    // Logic to build the filtered tree data
    // 1. Path from root to current node (single line)
    // 2. All descendants of current node
    const filteredTreeData = useMemo(() => {
        if (!tree) return null;

        const relevantNodeIds = new Set<string>();

        // 1. Add descendants
        const addDescendants = (id: string) => {
            relevantNodeIds.add(id);
            const n = tree.nodes[id];
            if (n) {
                n.childrenIds.forEach(addDescendants);
                n.spouseIds.forEach(spouseId => relevantNodeIds.add(spouseId)); // Include spouses of descendants
            }
        };
        addDescendants(node.nodeId);

        // 2. Add ancestors (path to root)
        let currentId: string | null = node.parentId;
        while (currentId) {
            relevantNodeIds.add(currentId);
            const n = tree.nodes[currentId];
            if (n) {
                n.spouseIds.forEach(spouseId => relevantNodeIds.add(spouseId)); // Include spouses of ancestors
                currentId = n.parentId;
            } else {
                break;
            }
        }

        // 3. Construct new TreeDocument with only relevant nodes
        const newNodes: Record<string, PersonNode> = {};
        relevantNodeIds.forEach(id => {
            if (tree.nodes[id]) {
                // We need to clone the node to modify childrenIds if necessary
                // But wait, if we include a node, we must include its children ONLY if they are in relevantNodeIds
                // Otherwise the TreeView might try to render missing children or lines to nowhere.
                // Actually, TreeView uses `childrenIds` to find children. If a child ID is in `childrenIds` but not in `nodes`, it handles it (returns null).
                // However, for the "Single Line" requirement, we want to HIDE siblings of ancestors.

                const originalNode = tree.nodes[id];
                const newNode = { ...originalNode };

                // Filter children: Only keep children that are in relevantNodeIds
                newNode.childrenIds = originalNode.childrenIds.filter(childId => relevantNodeIds.has(childId));

                newNodes[id] = newNode;
            }
        });

        // Ensure we have a valid root for this view. 
        // The root of this partial tree should be the same as the main tree's root, 
        // or the highest ancestor we found.
        // Since we traced back to the root (or as far as we could), the main tree's root should be included if connected.
        // If the current node is disconnected from the main root, we use the top-most ancestor we found.

        let viewRootId = tree.rootNodeId;
        if (!newNodes[viewRootId]) {
            // Find the node with no parent in our subset (or the one whose parent is not in the subset)
            // Actually, we just traced up. The "highest" node is the one we stopped at.
            // Let's just use the main tree root if it's in our set, otherwise find the top.
            const sortedNodes = Object.values(newNodes);
            // Simple check: if main root is not there, pick the one that has no parent in the set.
            const rootCandidate = sortedNodes.find(n => !n.parentId || !newNodes[n.parentId]);
            if (rootCandidate) viewRootId = rootCandidate.nodeId;
        }

        return {
            ...tree,
            rootNodeId: viewRootId,
            nodes: newNodes
        };

    }, [tree, node.nodeId, node.parentId]);

    return (
        <div className="person-detail-overlay">
            <div className="person-detail-header">
                <CloseButton onClick={onClose} />

                <div className="person-detail-info">
                    <div className="profile-section">
                        {node.imageUrl ? (
                            <img src={getPhotoUrl(node.imageUrl) || ""} alt={node.name || "Profile"} className="profile-pic" />
                        ) : (
                            <div className="profile-pic" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#ccc', color: '#fff', fontSize: '2rem' }}>
                                {node.name ? node.name.charAt(0).toUpperCase() : "?"}
                            </div>
                        )}
                        <h2>{node.name || "Unknown"}</h2>
                    </div>

                    <div className="info-section">
                        <div className="info-grid">
                            {fields.map((field, index) => (
                                <div key={index} className="info-item">
                                    <span className="info-label">{field.label}</span>
                                    <div className="info-value">{field.value}</div>
                                </div>
                            ))}
                        </div>

                        <div className="detail-actions">
                            <button onClick={onEdit}>Edit Details</button>
                            {isOrphan && (
                                <button
                                    onClick={() => {
                                        if (window.confirm(`Are you sure you want to delete ${node.name}? This cannot be undone.`)) {
                                            onDelete(node.nodeId);
                                        }
                                    }}
                                    className="delete-button"
                                >
                                    Delete Member
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            <div className="person-detail-tree">
                {filteredTreeData && (
                    <TreeView
                        data={filteredTreeData}
                        onNodeClick={onNodeClick}
                        onNodeLongPress={() => { }}
                    // No maxDepth for this view, or maybe we want to show all?
                    // The user said "show all descendents", so no limit.
                    />
                )}
            </div>
        </div>
    );
};
