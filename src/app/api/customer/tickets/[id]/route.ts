import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * Customer Ticket View Endpoint (Strictly Enforces Problem INC-0304 Resolution)
 * "Private team notes must never be shown to a customer. Not on a screen.
 * Not in an API response. Not in an export. Not in a list."
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const customerView = db.getCustomerTicketView(params.id);
    if (!customerView) {
      return NextResponse.json({ error: 'Ticket not found' }, { status: 404 });
    }

    // Double check sanity: Ensure no internal note can ever pass through
    const safeMessages = customerView.messages.filter((m) => m.type === 'PUBLIC_REPLY');
    const responsePayload = {
      ...customerView,
      messages: safeMessages,
    };

    return NextResponse.json({ ticket: responsePayload });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
