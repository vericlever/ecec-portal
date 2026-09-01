import { getProfile, isAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  buildRegisterGrid,
  gridToCsv,
  workersToJson,
  NQAITS_SHEET_NAME,
  type ExportCredential,
  type ExportQualification,
  type ExportTraining,
  type ExportWorker,
} from "@/lib/nqaits-export";
import { sheetToXlsx } from "@/lib/xlsx-writer";
import type { TrainingType } from "@/lib/nqaits";

function group<T extends { profile_id: string }>(rows: T[]): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const r of rows) {
    const list = m.get(r.profile_id) ?? [];
    list.push(r);
    m.set(r.profile_id, list);
  }
  return m;
}

function safeFilePart(s: string): string {
  return s.replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^_+|_+$/g, "") || "service";
}

export async function GET(req: Request) {
  const me = await getProfile();
  if (!me || !isAdmin(me.access_tier) || !me.organisation_id) {
    return new Response("Forbidden", { status: 403 });
  }

  const url = new URL(req.url);
  const serviceId = url.searchParams.get("service");
  const format = (url.searchParams.get("format") ?? "xlsx").toLowerCase();
  if (!serviceId) return new Response("Missing service parameter", { status: 400 });
  if (!["xlsx", "csv", "json"].includes(format)) {
    return new Response("Unknown format", { status: 400 });
  }

  const supabase = createClient();

  const { data: service } = await supabase
    .from("services")
    .select("id, name, service_type, organisation_id")
    .eq("id", serviceId)
    .maybeSingle();
  if (!service || service.organisation_id !== me.organisation_id) {
    return new Response("Unknown service", { status: 404 });
  }

  const { data: org } = await supabase
    .from("organisations")
    .select("name")
    .eq("id", me.organisation_id)
    .maybeSingle();

  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, email")
    .eq("service_id", serviceId)
    .eq("is_active", true);

  const ids = (profiles ?? []).map((p) => p.id as string);
  const emailById = new Map(
    (profiles ?? []).map((p) => [p.id as string, p.email as string]),
  );

  let wd: Record<string, unknown>[] = [];
  let wwcc: (ExportCredential & { profile_id: string })[] = [];
  let teacher: (ExportCredential & { profile_id: string })[] = [];
  let quals: (ExportQualification & { profile_id: string })[] = [];
  let training: (ExportTraining & { profile_id: string })[] = [];

  if (ids.length) {
    const [a, b, c, d, e] = await Promise.all([
      supabase.from("worker_details").select("*").in("profile_id", ids),
      supabase.from("wwcc_checks").select("*").in("profile_id", ids),
      supabase.from("teacher_registrations").select("*").in("profile_id", ids),
      supabase.from("qualifications").select("*").in("profile_id", ids),
      supabase.from("training_records").select("*").in("profile_id", ids),
    ]);
    wd = (a.data ?? []) as Record<string, unknown>[];
    wwcc = (b.data ?? []) as typeof wwcc;
    teacher = (c.data ?? []) as typeof teacher;
    quals = (d.data ?? []) as typeof quals;
    training = (e.data ?? []) as typeof training;
  }

  const wdById = new Map(wd.map((r) => [r.profile_id as string, r]));
  const wwccBy = group(wwcc);
  const teacherBy = group(teacher);
  const qualsBy = group(quals);
  const trainingBy = group(training);

  const byExpiryDesc = (a: ExportCredential, b: ExportCredential) =>
    (b.expiry_date ?? "").localeCompare(a.expiry_date ?? "");

  const workers: ExportWorker[] = ids
    // Skip accounts that have never started onboarding - there is nothing to
    // put on the register for them, and a name-less row would fail NQAITS.
    .filter((id) => wdById.has(id))
    .map((id) => ({
      email: emailById.get(id) ?? "",
      wd: wdById.get(id) ?? null,
      wwcc: (wwccBy.get(id) ?? []).slice().sort(byExpiryDesc),
      teacher: (teacherBy.get(id) ?? []).slice().sort(byExpiryDesc),
      qualifications: (qualsBy.get(id) ?? []) as ExportQualification[],
      training: (trainingBy.get(id) ?? []) as (ExportTraining & {
        training_type: TrainingType;
      })[],
    }));

  // Order by last name then first name, so the file reads like a staff list.
  workers.sort((a, b) => {
    const an = `${a.wd?.last_name ?? ""} ${a.wd?.first_name ?? ""}`.trim().toLowerCase();
    const bn = `${b.wd?.last_name ?? ""} ${b.wd?.first_name ?? ""}`.trim().toLowerCase();
    return an.localeCompare(bn) || a.email.localeCompare(b.email);
  });

  const serviceLabel = `${org?.name ?? ""} - ${service.name}`.trim();
  const serviceType = service.service_type === "FDC" ? "FDC" : "CBC";
  const stamp = new Date().toISOString().slice(0, 10);
  const base = `WorkerRegister_${safeFilePart(service.name)}_${stamp}`;

  if (format === "json") {
    return new Response(
      JSON.stringify(
        {
          service_type: serviceType,
          service_name: serviceLabel,
          workers: workersToJson(workers),
        },
        null,
        2,
      ),
      {
        headers: {
          "content-type": "application/json; charset=utf-8",
          "content-disposition": `attachment; filename="${base}.json"`,
        },
      },
    );
  }

  const grid = buildRegisterGrid(serviceType, serviceLabel, workers);

  if (format === "csv") {
    return new Response(gridToCsv(grid), {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="${base}.csv"`,
      },
    });
  }

  const xlsx = sheetToXlsx(NQAITS_SHEET_NAME, grid);
  const body = xlsx.buffer.slice(
    xlsx.byteOffset,
    xlsx.byteOffset + xlsx.byteLength,
  ) as ArrayBuffer;
  return new Response(body, {
    headers: {
      "content-type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="${base}.xlsx"`,
    },
  });
}
