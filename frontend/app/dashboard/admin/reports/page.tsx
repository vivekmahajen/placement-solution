'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import DashboardLayout from '@/components/layout/DashboardLayout';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { useAuth } from '@/lib/hooks';
import { post } from '@/lib/api';
import { BarChart3, Download } from 'lucide-react';

type ReportTab =
  | 'placements_by_zip'
  | 'placements_by_city'
  | 'placements_by_agent'
  | 'placements_by_referral_agent'
  | 'queue_performance'
  | 'lock_failure_rate'
  | 'revenue_subscriptions';

interface ReportConfig {
  id: ReportTab;
  label: string;
  endpoint: string;
  description: string;
}

const REPORTS: ReportConfig[] = [
  {
    id: 'placements_by_zip',
    label: 'Placements by ZIP',
    endpoint: '/admin/reports/placements-by-zip',
    description: 'Placement counts grouped by ZIP code.',
  },
  {
    id: 'placements_by_city',
    label: 'Placements by City',
    endpoint: '/admin/reports/placements-by-city',
    description: 'Placement counts grouped by city.',
  },
  {
    id: 'placements_by_agent',
    label: 'Placements by Agent',
    endpoint: '/admin/reports/placements-by-agent',
    description: 'Placement counts per placement agent.',
  },
  {
    id: 'placements_by_referral_agent',
    label: 'Placements by Referral Agent',
    endpoint: '/admin/reports/placements-by-referral-agent',
    description: 'Placement counts per referral agent.',
  },
  {
    id: 'queue_performance',
    label: 'Queue Performance',
    endpoint: '/admin/reports/queue-performance',
    description: 'Average time in queue, lock rate, and placement rate.',
  },
  {
    id: 'lock_failure_rate',
    label: 'Lock Failure Rate',
    endpoint: '/admin/reports/lock-failure-rate',
    description: 'Rate of locks that expire without placement.',
  },
  {
    id: 'revenue_subscriptions',
    label: 'Revenue & Subscriptions',
    endpoint: '/admin/reports/revenue',
    description: 'MRR, trial conversions, and subscription trends.',
  },
];

function exportToCSV(data: Record<string, unknown>[], filename: string) {
  if (!data || data.length === 0) return;
  const headers = Object.keys(data[0]);
  const rows = data.map((row) =>
    headers.map((h) => {
      const val = row[h];
      const str = val === null || val === undefined ? '' : String(val);
      return str.includes(',') || str.includes('"') ? `"${str.replace(/"/g, '""')}"` : str;
    }).join(',')
  );
  const csv = [headers.join(','), ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `${filename}.csv`);
  link.click();
  URL.revokeObjectURL(url);
}

export default function AdminReportsPage() {
  useAuth();

  const [activeTab, setActiveTab] = useState<ReportTab>('placements_by_zip');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [results, setResults] = useState<Record<string, unknown>[] | null>(null);

  const activeReport = REPORTS.find((r) => r.id === activeTab)!;

  const runMutation = useMutation({
    mutationFn: () =>
      post<Record<string, unknown>[]>(activeReport.endpoint, {
        start_date: startDate || undefined,
        end_date: endDate || undefined,
      }),
    onSuccess: (data) => {
      setResults(data);
    },
    onError: () => {
      setResults([]);
    },
  });

  function handleTabChange(tab: ReportTab) {
    setActiveTab(tab);
    setResults(null);
  }

  const columns = results && results.length > 0 ? Object.keys(results[0]) : [];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Reports</h1>
          <p className="text-slate-500 mt-1">Generate and export platform analytics</p>
        </div>

        {/* Date range */}
        <Card title="Date Range">
          <div className="flex gap-4 items-end">
            <Input
              label="Start Date"
              type="date"
              id="start-date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
            <Input
              label="End Date"
              type="date"
              id="end-date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
            <p className="text-xs text-slate-500 pb-2">Leave blank for all-time data</p>
          </div>
        </Card>

        {/* Report tabs */}
        <div>
          <div className="flex flex-wrap gap-1 border-b border-slate-200 mb-6">
            {REPORTS.map((report) => (
              <button
                key={report.id}
                onClick={() => handleTabChange(report.id)}
                className={`px-3 py-2.5 text-xs font-medium border-b-2 transition-colors ${
                  activeTab === report.id
                    ? 'border-blue-600 text-blue-700'
                    : 'border-transparent text-slate-500 hover:text-slate-700'
                }`}
              >
                {report.label}
              </button>
            ))}
          </div>

          <Card
            title={activeReport.label}
            description={activeReport.description}
            headerAction={
              <div className="flex gap-2">
                {results && results.length > 0 && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => exportToCSV(results, activeReport.id)}
                  >
                    <Download className="w-3.5 h-3.5" />
                    Export CSV
                  </Button>
                )}
                <Button
                  variant="primary"
                  size="sm"
                  loading={runMutation.isPending}
                  onClick={() => runMutation.mutate()}
                >
                  Run Report
                </Button>
              </div>
            }
          >
            {results === null ? (
              <div className="py-12 text-center text-slate-400">
                <BarChart3 className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p className="text-sm">Click &quot;Run Report&quot; to generate this report.</p>
              </div>
            ) : results.length === 0 ? (
              <div className="py-8 text-center text-slate-400 text-sm">
                No data found for the selected date range.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      {columns.map((col) => (
                        <th
                          key={col}
                          className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider"
                        >
                          {col.replace(/_/g, ' ')}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {results.map((row, i) => (
                      <tr key={i} className="hover:bg-slate-50">
                        {columns.map((col) => (
                          <td key={col} className="px-4 py-3 text-slate-700">
                            {row[col] === null || row[col] === undefined
                              ? '—'
                              : String(row[col])}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="mt-3 text-xs text-slate-400 text-right">
                  {results.length} rows
                </div>
              </div>
            )}
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
