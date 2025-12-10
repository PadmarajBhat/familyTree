import React, { useEffect, useState } from 'react';
import { listTreeFiles } from '../services/drive';
import { getTreeNameFromFilename } from '../logic/fileUtils';
import './TreePicker.css';

interface TreeFile {
    id: string;
    name: string;
    createdTime: string;
    modifiedTime: string;
    description?: string;
}

interface TreeGroup {
    treeName: string;
    latestFile: TreeFile;
    fileCount: number;
}

interface TreePickerProps {
    currentTreeId: string | null;
    defaultTreeName: string | null;
    onSelect: (fileId: string) => void;
    onSetDefault: (treeName: string) => void;
    onCreate: (treeName: string) => void;
    onClose: () => void;
}

export const TreePicker: React.FC<TreePickerProps> = ({ currentTreeId, defaultTreeName, onSelect, onSetDefault, onCreate, onClose }) => {
    const [groups, setGroups] = useState<TreeGroup[]>([]);
    const [loading, setLoading] = useState(true);
    const [isCreating, setIsCreating] = useState(false);
    const [newTreeName, setNewTreeName] = useState('');

    useEffect(() => {
        const loadFiles = async () => {
            try {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const fileList = await listTreeFiles() as any[];

                // Group by tree name
                const grouped = new Map<string, TreeFile[]>();

                fileList.forEach(file => {
                    const name = getTreeNameFromFilename(file.name);
                    if (!grouped.has(name)) {
                        grouped.set(name, []);
                    }
                    grouped.get(name)?.push(file);
                });

                const result: TreeGroup[] = [];
                grouped.forEach((files, name) => {
                    // Sort by createdTime desc
                    files.sort((a, b) => new Date(b.createdTime).getTime() - new Date(a.createdTime).getTime());
                    result.push({
                        treeName: name,
                        latestFile: files[0],
                        fileCount: files.length
                    });
                });

                // Sort groups by latest file time
                result.sort((a, b) => new Date(b.latestFile.createdTime).getTime() - new Date(a.latestFile.createdTime).getTime());

                setGroups(result);
            } catch (err) {
                console.error("Failed to list files", err);
            } finally {
                setLoading(false);
            }
        };
        loadFiles();
    }, []);

    const handleCreateSubmit = () => {
        if (!newTreeName.trim()) return;
        onCreate(newTreeName.trim());
    };

    return (
        <div className="modal-overlay">
            <div className="modal-content tree-picker-modal">
                <div className="modal-header">
                    <h2>Select Family Tree</h2>
                    <button className="close-button" onClick={onClose}>&times;</button>
                </div>
                <div className="modal-body">
                    {loading ? (
                        <div className="loading">Loading trees...</div>
                    ) : (
                        <>
                            <div className="picker-controls">
                                {isCreating ? (
                                    <div className="create-form">
                                        <input
                                            type="text"
                                            placeholder="Enter tree name (e.g. Smith Family)"
                                            value={newTreeName}
                                            onChange={e => setNewTreeName(e.target.value)}
                                        />
                                        <button className="btn-primary" onClick={handleCreateSubmit}>Create</button>
                                        <button className="btn-secondary" onClick={() => setIsCreating(false)}>Cancel</button>
                                    </div>
                                ) : (
                                    <button className="btn-primary full-width" onClick={() => setIsCreating(true)}>
                                        + Create New Tree
                                    </button>
                                )}
                            </div>

                            <div className="tree-list">
                                {groups.length === 0 ? (
                                    <div className="empty-state">
                                        <p>No family trees found.</p>
                                        <div className="contact-admin">
                                            <p>Please contact:</p>
                                            <strong>Narasimha Bhat</strong>
                                            <a href="tel:+919342748992">+919342748992</a>
                                        </div>
                                    </div>
                                ) : (
                                    groups.map(group => (
                                        <div key={group.treeName} className={`tree-item ${group.latestFile.id === currentTreeId ? 'current' : ''}`}>
                                            <div className="tree-info">
                                                <div className="tree-name">{group.treeName}</div>
                                                <div className="tree-meta">
                                                    Latest: {new Date(group.latestFile.createdTime).toLocaleDateString()}
                                                    <span className="file-count">({group.fileCount} versions)</span>
                                                </div>
                                            </div>
                                            <div className="tree-actions">
                                                {group.latestFile.id !== currentTreeId && (
                                                    <button className="btn-secondary" onClick={() => onSelect(group.latestFile.id)}>
                                                        Load
                                                    </button>
                                                )}
                                                {group.treeName === defaultTreeName ? (
                                                    <span className="badge-default">Default</span>
                                                ) : (
                                                    <button className="btn-text" onClick={() => onSetDefault(group.treeName)}>
                                                        Set as Default
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};
