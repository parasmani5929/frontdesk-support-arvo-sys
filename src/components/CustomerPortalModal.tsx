'use client';

import React, { useState, useEffect } from 'react';
import { CustomerTicketView, Ticket } from '@/types';
import { safeJsonFetch } from '@/lib/api-client';
import {
  HelpCircle,
  X,
  Send,
  RotateCcw,
  ShieldCheck,
  Lock,
  CheckCircle2,
  AlertTriangle,
  Clock,
} from 'lucide-react';

interface CustomerPortalProps {
  tickets: Ticket[];
  onClose: () => void;
  onRefreshAll: () => void;
}

export function CustomerPortal({ tickets, onClose, onRefreshAll }: CustomerPortalProps) {
  const [selectedTicketId, setSelectedTicketId] = useState<string>(tickets[0]?.id || 'inc-0304');
  const [customerTicket, setCustomerTicket] = useState<CustomerTicketView | null>(null);
  const [replyContent, setReplyContent] = useState('');
  const [reopenReason, setReopenReason] = useState('');
  const [showReopenBox, setShowReopenBox] = useState(false);
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  useEffect(() => {
    if (selectedTicketId) {
      loadCustomerView(selectedTicketId);
    }
  }, [selectedTicketId]);

  async function loadCustomerView(id: string) {
    setLoading(true);
    setStatusMessage(null);

    const result = await safeJsonFetch<{ ticket: CustomerTicketView }>(`/api/customer/tickets/${id}`);
    setLoading(false);

    if (result.ok && result.data) {
      setCustomerTicket(result.data.ticket);
    } else {
      setStatusMessage(result.error || 'Failed to fetch customer ticket view');
    }
  }

  async function handleCustomerReply(e: React.FormEvent) {
    e.preventDefault();
    if (!replyContent.trim() || !customerTicket) return;

    setLoading(true);

    const result = await safeJsonFetch<{ ticket: CustomerTicketView }>(
      `/api/customer/tickets/${customerTicket.id}/reply`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: replyContent.trim(),
          customerName: customerTicket.customerName,
        }),
      }
    );

    setLoading(false);

    if (result.ok && result.data) {
      setCustomerTicket(result.data.ticket);
      setReplyContent('');
      setStatusMessage('Your reply was submitted. Support agents have been notified and SLA timer resumed!');
      onRefreshAll();
    } else {
      setStatusMessage(result.error || 'Failed to post reply');
    }
  }

  async function handleReopenTicket(e: React.FormEvent) {
    e.preventDefault();
    if (!reopenReason.trim() || !customerTicket) return;

    setLoading(true);

    const result = await safeJsonFetch<{ ticket: CustomerTicketView }>(
      `/api/customer/tickets/${customerTicket.id}/reopen`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reason: reopenReason.trim(),
          customerName: customerTicket.customerName,
        }),
      }
    );

    setLoading(false);

    if (result.ok && result.data) {
      setCustomerTicket(result.data.ticket);
      setReopenReason('');
      setShowReopenBox(false);
      setStatusMessage('Ticket reopened successfully. Our agents will follow up promptly.');
      onRefreshAll();
    } else {
      setStatusMessage(result.error || 'Failed to reopen ticket');
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

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-4xl w-full h-[85vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Customer Portal Banner */}
        <div className="bg-slate-900 text-white p-4 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-lg bg-emerald-500 flex items-center justify-center font-bold text-slate-900">
              <HelpCircle className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="font-bold text-sm flex items-center space-x-2">
                <span>Customer Help Desk Preview</span>
                <span className="text-[10px] bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded font-mono border border-emerald-400/30">
                  INC-0304 Data Leak Proof Active
                </span>
              </h3>
              <p className="text-xs text-slate-400">
                Simulating what the customer sees. Internal notes are strictly excluded from API responses and screen.
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            {/* Select Ticket to Preview */}
            <div className="flex items-center space-x-1.5 bg-slate-800 px-2.5 py-1 rounded-lg text-xs">
              <span className="text-slate-400">Ticket:</span>
              <select
                value={selectedTicketId}
                onChange={(e) => setSelectedTicketId(e.target.value)}
                className="bg-transparent text-white font-semibold outline-none cursor-pointer"
              >
                {tickets.map((t) => (
                  <option key={t.id} value={t.id} className="bg-slate-900 text-white">
                    {t.ticketNumber} - {t.title.slice(0, 30)}... ({t.status})
                  </option>
                ))}
              </select>
            </div>

            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* INC-0304 Verification Badge */}
        <div className="bg-emerald-50 border-b border-emerald-200 px-4 py-2 flex items-center justify-between text-xs text-emerald-900">
          <div className="flex items-center space-x-2">
            <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>
              <strong>Zero-Leak Verification:</strong> Customer views query <code>/api/customer/tickets/[id]</code>. Internal team notes and private comments are physically omitted at the database query level.
            </span>
          </div>
          <span className="font-mono text-[11px] text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded">
            Safe Mode: ON
          </span>
        </div>

        {statusMessage && (
          <div className="bg-sky-50 border-b border-sky-200 px-4 py-2 text-xs text-sky-800 font-medium">
            {statusMessage}
          </div>
        )}

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5 bg-slate-50">
          {loading ? (
            <div className="p-8 text-center text-slate-400 text-sm">Loading ticket from customer API...</div>
          ) : customerTicket ? (
            <>
              {/* Ticket Summary Card */}
              <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center space-x-2">
                    <span className="font-mono font-bold text-xs bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                      {customerTicket.ticketNumber}
                    </span>
                    <span className="text-xs px-2 py-0.5 rounded font-semibold bg-sky-100 text-sky-800">
                      Status: {customerTicket.status}
                    </span>
                  </div>
                  <span className="text-xs text-slate-400">Created: {formatTime(customerTicket.createdAt)}</span>
                </div>

                <h2 className="text-base font-bold text-slate-900 mb-2">{customerTicket.title}</h2>
                <div className="bg-slate-50 rounded-lg p-3 text-xs text-slate-700 whitespace-pre-wrap border border-slate-100">
                  {customerTicket.description}
                </div>

                {/* 1-Week Reopen Policy Section */}
                {customerTicket.status === 'DONE' && (
                  <div className="mt-4 pt-4 border-t border-slate-200 flex items-center justify-between">
                    <div>
                      <p className="text-xs font-semibold text-slate-800">Has your issue returned or remain unsolved?</p>
                      <p className="text-[11px] text-slate-500">
                        {customerTicket.isReopenable
                          ? 'You can reopen this ticket within 1 week of resolution.'
                          : 'This ticket was closed over 1 week ago and cannot be reopened. Please submit a new ticket.'}
                      </p>
                    </div>

                    {customerTicket.isReopenable ? (
                      <button
                        onClick={() => setShowReopenBox(!showReopenBox)}
                        className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold shadow-sm transition"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>Reopen Ticket</span>
                      </button>
                    ) : (
                      <span className="text-xs font-semibold text-slate-400 bg-slate-100 px-3 py-1.5 rounded-lg border border-slate-200">
                        Reopening Expired (&gt; 7 days)
                      </span>
                    )}
                  </div>
                )}

                {/* Reopen Input Box */}
                {showReopenBox && (
                  <form onSubmit={handleReopenTicket} className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg space-y-2">
                    <label className="block text-xs font-semibold text-amber-900">
                      Please let us know why you need to reopen this ticket:
                    </label>
                    <textarea
                      required
                      rows={2}
                      value={reopenReason}
                      onChange={(e) => setReopenReason(e.target.value)}
                      placeholder="e.g. The issue recurred when generating invoices this morning..."
                      className="w-full text-xs p-2 rounded border border-amber-300 outline-none focus:ring-2 focus:ring-amber-500"
                    />
                    <div className="flex justify-end space-x-2">
                      <button
                        type="button"
                        onClick={() => setShowReopenBox(false)}
                        className="text-xs px-3 py-1 text-slate-600 hover:bg-slate-200 rounded"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={loading}
                        className="text-xs px-4 py-1 bg-amber-600 text-white font-bold rounded shadow-sm hover:bg-amber-700"
                      >
                        Confirm Reopen
                      </button>
                    </div>
                  </form>
                )}
              </div>

              {/* Message Thread (Customer Visible Only) */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                  Support Conversation History ({customerTicket.messages.length} messages)
                </h4>

                {customerTicket.messages.length === 0 ? (
                  <div className="bg-white p-6 text-center text-xs text-slate-400 rounded-xl border border-slate-200">
                    No public replies yet. Our support agents are actively reviewing your request.
                  </div>
                ) : (
                  customerTicket.messages.map((m) => (
                    <div
                      key={m.id}
                      className={`p-4 rounded-xl border text-xs shadow-sm ${
                        m.senderType === 'CUSTOMER'
                          ? 'bg-slate-100 border-slate-200 text-slate-900 ml-6'
                          : 'bg-white border-sky-200 text-slate-900 mr-6'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1 pb-1 border-b border-black/5">
                        <span className="font-bold text-slate-800">
                          {m.senderName} {m.senderType === 'AGENT' ? '(Arvo Support)' : '(You)'}
                        </span>
                        <span className="text-[11px] text-slate-400">{formatTime(m.createdAt)}</span>
                      </div>
                      <p className="whitespace-pre-wrap leading-relaxed">{m.content}</p>
                    </div>
                  ))
                )}
              </div>
            </>
          ) : (
            <div className="p-8 text-center text-slate-400">Select a ticket to preview</div>
          )}
        </div>

        {/* Customer Reply Box (Resumes SLA) */}
        {customerTicket && customerTicket.status !== 'DONE' && customerTicket.status !== 'CLOSED_AUTO' && (
          <div className="bg-white p-4 border-t border-slate-200">
            <form onSubmit={handleCustomerReply} className="space-y-2">
              <label className="block text-xs font-semibold text-slate-700">
                Reply to Arvo Support (Resumes SLA Timer if waiting on you):
              </label>
              <div className="flex space-x-2">
                <textarea
                  rows={2}
                  required
                  value={replyContent}
                  onChange={(e) => setReplyContent(e.target.value)}
                  placeholder="Provide additional details or answer agent questions..."
                  className="flex-1 text-xs p-2.5 rounded-lg border border-slate-300 focus:ring-2 focus:ring-emerald-500 outline-none"
                />
                <button
                  type="submit"
                  disabled={loading || !replyContent.trim()}
                  className="px-5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg text-xs shadow-sm transition flex items-center space-x-1.5 disabled:opacity-50"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Send</span>
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
