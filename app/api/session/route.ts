import { errorResponse, isOversight, requireHubActor } from "@/lib/hub";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const actor = await requireHubActor(request);
    return Response.json({ actor, oversight: isOversight(actor), signOut: "/signout-with-chatgpt?return_to=/" });
  } catch (error) { return errorResponse(error); }
}
