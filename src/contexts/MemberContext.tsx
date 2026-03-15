import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useClubContext } from "@/contexts/ClubContext";
import { fromExt } from "@/lib/supabase-ext";

interface LinkedMember {
  id: string;
  name: string | null;
  email: string | null;
  club_member_number: string | null;
  gender: string | null;
  user_id: string | null;
}

interface MemberContextType {
  /** All club_members sharing the current user's email within the club */
  linkedMembers: LinkedMember[];
  /** The currently active member (whose data drives the dashboard) */
  activeMember: LinkedMember | null;
  /** Switch to a different linked member */
  switchMember: (memberId: string) => void;
  isLoading: boolean;
}

const MemberContext = createContext<MemberContextType>({
  linkedMembers: [],
  activeMember: null,
  switchMember: () => {},
  isLoading: false,
});

export function MemberProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { club } = useClubContext();
  const [linkedMembers, setLinkedMembers] = useState<LinkedMember[]>([]);
  const [activeMemberId, setActiveMemberId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!user?.email || !club?.id) {
      setLinkedMembers([]);
      setActiveMemberId(null);
      return;
    }

    const fetchLinked = async () => {
      setIsLoading(true);
      try {
        // Find all club_members with this email in this club
        const { data, error } = await fromExt("club_members")
          .select("id, name, email, club_member_number, gender, user_id")
          .eq("club_id", club.id)
          .eq("email", user.email!.toLowerCase());

        if (error) throw error;
        const members = (data || []) as LinkedMember[];
        setLinkedMembers(members);

        // Default to the member linked to the current user_id, or first
        const self = members.find(m => m.user_id === user.id);
        const stored = localStorage.getItem(`active_member_${club.id}_${user.id}`);
        if (stored && members.find(m => m.id === stored)) {
          setActiveMemberId(stored);
        } else if (self) {
          setActiveMemberId(self.id);
        } else if (members.length > 0) {
          setActiveMemberId(members[0].id);
        }
      } catch (e) {
        console.warn("[MemberContext] Failed to fetch linked members:", e);
      } finally {
        setIsLoading(false);
      }
    };

    fetchLinked();
  }, [user?.id, user?.email, club?.id]);

  const switchMember = useCallback((memberId: string) => {
    setActiveMemberId(memberId);
    if (club?.id && user?.id) {
      localStorage.setItem(`active_member_${club.id}_${user.id}`, memberId);
    }
  }, [club?.id, user?.id]);

  const activeMember = linkedMembers.find(m => m.id === activeMemberId) || null;

  return (
    <MemberContext.Provider value={{ linkedMembers, activeMember, switchMember, isLoading }}>
      {children}
    </MemberContext.Provider>
  );
}

export function useMemberContext() {
  return useContext(MemberContext);
}
