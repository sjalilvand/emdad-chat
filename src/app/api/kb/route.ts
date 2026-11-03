import { NextRequest } from 'next/server';
import { getKbStatus, refreshEmdadPages } from '@/lib/kb';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET() {
  const status = await getKbStatus();
  return Response.json(status);
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { force?: boolean };
  const results = await refreshEmdadPages(body.force === true);
  const status = await getKbStatus();
  return Response.json({ ok: results.some((r) => r.ok), results, status });
}
