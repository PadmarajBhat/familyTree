import type { PersonNode } from '../../logic/types';
import { loadedTreesCache } from './cache';

export interface SearchResult {
    treeId: string;
    treeName: string;
    node: PersonNode;
    parentName?: string | null;
}

// Unified Search
export function searchAllTrees(query: string): SearchResult[] {
    const results: SearchResult[] = [];
    const lowerQuery = query.toLowerCase();

    Object.entries(loadedTreesCache).forEach(([fileId, tree]) => {
        Object.values(tree.nodes).forEach(node => {
            const nameMatch = node.name?.toLowerCase().includes(lowerQuery) || false;
            const matchesTranslations = node.nameTranslations ? Object.values(node.nameTranslations).some(t => t?.toLowerCase().includes(lowerQuery)) : false;

            if (nameMatch || matchesTranslations) {
                const parentNode = node.parentId ? tree.nodes[node.parentId] : null;
                results.push({
                    treeId: fileId, // Use fileId as the identifier we can load later
                    treeName: tree.treeName,
                    node: node,
                    parentName: parentNode?.name
                });
            }
        });
    });

    return results;
}

export async function searchBackend(query: string, treeId: string): Promise<SearchResult[]> {
    try {
        // Dynamic import to avoid circular dependency if any (though Service typically safe)
        const { TreeService } = await import('../TreeService');
        const results = await TreeService.searchTree(query, treeId);

        // Map backend results to SearchResult
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return results.map((r: any) => ({
            treeId: r.treeId || treeId,
            treeName: r.treeName || 'Unknown',
            node: {
                nodeId: r.nodeId,
                name: r.name,
                gender: r.gender,
                // Full PersonNode stub to satisfy TS interface
                imageUrl: null,
                phone: null,
                phoneE164: null,
                email: null,
                dob: null,
                ageProvided: null,
                dobInferred: false,
                dobApprox: { known: false, year: null, month: null, day: null },
                dod: null,
                dodApprox: { known: false, year: null, month: null, day: null },
                address: { freeform: null },
                spouseIds: [],
                parentId: null,
                childrenIds: [],
                isEditor: false,
                editorSince: null,
                editedBy: null,
                editedTime: null,
                hobbies: [],
                education: [],
                occupation: null,
                notes: "",
                location: null,
                nameTranslations: {},
                externalLink: undefined
            } as PersonNode,
            parentName: r.fatherName // Backend returns 'fatherName', mapped to parentName
        }));
    } catch (e) {
        console.error("Backend search failed", e);
        return [];
    }
}
