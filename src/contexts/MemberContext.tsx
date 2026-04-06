import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useClubContext } from "@/contexts/ClubContext";
import { useMyClub } from "@/hooks/use-club";
import { fromExt } from "@/lib/supabase-ext";

export interface LinkedMember {
  id: string;
  name: string | null;
  email: string | null;
  club_member_number: string | null;
  gender: string | null;
  user_id: string | null;
}

interface MemberContextType {
  /** Members sharing the current user's email (family accounts) */
  linkedMembers: LinkedMember[];
  /** All club members (only populated for club admins) */
  allMembers: LinkedMember[];
  /** Whether user is club admin */
  isAdmin: boolean;
  /** The currently active/viewed member */
  activeMember: LinkedMember | null;
  /** The user_id to use for data queries — active member's user_id or auth user id */
  effectiveUserId: string | null;
  /** Whether viewing as another member (admin impersonation) */
  isViewingAs: boolean;
  /** Switch to a different member */
  switchMember: (memberId: string) => void;
  /** Reset back to own profile */
  resetToSelf: () => void;
  isLoading: boolean;
}

const MemberContext = createContext<MemberContextType>({
  linkedMembers: [],
  allMembers: [],
  isAdmin: false,
  activeMember: null,
  effectiveUserId: null,
  isViewingAs: false,
  switchMember: () => {},
  resetToSelf: () => {},
  isLoading: false,
});

export function MemberProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { club: contextClub } = useClubContext();
  const { data: myClubData } = useMyClub();
  const club = contextClub || myClubData?.club || null;
  const [linkedMembers, setLinkedMembers] = useState<LinkedMember[]>([]);
  const [allMembers, setAllMembers] = useState<LinkedMember[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [activeMemberId, setActiveMemberId] = useState<string | null>(null);
  const [selfMemberId, setSelfMemberId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!user?.id || !club?.id) {
      setLinkedMembers([]);
      setAllMembers([]);
      setIsAdmin(false);
      setActiveMemberId(null);
      setSelfMemberId(null);
      return;
    }

    const fetchData = async () => {
      setIsLoading(true);
      try {
        const { data: ownMembers, error: ownErr } = await fromExt("club_members")
          .select("id, name, email, club_member_number, gender, user_id, role")
          .eq("club_id", club.id)
          .eq("user_id", user.id)
          .order("joined_at", { ascending: true });
        if (ownErr) throw ownErr;

        const myMembership = (ownMembers || [])[0] as any;
        const adminRole = myMembership?.role === "captain" || myMembership?.role === "admin";
        setIsAdmin(adminRole);

        let linked: LinkedMember[] = [];
        if (user.email) {
          const { data: emailMembers, error: emailErr } = await fromExt("club_members")
            .select("id, name, email, club_member_number, gender, user_id")
            .eq("club_id", club.id)
            .eq("email", user.email.toLowerCase())
            .order("joined_at", { ascending: true });
          if (emailErr) throw emailErr;
          linked = (emailMembers || []) as LinkedMember[];
        }

        if (myMembership && !linked.find((m) => m.id === myMembership.id)) {
          linked.unshift(myMembership as LinkedMember);
        }
        setLinkedMembers(linked);

        if (adminRole) {
          const { data: all, error: allErr } = await fromExt("club_members")
            .select("id, name, email, club_member_number, gender, user_id")
            .eq("club_id", club.id)
            .order("name", { ascending: true });
          if (allErr) throw allErr;
          setAllMembers((all || []) as LinkedMember[]);
        } else {
          setAllMembers([]);
        }

        const stored = localStorage.getItem(`active_member_${club.id}_${user.id}`);
        const selfId = myMembership?.id || linked[0]?.id || null;
        setSelfMemberId(selfId);

        if (stored) {
          const validStored = adminRole ? true : linked.find((m) => m.id === stored);
          setActiveMemberId(validStored ? stored : selfId);
        } else {
          setActiveMemberId(selfId);
        }
      } catch (e) {
        console.warn("[MemberContext] Failed to fetch members:", e);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [user?.id, user?.email, club?.id]);

  const switchMember = useCallback((memberId: string) => {
    setActiveMemberId(memberId);
    if (club?.id && user?.id) {
      localStorage.setItem(`active_member_${club.id}_${user.id}`, memberId);
    }
  }, [club?.id, user?.id]);

  const resetToSelf = useCallback(() => {
    if (selfMemberId) {
      setActiveMemberId(selfMemberId);
      if (club?.id && user?.id) {
        localStorage.removeItem(`active_member_${club.id}_${user.id}`);
      }
    }
  }, [selfMemberId, club?.id, user?.id]);

  const activeMember = [...linkedMembers, ...allMembers].find((m) => m.id === activeMemberId) || null;
  const isViewingAs = !!activeMemberId && activeMemberId !== selfMemberId;
  const effectiveUserId = activeMember?.user_id || user?.id || null;

  return (
    <MemberContext.Provider value={{
      linkedMembers,
      allMembers,
      isAdmin,
      activeMember,
      effectiveUserId,
      isViewingAs,
      switchMember,
      resetToSelf,
      isLoading,
    }}>
      {children}
    </MemberContext.Provider>
  );
}

export function useMemberContext() {
  return useContext(MemberContext);
}
