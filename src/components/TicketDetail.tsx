'use client';

import React, { useState } from 'react';
import { Agent, AuditEvent, Message, Priority, Ticket, TicketStatus } from '@/types';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Flame,
  History,
  Lock,
  MessageSquare,
  PauseCircle,
  Send,
  ShieldAlert,
  User,
  UserCheck,
} from 'lucide-react';

interface TicketDetailProps {
  ticket: Ticket;
  currentAgent: Agent | null;
  onTicketUpdated: (updatedTicket: Ticket) => void;
  onRefresh: () => void;
}

export function TicketDetail({
  ticket,
  currentAgent,
  onTicketUpdated,
  onRefresh,
}: TicketDetailProps) {
  const [activeTab, setActiveTab] = useState<'conversation' | 'audit'>('conversation');
  const [composerType, setComposerType] = useState<'PUBLIC_REPLY' | 'INTERNAL_NOTE'>('PUBLIC_REPLY');
  const [messageContent, setMessageContent] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [claimError, setClaimError] = useState<string | null>(null);

  // Claim Ticket Handler (INC-0291 Concurrency Protected)
  async function handleClaimTicket() {
    if (!currentAgent) return;
    setClaimError(null);
    setIsSubmitting(true);

    try {
      const res = await fetch(`/api/tickets/${ticket.id}/claim`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentId: currentAgent.id,
          version: ticket.version,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setClaimError(data.error || 'Failed to claim ticket.');
      } else {
        onTicketUpdated(data.ticket);
      }
    } catch (err: any) {
      setClaimError(err.message || 'Network error claiming ticket');
    } finally {
      setIsSubmitting(false);
    }
  }

  // Status Change Handler
  async function handleStatusChange(newStatus: TicketStatus) {
    if (!currentAgent) return;
    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/tickets/${ticket.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: newStatus,
          actorName: currentAgent.name,
          actorId: currentAgent.id,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        onTicketUpdated(data.ticket);
      }
    } catch (err) {
      console.error('Status update failed', err);
    } finally {
      setIsSubmitting(false);
    }
  }

  // Priority Change Handler (handles mid-flight urgency recalculation)
  async function handlePriorityChange(newPriority: Priority) {
    if (!currentAgent) return;
    if (newPriority === ticket.priority) return;

    if (
      newPriority === 'URGENT' &&
      !confirm(
        'Escalating this ticket to URGENT will recalculate its SLA to same-working-day resolution and 2-hour response window. Net business time already elapsed will be counted. Proceed?'
      )
    ) {
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/tickets/${ticket.id}/priority`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          priority: newPriority,
          actorName: currentAgent.name,
          actorId: currentAgent.id,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        onTicketUpdated(data.ticket);
      }
    } catch (err) {
      console.error('Priority update failed', err);
    } finally {
      setIsSubmitting(false);
    }
  }

  // Send Message / Add Note Handler
  async function handleSendMessage(e: React.FormEvent) {
    e.preventDefault();
    if (!messageContent.trim() || !currentAgent) return;

    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/tickets/${ticket.id}/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          senderType: 'AGENT',
          senderId: currentAgent.id,
          senderName: currentAgent.name,
          type: composerType,
          content: messageContent.trim(),
        }),
      });

      const data = await res.json();
      if (res.ok) {
        setMessageContent('');
        onTicketUpdated(data.ticket);
      } else {
        alert(data.error || 'Failed to post message');
      }
    } catch (err) {
      console.error('Failed to post message', err);
    } finally {
      setIsSubmitting(false);
    }
  }

  function formatTime(iso: string) {
    return new Date(iso).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  function formatDuration(minutes: number) {
    const isLate = minutes < 0;
    const absMin = Math.abs(minutes);
    const h = Math.floor(absMin / 60);
    const m = Math.floor(absMin % 60);
    const str = h > 0 ? `${h}h ${m}m` : `${m}m`;
    return isLate ? `${str} overdue` : `in ${str}`;
  }

  const isAssignedToOther = ticket.assignedToId && currentAgent && ticket.assignedToId !== currentAgent.id;
  const isAssignedToMe = ticket.assignedToId && currentAgent && ticket.assignedToId === currentAgent.id;

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm flex flex-col h-[calc(100vh-180px)] overflow-hidden">
      {/* Top Header & Actions Bar */}
      <div className="p-4 border-b border-slate-200 bg-slate-50">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center space-x-2 mb-1">
              <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-slate-200 text-slate-800">
                {ticket.ticketNumber}
              </span>
              <span className="text-xs text-slate-500 font-medium">v{ticket.version} (Optimistic Lock)</span>
              <span className="text-xs text-slate-400">&bull;</span>
              <span className="text-xs text-slate-500">Created: {formatTime(ticket.createdAt)}</span>
            </div>
            <h2 className="text-lg font-bold text-slate-900 leading-snug">{ticket.title}</h2>
            <div className="text-xs text-slate-600 mt-0.5">
              Customer: <strong className="text-slate-800">{ticket.customerName}</strong> ({ticket.customerEmail})
              {ticket.companyName ? ` &bull; ${ticket.companyName}` : ''}
            </div>
          </div>

          {/* Claim / Assignment Control (INC-0291) */}
          <div className="flex items-center space-x-2 shrink-0">
            {ticket.assignedToId ? (
              <div className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 font-medium">
                <UserCheck className="w-3.5 h-3.5 text-emerald-600" />
                <span>Assigned: <strong>{ticket.assignedToName}</strong></span>
              </div>
            ) : (
              <button
                onClick={handleClaimTicket}
                disabled={isSubmitting}
                className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold shadow-sm transition disabled:opacity-50"
              >
                <User className="w-3.5 h-3.5" />
                <span>Take this ticket</span>
              </button>
            )}
          </div>
        </div>

        {/* INC-0291 Concurrency Collision Alert */}
        {claimError && (
          <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center space-x-2 text-xs text-red-800 font-medium">
            <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
            <span>{claimError}</span>
          </div>
        )}

        {isAssignedToOther && (
          <div className="mt-3 p-2 bg-amber-50 border border-amber-200 rounded-lg flex items-center space-x-2 text-xs text-amber-900 font-medium">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
            <span>
              Collision Prevention: This ticket is claimed by <strong>{ticket.assignedToName}</strong>. You can view
              or leave internal team notes, but avoid sending contradictory customer replies.
            </span>
          </div>
        )}

        {/* SLA Health Strip */}
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2 bg-white p-2.5 rounded-lg border border-slate-200 text-xs">
          {/* First Response SLA */}
          <div className="flex items-center space-x-2">
            <Clock
              className={`w-4 h-4 ${
                ticket.sla.firstRespondedAt
                  ? 'text-emerald-500'
                  : ticket.sla.isFirstResponseBreached
                  ? 'text-red-500'
                  : 'text-sky-500'
              }`}
            />
            <div>
              <span className="text-slate-500 block text-[11px]">First Response SLA</span>
              {ticket.sla.firstRespondedAt ? (
                <span className="font-semibold text-emerald-700">Fulfilled ({formatTime(ticket.sla.firstRespondedAt)})</span>
              ) : ticket.sla.isFirstResponseBreached ? (
                <span className="font-bold text-red-600">
                  Breached ({formatDuration(ticket.sla.firstResponseRemainingMinutes)})
                </span>
              ) : (
                <span className="font-semibold text-slate-800">
                  {formatDuration(ticket.sla.firstResponseRemainingMinutes)}
                </span>
              )}
            </div>
          </div>

          {/* Resolution SLA */}
          <div className="flex items-center space-x-2">
            <CheckCircle2
              className={`w-4 h-4 ${
                ticket.status === 'DONE'
                  ? 'text-emerald-500'
                  : ticket.sla.isResolutionBreached
                  ? 'text-red-500'
                  : 'text-indigo-500'
              }`}
            />
            <div>
              <span className="text-slate-500 block text-[11px]">Resolution SLA</span>
              {ticket.status === 'DONE' ? (
                <span className="font-semibold text-emerald-700">Resolved ({formatTime(ticket.resolvedAt || '')})</span>
              ) : ticket.sla.isResolutionBreached ? (
                <span className="font-bold text-red-600">
                  Breached ({formatDuration(ticket.sla.resolutionRemainingMinutes)})
                </span>
              ) : (
                <span className="font-semibold text-slate-800">
                  {formatDuration(ticket.sla.resolutionRemainingMinutes)}
                </span>
              )}
            </div>
          </div>

          {/* Pausing / State */}
          <div className="flex items-center space-x-2">
            <PauseCircle
              className={`w-4 h-4 ${ticket.sla.isPaused ? 'text-amber-500' : 'text-slate-400'}`}
            />
            <div>
              <span className="text-slate-500 block text-[11px]">SLA Pause Status</span>
              {ticket.sla.isPaused ? (
                <span className="font-bold text-amber-800">Paused (Waiting on Customer)</span>
              ) : ticket.sla.totalPausedBusinessMinutes > 0 ? (
                <span className="text-slate-700">
                  Active (Saved {Math.round(ticket.sla.totalPausedBusinessMinutes / 60)}h waiting time)
                </span>
              ) : (
                <span className="text-slate-700">Active</span>
              )}
            </div>
          </div>
        </div>

        {/* Status & Priority Controls Bar */}
        <div className="mt-3 flex items-center justify-between flex-wrap gap-2 pt-2 border-t border-slate-200 text-xs">
          <div className="flex items-center space-x-3">
            {/* Status Selector */}
            <div className="flex items-center space-x-1.5">
              <span className="text-slate-500 font-medium">Status:</span>
              <select
                value={ticket.status}
                onChange={(e) => handleStatusChange(e.target.value as TicketStatus)}
                className="bg-white border border-slate-300 rounded-md px-2 py-1 font-semibold text-slate-800 shadow-sm outline-none cursor-pointer"
              >
                <option value="OPEN">Open</option>
                <option value="IN_PROGRESS">In Progress</option>
                <option value="WAITING_ON_CUSTOMER">Waiting on Customer (Pauses Timer)</option>
                <option value="DONE">Done (Resolved)</option>
              </select>
            </div>

            {/* Priority Selector */}
            <div className="flex items-center space-x-1.5">
              <span className="text-slate-500 font-medium">Priority:</span>
              <select
                value={ticket.priority}
                onChange={(e) => handlePriorityChange(e.target.value as Priority)}
                className="bg-white border border-slate-300 rounded-md px-2 py-1 font-semibold text-slate-800 shadow-sm outline-none cursor-pointer"
              >
                <option value="URGENT">URGENT (2h reply, same day fix)</option>
                <option value="MEDIUM">MEDIUM (4.5h reply, 3 days fix)</option>
                <option value="SMALL">SMALL (1 day reply, 1 week fix)</option>
              </select>
            </div>
          </div>

          {/* Navigation View Switch */}
          <div className="flex items-center space-x-1 bg-slate-200/80 p-0.5 rounded-lg text-xs font-medium">
            <button
              onClick={() => setActiveTab('conversation')}
              className={`flex items-center space-x-1 px-3 py-1 rounded-md transition ${
                activeTab === 'conversation'
                  ? 'bg-white text-slate-900 shadow-sm font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <MessageSquare className="w-3.5 h-3.5" />
              <span>Conversation & Notes</span>
            </button>
            <button
              onClick={() => setActiveTab('audit')}
              className={`flex items-center space-x-1 px-3 py-1 rounded-md transition ${
                activeTab === 'audit'
                  ? 'bg-white text-slate-900 shadow-sm font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <History className="w-3.5 h-3.5" />
              <span>Audit Timeline ({ticket.auditEvents?.length || 0})</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main Tab Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {activeTab === 'conversation' ? (
          <>
            {/* Original Problem Description Card */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
              <div className="flex items-center justify-between text-xs text-slate-500 mb-1.5">
                <span className="font-semibold text-slate-800">{ticket.customerName}</span>
                <span>Submitted: {formatTime(ticket.createdAt)}</span>
              </div>
              <p className="text-sm text-slate-800 whitespace-pre-wrap leading-relaxed">{ticket.description}</p>
            </div>

            {/* Conversation Stream */}
            <div className="space-y-3">
              {(ticket.messages || []).map((msg) => {
                const isInternal = msg.type === 'INTERNAL_NOTE';

                return (
                  <div
                    key={msg.id}
                    className={`rounded-xl p-4 transition-all shadow-sm ${
                      isInternal
                        ? 'bg-amber-50/90 border-2 border-amber-300 text-amber-950'
                        : msg.senderType === 'CUSTOMER'
                        ? 'bg-slate-100 border border-slate-300 text-slate-900'
                        : 'bg-sky-50/90 border border-sky-200 text-sky-950'
                    }`}
                  >
                    <div className="flex items-center justify-between text-xs mb-1.5 pb-1 border-b border-black/5">
                      <div className="flex items-center space-x-1.5">
                        <strong className="font-semibold">{msg.senderName}</strong>
                        {isInternal ? (
                          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[10px] font-bold bg-amber-200 text-amber-900 border border-amber-400">
                            <Lock className="w-2.5 h-2.5" />
                            <span>INTERNAL TEAM NOTE &bull; HIDDEN FROM CUSTOMER</span>
                          </span>
                        ) : msg.senderType === 'AGENT' ? (
                          <span className="px-1.5 py-0.2 rounded text-[10px] font-semibold bg-sky-200 text-sky-800">
                            Support Agent (Public Reply)
                          </span>
                        ) : (
                          <span className="px-1.5 py-0.2 rounded text-[10px] font-semibold bg-slate-200 text-slate-700">
                            Customer
                          </span>
                        )}
                      </div>
                      <span className="text-slate-500 text-[11px]">{formatTime(msg.createdAt)}</span>
                    </div>
                    <p className="text-sm whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          /* Immutable Audit History Timeline (Addresses Problem INC-0318) */
          <div className="space-y-3">
            <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 text-xs text-slate-600 flex items-center justify-between">
              <span>
                <strong>Immutable Audit Log (INC-0318 Compliant):</strong> Every event is permanently timestamped.
                Records are append-only and cannot be altered.
              </span>
            </div>

            <div className="relative border-l-2 border-slate-200 ml-3 space-y-4 py-2">
              {(ticket.auditEvents || []).map((audit) => (
                <div key={audit.id} className="relative pl-6">
                  {/* Timeline bullet */}
                  <div className="absolute -left-1.5 top-1.5 w-3 h-3 rounded-full bg-sky-600 border-2 border-white shadow-sm" />
                  <div className="bg-white border border-slate-200 rounded-lg p-3 text-xs shadow-sm">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold text-slate-800">{audit.action}</span>
                      <span className="text-[11px] text-slate-400 font-mono">{formatTime(audit.createdAt)}</span>
                    </div>
                    <div className="text-slate-600 mb-1">
                      Actor: <strong>{audit.actorName}</strong> ({audit.actorType})
                    </div>
                    {audit.details && Object.keys(audit.details).length > 0 && (
                      <pre className="bg-slate-50 p-2 rounded text-[11px] font-mono text-slate-700 overflow-x-auto border border-slate-100">
                        {JSON.stringify(audit.details, null, 2)}
                      </pre>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Message Composer & Note Creator (Addresses Problem INC-0304) */}
      <div className="border-t border-slate-200 bg-white p-3">
        {/* Composer Mode Selector */}
        <div className="flex items-center space-x-2 mb-2">
          <button
            type="button"
            onClick={() => setComposerType('PUBLIC_REPLY')}
            className={`flex items-center space-x-1.5 px-3 py-1 rounded-md text-xs font-semibold transition ${
              composerType === 'PUBLIC_REPLY'
                ? 'bg-sky-600 text-white shadow-sm'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <Send className="w-3 h-3" />
            <span>✉️ Public Reply (Sent to Customer)</span>
          </button>

          <button
            type="button"
            onClick={() => setComposerType('INTERNAL_NOTE')}
            className={`flex items-center space-x-1.5 px-3 py-1 rounded-md text-xs font-semibold transition ${
              composerType === 'INTERNAL_NOTE'
                ? 'bg-amber-500 text-white shadow-sm ring-2 ring-amber-300'
                : 'bg-slate-100 text-slate-600 hover:bg-amber-100 hover:text-amber-900'
            }`}
          >
            <Lock className="w-3 h-3" />
            <span>🔒 Internal Team Note (Hidden from Customer)</span>
          </button>
        </div>

        {composerType === 'INTERNAL_NOTE' && (
          <div className="mb-2 px-2.5 py-1 rounded bg-amber-50 border border-amber-200 text-[11px] text-amber-900 font-medium flex items-center space-x-1.5">
            <Lock className="w-3.5 h-3.5 text-amber-600 shrink-0" />
            <span>
              <strong>INC-0304 Protection Active:</strong> This private note will NEVER be shown to the customer. It is
              excluded from customer APIs, customer screens, and exports.
            </span>
          </div>
        )}

        <form onSubmit={handleSendMessage} className="space-y-2">
          <textarea
            rows={3}
            value={messageContent}
            onChange={(e) => setMessageContent(e.target.value)}
            placeholder={
              composerType === 'PUBLIC_REPLY'
                ? 'Type your official public response to the customer...'
                : 'Write a private note for Arvo support team / engineering only...'
            }
            className={`w-full rounded-lg border p-2.5 text-xs outline-none focus:ring-2 transition ${
              composerType === 'INTERNAL_NOTE'
                ? 'bg-amber-50/50 border-amber-300 focus:ring-amber-500 text-amber-950'
                : 'bg-white border-slate-300 focus:ring-sky-500 text-slate-900'
            }`}
          />

          <div className="flex items-center justify-between">
            <span className="text-[11px] text-slate-400">
              Posting as: <strong>{currentAgent?.name}</strong>
            </span>
            <button
              type="submit"
              disabled={isSubmitting || !messageContent.trim()}
              className={`flex items-center space-x-1.5 px-4 py-1.5 rounded-lg text-xs font-bold text-white shadow-sm transition disabled:opacity-50 ${
                composerType === 'INTERNAL_NOTE' ? 'bg-amber-600 hover:bg-amber-700' : 'bg-sky-600 hover:bg-sky-700'
              }`}
            >
              {composerType === 'INTERNAL_NOTE' ? <Lock className="w-3.5 h-3.5" /> : <Send className="w-3.5 h-3.5" />}
              <span>{composerType === 'INTERNAL_NOTE' ? 'Add Private Team Note' : 'Send Reply to Customer'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
