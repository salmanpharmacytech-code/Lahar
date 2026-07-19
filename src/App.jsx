import React from "react";
import { useState, useEffect, useRef, useCallback } from "react";
import { Room, RoomEvent, Track, createLocalTracks } from "livekit-client";
import * as db from "./db";
import { supabase } from "./supabaseClient";

// ── LiveKit config ───────────────────────────────────────────────────────────
const LIVEKIT_URL = import.meta.env.VITE_LIVEKIT_URL || "wss://lahar-40sq54fh.livekit.cloud";

async function fetchLiveKitToken({ room, identity, name, canPublish }) {
  const params = new URLSearchParams({ room, identity, name, canPublish: canPublish ? "true" : "false" });
  const res = await fetch(`/.netlify/functions/get-livekit-token?${params.toString()}`);
  if (!res.ok) throw new Error("Token nahi mil saka");
  const data = await res.json();
  return data.token;
}

// ── Icons (emoji-based, no CDN needed) ──────────────────────────────────────
const IC = {
  Home:"🏠", Radio:"📡", Film:"🎬", Search:"🔍", MessageCircle:"💬", User:"👤",
  Heart:"❤️", Gift:"🎁", Share2:"↗️", Plus:"➕", Send:"📨", Wallet:"💰",
  Star:"⭐", Bell:"🔔", ArrowLeft:"←", Upload:"⬆️", X:"✕", Check:"✓",
  Camera:"📷", Edit3:"✏️", Lock:"🔒", LogOut:"🚪", ShieldCheck:"🛡️",
  Sparkles:"✨", Play:"▶️", Eye:"👁️", Banknote:"💵", UserPlus:"➕",
  Settings:"⚙️", Radio2:"🔴", CheckCircle:"✅", Image:"🖼️", MoreVertical:"⋮",
  Trash:"🗑️",
};
const Ic = ({n,size=16,cls=""}) => <span className={cls} style={{fontSize:size}}>{IC[n]||"●"}</span>;

// ── Config ───────────────────────────────────────────────────────────────────
const APP_NAME = "Lehar";
const OWNER_PAYMENT = { Easypaisa:"03478946876", JazzCash:"03127847503", SadaPay:"03449649860" };
const TOPUP_COINS_PER_PKR = 1/20;
const WITHDRAW_COINS_PER_PKR = 1/12;
const MIN_TOPUP_PKR = 3000;
const GIFTS = [
  {id:"rose",name:"Rose",emoji:"🌹",cost:500,pkr:50},
  {id:"kiss",name:"Kiss",emoji:"💋",cost:2000,pkr:200},
  {id:"heart",name:"Heart",emoji:"💖",cost:5000,pkr:500},
  {id:"crown",name:"Crown",emoji:"👑",cost:50000,pkr:5000},
  {id:"dragon",name:"Dragon",emoji:"🐉",cost:400000,pkr:40000},
  {id:"star",name:"Star",emoji:"⭐",cost:500000,pkr:50000},
  {id:"diamond",name:"Diamond",emoji:"💎",cost:600000,pkr:60000},
  {id:"lion",name:"Lion",emoji:"🦁",cost:1000000,pkr:100000},
  {id:"gwagon",name:"G-Wagon",emoji:"🚙",cost:2000000,pkr:200000},
];
const AVATAR_COLORS = ["#e11d48","#f59e0b","#7c3aed","#059669","#0284c7","#c026d3","#ea580c"];
const REACTIONS = [
  {id:"heart",emoji:"❤️"},
  {id:"laugh",emoji:"😂"},
  {id:"sad",emoji:"😢"},
];

// ── Helpers ──────────────────────────────────────────────────────────────────
function uid(p){ return `${p}${Date.now().toString(36)}${Math.random().toString(36).slice(2,8)}`; }
function avatarColor(name){ let h=0; for(let i=0;i<(name||"").length;i++) h=(h+name.charCodeAt(i))%AVATAR_COLORS.length; return AVATAR_COLORS[h]; }
function timeAgo(ts){ const d=Math.max(0,Date.now()-ts),m=Math.floor(d/60000); if(m<1)return"abhi"; if(m<60)return`${m}m`; const h=Math.floor(m/60); if(h<24)return`${h}h`; return`${Math.floor(h/24)}d`; }

// ── UI Primitives ─────────────────────────────────────────────────────────────
function Avatar({name,size=40,live=false,pic=null,verified=false}){
  const bg=avatarColor(name); const initial=(name||"?")[0]?.toUpperCase()||"?";
  return (
    <div style={{position:"relative",width:size,height:size,flexShrink:0}}>
      <div style={{width:size,height:size,borderRadius:"50%",background:pic?"transparent":bg,border:live?"2px solid #e11d48":"none",overflow:"hidden",display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontWeight:700,fontSize:size*0.4}}>
        {pic?<img src={pic} alt={name} style={{width:"100%",height:"100%",objectFit:"cover"}}/>:initial}
      </div>
      {live&&<span style={{position:"absolute",bottom:-4,left:"50%",transform:"translateX(-50%)",background:"#be123c",color:"#fff",fontSize:8,padding:"1px 5px",borderRadius:999,fontWeight:700}}>LIVE</span>}
      {verified&&<span style={{position:"absolute",bottom:0,right:0,fontSize:10}}>✅</span>}
    </div>
  );
}

function CoinPill({value,onClick}){
  return <button onClick={onClick} style={{display:"flex",alignItems:"center",gap:4,background:"#171717",border:"1px solid #f59e0b",borderRadius:999,padding:"4px 10px",cursor:"pointer"}}><span style={{color:"#f59e0b",fontSize:12}}>⭐</span><span style={{color:"#f59e0b",fontWeight:700,fontSize:13,fontFamily:"monospace"}}>{value??0}</span></button>;
}

function Btn({children,onClick,disabled,style={},ghost=false}){
  const base={fontWeight:700,borderRadius:14,padding:"10px 16px",border:"none",cursor:disabled?"not-allowed":"pointer",opacity:disabled?0.4:1,fontSize:14,display:"flex",alignItems:"center",justifyContent:"center",gap:6,transition:"all .15s",...style};
  const theme=ghost?{background:"transparent",border:"1px solid #404040",color:"#e5e5e5"}:{background:"linear-gradient(135deg,#f59e0b,#e11d48)",color:"#0a0a0a"};
  return <button onClick={disabled?undefined:onClick} style={{...base,...theme}}>{children}</button>;
}

function Toast({text}){ if(!text)return null; return <div style={{position:"fixed",top:16,left:"50%",transform:"translateX(-50%)",background:"#fafafa",color:"#0a0a0a",padding:"8px 18px",borderRadius:999,fontWeight:600,fontSize:13,zIndex:300,whiteSpace:"nowrap",boxShadow:"0 4px 20px rgba(0,0,0,.4)"}}>{text}</div>; }

function GiftBurst({burst}){
  if(!burst)return null;
  return <div key={burst.key} style={{position:"fixed",inset:0,zIndex:250,display:"flex",alignItems:"center",justifyContent:"center",pointerEvents:"none"}}><div style={{textAlign:"center",animation:"giftPop 2.1s ease-out forwards"}}><div style={{fontSize:64}}>{burst.emoji}</div><div style={{fontWeight:800,fontSize:18,background:"linear-gradient(90deg,#fcd34d,#fb7185)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}}>{burst.from} ne {burst.name} bheja!</div></div></div>;
}

function ConfirmDialog({title,message,onConfirm,onCancel}){
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.7)",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center",padding:24}} onClick={onCancel}>
      <div style={{background:"#171717",border:"1px solid #262626",borderRadius:18,padding:20,width:"100%",maxWidth:320}} onClick={e=>e.stopPropagation()}>
        <h3 style={{color:"#fafafa",margin:"0 0 8px",fontWeight:700,fontSize:16}}>{title}</h3>
        <p style={{color:"#a3a3a3",fontSize:13,margin:"0 0 16px"}}>{message}</p>
        <div style={{display:"flex",gap:8}}>
          <Btn ghost onClick={onCancel} style={{flex:1}}>Cancel</Btn>
          <Btn onClick={onConfirm} style={{flex:1,background:"#e11d48",color:"#fff"}}>Delete</Btn>
        </div>
      </div>
    </div>
  );
}

// ── Auth ──────────────────────────────────────────────────────────────────────
function AuthScreen({notify}){
  const [mode,setMode]=useState("login");
  const [email,setEmail]=useState("");
  const [username,setUsername]=useState("");
  const [password,setPassword]=useState("");
  const [confirm,setConfirm]=useState("");
  const [busy,setBusy]=useState(false);

  async function handleSubmit(){
    const em=email.trim().toLowerCase();
    if(!em.includes("@"))return notify("Sahi email likhein");
    if(password.length<6)return notify("Password kam az kam 6 huroof ka ho");
    setBusy(true);
    try{
      if(mode==="signup"){
        const uname=username.trim().toLowerCase();
        if(uname.length<3){notify("Username 3+ huroof ka ho");setBusy(false);return;}
        if(!/^[a-z0-9_.]+$/.test(uname)){notify("Username mein sirf huroof, number, _ ya . ho sakte hain");setBusy(false);return;}
        if(password!==confirm){notify("Password match nahi");setBusy(false);return;}
        await db.signUp({email:em,password,username:uname});
        notify("Account ban gaya! Login ho rahe hain...");
      } else {
        await db.signIn({email:em,password});
      }
    } catch(e){
      notify(translateAuthError(e?.message)||"Kuch ghalat ho gaya");
    } finally { setBusy(false); }
  }

  const inp={width:"100%",background:"#171717",border:"1px solid #262626",borderRadius:12,padding:"12px 14px",color:"#fafafa",fontSize:14,outline:"none",boxSizing:"border-box"};
  return (
    <div style={{minHeight:"100%",display:"flex",flexDirection:"column",justifyContent:"center",padding:"40px 24px"}}>
      <div style={{textAlign:"center",marginBottom:32}}>
        <div style={{fontSize:40,marginBottom:4}}>🌊</div>
        <h1 style={{fontSize:32,fontWeight:900,color:"#fafafa",margin:0}}>{APP_NAME}</h1>
        <p style={{color:"#525252",fontSize:13,marginTop:4}}>Short videos • Live • Real gifting</p>
      </div>
      <div style={{display:"flex",background:"#171717",borderRadius:14,padding:4,marginBottom:20}}>
        {["login","signup"].map(m=><button key={m} onClick={()=>setMode(m)} style={{flex:1,padding:"8px",borderRadius:10,border:"none",fontWeight:700,fontSize:13,background:mode===m?"#fafafa":"transparent",color:mode===m?"#0a0a0a":"#737373",cursor:"pointer"}}>{m==="login"?"Login":"Signup"}</button>)}
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:10}}>
        {mode==="signup"&&<input value={username} onChange={e=>setUsername(e.target.value)} placeholder="Username" style={inp}/>}
        <input value={email} onChange={e=>setEmail(e.target.value)} placeholder="Email" type="email" style={inp}/>
        <input value={password} onChange={e=>setPassword(e.target.value)} type="password" placeholder="Password" style={inp}/>
        {mode==="signup"&&<input value={confirm} onChange={e=>setConfirm(e.target.value)} type="password" placeholder="Password dobara likhein" style={inp}/>}
        <Btn onClick={handleSubmit} disabled={busy} style={{width:"100%",marginTop:4}}>{busy?"⟳ ":""}{mode==="login"?"Login Karein":"Account Banayen"}</Btn>
      </div>
    </div>
  );
}

