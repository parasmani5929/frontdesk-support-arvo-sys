import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET() {
  try {
    const tickets = db.getTickets();
    const total = tickets.length;
    const active = tickets.filter((t) => t.status !== 'DONE' && t.status !== 'CLOSED_AUTO');
    const lateTickets = active.filter((t) => t.sla.isFirstResponseBreached || t.sla.isResolutionBreached);
    const waitingOnCustomer = active.filter((t) => t.status === 'WAITING_ON_CUSTOMER');
    const urgentTickets = active.filter((t) => t.priority === 'URGENT');
    const resolved = tickets.filter((t) => t.status === 'DONE');

    // Breach rate
    const breachRate = active.length > 0 ? Math.round((lateTickets.length / active.length) * 100) : 0;

    // Detailed report of why each late ticket is delayed
    const delayedBreakdown = lateTickets.map((t) => {
      const internalNotes = (t.messages || []).filter((m) => m.type === 'INTERNAL_NOTE');
      const latestInternalNote = internalNotes.length > 0 ? internalNotes[internalNotes.length - 1].content : 'No blocker reason documented';
      return {
        id: t.id,
        ticketNumber: t.ticketNumber,
        title: t.title,
        priority: t.priority,
        customerName: t.customerName,
        assignedToName: t.assignedToName || 'Unassigned',
        firstResponseBreached: t.sla.isFirstResponseBreached,
        resolutionBreached: t.sla.isResolutionBreached,
        minutesOverdue: Math.abs(Math.min(t.sla.firstResponseRemainingMinutes, t.sla.resolutionRemainingMinutes)),
        internalBlockerReason: latestInternalNote,
      };
    });

    return NextResponse.json({
      summary: {
        totalTickets: total,
        activeTickets: active.length,
        lateTickets: lateTickets.length,
        breachRatePercent: breachRate,
        waitingOnCustomerTickets: waitingOnCustomer.length,
        urgentTickets: urgentTickets.length,
        resolvedTickets: resolved.length,
      },
      delayedBreakdown,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
