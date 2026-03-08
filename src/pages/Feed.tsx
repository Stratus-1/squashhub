import { useState, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { motion, AnimatePresence } from "framer-motion";
import { Send, MessageCircle, Flame, Heart, Target, ThumbsUp, Trophy, X } from "lucide-react";
import { toast } from "sonner";
import { useFeedPosts, useCreateFeedPost, useToggleReaction, useCreateComment, type FeedPost } from "@/hooks/use-feed";
import { formatDistanceToNow } from "date-fns";

const REACTION_EMOJIS = [
  { emoji: "🔥", label: "Fire" },
  { emoji: "💪", label: "Strong" },
  { emoji: "🎯", label: "Bullseye" },
  { emoji: "👏", label: "Clap" },
  { emoji: "😮", label: "Wow" },
];

function PostCard({ post }: { post: FeedPost }) {
  const { user } = useAuth();
  const toggleReaction = useToggleReaction();
  const createComment = useCreateComment();
  const [showComments, setShowComments] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleReaction = (emoji: string) => {
    toggleReaction.mutate({ postId: post.id, emoji });
  };

  const handleComment = async () => {
    if (!commentText.trim()) return;
    setSubmitting(true);
    try {
      await createComment.mutateAsync({ postId: post.id, content: commentText.trim() });
      setCommentText("");
    } catch {
      toast.error("Failed to add comment");
    }
    setSubmitting(false);
  };

  const myReactions = new Set(
    (post.reactions || []).filter(r => r.user_id === user?.id).map(r => r.emoji)
  );

  const typeIcon = post.type === "match_result" ? (
    <Trophy className="w-3.5 h-3.5 text-primary" />
  ) : post.type === "achievement" ? (
    <Target className="w-3.5 h-3.5 text-amber-500" />
  ) : null;

  const typeLabel = post.type === "match_result" ? "Match Result" :
    post.type === "achievement" ? "Achievement" :
    post.type === "challenge" ? "Challenge" : null;

  return (
    <motion.div
      initial={{ y: 10, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
    >
      <Card className="overflow-hidden">
        <CardContent className="p-4">
          {/* Header */}
          <div className="flex items-start gap-3">
            <Avatar className="w-9 h-9">
              <AvatarFallback className="text-xs bg-primary/10 text-primary">
                {(post.user_name || "?").slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold">{post.user_name}</p>
                {typeLabel && (
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0 gap-1">
                    {typeIcon}
                    {typeLabel}
                  </Badge>
                )}
              </div>
              <p className="text-[10px] text-muted-foreground">
                {formatDistanceToNow(new Date(post.created_at), { addSuffix: true })}
              </p>
            </div>
          </div>

          {/* Content */}
          {post.content && (
            <p className="mt-3 text-sm leading-relaxed whitespace-pre-wrap">{post.content}</p>
          )}

          {/* Match metadata */}
          {post.type === "match_result" && post.metadata && (
            <div className="mt-3 p-3 rounded-lg bg-muted/50 text-sm">
              <p className="font-medium">
                {post.metadata.winner_name || "Winner"} beat {post.metadata.loser_name || "opponent"}
              </p>
              {post.metadata.score && (
                <p className="text-muted-foreground text-xs mt-0.5">Score: {post.metadata.score}</p>
              )}
            </div>
          )}

          {/* Reactions */}
          <div className="flex items-center gap-1.5 mt-3 flex-wrap">
            {REACTION_EMOJIS.map(({ emoji }) => {
              const count = post.reaction_counts?.[emoji] || 0;
              const isMine = myReactions.has(emoji);
              return (
                <button
                  key={emoji}
                  onClick={() => handleReaction(emoji)}
                  className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs transition-all border ${
                    isMine
                      ? "bg-primary/10 border-primary/30 text-primary"
                      : "bg-muted/50 border-transparent text-muted-foreground hover:bg-muted"
                  }`}
                >
                  <span>{emoji}</span>
                  {count > 0 && <span className="font-medium">{count}</span>}
                </button>
              );
            })}

            <button
              onClick={() => setShowComments(!showComments)}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs text-muted-foreground hover:bg-muted transition-colors ml-auto"
            >
              <MessageCircle className="w-3.5 h-3.5" />
              {(post.comments || []).length || ""}
            </button>
          </div>

          {/* Comments */}
          <AnimatePresence>
            {showComments && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                <div className="mt-3 pt-3 border-t border-border space-y-2">
                  {(post.comments || []).map(comment => (
                    <div key={comment.id} className="flex gap-2">
                      <Avatar className="w-6 h-6 mt-0.5">
                        <AvatarFallback className="text-[8px] bg-muted">
                          {(comment.user_name || "?").slice(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 bg-muted/50 rounded-lg px-3 py-1.5">
                        <p className="text-xs font-medium">{comment.user_name}</p>
                        <p className="text-xs text-muted-foreground">{comment.content}</p>
                      </div>
                    </div>
                  ))}

                  <div className="flex gap-2 pt-1">
                    <Textarea
                      placeholder="Write a comment..."
                      value={commentText}
                      onChange={(e) => setCommentText(e.target.value)}
                      className="min-h-[36px] h-9 text-xs resize-none"
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          handleComment();
                        }
                      }}
                    />
                    <Button
                      size="sm"
                      onClick={handleComment}
                      disabled={!commentText.trim() || submitting}
                      className="h-9 w-9 p-0"
                    >
                      <Send className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </CardContent>
      </Card>
    </motion.div>
  );
}

export default function Feed() {
  const { user } = useAuth();
  const { data: posts, isLoading } = useFeedPosts();
  const createPost = useCreateFeedPost();
  const [newPost, setNewPost] = useState("");
  const [posting, setPosting] = useState(false);
  const [showCompose, setShowCompose] = useState(false);

  const handlePost = async () => {
    if (!newPost.trim()) return;
    setPosting(true);
    try {
      await createPost.mutateAsync({ content: newPost.trim(), type: "post" });
      setNewPost("");
      setShowCompose(false);
      toast.success("Posted!");
    } catch {
      toast.error("Failed to post");
    }
    setPosting(false);
  };

  return (
    <div className="min-h-screen bg-background pb-24">
      <PageHeader title="Club Feed" backTo="/dashboard" />

      <div className="px-4 space-y-4 max-w-lg mx-auto">
        {/* Compose */}
        <Card className="overflow-hidden">
          <CardContent className="p-3">
            {!showCompose ? (
              <button
                onClick={() => setShowCompose(true)}
                className="w-full text-left text-sm text-muted-foreground p-2 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
              >
                What's on your mind? Share a match recap...
              </button>
            ) : (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold">New Post</p>
                  <button onClick={() => setShowCompose(false)}>
                    <X className="w-4 h-4 text-muted-foreground" />
                  </button>
                </div>
                <Textarea
                  placeholder="Share a match recap, trash talk, or club news..."
                  value={newPost}
                  onChange={(e) => setNewPost(e.target.value)}
                  className="min-h-[80px] text-sm"
                  autoFocus
                />
                <div className="flex justify-end">
                  <Button
                    size="sm"
                    onClick={handlePost}
                    disabled={!newPost.trim() || posting}
                    className="gap-1.5"
                  >
                    <Send className="w-3.5 h-3.5" />
                    Post
                  </Button>
                </div>
              </motion.div>
            )}
          </CardContent>
        </Card>

        {/* Feed */}
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-40 w-full rounded-xl" />)}
          </div>
        ) : (
          <div className="space-y-3">
            {(posts || []).map(post => (
              <PostCard key={post.id} post={post} />
            ))}
            {(!posts || posts.length === 0) && (
              <div className="text-center py-12 text-muted-foreground">
                <MessageCircle className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p className="text-sm font-medium">No posts yet</p>
                <p className="text-xs mt-1">Be the first to share something!</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
