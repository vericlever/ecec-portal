import { type NextRequest, NextResponse } from "next/server";
import { getProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

// Autocomplete for the RTO number and course code fields. Reads the local
// mirror of training.gov.au (rto_registry / training_components), never a live
// external call.
export async function GET(request: NextRequest) {
  const me = await getProfile();
  if (!me) return NextResponse.json({ results: [] }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type");
  const q = (searchParams.get("q") ?? "").trim();
  const kind = searchParams.get("kind"); // optional component_type filter

  if (q.length < 2) return NextResponse.json({ results: [] });

  const like = `%${q.replace(/[%_]/g, "")}%`;
  const supabase = createClient();

  if (type === "rto") {
    const { data } = await supabase
      .from("rto_registry")
      .select("code, legal_name, trading_name, status")
      .or(`code.ilike.${like},legal_name.ilike.${like},trading_name.ilike.${like}`)
      .limit(10);
    return NextResponse.json({
      results: (data ?? []).map((r) => ({
        code: r.code,
        name: r.legal_name,
        secondary: r.trading_name && r.trading_name !== r.legal_name ? r.trading_name : null,
        status: r.status,
      })),
    });
  }

  if (type === "component") {
    let query = supabase
      .from("training_components")
      .select("code, title, component_type, status")
      .or(`code.ilike.${like},title.ilike.${like}`)
      .limit(10);
    if (kind) query = query.eq("component_type", kind);
    const { data } = await query;
    return NextResponse.json({
      results: (data ?? []).map((r) => ({
        code: r.code,
        name: r.title,
        secondary: r.component_type,
        status: r.status,
      })),
    });
  }

  return NextResponse.json({ results: [] }, { status: 400 });
}
