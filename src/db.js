import { supabase } from "./supabaseClient";

// ── Auth ──────────────────────────────────────────────────────────────────────
export async function signUp({ email, password, username }) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { username: username.toLowerCase() } },
  });
  if (error) throw error;
  return data;
}

export async function signIn({ email, password }) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function signOut() {
  await supabase.auth.signOut();
}

export async function getSession() {
  const { data } = await supabase.auth.getSession();
  return data.session;
}

export async function getMyProfile() {
  const { data: sessionData } = await supabase.auth.getUser();
  const authUser = sessionData?.user;
  if (!authUser) return null;
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("user_id", authUser.id)
    .single();
  if (error) return null;
  return toUser(data);
}

export async function updateProfile(userId, patch) {
  const dbPatch = {};
  if ("bio" in patch) dbPatch.bio = patch.bio;
  if ("profilePic" in patch) dbPatch.profile_pic = patch.profilePic;
  const { error } = await supabase.from("profiles").update(dbPatch).eq("user_id", userId);
  if (error) throw error;
}

export async function changePassword(newPassword) {
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw error;
}

// ── Mapping helpers (db row -> app shape, keeps component code familiar) ───
function toUser(row) {
  if (!row) return null;
  return {
    userId: row.user_id,
    username: row.username,
    bio: row.bio || "",
    profilePic: row.profile_pic || null,
    coinBalance: row.coin_balance || 0,
    verified: row.verified,
    verifiedUntil: row.verified_until ? new Date(row.verified_until).getTime() : null,
    isAdmin: row.is_admin,
    createdAt: new Date(row.created_at).getTime(),
  };
}

function toPost(row) {
  return {
    postId: row.post_id,
    userId: row.user_id,
    username: row.profiles?.username || row.username,
    caption: row.caption || "",
    mediaData: row.media_url || null,
    mediaType: row.media_type || null,
    isReel: row.is_reel,
    isLive: row.is_live,
    roomName: row.room_name,
    createdAt: new Date(row.created_at).getTime(),
    likes: row.likes || [],
    comments: row.comments || [],
    viewCount: row.view_count || 0,
    author: row.profiles ? toUser({ ...row.profiles, user_id: row.user_id }) : null,
  };
}

// ── Profiles / users ─────────────────────────────────────────────────────────
export async function getUserById(userId) {
  const { data } = await supabase.from("profiles").select("*").eq("user_id", userId).single();
  return toUser(data);
}

export async function searchUsers(query, excludeUserId) {
  let q = supabase.from("profiles").select("*").neq("user_id", excludeUserId).limit(20);
  if (query) q = q.ilike("username", `%${query}%`);
  const { data, error } = await q;
  if (error) return [];
  return data.map(toUser);
}

export async function suggestedUsers(excludeUserId, limit = 10) {
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .neq("user_id", excludeUserId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) return [];
  return data.map(toUser);
}

// ── Friend requests / friendships ───────────────────────────────────────────
export async function sendFriendRequest(fromId, toId) {
  const { error } = await supabase.from("friend_requests").insert({ from_id: fromId, to_id: toId });
  if (error && error.code !== "23505") throw error;
  if (error && error.code === "23505") return { already: true };
  await addNotification(toId, "ne aapko friend request bheji hai");
  return { already: false };
}

export async function getIncomingFriendRequests(userId) {
  const { data, error } = await supabase
    .from("friend_requests")
    .select("id, from_id, created_at, profiles:from_id(username, profile_pic, verified)")
    .eq("to_id", userId)
    .eq("status", "pending")
    .order("created_at", { ascending: false });
  if (error) return [];
  return data.map((r) => ({
    id: r.id,
    fromId: r.from_id,
    fromUsername: r.profiles?.username,
    profilePic: r.profiles?.profile_pic,
    verified: r.profiles?.verified,
    ts: new Date(r.created_at).getTime(),
  }));
}

export async function respondFriendRequest(requestId, fromId, toId, accept) {
  if (accept) {
    const [a, b] = [fromId, toId].sort();
    const { error: fErr } = await supabase.from("friendships").insert({ user_a: a, user_b: b });
    if (fErr && fErr.code !== "23505") throw fErr;
    await supabase.from("friend_requests").update({ status: "accepted" }).eq("id", requestId);
  } else {
    await supabase.from("friend_requests").update({ status: "declined" }).eq("id", requestId);
  }
}

