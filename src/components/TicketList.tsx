'use client';

import React from 'react';
import { Ticket, Priority, TicketStatus } from '@/types';
import { AlertCircle, Clock, PauseCircle, CheckCircle2, User, Flame } from 'lucide-react';

interface TicketListProps {
  tickets: Ticket[];
  selectedTicketId: string | null;
  onSelectTicket: (ticket: Ticket) => void;
  activeFilter: string;
  onFilterChange: (filter: string) => void;
  currentAgentId?: string;
}

export function TicketList({
  tickets,
  selectedTicketId,
  onSelectTicket,
  activeFilter,
  onFilterChange,
  currentAgentId,
}: TicketListProps) {
  // Format remaining SLA time in human readable format
  function formatSLAMinutes(minutes: number): string {
    const isLate = minutes < 0;
    const absMin = Math.abs(minutes);
    const hours = Math.floor(absMin / 60);
    const mins = Math.floor(absMin % 60);

    let formatted = '';
    if (hours > 0) {
      formatted = `${hours}h ${mins}m`;
    } else {
      formatted = `${mins}m`;
    }

    return isLate ? `${formatted} overdue` : `due in ${formatted}`;
  }

  function getPriorityBadge(priority: Priority) {
    switch (priority) {
      case 'URGENT':
        return (
          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[11px] font-bold bg-red-100 text-red-800 border border-red-200">
            <Flame className="w-3 h-3 text-red-600" />
            <span>URGENT</span>
          </span>
        );
      case 'MEDIUM':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-amber-100 text-amber-800 border border-amber-200">
            MEDIUM
          </span>
        );
      case 'SMALL':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-700 border border-slate-200">
            SMALL
          </span>
        );
    }
  }

  function getStatusBadge(status: TicketStatus, isPaused: boolean) {
    switch (status) {
      case 'OPEN':
        return (
          <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-blue-100 text-blue-800">
            Open
          </span>
        );
      case 'IN_PROGRESS':
        return (
          <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-sky-100 text-sky-800">
            In Progress
          </span>
        );
      case 'WAITING_ON_CUSTOMER':
        return (
          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[11px] font-bold bg-amber-100 text-amber-900 border border-amber-300">
            <PauseCircle className="w-3 h-3 text-amber-700" />
            <span>Waiting on Customer</span>
          </span>
        );
      case 'DONE':
        return (
          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-100 text-emerald-800">
            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
            <span>Done</span>
          </span>
        );
      case 'CLOSED_AUTO':
        return (
          <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-200 text-slate-700">
            Closed (Auto)
          </span>
        );
    }
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm flex flex-col h-[calc(100vh-180px)] overflow-hidden">
      {/* Filter Tabs */}
      <div className="border-b border-slate-200 bg-slate-50 px-4 py-2.5 flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center space-x-1 text-xs font-medium">
          <button
            onClick={() => onFilterChange('all')}
            className={`px-3 py-1.5 rounded-md transition ${
              activeFilter === 'all'
                ? 'bg-white text-slate-900 shadow-sm font-semibold border border-slate-200'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            All Tickets ({tickets.length})
          </button>
          <button
            onClick={() => onFilterChange('late')}
            className={`flex items-center space-x-1 px-3 py-1.5 rounded-md transition ${
              activeFilter === 'late'
                ? 'bg-red-500 text-white font-semibold shadow-sm'
                : 'text-red-700 bg-red-50 hover:bg-red-100 border border-red-200'
            }`}
          >
            <AlertCircle className="w-3.5 h-3.5" />
            <span>Already Late</span>
          </button>
          <button
            onClick={() => onFilterChange('waiting')}
            className={`flex items-center space-x-1 px-3 py-1.5 rounded-md transition ${
              activeFilter === 'waiting'
                ? 'bg-amber-500 text-white font-semibold shadow-sm'
                : 'text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-200'
            }`}
          >
            <PauseCircle className="w-3.5 h-3.5" />
            <span>Waiting on Customer</span>
          </button>
          <button
            onClick={() => onFilterChange('my')}
            className={`px-3 py-1.5 rounded-md transition ${
              activeFilter === 'my'
                ? 'bg-white text-slate-900 shadow-sm font-semibold border border-slate-200'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            My Assigned
          </button>
          <button
            onClick={() => onFilterChange('unassigned')}
            className={`px-3 py-1.5 rounded-md transition ${
              activeFilter === 'unassigned'
                ? 'bg-white text-slate-900 shadow-sm font-semibold border border-slate-200'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Unassigned
          </button>
        </div>
      </div>

      {/* Ticket List Items */}
      <div className="overflow-y-auto divide-y divide-slate-100 flex-1">
        {tickets.length === 0 ? (
          <div className="p-8 text-center text-slate-500 text-sm">
            No tickets match this filter.
          </div>
        ) : (
          tickets.map((ticket) => {
            const isSelected = ticket.id === selectedTicketId;
            const isLate =
              ticket.status !== 'DONE' &&
              ticket.status !== 'CLOSED_AUTO' &&
              (ticket.sla.isFirstResponseBreached || ticket.sla.isResolutionBreached);
            const isWaiting = ticket.status === 'WAITING_ON_CUSTOMER';

            return (
              <div
                key={ticket.id}
                onClick={() => onSelectTicket(ticket)}
                className={`p-4 transition cursor-pointer select-none border-l-4 ${
                  isSelected
                    ? 'bg-sky-50/70 border-sky-600'
                    : isLate
                    ? 'border-red-500 hover:bg-red-50/30'
                    : isWaiting
                    ? 'border-amber-400 hover:bg-amber-50/30'
                    : 'border-transparent hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center space-x-2">
                    <span className="text-xs font-bold font-mono text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                      {ticket.ticketNumber}
                    </span>
                    {getPriorityBadge(ticket.priority)}
                    {getStatusBadge(ticket.status, ticket.sla.isPaused)}
                  </div>

                  {/* Real-time SLA Countdown Indicator */}
                  {ticket.status === 'DONE' ? (
                    <span className="text-xs font-medium text-emerald-700 flex items-center space-x-1">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Resolved</span>
                    </span>
                  ) : isWaiting ? (
                    <span className="text-xs font-semibold text-amber-800 bg-amber-100/90 px-2 py-0.5 rounded-full flex items-center space-x-1 border border-amber-300">
                      <PauseCircle className="w-3 h-3 text-amber-700" />
                      <span>Timer Paused</span>
                    </span>
                  ) : isLate ? (
                    <span className="text-xs font-bold text-red-700 bg-red-100 px-2 py-0.5 rounded-full flex items-center space-x-1 border border-red-300 animate-pulse">
                      <AlertCircle className="w-3 h-3 text-red-600" />
                      <span>
                        BREACHED (
                        {formatSLAMinutes(
                          ticket.sla.isFirstResponseBreached
                            ? ticket.sla.firstResponseRemainingMinutes
                            : ticket.sla.resolutionRemainingMinutes
                        )}
                        )
                      </span>
                    </span>
                  ) : (
                    <span className="text-xs font-medium text-slate-600 flex items-center space-x-1 bg-slate-100 px-2 py-0.5 rounded-full">
                      <Clock className="w-3 h-3 text-slate-500" />
                      <span>
                        {formatSLAMinutes(
                          !ticket.sla.firstRespondedAt
                            ? ticket.sla.firstResponseRemainingMinutes
                            : ticket.sla.resolutionRemainingMinutes
                        )}
                      </span>
                    </span>
                  )}
                </div>

                {/* Title & Customer */}
                <h4 className="text-sm font-semibold text-slate-900 mb-1 line-clamp-1">
                  {ticket.title}
                </h4>
                <p className="text-xs text-slate-500 line-clamp-1 mb-2">
                  {ticket.description}
                </p>

                {/* Footer metadata */}
                <div className="flex items-center justify-between text-[11px] text-slate-500">
                  <span className="font-medium text-slate-700">
                    {ticket.customerName} {ticket.companyName ? `• ${ticket.companyName}` : ''}
                  </span>

                  <div className="flex items-center space-x-1">
                    <User className="w-3 h-3 text-slate-400" />
                    <span>
                      {ticket.assignedToName ? (
                        <strong className="text-slate-800">{ticket.assignedToName}</strong>
                      ) : (
                        <em className="text-slate-400">Unassigned</em>
                      )}
                    </span>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
