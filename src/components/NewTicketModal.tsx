'use client';

import React, { useState } from 'react';
import { Priority, Ticket } from '@/types';
import { X, Flame, AlertCircle } from 'lucide-react';

interface NewTicketModalProps {
  isOpen: boolean;
  onClose: () => void;
  onTicketCreated: (ticket: Ticket) => void;
}

export function NewTicketModal({ isOpen, onClose, onTicketCreated }: NewTicketModalProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<Priority>('MEDIUM');
  const [customerName, setCustomerName] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const res = await fetch('/api/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          description,
          priority,
          customerName,
          customerEmail,
          companyName,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to create ticket');
      } else {
        onTicketCreated(data.ticket);
        onClose();
        // Reset form
        setTitle('');
        setDescription('');
        setCustomerName('');
        setCustomerEmail('');
        setCompanyName('');
      }
    } catch (err: any) {
      setError(err.message || 'Network error');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-lg w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div>
            <h3 className="font-bold text-slate-900">Create New Support Problem Ticket</h3>
            <p className="text-xs text-slate-500">SLA will be automatically calculated according to Arvo working hours policy</p>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="m-4 p-3 rounded-lg bg-red-50 border border-red-200 flex items-center space-x-2 text-xs text-red-800">
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="p-5 space-y-4 text-xs">
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Problem Title</label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Cannot process credit card transactions"
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs focus:ring-2 focus:ring-sky-500 outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Customer Name</label>
              <input
                type="text"
                required
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="e.g. Sarah Jenkins"
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs focus:ring-2 focus:ring-sky-500 outline-none"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Customer Email</label>
              <input
                type="email"
                required
                value={customerEmail}
                onChange={(e) => setCustomerEmail(e.target.value)}
                placeholder="sarah@client.com"
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs focus:ring-2 focus:ring-sky-500 outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Company / Organization</label>
            <input
              type="text"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              placeholder="e.g. Acme Health Corp"
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs focus:ring-2 focus:ring-sky-500 outline-none"
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Severity / SLA Tier</label>
            <div className="grid grid-cols-3 gap-2">
              <label
                className={`border rounded-lg p-2.5 cursor-pointer text-center transition ${
                  priority === 'URGENT'
                    ? 'border-red-500 bg-red-50 text-red-900 font-bold ring-2 ring-red-400'
                    : 'border-slate-200 hover:bg-slate-50'
                }`}
              >
                <input
                  type="radio"
                  name="priority"
                  value="URGENT"
                  checked={priority === 'URGENT'}
                  onChange={() => setPriority('URGENT')}
                  className="sr-only"
                />
                <div className="flex items-center justify-center space-x-1 mb-0.5">
                  <Flame className="w-3.5 h-3.5 text-red-600" />
                  <span>URGENT</span>
                </div>
                <p className="text-[10px] text-slate-500 font-normal">Cannot work at all (2h reply, same day fix)</p>
              </label>

              <label
                className={`border rounded-lg p-2.5 cursor-pointer text-center transition ${
                  priority === 'MEDIUM'
                    ? 'border-amber-500 bg-amber-50 text-amber-900 font-bold ring-2 ring-amber-400'
                    : 'border-slate-200 hover:bg-slate-50'
                }`}
              >
                <input
                  type="radio"
                  name="priority"
                  value="MEDIUM"
                  checked={priority === 'MEDIUM'}
                  onChange={() => setPriority('MEDIUM')}
                  className="sr-only"
                />
                <div className="font-semibold mb-0.5">MEDIUM</div>
                <p className="text-[10px] text-slate-500 font-normal">Standard issue (4.5h reply, 3 days fix)</p>
              </label>

              <label
                className={`border rounded-lg p-2.5 cursor-pointer text-center transition ${
                  priority === 'SMALL'
                    ? 'border-sky-500 bg-sky-50 text-sky-900 font-bold ring-2 ring-sky-400'
                    : 'border-slate-200 hover:bg-slate-50'
                }`}
              >
                <input
                  type="radio"
                  name="priority"
                  value="SMALL"
                  checked={priority === 'SMALL'}
                  onChange={() => setPriority('SMALL')}
                  className="sr-only"
                />
                <div className="font-semibold mb-0.5">SMALL</div>
                <p className="text-[10px] text-slate-500 font-normal">Question / Request (1 day reply, 1 week fix)</p>
              </label>
            </div>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Problem Description</label>
            <textarea
              required
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe the issue in detail..."
              className="w-full border border-slate-300 rounded-lg p-2.5 text-xs focus:ring-2 focus:ring-sky-500 outline-none"
            />
          </div>

          <div className="pt-2 border-t border-slate-200 flex items-center justify-end space-x-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-slate-600 hover:bg-slate-100 font-semibold transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2 rounded-lg bg-sky-600 hover:bg-sky-700 text-white font-bold shadow-sm transition disabled:opacity-50"
            >
              {isSubmitting ? 'Creating...' : 'Create Ticket'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
