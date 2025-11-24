import { v4 as uuidv4 } from 'uuid';
import type { TreeDocument, PersonNode } from './types';
import { getISTTimestamp } from './dateUtils';

export const generateSampleTree = (currentUserEmail: string): TreeDocument => {
    const rootId = uuidv4();
    const now = getISTTimestamp();

    const tree: TreeDocument = {
        schemaVersion: 1,
        treeId: uuidv4(),
        treeName: "Large Sample Tree",
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

    // Create Root
    tree.nodes[rootId] = {
        nodeId: rootId,
        name: "Root Ancestor",
        imageUrl: `https://i.pravatar.cc/150?u=${rootId}`,
        phone: null,
        phoneE164: null,
        email: null,
        dob: "1900-01-01",
        dobApprox: { known: true, year: 1900, month: 1, day: 1 },
        dod: null,
        dodApprox: { known: false, year: null, month: null, day: null },
        ageProvided: null,
        dobInferred: false,
        address: { freeform: null },
        spouseIds: [],
        parentId: null,
        childrenIds: [],
        isEditor: false,
        editorSince: null,
        editedBy: currentUserEmail,
        editedTime: now
    };
    tree.meta.nodeCount++;

    // Create 10 branches (Wide)
    for (let i = 0; i < 10; i++) {
        let parentId = rootId;

        // Create 20 generations (Deep)
        for (let j = 0; j < 20; j++) {
            const nodeId = uuidv4();
            const name = `Sample Person ${i + 1}-${j + 1}`;

            const node: PersonNode = {
                nodeId: nodeId,
                name: name,
                imageUrl: `https://i.pravatar.cc/150?u=${nodeId}`,
                phone: "555-0100",
                phoneE164: "+15550100",
                email: `person${i}-${j}@example.com`,
                dob: null,
                dobApprox: { known: false, year: null, month: null, day: null },
                dod: null,
                dodApprox: { known: false, year: null, month: null, day: null },
                ageProvided: 20 + j,
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

            tree.nodes[nodeId] = node;

            // Link to parent
            if (tree.nodes[parentId]) {
                tree.nodes[parentId].childrenIds.push(nodeId);
            }
            tree.meta.nodeCount++;

            // Set current node as parent for next generation
            parentId = nodeId;
        }
    }

    return tree;
};
