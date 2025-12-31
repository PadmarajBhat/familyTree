import { useState, useCallback } from 'react';
import type { TreeDocument } from '../../logic/types';
import { GlobalTreeService } from '../../services/GlobalTreeService';
import { listTreeFiles, getFileContent, migrateTreeToSheets } from '../../services/drive';
import { getTreeNameFromFilename } from '../../logic/fileUtils';

export interface AppTreeState {
    tree: TreeDocument | null;
    setTree: (tree: TreeDocument | null) => void;
    loading: boolean;
    setLoading: (loading: boolean) => void;
    loadingMessage: string;
    setLoadingMessage: (msg: string) => void;
    isSheetsMode: boolean;
    setIsSheetsMode: (mode: boolean) => void;
    error: string | null;
    setError: (error: string | null) => void;
    accessDenied: boolean;
    setAccessDenied: (denied: boolean) => void;
    currentTreeId: string | null;
    setCurrentTreeId: (id: string | null) => void;
    currentTreeName: string;
    setCurrentTreeName: (name: string) => void;
    homeAutoloadEnabled: boolean;
    setHomeAutoloadEnabled: (enabled: boolean) => void;
    loadTree: (returnOnly?: boolean, specificFileId?: string) => Promise<TreeDocument | null>;
    handleMigrateToStage2: () => Promise<void>;
}

export const useAppTree = (currentUser: { email: string; name: string } | null, isSignedIn: boolean): AppTreeState => {
    const [tree, setTree] = useState<TreeDocument | null>(null);
    const [loading, setLoading] = useState(false);
    const [loadingMessage, setLoadingMessage] = useState("Loading...");
    const [isSheetsMode, setIsSheetsMode] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [accessDenied, setAccessDenied] = useState(false);
    const [currentTreeId, setCurrentTreeId] = useState<string | null>(null);
    const [currentTreeName, setCurrentTreeName] = useState<string>('family_tree');
    const [homeAutoloadEnabled, setHomeAutoloadEnabled] = useState(true);

    const loadTree = useCallback(async (returnOnly = false, specificFileId?: string): Promise<TreeDocument | null> => {
        if (!returnOnly) setLoading(true);
        setError(null);
        setAccessDenied(false);

        try {
            // PHASE 2: Check for Sheets tree first
            const mainSheetsTree = await GlobalTreeService.loadMainTreeFromSheets();
            if (mainSheetsTree) {
                console.log("App: Successfully loaded tree from Sheets.");
                if (!returnOnly) {
                    setTree(mainSheetsTree);
                    setIsSheetsMode(true);
                    setCurrentTreeId('sheets_main');
                    setCurrentTreeName('Main Family Tree');
                    setHomeAutoloadEnabled(false);
                    setLoading(false);
                }
                return mainSheetsTree;
            }

            console.log("App: Sheets tree not found, falling back to JSON files...");
            setIsSheetsMode(false);

            const files = await listTreeFiles();
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const fileslist = files as any[];

            if (fileslist && fileslist.length > 0) {
                let fileToLoad = fileslist[0];

                if (specificFileId) {
                    const found = fileslist.find((f: any) => f.id === specificFileId);
                    if (found) {
                        fileToLoad = found;
                    } else {
                        console.warn("Requested file ID not found:", specificFileId);
                    }
                } else if (currentTreeId && fileslist.some((f: any) => f.id === currentTreeId)) {
                    if (currentTreeName) {
                        const consistentFiles = fileslist.filter((f: any) => getTreeNameFromFilename(f.name) === currentTreeName);
                        if (consistentFiles.length > 0) {
                            consistentFiles.sort((a: any, b: any) => new Date(b.modifiedTime).getTime() - new Date(a.modifiedTime).getTime());
                            fileToLoad = consistentFiles[0];
                        }
                    } else {
                        fileToLoad = fileslist.find((f: any) => f.id === currentTreeId);
                    }
                }

                console.log("Loading file:", fileToLoad.name, fileToLoad.id);
                setCurrentTreeId(fileToLoad.id);
                setCurrentTreeName(getTreeNameFromFilename(fileToLoad.name));

                const content = await getFileContent(fileToLoad.id);

                if (!content || typeof content !== 'object') {
                    throw new Error("Invalid file content: Not an object");
                }
                if (!('nodes' in content) || !('rootNodeId' in content)) {
                    throw new Error("Invalid tree structure: Missing nodes or rootNodeId");
                }

                const treeDoc = content as TreeDocument;

                if (!treeDoc.rootNodeId || !treeDoc.nodes[treeDoc.rootNodeId]) {
                    console.warn(`Root node "${treeDoc.rootNodeId}" is invalid or not found in nodes! Attempting to fix...`);
                    const nodeIds = Object.keys(treeDoc.nodes);
                    if (nodeIds.length > 0) {
                        const newRoot = Object.values(treeDoc.nodes).find(n => !n.parentId);
                        if (newRoot) {
                            treeDoc.rootNodeId = newRoot.nodeId;
                        } else {
                            treeDoc.rootNodeId = nodeIds[0];
                        }
                    } else {
                        treeDoc.rootNodeId = "";
                    }
                }

                if (currentUser && currentUser.email) {
                    const userEmail = currentUser.email.toLowerCase();
                    const nodes = Object.values(treeDoc.nodes);
                    const isMember = nodes.some(n => n.email?.toLowerCase() === userEmail);
                    const isCreator = treeDoc.meta.createdBy?.toLowerCase() === userEmail;
                    const isEmpty = nodes.length === 0;

                    if (!isMember && !isCreator && !isEmpty) {
                        setAccessDenied(true);
                        setTree(null);
                        return null;
                    }
                }

                GlobalTreeService.hydrateTree(treeDoc, fileslist);
                GlobalTreeService.registerTree(fileToLoad.id, treeDoc);

                setTree(treeDoc);
                setHomeAutoloadEnabled(false);
                return treeDoc;
            } else {
                if (isSignedIn) {
                    setTree(null);
                }
                return null;
            }
        } catch (err) {
            console.error("Failed to load tree", err);
            if (isSignedIn) {
                setError("Failed to load family tree.");
            }
            return null;
        } finally {
            if (!returnOnly) setLoading(false);
        }
    }, [currentUser, isSignedIn, currentTreeId, currentTreeName]);

    const handleMigrateToStage2 = useCallback(async () => {
        if (!tree) return;
        setLoading(true);
        setLoadingMessage("Migrating to Stage 2 (Sheets)...");
        try {
            const success = await migrateTreeToSheets(tree);
            if (success) {
                alert("Migration successful! Reloading tree from Sheets...");
                window.location.reload();
            } else {
                alert("Migration failed. Please check console.");
            }
        } catch (err) {
            alert("Migration error.");
            console.error(err);
        } finally {
            setLoading(false);
        }
    }, [tree]);

    return {
        tree, setTree,
        loading, setLoading,
        loadingMessage, setLoadingMessage,
        isSheetsMode, setIsSheetsMode,
        error, setError,
        accessDenied, setAccessDenied,
        currentTreeId, setCurrentTreeId,
        currentTreeName, setCurrentTreeName,
        homeAutoloadEnabled, setHomeAutoloadEnabled,
        loadTree,
        handleMigrateToStage2
    };
};
