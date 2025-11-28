import type { TreeDocument, PersonNode, Marriage, ChangeLog } from './types';
import { getISTTimestamp } from './dateUtils';

export interface MergeResult {
    mergedTree: TreeDocument;
    isSuperset: boolean; // True if one tree was a strict superset of the other
    supersetType: 'LOCAL_SUPERSET' | 'REMOTE_SUPERSET' | 'NONE';
    nodesArchived: string[]; // IDs of nodes that were in the smaller set (if superset)
}

export const mergeTrees = (local: TreeDocument, remote: TreeDocument): MergeResult => {
    const localIds = new Set(Object.keys(local.nodes));
    const remoteIds = new Set(Object.keys(remote.nodes));

    // 1. Superset Check
    // "Identify superset: if nodeIds(smaller) ⊆ nodeIds(bigger), append summary and archive+delete smaller"
    const localIsSuperset = [...remoteIds].every(id => localIds.has(id));
    const remoteIsSuperset = [...localIds].every(id => remoteIds.has(id));

    let supersetType: 'LOCAL_SUPERSET' | 'REMOTE_SUPERSET' | 'NONE' = 'NONE';

    // If both are supersets of each other (identical node sets), we treat it as a normal merge (NONE) to resolve field conflicts.
    // Unless they are EXACTLY the same content, but we'll let the merge logic handle that.
    // The requirement implies "smaller" vs "bigger". If equal size and same IDs, no "smaller".

    if (localIsSuperset && !remoteIsSuperset) {
        supersetType = 'LOCAL_SUPERSET';
    } else if (remoteIsSuperset && !localIsSuperset) {
        supersetType = 'REMOTE_SUPERSET';
    }

    // 2. Union by nodeId
    const mergedNodes: Record<string, PersonNode> = {};
    const allIds = new Set([...localIds, ...remoteIds]);

    for (const id of allIds) {
        const localNode = local.nodes[id];
        const remoteNode = remote.nodes[id];

        if (!localNode) {
            mergedNodes[id] = remoteNode;
            continue;
        }
        if (!remoteNode) {
            mergedNodes[id] = localNode;
            continue;
        }

        // Both exist: Field-level LWW
        mergedNodes[id] = mergeNodes(localNode, remoteNode);
    }

    // 3. Structural Integrity: Recompute childrenIds from parent pointers
    // "Recompute childrenIds from parent pointers post-merge to maintain integrity."

    // First, clear all childrenIds
    for (const id in mergedNodes) {
        mergedNodes[id].childrenIds = [];
    }
    // Then rebuild
    for (const id in mergedNodes) {
        const node = mergedNodes[id];
        if (node.parentId && mergedNodes[node.parentId]) {
            mergedNodes[node.parentId].childrenIds.push(id);
        }
    }

    // 4. Merge Marriages
    // "Merge marriages by id; LWW for fields."
    const mergedMarriages = mergeMarriages(local.marriages, remote.marriages);

    // 5. Merge Summaries
    // "Concatenate summaries; sort latest-first."
    const mergedSummary = mergeSummaries(local.summary, remote.summary);

    const mergedTree: TreeDocument = {
        ...local, // Base on local for schemaVersion etc.
        treeId: local.treeId,
        versionIndex: Math.max(local.versionIndex, remote.versionIndex) + 1,
        timestamp: getISTTimestamp(),
        nodes: mergedNodes,
        marriages: mergedMarriages,
        summary: mergedSummary,
        meta: {
            ...local.meta,
            nodeCount: Object.keys(mergedNodes).length,
        }
    };

    return {
        mergedTree,
        isSuperset: supersetType !== 'NONE',
        supersetType,
        nodesArchived: [] // This would be populated if we were actually archiving specific nodes, but here we are merging.
        // The "archive+delete smaller" instruction applies to the FILE, not the nodes within the merge result.
        // The merge result SHOULD contain everything.
    };
};

const mergeNodes = (n1: PersonNode, n2: PersonNode): PersonNode => {
    const t1 = new Date(n1.editedTime || 0).getTime();
    const t2 = new Date(n2.editedTime || 0).getTime();

    // "Field conflicts: per-field Latest-Write-Wins using editedTime."
    // Since we only have one `editedTime` per node, the node with the later timestamp wins for ALL fields.
    // If we had per-field timestamps, we would compare them individually.
    // For now, Node-level LWW is the best proxy for "per-field LWW using editedTime" given the data structure.

    if (t2 > t1) {
        return n2;
    } else {
        return n1;
    }
};

const mergeMarriages = (m1: Marriage[], m2: Marriage[]): Marriage[] => {
    const map = new Map<string, Marriage>();
    // We don't have editedTime on Marriage, so we'll just take the one from the list that appears last (or first).
    // Or we can try to be smart. But without timestamps, "LWW" is ambiguous.
    // We'll assume the order in the array might reflect recency if we processed them, but here we just have two lists.
    // Let's just union them by ID. If duplicates, we take the one from the 'remote' (m2) effectively overwriting 'local' (m1) if we iterate m1 then m2.
    // However, usually we want the "latest".
    // Since we lack timestamps on marriages, we will just use the one from the 'superset' or 'newer' tree if possible?
    // Let's just do a simple map set.

    [...m1, ...m2].forEach(m => {
        map.set(m.id, m);
    });
    return Array.from(map.values());
};

const mergeSummaries = (s1: ChangeLog[], s2: ChangeLog[]): ChangeLog[] => {
    const unique = new Map<string, ChangeLog>();

    // Key by editedTime + editedBy to deduplicate exact same log entries
    [...s1, ...s2].forEach(log => {
        const key = `${log.editedTime}_${log.editedBy}`;
        unique.set(key, log);
    });

    return Array.from(unique.values())
        .sort((a, b) => new Date(b.editedTime).getTime() - new Date(a.editedTime).getTime());
};