export async function getFriends(userId) {
  const { data, error } = await supabase
    .from("friendships")
    .select(
      "user_a, user_b, a:user_a(username, profile_pic, verified), b:user_b(username, profile_pic, verified)"
    )
    .or(`user_a.eq.${userId},user_b.eq.${userId}`);
  if (error) return [];
  return data.map((row) => {
    const isA = row.user_a === userId;
    const other = isA ? row.b : row.a;
    const otherId = isA ? row.user_b : row.user_a;
    return { userId: otherId, username: other?.username, profilePic: other?.profile_pic, verified: other?.verified };
  });
}

// ── Follow system ─────────────────────────────────────────────────────────────
export async function followUser(followerId, followingId) {
  const { error } = await supabase.from("follows").insert({ follower_id: followerId, following_id: followingId });
  if (error && error.code !== "23505") throw error;
  await addNotification(followingId, "ne aapko follow kiya hai");
}

export async function unfollowUser(followerId, followingId) {
  const { error } = await supabase.from("follows").delete().eq("follower_id", followerId).eq("following_id", followingId);
  if (error) throw error;
}

export async function isFollowing(followerId, followingId) {
  const { data, error } = await supabase
    .from("follows")
    .select("follower_id")
    .eq("follower_id", followerId)
    .eq("following_id", followingId)
    .maybeSingle();
  if (error) return false;
  return !!data;
}

export async function getFollowCounts(userId) {
  const { data, error } = await supabase.rpc("get_follow_counts", { p_user_id: userId });
  if (error || !data || !data[0]) return { followers: 0, following: 0 };
  return { followers: Number(data[0].followers_count) || 0, following: Number(data[0].following_count) || 0 };
}

export async function getFollowers(userId) {
  const { data, error } = await supabase
    .from("follows")
    .select("follower_id, profiles:follower_id(user_id, username, profile_pic, verified)")
    .eq("following_id", userId);
  if (error) return [];
  return data.map((r) => toUser(r.profiles));
}

export async function getFollowing(userId) {
  const { data, error } = await supabase
    .from("follows")
    .select("following_id, profiles:following_id(user_id, username, profile_pic, verified)")
    .eq("follower_id", userId);
  if (error) return [];
  return data.map((r) => toUser(r.profiles));
}

// ── Posts / feed ──────────────────────────────────────────────────────────────
const POST_SELECT = "*, profiles:user_id(username, profile_pic, verified)";

export async function fetchFeed(limit = 50) {
  const { data, error } = await supabase
    .from("posts")
    .select(POST_SELECT)
    .eq("is_live", false)
    .eq("is_reel", false)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return attachLikesAndComments(data.map(toPost));
}

export async function fetchReels(limit = 50) {
  const { data, error } = await supabase
    .from("posts")
    .select(POST_SELECT)
    .eq("is_reel", true)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return attachLikesAndComments(data.map(toPost));
}

export async function fetchLivePosts() {
  const { data, error } = await supabase
    .from("posts")
    .select(POST_SELECT)
    .eq("is_live", true)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return attachLikesAndComments(data.map(toPost));
}

export async function fetchUserPosts(userId) {
  const { data, error } = await supabase
    .from("posts")
    .select(POST_SELECT)
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return attachLikesAndComments(data.map(toPost));
}

export async function fetchPostById(postId) {
  const { data, error } = await supabase.from("posts").select(POST_SELECT).eq("post_id", postId).single();
  if (error) return null;
  const [withExtras] = await attachLikesAndComments([toPost(data)]);
  return withExtras;
}

async function attachLikesAndComments(posts) {
  if (posts.length === 0) return posts;
  const ids = posts.map((p) => p.postId);
  const [{ data: likeRows }, { data: commentRows }] = await Promise.all([
    supabase.from("likes").select("post_id, user_id, reaction").in("post_id", ids),
    supabase
      .from("comments")
      .select("id, post_id, user_id, text, is_gift, reaction, created_at, profiles:user_id(username, profile_pic)")
      .in("post_id", ids)
      .order("created_at", { ascending: true }),
  ]);
  const likesByPost = {};
  const reactionsByPost = {};
  (likeRows || []).forEach((r) => {
    (likesByPost[r.post_id] ||= []).push(r.user_id);
    (reactionsByPost[r.post_id] ||= []).push({ userId: r.user_id, reaction: r.reaction || "heart" });
  });
  const commentsByPost = {};
  (commentRows || []).forEach((r) => {
    (commentsByPost[r.post_id] ||= []).push({
      id: r.id,
      userId: r.user_id,
      username: r.profiles?.username,
      profilePic: r.profiles?.profile_pic,
      text: r.text,
      isGift: r.is_gift,
      reaction: r.reaction,
      ts: new Date(r.created_at).getTime(),
    });
  });
  return posts.map((p) => ({
    ...p,
    likes: likesByPost[p.postId] || [],
    reactions: reactionsByPost[p.postId] || [],
    comments: commentsByPost[p.postId] || [],
  }));
}

