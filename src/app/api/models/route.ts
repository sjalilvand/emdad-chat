import { listModels, getOllamaBaseUrl } from '@/lib/ollama';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const result = await listModels();
  return Response.json({
    ok: result.ok,
    models: result.models,
    error: result.error,
    baseUrl: getOllamaBaseUrl(),
    mock: process.env.MOCK_LLM === 'true',
  });
}