function translateAuthError(msg){
  if(!msg) return null;
  if(msg.includes("already registered")||msg.includes("already been registered")) return "Email pehle se mojood hai";
  if(msg.includes("Invalid login credentials")) return "Email ya password ghalat hai";
  if(msg.includes("duplicate key")&&msg.includes("username")) return "Username pehle se mojood hai";
  if(msg.includes("Password should be")) return "Password kam az kam 6 huroof ka ho";
  return msg;
}
// ── Comment Sheet ─────────────────────────────────────────────────────────────
function CommentSheet({post,user,onClose,onAddComment,onReact,onDeleteComment}){
  const [text,setText]=useState("");
  const isPostOwner=post.userId===user.userId;
  const inp={flex:1,background:"#0a0a0a",border:"1px solid #262626",borderRadius:999,padding:"8px 14px",color:"#fafafa",fontSize:13,outline:"none"};
  return (
    <div style={{position:"fixed",inset:0,zIndex:120,display:"flex",flexDirection:"column",justifyContent:"flex-end"}}>
      <div style={{flex:1}} onClick={onClose}/>
      <div style={{background:"#171717",borderTop:"1px solid #262626",borderRadius:"20px 20px 0 0",maxHeight:"70vh",display:"flex",flexDirection:"column"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"12px 16px",borderBottom:"1px solid #262626"}}>
          <span style={{fontWeight:700,color:"#fafafa"}}>Comments ({post.comments?.length||0})</span>
          <button onClick={onClose} style={{color:"#737373",background:"none",border:"none",fontSize:18,cursor:"pointer"}}>✕</button>
        </div>
        <div style={{flex:1,overflowY:"auto",padding:"8px 16px",display:"flex",flexDirection:"column",gap:8}}>
          {(post.comments||[]).map((c)=>(
            <div key={c.id} style={{display:"flex",gap:8,alignItems:"flex-start"}}>
              <Avatar name={c.username} size={28} pic={c.profilePic}/>
              <div style={{background:"#0a0a0a",borderRadius:10,padding:"6px 10px",flex:1}}>
                <span style={{fontWeight:700,color:"#fafafa",fontSize:12}}>{c.username} </span>
                <span style={{color:c.isGift?"#fcd34d":"#d4d4d4",fontSize:13}}>{c.text}</span>
                <div style={{display:"flex",alignItems:"center",gap:6,marginTop:4}}>
                  {REACTIONS.map(r=>(
                    <button key={r.id} onClick={()=>onReact(c,r.id)} style={{background:c.reaction===r.id?"rgba(245,158,11,.25)":"none",border:"none",cursor:"pointer",fontSize:13,borderRadius:8,padding:"1px 4px",opacity:c.reaction===r.id?1:0.55}}>{r.emoji}</button>
                  ))}
                  {(c.userId===user.userId||isPostOwner)&&(
                    <button onClick={()=>onDeleteComment(c)} style={{marginLeft:"auto",background:"none",border:"none",cursor:"pointer",fontSize:11,color:"#737373"}}>🗑️</button>
                  )}
                </div>
              </div>
            </div>
          ))}
          {(post.comments||[]).length===0&&<p style={{color:"#525252",fontSize:13,textAlign:"center",padding:"20px 0"}}>Koi comment nahi — pehle aap karein!</p>}
        </div>
        <div style={{display:"flex",gap:8,padding:10,borderTop:"1px solid #262626"}}>
          <Avatar name={user.username} size={28} pic={user.profilePic}/>
          <input value={text} onChange={e=>setText(e.target.value)} onKeyDown={e=>e.key==="Enter"&&text.trim()&&(onAddComment(text.trim()),setText(""))} placeholder="Comment likhein..." style={inp}/>
          <button onClick={()=>{if(text.trim()){onAddComment(text.trim());setText("");}}} style={{background:"#f59e0b",color:"#0a0a0a",border:"none",borderRadius:999,padding:"0 14px",fontWeight:700,cursor:"pointer"}}>↑</button>
        </div>
      </div>
    </div>
  );
}

// ── Gift Sheet ────────────────────────────────────────────────────────────────
function GiftSheet({balance,onClose,onSend}){
  return (
    <div style={{position:"fixed",inset:0,zIndex:120,display:"flex",flexDirection:"column",justifyContent:"flex-end"}}>
      <div style={{flex:1}} onClick={onClose}/>
      <div style={{background:"#171717",borderTop:"1px solid #262626",borderRadius:"20px 20px 0 0"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"12px 16px",borderBottom:"1px solid #262626"}}>
          <span style={{fontWeight:700,color:"#fafafa"}}>🎁 Gift Bhejein</span>
          <CoinPill value={balance}/>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8,padding:14,maxHeight:240,overflowY:"auto"}}>
          {GIFTS.map(g=>(
            <button key={g.id} onClick={()=>onSend(g)} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:4,background:"#0a0a0a",border:"1px solid #262626",borderRadius:12,padding:"10px 4px",cursor:"pointer"}}>
              <span style={{fontSize:26}}>{g.emoji}</span>
              <span style={{color:"#d4d4d4",fontSize:10,fontWeight:600}}>{g.name}</span>
              <span style={{color:"#f59e0b",fontSize:10,fontFamily:"monospace"}}>{g.cost}</span>
            </button>
          ))}
        </div>
        <p style={{textAlign:"center",color:"#525252",fontSize:11,paddingBottom:12}}>Coins kam hain? Wallet se khareedein</p>
      </div>
    </div>
  );
}

