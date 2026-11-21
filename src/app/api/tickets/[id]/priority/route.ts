import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { Priority } from '@/types';

export const dynamic = 'force-dynamic';

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();
    const { priority, actorName, actorId } = body;

    if (!priority) {
      return NextResponse.json({ error: 'Priority is required' }, { status: 400 });
    }

    const result = db.updatePriority(params.id, priority as Priority, actorName || 'Agent', actorId);

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({ success: true, ticket: result.ticket });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
