import React, { useEffect, useState } from 'react';
import { listTreeFiles, getFileContent, saveTreeFile } from '../services/drive';
import { mergeTrees } from '../logic/merge';
import type { TreeDocument, ChangeLog } from '../logic/types';
import { CloseButton } from './CloseButton';
import './VersionHistory.css';

interface DriveFile {
    id: string;
    name: string;
    createdTime: string;
    modifiedTime: string;
    description?: string;
}

export const VersionHistory: React.FC = () => {
    const [files, setFiles] = useState<DriveFile[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
    const [mergeStatus, setMergeStatus] = useState<string | null>(null);
    const [viewingLog, setViewingLog] = useState<ChangeLog[] | null>(null);
    const [loadingLog, setLoadingLog] = useState(false);

    useEffect(() => {
        loadFiles();
    }, []);

    const loadFiles = async () => {
        setLoading(true);
        try {
            const fileList = await listTreeFiles();
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            setFiles(fileList as any[]);
        } catch (err) {
            console.error("Failed to load files", err);
        } finally {
            setLoading(false);
        }
    };

    const handleSelect = (id: string) => {
        if (selectedFiles.includes(id)) {
            setSelectedFiles(selectedFiles.filter(f => f !== id));
        } else {
            if (selectedFiles.length < 2) {
                setSelectedFiles([...selectedFiles, id]);
            } else {
                alert("You can only select up to 2 versions to merge.");
            }
        }
    };

    const handleViewLog = async (fileId: string) => {
        setLoadingLog(true);
        try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const content = await getFileContent(fileId) as TreeDocument;
            setViewingLog(content.summary || []);
        } catch (err) {
            console.error("Failed to load file content", err);
            alert("Failed to load version details.");
        } finally {
            setLoadingLog(false);
        }
    };

    const handleMerge = async () => {
        if (selectedFiles.length !== 2) {
            alert("Please select exactly 2 versions to merge.");
            return;
        }

        setMergeStatus("Downloading versions...");
        try {
            const [id1, id2] = selectedFiles;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const content1 = await getFileContent(id1) as TreeDocument;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const content2 = await getFileContent(id2) as TreeDocument;

            setMergeStatus("Merging...");
            const result = mergeTrees(content1, content2);

            setMergeStatus("Saving merged version...");
            const newName = `family_tree_${Date.now()}.json`;
            const mergeDescription = `Merged versions ${id1} and ${id2}. Superset: ${result.supersetType}`;

            // Add a merge entry to the summary
            result.mergedTree.summary.unshift({
                editedBy: 'System (Merge)',
                editedTime: new Date().toISOString(),
                changes: mergeDescription,
                structured: []
            });

            await saveTreeFile(newName, result.mergedTree, mergeDescription);

            setMergeStatus(`Merge Complete! New version created: ${newName}. Superset Type: ${result.supersetType}`);

            // Refresh list
            setSelectedFiles([]);
            loadFiles();

        } catch (err) {
            console.error("Merge failed", err);
            setMergeStatus("Merge failed. See console for details.");
        }
    };

    return (
        <div className="version-history-container">
            <h2>Version History</h2>
            <div className="controls">
                <button onClick={loadFiles} disabled={loading}>Refresh</button>
                <button onClick={handleMerge} disabled={selectedFiles.length !== 2 || loading}>
                    Merge Selected ({selectedFiles.length})
                </button>
            </div>
            {mergeStatus && <div className="merge-status">{mergeStatus}</div>}

            {loading ? <p>Loading versions...</p> : (
                <div className="version-table-wrapper">
                    <table className="version-table">
                        <thead>
                            <tr>
                                <th>Select</th>
                                <th>Name</th>
                                <th>Created Time</th>
                                <th>Summary</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {files.map(file => (
                                <tr key={file.id} className={selectedFiles.includes(file.id) ? 'selected' : ''}>
                                    <td>
                                        <input
                                            type="checkbox"
                                            checked={selectedFiles.includes(file.id)}
                                            onChange={() => handleSelect(file.id)}
                                        />
                                    </td>
                                    <td>{file.name}</td>
                                    <td>{new Date(file.createdTime).toLocaleString()}</td>
                                    <td>{file.description || <em>No summary</em>}</td>
                                    <td>
                                        <button onClick={() => handleViewLog(file.id)} disabled={loadingLog}>
                                            View Full Log
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {viewingLog && (
                <div className="log-modal">
                    <div className="log-modal-content">
                        <h3>Version Change Log</h3>
                        <CloseButton onClick={() => setViewingLog(null)} />
                        <div className="log-list">
                            {viewingLog.length === 0 ? <p>No history available.</p> : (
                                viewingLog.map((log, idx) => (
                                    <div key={idx} className="log-entry">
                                        <div className="log-header">
                                            <strong>{new Date(log.editedTime).toLocaleString()}</strong> by {log.editedBy}
                                        </div>
                                        <div className="log-changes">{log.changes}</div>
                                        {log.structured && log.structured.length > 0 && (
                                            <details>
                                                <summary>Details</summary>
                                                <pre>{JSON.stringify(log.structured, null, 2)}</pre>
                                            </details>
                                        )}
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
