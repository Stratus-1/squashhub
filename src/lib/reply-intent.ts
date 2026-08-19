/**
 * App-side access to the shared inbound-reply classifier.
 *
 * The implementation lives with the edge functions so the webhook and the app
 * are guaranteed to classify replies identically.
 */
export {
  classifyReply,
  normaliseReply,
  type ReplyClassification,
  type ReplyIntent,
} from "../../supabase/functions/_shared/reply-intent";
