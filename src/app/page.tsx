'use client';

import React, { useState, useEffect } from 'react';
import { Agent, Ticket } from '@/types';
import { Header } from '@/components/Header';
import { StatCard } from '@/components/StatCard';
import { TicketList } from '@/components/TicketList';
import { TicketDetail } from '@/components/TicketDetail';
import { NewTicketModal } from '@/components/NewTicketModal';
import { CustomerPortal } from '@/components/CustomerPortalModal';
import { AnalyticsView } from '@/components/AnalyticsView';
import {
  AlertCircle,
  Clock,
  PauseCircle,
  Flame,
  Layers,
  Inbox,
  RefreshCw,
} from 'lucide-react';

export default function Home() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [currentAgent, setCurrentAgent] = useState<Agent | null>(null);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<string>('all');
  const [activeView, setActiveView] = useState<'agent' | 'analytics' | 'customer'>('agent');
  const [isNewTicketOpen, setIsNewTicketOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Load agents and tickets on mount
  useEffect(() => {
    fetchAgents();
    fetchTickets();
  }, []);

  async function fetchAgents() {
    try {
      const res = await fetch('/api/agents');
      const data = await res.json();
      if (res.ok && data.agents) {
        setAgents(data.agents);
        if (!currentAgent && data.agents.length > 0) {
          setCurrentAgent(data.agents[0]); // Default to Meera Patel (Support Lead)
        }
      }
    } catch (err) {
      console.error('Failed to load agents', err);
    }
  }

  async function fetchTickets() {
    setIsLoading(true);
    try {
      const res = await fetch('/api/tickets');
      const data = await res.json();
      if (res.ok && data.tickets) {
        setTickets(data.tickets);
        // Default select first ticket if none selected
        if (!selectedTicketId && data.tickets.length > 0) {
          setSelectedTicketId(data.tickets[0].id);
        }
      }
    } catch (err) {
      console.error('Failed to load tickets', err);
    } finally {
      setIsLoading(false);
    }
  }

  // Refresh single ticket after an action
  async function handleTicketUpdated(updatedTicket: Ticket) {
    setTickets((prev) =>
      prev.map((t) => (t.id === updatedTicket.id ? updatedTicket : t))
    );
  }

  // Filter computation
  const activeTickets = tickets.filter((t) => t.status !== 'DONE' && t.status !== 'CLOSED_AUTO');
  const lateTickets = activeTickets.filter(
    (t) => t.sla.isFirstResponseBreached || t.sla.isResolutionBreached
  );
  const waitingTickets = activeTickets.filter((t) => t.status === 'WAITING_ON_CUSTOMER');
  const urgentTickets = activeTickets.filter((t) => t.priority === 'URGENT');
  const myAssignedTickets = currentAgent
    ? activeTickets.filter((t) => t.assignedToId === currentAgent.id)
    : [];

  const displayedTickets = tickets.filter((t) => {
    if (activeFilter === 'late') {
      return (
        t.status !== 'DONE' &&
        t.status !== 'CLOSED_AUTO' &&
        (t.sla.isFirstResponseBreached || t.sla.isResolutionBreached)
      );
    }
    if (activeFilter === 'waiting') {
      return t.status === 'WAITING_ON_CUSTOMER';
    }
    if (activeFilter === 'my') {
      return currentAgent ? t.assignedToId === currentAgent.id : true;
    }
    if (activeFilter === 'unassigned') {
      return !t.assignedToId && t.status !== 'DONE';
    }
    if (activeFilter === 'urgent') {
      return t.priority === 'URGENT';
    }
    return true; // 'all'
  });

  const selectedTicket = tickets.find((t) => t.id === selectedTicketId) || displayedTickets[0] || null;

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col font-sans">
      {/* Top Application Header */}
      <Header
        agents={agents}
        currentAgent={currentAgent}
        onSelectAgent={setCurrentAgent}
        activeView={activeView}
        onChangeView={setActiveView}
        onOpenNewTicket={() => setIsNewTicketOpen(true)}
      />

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 space-y-5">
        {activeView === 'agent' && (
          <>
            {/* KPI Stats Bar */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <StatCard
                title="Active Tickets"
                count={activeTickets.length}
                icon={Layers}
                colorScheme="slate"
                active={activeFilter === 'all'}
                onClick={() => setActiveFilter('all')}
                subtitle="In progress or open"
              />
              <StatCard
                title="Already Late (SLA Breached)"
                count={lateTickets.length}
                icon={AlertCircle}
                colorScheme="red"
                active={activeFilter === 'late'}
                onClick={() => setActiveFilter('late')}
                subtitle="First response or fix overdue"
              />
              <StatCard
                title="Waiting on Customer"
                count={waitingTickets.length}
                icon={PauseCircle}
                colorScheme="amber"
                active={activeFilter === 'waiting'}
                onClick={() => setActiveFilter('waiting')}
                subtitle="Timer paused, no SLA penalty"
              />
              <StatCard
                title="Urgent Problems"
                count={urgentTickets.length}
                icon={Flame}
                colorScheme="purple"
                active={activeFilter === 'urgent'}
                onClick={() => setActiveFilter('urgent')}
                subtitle="Cannot work at all (same day)"
              />
            </div>

            {/* Support Agent Single-Screen Workspace */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
              {/* Left Pane: Ticket Stream */}
              <div className="lg:col-span-5">
                <TicketList
                  tickets={displayedTickets}
                  selectedTicketId={selectedTicket?.id || null}
                  onSelectTicket={(t) => setSelectedTicketId(t.id)}
                  activeFilter={activeFilter}
                  onFilterChange={setActiveFilter}
                  currentAgentId={currentAgent?.id}
                />
              </div>

              {/* Right Pane: Ticket Detail & Conversation Console */}
              <div className="lg:col-span-7">
                {selectedTicket ? (
                  <TicketDetail
                    ticket={selectedTicket}
                    currentAgent={currentAgent}
                    onTicketUpdated={handleTicketUpdated}
                    onRefresh={fetchTickets}
                  />
                ) : (
                  <div className="bg-white border border-slate-200 rounded-xl p-12 text-center text-slate-400 flex flex-col items-center justify-center h-[calc(100vh-180px)]">
                    <Inbox className="w-12 h-12 text-slate-300 mb-3" />
                    <h3 className="font-semibold text-slate-700">No ticket selected</h3>
                    <p className="text-xs text-slate-400 mt-1">Select a ticket from the left panel to begin work</p>
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        {/* Manager Analytics View */}
        {activeView === 'analytics' && <AnalyticsView />}

        {/* Customer Portal View */}
        {activeView === 'customer' && (
          <CustomerPortal
            tickets={tickets}
            onClose={() => setActiveView('agent')}
            onRefreshAll={fetchTickets}
          />
        )}
      </main>

      {/* New Ticket Modal */}
      <NewTicketModal
        isOpen={isNewTicketOpen}
        onClose={() => setIsNewTicketOpen(false)}
        onTicketCreated={(newTicket) => {
          setTickets((prev) => [newTicket, ...prev]);
          setSelectedTicketId(newTicket.id);
        }}
      />
    </div>
  );
}
