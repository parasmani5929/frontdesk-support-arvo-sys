'use client';

import React, { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, Clock, PauseCircle, ShieldAlert, TrendingDown } from 'lucide-react';
import { safeJsonFetch } from '@/lib/api-client';

interface AnalyticsData {
  summary: {
    totalTickets: number;
    activeTickets: number;
    lateTickets: number;
    breachRatePercent: number;
    waitingOnCustomerTickets: number;
    urgentTickets: number;
    resolvedTickets: number;
  };
  delayedBreakdown: Array<{
    id: string;
    ticketNumber: string;
    title: string;
    priority: string;
    customerName: string;
    assignedToName: string;
    firstResponseBreached: boolean;
    resolutionBreached: boolean;
    minutesOverdue: number;
    internalBlockerReason: string;
  }>;
}

export function AnalyticsView() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    safeJsonFetch<AnalyticsData>('/api/analytics').then((result) => {
      if (result.ok && result.data) {
        setData(result.data);
      }
      setLoading(false);
    });
  }, []);

  if (loading) {
    return <div className="p-12 text-center text-slate-400 text-sm">Generating Management SLA Report...</div>;
  }

  if (!data) {
    return <div className="p-12 text-center text-red-500 text-sm">Failed to load analytics.</div>;
  }

  return (
    <div className="space-y-6">
      {/* Executive Problem Context Card */}
      <div className="bg-sky-50 border border-sky-200 rounded-2xl p-5 shadow-sm">
        <div className="flex items-start space-x-3">
          <div className="w-9 h-9 rounded-xl bg-sky-600 text-white flex items-center justify-center font-bold text-lg shrink-0">
            !
          </div>
          <div>
            <h3 className="font-bold text-sm text-sky-950">
              Management Intelligence: Answering &quot;Which Problems Were Late and Why?&quot;
            </h3>
            <p className="text-xs text-sky-800 mt-1 leading-relaxed">
              In Arvo&apos;s previous spreadsheet system, managers asked which tickets were late and why, but nobody
              could answer because spreadsheets keep no history. Frontdesk calculates working hours SLAs dynamically,
              records immutable audit logs, and aggregates delayed ticket blocker causes in real time.
            </p>
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
          <p className="text-xs text-slate-500 font-medium">Active Breach Rate</p>
          <div className="flex items-baseline space-x-2 mt-1">
            <span className="text-3xl font-bold text-red-600">{data.summary.breachRatePercent}%</span>
            <span className="text-xs text-slate-400">of active tickets</span>
          </div>
          <p className="text-[11px] text-slate-500 mt-2 font-medium">Target: &lt; 5% breach threshold</p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
          <p className="text-xs text-slate-500 font-medium">Late / Breached Tickets</p>
          <div className="flex items-baseline space-x-2 mt-1">
            <span className="text-3xl font-bold text-red-600">{data.summary.lateTickets}</span>
            <span className="text-xs text-slate-400">tickets</span>
          </div>
          <p className="text-[11px] text-red-600 mt-2 font-medium">Require immediate supervisor action</p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
          <p className="text-xs text-slate-500 font-medium">Waiting on Customer</p>
          <div className="flex items-baseline space-x-2 mt-1">
            <span className="text-3xl font-bold text-amber-600">{data.summary.waitingOnCustomerTickets}</span>
            <span className="text-xs text-slate-400">paused timers</span>
          </div>
          <p className="text-[11px] text-amber-700 mt-2 font-medium">SLA paused, not penalizing agents</p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
          <p className="text-xs text-slate-500 font-medium">Resolved Tickets</p>
          <div className="flex items-baseline space-x-2 mt-1">
            <span className="text-3xl font-bold text-emerald-600">{data.summary.resolvedTickets}</span>
            <span className="text-xs text-slate-400">closed</span>
          </div>
          <p className="text-[11px] text-emerald-700 mt-2 font-medium">Full immutable audit logs preserved</p>
        </div>
      </div>

      {/* Delayed Tickets Root Cause Breakdown Table */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
          <div>
            <h4 className="font-bold text-sm text-slate-900">Late Ticket Root Cause Analysis</h4>
            <p className="text-xs text-slate-500">
              Detailed list of overdue tickets with internal engineering blockers and response gaps
            </p>
          </div>
          <span className="text-xs font-semibold px-2.5 py-1 bg-red-100 text-red-800 rounded-full border border-red-200">
            {data.delayedBreakdown.length} Overdue
          </span>
        </div>

        {data.delayedBreakdown.length === 0 ? (
          <div className="p-8 text-center text-slate-400 text-xs">
            🎉 Excellent! Zero tickets are currently overdue.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider font-semibold border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3">Ticket</th>
                  <th className="px-4 py-3">Severity</th>
                  <th className="px-4 py-3">Customer</th>
                  <th className="px-4 py-3">Assigned Agent</th>
                  <th className="px-4 py-3">Overdue By</th>
                  <th className="px-4 py-3">Breach Type</th>
                  <th className="px-4 py-3">Why Was It Late? (Documented Root Cause)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.delayedBreakdown.map((item) => (
                  <tr key={item.id} className="hover:bg-red-50/20">
                    <td className="px-4 py-3 font-mono font-bold text-slate-900">{item.ticketNumber}</td>
                    <td className="px-4 py-3 font-semibold text-slate-800">{item.priority}</td>
                    <td className="px-4 py-3 font-medium text-slate-700">{item.customerName}</td>
                    <td className="px-4 py-3 text-slate-700">{item.assignedToName}</td>
                    <td className="px-4 py-3 font-bold text-red-600">
                      {Math.round(item.minutesOverdue / 60)}h {Math.round(item.minutesOverdue % 60)}m
                    </td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-red-100 text-red-800 border border-red-200">
                        {item.resolutionBreached ? 'Resolution SLA' : 'First Response SLA'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-800 font-medium">
                      <div className="bg-slate-50 p-2 rounded border border-slate-200 text-[11px]">
                        {item.internalBlockerReason}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
