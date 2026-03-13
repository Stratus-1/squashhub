import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useMyClub } from "@/hooks/use-club";

const fromAny = (table: string) => (supabase as any).from(table);

export type FeedPost = {
  id: string;
  user_id: string;
  type: string;
  content: string | null;
  reference_type: string | null;
  reference_id: string | null;
  metadata: Record<string, any>;
  created_at: string;
  // joined
  user_name?: string;
  user_avatar?: string | null;
  reactions?: FeedReaction[];
  comments?: FeedComment[];
  reaction_counts?: Record<string, number>;
};

export type FeedReaction = {
  id: string;
  post_id: string;
  user_id: string;
  emoji: string;
  created_at: string;
};

export type FeedComment = {
  id: string;
  post_id: string;
  user_id: string;
  content: string;
  created_at: string;
  user_name?: string;
  user_avatar?: string | null;
};

const PAGE_SIZE = 20;

export function useFeedPosts() {
  const { user } = useAuth();
  const { data: clubData } = useMyClub();
  const clubId = clubData?.club?.id;

  return useQuery({
    queryKey: ["feed-posts", clubId],
    queryFn: async () => {
      let query = fromAny("feed_posts")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);
      if (clubId) {
        query = query.eq("club_id", clubId);
      }
      const { data: posts, error } = await query;
      if (error) throw error;

      if (!posts || posts.length === 0) return [] as FeedPost[];

      // Get user profiles
      const userIds = [...new Set((posts as any[]).map(p => p.user_id))];
      const { data: profiles } = await supabase.from("profiles").select("id, name, avatar_url").in("id", userIds);
      const profileMap = new Map((profiles || []).map(p => [p.id, p]));

      // Get reactions for these posts
      const postIds = (posts as any[]).map(p => p.id);
      const { data: reactions } = await fromAny("feed_reactions").select("*").in("post_id", postIds);
      const reactionsByPost = new Map<string, FeedReaction[]>();
      for (const r of (reactions || [])) {
        if (!reactionsByPost.has(r.post_id)) reactionsByPost.set(r.post_id, []);
        reactionsByPost.get(r.post_id)!.push(r);
      }

      // Get comments
      const { data: comments } = await fromAny("feed_comments").select("*").in("post_id", postIds).order("created_at", { ascending: true });
      const commentUserIds = [...new Set((comments || []).map((c: any) => c.user_id as string))] as string[];
      let commentProfileMap = new Map<string, any>();
      if (commentUserIds.length > 0) {
        const { data: cp } = await supabase.from("profiles").select("id, name, avatar_url").in("id", commentUserIds);
        commentProfileMap = new Map((cp || []).map(p => [p.id, p]));
      }
      const commentsByPost = new Map<string, FeedComment[]>();
      for (const c of (comments || [])) {
        if (!commentsByPost.has(c.post_id)) commentsByPost.set(c.post_id, []);
        const cp = commentProfileMap.get(c.user_id);
        commentsByPost.get(c.post_id)!.push({ ...c, user_name: cp?.name || "Unknown", user_avatar: cp?.avatar_url });
      }

      return (posts as any[]).map(p => {
        const profile = profileMap.get(p.user_id);
        const postReactions = reactionsByPost.get(p.id) || [];
        const reactionCounts: Record<string, number> = {};
        for (const r of postReactions) {
          reactionCounts[r.emoji] = (reactionCounts[r.emoji] || 0) + 1;
        }
        return {
          ...p,
          user_name: (profile as any)?.name || "Unknown",
          user_avatar: (profile as any)?.avatar_url || null,
          reactions: postReactions,
          comments: commentsByPost.get(p.id) || [],
          reaction_counts: reactionCounts,
        } as FeedPost;
      });
    },
    enabled: !!user,
  });
}

export function useCreateFeedPost() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ content, type, referenceType, referenceId, metadata }: {
      content?: string;
      type?: string;
      referenceType?: string;
      referenceId?: string;
      metadata?: Record<string, any>;
    }) => {
      if (!user) throw new Error("Not logged in");
      const { data, error } = await fromAny("feed_posts").insert({
        user_id: user.id,
        type: type || "post",
        content: content || null,
        reference_type: referenceType || null,
        reference_id: referenceId || null,
        metadata: metadata || {},
      }).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["feed-posts"] });
    },
  });
}

export function useToggleReaction() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ postId, emoji }: { postId: string; emoji: string }) => {
      if (!user) throw new Error("Not logged in");
      
      // Check if already reacted
      const { data: existing } = await fromAny("feed_reactions")
        .select("id")
        .eq("post_id", postId)
        .eq("user_id", user.id)
        .eq("emoji", emoji)
        .maybeSingle();

      if (existing) {
        await fromAny("feed_reactions").delete().eq("id", existing.id);
      } else {
        await fromAny("feed_reactions").insert({
          post_id: postId,
          user_id: user.id,
          emoji,
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["feed-posts"] });
    },
  });
}

export function useCreateComment() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ postId, content }: { postId: string; content: string }) => {
      if (!user) throw new Error("Not logged in");
      const { data, error } = await fromAny("feed_comments").insert({
        post_id: postId,
        user_id: user.id,
        content,
      }).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["feed-posts"] });
    },
  });
}
