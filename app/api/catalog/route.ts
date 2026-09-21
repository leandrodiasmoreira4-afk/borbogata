import { getCatalog } from "../../../lib/catalog/repository";

export const dynamic = "force-dynamic";

export async function GET() {
  const result = await getCatalog();
  return Response.json(result, { status: result.error ? 503 : 200 });
}
