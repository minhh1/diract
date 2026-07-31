// lib/msTeamsBot/parseActivity.ts
// Turns a raw Bot Framework Activity into the plain IncomingMessage shape
// lib/msTeamsBot/handleMessage.ts's bot brain consumes -- shared by both
// messaging endpoints (app/api/teams/bot/[companyId]/route.ts's BYO path
// and app/api/teams/bot/shared/route.ts's shared-bot path), since neither
// this parsing nor the bot brain itself depends on which credentials mode
// is in play.
export interface IncomingMessage {
  aadObjectId: string;
  tenantId: string;
  serviceUrl: string;
  conversationId: string;
  activityId: string;
  question: string;
  reactionTargetId?: string;
  isGroup: boolean;
  wasMentioned: boolean;
  senderName?: string;
}

function stripMentionMarkup(text: string): string {
  return text.replace(/<at>.*?<\/at>/g, "").trim();
}

// Bot Framework activities carry a "mention" entity referencing whoever was
// @mentioned; `mentioned.id` is compared against `recipient.id` (the bot's
// own id as seen in this specific conversation) rather than the literal
// <at> text, since a channel message might @mention a different user/bot
// entirely.
function wasBotMentioned(activity: any): boolean {
  const entities = activity.entities as Array<{ type?: string; mentioned?: { id?: string } }> | undefined;
  return !!entities?.some((e) => e.type === "mention" && e.mentioned?.id === activity.recipient?.id);
}

// Returns null when the activity needs nothing more than an ack -- a
// typing indicator, a non-like reaction, conversationUpdate, or (in a
// non-1:1 conversation) a message that didn't actually @mention the bot.
export function parseIncomingActivity(activity: any): IncomingMessage | null {
  // Any clearly-affirmative reaction on the bot's own confirmation message
  // counts as a "yes" -- lets someone confirm a pending create/update
  // without typing a word. Teams' reaction picker has 6 options (Like,
  // Heart, Laugh, Surprised, Sad, Angry) with distinct `type` strings
  // ("like"/"plusOne" is the legacy alias, "heart", "laugh", "surprised",
  // "sad", "angry"); a report that this "worked with a typed yes but not
  // with a reaction" turned out to be because only "like"/"plusOne" were
  // recognized -- if the user tapped Heart, or Teams rendered/sent
  // something other than a literal thumbs-up for whatever they tapped, it
  // was silently dropped as an unrecognized reaction. "Like" and "Heart"
  // are the two that unambiguously mean approval; Laugh/Surprised/Sad/Angry
  // are deliberately left unmapped -- someone reacting 😠 to object clearly
  // isn't confirming, and there's no typed "no" equivalent for a reaction
  // to fall back to (see the reaction-confirm branch in handleMessage.ts,
  // which only ever treats a matched reaction as a "yes", never a "no").
  //
  // `replyToId` identifies exactly which message was reacted to (the
  // Connector API's standard reply property, present on any activity type),
  // verified in handleMessage against the prompt_message_id captured when
  // that confirmation was sent. Deliberately not gated on
  // activity.type === "messageReaction" -- observed live (2026-07-27) that
  // reactions in a Teams channel/group conversation can arrive with
  // type "message" and the reactionsAdded array attached directly instead
  // of the dedicated messageReaction activity type; requiring that exact
  // type meant every reaction in a group chat was silently dropped as an
  // unrecognized message (empty text, acked and ignored). A plain "message"
  // activity never carries a populated reactionsAdded array on its own, so
  // checking for that array's presence is a safe, type-agnostic signal.
  const AFFIRMATIVE_REACTION_TYPES = new Set(["like", "plusOne", "heart"]);
  const reactionsAdded = (activity.reactionsAdded ?? []) as Array<{ type?: string }>;
  const isLikeReaction = reactionsAdded.some((r) => r.type && AFFIRMATIVE_REACTION_TYPES.has(r.type));
  const reactionTargetId: string | undefined = isLikeReaction ? activity.replyToId : undefined;

  // Diagnostic only, kept narrow (fires only when Teams actually sent a
  // reaction of some kind) -- the "like = yes" confirm path has been
  // reported as silently not working for at least one user with no error
  // anywhere to explain why. Everything downstream of this function
  // (isLikeReaction detection, then handleMessage's prompt_message_id
  // match) depends on assumptions about the exact shape of that payload
  // that were only ever confirmed against one live test (2026-07-27, see
  // this function's own comment below) -- this logs the actual shape every
  // time so a repeat report has real data to diagnose against instead of
  // re-guessing. Safe to remove once the reaction-confirm path is
  // confirmed reliable across conversation types.
  if (reactionsAdded.length > 0) {
    console.log("[teams-bot] reaction activity received", JSON.stringify({
      activityType: activity.type,
      reactionsAdded,
      isLikeReaction,
      replyToId: activity.replyToId,
      conversationType: activity.conversation?.conversationType,
      fromAadObjectId: activity.from?.aadObjectId,
      tenantId: activity.conversation?.tenantId ?? activity.channelData?.tenant?.id,
    }));
  }

  // Only real user messages (or a like-reaction confirm) need a reply --
  // conversationUpdate (bot added/removed), typing indicators, other
  // reaction types, etc. are just acked.
  if (!isLikeReaction && (activity.type !== "message" || !activity.text)) {
    return null;
  }

  // In a group chat or channel, an unmentioned message is only worth a
  // reply when the sender already has something going with the bot (a
  // pending create/update/issue_precedent flow) -- that decision needs a DB
  // lookup by linked account, which this pure parsing function doesn't have,
  // so it's made downstream in lib/botEngine/handleMessage.ts instead (see
  // wasMentioned below). Observed live (2026-07-27): hard-dropping every
  // unmentioned group reply here meant a person answering (or trying to
  // cancel) a multi-turn question the bot had already asked -- without
  // re-@mentioning it on every single follow-up -- was silently discarded,
  // leaving them stuck with no way to escape a stale "collecting" state.
  const conversationType: string | undefined = activity.conversation?.conversationType;
  const isGroup = conversationType !== "personal";
  const wasMentioned = isLikeReaction || !isGroup || wasBotMentioned(activity);

  const question = isLikeReaction ? "\u{1F44D}" : stripMentionMarkup(activity.text);
  const aadObjectId: string | undefined = activity.from?.aadObjectId;
  const tenantId: string | undefined = activity.conversation?.tenantId ?? activity.channelData?.tenant?.id;
  const serviceUrl: string = activity.serviceUrl;
  const conversationId: string = activity.conversation?.id;
  const activityId: string = activity.id;

  if (!aadObjectId || !tenantId || !question) {
    return null;
  }

  // Several people can have their own pending create/update flow going at
  // once in a shared channel/group chat -- everything the bot posts there
  // is visible to everyone with no other indication of who a prompt/result
  // is for, which reads as one shared queue even though the underlying
  // state (teams_bot_pending_actions, keyed by linked_account_id) is
  // already isolated per person. senderName (only needed outside a 1:1,
  // which is unambiguous on its own) is used to prefix the bot's replies --
  // see attribute() in lib/msTeamsBot/handleMessage.ts.
  const senderName: string | undefined = activity.from?.name;

  return { aadObjectId, tenantId, serviceUrl, conversationId, activityId, question, reactionTargetId, isGroup, wasMentioned, senderName };
}
