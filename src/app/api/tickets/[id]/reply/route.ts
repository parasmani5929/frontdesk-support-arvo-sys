import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();
    const { senderType, senderId, senderName, type, content } = body;

    if (!content || !type || !senderName) {
      return NextResponse.json({ error: 'Missing required message parameters' }, { status: 400 });
    }

    if (type !== 'PUBLIC_REPLY' && type !== 'INTERNAL_NOTE') {
      return NextResponse.json({ error: 'Invalid message type' }, { status: 400 });
    }

    const result = db.addMessage({
      ticketId: params.id,
      senderType: senderType || 'AGENT',
      senderId,
      senderName,
      type,
      content,
    });

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    const updatedTicket = db.getTicketById(params.id);
    return NextResponse.json({ success: true, message: result.message, ticket: updatedTicket });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
