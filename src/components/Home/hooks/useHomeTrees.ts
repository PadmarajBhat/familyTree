
import { useState } from 'react';
import { listTreeFiles, renameFile } from '../../../services/drive';
import { getISTTimestamp } from '../../../logic/dateUtils';
import { getTreeNameFromFilename } from '../../../logic/fileUtils';
import { GlobalTreeService } from '../../../services/GlobalTreeService';

export interface TreeFile {
    id: string;
    name: string;
    originalFilename: string;
    modifiedTime: string;
    description?: string;
}

export function useHomeTrees(userEmail: string) {
    const [trees, setTrees] = useState<TreeFile[]>([]);
    const [treeIdMap, setTreeIdMap] = useState<Record<string, string[]>>({});
    const [loading, setLoading] = useState(false);
    const [loadingMessage, setLoadingMessage] = useState<string>("Loading...");
    const [creating, setCreating] = useState(false);

    const loadTrees = async () => {
        setLoading(true);
        try {
            const files = await listTreeFiles();
            const groupedFiles: Record<string, TreeFile[]> = {};
            const idMap: Record<string, string[]> = {};

            files.forEach((f: any) => {
                const treeName = getTreeNameFromFilename(f.name);
                if (!groupedFiles[treeName]) {
                    groupedFiles[treeName] = [];
                    idMap[treeName] = [];
                }
                const tf = { id: f.id, name: treeName, originalFilename: f.name, modifiedTime: f.modifiedTime, description: f.description };
                groupedFiles[treeName].push(tf);
                idMap[treeName].push(f.id);
            });
            setTreeIdMap(idMap);

            const latestTrees: TreeFile[] = [];
            Object.values(groupedFiles).forEach(group => {
                group.sort((a, b) => new Date(b.modifiedTime).getTime() - new Date(a.modifiedTime).getTime());
                latestTrees.push(group[0]);
            });
            setTrees(latestTrees);
            GlobalTreeService.loadShortlistedTrees(latestTrees.map(t => t.id));
        } catch (error) {
            console.error("Failed to list trees", error);
        } finally {
            setLoading(false);
            setLoadingMessage("Loading...");
        }
    };

    const handleCreateTree = async (newTreeName: string) => {
        if (!newTreeName.trim()) return;
        setCreating(true);
        try {
            const { getOrCreateTreeSpreadsheet } = await import('../../../services/drive/sheets/tree/utils');
            const { saveMetadataToSheets } = await import('../../../services/drive/sheets/tree/save');

            const spreadsheetId = await getOrCreateTreeSpreadsheet(newTreeName.trim());
            if (spreadsheetId) {
                // Initialize metadata with the tree name
                await saveMetadataToSheets({
                    treeName: newTreeName.trim(),
                    createdBy: userEmail,
                    createdTime: getISTTimestamp(),
                    schemaVersion: '1'
                });
                await loadTrees();
                return true;
            }
            return false;
        } catch (e) {
            console.error("Error creating tree", e);
            return false;
        } finally {
            setCreating(false);
        }
    };

    const handleDeleteTree = async (id: string, originalFilename: string) => {
        try {
            setLoading(true);
            setLoadingMessage("Scanning references...");
            await GlobalTreeService.removeLinksToTree(id, userEmail, (msg: string) => setLoadingMessage(msg));
            setLoadingMessage("Deleting tree...");
            await renameFile(id, `delete_${originalFilename}`);
            await loadTrees();
            return true;
        } catch (e) {
            console.error("Error deleting tree", e);
            return false;
        } finally {
            setLoading(false);
        }
    };

    return { trees, treeIdMap, loading, loadingMessage, creating, loadTrees, handleCreateTree, handleDeleteTree };
}
