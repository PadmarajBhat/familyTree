import type { TreeDocument } from './types';
import { canEdit } from './accessControl';

export const PROTECTED_EMAILS = ['padmarajbhat@gmail.com', 'narasimhapbhat@gmail.com'];

/**
 * Checks if a user has global editor privileges.
 * A global editor can edit any node in the tree.
 */
export const isGlobalEditor = (tree: TreeDocument | null, email: string | null | undefined): boolean => {
    if (!email || !tree) return false;

    // 1. Hardcoded list (bootstrap)
    if (canEdit(email)) return true;

    // 2. Tree Creator
    if (tree.meta.createdBy?.toLowerCase() === email.toLowerCase()) return true;

    // 3. User with isEditor: true
    const userNode = Object.values(tree.nodes).find(n => n.email?.toLowerCase() === email.toLowerCase());
    if (userNode?.isEditor) return true;

    return false;
};

/**
 * Checks if a user can edit a specific node.
 * Users can edit a node if:
 * 1. They are a global editor.
 * 2. The node belongs to them (matches their email).
 */
export const canEditNode = (tree: TreeDocument | null, email: string | null | undefined, nodeId: string): boolean => {
    if (!email || !tree) return false;

    // Global editors can edit anything
    if (isGlobalEditor(tree, email)) return true;

    // Users can edit their own profile
    const targetNode = tree.nodes[nodeId];
    if (targetNode && targetNode.email?.toLowerCase() === email.toLowerCase()) {
        return true;
    }

    return false;
};
