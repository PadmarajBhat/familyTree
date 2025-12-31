
import { useState, useEffect } from 'react';
import type { TreeDocument, PersonNode } from '../../../logic/types';

export interface DashboardData {
    memberGrowthData: any[];
    ageData: any[];
    occupationData: any[];
    hobbiesData: any[];
    orgData: any[];
    educationData: any[];
    birthsByMonthData: any[];
}

export function useDashboardData(tree: TreeDocument) {
    const [isLoading, setIsLoading] = useState(true);
    const [data, setData] = useState<DashboardData | null>(null);

    useEffect(() => {
        setIsLoading(true);
        const timer = setTimeout(() => {
            const nodes = Object.values(tree.nodes);
            const currentYear = new Date().getFullYear();

            // 1. Year on Year Member Count
            const stats: Record<string, { year: number, births: PersonNode[], deaths: number }> = {};
            let minYear = currentYear;
            let maxYear = currentYear;

            nodes.forEach(node => {
                const birthYearStr = node.dob ? node.dob.substring(0, 4) : (node.dobApprox?.year?.toString());
                if (birthYearStr) {
                    const year = parseInt(birthYearStr);
                    if (year < minYear) minYear = year;
                    if (year > maxYear) maxYear = year;
                    if (!stats[year]) stats[year] = { year, births: [], deaths: 0 };
                    stats[year].births.push(node);
                }
                const deathYearStr = node.dod ? node.dod.substring(0, 4) : (node.dodApprox?.year?.toString());
                if (deathYearStr) {
                    const year = parseInt(deathYearStr);
                    if (!stats[year]) stats[year] = { year, births: [], deaths: 0 };
                    stats[year].deaths++;
                }
            });

            const memberGrowthData = [];
            let currentPop = 0;
            const endYear = Math.max(maxYear, currentYear);
            for (let y = minYear; y <= endYear; y++) {
                const yearData = stats[y] || { year: y, births: [], deaths: 0 };
                currentPop += (yearData.births.length - yearData.deaths);
                memberGrowthData.push({ year: y.toString(), count: currentPop, births: yearData.births, deaths: yearData.deaths });
            }

            // 3. Age Plot
            const exclusiveBuckets = [
                { name: '<5', value: 0, members: [] as PersonNode[] },
                { name: '5-22', value: 0, members: [] as PersonNode[] },
                { name: '22-35', value: 0, members: [] as PersonNode[] },
                { name: '35-60', value: 0, members: [] as PersonNode[] },
                { name: '60-70', value: 0, members: [] as PersonNode[] },
                { name: '70-80', value: 0, members: [] as PersonNode[] },
                { name: '80-90', value: 0, members: [] as PersonNode[] },
                { name: '>90', value: 0, members: [] as PersonNode[] },
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

            // 4. Occupation
            const occCounts: Record<string, { value: number, members: PersonNode[] }> = {};
            nodes.forEach(node => {
                if (node.occupation?.role) {
                    if (!occCounts[node.occupation.role]) occCounts[node.occupation.role] = { value: 0, members: [] };
                    occCounts[node.occupation.role].value++;
                    occCounts[node.occupation.role].members.push(node);
                }
            });
            const occupationData = Object.entries(occCounts).map(([name, d]) => ({ name, value: d.value, members: d.members })).sort((a, b) => b.value - a.value).slice(0, 15);

            // 5. Hobbies
            const hobCounts: Record<string, { value: number, members: PersonNode[] }> = {};
            nodes.forEach(node => {
                if (node.hobbies && Array.isArray(node.hobbies)) {
                    node.hobbies.forEach(h => {
                        if (!hobCounts[h]) hobCounts[h] = { value: 0, members: [] };
                        hobCounts[h].value++;
                        hobCounts[h].members.push(node);
                    });
                }
            });
            const hobbiesData = Object.entries(hobCounts).map(([name, d]) => ({ name, value: d.value, members: d.members })).sort((a, b) => b.value - a.value).slice(0, 15);

            // 6. Org
            const orgCounts: Record<string, { value: number, members: PersonNode[] }> = {};
            nodes.forEach(node => {
                if (node.occupation?.organization) {
                    if (!orgCounts[node.occupation.organization]) orgCounts[node.occupation.organization] = { value: 0, members: [] };
                    orgCounts[node.occupation.organization].value++;
                    orgCounts[node.occupation.organization].members.push(node);
                }
            });
            const orgData = Object.entries(orgCounts).map(([name, d]) => ({ name, value: d.value, members: d.members })).sort((a, b) => b.value - a.value).slice(0, 20);

            // 7. Education
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
            const educationData = Object.entries(eduCounts).map(([name, d]) => ({ name, value: d.value, members: d.members })).sort((a, b) => b.value - a.value);

            // 8. Births by Month
            const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
            const monthCounts = new Array(12).fill(null).map(() => ({ value: 0, members: [] as PersonNode[] }));
            nodes.forEach(node => {
                let m = (node.dob ? parseInt(node.dob.substring(5, 7)) - 1 : (node.dobApprox?.month ? node.dobApprox.month - 1 : null));
                if (m !== null && m >= 0 && m < 12) {
                    monthCounts[m].value++;
                    monthCounts[m].members.push(node);
                }
            });
            const birthsByMonthData = months.map((name, i) => ({ name, value: monthCounts[i].value, members: monthCounts[i].members }));

            setData({ memberGrowthData, ageData: exclusiveBuckets, occupationData, hobbiesData, orgData, educationData, birthsByMonthData });
            setIsLoading(false);
        }, 100);

        return () => clearTimeout(timer);
    }, [tree]);

    return { isLoading, data };
}
