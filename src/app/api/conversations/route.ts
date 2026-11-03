import { NextRequest } from 'next/server';
import { db } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const conversations = await db.conversation.findMany({
    orderBy: { updatedAt: 'desc' },
    include: { messages: { orderBy: { createdAt: 'asc' } } },
  });
  return Response.json({
    conversations: conversations.map((c) => ({
      id: c.id,
      title: c.title,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
      messageCount: c.messages.length,
      preview: c.messages[0]?.content?.slice(0, 80) || '',
    })),
  });
}

export async function DELETE() {
  await db.message.deleteMany({});
  await db.conversation.deleteMany({});
  return Response.json({ ok: true });
}