export async function createPost({ userId, caption, mediaUrl, mediaType, isReel }) {
  const { data, error } = await supabase
    .from("posts")
    .insert({
      user_id: userId,
      caption: caption || "",
      media_url: mediaUrl || null,
      media_type: mediaType || null,
      is_reel: !!isReel,
    })
    .select(POST_SELECT)
    .single();
  if (error) throw error;
  return toPost(data);
}

export async function createLivePost({ userId, caption, roomName }) {
  const { data, error } = await supabase
    .from("posts")
    .insert({ user_id: userId, caption: caption || "", is_live: true, room_name: roomName })
    .select(POST_SELECT)
    .single();
  if (error) throw error;
  return toPost(data);
}
export async function endLivePost(postId) {
  const { error } = await supabase.from("posts").delete().eq("post_id", postId);
  if (error) throw error;
}

export async function deletePost(postId) {
  const { error } = await supabase.from("posts").delete().eq("post_id", postId);
  if (error) throw error;
}

export async function toggleLike(postId, userId, currentlyLiked) {
  if (currentlyLiked) {
    const { error } = await supabase.from("likes").delete().eq("post_id", postId).eq("user_id", userId);
    if (error) throw error;
  } else {
    const { error } = await supabase.from("likes").insert({ post_id: postId, user_id: userId, reaction: "heart" });
    if (error && error.code !== "23505") throw error;
  }
}

// ── Post reactions (❤️ 😂 😢) ────────────────────────────────────────────────
export async function setPostReaction(postId, userId, reaction) {
  const { error } = await supabase
    .from("likes")
    .upsert({ post_id: postId, user_id: userId, reaction }, { onConflict: "post_id,user_id" });
  if (error) throw error;
}

export async function removePostReaction(postId, userId) {
  const { error } = await supabase.from("likes").delete().eq("post_id", postId).eq("user_id", userId);
  if (error) throw error;
}

export async function addComment(postId, userId, text, isGift = false) {
  const { data, error } = await supabase
    .from("comments")
    .insert({ post_id: postId, user_id: userId, text, is_gift: isGift })
    .select("id, created_at")
    .single();
  if (error) throw error;
  return data;
}

export async function setCommentReaction(commentId, reaction) {
  const { error } = await supabase.from("comments").update({ reaction }).eq("id", commentId);
  if (error) throw error;
}

export async function deleteComment(commentId) {
  const { error } = await supabase.from("comments").delete().eq("id", commentId);
  if (error) throw error;
}