// ── Post Card ─────────────────────────────────────────────────────────────────
function PostCard({post,user,onLike,onOpenComments,onOpenGift,onOpenLive,onOpenMedia,onDelete}){
  const liked=post.likes?.includes(user.userId);
  const author=post.author;
  const canDelete=post.userId===user.userId||user.isAdmin;
  const [menuOpen,setMenuOpen]=useState(false);
  return (
    <div style={{background:"#171717",border:"1px solid #262626",borderRadius:18,overflow:"hidden",marginBottom:14}}>
      <div style={{display:"flex",alignItems:"center",gap:10,padding:"10px 12px"}}>
        <Avatar name={post.username} live={post.isLive} pic={author?.profilePic} verified={author?.verified}/>
        <div style={{flex:1}}>
          <div style={{display:"flex",alignItems:"center",gap:4}}>
            <span style={{fontWeight:700,color:"#fafafa",fontSize:13}}>{post.username}</span>
            {author?.verified&&<span style={{fontSize:11}}>✅</span>}
          </div>
          <span style={{color:"#525252",fontSize:11}}>{timeAgo(post.createdAt)} pehle</span>
        </div>
        {post.isLive&&<button onClick={()=>onOpenLive(post)} style={{background:"#be123c",color:"#fff",border:"none",borderRadius:999,padding:"6px 12px",fontSize:11,fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",gap:4}}>📡 Join Live</button>}
        {canDelete&&(
          <div style={{position:"relative"}}>
            <button onClick={()=>setMenuOpen(v=>!v)} style={{background:"none",border:"none",color:"#737373",fontSize:16,cursor:"pointer",padding:4}}>⋮</button>
            {menuOpen&&(
              <div style={{position:"absolute",right:0,top:24,background:"#0a0a0a",border:"1px solid #262626",borderRadius:10,overflow:"hidden",zIndex:10,minWidth:120}}>
                <button onClick={()=>{setMenuOpen(false);onDelete(post);}} style={{display:"flex",alignItems:"center",gap:6,width:"100%",padding:"10px 12px",background:"none",border:"none",color:"#e11d48",fontSize:12,fontWeight:600,cursor:"pointer"}}>🗑️ Delete</button>
              </div>
            )}
          </div>
        )}
      </div>
      {post.mediaData&&post.mediaType==="video"?(
        <div style={{position:"relative",background:"#000",cursor:"pointer"}} onClick={()=>onOpenMedia(post)}>
          <video src={post.mediaData} style={{width:"100%",maxHeight:360,display:"block"}} muted playsInline preload="metadata"/>
          <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center"}}><div style={{background:"rgba(0,0,0,.5)",borderRadius:"50%",width:48,height:48,display:"flex",alignItems:"center",justifyContent:"center",fontSize:22}}>▶️</div></div>
        </div>
      ):post.mediaData&&post.mediaType==="image"?(
        <img src={post.mediaData} alt="post" style={{width:"100%",maxHeight:400,objectFit:"cover",display:"block",cursor:"pointer"}} onClick={()=>onOpenMedia(post)}/>
      ):null}
      {post.caption&&<p style={{padding:"8px 14px",color:"#e5e5e5",fontSize:14,lineHeight:1.5}}>{post.caption}</p>}
      <div style={{display:"flex",alignItems:"center",gap:16,padding:"10px 14px",borderTop:"1px solid #262626"}}>
        <button onClick={()=>onLike(post)} style={{display:"flex",alignItems:"center",gap:5,background:"none",border:"none",cursor:"pointer",color:liked?"#e11d48":"#737373",fontSize:13}}>❤️ {post.likes?.length||0}</button>
        <button onClick={()=>onOpenComments(post)} style={{display:"flex",alignItems:"center",gap:5,background:"none",border:"none",cursor:"pointer",color:"#737373",fontSize:13}}>💬 {post.comments?.length||0}</button>
        <button onClick={()=>onOpenGift(post)} style={{display:"flex",alignItems:"center",gap:5,background:"none",border:"none",cursor:"pointer",color:"#f59e0b",fontSize:13}}>🎁 Gift</button>
        <button style={{display:"flex",alignItems:"center",gap:5,background:"none",border:"none",cursor:"pointer",color:"#737373",fontSize:13,marginLeft:"auto"}}>↗️</button>
      </div>
    </div>
  );
}

// ── Fullscreen Media Viewer (fixes "video post pe click karke open nahi hota") ─
function MediaViewerModal({post,onClose}){
  if(!post) return null;
  return (
    <div style={{position:"fixed",inset:0,zIndex:200,background:"#000",display:"flex",flexDirection:"column"}} onClick={onClose}>
      <button onClick={onClose} style={{position:"absolute",top:14,right:14,background:"rgba(255,255,255,.15)",border:"none",borderRadius:"50%",width:34,height:34,color:"#fff",fontSize:16,cursor:"pointer",zIndex:5}}>✕</button>
      <div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center"}} onClick={e=>e.stopPropagation()}>
        {post.mediaType==="video"?(
          <video src={post.mediaData} style={{maxWidth:"100%",maxHeight:"100%"}} controls autoPlay playsInline/>
        ):(
          <img src={post.mediaData} alt="" style={{maxWidth:"100%",maxHeight:"100%",objectFit:"contain"}}/>
        )}
      </div>
      {post.caption&&<p style={{color:"#fafafa",fontSize:13,padding:14,textAlign:"center"}}>{post.caption}</p>}
    </div>
  );
}
// ── Feed View ─────────────────────────────────────────────────────────────────
function FeedView({posts,user,refreshFeed,notify,fireBurst,onOpenLive}){
  const [commentPost,setCommentPost]=useState(null);
  const [giftPost,setGiftPost]=useState(null);
  const [mediaPost,setMediaPost]=useState(null);
  const [confirmDelete,setConfirmDelete]=useState(null);
  const visible=posts.filter(p=>!p.isLive&&!p.isReel);

  async function handleLike(post){
    const liked=post.likes?.includes(user.userId);
    try{ await db.toggleLike(post.postId,user.userId,liked); refreshFeed(); }catch(e){ notify("Like nahi ho saka"); }
  }
  async function handleAddComment(text){
    try{ await db.addComment(commentPost.postId,user.userId,text); await refreshFeed();
      setCommentPost(prev=>prev?{...prev}:null);
    }catch(e){ notify("Comment nahi ho saka"); }
  }
  async function handleReact(comment,reaction){
    try{ await db.setCommentReaction(comment.id,comment.reaction===reaction?null:reaction); refreshFeed(); }catch(e){}
  }
  async function handleDeleteComment(comment){
    try{ await db.deleteComment(comment.id); await refreshFeed(); }catch(e){ notify("Delete nahi ho saka"); }
  }
  async function handleSendGift(gift){
    try{
      const newBal=await db.sendGift({fromId:user.userId,toId:giftPost.userId,postId:giftPost.postId,gift});
      fireBurst({emoji:gift.emoji,name:gift.name,from:user.username});
      setGiftPost(null); refreshFeed();
      window.dispatchEvent(new CustomEvent("lehar:balance",{detail:newBal}));
    }catch(e){
      notify(e?.message==="INSUFFICIENT_COINS"?"Coins kam hain":"Gift nahi bheja ja saka");
    }
  }
  async function handleDelete(post){
    try{ await db.deletePost(post.postId); setConfirmDelete(null); refreshFeed(); notify("Post delete ho gayi"); }
    catch(e){ notify("Delete nahi ho saka"); }
  }
  return (
    <div style={{padding:"10px 12px"}}>
      {visible.length===0&&<div style={{textAlign:"center",padding:"60px 0",color:"#525252"}}><div style={{fontSize:36,marginBottom:8}}>🖼️</div><p>Koi post nahi — + button se post karein!</p></div>}
      {visible.map(post=><PostCard key={post.postId} post={post} user={user} onLike={handleLike} onOpenComments={setCommentPost} onOpenGift={setGiftPost} onOpenLive={onOpenLive} onOpenMedia={setMediaPost} onDelete={setConfirmDelete}/>)}
      {commentPost&&<CommentSheet post={posts.find(p=>p.postId===commentPost.postId)||commentPost} user={user} onClose={()=>setCommentPost(null)} onAddComment={handleAddComment} onReact={handleReact} onDeleteComment={handleDeleteComment}/>}
      {giftPost&&<GiftSheet balance={user.coinBalance} onClose={()=>setGiftPost(null)} onSend={handleSendGift}/>}
      {mediaPost&&<MediaViewerModal post={mediaPost} onClose={()=>setMediaPost(null)}/>}
      {confirmDelete&&<ConfirmDialog title="Post delete karein?" message="Ye post hamesha ke liye delete ho jayegi." onConfirm={()=>handleDelete(confirmDelete)} onCancel={()=>setConfirmDelete(null)}/>}
    </div>
  );
}

// ── shared file validation ───────────────────────────────────────────────────
function validateMediaFile(file,{video=true,image=true,maxMB=50}={}){
  if(video&&file.type.startsWith("video")){
    if(file.size>maxMB*1024*1024) return `Video ${maxMB}MB se choti honi chahiye`;
    return null;
  }
  if(image&&file.type.startsWith("image")){
    if(file.size>15*1024*1024) return "Image 15MB se choti honi chahiye";
    return null;
  }
  return "Sirf photo ya video upload karein";
}

// ── Reel Upload Modal ─────────────────────────────────────────────────────────
function ReelUploadModal({user,onDone,onClose,notify}){
  const [caption,setCaption]=useState("");
  const [file,setFile]=useState(null);
  const [previewUrl,setPreviewUrl]=useState(null);
  const [busy,setBusy]=useState(false);
  const fileRef=useRef(null);
  function onFileChange(e){
    const f=e.target.files?.[0]; if(!f)return;
    if(!f.type.startsWith("video")){notify("Sirf video upload karein reel mein");return;}
    if(f.size>50*1024*1024){notify("Video 50MB se choti honi chahiye");return;}
    setFile(f); setPreviewUrl(URL.createObjectURL(f));
  }
  async function submit(){
    if(!file){notify("Pehle video choose karein");return;}
    setBusy(true);
    try{
      const mediaUrl=await db.uploadMedia(file,user.userId);
      await db.createPost({userId:user.userId,caption:caption.trim(),mediaUrl,mediaType:"video",isReel:true});
      onDone();
    }catch(e){
      notify("Upload nahi ho saka — dobara koshish karein");
    } finally { setBusy(false); }
  }
  const inp={width:"100%",background:"#171717",border:"1px solid #262626",borderRadius:12,padding:"10px 14px",color:"#fafafa",fontSize:13,outline:"none",boxSizing:"border-box",resize:"none"};
  return (
    <div style={{position:"fixed",inset:0,zIndex:130,background:"rgba(0,0,0,.8)",display:"flex",flexDirection:"column",justifyContent:"flex-end"}}>
      <div style={{background:"#0a0a0a",borderTop:"1px solid #262626",borderRadius:"20px 20px 0 0",padding:20}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
          <span style={{fontWeight:700,color:"#fafafa",fontSize:17}}>🎬 Reel Upload Karein</span>
          <button onClick={onClose} style={{background:"none",border:"none",color:"#737373",fontSize:20,cursor:"pointer"}}>✕</button>
        </div>
        <input ref={fileRef} type="file" accept="video/*" style={{display:"none"}} onChange={onFileChange}/>
        {previewUrl?(
          <div style={{position:"relative",marginBottom:12,borderRadius:12,overflow:"hidden",background:"#000"}}>
            <video src={previewUrl} style={{width:"100%",maxHeight:180}} controls/>
            <button onClick={()=>{setFile(null);setPreviewUrl(null);}} style={{position:"absolute",top:6,right:6,background:"rgba(0,0,0,.6)",border:"none",borderRadius:"50%",width:24,height:24,cursor:"pointer",color:"#fff",fontSize:12}}>✕</button>
          </div>
        ):(
          <button onClick={()=>fileRef.current?.click()} style={{width:"100%",height:100,border:"2px dashed #404040",borderRadius:12,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:6,marginBottom:12,background:"none",cursor:"pointer",color:"#525252"}}>
            <span style={{fontSize:28}}>⬆️</span><span style={{fontSize:13}}>Gallery se Video choose karein</span>
          </button>
        )}
        <textarea value={caption} onChange={e=>setCaption(e.target.value)} placeholder="Caption likhein (optional)..." rows={2} style={{...inp,marginBottom:12}}/>
        <Btn onClick={submit} disabled={busy||!file} style={{width:"100%"}}>{busy?"⟳ Uploading...":"⬆️ Reel Post Karein"}</Btn>
      </div>
    </div>
  );
}

// ── Reels View ────────────────────────────────────────────────────────────────
function ReelsView({posts,user,notify,refreshFeed,fireBurst}){
  const reels=posts.filter(p=>p.isReel);
  const [current,setCurrent]=useState(0);
  const [commentPost,setCommentPost]=useState(null);
  const [giftPost,setGiftPost]=useState(null);
  const [showUpload,setShowUpload]=useState(false);
  const [confirmDelete,setConfirmDelete]=useState(null);
  const [muted,setMuted]=useState(false); // sound ON by default — bug fix
  const vRef=useRef(null);
  useEffect(()=>{ if(vRef.current){vRef.current.load();vRef.current.play().catch(()=>{}); } },[current]);

  async function handleLike(){
    const post=reels[current]; if(!post)return;
    const liked=post.likes?.includes(user.userId);
    try{ await db.toggleLike(post.postId,user.userId,liked); refreshFeed(); }catch(e){}
  }
  async function handleSendGift(gift){
    const post=reels[current]; if(!post)return;
    try{
      const newBal=await db.sendGift({fromId:user.userId,toId:post.userId,postId:post.postId,gift});
      fireBurst({emoji:gift.emoji,name:gift.name,from:user.username}); setGiftPost(null);
      window.dispatchEvent(new CustomEvent("lehar:balance",{detail:newBal}));
    }catch(e){ notify(e?.message==="INSUFFICIENT_COINS"?"Coins kam hain":"Gift nahi bheja ja saka"); }
  }
  async function handleDelete(post){
    try{ await db.deletePost(post.postId); setConfirmDelete(null); setCurrent(c=>Math.max(0,c-1)); refreshFeed(); notify("Reel delete ho gayi"); }
    catch(e){ notify("Delete nahi ho saka"); }
  }

  if(reels.length===0) return (
    <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:12,color:"#525252"}}>
      <span style={{fontSize:40}}>🎬</span><p>Abhi koi Reel nahi</p>
      <Btn onClick={()=>setShowUpload(true)}>⬆️ Reel Upload Karein</Btn>
      {showUpload&&<ReelUploadModal user={user} notify={notify} onClose={()=>setShowUpload(false)} onDone={()=>{setShowUpload(false);refreshFeed();notify("Reel upload ho gayi!");}}/>}
    </div>
  );

  const post=reels[current]||reels[0];
  const isLiked=post.likes?.includes(user.userId);
  const canDelete=post.userId===user.userId||user.isAdmin;

  return (
    <div style={{flex:1,position:"relative",background:"#000",overflow:"hidden"}}>
      <video ref={vRef} src={post.mediaData} style={{width:"100%",height:"100%",objectFit:"cover"}} loop playsInline autoPlay muted={muted} onClick={()=>setMuted(m=>!m)}/>
      <div style={{position:"absolute",inset:0,display:"flex",pointerEvents:"none"}}>
        <div style={{flex:1,pointerEvents:"auto"}} onClick={()=>setCurrent(c=>Math.max(0,c-1))}/>
        <div style={{flex:1,pointerEvents:"auto"}} onClick={()=>setCurrent(c=>Math.min(reels.length-1,c+1))}/>
      </div>
      <button onClick={()=>setMuted(m=>!m)} style={{position:"absolute",top:10,left:10,background:"rgba(0,0,0,.4)",border:"none",borderRadius:"50%",width:32,height:32,color:"#fff",fontSize:14,cursor:"pointer",zIndex:5}}>{muted?"🔇":"🔊"}</button>
      <div style={{position:"absolute",right:12,bottom:100,display:"flex",flexDirection:"column",alignItems:"center",gap:18}}>
        <button onClick={handleLike} style={{display:"flex",flexDirection:"column",alignItems:"center",background:"none",border:"none",cursor:"pointer"}}>
          <span style={{fontSize:26,filter:isLiked?"drop-shadow(0 0 6px #e11d48)":""}}>{isLiked?"❤️":"🤍"}</span>
          <span style={{color:"#fff",fontSize:11}}>{post.likes?.length||0}</span>
        </button>
        <button onClick={()=>setCommentPost(post)} style={{display:"flex",flexDirection:"column",alignItems:"center",background:"none",border:"none",cursor:"pointer"}}>
          <span style={{fontSize:26}}>💬</span><span style={{color:"#fff",fontSize:11}}>{post.comments?.length||0}</span>
        </button>
        <button onClick={()=>setGiftPost(post)} style={{display:"flex",flexDirection:"column",alignItems:"center",background:"none",border:"none",cursor:"pointer"}}>
          <span style={{fontSize:26}}>🎁</span><span style={{color:"#f59e0b",fontSize:11}}>Gift</span>
        </button>
        {canDelete&&(
          <button onClick={()=>setConfirmDelete(post)} style={{display:"flex",flexDirection:"column",alignItems:"center",background:"none",border:"none",cursor:"pointer"}}>
            <span style={{fontSize:24}}>🗑️</span>
          </button>
        )}
      </div>
      <div style={{position:"absolute",bottom:80,left:12,right:60}}>
        <p style={{fontWeight:700,color:"#fff",fontSize:13}}>@{post.username}</p>
        {post.caption&&<p style={{color:"rgba(255,255,255,.8)",fontSize:12,marginTop:2}}>{post.caption}</p>}
        <button onClick={()=>setShowUpload(true)} style={{marginTop:8,display:"flex",alignItems:"center",gap:5,background:"rgba(255,255,255,.2)",border:"1px solid rgba(255,255,255,.3)",borderRadius:999,padding:"5px 10px",color:"#fff",fontSize:11,fontWeight:700,cursor:"pointer",backdropFilter:"blur(8px)"}}>⬆️ Reel Upload</button>
      </div>
      <div style={{position:"absolute",top:10,right:10,background:"rgba(0,0,0,.4)",borderRadius:999,padding:"3px 10px",color:"#fff",fontSize:11}}>{current+1}/{reels.length}</div>
      {commentPost&&<CommentSheet post={reels.find(p=>p.postId===commentPost.postId)||commentPost} user={user} onClose={()=>setCommentPost(null)} onAddComment={async(text)=>{
        try{ await db.addComment(commentPost.postId,user.userId,text); refreshFeed(); }catch(e){}
      }} onReact={async(comment,reaction)=>{ try{ await db.setCommentReaction(comment.id,comment.reaction===reaction?null:reaction); refreshFeed(); }catch(e){} }} onDeleteComment={async(comment)=>{ try{ await db.deleteComment(comment.id); refreshFeed(); }catch(e){} }}/>}
      {giftPost&&<GiftSheet balance={user.coinBalance} onClose={()=>setGiftPost(null)} onSend={handleSendGift}/>}
      {showUpload&&<ReelUploadModal user={user} notify={notify} onClose={()=>setShowUpload(false)} onDone={()=>{setShowUpload(false);refreshFeed();notify("Reel upload ho gayi!");}}/>}
      {confirmDelete&&<ConfirmDialog title="Reel delete karein?" message="Ye reel hamesha ke liye delete ho jayegi." onConfirm={()=>handleDelete(confirmDelete)} onCancel={()=>setConfirmDelete(null)}/>}
    </div>
  );
}

// ── Create (post) View ───────────────────────────────────────────────────────
function CreateView({user,notify,onDone}){
  const [caption,setCaption]=useState("");
  const [file,setFile]=useState(null);
  const [previewUrl,setPreviewUrl]=useState(null);
  const [mediaType,setMediaType]=useState(null);
  const [isReel,setIsReel]=useState(false);
  const [busy,setBusy]=useState(false);
  const fileRef=useRef(null);

  function onFileChange(e){
    const f=e.target.files?.[0]; if(!f)return;
    const err=validateMediaFile(f);
    if(err){notify(err);return;}
    setFile(f);
    setPreviewUrl(URL.createObjectURL(f));
    setMediaType(f.type.startsWith("video")?"video":"image");
  }

  async function submit(){
    if(!file&&!caption.trim()){notify("Kuch likhein ya media chunein");return;}
    setBusy(true);
    try{
      let mediaUrl=null;
      if(file) mediaUrl=await db.uploadMedia(file,user.userId);
      const post=await db.createPost({userId:user.userId,caption:caption.trim(),mediaUrl,mediaType:file?mediaType:null,isReel:mediaType==="video"&&isReel});
      onDone(post);
    }catch(e){
      notify("Upload nahi ho saka — dobara koshish karein");
    } finally { setBusy(false); }
  }

  const inp={width:"100%",background:"#171717",border:"1px solid #262626",borderRadius:12,padding:"10px 14px",color:"#fafafa",fontSize:13,outline:"none",boxSizing:"border-box",resize:"none"};
  return (
    <div style={{padding:16}}>
      <input ref={fileRef} type="file" accept="image/*,video/*" style={{display:"none"}} onChange={onFileChange}/>
      {previewUrl?(
        <div style={{position:"relative",marginBottom:12,borderRadius:12,overflow:"hidden",background:"#000"}}>
          {mediaType==="video"?<video src={previewUrl} style={{width:"100%",maxHeight:240}} controls/>:<img src={previewUrl} alt="" style={{width:"100%",maxHeight:240,objectFit:"cover"}}/>}
          <button onClick={()=>{setFile(null);setPreviewUrl(null);setMediaType(null);setIsReel(false);}} style={{position:"absolute",top:6,right:6,background:"rgba(0,0,0,.6)",border:"none",borderRadius:"50%",width:26,height:26,cursor:"pointer",color:"#fff",fontSize:14}}>✕</button>
        </div>
      ):(
        <button onClick={()=>fileRef.current?.click()} style={{width:"100%",height:100,border:"2px dashed #404040",borderRadius:12,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:6,marginBottom:12,background:"none",cursor:"pointer",color:"#525252"}}>
          <span style={{fontSize:28}}>⬆️</span><span style={{fontSize:13}}>Gallery se Photo ya Video (optional)</span>
        </button>
      )}
      <textarea value={caption} onChange={e=>setCaption(e.target.value)} placeholder="Kuch likhein... (text, status, etc.)" rows={4} style={{...inp,marginBottom:12}}/>
      {mediaType==="video"&&(
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",background:"#171717",border:"1px solid #262626",borderRadius:12,padding:"10px 14px",marginBottom:12}}>
          <span style={{color:"#d4d4d4",fontSize:13}}>Reel ki tarah post karein</span>
          <button onClick={()=>setIsReel(v=>!v)} style={{width:40,height:22,borderRadius:999,border:"none",background:isReel?"#f59e0b":"#404040",cursor:"pointer",position:"relative",transition:"all .2s"}}>
            <div style={{width:18,height:18,background:"#fff",borderRadius:"50%",position:"absolute",top:2,left:isReel?20:2,transition:"all .2s"}}/>
          </button>
        </div>
      )}
      <Btn onClick={submit} disabled={busy} style={{width:"100%"}}>{busy?"⟳ Uploading...":"➕ Post Karein"}</Btn>
    </div>
  );
}
// ── Go Live View ──────────────────────────────────────────────────────────────
function GoLiveView({user,onDone,notify}){
  const [title,setTitle]=useState("");
  const [busy,setBusy]=useState(false);
  const [previewStream,setPreviewStream]=useState(null);
  const videoRef=useRef(null);

  useEffect(()=>{
    let stream;
    (async()=>{
      try{
        stream=await navigator.mediaDevices.getUserMedia({video:true,audio:true});
        setPreviewStream(stream);
        if(videoRef.current) videoRef.current.srcObject=stream;
      }catch(e){
        notify("Camera/Mic ki permission nahi mili — browser settings mein permission den");
      }
    })();
    return ()=>{ stream?.getTracks().forEach(t=>t.stop()); };
  },[]);

  async function startLive(){
    if(!previewStream){notify("Camera tayyar nahi hai");return;}
    setBusy(true);
    try{
      const roomName=uid("room_");
      const post=await db.createLivePost({userId:user.userId,caption:title.trim(),roomName});
      onDone(post);
    }catch(e){
      notify("Live shuru nahi ho saka");
    } finally { setBusy(false); }
  }

  const inp={width:"100%",background:"#171717",border:"1px solid #262626",borderRadius:12,padding:"10px 14px",color:"#fafafa",fontSize:13,outline:"none",boxSizing:"border-box"};
  return (
    <div style={{padding:16,display:"flex",flexDirection:"column",height:"100%"}}>
      <div style={{position:"relative",borderRadius:16,overflow:"hidden",background:"#000",aspectRatio:"9/14",marginBottom:14}}>
        <video ref={videoRef} autoPlay playsInline muted style={{width:"100%",height:"100%",objectFit:"cover",transform:"scaleX(-1)"}}/>
        {!previewStream&&<div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",color:"#525252",fontSize:13}}>Camera load ho rahi hai...</div>}
      </div>
      <input value={title} onChange={e=>setTitle(e.target.value)} placeholder="Live ka title (optional)" style={{...inp,marginBottom:12}}/>
      <Btn onClick={startLive} disabled={busy||!previewStream} style={{width:"100%",background:"linear-gradient(135deg,#be123c,#e11d48)",color:"#fff"}}>{busy?"⟳ ":"🔴 "}Live Shuru Karein</Btn>
    </div>
  );
}

// ── Live Detail View ──────────────────────────────────────────────────────────
function LiveDetailView({post,user,onBack,fireBurst,notify,onCloseLive,refreshFeed}){
  const [live,setLive]=useState(post);
  const [comments,setComments]=useState(post.comments||[]);
  const [text,setText]=useState("");
  const [showGift,setShowGift]=useState(false);
  const [connected,setConnected]=useState(false);
  const chatRef=useRef(null);
  const videoRef=useRef(null);
  const audioContainerRef=useRef(null);
  const roomRef=useRef(null);
  const isHost=user.userId===post.userId;

  useEffect(()=>{ chatRef.current?.scrollTo({top:chatRef.current.scrollHeight}); },[comments]);

  // Live chat via Supabase Realtime (replaces 3s polling)
  useEffect(()=>{
    (async()=>{ try{ const fresh=await db.fetchPostById(post.postId); if(fresh) setComments(fresh.comments); }catch(e){} })();
    const unsub=db.subscribeToPostChanges(async(payload)=>{
      if(payload.table==="comments"&&payload.new?.post_id===post.postId){
        try{
          const fresh=await db.fetchPostById(post.postId);
          if(fresh) setComments(fresh.comments);
        }catch(e){}
      } else if(payload.table==="posts"&&(payload.old?.post_id===post.postId||payload.new?.post_id===post.postId)){
        try{
          const fresh=await db.fetchPostById(post.postId);
          if(!fresh||!fresh.isLive){ onCloseLive(); onBack(); }
        }catch(e){}
      }
    });
    return unsub;
  },[post.postId]);

  // ── LiveKit: connect to the room, publish (host) or subscribe (viewer) ────
  useEffect(()=>{
    if(!post.roomName) return; // purana post jiska room nahi hai
    let room;
    (async()=>{
      try{
        if(!LIVEKIT_URL){ notify("LiveKit URL set nahi hai (VITE_LIVEKIT_URL env var add karein)"); return; }
        const token=await fetchLiveKitToken({room:post.roomName,identity:user.userId,name:user.username,canPublish:isHost});
        room=new Room();
        roomRef.current=room;

        room.on(RoomEvent.TrackSubscribed,(track)=>{
          // BUG FIX: previously only Video tracks were attached, so viewers
          // never heard any audio from the host. Audio tracks must also be
          // attached (to a hidden <audio> element) for sound to play.
          if(track.kind===Track.Kind.Video && videoRef.current){
            track.attach(videoRef.current);
          } else if(track.kind===Track.Kind.Audio && audioContainerRef.current){
            const el=track.attach();
            el.autoplay=true;
            audioContainerRef.current.appendChild(el);
          }
        });
        room.on(RoomEvent.TrackUnsubscribed,(track)=>{ track.detach().forEach(el=>el.remove?.()); });

        await room.connect(LIVEKIT_URL, token);
        setConnected(true);

        if(isHost){
          const tracks=await createLocalTracks({audio:true,video:true});
          for(const t of tracks){
            await room.localParticipant.publishTrack(t);
            if(t.kind===Track.Kind.Video && videoRef.current) t.attach(videoRef.current);
          }
        }
      }catch(e){
        notify("Live stream se connect nahi ho saka");
      }
    })();
    return ()=>{ room?.disconnect(); };
  },[post.roomName,isHost,user.userId,user.username]);

  async function sendChat(){
    if(!text.trim())return;
    try{ await db.addComment(post.postId,user.userId,text.trim()); setText(""); }
    catch(e){ notify("Message nahi bheja ja saka"); }
  }
  async function closeLive(){
    roomRef.current?.disconnect();
    try{ await db.endLivePost(post.postId); }catch(e){}
    onCloseLive(); onBack(); refreshFeed();
  }
  async function sendGift(gift){
    try{
      const newBal=await db.sendGift({fromId:user.userId,toId:live.userId,postId:post.postId,gift});
      fireBurst({emoji:gift.emoji,name:gift.name,from:user.username}); setShowGift(false);
      window.dispatchEvent(new CustomEvent("lehar:balance",{detail:newBal}));
    }catch(e){ notify(e?.message==="INSUFFICIENT_COINS"?"Coins kam hain":"Gift nahi bheja ja saka"); }
  }
  const viewers=new Set(comments.map(c=>c.userId)).size+1;
  return (
    <div style={{display:"flex",flexDirection:"column",height:"100%"}}>
      <div ref={audioContainerRef} style={{display:"none"}}/>
      <div style={{flex:1,background:"#000",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",position:"relative",overflow:"hidden"}}>
        <button onClick={onBack} style={{position:"absolute",top:12,left:12,background:"rgba(0,0,0,.4)",border:"none",borderRadius:"50%",width:34,height:34,cursor:"pointer",color:"#fff",fontSize:16,zIndex:5}}>←</button>
        <div style={{position:"absolute",top:12,right:12,display:"flex",gap:8,zIndex:5}}>
          <div style={{background:"rgba(0,0,0,.4)",borderRadius:999,padding:"5px 10px",color:"#fff",fontSize:12}}>👁️ {viewers}</div>
          {isHost&&<button onClick={closeLive} style={{background:"#be123c",border:"none",borderRadius:999,padding:"5px 12px",color:"#fff",fontSize:11,fontWeight:700,cursor:"pointer"}}>Live Khatam</button>}
        </div>
        <video ref={videoRef} autoPlay playsInline muted={isHost} style={{width:"100%",height:"100%",objectFit:"cover",transform:isHost?"scaleX(-1)":"none"}}/>
        {!connected&&(
          <div style={{position:"absolute",inset:0,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",background:"linear-gradient(180deg,#1c0010,#0a0a0a)"}}>
            <div style={{fontSize:48,marginBottom:8}}>🔴</div>
            <Avatar name={live.username} size={64} live/>
            <p style={{marginTop:12,color:"#737373",fontSize:13}}>Stream se connect ho raha hai...</p>
          </div>
        )}
        {connected&&(
          <div style={{position:"absolute",bottom:8,left:12,background:"rgba(0,0,0,.4)",borderRadius:999,padding:"4px 10px",zIndex:5}}>
            <p style={{margin:0,fontWeight:700,color:"#fafafa",fontSize:13}}>{live.username}{live.caption?` · ${live.caption}`:""}</p>
          </div>
        )}
      </div>
      <div style={{background:"#171717",borderTop:"1px solid #262626",display:"flex",flexDirection:"column",height:"42%"}}>
        <div ref={chatRef} style={{flex:1,overflowY:"auto",padding:"8px 12px",display:"flex",flexDirection:"column",gap:4}}>
          {comments.map((c)=>(
            <p key={c.id} style={{fontSize:13,color:c.isGift?"#fcd34d":"#e5e5e5",margin:0}}>
              <span style={{fontWeight:700,color:"#fafafa"}}>{c.username}: </span>{c.text}
            </p>
          ))}
        </div>
        <div style={{display:"flex",gap:6,padding:8,borderTop:"1px solid #262626"}}>
          <input value={text} onChange={e=>setText(e.target.value)} onKeyDown={e=>e.key==="Enter"&&sendChat()} placeholder="Message likhein..." style={{flex:1,background:"#0a0a0a",border:"1px solid #262626",borderRadius:999,padding:"7px 12px",color:"#fafafa",fontSize:13,outline:"none"}}/>
          <button onClick={()=>setShowGift(true)} style={{background:"#f59e0b",border:"none",borderRadius:"50%",width:34,height:34,cursor:"pointer",fontSize:14}}>🎁</button>
          <button onClick={sendChat} style={{background:"#262626",border:"none",borderRadius:"50%",width:34,height:34,cursor:"pointer",fontSize:14}}>📨</button>
        </div>
      </div>
      {showGift&&<GiftSheet balance={user.coinBalance} onClose={()=>setShowGift(false)} onSend={sendGift}/>}
    </div>
  );
}

// ── Live Feed View ────────────────────────────────────────────────────────────
function LiveFeedView({posts,user,onOpenLive,onStartLive}){
  const lives=posts.filter(p=>p.isLive);
  const GoLiveBar=()=>(
    <div style={{padding:"14px 16px",borderBottom:"1px solid #262626"}}>
      <button onClick={onStartLive} style={{width:"100%",display:"flex",alignItems:"center",justifyContent:"center",gap:8,background:"linear-gradient(135deg,#be123c,#e11d48)",color:"#fff",border:"none",borderRadius:16,padding:"14px",fontWeight:700,fontSize:15,cursor:"pointer"}}>
        📡 🔴 Abhi Live Jayen
      </button>
      <p style={{textAlign:"center",color:"#525252",fontSize:11,marginTop:6}}>Apni live stream shuru karein aur gifts payen</p>
    </div>
  );
  if(lives.length===0) return (
    <div style={{display:"flex",flexDirection:"column",height:"100%"}}>
      <GoLiveBar/>
      <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",color:"#525252"}}>
        <span style={{fontSize:40,marginBottom:8}}>📡</span><p>Abhi koi live nahi</p><p style={{fontSize:12,marginTop:4,color:"#404040"}}>Pehle aap live ho jayen!</p>
      </div>
    </div>
  );
  return (
    <div style={{display:"flex",flexDirection:"column",height:"100%"}}>
      <GoLiveBar/>
      <div style={{padding:12,display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
        {lives.map(p=>(
          <button key={p.postId} onClick={()=>onOpenLive(p)} style={{background:"#171717",border:"1px solid #7f1d1d",borderRadius:16,padding:12,display:"flex",flexDirection:"column",alignItems:"center",gap:8,cursor:"pointer"}}>
            <Avatar name={p.username} size={52} live/>
            <p style={{fontWeight:700,color:"#fafafa",fontSize:13,margin:0}}>{p.username}</p>
            <span style={{background:"#be123c",color:"#fff",fontSize:10,padding:"2px 8px",borderRadius:999,fontWeight:700}}>● LIVE — Join Karein</span>
          </button>
        ))}
      </div>
    </div>
  );
}
// ── Search View ───────────────────────────────────────────────────────────────
function SearchView({user,notify,onOpenChat}){
  const [query,setQuery]=useState("");
  const [results,setResults]=useState([]);
  const [suggested,setSuggested]=useState([]);
  const [sentIds,setSentIds]=useState({});
  useEffect(()=>{
    (async()=>{ setSuggested(await db.suggestedUsers(user.userId)); })();
  },[user.userId]);
  async function doSearch(){
    if(!query.trim())return;
    setResults(await db.searchUsers(query.trim().toLowerCase(),user.userId));
  }
  async function sendFriendReq(target){
    try{
      const r=await db.sendFriendRequest(user.userId,target.userId);
      setSentIds(prev=>({...prev,[target.userId]:true}));
      notify(r.already?"Request pehle se bhej di":`${target.username} ko request bhej di`);
    }catch(e){ notify("Request nahi bhej saka"); }
  }
  const show=results.length>0?results:suggested;
  const inp={flex:1,background:"#171717",border:"1px solid #262626",borderRadius:12,padding:"10px 14px",color:"#fafafa",fontSize:13,outline:"none"};
  return (
    <div style={{padding:14}}>
      <div style={{display:"flex",gap:8,marginBottom:14}}>
        <input value={query} onChange={e=>setQuery(e.target.value)} onKeyDown={e=>e.key==="Enter"&&doSearch()} placeholder="Username se dhoondein..." style={inp}/>
        <button onClick={doSearch} style={{background:"#f59e0b",border:"none",borderRadius:12,padding:"0 14px",cursor:"pointer",fontWeight:700,fontSize:16}}>🔍</button>
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:8}}>
        {show.map(u=>(
          <div key={u.userId} style={{display:"flex",alignItems:"center",gap:10,padding:10,background:"#171717",borderRadius:14}}>
            <Avatar name={u.username} size={38} pic={u.profilePic} verified={u.verified}/>
            <div style={{flex:1}}>
              <p style={{fontWeight:700,color:"#fafafa",fontSize:13,margin:0}}>{u.username}{u.verified?" ✅":""}</p>
              {u.bio&&<p style={{color:"#525252",fontSize:11,margin:0,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",maxWidth:150}}>{u.bio}</p>}
            </div>
            <button onClick={()=>onOpenChat({partnerId:u.userId,partnerUsername:u.username})} style={{background:"#262626",border:"none",borderRadius:"50%",width:32,height:32,cursor:"pointer",fontSize:14}}>📨</button>
            <button onClick={()=>sendFriendReq(u)} disabled={sentIds[u.userId]} style={{background:"rgba(245,158,11,.2)",border:"none",borderRadius:"50%",width:32,height:32,cursor:sentIds[u.userId]?"default":"pointer",fontSize:14,opacity:sentIds[u.userId]?0.4:1}}>{sentIds[u.userId]?"✓":"➕"}</button>
          </div>
        ))}
        {show.length===0&&<p style={{color:"#525252",fontSize:13,textAlign:"center",padding:"24px 0"}}>Koi user nahi mila</p>}
      </div>
    </div>
  );
}

// ── Inbox View ────────────────────────────────────────────────────────────────
function InboxView({user,onOpenChat,notify,notifications}){
  const [convs,setConvs]=useState([]);
  const [tab,setTab]=useState("msgs");
  const [requests,setRequests]=useState([]);
  const [friends,setFriends]=useState([]);
  const load=useCallback(async()=>{
    setConvs(await db.fetchConversationsList(user.userId));
    setRequests(await db.getIncomingFriendRequests(user.userId));
    setFriends(await db.getFriends(user.userId));
  },[user.userId]);
  useEffect(()=>{ load(); },[load]);
  useEffect(()=>{ const unsub=db.subscribeToMessages(user.userId,load); return unsub; },[user.userId,load]);

  async function respond(req,accept){
    try{
      await db.respondFriendRequest(req.id,req.fromId,user.userId,accept);
      notify(accept?`${req.fromUsername} ko friend add kar liya`:"Request reject kar di");
      load();
    }catch(e){ notify("Kuch ghalat ho gaya"); }
  }

  return (
    <div style={{display:"flex",flexDirection:"column",height:"100%"}}>
      <div style={{display:"flex",background:"#171717",borderRadius:12,padding:4,margin:14,gap:4}}>
        {[["msgs","Messages"],["requests",`Requests${requests.length?` (${requests.length})`:""}`],["friends","Friends"]].map(([id,label])=>(
          <button key={id} onClick={()=>setTab(id)} style={{flex:1,padding:8,borderRadius:8,border:"none",fontWeight:700,fontSize:11,background:tab===id?"#fafafa":"transparent",color:tab===id?"#0a0a0a":"#737373",cursor:"pointer"}}>{label}</button>
        ))}
      </div>
      <div style={{flex:1,overflowY:"auto",padding:"0 14px 14px"}}>
        {tab==="msgs"&&(
          convs.length===0?<p style={{color:"#525252",fontSize:13,textAlign:"center",padding:"40px 0"}}>Koi message nahi</p>:
          convs.map(c=>(
            <button key={c.partnerId} onClick={()=>onOpenChat({partnerId:c.partnerId,partnerUsername:c.partnerUsername})} style={{display:"flex",alignItems:"center",gap:10,width:"100%",padding:10,background:"#171717",borderRadius:14,marginBottom:8,border:"none",cursor:"pointer",textAlign:"left"}}>
              <Avatar name={c.partnerUsername} size={40} pic={c.partnerProfilePic}/>
              <div style={{flex:1,overflow:"hidden"}}>
                <p style={{fontWeight:700,color:"#fafafa",fontSize:13,margin:0}}>{c.partnerUsername}</p>
                <p style={{color:"#737373",fontSize:12,margin:0,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{c.lastText}</p>
              </div>
              <span style={{color:"#525252",fontSize:10}}>{timeAgo(c.lastTs)}</span>
            </button>
          ))
        )}
        {tab==="requests"&&(
          requests.length===0?<p style={{color:"#525252",fontSize:13,textAlign:"center",padding:"40px 0"}}>Koi request nahi</p>:
          requests.map(r=>(
            <div key={r.id} style={{display:"flex",alignItems:"center",gap:10,padding:10,background:"#171717",borderRadius:14,marginBottom:8}}>
              <Avatar name={r.fromUsername} size={38} pic={r.profilePic} verified={r.verified}/>
              <p style={{flex:1,fontWeight:700,color:"#fafafa",fontSize:13,margin:0}}>{r.fromUsername}</p>
              <button onClick={()=>respond(r,true)} style={{background:"#16a34a",border:"none",borderRadius:8,padding:"6px 10px",color:"#fff",fontSize:11,fontWeight:700,cursor:"pointer"}}>✓</button>
              <button onClick={()=>respond(r,false)} style={{background:"#404040",border:"none",borderRadius:8,padding:"6px 10px",color:"#fff",fontSize:11,fontWeight:700,cursor:"pointer"}}>✕</button>
            </div>
          ))
        )}
        {tab==="friends"&&(
          friends.length===0?<p style={{color:"#525252",fontSize:13,textAlign:"center",padding:"40px 0"}}>Abhi koi friend nahi</p>:
          friends.map(f=>(
            <button key={f.userId} onClick={()=>onOpenChat({partnerId:f.userId,partnerUsername:f.username})} style={{display:"flex",alignItems:"center",gap:10,width:"100%",padding:10,background:"#171717",borderRadius:14,marginBottom:8,border:"none",cursor:"pointer",textAlign:"left"}}>
              <Avatar name={f.username} size={38} pic={f.profilePic} verified={f.verified}/>
              <p style={{flex:1,fontWeight:700,color:"#fafafa",fontSize:13,margin:0}}>{f.username}</p>
              <span style={{fontSize:16}}>📨</span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}

// ── Chat View ─────────────────────────────────────────────────────────────────
function ChatView({user,partner,onBack}){
  const [msgs,setMsgs]=useState([]);
  const [text,setText]=useState("");
  const chatRef=useRef(null);
  const load=useCallback(async()=>{ setMsgs(await db.fetchConversation(user.userId,partner.partnerId)); },[user.userId,partner.partnerId]);
  useEffect(()=>{ load(); },[load]);
  useEffect(()=>{ const unsub=db.subscribeToMessages(user.userId,load); return unsub; },[user.userId,load]);
  useEffect(()=>{ chatRef.current?.scrollTo({top:chatRef.current.scrollHeight}); },[msgs]);
  async function sendMsg(){
    if(!text.trim())return;
    const t=text.trim(); setText("");
    try{ await db.sendMessage(user.userId,partner.partnerId,t); load(); }
    catch(e){ setText(t); }
  }
  return (
    <div style={{display:"flex",flexDirection:"column",height:"100%"}}>
      <div style={{display:"flex",alignItems:"center",gap:10,padding:"10px 14px",borderBottom:"1px solid #262626",background:"#0a0a0a"}}>
        <button onClick={onBack} style={{background:"none",border:"none",color:"#737373",fontSize:20,cursor:"pointer"}}>←</button>
        <Avatar name={partner.partnerUsername} size={34}/>
        <p style={{fontWeight:700,color:"#fafafa",fontSize:14,margin:0}}>{partner.partnerUsername}</p>
      </div>
      <div ref={chatRef} style={{flex:1,overflowY:"auto",padding:"12px 14px",display:"flex",flexDirection:"column",gap:6}}>
        {msgs.length===0&&<p style={{color:"#525252",fontSize:13,textAlign:"center",padding:"24px 0"}}>Koi message nahi — pehle aap karein!</p>}
        {msgs.map(m=>(
          <div key={m.id} style={{display:"flex",justifyContent:m.fromId===user.userId?"flex-end":"flex-start"}}>
            <div style={{maxWidth:"75%",padding:"8px 12px",borderRadius:16,fontSize:13,background:m.fromId===user.userId?"#f59e0b":"#171717",color:m.fromId===user.userId?"#0a0a0a":"#e5e5e5"}}>
              {m.text}<span style={{display:"block",fontSize:9,opacity:.6,marginTop:2,textAlign:"right"}}>{timeAgo(m.ts)}</span>
            </div>
          </div>
        ))}
      </div>
      <div style={{display:"flex",gap:8,padding:10,borderTop:"1px solid #262626"}}>
        <input value={text} onChange={e=>setText(e.target.value)} onKeyDown={e=>e.key==="Enter"&&sendMsg()} placeholder="Message likhein..." style={{flex:1,background:"#171717",border:"1px solid #262626",borderRadius:999,padding:"8px 14px",color:"#fafafa",fontSize:13,outline:"none"}}/>
        <button onClick={sendMsg} style={{background:"#f59e0b",border:"none",borderRadius:"50%",width:36,height:36,cursor:"pointer",fontSize:15}}>📨</button>
      </div>
    </div>
  );
}
// ── Wallet View ───────────────────────────────────────────────────────────────
function WalletView({user,notify,onRefreshUser}){
  const [tab,setTab]=useState("buy");
  const [method,setMethod]=useState("Easypaisa");
  const [amount,setAmount]=useState("");
  const [reference,setReference]=useState("");
  const [withdrawCoins,setWithdrawCoins]=useState("");
  const [withdrawNumber,setWithdrawNumber]=useState("");
  const [myTx,setMyTx]=useState([]);
  const [busy,setBusy]=useState(false);
  const load=useCallback(async()=>{ setMyTx(await db.getMyTransactions(user.userId)); },[user.userId]);
  useEffect(()=>{ load(); const t=setInterval(load,5000); return ()=>clearInterval(t); },[load]);

  async function submitTopup(){
    const pkr=parseFloat(amount);
    if(!pkr||pkr<MIN_TOPUP_PKR){notify(`Minimum Rs.${MIN_TOPUP_PKR.toLocaleString()} ka top-up hoga`);return;}
    setBusy(true);
    try{
      await db.createTransaction({userId:user.userId,type:"topup",amountPKR:pkr,coins:Math.floor(pkr*TOPUP_COINS_PER_PKR),method,reference:reference.trim()});
      setAmount(""); setReference(""); notify("Request bhej di — admin approval ka intezaar karein"); load();
    }catch(e){ notify("Request nahi bhej saka"); } finally { setBusy(false); }
  }
  async function submitWithdraw(){
    const coins=parseInt(withdrawCoins,10);
    if(!coins||coins<=0){notify("Sahi coins likhein");return;}
    if(coins>user.coinBalance){notify("Itne coins aapke paas nahi");return;}
    if(!withdrawNumber.trim()){notify("Number likhein");return;}
    setBusy(true);
    try{
      await db.requestWithdraw({userId:user.userId,coins,method,reference:withdrawNumber.trim()});
      onRefreshUser(user.coinBalance-coins);
      setWithdrawCoins(""); setWithdrawNumber(""); notify("Withdraw request bhej di"); load();
    }catch(e){
      notify(e?.message==="INSUFFICIENT_COINS"?"Itne coins aapke paas nahi":"Request nahi bhej saka");
    } finally { setBusy(false); }
  }
  const inp={width:"100%",background:"#171717",border:"1px solid #262626",borderRadius:12,padding:"10px 14px",color:"#fafafa",fontSize:13,outline:"none",boxSizing:"border-box"};
  return (
    <div style={{padding:14,overflowY:"auto"}}>
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
        <span style={{fontSize:18}}>⭐</span>
        <span style={{fontFamily:"monospace",fontSize:24,fontWeight:900,color:"#f59e0b"}}>{user.coinBalance}</span>
        <span style={{color:"#525252",fontSize:13}}>coins</span>
      </div>
      <div style={{background:"#171717",border:"1px solid #262626",borderRadius:12,padding:10,marginBottom:12,fontSize:12,color:"#737373"}}>
        Buy: Rs.20 = 1 coin (min Rs.3,000) | Cash Out: 1 coin = Rs.12
      </div>
      <div style={{display:"flex",background:"#171717",borderRadius:12,padding:4,marginBottom:12,gap:4}}>
        {["buy","withdraw"].map(t=><button key={t} onClick={()=>setTab(t)} style={{flex:1,padding:8,borderRadius:8,border:"none",fontWeight:700,fontSize:12,background:tab===t?"#fafafa":"transparent",color:tab===t?"#0a0a0a":"#737373",cursor:"pointer"}}>{t==="buy"?"Coins Khareedein":"Cash Out"}</button>)}
      </div>
      {tab==="buy"?(
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          <div style={{display:"flex",gap:6}}>
            {Object.keys(OWNER_PAYMENT).map(m=><button key={m} onClick={()=>setMethod(m)} style={{flex:1,padding:"8px 4px",borderRadius:10,border:`1px solid ${method===m?"#f59e0b":"#262626"}`,background:"none",color:method===m?"#f59e0b":"#737373",fontWeight:700,fontSize:11,cursor:"pointer"}}>{m}</button>)}
          </div>
          <div style={{background:"#171717",border:"1px solid rgba(245,158,11,.4)",borderRadius:12,padding:12}}>
            <p style={{color:"#737373",fontSize:11,margin:"0 0 4px"}}>Is number par payment bhejein:</p>
            <p style={{fontFamily:"monospace",fontSize:18,fontWeight:900,color:"#fafafa",margin:0}}>{OWNER_PAYMENT[method]}</p>
          </div>
          <input value={amount} onChange={e=>setAmount(e.target.value)} type="number" placeholder="Aap ne kitne Rs. bheje?" style={inp}/>
          {amount&&!isNaN(amount)&&<p style={{color:"#f59e0b",fontSize:12,fontFamily:"monospace"}}>≈ {Math.floor(parseFloat(amount)*TOPUP_COINS_PER_PKR)} coins milengi</p>}
          <input value={reference} onChange={e=>setReference(e.target.value)} placeholder="Transaction ID / reference (optional)" style={inp}/>
          <Btn onClick={submitTopup} disabled={busy} style={{width:"100%"}}>Maine Payment Bhej Diya</Btn>
        </div>
      ):(
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          <input value={withdrawCoins} onChange={e=>setWithdrawCoins(e.target.value)} type="number" placeholder="Kitne coins nikalwane hain?" style={inp}/>
          {withdrawCoins&&!isNaN(withdrawCoins)&&<p style={{color:"#f59e0b",fontSize:12,fontFamily:"monospace"}}>≈ Rs. {(parseInt(withdrawCoins,10)/WITHDRAW_COINS_PER_PKR).toFixed(0)} milenge</p>}
          <div style={{display:"flex",gap:6}}>
            {Object.keys(OWNER_PAYMENT).map(m=><button key={m} onClick={()=>setMethod(m)} style={{flex:1,padding:"8px 4px",borderRadius:10,border:`1px solid ${method===m?"#f59e0b":"#262626"}`,background:"none",color:method===m?"#f59e0b":"#737373",fontWeight:700,fontSize:11,cursor:"pointer"}}>{m}</button>)}
          </div>
          <input value={withdrawNumber} onChange={e=>setWithdrawNumber(e.target.value)} placeholder="Aap ka account number" style={inp}/>
          <Btn onClick={submitWithdraw} disabled={busy} style={{width:"100%"}}>Cash Out Request</Btn>
        </div>
      )}
      {myTx.length>0&&(
        <div style={{marginTop:18}}>
          <h3 style={{color:"#fafafa",fontSize:14,margin:"0 0 8px"}}>History</h3>
          {myTx.map(t=>(
            <div key={t.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 0",borderBottom:"1px solid #262626"}}>
              <div>
                <p style={{margin:0,color:"#d4d4d4",fontSize:12,fontWeight:600}}>{t.type==="topup"?"Top-up":"Withdraw"} • Rs.{t.amountPKR}</p>
                <p style={{margin:0,color:"#525252",fontSize:10}}>{timeAgo(t.createdAt)} pehle</p>
              </div>
              <span style={{fontSize:10,fontWeight:700,padding:"2px 8px",borderRadius:999,background:t.status==="approved"?"rgba(34,197,94,.15)":t.status==="rejected"?"rgba(239,68,68,.15)":"rgba(245,158,11,.15)",color:t.status==="approved"?"#4ade80":t.status==="rejected"?"#f87171":"#fbbf24"}}>{t.status}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Profile View ──────────────────────────────────────────────────────────────
function ProfileView({user,onLogout,onGoWallet,notify,onUserUpdate}){
  const [editing,setEditing]=useState(false);
  const [bio,setBio]=useState(user.bio||"");
  const [newPass,setNewPass]=useState("");
  const [myPosts,setMyPosts]=useState([]);
  const [confirmDelete,setConfirmDelete]=useState(null);
  const [mediaPost,setMediaPost]=useState(null);
  const [uploadingAvatar,setUploadingAvatar]=useState(false);
  const avatarRef=useRef(null);

  const loadPosts=useCallback(async()=>{
    try{ setMyPosts(await db.fetchUserPosts(user.userId)); }catch(e){}
  },[user.userId]);
  useEffect(()=>{ loadPosts(); },[loadPosts]);

  async function saveBio(){
    try{ await db.updateProfile(user.userId,{bio}); onUserUpdate({...user,bio}); setEditing(false); notify("Profile update ho gayi"); }
    catch(e){ notify("Update nahi ho saka"); }
  }
  async function changePassword(){
    if(newPass.length<6){notify("Password kam az kam 6 huroof ka ho");return;}
    try{ await db.changePassword(newPass); setNewPass(""); notify("Password badal gaya"); }
    catch(e){ notify("Password badal nahi saka"); }
  }
  async function onAvatarChange(e){
    const f=e.target.files?.[0]; if(!f)return;
    if(!f.type.startsWith("image")){notify("Sirf image upload karein");return;}
    if(f.size>10*1024*1024){notify("Image 10MB se choti honi chahiye");return;}
    setUploadingAvatar(true);
    try{
      const url=await db.uploadAvatar(f,user.userId);
      await db.updateProfile(user.userId,{profilePic:url});
      onUserUpdate({...user,profilePic:url});
      notify("Profile picture update ho gayi");
    }catch(e){
      notify("Profile pic upload nahi ho saki — dobara koshish karein");
    } finally { setUploadingAvatar(false); }
  }
  async function handleDelete(post){
    try{ await db.deletePost(post.postId); setConfirmDelete(null); loadPosts(); notify("Post delete ho gayi"); }
    catch(e){ notify("Delete nahi ho saka"); }
  }

  const myMediaPosts=myPosts.filter(p=>!p.isReel);
  const myReels=myPosts.filter(p=>p.isReel);
  const inp={width:"100%",background:"#0a0a0a",border:"1px solid #262626",borderRadius:10,padding:"8px 12px",color:"#fafafa",fontSize:13,outline:"none",boxSizing:"border-box"};

  return (
    <div style={{padding:16}}>
      <div style={{display:"flex",alignItems:"center",gap:14,marginBottom:14}}>
        <div style={{position:"relative"}}>
          <Avatar name={user.username} size={64} pic={user.profilePic} verified={user.verified}/>
          <input ref={avatarRef} type="file" accept="image/*" style={{display:"none"}} onChange={onAvatarChange}/>
          <button onClick={()=>avatarRef.current?.click()} disabled={uploadingAvatar} style={{position:"absolute",bottom:-2,right:-2,background:"#f59e0b",border:"2px solid #0a0a0a",borderRadius:"50%",width:24,height:24,cursor:"pointer",fontSize:11,display:"flex",alignItems:"center",justifyContent:"center"}}>{uploadingAvatar?"⟳":"📷"}</button>
        </div>
        <div style={{flex:1}}>
          <p style={{fontWeight:800,color:"#fafafa",fontSize:17,margin:0,display:"flex",alignItems:"center",gap:5}}>{user.username}{user.verified&&<span style={{fontSize:13}}>✅</span>}</p>
          {!editing&&<p style={{color:"#737373",fontSize:12,margin:"3px 0 0"}}>{user.bio||"Bio nahi hai"}</p>}
        </div>
        <button onClick={()=>setEditing(v=>!v)} style={{background:"none",border:"none",color:"#737373",fontSize:18,cursor:"pointer"}}>✏️</button>
      </div>

      {editing&&(
        <div style={{background:"#171717",border:"1px solid #262626",borderRadius:14,padding:12,marginBottom:14}}>
          <textarea value={bio} onChange={e=>setBio(e.target.value)} placeholder="Bio likhein..." rows={2} style={{...inp,marginBottom:8,resize:"none"}}/>
          <Btn onClick={saveBio} style={{width:"100%",padding:"8px",marginBottom:10}}>Bio Save Karein</Btn>
          <input value={newPass} onChange={e=>setNewPass(e.target.value)} type="password" placeholder="Naya password" style={{...inp,marginBottom:8}}/>
          <Btn onClick={changePassword} style={{width:"100%",padding:"9px"}}>🔒 Password Badlein</Btn>
        </div>
      )}

      <button onClick={onGoWallet} style={{width:"100%",display:"flex",alignItems:"center",justifyContent:"space-between",background:"#171717",border:"1px solid #f59e0b",borderRadius:12,padding:"12px 14px",cursor:"pointer",marginBottom:12}}>
        <span style={{color:"#fafafa",fontSize:13,fontWeight:600}}>💰 Wallet</span>
        <span style={{color:"#f59e0b",fontWeight:700,fontFamily:"monospace"}}>{user.coinBalance} coins</span>
      </button>

      <div style={{display:"flex",gap:16,marginBottom:10}}>
        <span style={{color:"#737373",fontSize:13}}>Posts <span style={{color:"#f59e0b",fontWeight:700}}>{myMediaPosts.length}</span></span>
        <span style={{color:"#737373",fontSize:13}}>Reels <span style={{color:"#f59e0b",fontWeight:700}}>{myReels.length}</span></span>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:6}}>
        {myPosts.map(p=>(
          <button key={p.postId} onClick={()=>p.mediaData?setMediaPost(p):null} onContextMenu={(e)=>{e.preventDefault();setConfirmDelete(p);}} style={{position:"relative",aspectRatio:"1",background:"#171717",border:"1px solid #262626",borderRadius:10,overflow:"hidden",display:"flex",alignItems:"center",justifyContent:"center",cursor:p.mediaData?"pointer":"default",padding:0}}>
            {p.mediaData&&p.mediaType==="image"?<img src={p.mediaData} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/>
            :p.mediaData&&p.mediaType==="video"?(
              <>
                <video src={p.mediaData} style={{width:"100%",height:"100%",objectFit:"cover"}} muted/>
                <span style={{position:"absolute",top:4,right:4,fontSize:12}}>▶️</span>
              </>
            )
            :<p style={{fontSize:10,color:"#a3a3a3",textAlign:"center",padding:6,margin:0,overflow:"hidden",display:"-webkit-box",WebkitLineClamp:4,WebkitBoxOrient:"vertical"}}>{p.caption?.slice(0,80)||"Post"}</p>}
            <button onClick={(e)=>{e.stopPropagation();setConfirmDelete(p);}} style={{position:"absolute",top:2,left:2,background:"rgba(0,0,0,.6)",border:"none",borderRadius:6,width:20,height:20,color:"#fff",fontSize:10,cursor:"pointer"}}>🗑️</button>
          </button>
        ))}
        {myPosts.length===0&&<p style={{gridColumn:"1/-1",textAlign:"center",color:"#525252",fontSize:12,padding:"20px 0"}}>Koi post nahi</p>}
      </div>

      <Btn onClick={onLogout} ghost style={{width:"100%",padding:"9px",marginTop:18}}>🚪 Logout</Btn>

      {mediaPost&&<MediaViewerModal post={mediaPost} onClose={()=>setMediaPost(null)}/>}
      {confirmDelete&&<ConfirmDialog title="Post delete karein?" message="Ye post hamesha ke liye delete ho jayegi." onConfirm={()=>handleDelete(confirmDelete)} onCancel={()=>setConfirmDelete(null)}/>}
    </div>
  );
}

// ── Admin Panel ───────────────────────────────────────────────────────────────
function AdminPanel({onExit,notify}){
  const [txs,setTxs]=useState([]);
  const load=useCallback(async()=>{ setTxs(await db.getAllTransactions()); },[]);
  useEffect(()=>{ load(); const t=setInterval(load,4000); return ()=>clearInterval(t); },[load]);

  async function approveTopup(tx){ try{ await db.adminApproveTopup(tx.id); load(); }catch(e){ notify("Approve nahi ho saka"); } }
  async function rejectTopup(tx){ try{ await db.adminRejectTopup(tx.id); load(); }catch(e){ notify("Reject nahi ho saka"); } }
  async function markWithdrawPaid(tx){ try{ await db.adminApproveWithdraw(tx.id); load(); }catch(e){ notify("Update nahi ho saka"); } }
  async function rejectWithdraw(tx){ try{ await db.adminRejectWithdraw(tx.id); load(); }catch(e){ notify("Reject nahi ho saka"); } }

  const pending=txs.filter(t=>t.status==="pending");
  const totalIn=txs.filter(t=>t.type==="topup"&&t.status==="approved").reduce((s,t)=>s+Number(t.amountPKR),0);
  const totalOut=txs.filter(t=>t.type==="withdraw"&&t.status==="approved").reduce((s,t)=>s+Number(t.amountPKR),0);
  return (
    <div style={{padding:14,overflowY:"auto",height:"100%"}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
        <h2 style={{color:"#fafafa",fontWeight:900,margin:0,fontSize:18}}>🛡️ Admin Panel</h2>
        <button onClick={onExit} style={{color:"#737373",background:"none",border:"none",cursor:"pointer",fontSize:13}}>Exit</button>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:16}}>
        {[["Total Wasool","Rs."+totalIn.toFixed(0),"#34d399"],["Total Pay-out","Rs."+totalOut.toFixed(0),"#fb7185"]].map(([l,v,c])=>(
          <div key={l} style={{background:"#171717",border:"1px solid #262626",borderRadius:12,padding:12}}>
            <p style={{color:"#525252",fontSize:11,margin:0}}>{l}</p>
            <p style={{fontFamily:"monospace",fontSize:18,fontWeight:900,color:c,margin:0}}>{v}</p>
          </div>
        ))}
        <div style={{background:"#171717",border:"1px solid #f59e0b",borderRadius:12,padding:12,gridColumn:"1/-1"}}>
          <p style={{color:"#525252",fontSize:11,margin:0}}>Margin (Kamai)</p>
          <p style={{fontFamily:"monospace",fontSize:22,fontWeight:900,color:"#f59e0b",margin:0}}>Rs.{(totalIn-totalOut).toFixed(0)}</p>
        </div>
      </div>
      <h3 style={{color:"#fafafa",margin:"0 0 8px",fontWeight:700}}>Pending ({pending.length})</h3>
      {pending.length===0&&<p style={{color:"#525252",fontSize:13}}>Koi pending request nahi</p>}
      {pending.map(t=>(
        <div key={t.id} style={{background:"#171717",border:"1px solid #262626",borderRadius:12,padding:12,marginBottom:10}}>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
            <span style={{fontWeight:700,color:"#fafafa",fontSize:13}}>{t.username}</span>
            <span style={{fontSize:11,fontWeight:700,padding:"2px 8px",borderRadius:999,background:t.type==="topup"?"rgba(5,150,105,.2)":"rgba(124,58,237,.2)",color:t.type==="topup"?"#34d399":"#a78bfa"}}>{t.type==="topup"?"Top-up":"Withdraw"}</span>
          </div>
          <p style={{color:"#d4d4d4",fontSize:12,margin:"0 0 8px"}}>Rs.{t.amountPKR} • {t.coins} coins • {t.method}{t.reference?` • ${t.reference}`:""}</p>
          <div style={{display:"flex",gap:8}}>
            {t.type==="topup"?<>
              <Btn onClick={()=>approveTopup(t)} style={{flex:1,padding:"7px",fontSize:12}}>✓ Approve</Btn>
              <Btn onClick={()=>rejectTopup(t)} ghost style={{flex:1,padding:"7px",fontSize:12}}>✕ Reject</Btn>
            </>:<>
              <Btn onClick={()=>markWithdrawPaid(t)} style={{flex:1,padding:"7px",fontSize:12}}>💵 Paid</Btn>
              <Btn onClick={()=>rejectWithdraw(t)} ghost style={{flex:1,padding:"7px",fontSize:12}}>✕ Reject</Btn>
            </>}
          </div>
        </div>
      ))}
    </div>
  );
}
// ── Main App Shell ─────────────────────────────────────────────────────────────
export default function App(){
  const [session,setSession]=useState(undefined); // undefined = loading, null = logged out
  const [authError,setAuthError]=useState(null);
  const [user,setUser]=useState(null);
  const [tab,setTab]=useState("home");
  const [posts,setPosts]=useState([]);
  const [toast,setToast]=useState("");
  const [burst,setBurst]=useState(null);
  const [activeLive,setActiveLive]=useState(null);
  const [chatPartner,setChatPartner]=useState(null);
  const [showAdmin,setShowAdmin]=useState(false);
  const [notifOpen,setNotifOpen]=useState(false);
  const [notifications,setNotifications]=useState([]);

  const notify=useCallback((text)=>{ setToast(text); setTimeout(()=>setToast(""),2200); },[]);
  const fireBurst=useCallback((b)=>{ setBurst({...b,key:Date.now()}); setTimeout(()=>setBurst(null),2100); },[]);

  // ── Bootstrapping: watch auth state ──────────────────────────────────────
  useEffect(()=>{
    let mounted=true;
    supabase.auth.getSession()
      .then(({data,error})=>{
        if(!mounted) return;
        if(error){ setAuthError(error.message); return; }
        setSession(data.session||null);
      })
      .catch(e=>{ if(mounted) setAuthError(e?.message||"Supabase se connect nahi ho saka"); });
    const { data:sub } = supabase.auth.onAuthStateChange((_event,sess)=>{ if(mounted) setSession(sess); });
    const timer=setTimeout(()=>{
      if(mounted) setAuthError(prev=>prev||"Timeout — Supabase se 8 second mein jawab nahi mila. Internet ya env vars check karein.");
    },8000);
    return ()=>{ mounted=false; sub.subscription.unsubscribe(); clearTimeout(timer); };
  },[]);

  useEffect(()=>{
    if(session===undefined) return;
    if(session===null){ setUser(null); return; }
    (async()=>{
      try{
        const profile=await db.getMyProfile();
        if(!profile){ setAuthError("Login ho gaya magar profile database mein nahi mila — signup trigger ya RLS check karein."); return; }
        setUser(profile);
      }catch(e){ setAuthError(e?.message||"Profile load nahi ho saka"); }
    })();
  },[session]);

  // ── Feed loading + realtime refresh ──────────────────────────────────────
  const refreshFeed=useCallback(async()=>{
    try{
      const [feed,reels,lives]=await Promise.all([db.fetchFeed(),db.fetchReels(),db.fetchLivePosts()]);
      const map=new Map();
      [...feed,...reels,...lives].forEach(p=>map.set(p.postId,p));
      setPosts(Array.from(map.values()).sort((a,b)=>b.createdAt-a.createdAt));
    }catch(e){ /* network blip — sirf agli baar try hoga */ }
  },[]);

  useEffect(()=>{
    if(!user) return;
    refreshFeed();
    const unsub=db.subscribeToPostChanges(()=>refreshFeed());
    return unsub;
  },[user,refreshFeed]);

  // ── Notifications ─────────────────────────────────────────────────────────
  const loadNotifications=useCallback(async()=>{
    if(!user) return;
    setNotifications(await db.getNotifications(user.userId));
  },[user]);
  useEffect(()=>{
    if(!user) return;
    loadNotifications();
    const unsub=db.subscribeToNotifications(user.userId,()=>loadNotifications());
    return unsub;
  },[user,loadNotifications]);

  // ── React to coin balance changes fired by gift sends elsewhere ─────────
  useEffect(()=>{
    function onBal(e){ setUser(u=>u?{...u,coinBalance:e.detail}:u); }
    window.addEventListener("lehar:balance",onBal);
    return ()=>window.removeEventListener("lehar:balance",onBal);
  },[]);
  // Keep balance in sync with DB periodically too (covers gifts received from others)
  useEffect(()=>{
    if(!user) return;
    const t=setInterval(async()=>{
      const fresh=await db.getUserById(user.userId);
      if(fresh) setUser(u=>u?{...u,coinBalance:fresh.coinBalance}:u);
    },6000);
    return ()=>clearInterval(t);
  },[user?.userId]);

  async function handleLogout(){ await db.signOut(); setUser(null); setTab("home"); }

  function openLive(post){ setActiveLive(post); }
  function closeLive(){ setActiveLive(null); }

  const unreadCount=notifications.filter(n=>!n.read).length;
  async function toggleNotifs(){
    setNotifOpen(v=>!v);
    if(!notifOpen) await db.markNotificationsRead(user.userId);
    loadNotifications();
  }

  if(authError){
    return (
      <div style={{minHeight:"100vh",background:"#0a0a0a",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",color:"#fafafa",padding:24,textAlign:"center",gap:12}}>
        <div style={{fontSize:36}}>⚠️</div>
        <p style={{fontSize:14,fontWeight:700,margin:0}}>Connect nahi ho saka</p>
        <p style={{fontSize:12,color:"#a3a3a3",margin:0,wordBreak:"break-word",maxWidth:320}}>{authError}</p>
        <Btn onClick={()=>{ setAuthError(null); setSession(undefined); window.location.reload(); }}>⟳ Dobara Try Karein</Btn>
      </div>
    );
  }
  if(session===undefined||(session&&!user)){
    return <div style={{minHeight:"100vh",background:"#0a0a0a",display:"flex",alignItems:"center",justifyContent:"center",color:"#525252"}}>⟳ Load ho raha hai...</div>;
  }
  if(!user){
    return (
      <div style={{minHeight:"100vh",background:"#0a0a0a"}}>
        <AuthScreen notify={notify}/>
        <Toast text={toast}/>
        <style>{GLOBAL_CSS}</style>
      </div>
    );
  }

  if(showAdmin && user.isAdmin){
    return (
      <div style={{minHeight:"100vh",background:"#0a0a0a"}}>
        <AdminPanel onExit={()=>setShowAdmin(false)} notify={notify}/>
        <Toast text={toast}/>
        <style>{GLOBAL_CSS}</style>
      </div>
    );
  }

  if(activeLive){
    return (
      <div style={{minHeight:"100vh",background:"#0a0a0a"}}>
        <LiveDetailView post={activeLive} user={user} onBack={()=>setActiveLive(null)} fireBurst={fireBurst} notify={notify} onCloseLive={closeLive} refreshFeed={refreshFeed}/>
        <GiftBurst burst={burst}/>
        <Toast text={toast}/>
        <style>{GLOBAL_CSS}</style>
      </div>
    );
  }

  if(chatPartner){
    return (
      <div style={{minHeight:"100vh",background:"#0a0a0a"}}>
        <ChatView user={user} partner={chatPartner} onBack={()=>setChatPartner(null)}/>
        <Toast text={toast}/>
        <style>{GLOBAL_CSS}</style>
      </div>
    );
  }

  const TABS=[
    ["home","🏠"],["live","📡"],["reels","🎬"],["search","🔍"],["inbox","💬"],["profile","👤"],
  ];

  return (
    <div style={{minHeight:"100vh",background:"#0a0a0a",display:"flex",flexDirection:"column"}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"12px 16px",borderBottom:"1px solid #171717",position:"sticky",top:0,background:"#0a0a0a",zIndex:30}}>
        <span style={{fontWeight:900,fontSize:20,color:"#fafafa"}}>🌊 {APP_NAME}</span>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <CoinPill value={user.coinBalance} onClick={()=>setTab("wallet")}/>
          <button onClick={toggleNotifs} style={{position:"relative",background:"none",border:"none",cursor:"pointer",fontSize:18}}>
            🔔
            {unreadCount>0&&<span style={{position:"absolute",top:-4,right:-4,background:"#e11d48",color:"#fff",fontSize:9,fontWeight:700,borderRadius:999,padding:"1px 5px"}}>{unreadCount}</span>}
          </button>
          {user.isAdmin&&<button onClick={()=>setShowAdmin(true)} style={{background:"none",border:"none",cursor:"pointer",fontSize:16}}>🛡️</button>}
        </div>
      </div>

      {notifOpen&&(
        <div style={{position:"fixed",top:56,right:14,zIndex:40,background:"#171717",border:"1px solid #262626",borderRadius:14,width:260,maxHeight:320,overflowY:"auto",boxShadow:"0 8px 30px rgba(0,0,0,.5)"}}>
          {notifications.length===0&&<p style={{color:"#525252",fontSize:12,padding:14,margin:0}}>Koi notification nahi</p>}
          {notifications.map(n=>(
            <div key={n.id} style={{padding:"10px 14px",borderBottom:"1px solid #262626",fontSize:12,color:n.read?"#737373":"#e5e5e5"}}>
              {n.body}
              <div style={{fontSize:10,color:"#525252",marginTop:2}}>{timeAgo(n.ts)} pehle</div>
            </div>
          ))}
        </div>
      )}

      <div style={{flex:1,overflowY:"auto",paddingBottom:70,display:"flex",flexDirection:tab==="reels"||tab==="live"&&activeLive?"column":undefined}}>
        {tab==="home"&&<FeedView posts={posts} user={user} refreshFeed={refreshFeed} notify={notify} fireBurst={fireBurst} onOpenLive={openLive}/>}
        {tab==="live"&&<LiveFeedView posts={posts} user={user} onOpenLive={openLive} onStartLive={()=>setTab("golive")}/>}
        {tab==="golive"&&<GoLiveView user={user} notify={notify} onDone={(post)=>{ refreshFeed(); setTab("live"); openLive(post); }}/>}
        {tab==="reels"&&<ReelsView posts={posts} user={user} notify={notify} refreshFeed={refreshFeed} fireBurst={fireBurst}/>}
        {tab==="search"&&<SearchView user={user} notify={notify} onOpenChat={setChatPartner}/>}
        {tab==="inbox"&&<InboxView user={user} onOpenChat={setChatPartner} notify={notify} notifications={notifications}/>}
        {tab==="profile"&&<ProfileView user={user} onLogout={handleLogout} onGoWallet={()=>setTab("wallet")} notify={notify} onUserUpdate={setUser}/>}
        {tab==="wallet"&&<WalletView user={user} notify={notify} onRefreshUser={(bal)=>setUser(u=>({...u,coinBalance:bal}))}/>}
        {tab==="create"&&<CreateView user={user} notify={notify} onDone={()=>{ refreshFeed(); setTab("home"); notify("Post ho gaya!"); }}/>}
      </div>

      <div style={{position:"fixed",bottom:0,left:0,right:0,background:"#0a0a0a",borderTop:"1px solid #171717",display:"flex",alignItems:"center",justifyContent:"space-around",padding:"8px 4px calc(8px + env(safe-area-inset-bottom))",zIndex:30}}>
        {TABS.slice(0,3).map(([id,icon])=>(
          <button key={id} onClick={()=>setTab(id)} style={{background:"none",border:"none",cursor:"pointer",fontSize:20,opacity:tab===id?1:0.4,padding:6}}>{icon}</button>
        ))}
        <button onClick={()=>setTab("create")} style={{background:"linear-gradient(135deg,#f59e0b,#e11d48)",border:"none",borderRadius:14,width:42,height:42,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",fontSize:18,color:"#0a0a0a",marginTop:-14,boxShadow:"0 4px 14px rgba(245,158,11,.4)"}}>➕</button>
        {TABS.slice(3).map(([id,icon])=>(
          <button key={id} onClick={()=>setTab(id)} style={{background:"none",border:"none",cursor:"pointer",fontSize:20,opacity:tab===id?1:0.4,padding:6}}>{icon}</button>
        ))}
      </div>

      <GiftBurst burst={burst}/>
      <Toast text={toast}/>
      <style>{GLOBAL_CSS}</style>
    </div>
  );
}

const GLOBAL_CSS = `
  * { box-sizing: border-box; }
  body { margin:0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
  @keyframes giftPop { 0%{transform:scale(.4);opacity:0;} 15%{transform:scale(1.15);opacity:1;} 80%{transform:scale(1);opacity:1;} 100%{transform:scale(.9);opacity:0;} }
  ::-webkit-scrollbar { width:0; height:0; }
`;
