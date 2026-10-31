import { OpenClubRegistration } from "./OpenClubRegistration";

export function MembershipUnavailableNotice({ club, pending = false, failed = false }: {
  club?: { id?: string; name: string; subdomain?: string | null; email?: string | null; phone?: string | null } | null;
  pending?: boolean;
  failed?: boolean;
}) {
  return (
    <div role="status" className="rounded-md border border-border bg-background p-3 text-left text-xs text-foreground space-y-2">
      <p className="font-semibold">{pending ? "Checking membership applications…" : "Apply directly to the club"}</p>
      {!pending && <>
        <p className="text-muted-foreground">
          {failed
            ? "We cannot confirm whether this club accepts applications through SquashHub right now."
            : `${club?.name || "This club"} is not yet fully subscribed to SquashHub, so new membership applications are unavailable here.`}
          {" "}Please apply through the club’s own website or contact the club directly.
        </p>
        {(club?.email || club?.phone) && <p className="break-words">
          {club.email && <a className="text-primary underline" href={`mailto:${club.email}`}>{club.email}</a>}
          {club.email && club.phone && " · "}
          {club.phone && <a className="text-primary underline" href={`tel:${club.phone}`}>{club.phone}</a>}
        </p>}
        {!failed && club?.id && <OpenClubRegistration club={{ ...club, id: club.id }} />}
      </>}
    </div>
  );
}