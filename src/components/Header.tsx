'use client';

import React from 'react';
import { Agent } from '@/types';
import { ShieldAlert, Clock, User, BarChart3, HelpCircle, Plus } from 'lucide-react';

interface HeaderProps {
  agents: Agent[];
  currentAgent: Agent | null;
  onSelectAgent: (agent: Agent) => void;
  activeView: 'agent' | 'analytics' | 'customer';
  onChangeView: (view: 'agent' | 'analytics' | 'customer') => void;
  onOpenNewTicket: () => void;
}

export function Header({
  agents,
  currentAgent,
  onSelectAgent,
  activeView,
  onChangeView,
  onOpenNewTicket,
}: HeaderProps) {
  return (
    <header className="border-b border-slate-200 bg-white sticky top-0 z-30 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo & Platform Title */}
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-lg bg-sky-600 flex items-center justify-center text-white font-bold text-xl shadow-sm">
              F
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-bold text-lg text-slate-900 tracking-tight">Frontdesk</span>
                <span className="text-xs font-semibold px-2 py-0.5 rounded bg-sky-100 text-sky-800">
                  Arvo Systems
                </span>
              </div>
              <p className="text-xs text-slate-500">Working Hours SLA Engine &bull; Concurrency Protected</p>
            </div>
          </div>

          {/* Business Schedule Status Indicator */}
          <div className="hidden md:flex items-center space-x-2 px-3 py-1.5 rounded-full bg-slate-100 text-xs text-slate-700 border border-slate-200">
            <Clock className="w-3.5 h-3.5 text-sky-600" />
            <span>Business Hours: <strong>9:30 AM – 6:30 PM</strong> (Mon – Fri)</span>
          </div>

          {/* View Switchers & Agent Persona Toggle */}
          <div className="flex items-center space-x-3">
            {/* Nav Tabs */}
            <div className="flex items-center rounded-lg bg-slate-100 p-1 border border-slate-200 text-xs font-medium">
              <button
                onClick={() => onChangeView('agent')}
                className={`px-3 py-1.5 rounded-md transition-colors ${
                  activeView === 'agent'
                    ? 'bg-white text-sky-700 shadow-sm font-semibold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Agent Console
              </button>
              <button
                onClick={() => onChangeView('analytics')}
                className={`flex items-center space-x-1 px-3 py-1.5 rounded-md transition-colors ${
                  activeView === 'analytics'
                    ? 'bg-white text-sky-700 shadow-sm font-semibold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <BarChart3 className="w-3.5 h-3.5" />
                <span>Manager Report</span>
              </button>
              <button
                onClick={() => onChangeView('customer')}
                className={`flex items-center space-x-1 px-3 py-1.5 rounded-md transition-colors ${
                  activeView === 'customer'
                    ? 'bg-white text-sky-700 shadow-sm font-semibold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <HelpCircle className="w-3.5 h-3.5" />
                <span>Customer Portal</span>
              </button>
            </div>

            {/* Agent Persona Switcher */}
            <div className="flex items-center space-x-1.5 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1 text-xs">
              <User className="w-3.5 h-3.5 text-slate-500" />
              <span className="text-slate-500 hidden sm:inline">Active Agent:</span>
              <select
                value={currentAgent?.id || ''}
                onChange={(e) => {
                  const ag = agents.find((a) => a.id === e.target.value);
                  if (ag) onSelectAgent(ag);
                }}
                className="bg-transparent font-medium text-slate-800 text-xs outline-none cursor-pointer"
              >
                {agents.map((ag) => (
                  <option key={ag.id} value={ag.id}>
                    {ag.name} ({ag.role === 'SUPPORT_LEAD' ? 'Lead' : 'Agent'})
                  </option>
                ))}
              </select>
            </div>

            {/* New Ticket Button */}
            <button
              onClick={onOpenNewTicket}
              className="flex items-center space-x-1 bg-sky-600 hover:bg-sky-700 text-white px-3 py-1.5 rounded-lg text-xs font-semibold shadow-sm transition"
            >
              <Plus className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">New Ticket</span>
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