// ── Media upload (Supabase Storage) ─────────────────────────────────────────
export async function uploadMedia(file, userId) {
  const ext = file.name.split(".").pop() || (file.type.startsWith("video") ? "mp4" : "jpg");
  const path = `${userId}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage.from("media").upload(path, file, {
    cacheControl: "3600",
    upsert: false,
    contentType: file.type,
  });
  if (error) throw error;
  const { data } = supabase.storage.from("media").getPublicUrl(path);
  return data.publicUrl;
}

export async function uploadAvatar(file, userId) {
  const ext = file.name.split(".").pop() || "jpg";
  const path = `${userId}/avatar_${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from("avatars").upload(path, file, {
    cacheControl: "3600",
    upsert: false,
    contentType: file.type,
  });
  if (error) throw error;
  const { data } = supabase.storage.from("avatars").getPublicUrl(path);
  return data.publicUrl;
}

// ── Gifts / wallet ────────────────────────────────────────────────────────────
export async function sendGift({ fromId, toId, postId, gift }) {
  const { data, error } = await supabase.rpc("send_gift", {
    p_to_id: toId || null,
    p_post_id: postId || null,
    p_gift_id: gift.id,
    p_cost: gift.cost,
    p_comment_text: `${gift.emoji} ${gift.name} bheja`,
  });
  if (error) {
    if (error.message?.includes("INSUFFICIENT_COINS")) throw new Error("INSUFFICIENT_COINS");
    throw error;
  }
  return data;
}

export async function createTransaction({ userId, type, amountPKR, coins, method, reference }) {
  const { data, error } = await supabase
    .from("transactions")
    .insert({ user_id: userId, type, amount_pkr: amountPKR, coins, method, reference, status: "pending" })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function requestWithdraw({ userId, coins, method, reference }) {
  const { data, error } = await supabase.rpc("request_withdraw", {
    p_coins: coins,
    p_method: method,
    p_reference: reference,
  });
  if (error) {
    if (error.message?.includes("INSUFFICIENT_COINS")) throw new Error("INSUFFICIENT_COINS");
    throw error;
  }
  return data;
}

export async function debitCoinsForWithdraw(userId, coins) {
  const { data: profile, error } = await supabase.from("profiles").select("coin_balance").eq("user_id", userId).single();
  if (error) throw error;
  if ((profile.coin_balance || 0) < coins) throw new Error("INSUFFICIENT_COINS");
  const { error: uErr } = await supabase
    .from("profiles")
    .update({ coin_balance: profile.coin_balance - coins })
    .eq("user_id", userId);
  if (uErr) throw uErr;
  return profile.coin_balance - coins;
}

export async function getMyTransactions(userId) {
  const { data, error } = await supabase
    .from("transactions")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) return [];
  return data.map((t) => ({
    id: t.id,
    type: t.type,
    userId: t.user_id,
    amountPKR: t.amount_pkr,
    coins: t.coins,
    method: t.method,
    reference: t.reference,
    status: t.status,
    createdAt: new Date(t.created_at).getTime(),
  }));
}

// ── Admin ─────────────────────────────────────────────────────────────────────
export async function getAllTransactions() {
  const { data, error } = await supabase
    .from("transactions")
    .select("*, profiles:user_id(username)")
    .order("created_at", { ascending: false });
  if (error) return [];
  return data.map((t) => ({
    id: t.id,
    type: t.type,
    userId: t.user_id,
    username: t.profiles?.username,
    amountPKR: t.amount_pkr,
    coins: t.coins,
    method: t.method,
    reference: t.reference,
    status: t.status,
    createdAt: new Date(t.created_at).getTime(),
  }));
}

export async function adminApproveTopup(txId) {
  const { error } = await supabase.rpc("admin_approve_topup", { p_tx_id: txId });
  if (error) throw error;
}

export async function adminRejectTopup(txId) {
  const { error } = await supabase.rpc("admin_reject_topup", { p_tx_id: txId });
  if (error) throw error;
}

export async function adminApproveWithdraw(txId) {
  const { error } = await supabase.rpc("admin_approve_withdraw", { p_tx_id: txId });
  if (error) throw error;
}

export async function adminRejectWithdraw(txId) {
  const { error } = await supabase.rpc("admin_reject_withdraw", { p_tx_id: txId });
  if (error) throw error;
}

// ── Notifications ─────────────────────────────────────────────────────────────
export async function addNotification(userId, body) {
  await supabase.from("notifications").insert({ user_id: userId, body });
}
export async function getNotifications(userId) {
  const { data, error } = await supabase
    .from("notifications")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) return [];
  return data.map((n) => ({ id: n.id, body: n.body, read: n.read, ts: new Date(n.created_at).getTime() }));
}

export async function markNotificationsRead(userId) {
  await supabase.from("notifications").update({ read: true }).eq("user_id", userId).eq("read", false);
}

// ── Direct messages ───────────────────────────────────────────────────────────
export async function fetchConversation(userId, partnerId) {
  const { data, error } = await supabase
    .from("messages")
    .select("*")
    .or(
      `and(from_id.eq.${userId},to_id.eq.${partnerId}),and(from_id.eq.${partnerId},to_id.eq.${userId})`
    )
    .order("created_at", { ascending: true });
  if (error) return [];
  return data.map((m) => ({ id: m.id, fromId: m.from_id, text: m.text, ts: new Date(m.created_at).getTime() }));
}

export async function sendMessage(fromId, toId, text) {
  const { error } = await supabase.from("messages").insert({ from_id: fromId, to_id: toId, text });
  if (error) throw error;
  await addNotification(toId, "ne aapko message bheja hai");
}

