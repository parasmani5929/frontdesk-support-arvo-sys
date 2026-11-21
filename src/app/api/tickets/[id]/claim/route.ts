import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();
    const { agentId, version } = body;

    if (!agentId) {
      return NextResponse.json({ error: 'Agent ID is required' }, { status: 400 });
    }

    const result = db.claimTicket(params.id, agentId, version);

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 409 }); // HTTP 409 Conflict
    }

    return NextResponse.json({ success: true, ticket: result.ticket });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
