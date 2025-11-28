import React, { useEffect, useState } from 'react';
import { listTreeFiles, getFileContent, saveTreeFile, deleteFile } from '../services/drive';
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

interface VersionHistoryProps {
    onClose: () => void;
}

export const VersionHistory: React.FC<VersionHistoryProps> = ({ onClose }) => {
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
            setSelectedFiles([...selectedFiles, id]);
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
        if (selectedFiles.length < 2) {
            alert("Please select at least 2 versions to merge.");
            return;
        }

        setMergeStatus("Downloading versions...");
        try {
            // Load all selected files
            const contents: TreeDocument[] = [];
            for (const fileId of selectedFiles) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const content = await getFileContent(fileId) as TreeDocument;
                contents.push(content);
            }

            setMergeStatus(`Merging ${selectedFiles.length} versions...`);

            // Sequentially merge all files (merge first two, then merge result with third, etc.)
            let mergedResult = contents[0];
            let supersetTypes: string[] = [];

            for (let i = 1; i < contents.length; i++) {
                const result = mergeTrees(mergedResult, contents[i]);
                mergedResult = result.mergedTree;
                supersetTypes.push(result.supersetType);
            }

            setMergeStatus("Saving merged version...");
            const newName = `family_tree_${Date.now()}.json`;
            const fileIdList = selectedFiles.join(', ');
            const mergeDescription = `Merged ${selectedFiles.length} versions: ${fileIdList}`;

            // Add a merge entry to the summary
            mergedResult.summary.unshift({
                editedBy: 'System (Merge)',
                editedTime: new Date().toISOString(),
                changes: mergeDescription,
                structured: []
            });

            // Save the merged file first
            await saveTreeFile(newName, mergedResult, mergeDescription);

            // After successful merge, delete the source files
            setMergeStatus("Deleting source files...");
            let deletedCount = 0;
            for (const fileId of selectedFiles) {
                try {
                    await deleteFile(fileId);
                    deletedCount++;
                } catch (delErr) {
                    console.error(`Failed to delete file ${fileId}:`, delErr);
                    // Continue deleting other files even if one fails
                }
            }

            setMergeStatus(`Merge Complete! ${deletedCount}/${selectedFiles.length} source files deleted.`);

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
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px 0 20px' }}>
                <h2>Version History</h2>
                <CloseButton onClick={onClose} />
            </div>
            <div className="controls">
                <button onClick={loadFiles} disabled={loading}>Refresh</button>
                <button onClick={handleMerge} disabled={selectedFiles.length < 2 || loading}>
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
