import type { TreeDocument, PersonNode } from '../../logic/types';

export interface FanChartViewProps {
    data: TreeDocument;
    rootNodeId: string;
    onNodeClick: (nodeId: string) => void;
    initialMode?: 'ancestor' | 'descendant' | 'hourglass';
    onResetRoot?: () => void;
}

export interface AncestorNode extends PersonNode {
    children?: AncestorNode[];
    generation: number;
    _children?: AncestorNode[];
    spouseName?: string | null;
    spouseImageUrl?: string | null;
}
