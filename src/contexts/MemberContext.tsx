import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useClubContext } from "@/contexts/ClubContext";
import { fromExt } from "@/lib/supabase-ext";
import { supabase } from "@/integrations/supabase/client";

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
  const { club } = useClubContext();
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
        // 1. Fetch user's own club membership(s)
        const { data: ownMembers, error: ownErr } = await fromExt("club_members")
          .select("id, name, email, club_member_number, gender, user_id, role")
          .eq("club_id", club.id)
          .eq("user_id", user.id);
        if (ownErr) throw ownErr;

        const myMembership = (ownMembers || [])[0] as any;
        const adminRole = myMembership?.role === "captain" || myMembership?.role === "admin";
        setIsAdmin(adminRole);

        // 2. Fetch linked members (same email, family accounts)
        let linked: LinkedMember[] = [];
        if (user.email) {
          const { data: emailMembers } = await fromExt("club_members")
            .select("id, name, email, club_member_number, gender, user_id")
            .eq("club_id", club.id)
            .eq("email", user.email.toLowerCase());
          linked = (emailMembers || []) as LinkedMember[];
        }
        // Ensure own membership is in linked list
        if (myMembership && !linked.find(m => m.id === myMembership.id)) {
          linked.unshift(myMembership as LinkedMember);
        }
        setLinkedMembers(linked);

        // 3. For admins, fetch all club members
        if (adminRole) {
          const { data: all } = await fromExt("club_members")
            .select("id, name, email, club_member_number, gender, user_id")
            .eq("club_id", club.id)
            .order("name", { ascending: true });
          setAllMembers((all || []) as LinkedMember[]);
        } else {
          setAllMembers([]);
        }

        // Set default active member
        const stored = localStorage.getItem(`active_member_${club.id}_${user.id}`);
        const selfId = myMembership?.id || linked[0]?.id || null;
        setSelfMemberId(selfId);

        if (stored) {
          // Validate stored ID is still accessible
          const validStored = adminRole
            ? true // admin can view anyone
            : linked.find(m => m.id === stored);
          if (validStored) {
            setActiveMemberId(stored);
          } else {
            setActiveMemberId(selfId);
          }
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

  const activeMember = [...linkedMembers, ...allMembers].find(m => m.id === activeMemberId) || null;
  const isViewingAs = !!activeMemberId && activeMemberId !== selfMemberId;

  return (
    <MemberContext.Provider value={{
      linkedMembers,
      allMembers,
      isAdmin,
      activeMember,
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
