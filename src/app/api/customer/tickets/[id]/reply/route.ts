import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();
    const { content, customerName } = body;

    if (!content) {
      return NextResponse.json({ error: 'Reply content is required' }, { status: 400 });
    }

    const ticket = db.getTicketById(params.id);
    if (!ticket) {
      return NextResponse.json({ error: 'Ticket not found' }, { status: 404 });
    }

    const result = db.addMessage({
      ticketId: ticket.id,
      senderType: 'CUSTOMER',
      senderName: customerName || ticket.customerName,
      type: 'PUBLIC_REPLY',
      content,
    });

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    const updatedCustomerView = db.getCustomerTicketView(ticket.id);
    return NextResponse.json({ success: true, ticket: updatedCustomerView });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
