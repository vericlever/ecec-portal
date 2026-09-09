import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  MAX_QUALITY_AREAS,
  MAX_CHILD_SAFE_STANDARDS,
  type DocumentTagType,
} from "@/lib/tags";

type ServerClient = ReturnType<typeof createClient>;

type TagKind = "quality_area" | "child_safe_standard";

const TABLE: Record<TagKind, string> = {
  quality_area: "document_quality_areas",
  child_safe_standard: "document_child_safe_standards",
};
const TAG_COLUMN: Record<TagKind, string> = {
  quality_area: "quality_area_id",
  child_safe_standard: "standard_id",
};
const CAP: Record<TagKind, number> = {
  quality_area: MAX_QUALITY_AREAS,
  child_safe_standard: MAX_CHILD_SAFE_STANDARDS,
};
const CAP_LABEL: Record<TagKind, string> = {
  quality_area: "quality areas",
  child_safe_standard: "child safe standards",
};

// Attach or detach one tag on one document. The caller must already have
// verified the document belongs to `organisationId` and that the actor may edit
// content. Uses the admin client (writes bypass RLS); the DB cap trigger is the
// final backstop, and its raise is turned into a friendly error here.
export async function writeDocumentTag(opts: {
  kind: TagKind;
  documentType: DocumentTagType;
  documentId: string;
  organisationId: string;
  tagId: number;
  attach: boolean;
  actorId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const admin = createAdminClient();
  const table = TABLE[opts.kind];
  const col = TAG_COLUMN[opts.kind];

  if (!opts.attach) {
    const { error } = await admin
      .from(table)
      .delete()
      .eq("document_type", opts.documentType)
      .eq("document_id", opts.documentId)
      .eq(col, opts.tagId);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  }

  const { error } = await admin.from(table).insert({
    organisation_id: opts.organisationId,
    document_type: opts.documentType,
    document_id: opts.documentId,
    [col]: opts.tagId,
    created_by: opts.actorId,
  });
  if (error) {
    if (error.code === "23514" || error.message.includes("at most")) {
      return {
        ok: false,
        error: `A ${opts.documentType === "sop" ? "procedure" : "policy"} may have at most ${CAP[opts.kind]} ${CAP_LABEL[opts.kind]}.`,
      };
    }
    if (error.message.includes("duplicate")) return { ok: true };
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

export type DocumentTags = {
  qualityAreas: number[];
  childSafeStandards: number[];
};

const empty = (): DocumentTags => ({ qualityAreas: [], childSafeStandards: [] });

// Tags for one document (a policy or a SOP).
export async function documentTags(
  supabase: ServerClient,
  type: DocumentTagType,
  documentId: string,
): Promise<DocumentTags> {
  const map = await documentTagsFor(supabase, type, [documentId]);
  return map.get(documentId) ?? empty();
}

// Tags for a set of documents of one type (or every document of that type when
// ids is omitted). documentId -> { qualityAreas, childSafeStandards }.
export async function documentTagsFor(
  supabase: ServerClient,
  type: DocumentTagType,
  documentIds?: string[],
): Promise<Map<string, DocumentTags>> {
  if (documentIds && documentIds.length === 0) return new Map();

  let qa = supabase
    .from("document_quality_areas")
    .select("document_id, quality_area_id")
    .eq("document_type", type);
  let css = supabase
    .from("document_child_safe_standards")
    .select("document_id, standard_id")
    .eq("document_type", type);
  if (documentIds) {
    qa = qa.in("document_id", documentIds);
    css = css.in("document_id", documentIds);
  }

  const [{ data: qaRows }, { data: cssRows }] = await Promise.all([qa, css]);

  const out = new Map<string, DocumentTags>();
  const get = (id: string) => {
    let v = out.get(id);
    if (!v) {
      v = empty();
      out.set(id, v);
    }
    return v;
  };
  for (const r of qaRows ?? [])
    get(r.document_id as string).qualityAreas.push(r.quality_area_id as number);
  for (const r of cssRows ?? [])
    get(r.document_id as string).childSafeStandards.push(r.standard_id as number);
  return out;
}
