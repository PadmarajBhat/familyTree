import type { PersonNode } from '../../logic/types';
import type { SearchResult } from '../../services/GlobalTreeService';

export const createShadowNode = (result: SearchResult): PersonNode => ({
    nodeId: result.node.nodeId,
    name: result.node.name,
    imageUrl: result.node.imageUrl,
    gender: result.node.gender,
    dob: result.node.dob,
    dobApprox: result.node.dobApprox || { known: false, year: null, month: null, day: null },
    dod: result.node.dod,
    dodApprox: result.node.dodApprox || { known: false, year: null, month: null, day: null },
    dobInferred: false,
    ageProvided: null,
    phone: null,
    phoneE164: null,
    email: null,
    address: { freeform: null }, // Don't verify address for shadow nodes
    spouseIds: [],
    parentId: null,
    childrenIds: [],
    isEditor: false,
    editorSince: null,
    editedBy: null,
    editedTime: null,
    externalLink: {
        treeId: result.treeId,
        nodeId: result.node.nodeId,
        treeName: result.treeName
    },
    // Optional fields initialized to null/empty
    education: [],
    occupation: null,
    hobbies: [],
    notes: null,
    location: null,
    videoUrl: null,
    nameTranslations: {}
});
