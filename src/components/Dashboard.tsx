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

export const Dashboard: React.FC<DashboardProps> = ({ tree, onClose }) => {
    const [isLoading, setIsLoading] = useState(true);
    const [data, setData] = useState<DashboardData | null>(null);

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


            // 3. Age Plot
            const exclusiveBuckets = [
                { name: '<5', value: 0 },
                { name: '5-22', value: 0 },
                { name: '22-35', value: 0 },
                { name: '35-60', value: 0 },
                { name: '60-70', value: 0 },
                { name: '70-80', value: 0 },
                { name: '80-90', value: 0 },
                { name: '>90', value: 0 },
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
                    if (age < 5) exclusiveBuckets[0].value++;
                    else if (age <= 22) exclusiveBuckets[1].value++;
                    else if (age <= 35) exclusiveBuckets[2].value++;
                    else if (age <= 60) exclusiveBuckets[3].value++;
                    else if (age <= 70) exclusiveBuckets[4].value++;
                    else if (age <= 80) exclusiveBuckets[5].value++;
                    else if (age <= 90) exclusiveBuckets[6].value++;
                    else exclusiveBuckets[7].value++;
                }
            });


            // 4. Occupation Chart
            const occCounts: Record<string, number> = {};
            nodes.forEach(node => {
                if (node.occupation?.role) {
                    occCounts[node.occupation.role] = (occCounts[node.occupation.role] || 0) + 1;
                }
            });
            const occupationData = Object.entries(occCounts)
                .map(([name, value]) => ({ name, value }))
                .sort((a, b) => b.value - a.value)
                .slice(0, 15);


            // 5. Hobbies Plot
            const hobCounts: Record<string, number> = {};
            nodes.forEach(node => {
                if (node.hobbies && Array.isArray(node.hobbies)) {
                    node.hobbies.forEach(hobby => {
                        hobCounts[hobby] = (hobCounts[hobby] || 0) + 1;
                    });
                }
            });
            const hobbiesData = Object.entries(hobCounts)
                .map(([name, value]) => ({ name, value }))
                .sort((a, b) => b.value - a.value)
                .slice(0, 15);


            // 6. Organization Wordcloud (Treemap as proxy)
            const orgCounts: Record<string, number> = {};
            nodes.forEach(node => {
                if (node.occupation?.organization) {
                    orgCounts[node.occupation.organization] = (orgCounts[node.occupation.organization] || 0) + 1;
                }
            });
            const orgData = Object.entries(orgCounts)
                .map(([name, value]) => ({ name, value }))
                .sort((a, b) => b.value - a.value)
                .slice(0, 20);


            // 7. Education Plot
            const eduCounts: Record<string, number> = {};
            nodes.forEach(node => {
                if (node.education && Array.isArray(node.education)) {
                    node.education.forEach(edu => {
                        if (edu.degree) {
                            eduCounts[edu.degree] = (eduCounts[edu.degree] || 0) + 1;
                        }
                    });
                }
            });
            const educationData = Object.entries(eduCounts)
                .map(([name, value]) => ({ name, value }))
                .sort((a, b) => b.value - a.value);


            // 8. Happy Plots - Births by Month
            const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
            const monthCounts = new Array(12).fill(0);

            nodes.forEach(node => {
                let month = null;
                if (node.dob) {
                    month = parseInt(node.dob.substring(5, 7)) - 1;
                } else if (node.dobApprox?.month) {
                    month = node.dobApprox.month - 1;
                }

                if (month !== null && month >= 0 && month < 12) {
                    monthCounts[month]++;
                }
            });
            const birthsByMonthData = months.map((name, index) => ({ name, value: monthCounts[index] }));

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
        <div className="dashboard-container" style={{ padding: '20px', height: '100%', overflowY: 'auto', background: '#f5f5f5' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', maxWidth: '800px', margin: '0 auto 20px auto' }}>
                <h1 style={{ margin: 0, color: '#333' }}>{tree.treeName || "Family"} Dashboard</h1>
                <button onClick={onClose} style={{ padding: '10px 20px', cursor: 'pointer', background: '#2196f3', color: 'white', border: 'none', borderRadius: '4px', fontWeight: 'bold' }}>Back to Tree</button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '20px', maxWidth: '800px', margin: '0 auto' }}>

                {/* 1. Member Growth */}
                <div className="chart-card" style={cardStyle}>
                    <h3>Cumulative Family Growth</h3>
                    <ResponsiveContainer width="100%" height={300}>
                        <LineChart data={data.memberGrowthData}>
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
                                dot={<CustomDot />}
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
                    <MapChart key={tree.timestamp} nodes={Object.values(tree.nodes)} />
                </div>

                {/* 3. Age Distribution */}
                <div className="chart-card" style={cardStyle}>
                    <h3>Age Distribution</h3>
                    <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={data.ageData}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="name" />
                            <YAxis allowDecimals={false} />
                            <Tooltip />
                            <Legend />
                            <Bar dataKey="value" fill="#82ca9d">
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
                            >
                                {data.occupationData.map((_, index) => (
                                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                ))}
                            </Pie>
                            <Tooltip />
                        </PieChart>
                    </ResponsiveContainer>
                </div>

                {/* 5. Hobbies */}
                <div className="chart-card" style={cardStyle}>
                    <h3>Top Hobbies</h3>
                    <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={data.hobbiesData}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="name" />
                            <YAxis allowDecimals={false} />
                            <Tooltip />
                            <Legend />
                            <Bar dataKey="value" fill="#FFBB28" />
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
                        />
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
                            >
                                {data.educationData.map((_, index) => (
                                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                ))}
                            </Pie>
                            <Tooltip />
                            <Legend />
                        </PieChart>
                    </ResponsiveContainer>
                </div>

                {/* 8. Happy Plot - Births by Month */}
                <div className="chart-card" style={cardStyle}>
                    <h3>Birthdays by Month</h3>
                    <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={data.birthsByMonthData}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="name" />
                            <YAxis allowDecimals={false} />
                            <Tooltip />
                            <Bar dataKey="value" fill="#FF8042" />
                        </BarChart>
                    </ResponsiveContainer>
                </div>

            </div>
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
    const { cx, cy, payload } = props;
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
                            style={{ clipPath: 'circle(50%)' }}
                        />
                    );
                }
                // Fallback to circle with initial
                return (
                    <g key={m.nodeId} transform={`translate(${xPos}, ${yPos})`}>
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
        return (
            <div style={{ background: 'white', padding: '10px', border: '1px solid #ccc', borderRadius: '4px' }}>
                <p><strong>Year: {label}</strong></p>
                <p>Total Members: {data.count}</p>
                <p>Births: {data.births.length}</p>
                <p>Deaths: {data.deaths}</p>
                {data.births.length > 0 && (
                    <div style={{ marginTop: '5px' }}>
                        <p style={{ fontSize: '0.9em', fontWeight: 'bold' }}>Born:</p>
                        <ul style={{ margin: 0, paddingLeft: '15px', fontSize: '0.8em', maxHeight: '100px', overflowY: 'auto' }}>
                            {data.births.map((m: PersonNode) => (
                                <li key={m.nodeId}>{m.name}</li>
                            ))}
                        </ul>
                    </div>
                )}
            </div>
        );
    }
    return null;
};
