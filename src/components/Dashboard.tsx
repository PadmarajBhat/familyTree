import React, { useState, useEffect } from 'react';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
    PieChart, Pie, Cell, LineChart, Line, Treemap
} from 'recharts';
import type { TreeDocument, PersonNode } from '../logic/types';
import { MapChart } from './MapChart';
import { getPhotoUrl } from '../services/drive';

interface DashboardProps {
    tree: TreeDocument;
    onClose: () => void;
    onNodeClick: (nodeId: string) => void;
}

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d', '#ffc658', '#8dd1e1'];

interface DashboardData {
    memberGrowthData: any[];
    ageData: any[];
    occupationData: any[];
    hobbiesData: any[];
    orgData: any[];
    educationData: any[];
    birthsByMonthData: any[];
}

export const Dashboard: React.FC<DashboardProps> = ({ tree, onClose, onNodeClick }) => {
    const [isLoading, setIsLoading] = useState(true);
    const [data, setData] = useState<DashboardData | null>(null);
    const [drillDownData, setDrillDownData] = useState<{ title: string; members: PersonNode[] } | null>(null);

    React.useEffect(() => {
        window.scrollTo(0, 0);
    }, []);

    useEffect(() => {
        setIsLoading(true);
        // Use setTimeout to allow the UI to render the loading state before blocking with calculations
        const timer = setTimeout(() => {
            const nodes = Object.values(tree.nodes);
            const currentYear = new Date().getFullYear();

            // 1. Year on Year Member Count (Cumulative)
            const stats: Record<string, { year: number, births: PersonNode[], deaths: number }> = {};
            let minYear = currentYear;
            let maxYear = currentYear;

            nodes.forEach(node => {
                const birthYearStr = node.dob ? node.dob.substring(0, 4) : (node.dobApprox?.year?.toString());
                if (birthYearStr) {
                    const year = parseInt(birthYearStr);
                    if (year < minYear) minYear = year;
                    if (year > maxYear) maxYear = year; // Find range

                    if (!stats[year]) stats[year] = { year, births: [], deaths: 0 };
                    stats[year].births.push(node);
                }

                const deathYearStr = node.dod ? node.dod.substring(0, 4) : (node.dodApprox?.year?.toString());
                if (deathYearStr) {
                    const year = parseInt(deathYearStr);
                    // Death year tracking also updates maxYear potentially?
                    // Usually we track population up to current day.
                    if (!stats[year]) stats[year] = { year, births: [], deaths: 0 };
                    stats[year].deaths++;
                }
            });

            const memberGrowthData = [];
            let currentPop = 0;
            // Iterate from minYear to currentYear (or maxYear if > current?)
            // Usually up to current year.
            const endYear = Math.max(maxYear, currentYear);

            for (let y = minYear; y <= endYear; y++) {
                const yearData = stats[y] || { year: y, births: [], deaths: 0 };
                currentPop += (yearData.births.length - yearData.deaths);
                memberGrowthData.push({
                    year: y.toString(),
                    count: currentPop,
                    births: yearData.births, // Array of nodes
                    deaths: yearData.deaths
                });
            }


            // 3. Age Plot (with members)
            const exclusiveBuckets: { name: string, value: number, members: PersonNode[] }[] = [
                { name: '<5', value: 0, members: [] },
                { name: '5-22', value: 0, members: [] },
                { name: '22-35', value: 0, members: [] },
                { name: '35-60', value: 0, members: [] },
                { name: '60-70', value: 0, members: [] },
                { name: '70-80', value: 0, members: [] },
                { name: '80-90', value: 0, members: [] },
                { name: '>90', value: 0, members: [] },
            ];

            nodes.forEach(node => {
                let age = node.ageProvided;
                if (age === null || age === undefined) {
                    const birthYear = node.dob ? parseInt(node.dob.substring(0, 4)) : node.dobApprox?.year;
                    if (birthYear) {
                        const endYear = node.dod ? parseInt(node.dod.substring(0, 4)) : (node.dodApprox?.year || currentYear);
                        age = endYear - birthYear;
                    }
                }

                if (age !== null && age !== undefined) {
                    if (age < 5) { exclusiveBuckets[0].value++; exclusiveBuckets[0].members.push(node); }
                    else if (age <= 22) { exclusiveBuckets[1].value++; exclusiveBuckets[1].members.push(node); }
                    else if (age <= 35) { exclusiveBuckets[2].value++; exclusiveBuckets[2].members.push(node); }
                    else if (age <= 60) { exclusiveBuckets[3].value++; exclusiveBuckets[3].members.push(node); }
                    else if (age <= 70) { exclusiveBuckets[4].value++; exclusiveBuckets[4].members.push(node); }
                    else if (age <= 80) { exclusiveBuckets[5].value++; exclusiveBuckets[5].members.push(node); }
                    else if (age <= 90) { exclusiveBuckets[6].value++; exclusiveBuckets[6].members.push(node); }
                    else { exclusiveBuckets[7].value++; exclusiveBuckets[7].members.push(node); }
                }
            });


            // 4. Occupation Chart
            const occCounts: Record<string, { value: number, members: PersonNode[] }> = {};
            nodes.forEach(node => {
                if (node.occupation?.role) {
                    if (!occCounts[node.occupation.role]) occCounts[node.occupation.role] = { value: 0, members: [] };
                    occCounts[node.occupation.role].value++;
                    occCounts[node.occupation.role].members.push(node);
                }
            });
            const occupationData = Object.entries(occCounts)
                .map(([name, data]) => ({ name, value: data.value, members: data.members }))
                .sort((a, b) => b.value - a.value)
                .slice(0, 15);


            // 5. Hobbies Plot
            const hobCounts: Record<string, { value: number, members: PersonNode[] }> = {};
            nodes.forEach(node => {
                if (node.hobbies && Array.isArray(node.hobbies)) {
                    node.hobbies.forEach(hobby => {
                        if (!hobCounts[hobby]) hobCounts[hobby] = { value: 0, members: [] };
                        hobCounts[hobby].value++;
                        hobCounts[hobby].members.push(node);
                    });
                }
            });
            const hobbiesData = Object.entries(hobCounts)
                .map(([name, data]) => ({ name, value: data.value, members: data.members }))
                .sort((a, b) => b.value - a.value)
                .slice(0, 15);


            // 6. Organization Wordcloud (Treemap as proxy)
            const orgCounts: Record<string, { value: number, members: PersonNode[] }> = {};
            nodes.forEach(node => {
                if (node.occupation?.organization) {
                    if (!orgCounts[node.occupation.organization]) orgCounts[node.occupation.organization] = { value: 0, members: [] };
                    orgCounts[node.occupation.organization].value++;
                    orgCounts[node.occupation.organization].members.push(node);
                }
            });
            const orgData = Object.entries(orgCounts)
                .map(([name, data]) => ({ name, value: data.value, members: data.members }))
                .sort((a, b) => b.value - a.value)
                .slice(0, 20);


            // 7. Education Plot
            const eduCounts: Record<string, { value: number, members: PersonNode[] }> = {};
            nodes.forEach(node => {
                if (node.education && Array.isArray(node.education)) {
                    node.education.forEach(edu => {
                        if (edu.degree) {
                            if (!eduCounts[edu.degree]) eduCounts[edu.degree] = { value: 0, members: [] };
                            eduCounts[edu.degree].value++;
                            eduCounts[edu.degree].members.push(node);
                        }
                    });
                }
            });
            const educationData = Object.entries(eduCounts)
                .map(([name, data]) => ({ name, value: data.value, members: data.members }))
                .sort((a, b) => b.value - a.value);


            // 8. Happy Plots - Births by Month
            const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
            const monthCounts: { value: number, members: PersonNode[] }[] = new Array(12).fill(null).map(() => ({ value: 0, members: [] }));

            nodes.forEach(node => {
                let month = null;
                if (node.dob) {
                    month = parseInt(node.dob.substring(5, 7)) - 1;
                } else if (node.dobApprox?.month) {
                    month = node.dobApprox.month - 1;
                }

                if (month !== null && month >= 0 && month < 12) {
                    monthCounts[month].value++;
                    monthCounts[month].members.push(node);
                }
            });
            const birthsByMonthData = months.map((name, index) => ({ name, value: monthCounts[index].value, members: monthCounts[index].members }));

            setData({
                memberGrowthData,
                ageData: exclusiveBuckets,
                occupationData,
                hobbiesData,
                orgData,
                educationData,
                birthsByMonthData
            });
            setIsLoading(false);

        }, 100);

        return () => clearTimeout(timer);
    }, [tree]);

    const handleChartClick = (data: any) => {
        if (data && data.activePayload && data.activePayload.length > 0) {
            // For Bar/Line charts where click comes from wrapper
            const payload = data.activePayload[0].payload;
            if (payload && payload.members && payload.members.length > 0) {
                setDrillDownData({ title: payload.name || "Members", members: payload.members });
            }
        } else if (data && data.members && data.members.length > 0) {
            // For direct clicks on Pie/Treemap segments
            setDrillDownData({ title: data.name || "Members", members: data.members });
        }
    };

    const closeDrillDown = () => setDrillDownData(null);

    if (isLoading || !data) {
        return (
            <div className="dashboard-container" style={{
                padding: '20px', height: '100%', display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center', background: '#f5f5f5'
            }}>
                <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#666' }}>Loading Dashboard...</div>
                <div style={{ marginTop: '10px' }}>Analyzing {Object.keys(tree.nodes).length} family members...</div>
            </div>
        );
    }

    return (
        <div className="dashboard-container" style={{ padding: '20px', height: '100%', overflowY: 'auto', background: '#f5f5f5', position: 'relative' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', maxWidth: '800px', margin: '0 auto 20px auto' }}>
                <h1 style={{ margin: 0, color: '#333' }}>{tree.treeName || "Family"} Dashboard</h1>
                <button onClick={onClose} style={{ padding: '10px 20px', cursor: 'pointer', background: '#2196f3', color: 'white', border: 'none', borderRadius: '4px', fontWeight: 'bold' }}>Back to Tree</button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '20px', maxWidth: '800px', margin: '0 auto' }}>

                {/* 1. Member Growth */}
                <div className="chart-card" style={cardStyle}>
                    <h3>Cumulative Family Growth</h3>
                    <ResponsiveContainer width="100%" height={300}>
                        <LineChart data={data.memberGrowthData} onClick={handleChartClick}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="year" />
                            <YAxis allowDecimals={false} />
                            <Tooltip content={<CustomTooltip />} />
                            <Legend />
                            <Line
                                type="monotone"
                                dataKey="count"
                                name="Total Members"
                                stroke="#8884d8"
                                dot={(props) => <CustomDot {...props} onNodeClick={onNodeClick} />}
                                activeDot={{ r: 8 }}
                                isAnimationActive={false}
                            />
                        </LineChart>
                    </ResponsiveContainer>
                </div>

                {/* 2. Geo Map */}
                <div className="chart-card" style={cardStyle}>
                    <h3>Member Locations</h3>
                    {/* Force remount when tree updates to clear potential stale state */}
                    <MapChart key={tree.timestamp} nodes={Object.values(tree.nodes)} onNodeClick={onNodeClick} />
                </div>

                {/* 3. Age Distribution */}
                <div className="chart-card" style={cardStyle}>
                    <h3>Age Distribution</h3>
                    <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={data.ageData} onClick={handleChartClick}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="name" />
                            <YAxis allowDecimals={false} />
                            <Tooltip content={<CustomTooltip />} />
                            <Legend />
                            <Bar dataKey="value" fill="#82ca9d" style={{ cursor: 'pointer' }}>
                                {data.ageData.map((_, index) => (
                                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                ))}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                </div>

                {/* 4. Occupations */}
                <div className="chart-card" style={cardStyle}>
                    <h3>Top Occupations</h3>
                    <ResponsiveContainer width="100%" height={300}>
                        <PieChart>
                            <Pie
                                data={data.occupationData}
                                cx="50%"
                                cy="50%"
                                labelLine={false}
                                label={({ name, percent }) => `${name} ${(percent ? percent * 100 : 0).toFixed(0)}%`}
                                outerRadius={100}
                                fill="#8884d8"
                                dataKey="value"
                                onClick={handleChartClick}
                                style={{ cursor: 'pointer' }}
                            >
                                {data.occupationData.map((_, index) => (
                                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                ))}
                            </Pie>
                            <Tooltip content={<CustomTooltip />} />
                        </PieChart>
                    </ResponsiveContainer>
                </div>

                {/* 5. Hobbies */}
                <div className="chart-card" style={cardStyle}>
                    <h3>Top Hobbies</h3>
                    <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={data.hobbiesData} onClick={handleChartClick}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="name" />
                            <YAxis allowDecimals={false} />
                            <Tooltip content={<CustomTooltip />} />
                            <Legend />
                            <Bar dataKey="value" fill="#FFBB28" style={{ cursor: 'pointer' }} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>

                {/* 6. Organizations (Treemap) */}
                <div className="chart-card" style={cardStyle}>
                    <h3>Organizations (Wordcloud Proxy)</h3>
                    <ResponsiveContainer width="100%" height={300}>
                        <Treemap
                            data={data.orgData}
                            dataKey="value"
                            aspectRatio={4 / 3}
                            stroke="#fff"
                            fill="#8884d8"
                            onClick={handleChartClick}
                            style={{ cursor: 'pointer' }}
                        >
                            <Tooltip content={<CustomTooltip />} />
                        </Treemap>
                    </ResponsiveContainer>
                </div>

                {/* 7. Education */}
                <div className="chart-card" style={cardStyle}>
                    <h3>Education Levels</h3>
                    <ResponsiveContainer width="100%" height={300}>
                        <PieChart>
                            <Pie
                                data={data.educationData}
                                cx="50%"
                                cy="50%"
                                outerRadius={80}
                                fill="#82ca9d"
                                label
                                dataKey="value"
                                onClick={handleChartClick}
                                style={{ cursor: 'pointer' }}
                            >
                                {data.educationData.map((_, index) => (
                                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                ))}
                            </Pie>
                            <Tooltip content={<CustomTooltip />} />
                            <Legend />
                        </PieChart>
                    </ResponsiveContainer>
                </div>

                {/* 8. Happy Plot - Births by Month */}
                <div className="chart-card" style={cardStyle}>
                    <h3>Birthdays by Month</h3>
                    <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={data.birthsByMonthData} onClick={handleChartClick}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="name" />
                            <YAxis allowDecimals={false} />
                            <Tooltip content={<CustomTooltip />} />
                            <Bar dataKey="value" fill="#FF8042" style={{ cursor: 'pointer' }} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>

            </div>

            {drillDownData && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(0,0,0,0.5)', zIndex: 2000,
                    display: 'flex', justifyContent: 'center', alignItems: 'center'
                }} onClick={closeDrillDown}>
                    <div style={{
                        background: 'white', padding: '20px', borderRadius: '8px',
                        width: '90%', maxWidth: '400px', maxHeight: '80vh',
                        display: 'flex', flexDirection: 'column',
                        overflow: 'hidden'
                    }} onClick={e => e.stopPropagation()}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                            <h3 style={{ margin: 0 }}>{drillDownData.title} Members</h3>
                            <button onClick={closeDrillDown} style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer' }}>×</button>
                        </div>
                        <div style={{ overflowY: 'auto', flex: 1 }}>
                            {drillDownData.members.map(member => (
                                <div
                                    key={member.nodeId}
                                    style={{
                                        padding: '10px', borderBottom: '1px solid #eee', cursor: 'pointer',
                                        display: 'flex', alignItems: 'center', gap: '10px'
                                    }}
                                    onClick={() => {
                                        onNodeClick(member.nodeId);
                                        closeDrillDown();
                                    }}
                                    onMouseOver={(e) => e.currentTarget.style.background = '#f5f5f5'}
                                    onMouseOut={(e) => e.currentTarget.style.background = 'white'}
                                >
                                    {member.imageUrl ? (
                                        <img src={getPhotoUrl(member.imageUrl) || ""} alt="" style={{ width: '40px', height: '40px', borderRadius: '50%', objectFit: 'cover' }} />
                                    ) : (
                                        <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: '#ccc', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white' }}>
                                            {member.name?.charAt(0)}
                                        </div>
                                    )}
                                    <div style={{ fontWeight: '500' }}>{member.name}</div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

const cardStyle = {
    background: 'white',
    borderRadius: '8px',
    padding: '20px',
    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
    color: '#333',
    border: '1px solid #eee'
};

// Custom Dot to render image of person born that year
const CustomDot = (props: any) => {
    const { cx, cy, payload, onNodeClick } = props;
    if (!payload.births || payload.births.length === 0) {
        return <circle cx={cx} cy={cy} r={4} stroke="#8884d8" strokeWidth={2} fill="#fff" />;
    }

    // Sort births by something? Or just take first.
    // Limit to 3 images to avoid crowding
    const membersToShow = payload.births.slice(0, 3);
    const size = 24;

    return (
        <g>
            <circle cx={cx} cy={cy} r={4} stroke="#8884d8" strokeWidth={2} fill="#fff" />
            {membersToShow.map((m: PersonNode, i: number) => {
                // Let's stack vertically upwards
                const yPos = cy - size - 5 - (i * 15);
                const xPos = cx - (size / 2);

                const imgUrl = getPhotoUrl(m.imageUrl);

                if (imgUrl) {
                    return (
                        <image
                            key={m.nodeId}
                            x={xPos}
                            y={yPos}
                            width={size}
                            height={size}
                            href={imgUrl}
                            style={{ clipPath: 'circle(50%)', cursor: 'pointer' }}
                            onClick={() => onNodeClick && onNodeClick(m.nodeId)}
                        />
                    );
                }
                // Fallback to circle with initial
                return (
                    <g
                        key={m.nodeId}
                        transform={`translate(${xPos}, ${yPos})`}
                        style={{ cursor: 'pointer' }}
                        onClick={() => onNodeClick && onNodeClick(m.nodeId)}
                    >
                        <circle cx={size / 2} cy={size / 2} r={size / 2} fill="#2196f3" stroke="white" strokeWidth="1" />
                        <text x={size / 2} y={size / 2} dy=".3em" textAnchor="middle" fill="white" fontSize="10">{m.name?.charAt(0)}</text>
                    </g>
                );
            })}
        </g>
    );
};

const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
        const data = payload[0].payload;
        // Handle explicit births array (growth chart) or generic members array
        const members: PersonNode[] = data.births || data.members || [];
        const deaths = data.deaths; // Only for growth chart

        return (
            <div style={{ background: 'white', padding: '10px', border: '1px solid #ccc', borderRadius: '4px', maxWidth: '250px', zIndex: 1000 }}>
                <p><strong>{label ? `Label: ${label}` : data.name}</strong></p>
                {data.year && <p>Year: {data.year}</p>}
                <p>Value: {data.value || data.count}</p>
                {deaths !== undefined && <p>Deaths: {deaths}</p>}

                {members.length > 0 && (
                    <div style={{ marginTop: '5px' }}>
                        <p style={{ fontSize: '0.9em', fontWeight: 'bold' }}>Members ({members.length}):</p>
                        <ul style={{ margin: 0, paddingLeft: '15px', fontSize: '0.8em', maxHeight: '150px', overflowY: 'auto' }}>
                            {members.map((m: PersonNode) => (
                                <li key={m.nodeId} style={{ marginBottom: '4px' }}>
                                    <span style={{ fontWeight: '500' }}>{m.name}</span>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}
            </div>
        );
    }
    return null;
};
