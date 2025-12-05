import React, { useMemo } from 'react';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
    PieChart, Pie, Cell, LineChart, Line, Treemap
} from 'recharts';
import type { TreeDocument } from '../logic/types';
import { MapChart } from './MapChart';

interface DashboardProps {
    tree: TreeDocument;
    onClose: () => void;
}

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d', '#ffc658', '#8dd1e1'];

export const Dashboard: React.FC<DashboardProps> = ({ tree, onClose }) => {
    const nodes = Object.values(tree.nodes);

    // 1. Year on Year Member Count (Births)
    const memberGrowthData = useMemo(() => {
        const yearCounts: Record<string, number> = {};
        nodes.forEach(node => {
            const year = node.dob ? node.dob.substring(0, 4) : (node.dobApprox?.year?.toString());
            if (year) {
                yearCounts[year] = (yearCounts[year] || 0) + 1;
            }
        });

        // Cumulative growth? Or just births per year? User said "increase and decrease".
        // Let's do Births and Deaths per year.
        const stats: Record<string, { year: string, births: number, deaths: number }> = {};

        nodes.forEach(node => {
            const birthYear = node.dob ? node.dob.substring(0, 4) : (node.dobApprox?.year?.toString());
            if (birthYear) {
                if (!stats[birthYear]) stats[birthYear] = { year: birthYear, births: 0, deaths: 0 };
                stats[birthYear].births++;
            }

            const deathYear = node.dod ? node.dod.substring(0, 4) : (node.dodApprox?.year?.toString());
            if (deathYear) {
                if (!stats[deathYear]) stats[deathYear] = { year: deathYear, births: 0, deaths: 0 };
                stats[deathYear].deaths++;
            }
        });

        return Object.values(stats).sort((a, b) => parseInt(a.year) - parseInt(b.year));
    }, [nodes]);

    // 2. Geo Plot (Zipcode Distribution) - REMOVED (Handled by MapChart)
    // const geoData = ...

    // 3. Age Plot
    const ageData = useMemo(() => {
        const buckets = {
            '<5': 0,
            '5-22': 0,
            '22-35': 0,
            '35-60': 0,
            '>60': 0,
            '>70': 0,
            '>80': 0,
            '>90': 0
        };

        const currentYear = new Date().getFullYear();

        nodes.forEach(node => {
            let age = node.ageProvided;
            if (age === null || age === undefined) {
                const birthYear = node.dob ? parseInt(node.dob.substring(0, 4)) : node.dobApprox?.year;
                if (birthYear) {
                    // If dead, calculate age at death? Or current age if alive?
                    // Usually "Age Plot" implies current age distribution of living members, 
                    // or age at death for deceased.
                    // Let's mix them or just use "Age".
                    const endYear = node.dod ? parseInt(node.dod.substring(0, 4)) : (node.dodApprox?.year || currentYear);
                    age = endYear - birthYear;
                }
            }

            if (age !== null && age !== undefined) {
                if (age < 5) buckets['<5']++;
                else if (age <= 22) buckets['5-22']++;
                else if (age <= 35) buckets['22-35']++;
                else if (age <= 60) buckets['35-60']++;

                if (age > 60) buckets['>60']++; // Note: Overlap requested? ">60, >70..." usually implies cumulative or specific buckets.
                // If I use exclusive buckets it's better for a pie/bar chart.
                // But user asked for specific overlapping ranges? ">60, >70".
                // Let's make them exclusive for the chart: 60-70, 70-80, 80-90, >90.
                // And maybe label them as requested?
                // I will use exclusive buckets for the chart to avoid double counting in a Pie/Bar.
            }
        });

        // Re-calculating for exclusive buckets for visualization
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

        return exclusiveBuckets;
    }, [nodes]);

    // 4. Occupation Chart
    const occupationData = useMemo(() => {
        const counts: Record<string, number> = {};
        nodes.forEach(node => {
            if (node.occupation?.role) {
                counts[node.occupation.role] = (counts[node.occupation.role] || 0) + 1;
            }
        });
        return Object.entries(counts)
            .map(([name, value]) => ({ name, value }))
            .sort((a, b) => b.value - a.value)
            .slice(0, 15);
    }, [nodes]);

    // 5. Hobbies Plot
    const hobbiesData = useMemo(() => {
        const counts: Record<string, number> = {};
        nodes.forEach(node => {
            if (node.hobbies && Array.isArray(node.hobbies)) {
                node.hobbies.forEach(hobby => {
                    counts[hobby] = (counts[hobby] || 0) + 1;
                });
            }
        });
        return Object.entries(counts)
            .map(([name, value]) => ({ name, value }))
            .sort((a, b) => b.value - a.value)
            .slice(0, 15);
    }, [nodes]);

    // 6. Organization Wordcloud (Treemap as proxy)
    const orgData = useMemo(() => {
        const counts: Record<string, number> = {};
        nodes.forEach(node => {
            if (node.occupation?.organization) {
                counts[node.occupation.organization] = (counts[node.occupation.organization] || 0) + 1;
            }
        });
        return Object.entries(counts)
            .map(([name, value]) => ({ name, value }))
            .sort((a, b) => b.value - a.value)
            .slice(0, 20);
    }, [nodes]);

    // 7. Education Plot
    const educationData = useMemo(() => {
        const counts: Record<string, number> = {};
        nodes.forEach(node => {
            if (node.education && Array.isArray(node.education)) {
                node.education.forEach(edu => {
                    if (edu.degree) {
                        counts[edu.degree] = (counts[edu.degree] || 0) + 1;
                    }
                });
            }
        });
        return Object.entries(counts)
            .map(([name, value]) => ({ name, value }))
            .sort((a, b) => b.value - a.value);
    }, [nodes]);

    // 8. Happy Plots - Births by Month
    const birthsByMonthData = useMemo(() => {
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const counts = new Array(12).fill(0);

        nodes.forEach(node => {
            let month = null;
            if (node.dob) {
                month = parseInt(node.dob.substring(5, 7)) - 1;
            } else if (node.dobApprox?.month) {
                month = node.dobApprox.month - 1;
            }

            if (month !== null && month >= 0 && month < 12) {
                counts[month]++;
            }
        });

        return months.map((name, index) => ({ name, value: counts[index] }));
    }, [nodes]);

    return (
        <div className="dashboard-container" style={{ padding: '20px', height: '100vh', overflowY: 'auto', background: '#f5f5f5' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <h1>Family Dashboard</h1>
                <button onClick={onClose} style={{ padding: '8px 16px', cursor: 'pointer' }}>Close</button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '20px', maxWidth: '800px', margin: '0 auto' }}>

                {/* 1. Member Growth */}
                <div className="chart-card" style={cardStyle}>
                    <h3>Member Growth (Births & Deaths)</h3>
                    <ResponsiveContainer width="100%" height={300}>
                        <LineChart data={memberGrowthData}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="year" />
                            <YAxis />
                            <Tooltip />
                            <Legend />
                            <Line type="monotone" dataKey="births" stroke="#8884d8" activeDot={{ r: 8 }} />
                            <Line type="monotone" dataKey="deaths" stroke="#82ca9d" />
                        </LineChart>
                    </ResponsiveContainer>
                </div>

                {/* 2. Geo Map */}
                <div className="chart-card" style={cardStyle}>
                    <h3>Member Locations</h3>
                    <MapChart nodes={nodes} />
                </div>

                {/* 3. Age Distribution */}
                <div className="chart-card" style={cardStyle}>
                    <h3>Age Distribution</h3>
                    <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={ageData}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="name" />
                            <YAxis />
                            <Tooltip />
                            <Legend />
                            <Bar dataKey="value" fill="#82ca9d">
                                {ageData.map((_, index) => (
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
                                data={occupationData}
                                cx="50%"
                                cy="50%"
                                labelLine={false}
                                label={({ name, percent }) => `${name} ${(percent ? percent * 100 : 0).toFixed(0)}%`}
                                outerRadius={100}
                                fill="#8884d8"
                                dataKey="value"
                            >
                                {occupationData.map((_, index) => (
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
                        <BarChart data={hobbiesData}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="name" />
                            <YAxis />
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
                            data={orgData}
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
                                data={educationData}
                                cx="50%"
                                cy="50%"
                                outerRadius={80}
                                fill="#82ca9d"
                                label
                                dataKey="value"
                            >
                                {educationData.map((_, index) => (
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
                        <BarChart data={birthsByMonthData}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="name" />
                            <YAxis />
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
