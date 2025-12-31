import type { TreeDocument, PersonNode } from '../../logic/types';
import { listTreeFiles, getFileContent, acquireLock, releaseLock, updateTreeFile } from '../drive';
import { getISTTimestamp } from '../../logic/dateUtils';
import { getTreeNameFromFilename } from '../../logic/fileUtils';
import { loadedTreesCache } from './cache';

/**
 * Adds a spouse to a remote node in another tree.
 * This ensures bi-directional linking when a user adds a spouse from another tree.
 */
export const addSpouseToRemoteNode = async (treeId: string, nodeId: string, newSpouseId: string, userEmail: string): Promise<boolean> => {
    console.log(`Attempting to add spouse ${newSpouseId} to remote node ${nodeId} in tree ${treeId}`);
    const lockId = await acquireLock(treeId);
    if (!lockId) {
        console.error(`Could not acquire lock for remote tree ${treeId} to add spouse linkage.`);
        return false;
    }

    try {
        const content = await getFileContent(treeId);
        const treeDoc = content as TreeDocument;
        const node = treeDoc.nodes[nodeId];

        if (!node) {
            console.error("Remote node not found for spouse linking");
            return false;
        }

        // check if already linked
        if (!node.spouseIds.includes(newSpouseId)) {
            node.spouseIds.push(newSpouseId);

            // Metadata update
            node.editedBy = userEmail;
            node.editedTime = getISTTimestamp();

            await updateTreeFile(treeId, treeDoc, "Auto-Link Spouse");
            console.log("Remote tree updated with spouse link.");

            // Update Cache
            loadedTreesCache[treeId] = treeDoc;
        } else {
            console.log("Spouse link already exists remotely.");
        }
        return true;
    } catch (e) {
        console.error("Error adding spouse to remote node", e);
        return false;
    } finally {
        await releaseLock(lockId);
    }
};

// Updates a node in a remote tree file with locking
export const updateRemoteNode = async (treeId: string, nodeId: string, updates: Partial<PersonNode>, userEmail: string): Promise<boolean> => {
    console.log(`Attempting to update remote node ${nodeId} in tree ${treeId}`);

    // 1. Acquire Lock
    const lockId = await acquireLock(treeId);
    if (!lockId) {
        console.error(`Could not acquire lock for remote tree ${treeId}`);
        alert(`Could not acquire lock for remote tree. Changes synced to local Shadow Node but NOT source tree.`);
        return false;
    }

    try {
        // 2. Read Latest Content
        const content = await getFileContent(treeId);
        const treeDoc = content as TreeDocument;

        // 3. Find Node
        const node = treeDoc.nodes[nodeId];
        if (!node) {
            console.error("Remote node not found");
            return false;
        }

        // 4. Update allowed fields (Profile Data)
        if (updates.name !== undefined) node.name = updates.name;
        if (updates.gender !== undefined) node.gender = updates.gender;
        if (updates.dob !== undefined) node.dob = updates.dob;
        if (updates.imageUrl !== undefined) node.imageUrl = updates.imageUrl;
        if (updates.dod !== undefined) node.dod = updates.dod;
        if (updates.education !== undefined) node.education = updates.education;
        if (updates.occupation !== undefined) node.occupation = updates.occupation;
        if (updates.hobbies !== undefined) node.hobbies = updates.hobbies;
        if (updates.notes !== undefined) node.notes = updates.notes;
        if (updates.address !== undefined) node.address = updates.address;
        if (updates.location !== undefined) node.location = updates.location;
        if (updates.phone !== undefined) node.phone = updates.phone;
        if (updates.email !== undefined) node.email = updates.email;

        // Metadata
        node.editedBy = userEmail;
        node.editedTime = getISTTimestamp();

        // 5. Save
        await updateTreeFile(treeId, treeDoc, "Live Link Sync Update");
        console.log("Remote tree updated successfully.");

        // 6. Update Cache
        loadedTreesCache[treeId] = treeDoc;
        return true;

    } catch (e) {
        console.error("Error updating remote node", e);
        alert("Error syncing to remote tree. Please check console.");
        return false;
    } finally {
        await releaseLock(lockId);
    }
};

export const removeLinksToTree = async (deletedTreeId: string, userEmail: string, onProgress?: (msg: string) => void): Promise<void> => {
    console.log(`Starting deep cleanup for tree ${deletedTreeId}...`);
    try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const files = (await listTreeFiles()) as any[];
        const otherFiles = files.filter(f => f.id !== deletedTreeId && !f.name.startsWith('backup_') && !f.name.startsWith('delete_'));

        let processedCount = 0;
        for (const file of otherFiles) {
            processedCount++;
            const percentage = Math.round((processedCount / otherFiles.length) * 100);
            const properName = getTreeNameFromFilename(file.name);

            if (onProgress) onProgress(`Scanning ${properName} (${percentage}%)...`);

            try {
                const lockId = await acquireLock(file.id);
                if (!lockId) continue; // Skip if locked

                try {
                    const content = await getFileContent(file.id);
                    if (content && typeof content === 'object' && 'nodes' in content) {
                        const treeDoc = content as TreeDocument;
                        let modified = false;

                        Object.values(treeDoc.nodes).forEach(node => {
                            if (node.externalLink && node.externalLink.treeId === deletedTreeId) {
                                console.log(`Removing dead link node ${node.nodeId} in tree ${treeDoc.treeName}`);
                                delete treeDoc.nodes[node.nodeId];
                                modified = true;
                            }
                        });

                        if (modified) {
                            if (onProgress) onProgress(`Cleaning references in ${properName}...`);
                            treeDoc.meta.nodeCount = Object.keys(treeDoc.nodes).length;
                            treeDoc.summary.unshift({
                                editedTime: getISTTimestamp(),
                                editedBy: userEmail,
                                changes: `Removed dead links to deleted tree ${deletedTreeId}`
                            });
                            await updateTreeFile(file.id, treeDoc, "Deep Cleanup");
                        }
                    }
                } finally {
                    await releaseLock(lockId);
                }

            } catch (e) {
                console.warn(`Failed to process file ${file.name} during cleanup`, e);
            }
        }
    } catch (e) {
        console.error("Deep cleanup failed", e);
    }
};
