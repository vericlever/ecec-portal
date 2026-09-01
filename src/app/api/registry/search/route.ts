import { type NextRequest, NextResponse } from "next/server";
import { getProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

// Autocomplete for the RTO number and course code fields. Reads the local
// mirror of training.gov.au (rto_registry / training_components) through
// search functions that take the term as a bound parameter, so punctuation in
// the term - "(Victoria)", commas, "Pty Ltd" - is matched literally rather than
// breaking the query. Never a live external call.
export async function GET(request: NextRequest) {
  const me = await getProfile();
  if (!me) return NextResponse.json({ results: [] }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type");
  const q = (searchParams.get("q") ?? "").trim();
  const kind = searchParams.get("kind"); // optional component_type filter

  if (q.length < 2) return NextResponse.json({ results: [] });

  const supabase = createClient();

  if (type === "rto") {
    const { data } = await supabase.rpc("search_rto_registry", { q });
    return NextResponse.json({
      results: (data ?? []).map(
        (r: {
          code: string;
          legal_name: string;
          trading_name: string | null;
          status: string | null;
        }) => ({
          code: r.code,
          name: r.legal_name,
          secondary:
            r.trading_name && r.trading_name !== r.legal_name
              ? r.trading_name
              : null,
          status: r.status,
        }),
      ),
    });
  }

  if (type === "component") {
    const { data } = await supabase.rpc("search_training_components", {
      q,
      kind: kind || null,
    });
    return NextResponse.json({
      results: (data ?? []).map(
        (r: {
          code: string;
          title: string;
          component_type: string;
          status: string | null;
        }) => ({
          code: r.code,
          name: r.title,
          secondary: r.component_type,
          status: r.status,
        }),
      ),
    });
  }

  return NextResponse.json({ results: [] }, { status: 400 });
}
