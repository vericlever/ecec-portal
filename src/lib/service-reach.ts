// A person's service reach: their home service (profiles.service_id), every
// service if all_services is set, or an explicit extra assignment in
// staff_service_assignments (migration 0093). Mirrors the database's
// reaches_service() exactly, for the application-code call sites that can't
// go through RLS directly (contracts_write's can_verify branch does use the
// database function; these are the TS-side equivalents of the same idea).

export type ServiceReach = {
  service_id: string | null;
  all_services: boolean;
  service_ids: string[];
};

function inReach(person: ServiceReach, serviceId: string): boolean {
  return (
    person.all_services ||
    person.service_id === serviceId ||
    person.service_ids.includes(serviceId)
  );
}

// Does `viewer` reach `targetServiceId` (someone else's record)? A null
// target (unassigned) is never reached by a non-admin - matches
// profiles_select's own "service_id is null" carve-out, which this does not
// change.
export function reachesService(
  viewer: ServiceReach,
  targetServiceId: string | null,
): boolean {
  return targetServiceId !== null && inReach(viewer, targetServiceId);
}

// Does a policy/SOP scoped to `contentServiceId` (null = every service)
// apply to `person`? Opposite null handling from reachesService: null on the
// content side means organisation-wide, not "unassigned".
export function contentAppliesToPerson(
  contentServiceId: string | null,
  person: ServiceReach,
): boolean {
  return contentServiceId === null || inReach(person, contentServiceId);
}