export async function fetchConversationsList(userId) {
  const { data, error } = await supabase
    .from("messages")
    .select("from_id, to_id, text, created_at")
    .or(`from_id.eq.${userId},to_id.eq.${userId}`)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) return [];
  const map = new Map();
  for (const m of data) {
    const partnerId = m.from_id === userId ? m.to_id : m.from_id;
    if (!map.has(partnerId)) {
      map.set(partnerId, { partnerId, lastText: m.text, lastTs: new Date(m.created_at).getTime() });
    }
  }
  const list = Array.from(map.values());
  const partnerIds = list.map((c) => c.partnerId);
  if (partnerIds.length === 0) return [];
  const { data: profiles } = await supabase.from("profiles").select("user_id, username, profile_pic").in("user_id", partnerIds);
  const pMap = {};
  (profiles || []).forEach((p) => (pMap[p.user_id] = p));
  return list.map((c) => ({
    ...c,
    partnerUsername: pMap[c.partnerId]?.username,
    partnerProfilePic: pMap[c.partnerId]?.profile_pic,
  }));
}

// ── Realtime subscriptions ───────────────────────────────────────────────────
export function subscribeToPostChanges(callback) {
  const channel = supabase
    .channel("posts-changes-" + Math.random().toString(36).slice(2))
    .on("postgres_changes", { event: "*", schema: "public", table: "posts" }, callback)
    .on("postgres_changes", { event: "*", schema: "public", table: "likes" }, callback)
    .on("postgres_changes", { event: "*", schema: "public", table: "comments" }, callback)
    .subscribe();
  return () => supabase.removeChannel(channel);
}

export function subscribeToMessages(userId, callback) {
  const channel = supabase
    .channel(`messages-${userId}`)
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "messages" },
      (payload) => {
        if (payload.new.to_id === userId || payload.new.from_id === userId) callback(payload);
      }
    )
    .subscribe();
  return () => supabase.removeChannel(channel);
}

export function subscribeToNotifications(userId, callback) {
  const channel = supabase
    .channel(`notifications-${userId}`)
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
      callback
    )
    .subscribe();
  return () => supabase.removeChannel(channel);
}

// ── Live co-host (multi-host) ──────────────────────────────────────────────
export async function sendCohostRequest(roomName, hostId, guestId) {
  const { error } = await supabase
    .from("live_cohost_requests")
    .insert({ room_name: roomName, host_id: hostId, guest_id: guestId, status: "pending" });
  if (error) throw error;
  await addNotification(guestId, "ne aapko live me co-host banne ki request bheji hai");
}

export async function getMyCohostRequests(guestId) {
  const { data, error } = await supabase
    .from("live_cohost_requests")
    .select("id, room_name, host_id, created_at, profiles:host_id(username)")
    .eq("guest_id", guestId)
    .eq("status", "pending")
    .order("created_at", { ascending: false });
  if (error) return [];
  return data.map((r) => ({
    id: r.id,
    roomName: r.room_name,
    hostId: r.host_id,
    hostUsername: r.profiles?.username,
    ts: new Date(r.created_at).getTime(),
  }));
}

export async function respondCohostRequest(requestId, accept) {
  const { error } = await supabase
    .from("live_cohost_requests")
    .update({ status: accept ? "accepted" : "declined" })
    .eq("id", requestId);
  if (error) throw error;
}

// ── Typing indicator (realtime broadcast, no DB table needed) ──────────────
function typingChannelName(userIdA, userIdB) {
  return `typing-${[userIdA, userIdB].sort().join("-")}`;
}

export function sendTypingEvent(userId, partnerId) {
  const channel = supabase.channel(typingChannelName(userId, partnerId));
  channel.send({ type: "broadcast", event: "typing", payload: { from: userId } });
}

export function subscribeToTyping(userId, partnerId, onTyping) {
  const channel = supabase
    .channel(typingChannelName(userId, partnerId))
    .on("broadcast", { event: "typing" }, (msg) => {
      if (msg.payload?.from && msg.payload.from !== userId) onTyping();
    })
    .subscribe();
  return () => supabase.removeChannel(channel);
}

// ── View count ────────────────────────────────────────────────────────────────
export async function incrementViewCount(postId) {
  const { data } = await supabase.from("posts").select("view_count").eq("post_id", postId).single();
  const newCount = (data?.view_count || 0) + 1;
  await supabase.from("posts").update({ view_count: newCount }).eq("post_id", postId);
}

// ── Online / offline presence (realtime, no DB table) ──────────────────────
export function subscribeOnlinePresence(userId, onChange) {
  const channel = supabase.channel("online-users", { config: { presence: { key: userId } } });
  channel.on("presence", { event: "sync" }, () => {
    const state = channel.presenceState();
    onChange(Object.keys(state));
  });
  channel.subscribe(async (status) => {
    if (status === "SUBSCRIBED") await channel.track({ online_at: new Date().toISOString() });
  });
  return () => supabase.removeChannel(channel);
}

