import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { Priority, TicketStatus } from '@/types';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const filter = searchParams.get('filter'); // 'late' | 'waiting' | 'my' | 'unassigned' | 'urgent'
    const agentId = searchParams.get('agentId');
    const priority = searchParams.get('priority') as Priority | null;
    const status = searchParams.get('status') as TicketStatus | null;

    let tickets = db.getTickets();

    if (filter === 'late') {
      tickets = tickets.filter(
        (t) => t.status !== 'DONE' && t.status !== 'CLOSED_AUTO' && (t.sla.isFirstResponseBreached || t.sla.isResolutionBreached)
      );
    } else if (filter === 'waiting') {
      tickets = tickets.filter((t) => t.status === 'WAITING_ON_CUSTOMER');
    } else if (filter === 'my' && agentId) {
      tickets = tickets.filter((t) => t.assignedToId === agentId);
    } else if (filter === 'unassigned') {
      tickets = tickets.filter((t) => !t.assignedToId);
    } else if (filter === 'urgent') {
      tickets = tickets.filter((t) => t.priority === 'URGENT');
    }

    if (priority) {
      tickets = tickets.filter((t) => t.priority === priority);
    }

    if (status) {
      tickets = tickets.filter((t) => t.status === status);
    }

    return NextResponse.json({ tickets });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { title, description, priority, customerName, customerEmail, companyName, actorType, actorName } = body;

    if (!title || !description || !priority || !customerName || !customerEmail) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const ticket = db.createTicket({
      title,
      description,
      priority,
      customerName,
      customerEmail,
      companyName,
      actorType: actorType || 'CUSTOMER',
      actorName: actorName || customerName,
    });

    return NextResponse.json({ ticket }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
