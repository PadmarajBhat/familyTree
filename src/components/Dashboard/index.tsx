
import React, { useState, useEffect } from 'react';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
    PieChart, Pie, Cell, LineChart, Line, Treemap
} from 'recharts';
import type { TreeDocument, PersonNode } from '../../logic/types';
import { MapChart } from '../MapChart';
import { useDashboardData } from './hooks/useDashboardData';
import { CustomDot, CustomTooltip } from './components/CustomChartElements';
import { DrillDownModal } from './components/DrillDownModal';
import './Dashboard.css';

interface DashboardProps {
    tree: TreeDocument;
    onClose: () => void;
    onNodeClick: (nodeId: string) => void;
}

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d', '#ffc658', '#8dd1e1'];

export const Dashboard: React.FC<DashboardProps> = ({ tree, onClose, onNodeClick }) => {
    const { isLoading, data } = useDashboardData(tree);
    const [drillDownData, setDrillDownData] = useState<{ title: string; members: PersonNode[] } | null>(null);

    useEffect(() => { window.scrollTo(0, 0); }, []);

    const handleChartClick = (clickData: any) => {
        if (clickData && clickData.activePayload && clickData.activePayload.length > 0) {
            const payload = clickData.activePayload[0].payload;
            if (payload?.members?.length > 0) setDrillDownData({ title: payload.name || "Members", members: payload.members });
        } else if (clickData && clickData.members?.length > 0) {
            setDrillDownData({ title: clickData.name || "Members", members: clickData.members });
        }
    };

    if (isLoading || !data) {
        return (
            <div className="dashboard-container">
                <div className="dashboard-loading">
                    <h2>Loading Dashboard...</h2>
                    <div className="spinner"></div>
                    <p>Analyzing {Object.keys(tree.nodes).length} family members...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="dashboard-container">
            <div className="dashboard-header">
                <h1>{tree.treeName || "Family"} Dashboard</h1>
                <button onClick={onClose} className="dashboard-back-btn">Back to Tree</button>
            </div>

            <div className="dashboard-grid">
                <ChartSection title="Cumulative Family Growth" height={250}>
                    <LineChart data={data.memberGrowthData} onClick={handleChartClick}>
                        <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.3} />
                        <XAxis dataKey="year" stroke="currentColor" tick={{ fill: 'currentColor' }} />
                        <YAxis allowDecimals={false} stroke="currentColor" tick={{ fill: 'currentColor' }} />
                        <Tooltip content={<CustomTooltip />} />
                        <Legend />
                        <Line type="monotone" dataKey="count" name="Total Members" stroke="#8884d8" strokeWidth={3} dot={(p) => <CustomDot {...p} onNodeClick={onNodeClick} />} activeDot={{ r: 8 }} isAnimationActive={false} />
                    </LineChart>
                </ChartSection>

                <div className="chart-card">
                    <h3>Member Locations</h3>
                    <MapChart key={tree.timestamp} nodes={Object.values(tree.nodes)} onNodeClick={onNodeClick} />
                </div>

                <ChartSection title="Age Distribution" height={250}>
                    <BarChart data={data.ageData}>
                        <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.3} />
                        <XAxis dataKey="name" stroke="currentColor" tick={{ fill: 'currentColor', fontSize: 12 }} />
                        <YAxis allowDecimals={false} stroke="currentColor" tick={{ fill: 'currentColor' }} />
                        <Tooltip content={<CustomTooltip />} />
                        <Legend />
                        <Bar dataKey="value" fill="#82ca9d" style={{ cursor: 'pointer' }} onClick={handleChartClick}>
                            {data.ageData.map((_, i) => <Cell key={`c-${i}`} fill={COLORS[i % COLORS.length]} />)}
                        </Bar>
                    </BarChart>
                </ChartSection>

                <ChartSection title="Top Occupations" height={250}>
                    <PieChart>
                        <Pie data={data.occupationData} cx="50%" cy="50%" labelLine={false} label={({ name, percent }: any) => percent > 0.05 ? `${name}` : ''} outerRadius={80} fill="#8884d8" dataKey="value" onClick={handleChartClick} style={{ cursor: 'pointer' }}>
                            {data.occupationData.map((_, i) => <Cell key={`c-${i}`} fill={COLORS[i % COLORS.length]} />)}
                        </Pie>
                        <Tooltip content={<CustomTooltip />} />
                    </PieChart>
                </ChartSection>

                <ChartSection title="Top Hobbies" height={250}>
                    <BarChart data={data.hobbiesData} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.3} horizontal={true} vertical={false} />
                        <XAxis type="number" hide />
                        <YAxis dataKey="name" type="category" width={100} stroke="currentColor" tick={{ fill: 'currentColor', fontSize: 11 }} />
                        <Tooltip content={<CustomTooltip />} />
                        <Bar dataKey="value" fill="#FFBB28" style={{ cursor: 'pointer' }} onClick={handleChartClick} barSize={20} />
                    </BarChart>
                </ChartSection>

                <ChartSection title="Organizations" height={250}>
                    <Treemap data={data.orgData} dataKey="value" aspectRatio={4 / 3} stroke="#fff" fill="#8884d8" onClick={handleChartClick} style={{ cursor: 'pointer' }}>
                        <Tooltip content={<CustomTooltip />} />
                    </Treemap>
                </ChartSection>

                <ChartSection title="Education Levels" height={250}>
                    <PieChart>
                        <Pie data={data.educationData} cx="50%" cy="50%" innerRadius={40} outerRadius={80} fill="#82ca9d" paddingAngle={5} dataKey="value" onClick={handleChartClick} style={{ cursor: 'pointer' }}>
                            {data.educationData.map((_, i) => <Cell key={`c-${i}`} fill={COLORS[i % COLORS.length]} />)}
                        </Pie>
                        <Tooltip content={<CustomTooltip />} />
                        <Legend />
                    </PieChart>
                </ChartSection>

                <ChartSection title="Birthdays by Month" height={250}>
                    <BarChart data={data.birthsByMonthData}>
                        <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.3} />
                        <XAxis dataKey="name" stroke="currentColor" tick={{ fill: 'currentColor', fontSize: 10 }} />
                        <YAxis allowDecimals={false} stroke="currentColor" tick={{ fill: 'currentColor' }} />
                        <Tooltip content={<CustomTooltip />} />
                        <Bar dataKey="value" fill="#FF8042" style={{ cursor: 'pointer' }} onClick={handleChartClick} />
                    </BarChart>
                </ChartSection>
            </div>

            {drillDownData && <DrillDownModal title={drillDownData.title} members={drillDownData.members} onClose={() => setDrillDownData(null)} onNodeClick={onNodeClick} />}
        </div>
    );
};

const ChartSection: React.FC<{ title: string; height: number; children: React.ReactNode }> = ({ title, height, children }) => (
    <div className="chart-card">
        <h3>{title}</h3>
        <ResponsiveContainer width="100%" height={height}>
            {children as React.ReactElement}
        </ResponsiveContainer>
    </div>
);
