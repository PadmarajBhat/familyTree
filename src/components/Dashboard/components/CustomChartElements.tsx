

import type { PersonNode } from '../../../logic/types';
import { getPhotoUrl } from '../../../services/drive';

export const CustomDot = (props: any) => {
    const { cx, cy, payload, onNodeClick } = props;
    if (!payload.births || payload.births.length === 0) {
        return <circle cx={cx} cy={cy} r={4} stroke="#8884d8" strokeWidth={2} fill="#fff" />;
    }
    const membersToShow = payload.births.slice(0, 3);
    const size = 24;
    return (
        <g>
            <circle cx={cx} cy={cy} r={4} stroke="#8884d8" strokeWidth={2} fill="#fff" />
            {membersToShow.map((m: PersonNode, i: number) => {
                const yPos = cy - size - 5 - (i * 15);
                const xPos = cx - (size / 2);
                const imgUrl = getPhotoUrl(m.imageUrl);
                if (imgUrl) {
                    return (
                        <image key={m.nodeId} x={xPos} y={yPos} width={size} height={size} href={imgUrl}
                            style={{ clipPath: 'circle(50%)', cursor: 'pointer' }}
                            onClick={() => onNodeClick && onNodeClick(m.nodeId)}
                        />
                    );
                }
                return (
                    <g key={m.nodeId} transform={`translate(${xPos}, ${yPos})`} style={{ cursor: 'pointer' }}
                        onClick={() => onNodeClick && onNodeClick(m.nodeId)}>
                        <circle cx={size / 2} cy={size / 2} r={size / 2} fill="#2196f3" stroke="white" strokeWidth="1" />
                        <text x={size / 2} y={size / 2} dy=".3em" textAnchor="middle" fill="white" fontSize="10">{m.name?.charAt(0)}</text>
                    </g>
                );
            })}
        </g>
    );
};

export const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
        const data = payload[0].payload;
        const members: PersonNode[] = data.births || data.members || [];
        const deaths = data.deaths;
        return (
            <div className="custom-tooltip">
                <p><strong>{label ? `${label}` : data.name}</strong></p>
                {data.year && <p>Year: {data.year}</p>}
                <p>Value: {data.value || data.count}</p>
                {deaths !== undefined && <p>Deaths: {deaths}</p>}
                {members.length > 0 && (
                    <div className="tooltip-members">
                        <p>Members ({members.length}):</p>
                        <ul>
                            {members.map((m: PersonNode) => (
                                <li key={m.nodeId}><span>{m.name}</span></li>
                            ))}
                        </ul>
                    </div>
                )}
            </div>
        );
    }
    return null;
};
