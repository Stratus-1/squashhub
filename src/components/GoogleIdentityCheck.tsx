import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { rpcExt } from "@/lib/supabase-ext";
import { useAuth } from "@/contexts/AuthContext";
import { useClubContext } from "@/contexts/ClubContext";
import { useMyClub } from "@/hooks/use-club";
import {
  decideGoogleIdentity,
  googleNameOf,
  isGoogleSignIn,
  type GoogleIdentityQuestion,
} from "@/lib/google-identity-check";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

/**
 * A Google sign-in arrives with nothing but a name and an email, and either can
 * belong to somebody else — most often when a person picks the wrong Google
 * account. Once per account per club per browser session, the app asks instead
 * of assuming: "is that you?", or "is this a new application?". Nothing is ever
 * blocked — the person always gets the last word.
 *
 * The member list is only read through check_member_duplicate_hint, which
 * returns masked names and never emails or phone numbers.
 */
const askedKey = (userId: string, clubId: string) =>
  `sh.google_identity_checked.${userId}.${clubId}`;

type HintRow = { match_kind: string; masked_name: string | null };

export function GoogleIdentityCheck() {
  const { user } = useAuth();
  const { club } = useClubContext();
  const { data: mine, isPending: minePending } = useMyClub();
  const navigate = useNavigate();
  const asked = useRef(false);
  const [question, setQuestion] = useState<GoogleIdentityQuestion>("none");
  const [notYou, setNotYou] = useState(false);
  const [googleName, setGoogleName] = useState("");
  const [foundName, setFoundName] = useState("");

  const clubId = club?.id;

  useEffect(() => {
    if (asked.current || !user?.id || !clubId || minePending) return;
    if (!isGoogleSignIn(user.app_metadata)) return;
    try {
      if (sessionStorage.getItem(askedKey(user.id, clubId))) return;
    } catch {
      /* private mode: ask anyway, once */
    }
    const name = googleNameOf(user.user_metadata);
    if (!name && !user.email) return;
    asked.current = true;
    setGoogleName(name);

    let active = true;
    (async () => {
      const { data, error } = await rpcExt("check_member_duplicate_hint", {
        _club_id: clubId,
        _name: name || null,
        _email: user.email || null,
      });
      if (!active || error) return;
      const rows = (data ?? []) as HintRow[];
      const answer = decideGoogleIdentity({
        providerIsGoogle: true,
        alreadyLinked: !!mine?.membership,
        emailMatchesMember: rows.some((r) => r.match_kind === "email"),
        nameMatchesMember: rows.some((r) => r.match_kind === "name"),
      });
      if (answer === "none") {
        try {
          sessionStorage.setItem(askedKey(user.id, clubId), "1");
        } catch {
          /* ignore */
        }
        return;
      }
      setFoundName(rows.find((r) => r.masked_name)?.masked_name || name);
      setQuestion(answer);
    })();

    return () => {
      active = false;
    };
  }, [user, clubId, mine, minePending]);

  if (!user || !club || question === "none") return null;

  const clubName = club.name || "this club";

  const markAsked = () => {
    try {
      sessionStorage.setItem(askedKey(user.id, club.id), "1");
    } catch {
      /* ignore */
    }
  };

  const close = () => {
    markAsked();
    setQuestion("none");
    setNotYou(false);
  };

  const useAnotherAccount = async () => {
    markAsked();
    setQuestion("none");
    setNotYou(false);
    await supabase.auth.signOut();
    toast("Choose the Google account your club has on file.");
    navigate("/auth", { replace: true });
  };

  const applyAsNewMember = () => {
    markAsked();
    try {
      sessionStorage.setItem("sh.open_membership_wizard", "1");
    } catch {
      /* ignore */
    }
    setQuestion("none");
    navigate("/", { replace: true });
  };

  return (
    <AlertDialog open onOpenChange={(o) => { if (!o) close(); }}>
      <AlertDialogContent>
        {notYou ? (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle>Don't you have another Google account?</AlertDialogTitle>
              <AlertDialogDescription>
                The account you just used isn't the one {clubName} holds for you. If your club
                has a different email address on file, sign in with that Google account instead
                so your membership and match history stay together.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="flex-col gap-2 sm:flex-col">
              <Button onClick={useAnotherAccount}>Use a different Google account</Button>
              <Button variant="outline" onClick={close}>
                Continue with this account anyway
              </Button>
            </AlertDialogFooter>
          </>
        ) : question === "is_that_you" ? (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle>Wait — is this you?</AlertDialogTitle>
              <AlertDialogDescription>
                You signed in with Google as <strong className="text-foreground">{googleName}</strong>,
                and {clubName} already has <strong className="text-foreground">{foundName}</strong> on
                its member list. Is that you?
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="flex-col gap-2 sm:flex-col">
              <Button onClick={close}>Yes, that's me</Button>
              <Button variant="outline" onClick={() => setNotYou(true)}>
                No, that's not me
              </Button>
            </AlertDialogFooter>
          </>
        ) : (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle>Is this a new membership application?</AlertDialogTitle>
              <AlertDialogDescription>
                We can't find <strong className="text-foreground">{googleName || "this name"}</strong>{" "}
                on {clubName}'s member list. Are you applying to join as a new member?
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="flex-col gap-2 sm:flex-col">
              <Button onClick={applyAsNewMember}>Yes, apply for membership</Button>
              <Button variant="outline" onClick={() => setNotYou(true)}>
                No, that's not me
              </Button>
            </AlertDialogFooter>
          </>
        )}
      </AlertDialogContent>
    </AlertDialog>
  );
}
