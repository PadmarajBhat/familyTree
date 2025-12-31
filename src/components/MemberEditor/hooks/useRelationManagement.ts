import { useState, useMemo } from 'react';
import type { PersonNode } from '../../../logic/types';
import { GlobalTreeService, type SearchResult } from '../../../services/GlobalTreeService';
import { usePeopleSearch } from '../hooks/usePeopleSearch';
import { isAncestor } from '../../../logic/relationshipUtils';
import { createShadowNode } from '../utils';

export const useRelationManagement = (
    initialData: PersonNode | undefined,
    existingNodes: Record<string, PersonNode>,
    form: any, // Using any for simplicity as form type is complex, but could be typed better
    isLinkedNode: boolean
) => {
    const [pendingShadowNodes, setPendingShadowNodes] = useState<PersonNode[]>([]);



    // Helper to filter out self
    const filterRelation = (res: SearchResult) => {
        if (res.node.nodeId === initialData?.nodeId) return false;
        return true;
    };

    // Father Search
    const fatherSearch = usePeopleSearch({
        initialValue: initialData?.parentId ? (existingNodes[initialData.parentId]?.name || 'Unknown') : '',
        onSearch: (term) => GlobalTreeService.searchAllTrees(term).filter(res => filterRelation(res)).slice(0, 10),
        disabled: isLinkedNode
    });

    // Spouse Search
    const spouseSearch = usePeopleSearch({
        onSearch: (term) => GlobalTreeService.searchAllTrees(term).filter(res => filterRelation(res)).slice(0, 10),
        disabled: isLinkedNode
    });

    // Child Search
    const childSearch = usePeopleSearch({
        onSearch: (term) => GlobalTreeService.searchAllTrees(term).filter(res => filterRelation(res)).slice(0, 10),
        disabled: isLinkedNode
    });

    // Sibling Search
    const [siblingSearchText, setSiblingSearchText] = useState('');
    const siblingSuggestions = useMemo(() => {
        if (!siblingSearchText || siblingSearchText.length < 2) return [];
        const lower = siblingSearchText.toLowerCase();
        return Object.values(existingNodes)
            .filter(n =>
                n.nodeId !== initialData?.nodeId &&
                !form.siblingIds.includes(n.nodeId) &&
                n.name?.toLowerCase().includes(lower) &&
                (initialData ? !isAncestor(initialData.nodeId, n.nodeId, existingNodes) && !isAncestor(n.nodeId, initialData.nodeId, existingNodes) : true)
            )
            .slice(0, 5)
            .map(n => ({
                treeId: 'current',
                treeName: 'Current Tree',
                node: n,
                parentName: n.parentId ? existingNodes[n.parentId]?.name : undefined
            } as SearchResult));
    }, [siblingSearchText, existingNodes, initialData, form.siblingIds]);


    // Handlers
    const handleFatherSelect = (result: SearchResult) => {
        form.setParentId(result.node.nodeId);
        fatherSearch.setSearchText(result.node.name || 'Unknown');
        fatherSearch.setShowSuggestions(false);
        if (!existingNodes[result.node.nodeId]) {
            const shadow = createShadowNode(result);
            setPendingShadowNodes(prev => [...prev.filter(n => n.nodeId !== shadow.nodeId), shadow]);
        }
    };

    const handleSpouseSelect = (result: SearchResult) => {
        form.setSpouseIds((prev: string[]) => [...prev, result.node.nodeId]);
        spouseSearch.setSearchText('');
        spouseSearch.setShowSuggestions(false);
        if (!existingNodes[result.node.nodeId]) {
            const shadow = createShadowNode(result);
            setPendingShadowNodes(prev => [...prev.filter(n => n.nodeId !== shadow.nodeId), shadow]);
        }
    };

    const handleChildSelect = (result: SearchResult) => {
        form.setChildrenIds((prev: string[]) => [...prev, result.node.nodeId]);
        childSearch.setSearchText('');
        childSearch.setShowSuggestions(false);
        if (!existingNodes[result.node.nodeId]) {
            const shadow = createShadowNode(result);
            setPendingShadowNodes(prev => [...prev.filter(n => n.nodeId !== shadow.nodeId), shadow]);
        }
    };

    const handleSiblingSelect = (result: SearchResult) => {
        form.setSiblingIds((prev: string[]) => [...prev, result.node.nodeId]);
        setSiblingSearchText('');
    };

    const getNodeName = (id: string) => {
        const node = existingNodes[id] || pendingShadowNodes.find(n => n.nodeId === id);
        return node?.name || 'Unknown';
    };

    return {
        fatherSearch,
        spouseSearch,
        childSearch,
        siblingSearchText,
        setSiblingSearchText,
        siblingSuggestions,
        handleFatherSelect,
        handleSpouseSelect,
        handleChildSelect,
        handleSiblingSelect,
        pendingShadowNodes,
        setPendingShadowNodes,
        createShadowNode,
        getNodeName
    };
};
