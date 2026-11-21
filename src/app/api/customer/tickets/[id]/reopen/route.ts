import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();
    const { reason, customerName } = body;

    if (!reason) {
      return NextResponse.json({ error: 'Please provide a reason for reopening this ticket' }, { status: 400 });
    }

    const ticket = db.getTicketById(params.id);
    if (!ticket) {
      return NextResponse.json({ error: 'Ticket not found' }, { status: 404 });
    }

    const result = db.customerReopenTicket(ticket.id, reason, customerName || ticket.customerName);

    if (!result.success) {
      // 403 Forbidden with exact explanation why reopening is disallowed
      return NextResponse.json({ error: result.error }, { status: 403 });
    }

    const updatedCustomerView = db.getCustomerTicketView(ticket.id);
    return NextResponse.json({ success: true, ticket: updatedCustomerView });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