// ── Stories / Status ──────────────────────────────────────────────────────────
export async function createStory({ userId, mediaUrl, mediaType, caption }) {
  const { data, error } = await supabase
    .from("stories")
    .insert({ user_id: userId, media_url: mediaUrl, media_type: mediaType, caption: caption || "" })
    .select("*, profiles:user_id(username, profile_pic, verified)")
    .single();
  if (error) throw error;
  return toStory(data);
}

export async function fetchActiveStories() {
  const { data, error } = await supabase
    .from("stories")
    .select("*, profiles:user_id(username, profile_pic, verified)")
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: true });
  if (error) return [];
  return data.map(toStory);
}

export async function deleteStory(storyId) {
  const { error } = await supabase.from("stories").delete().eq("story_id", storyId);
  if (error) throw error;
}

export async function markStoryViewed(storyId, viewerId) {
  const { error } = await supabase.from("story_views").insert({ story_id: storyId, viewer_id: viewerId });
  if (error && error.code !== "23505") throw error;
}

export async function getStoryViewers(storyId) {
  const { data, error } = await supabase
    .from("story_views")
    .select("viewer_id, viewed_at, profiles:viewer_id(username, profile_pic)")
    .eq("story_id", storyId)
    .order("viewed_at", { ascending: false });
  if (error) return [];
  return data.map((r) => ({ userId: r.viewer_id, username: r.profiles?.username, profilePic: r.profiles?.profile_pic, ts: new Date(r.viewed_at).getTime() }));
}

function toStory(row) {
  return {
    storyId: row.story_id,
    userId: row.user_id,
    username: row.profiles?.username,
    profilePic: row.profiles?.profile_pic,
    verified: row.profiles?.verified,
    mediaUrl: row.media_url,
    mediaType: row.media_type,
    caption: row.caption || "",
    createdAt: new Date(row.created_at).getTime(),
    expiresAt: new Date(row.expires_at).getTime(),
  };
}

// ── Verification subscription (monthly paid blue tick) ──────────────────────
export async function requestVerification({ userId, amountPKR, coins, method, reference }) {
  const { data, error } = await supabase
    .from("transactions")
    .insert({ user_id: userId, type: "verification", amount_pkr: amountPKR, coins: coins || 0, method, reference, status: "pending" })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function adminApproveVerification(userId, txId) {
  const verifiedUntil = new Date();
  verifiedUntil.setDate(verifiedUntil.getDate() + 30);
  const { error: pErr } = await supabase
    .from("profiles")
    .update({ verified: true, verified_until: verifiedUntil.toISOString() })
    .eq("user_id", userId);
  if (pErr) throw pErr;
  const { error: tErr } = await supabase.from("transactions").update({ status: "approved" }).eq("id", txId);
  if (tErr) throw tErr;
  await addNotification(userId, "ki verification approve ho gayi hai — 30 din ke liye blue tick mil gaya");
}

export async function adminRejectVerification(txId) {
  const { error } = await supabase.from("transactions").update({ status: "rejected" }).eq("id", txId);
  if (error) throw error;
}

// ── Active co-hosts + live co-host request notifications ────────────────────
export async function getActiveCohosts(roomName) {
  const { data, error } = await supabase
    .from("live_cohost_requests")
    .select("guest_id, profiles:guest_id(username, profile_pic, verified)")
    .eq("room_name", roomName)
    .eq("status", "accepted");
  if (error) return [];
  return data.map((r) => ({
    userId: r.guest_id,
    username: r.profiles?.username,
    profilePic: r.profiles?.profile_pic,
    verified: r.profiles?.verified,
  }));
}

export function subscribeToCohostRequests(hostId, callback) {
  const channel = supabase
    .channel(`cohost-requests-${hostId}`)
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "live_cohost_requests", filter: `host_id=eq.${hostId}` },
      callback
    )
    .subscribe();
  return () => supabase.removeChannel(channel);
}

// ── Live PK Battle (realtime broadcast, no DB table needed) ────────────────
export function subscribeToBattle(roomName, onEvent) {
  const channel = supabase
    .channel(`battle-${roomName}`)
    .on("broadcast", { event: "battle" }, (msg) => onEvent(msg.payload))
    .subscribe();
  return { unsubscribe: () => supabase.removeChannel(channel), channel };
}

export function sendBattleEvent(roomName, payload) {
  const channel = supabase.channel(`battle-${roomName}`);
  channel.send({ type: "broadcast", event: "battle", payload });
}
