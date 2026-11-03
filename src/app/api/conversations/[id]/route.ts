import { NextRequest } from 'next/server';
import { db } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const conversation = await db.conversation.findUnique({
    where: { id },
    include: { messages: { orderBy: { createdAt: 'asc' } } },
  });
  if (!conversation) {
    return Response.json({ error: 'گفتگو یافت نشد' }, { status: 404 });
  }
  return Response.json({
    id: conversation.id,
    title: conversation.title,
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt,
    messages: conversation.messages.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      thinking: m.thinking || '',
      sources: m.sources ? JSON.parse(m.sources) : [],
      model: m.model,
      hasImage: m.hasImage,
      createdAt: m.createdAt,
    })),
  });
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  try {
    await db.conversation.delete({ where: { id } });
    return Response.json({ ok: true });
  } catch {
    return Response.json({ error: 'گفتگو یافت نشد' }, { status: 404 });
  }
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as { title?: string };
  if (!body.title || !body.title.trim()) {
    return Response.json({ error: 'عنوان نامعتبر است' }, { status: 400 });
  }
  const updated = await db.conversation.update({
    where: { id },
    data: { title: body.title.trim().slice(0, 100) },
  });
  return Response.json({ ok: true, title: updated.title });
}
