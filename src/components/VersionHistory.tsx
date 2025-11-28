import React, { useEffect, useState } from 'react';
import { listTreeFiles, getFileContent, saveTreeFile } from '../services/drive';
import { mergeTrees } from '../logic/merge';
import type { TreeDocument } from '../logic/types';
import './VersionHistory.css';

interface DriveFile {
    id: string;
    name: string;
    createdTime: string;
    modifiedTime: string;
}

export const VersionHistory: React.FC = () => {
    const [files, setFiles] = useState<DriveFile[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
    const [mergeStatus, setMergeStatus] = useState<string | null>(null);

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
                // Replace the oldest selection or just warn? Let's just prevent > 2
                alert("You can only select up to 2 versions to merge.");
            }
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
            await saveTreeFile(newName, result.mergedTree);

            setMergeStatus(`Merge Complete! New version created: ${newName}. Superset Type: ${result.supersetType}`);

            // Refresh list
            setSelectedFiles([]);
            loadFiles();

            // TODO: Handle archiving/deletion of superset "smaller" files if required.
            // Requirement: "Identify superset: if nodeIds(smaller) ⊆ nodeIds(bigger), append summary and archive+delete smaller (after 30 days)."
            // We are not implementing the 30-day wait here, but we could flag them.

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
                <table className="version-table">
                    <thead>
                        <tr>
                            <th>Select</th>
                            <th>Name</th>
                            <th>Created Time</th>
                            <th>ID</th>
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
                                <td>{file.id}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}
        </div>
    );
};
