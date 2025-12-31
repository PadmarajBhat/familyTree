import { useState, useCallback } from 'react';
import type { TreeDocument } from '../../logic/types';
import { GlobalTreeService } from '../../services/GlobalTreeService';

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
            const mainSheetsTree = await GlobalTreeService.loadMainTreeFromSheets(specificFileId);
            if (mainSheetsTree) {
                console.log("App: Successfully loaded tree from Sheets.");
                if (!returnOnly) {
                    setTree(mainSheetsTree);
                    setIsSheetsMode(true);
                    setCurrentTreeId(specificFileId || 'sheets_main');
                    setCurrentTreeName(mainSheetsTree.treeName || 'Main Family Tree');
                    setHomeAutoloadEnabled(false);
                    setLoading(false);
                }
                return mainSheetsTree;
            }

            console.log("App: Sheets tree not found.");
            setIsSheetsMode(true); // Always true now

            if (isSignedIn) {
                setTree(null);
            }
            return null;
        } catch (err) {
            console.error("Failed to load tree", err);
            if (isSignedIn) {
                setError("Failed to load family tree.");
            }
            return null;
        } finally {
            if (!returnOnly) setLoading(false);
        }
    }, [currentUser, isSignedIn]);

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
        loadTree
    };
};
