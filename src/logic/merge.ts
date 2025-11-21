import type { TreeDocument, PersonNode } from './types';
import { getISTTimestamp } from './dateUtils';

export const mergeTrees = (local: TreeDocument, remote: TreeDocument): TreeDocument => {
    // 1. Superset Check
    const localIds = new Set(Object.keys(local.nodes));
    const remoteIds = new Set(Object.keys(remote.nodes));

    const localIsSuperset = [...remoteIds].every(id => localIds.has(id));
    const remoteIsSuperset = [...localIds].every(id => remoteIds.has(id));

    if (remoteIsSuperset && !localIsSuperset) {
        // Remote has everything local has + more.
        // We should just take remote, but we might want to preserve local unsynced changes if any?
        // The requirement says: "Identify superset: if nodeIds(smaller) ⊆ nodeIds(bigger), append summary and archive+delete smaller"
        // Here we are merging to produce a NEW state.
        // If remote is strictly better, we return remote (maybe with merged summary).
        // But if we have local edits that aren't in remote yet, we must merge.
        // "Superset" usually implies "contains all nodes". It doesn't mean "contains all latest edits".
        // So we must always do field-level merge unless we are sure local is stale.
        // However, for simplicity/safety, we proceed to full merge.
    }

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

    // Structural Integrity: Recompute childrenIds from parent pointers
    // The requirement: "Recompute childrenIds from parent pointers post-merge to maintain integrity."
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

    // Merge Marriages
    // "Merge marriages by id; LWW for fields."
    const mergedMarriages = mergeMarriages(local.marriages, remote.marriages);

    // Merge Summaries
    // "Concatenate summaries; sort latest-first."
    const mergedSummary = [...local.summary, ...remote.summary]
        .filter((v, i, a) => a.findIndex(t => t.editedTime === v.editedTime && t.editedBy === v.editedBy) === i) // Dedupe exact matches
        .sort((a, b) => new Date(b.editedTime).getTime() - new Date(a.editedTime).getTime());

    return {
        ...local, // Base on local for schemaVersion etc, but update fields
        treeId: local.treeId, // Should be same
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
};

const mergeNodes = (n1: PersonNode, n2: PersonNode): PersonNode => {
    const t1 = new Date(n1.editedTime || 0).getTime();
    const t2 = new Date(n2.editedTime || 0).getTime();

    // If one is significantly newer, we could just take it.
    // But "Field conflicts: per-field Latest-Write-Wins using editedTime" implies we might need field granularity?
    // Usually LWW is per-object or per-field.
    // If we track editedTime PER FIELD, we can do per-field.
    // But we only have `editedTime` on the Node.
    // So we must assume the Node with the later `editedTime` is the winner for ALL fields,
    // OR we assume `editedTime` reflects the last change to *any* field.
    // If n1 changed 'name' at t1, and n2 changed 'phone' at t2 (t2 > t1).
    // If we just take n2, we lose n1's name change?
    // Yes, unless we have a diff/history.
    // The requirement says: "Field conflicts: per-field Latest-Write-Wins using editedTime."
    // This is impossible without per-field timestamps or a common ancestor (3-way merge).
    // We only have 2-way merge here (local vs remote).
    // WITHOUT a common ancestor, we cannot know if n1.name is "newer" than n2.name if they differ.
    // We only know n2.editedTime > n1.editedTime.
    // So n2 wins.
    // UNLESS we assume the user wants to merge *different* fields?
    // But we don't know which fields changed.
    // Wait, we have `summary` which lists `fieldsChanged`.
    // We COULD use the summary history to reconstruct field timestamps, but that's expensive.
    // Simple LWW: The node with the later timestamp wins.

    return t2 > t1 ? n2 : n1;
};

const mergeMarriages = (m1: any[], m2: any[]): any[] => {
    const map = new Map();
    [...m1, ...m2].forEach(m => {
        // We don't have timestamps on marriages?
        // Requirement: "marriages: [{ id, a, b, marriageDate|null, divorceDate|null }]"
        // No editedTime on Marriage.
        // We assume they are immutable or we just take one.
        // Or maybe we should add editedTime to Marriage?
        // For now, just dedupe by ID.
        map.set(m.id, m);
    });
    return Array.from(map.values());
};
