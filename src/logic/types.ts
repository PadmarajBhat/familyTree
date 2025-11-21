export interface PersonNode {
  nodeId: string;
  name: string | null;
  imageUrl: string | null;
  phone: string | null;
  phoneE164: string | null;
  email: string | null;
  dob: string | null; // ISO-8601 YYYY-MM-DD
  dobApprox: { known: boolean; year: number | null; month: number | null; day: number | null };
  dod: string | null; // ISO-8601 YYYY-MM-DD
  dodApprox: { known: boolean; year: number | null; month: number | null; day: number | null };
  ageProvided: number | null;
  dobInferred: boolean;
  address: { freeform: string | null };
  spouseIds: string[];
  parentId: string | null;
  childrenIds: string[];
  isEditor: boolean;
  editorSince: string | null; // ISO string
  editedBy: string | null;
  editedTime: string | null; // ISO string
}

export interface Marriage {
  id: string;
  a: string; // nodeId
  b: string; // nodeId
  marriageDate: string | null;
  divorceDate: string | null;
}

export interface ChangeLog {
  editedBy: string;
  editedTime: string;
  changes: string;
  structured: StructuredChange[];
}

export interface StructuredChange {
  type: 'ADD' | 'EDIT' | 'DELETE' | 'REPARENT';
  nodeId: string | null;
  fieldsChanged: string[];
  before: Partial<PersonNode>;
  after: Partial<PersonNode>;
}

export interface TreeDocument {
  schemaVersion: number;
  treeId: string;
  treeName: string;
  versionIndex: number;
  timestamp: string;
  rootNodeId: string;
  nodes: Record<string, PersonNode>;
  marriages: Marriage[];
  summary: ChangeLog[];
  meta: {
    createdBy: string;
    createdTime: string;
    nodeCount: number;
  };
}
