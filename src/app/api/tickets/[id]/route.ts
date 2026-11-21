import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const ticket = db.getTicketById(params.id);
    if (!ticket) {
      return NextResponse.json({ error: 'Ticket not found' }, { status: 404 });
    }
    return NextResponse.json({ ticket });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
