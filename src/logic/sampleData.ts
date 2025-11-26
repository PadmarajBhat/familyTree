import { v4 as uuidv4 } from 'uuid';
import type { TreeDocument, PersonNode } from './types';
import { getISTTimestamp } from './dateUtils';

export const generateSampleTree = (currentUserEmail: string): TreeDocument => {
    const now = getISTTimestamp();
    const treeId = uuidv4();

    const tree: TreeDocument = {
        schemaVersion: 1,
        treeId: treeId,
        treeName: "Mahabharata Lineage",
        versionIndex: 0,
        timestamp: now,
        rootNodeId: "",
        nodes: {},
        marriages: [],
        summary: [],
        meta: {
            createdBy: currentUserEmail,
            createdTime: now,
            nodeCount: 0
        }
    };

    const addNode = (name: string, parentId: string | null, spouseIds: string[] = [], extra: Partial<PersonNode> = {}): PersonNode => {
        const nodeId = uuidv4();
        const node: PersonNode = {
            nodeId,
            name,
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
            address: { freeform: "Hastinapura" },
            spouseIds,
            parentId,
            childrenIds: [],
            isEditor: false,
            editorSince: null,
            editedBy: currentUserEmail,
            editedTime: now,
            ...extra
        };
        tree.nodes[nodeId] = node;
        tree.meta.nodeCount++;

        if (parentId && tree.nodes[parentId]) {
            tree.nodes[parentId].childrenIds.push(nodeId);
        }

        return node;
    };

    // --- Generation 1 ---
    const shantanu = addNode("Shantanu", null);
    tree.rootNodeId = shantanu.nodeId;

    const ganga = addNode("Ganga", null, [shantanu.nodeId]);
    const satyavati = addNode("Satyavati", null, [shantanu.nodeId]);

    shantanu.spouseIds = [ganga.nodeId, satyavati.nodeId];

    // --- Generation 2 ---
    addNode("Bhishma", shantanu.nodeId, [], { address: { freeform: "Hastinapura (Grandsire)" } });

    addNode("Chitrangada", shantanu.nodeId);
    const vichitravirya = addNode("Vichitravirya", shantanu.nodeId);

    const ambika = addNode("Ambika", null, [vichitravirya.nodeId]);
    const ambalika = addNode("Ambalika", null, [vichitravirya.nodeId]);
    vichitravirya.spouseIds = [ambika.nodeId, ambalika.nodeId];

    // --- Generation 3 ---
    const dhritarashtra = addNode("Dhritarashtra", vichitravirya.nodeId);
    const gandhari = addNode("Gandhari", null, [dhritarashtra.nodeId]);
    dhritarashtra.spouseIds = [gandhari.nodeId];

    const pandu = addNode("Pandu", vichitravirya.nodeId);
    const kunti = addNode("Kunti", null, [pandu.nodeId]);
    const madri = addNode("Madri", null, [pandu.nodeId]);
    pandu.spouseIds = [kunti.nodeId, madri.nodeId];

    addNode("Vidura", vichitravirya.nodeId);

    // --- Generation 4 ---
    // Kauravas (Sample)
    addNode("Duryodhana", dhritarashtra.nodeId);
    addNode("Dushasana", dhritarashtra.nodeId);
    addNode("Vikarna", dhritarashtra.nodeId);

    // Pandavas
    const yudhishthira = addNode("Yudhishthira", pandu.nodeId);
    const bhima = addNode("Bhima", pandu.nodeId);
    const arjuna = addNode("Arjuna", pandu.nodeId);
    const nakula = addNode("Nakula", pandu.nodeId);
    const sahadeva = addNode("Sahadeva", pandu.nodeId);

    const draupadi = addNode("Draupadi", null, [yudhishthira.nodeId, bhima.nodeId, arjuna.nodeId, nakula.nodeId, sahadeva.nodeId]);
    yudhishthira.spouseIds.push(draupadi.nodeId);
    bhima.spouseIds.push(draupadi.nodeId);
    arjuna.spouseIds.push(draupadi.nodeId);
    nakula.spouseIds.push(draupadi.nodeId);
    sahadeva.spouseIds.push(draupadi.nodeId);

    const subhadra = addNode("Subhadra", null, [arjuna.nodeId]);
    arjuna.spouseIds.push(subhadra.nodeId);

    // --- Generation 5 ---
    const abhimanyu = addNode("Abhimanyu", arjuna.nodeId);
    const uttara = addNode("Uttara", null, [abhimanyu.nodeId]);
    abhimanyu.spouseIds = [uttara.nodeId];

    addNode("Ghatotkacha", bhima.nodeId);

    // --- Generation 6 ---
    const parikshit = addNode("Parikshit", abhimanyu.nodeId);

    // --- Generation 7 ---
    addNode("Janamejaya", parikshit.nodeId);

    return tree;
};
