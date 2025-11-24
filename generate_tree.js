import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';

const generateTree = () => {
    const rootId = uuidv4();
    const now = new Date().toISOString();

    const tree = {
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
            createdBy: "script",
            createdTime: now,
            nodeCount: 0
        }
    };

    // Create Root
    tree.nodes[rootId] = {
        nodeId: rootId,
        name: "Root Ancestor",
        imageUrl: null,
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
        editedBy: "script",
        editedTime: now
    };
    tree.meta.nodeCount++;

    // Create 20 branches (Wide)
    for (let i = 0; i < 20; i++) {
        let parentId = rootId;

        // Create 50 generations (Deep)
        for (let j = 0; j < 50; j++) {
            const nodeId = uuidv4();
            const name = `Gen ${j + 1} - Branch ${i + 1}`;

            tree.nodes[nodeId] = {
                nodeId: nodeId,
                name: name,
                imageUrl: null,
                phone: null,
                phoneE164: null,
                email: null,
                dob: null,
                dobApprox: { known: false, year: null, month: null, day: null },
                dod: null,
                dodApprox: { known: false, year: null, month: null, day: null },
                ageProvided: null,
                dobInferred: false,
                address: { freeform: null },
                spouseIds: [],
                parentId: parentId,
                childrenIds: [],
                isEditor: false,
                editorSince: null,
                editedBy: "script",
                editedTime: now
            };

            // Link to parent
            tree.nodes[parentId].childrenIds.push(nodeId);
            tree.meta.nodeCount++;

            // Set current node as parent for next generation
            parentId = nodeId;
        }
    }

    return tree;
};

const treeData = generateTree();
fs.writeFileSync('large_sample_tree.json', JSON.stringify(treeData, null, 2));
console.log('Generated large_sample_tree.json with ' + treeData.meta.nodeCount + ' nodes.');
