import type { TreeDocument } from '../../logic/types';

interface UseTreeStorageProps {
    currentTreeName: string;
    currentTreeId: string | null;
    setCurrentTreeId: (id: string | null) => void;
    setLoading: (loading: boolean) => void;
    setLoadingMessage: (msg: string) => void;
    loadTree: (treeId?: string) => Promise<TreeDocument | null>;
}

export function useTreeStorage({
    currentTreeId,
    setLoading,
    loadTree
}: UseTreeStorageProps) {

    const executeWithLock = async (action: (latestTree: TreeDocument | null) => Promise<void>) => {
        setLoading(true);
        try {
            // In the new granular backend architecture, we don't strictly need to lock the whole file.
            // But fetching the latest state ensures we aren't editing stale data.
            const latestTree = await loadTree(currentTreeId || undefined);
            await action(latestTree);
        } catch (err) {
            console.error("Top level error in executeWithLock", err);
        } finally {
            setLoading(false);
        }
    };

    return { executeWithLock };
}
