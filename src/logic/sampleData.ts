import { v4 as uuidv4 } from 'uuid';
import type { TreeDocument, PersonNode } from './types';
import { getISTTimestamp } from './dateUtils';

export const generateSampleTree = (currentUserEmail: string): TreeDocument => {
    const rootId = uuidv4();
    const now = getISTTimestamp();

    const tree: TreeDocument = {
        schemaVersion: 1,
        treeId: uuidv4(),
        treeName: "Random Sample Tree",
        versionIndex: 0,
        timestamp: now,
        rootNodeId: rootId,
        nodes: {},
        marriages: [],
        summary: [],
        meta: {
            createdBy: currentUserEmail,
            createdTime: now,
            nodeCount: 0
        }
    };

    const createNode = (parentId: string | null, name: string, age: number): PersonNode => {
        const nodeId = uuidv4();
        return {
            nodeId: nodeId,
            name: name,
            imageUrl: `https://i.pravatar.cc/150?u=${nodeId}`,
            phone: "555-0100",
            phoneE164: "+15550100",
            email: `${name.replace(/\s/g, '.').toLowerCase()}@example.com`,
            dob: null,
            dobApprox: { known: false, year: null, month: null, day: null },
            dod: null,
            dodApprox: { known: false, year: null, month: null, day: null },
            ageProvided: age,
            dobInferred: false,
            address: { freeform: "Sample Address, City" },
            spouseIds: [],
            parentId: parentId,
            childrenIds: [],
            isEditor: false,
            editorSince: null,
            editedBy: currentUserEmail,
            editedTime: now
        };
    };

    const addNodeToTree = (node: PersonNode) => {
        tree.nodes[node.nodeId] = node;
        if (node.parentId && tree.nodes[node.parentId]) {
            tree.nodes[node.parentId].childrenIds.push(node.nodeId);
        }
        tree.meta.nodeCount++;
    };

    // Create Root
    const root = createNode(null, "Root Ancestor", 90);
    addNodeToTree(root);

    // Recursive function to build branches
    const buildBranch = (parentId: string, depth: number, maxDepth: number, branchName: string) => {
        if (depth > maxDepth) return;

        // Main child (continues the lineage)
        const mainChildName = `${branchName} - Gen ${depth}`;
        const mainChild = createNode(parentId, mainChildName, 90 - (depth * 20)); // Rough age calc
        addNodeToTree(mainChild);

        // Continue main branch
        buildBranch(mainChild.nodeId, depth + 1, maxDepth, branchName);

        // Chance for siblings (Side branches)
        if (Math.random() > 0.6) { // 40% chance
            const siblingCount = Math.floor(Math.random() * 2) + 1; // 1 or 2 siblings
            for (let k = 0; k < siblingCount; k++) {
                const siblingName = `${branchName} - Gen ${depth} - Sib ${k + 1}`;
                const sibling = createNode(parentId, siblingName, 90 - (depth * 20) - 2);
                addNodeToTree(sibling);

                // Chance for sibling to have a short sub-branch
                if (Math.random() > 0.7 && depth < maxDepth - 5) { // 30% chance, if not too deep
                    buildBranch(sibling.nodeId, depth + 1, depth + 3, `${siblingName} Sub`);
                }
            }
        }
    };

    // Create 5 Main Clans (Deep branches)
    for (let i = 0; i < 5; i++) {
        buildBranch(rootId, 1, 20, `Clan ${i + 1}`);
    }

    return tree;
};
