
import { v4 as uuidv4 } from 'uuid';
import type { PersonNode, TreeDocument } from '../../logic/types';

interface UseGeminiAdaptersProps {
    tree: TreeDocument | null;
    handleSaveMember: any;
}

export function useGeminiAdapters({ tree, handleSaveMember }: UseGeminiAdaptersProps) {
    const handleGeminiAddPerson = async (data: Partial<PersonNode>) => {
        try {
            if (!data.name) throw new Error("Name is required");
            const newNode: PersonNode = {
                nodeId: data.nodeId || uuidv4(),
                name: data.name,
                gender: data.gender || 'unknown',
                spouseIds: [],
                childrenIds: [],
                parentId: data.parentId || null,
                ...data
            } as PersonNode;

            await handleSaveMember(newNode, newNode.parentId, [], [], []);
            return { success: true, message: `Added ${newNode.name}`, nodeId: newNode.nodeId };
        } catch (e) {
            return { success: false, message: (e as Error).message };
        }
    };

    const handleGeminiUpdatePerson = async (data: Partial<PersonNode>) => {
        try {
            if (!data.nodeId || !tree?.nodes[data.nodeId]) throw new Error("Node not found");
            const existing = tree.nodes[data.nodeId];
            const updated = { ...existing, ...data };
            await handleSaveMember(updated, updated.parentId, [], [], []);
            return { success: true, message: `Updated ${updated.name}`, nodeId: updated.nodeId };
        } catch (e) {
            return { success: false, message: (e as Error).message };
        }
    };

    const handleSearchNodes = async (query: string) => {
        if (!tree) return [];
        const lower = query.toLowerCase();
        return Object.values(tree.nodes).filter(n => n.name && n.name.toLowerCase().includes(lower));
    };

    const handleGetRecentNodes = async (limit: number) => {
        if (!tree) return [];
        return Object.values(tree.nodes)
            .sort((a, b) => new Date(b.editedTime || 0).getTime() - new Date(a.editedTime || 0).getTime())
            .slice(0, limit);
    };

    return {
        onAddPerson: handleGeminiAddPerson,
        onUpdatePerson: handleGeminiUpdatePerson,
        onSearchNodes: handleSearchNodes,
        onGetRecentNodes: handleGetRecentNodes
    };
}
