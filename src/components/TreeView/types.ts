import * as d3 from 'd3';
import type { TreeDocument, PersonNode } from '../../logic/types';

export interface TreeViewProps {
    data: TreeDocument;
    onNodeClick: (nodeId: string) => void;
    onNodeLongPress: (nodeId: string) => void;
    maxDepth?: number | null;
    isExporting?: boolean;
    compact?: boolean;
    path?: string[] | null;
    showControls?: boolean;
}

export interface HierarchyPersonNode extends PersonNode {
    children?: HierarchyPersonNode[];
    childrenCount?: number;
}

export interface ExtendedHierarchyNode extends d3.HierarchyNode<HierarchyPersonNode> {
    _children?: ExtendedHierarchyNode[] | null | undefined;
    x0?: number;
    y0?: number;
}
