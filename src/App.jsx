import { useState, useEffect, useRef, useCallback } from "react";
import { Room, RoomEvent, Track, createLocalTracks } from "livekit-client";
import * as db from "./db";
import { supabase } from "./supabaseClient";

// ── LiveKit config ───────────────────────────────────────────────────────────
const LIVEKIT_URL = import.meta.env.VITE_LIVEKIT_URL || "wss://lahar-40sq54fh.livekit.cloud";

async function fetchLiveKitToken({ room, identity, name, canPublish }) {
  const params = new URLSearchParams({ room, identity, name, canPublish: canPublish ? "true" : "false" });
  const res = await fetch(`/api/get-livekit-token?${params.toString()}`);
  if (!res.ok) throw new Error("Could not get token");
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

// ── SVG icon system (professional icon set — replaces emoji chrome icons) ───
const SVGIC = {
  home: "M3 11l9-7 9 7 M5 10v9a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1v-9",
  live: "M12 12m-3 0a3 3 0 1 0 6 0a3 3 0 1 0 -6 0 M7 8a7 7 0 0 0 0 8 M17 8a7 7 0 0 1 0 8 M4 5a11 11 0 0 0 0 14 M20 5a11 11 0 0 1 0 14",
  reel: "M3 4h18v16H3z M8 4l2.5 5 M14 4l2.5 5 M3 12h18",
  search: "M11 4a7 7 0 1 0 0 14a7 7 0 0 0 0-14z M21 21l-4.3-4.3",
  chat: "M4 5h16v11H8l-4 4z",
  user: "M12 4.5a3.5 3.5 0 1 0 0 7a3.5 3.5 0 0 0 0-7z M4.5 20c1.6-3.6 5-5.5 7.5-5.5S18 16.4 19.5 20",
  plus: "M12 5v14 M5 12h14",
  bell: "M12 2a6 6 0 0 0-6 6v3.3c0 .6-.2 1.2-.6 1.7L4 15.5c-.6.8 0 2 1 2h14c1 0 1.6-1.2 1-2l-1.4-2.5c-.4-.5-.6-1.1-.6-1.7V8a6 6 0 0 0-6-6z M9.5 20a2.5 2.5 0 0 0 5 0",
  shield: "M12 3l7 3v6c0 4.5-3 8-7 9-4-1-7-4.5-7-9V6z",
  heart: "M12 20s-7-4.4-9.3-8.8C1.2 8 2.6 5 6 5c2 0 3.4 1.2 4 2.4.6-1.2 2-2.4 4-2.4 3.4 0 4.8 3 3.3 6.2C19 15.6 12 20 12 20z",
  comment: "M4 5h16v11H8l-4 4z",
  gift: "M3 9h18v11H3z M3 9h18 M12 9v11 M12 9c-1.5-4-6-4-6-1.3C6 9 8 9 12 9zm0 0c1.5-4 6-4 6-1.3C18 9 16 9 12 9z",
  share: "M4 12v6a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-6 M16 6l-4-4-4 4 M12 2v13",
  star: "M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5-5.9-3.2-5.9 3.2 1.2-6.5-4.8-4.6 6.6-.9z",
  close: "M18 6L6 18 M6 6l12 12",
  back: "M19 12H5 M12 19l-7-7 7-7",
  check: "M20 6L9 17l-5-5",
  edit: "M12 20h9 M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z",
  lock: "M5 11h14v10H5z M8 11V7a4 4 0 0 1 8 0v4",
  logout: "M9 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h3 M16 17l5-5-5-5 M21 12H9",
  upload: "M12 15V4 M7 9l5-5 5 5 M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3",
  trash: "M3 6h18 M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2 M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6",
  more: "M12 5m-1.2 0a1.2 1.2 0 1 0 2.4 0a1.2 1.2 0 1 0 -2.4 0 M12 12m-1.2 0a1.2 1.2 0 1 0 2.4 0a1.2 1.2 0 1 0 -2.4 0 M12 19m-1.2 0a1.2 1.2 0 1 0 2.4 0a1.2 1.2 0 1 0 -2.4 0",
  image: "M3 4h18v16H3z M8.5 10.5m-1.5 0a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0 -3 0 M21 15l-5-5-9 9",
  play: "M6 4l14 8-14 8z",
  pause: "M7 4h4v16H7z M13 4h4v16h-4z",
  eye: "M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z M12 12m-3 0a3 3 0 1 0 6 0a3 3 0 1 0 -6 0",
  send: "M22 2L11 13 M22 2l-7 20-4-9-9-4z",
  wallet: "M3 7h15a3 3 0 0 1 3 3v7a3 3 0 0 1-3 3H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h13 M16 13m-1.5 0a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0 -3 0",
  cash: "M2 7h20v10H2z M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z",
  verified: "M12 2.5l2.2 1.2 2.5-.4 1 2.3 2.3 1-.4 2.5 1.2 2.2-1.2 2.2.4 2.5-2.3 1-1 2.3-2.5-.4L12 21.5l-2.2-1.2-2.5.4-1-2.3-2.3-1 .4-2.5L3.2 12l1.2-2.2-.4-2.5 2.3-1 1-2.3 2.5.4z M8.5 12l2.3 2.3 4.7-4.7",
  camera: "M4 8h3l2-3h6l2 3h3v11H4z M12 12m-3.5 0a3.5 3.5 0 1 0 7 0a3.5 3.5 0 1 0 -7 0",
  mute: "M11 5L6 9H2v6h4l5 4z M23 9l-6 6 M17 9l6 6",
  unmute: "M11 5L6 9H2v6h4l5 4z M15.5 8.5a5 5 0 0 1 0 7 M18.5 6a9 9 0 0 1 0 12",
  clock: "M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0 -18 0 M12 7v5l3.5 2",
};
function Icon({name,size=18,color="currentColor",fill="none",strokeWidth=1.8}){
  const d=SVGIC[name]; if(!d) return null;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      {d.split(" M").map((seg,i)=><path key={i} d={i===0?seg:"M"+seg}/>)}
    </svg>
  );
}
function WaveLogo({size=36}){
  return (
    <svg width={size} height={size} viewBox="0 0 52 52" fill="none">
      <defs>
        <radialGradient id="lgLogo" cx="35%" cy="30%" r="75%">
          <stop offset="0%" stopColor="#F0A6E0"/>
          <stop offset="45%" stopColor="#B565E8"/>
          <stop offset="100%" stopColor="#6D28D9"/>
        </radialGradient>
        <clipPath id="lgLogoClip"><circle cx="26" cy="26" r="21"/></clipPath>
      </defs>
      <circle cx="26" cy="26" r="21" fill="url(#lgLogo)"/>
      <g clipPath="url(#lgLogoClip)" opacity="0.9">
        <path d="M2 32c5-5 9-5 14 0s9 5 14 0 9-5 14 0v20H2z" fill="#160D26" opacity="0.35"/>
        <path d="M2 26c5-5 9-5 14 0s9 5 14 0 9-5 14 0" stroke="#fff" strokeWidth="1.6" fill="none" opacity="0.8"/>
      </g>
      <circle cx="19" cy="18" r="3.5" fill="#fff" opacity="0.5"/>
    </svg>
  );
}

// ── Config ───────────────────────────────────────────────────────────────────
const APP_NAME = "Lehar";
const OWNER_PAYMENT = { Easypaisa:"03478946876", JazzCash:"03127847503", SadaPay:"03449649860" };
const TOPUP_COINS_PER_PKR = 1/20;
const WITHDRAW_COINS_PER_PKR = 1/12;
const MIN_TOPUP_PKR = 3000;
const GIFT_STORAGE_URL = "https://xfmzqphclvakfhezmdie.supabase.co/storage/v1/object/public/gift-animations/";
function giftMediaUrl(file){ return file ? `${GIFT_STORAGE_URL}${file}` : null; }

const GIFTS = [
  {id:"rose",name:"Rose",emoji:"🌹",cost:10,pkr:1,file:"rose.gif"},
  {id:"kiss",name:"Kiss",emoji:"💋",cost:15,pkr:2,file:"kiss.gif"},
  {id:"heart",name:"Heart",emoji:"💖",cost:15,pkr:2,file:"heart.gif"},
  {id:"crown",name:"Crown",emoji:"👑",cost:20,pkr:2,file:"crown.gif"},
  {id:"dragon",name:"Dragon",emoji:"🐉",cost:2500,pkr:250,file:"dragon.mp4"},
  {id:"star",name:"Star",emoji:"⭐",cost:17,pkr:2,file:"star.gif"},
  {id:"universe",name:"Universe",emoji:"🌌",cost:25,pkr:3,file:"universe.mp4"},
  {id:"lion",name:"Lion",emoji:"🦁",cost:5000,pkr:500,file:"lion.mp4"},
  {id:"car",name:"Car",emoji:"🚙",cost:4000,pkr:400,file:"car.mp4"},
];
const AVATAR_COLORS = ["#FF4D6D","#FFD166","#7C3AED","#059669","#0284c7","#c026d3","#ea580c"];
const REACTIONS = [
  {id:"heart",emoji:"❤️"},
  {id:"laugh",emoji:"😂"},
  {id:"sad",emoji:"😢"},
];

// ── Helpers ──────────────────────────────────────────────────────────────────
function uid(p){ return `${p}${Date.now().toString(36)}${Math.random().toString(36).slice(2,8)}`; }
function avatarColor(name){ let h=0; for(let i=0;i<(name||"").length;i++) h=(h+name.charCodeAt(i))%AVATAR_COLORS.length; return AVATAR_COLORS[h]; }
function timeAgo(ts){ const d=Math.max(0,Date.now()-ts),m=Math.floor(d/60000); if(m<1)return"just now"; if(m<60)return`${m}m`; const h=Math.floor(m/60); if(h<24)return`${h}h`; return`${Math.floor(h/24)}d`; }

// ── UI Primitives ─────────────────────────────────────────────────────────────
function Avatar({name,size=40,live=false,pic=null,verified=false}){
  const bg=avatarColor(name); const initial=(name||"?")[0]?.toUpperCase()||"?";
  return (
    <div style={{position:"relative",width:size,height:size,flexShrink:0}}>
      <div style={{width:size,height:size,borderRadius:"50%",background:pic?"transparent":bg,border:live?"2px solid #FF4D6D":"none",overflow:"hidden",display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontWeight:700,fontSize:size*0.4}}>
        {pic?<img src={pic} alt={name} style={{width:"100%",height:"100%",objectFit:"cover"}}/>:initial}
      </div>
      {live&&<span style={{position:"absolute",bottom:-4,left:"50%",transform:"translateX(-50%)",background:"#E11D48",color:"#fff",fontSize:8,padding:"1px 5px",borderRadius:999,fontWeight:700}}>LIVE</span>}
      {verified&&<span style={{position:"absolute",bottom:0,right:0,background:"#120A22",borderRadius:"50%",display:"flex"}}><Icon name="verified" size={13} color="#A855F7" fill="#A855F7" strokeWidth={0}/></span>}
    </div>
  );
}

function CoinPill({value,onClick}){
  return <button onClick={onClick} style={{display:"flex",alignItems:"center",gap:5,background:"#1C1233",border:"1px solid #FFD166",borderRadius:999,padding:"4px 10px",cursor:"pointer"}}><Icon name="star" size={12} color="#FFD166" fill="#FFD166" strokeWidth={1.4}/><span style={{color:"#FFD166",fontWeight:700,fontSize:13,fontFamily:"monospace"}}>{value??0}</span></button>;
}

function Btn({children,onClick,disabled,style={},ghost=false}){
  const base={fontWeight:700,borderRadius:14,padding:"10px 16px",border:"none",cursor:disabled?"not-allowed":"pointer",opacity:disabled?0.4:1,fontSize:14,display:"flex",alignItems:"center",justifyContent:"center",gap:6,transition:"all .15s",...style};
  const theme=ghost?{background:"transparent",border:"1px solid #3A2A5C",color:"#F4EEFF"}:{background:"linear-gradient(135deg,#A855F7,#EC4899)",color:"#fff"};
  return <button onClick={disabled?undefined:onClick} style={{...base,...theme}}>{children}</button>;
}

function Toast({text}){ if(!text)return null; return <div style={{position:"fixed",top:16,left:"50%",transform:"translateX(-50%)",background:"#F4EEFF",color:"#120A22",padding:"8px 18px",borderRadius:999,fontWeight:600,fontSize:13,zIndex:300,whiteSpace:"nowrap",boxShadow:"0 4px 20px rgba(0,0,0,.4)"}}>{text}</div>; }

function GiftBurst({burst}){
  const videoRef=useRef(null);
  const [ended,setEnded]=useState(false);
  const [failed,setFailed]=useState(false);
  const [needsTap,setNeedsTap]=useState(false);
  const isGif=burst?.file&&burst.file.toLowerCase().endsWith(".gif");

  useEffect(()=>{
    setEnded(false); setFailed(false); setNeedsTap(false);
    if(!burst) return;
    const minTime=isGif?3000:1500;
    const t=setTimeout(()=>setEnded(true), isGif?3000:15000);
    return ()=>clearTimeout(t);
  },[burst?.key]);

  useEffect(()=>{
    if(!burst||isGif) return;
    const v=videoRef.current;
    if(!v) return;
    v.muted=false;
    const p=v.play();
    if(p&&p.catch) p.catch(()=>{ v.muted=true; setNeedsTap(true); v.play().catch(()=>{}); });
  },[burst?.key]);

  if(!burst||ended) return null;
  const mediaUrl=giftMediaUrl(burst.file);
  function unmute(){ if(videoRef.current){ videoRef.current.muted=false; setNeedsTap(false); } }
  function handleEnded(){
    const v=videoRef.current;
    if(v&&v.currentTime<2){ v.currentTime=0; v.play().catch(()=>{}); return; }
    setEnded(true);
  }

  return (
    <div key={burst.key} style={{position:"fixed",inset:0,zIndex:250,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",pointerEvents:needsTap?"auto":"none"}}>
      {mediaUrl&&!failed?(
        isGif?(
          <img key={burst.key} src={mediaUrl} onError={()=>setFailed(true)} style={{maxWidth:"55%",maxHeight:"38%",objectFit:"contain"}}/>
        ):(
          <video key={burst.key} ref={videoRef} src={mediaUrl} playsInline preload="auto" onEnded={handleEnded} onError={()=>setFailed(true)} onClick={needsTap?unmute:undefined} style={{maxWidth:"55%",maxHeight:"38%",objectFit:"contain"}}/>
        )
      ):(
        <div style={{fontSize:64,animation:"giftPop 2.1s ease-out forwards"}}>{burst.emoji}</div>
      )}
      {needsTap&&<div onClick={unmute} style={{marginTop:8,background:"rgba(0,0,0,.5)",color:"#fff",padding:"4px 12px",borderRadius:999,fontSize:12,pointerEvents:"auto",cursor:"pointer",display:"flex",alignItems:"center",gap:6}}><Icon name="mute" size={14}/> Tap to unmute</div>}
      <div style={{fontWeight:800,fontSize:18,marginTop:8,background:"linear-gradient(90deg,#FFD166,#FF8FA3)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}}>{burst.from} ne {burst.name} bheja!</div>
    </div>
  );
}
    
function ConfirmDialog({title,message,onConfirm,onCancel}){
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.7)",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center",padding:24}} onClick={onCancel}>
      <div style={{background:"#1C1233",border:"1px solid #2E1F4D",borderRadius:18,padding:20,width:"100%",maxWidth:320}} onClick={e=>e.stopPropagation()}>
        <h3 style={{color:"#F4EEFF",margin:"0 0 8px",fontWeight:700,fontSize:16}}>{title}</h3>
        <p style={{color:"#9B8FC0",fontSize:13,margin:"0 0 16px"}}>{message}</p>
        <div style={{display:"flex",gap:8}}>
          <Btn ghost onClick={onCancel} style={{flex:1}}>Cancel</Btn>
          <Btn onClick={onConfirm} style={{flex:1,background:"#FF4D6D",color:"#fff"}}>Delete</Btn>
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
    if(!em.includes("@"))return notify("Please enter a valid email");
    if(password.length<6)return notify("Password must be at least 6 characters");
    setBusy(true);
    try{
      if(mode==="signup"){
        const uname=username.trim().toLowerCase();
        if(uname.length<3){notify("Username must be at least 3 characters");setBusy(false);return;}
        if(!/^[a-z0-9_.]+$/.test(uname)){notify("Username can only contain letters, numbers, _ or .");setBusy(false);return;}
        if(password!==confirm){notify("Passwords do not match");setBusy(false);return;}
        await db.signUp({email:em,password,username:uname});
        notify("Account created! Logging you in...");
      } else {
        await db.signIn({email:em,password});
      }
    } catch(e){
      notify(translateAuthError(e?.message)||"Something went wrong");
    } finally { setBusy(false); }
  }

  const inp={width:"100%",background:"#1C1233",border:"1px solid #2E1F4D",borderRadius:12,padding:"12px 14px",color:"#F4EEFF",fontSize:14,outline:"none",boxSizing:"border-box"};
  return (
    <div style={{minHeight:"100%",display:"flex",flexDirection:"column",justifyContent:"center",padding:"40px 24px",background:"radial-gradient(circle at 50% 15%, rgba(168,85,247,0.16), transparent 55%)"}}>
      <div style={{textAlign:"center",marginBottom:32}}>
        <div style={{display:"flex",justifyContent:"center",marginBottom:14,filter:"drop-shadow(0 0 22px rgba(168,85,247,0.4))"}}>
          <WaveLogo size={64}/>
        </div>
        <h1 style={{fontSize:32,fontWeight:800,color:"#F4EEFF",margin:0,fontFamily:"'Sora',sans-serif"}}>{APP_NAME}</h1>
        <p style={{color:"#9B8FC0",fontSize:13,marginTop:4}}>Short videos • Live • Real gifting</p>
      </div>
      <div style={{display:"flex",background:"#1C1233",borderRadius:14,padding:4,marginBottom:20}}>
        {["login","signup"].map(m=><button key={m} onClick={()=>setMode(m)} style={{flex:1,padding:"8px",borderRadius:10,border:"none",fontWeight:700,fontSize:13,background:mode===m?"#F4EEFF":"transparent",color:mode===m?"#120A22":"#9B8FC0",cursor:"pointer"}}>{m==="login"?"Login":"Signup"}</button>)}
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:10}}>
        {mode==="signup"&&<input value={username} onChange={e=>setUsername(e.target.value)} placeholder="Username" style={inp}/>}
        <input value={email} onChange={e=>setEmail(e.target.value)} placeholder="Email" type="email" style={inp}/>
        <input value={password} onChange={e=>setPassword(e.target.value)} type="password" placeholder="Password" style={inp}/>
        {mode==="signup"&&<input value={confirm} onChange={e=>setConfirm(e.target.value)} type="password" placeholder="Confirm password" style={inp}/>}
        <Btn onClick={handleSubmit} disabled={busy} style={{width:"100%",marginTop:4}}>{mode==="login"?"Log In":"Create Account"}</Btn>
      </div>
    </div>
  );
}

function translateAuthError(msg){
  if(!msg) return null;
  if(msg.includes("already registered")||msg.includes("already been registered")) return "Email already exists";
  if(msg.includes("Invalid login credentials")) return "Incorrect email or password";
  if(msg.includes("duplicate key")&&msg.includes("username")) return "Username already taken";
  if(msg.includes("Password should be")) return "Password must be at least 6 characters";
  return msg;
}
// ── Comment Sheet ─────────────────────────────────────────────────────────────
function CommentSheet({post,user,onClose,onAddComment,onReact,onDeleteComment}){
  const [text,setText]=useState("");
  const isPostOwner=post.userId===user.userId;
  const inp={flex:1,background:"#120A22",border:"1px solid #2E1F4D",borderRadius:999,padding:"8px 14px",color:"#F4EEFF",fontSize:13,outline:"none"};
  return (
    <div style={{position:"fixed",inset:0,zIndex:120,display:"flex",flexDirection:"column",justifyContent:"flex-end"}}>
      <div style={{flex:1}} onClick={onClose}/>
      <div style={{background:"#1C1233",borderTop:"1px solid #2E1F4D",borderRadius:"20px 20px 0 0",maxHeight:"70vh",display:"flex",flexDirection:"column"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"12px 16px",borderBottom:"1px solid #2E1F4D"}}>
          <span style={{fontWeight:700,color:"#F4EEFF"}}>Comments ({post.comments?.length||0})</span>
          <button onClick={onClose} style={{color:"#9B8FC0",background:"none",border:"none",cursor:"pointer",display:"flex"}}><Icon name="close" size={18}/></button>
        </div>
        <div style={{flex:1,overflowY:"auto",padding:"8px 16px",display:"flex",flexDirection:"column",gap:8}}>
          {(post.comments||[]).map((c)=>(
            <div key={c.id} style={{display:"flex",gap:8,alignItems:"flex-start"}}>
              <Avatar name={c.username} size={28} pic={c.profilePic}/>
              <div style={{background:"#120A22",borderRadius:10,padding:"6px 10px",flex:1}}>
                <div style={{fontWeight:700,color:"#F4EEFF",fontSize:12}}>{c.username}</div>
                <div style={{color:c.isGift?"#FFD166":"#D9CCF0",fontSize:13,marginTop:2}}>{c.text}</div>
                <div style={{display:"flex",alignItems:"center",gap:6,marginTop:4}}>
                  {REACTIONS.map(r=>(
                    <button key={r.id} onClick={()=>onReact(c,r.id)} style={{background:c.reaction===r.id?"rgba(212,175,106,.25)":"none",border:"none",cursor:"pointer",fontSize:13,borderRadius:8,padding:"1px 4px",opacity:c.reaction===r.id?1:0.55}}>{r.emoji}</button>
                  ))}
                  {(c.userId===user.userId||isPostOwner)&&(
                    <button onClick={()=>onDeleteComment(c)} style={{marginLeft:"auto",background:"none",border:"none",cursor:"pointer",color:"#9B8FC0",display:"flex"}}><Icon name="trash" size={13}/></button>
                  )}
                </div>
              </div>
            </div>
          ))}
          {(post.comments||[]).length===0&&<p style={{color:"#9B8FC0",fontSize:13,textAlign:"center",padding:"20px 0"}}>No comments yet — be the first!</p>}
        </div>
        <div style={{display:"flex",gap:8,padding:10,borderTop:"1px solid #2E1F4D"}}>
          <Avatar name={user.username} size={28} pic={user.profilePic}/>
          <input value={text} onChange={e=>setText(e.target.value)} onKeyDown={e=>e.key==="Enter"&&text.trim()&&(onAddComment(text.trim()),setText(""))} placeholder="Write a comment..." style={inp}/>
          <button onClick={()=>{if(text.trim()){onAddComment(text.trim());setText("");}}} style={{background:"#FFD166",color:"#120A22",border:"none",borderRadius:999,padding:"0 14px",fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center"}}><Icon name="send" size={15} color="#120A22"/></button>
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
      <div style={{background:"#1C1233",borderTop:"1px solid #2E1F4D",borderRadius:"20px 20px 0 0"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"12px 16px",borderBottom:"1px solid #2E1F4D"}}>
          <span style={{fontWeight:700,color:"#F4EEFF",display:"flex",alignItems:"center",gap:6}}><Icon name="gift" size={16} color="#FFD166"/> Send Gift</span>
          <CoinPill value={balance}/>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8,padding:14,maxHeight:240,overflowY:"auto"}}>
          {GIFTS.map(g=>(
            <button key={g.id} onClick={()=>onSend(g)} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:4,background:"#120A22",border:"1px solid #2E1F4D",borderRadius:12,padding:"10px 4px",cursor:"pointer"}}>
              <span style={{fontSize:26}}>{g.emoji}</span>
              <span style={{color:"#D9CCF0",fontSize:10,fontWeight:600}}>{g.name}</span>
              <span style={{color:"#FFD166",fontSize:10,fontFamily:"monospace"}}>{g.cost}</span>
            </button>
          ))}
        </div>
        <p style={{textAlign:"center",color:"#9B8FC0",fontSize:11,paddingBottom:12}}>Low on coins? Top up from Wallet</p>
      </div>
    </div>
  );
}

// ── Post Card ─────────────────────────────────────────────────────────────────
function PostCard({post,user,onLike,onOpenComments,onOpenGift,onOpenLive,onOpenMedia,onDelete,onOpenProfile}){
  const liked=post.likes?.includes(user.userId);
  const author=post.author;
  const canDelete=post.userId===user.userId||user.isAdmin;
  const [menuOpen,setMenuOpen]=useState(false);
  return (
    <div style={{background:"#1C1233",border:"1px solid #2E1F4D",borderRadius:18,overflow:"hidden",marginBottom:14}}>
      <div style={{display:"flex",alignItems:"center",gap:10,padding:"10px 12px",cursor:"pointer"}} onClick={()=>onOpenProfile?.(post.userId)}>
        <Avatar name={post.username} live={post.isLive} pic={author?.profilePic} verified={author?.verified}/>
        <div style={{flex:1}}>
          <div style={{display:"flex",alignItems:"center",gap:4}}>
            <span style={{fontWeight:700,color:"#F4EEFF",fontSize:13}}>{post.username}</span>
            {author?.verified&&<Icon name="verified" size={13} color="#A855F7" fill="#A855F7" strokeWidth={0}/>}
          </div>
          <span style={{color:"#9B8FC0",fontSize:11}}>{timeAgo(post.createdAt)} ago</span>
        </div>
        {post.isLive&&<button onClick={(e)=>{e.stopPropagation();onOpenLive(post);}} style={{background:"#E11D48",color:"#fff",border:"none",borderRadius:999,padding:"6px 12px",fontSize:11,fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",gap:5}}><Icon name="live" size={13}/> Join Live</button>}
        {canDelete&&(
          <div style={{position:"relative"}} onClick={e=>e.stopPropagation()}>
            <button onClick={()=>setMenuOpen(v=>!v)} style={{background:"none",border:"none",color:"#9B8FC0",fontSize:16,cursor:"pointer",padding:4}}>⋮</button>
            {menuOpen&&(
              <div style={{position:"absolute",right:0,top:24,background:"#120A22",border:"1px solid #2E1F4D",borderRadius:10,overflow:"hidden",zIndex:10,minWidth:120}}>
                <button onClick={()=>{setMenuOpen(false);onDelete(post);}} style={{display:"flex",alignItems:"center",gap:6,width:"100%",padding:"10px 12px",background:"none",border:"none",color:"#FF4D6D",fontSize:12,fontWeight:600,cursor:"pointer"}}><Icon name="trash" size={14}/> Delete</button>
              </div>
            )}
          </div>
        )}
      </div>
      {post.mediaData&&post.mediaType==="video"?(
        <div style={{position:"relative",background:"#000",cursor:"pointer"}} onClick={()=>onOpenMedia(post)}>
          <video src={post.mediaData} style={{width:"100%",maxHeight:360,display:"block"}} muted playsInline preload="metadata"/>
          <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center"}}><div style={{background:"rgba(0,0,0,.5)",borderRadius:"50%",width:48,height:48,display:"flex",alignItems:"center",justifyContent:"center"}}><Icon name="play" size={22} color="#F4EEFF" fill="#F4EEFF"/></div></div>
        </div>
      ):post.mediaData&&post.mediaType==="image"?(
        <img src={post.mediaData} alt="post" style={{width:"100%",maxHeight:400,objectFit:"cover",display:"block",cursor:"pointer"}} onClick={()=>onOpenMedia(post)}/>
      ):null}
      {post.caption&&<p style={{padding:"8px 14px",color:"#F4EEFF",fontSize:14,lineHeight:1.5}}>{post.caption}</p>}
      <div style={{display:"flex",alignItems:"center",gap:16,padding:"10px 14px",borderTop:"1px solid #2E1F4D"}}>
        <button onClick={()=>onLike(post)} style={{display:"flex",alignItems:"center",gap:5,background:"none",border:"none",cursor:"pointer",color:liked?"#FF4D6D":"#9B8FC0",fontSize:13}}><Icon name="heart" size={16} color={liked?"#FF4D6D":"#9B8FC0"} fill={liked?"#FF4D6D":"none"}/> {post.likes?.length||0}</button>
        <button onClick={()=>onOpenComments(post)} style={{display:"flex",alignItems:"center",gap:5,background:"none",border:"none",cursor:"pointer",color:"#9B8FC0",fontSize:13}}><Icon name="comment" size={16}/> {post.comments?.length||0}</button>
        <button onClick={()=>onOpenGift(post)} style={{display:"flex",alignItems:"center",gap:5,background:"none",border:"none",cursor:"pointer",color:"#FFD166",fontSize:13}}><Icon name="gift" size={16} color="#FFD166"/> Gift</button>
        <button style={{display:"flex",alignItems:"center",gap:5,background:"none",border:"none",cursor:"pointer",color:"#9B8FC0",fontSize:13,marginLeft:"auto"}}><Icon name="share" size={15}/></button>
      </div>
    </div>
  );
}

// ── Fullscreen Media Viewer (fixes "video post opens on click") ─
function MediaViewerModal({post,onClose}){
  if(!post) return null;
  return (
    <div style={{position:"fixed",inset:0,zIndex:200,background:"#000",display:"flex",flexDirection:"column"}} onClick={onClose}>
      <button onClick={onClose} style={{position:"absolute",top:14,right:14,background:"rgba(255,255,255,.15)",border:"none",borderRadius:"50%",width:34,height:34,color:"#fff",cursor:"pointer",zIndex:5,display:"flex",alignItems:"center",justifyContent:"center"}}><Icon name="close" size={17}/></button>
      <div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center"}} onClick={e=>e.stopPropagation()}>
        {post.mediaType==="video"?(
          <video src={post.mediaData} style={{maxWidth:"100%",maxHeight:"100%"}} controls playsInline/>
        ):(
          <img src={post.mediaData} alt="" style={{maxWidth:"100%",maxHeight:"100%",objectFit:"contain"}}/>
        )}
      </div>
      {post.caption&&<p style={{color:"#F4EEFF",fontSize:13,padding:14,textAlign:"center"}}>{post.caption}</p>}
    </div>
  );
}
// ── Feed View ─────────────────────────────────────────────────────────────────
function FeedView({posts,user,refreshFeed,notify,fireBurst,onOpenLive,onOpenProfile}){
  const [commentPost,setCommentPost]=useState(null);
  const [giftPost,setGiftPost]=useState(null);
  const [mediaPost,setMediaPost]=useState(null);
  const [confirmDelete,setConfirmDelete]=useState(null);
  const visible=posts.filter(p=>!p.isLive&&!p.isReel);

  async function handleLike(post){
    const liked=post.likes?.includes(user.userId);
    try{ await db.toggleLike(post.postId,user.userId,liked); refreshFeed(); }catch(e){ notify("Could not like"); }
  }
  async function handleAddComment(text){
    try{ await db.addComment(commentPost.postId,user.userId,text); await refreshFeed();
      setCommentPost(prev=>prev?{...prev}:null);
    }catch(e){ notify("Could not post comment"); }
  }
  async function handleReact(comment,reaction){
    try{ await db.setCommentReaction(comment.id,comment.reaction===reaction?null:reaction); refreshFeed(); }catch(e){}
  }
  async function handleDeleteComment(comment){
    try{ await db.deleteComment(comment.id); await refreshFeed(); }catch(e){ notify("Could not delete"); }
  }
  async function handleSendGift(gift){
    try{
      const newBal=await db.sendGift({fromId:user.userId,toId:giftPost.userId,postId:giftPost.postId,gift});
      fireBurst({emoji:gift.emoji,name:gift.name,from:user.username,file:gift.file});
      setGiftPost(null); refreshFeed();
      window.dispatchEvent(new CustomEvent("lehar:balance",{detail:newBal}));
    }catch(e){
      notify(e?.message==="INSUFFICIENT_COINS"?"Not enough coins":"Could not send gift");
    }
  }
  async function handleDelete(post){
    try{ await db.deletePost(post.postId); setConfirmDelete(null); refreshFeed(); notify("Post deleted"); }
    catch(e){ notify("Could not delete"); }
  }
  return (
    <div style={{padding:"10px 12px"}}>
      {visible.length===0&&<div style={{textAlign:"center",padding:"60px 0",color:"#9B8FC0"}}><div style={{marginBottom:8,display:"flex",justifyContent:"center",color:"#3A2A5C"}}><Icon name="image" size={36}/></div><p>No posts yet — tap + to post!</p></div>}
      {visible.map(post=><PostCard key={post.postId} post={post} user={user} onLike={handleLike} onOpenComments={setCommentPost} onOpenGift={setGiftPost} onOpenLive={onOpenLive} onOpenMedia={setMediaPost} onDelete={setConfirmDelete} onOpenProfile={onOpenProfile}/>)}
      {commentPost&&<CommentSheet post={posts.find(p=>p.postId===commentPost.postId)||commentPost} user={user} onClose={()=>setCommentPost(null)} onAddComment={handleAddComment} onReact={handleReact} onDeleteComment={handleDeleteComment}/>}
      {giftPost&&<GiftSheet balance={user.coinBalance} onClose={()=>setGiftPost(null)} onSend={handleSendGift}/>}
      {mediaPost&&<MediaViewerModal post={mediaPost} onClose={()=>setMediaPost(null)}/>}
      {confirmDelete&&<ConfirmDialog title="Delete this post?" message="This post will be permanently deleted." onConfirm={()=>handleDelete(confirmDelete)} onCancel={()=>setConfirmDelete(null)}/>}
    </div>
  );
}

// ── shared file validation ───────────────────────────────────────────────────
function validateMediaFile(file,{video=true,image=true,maxMB=50}={}){
  if(video&&file.type.startsWith("video")){
    if(file.size>maxMB*1024*1024) return `Video must be smaller than ${maxMB}MB`;
    return null;
  }
  if(image&&file.type.startsWith("image")){
    if(file.size>15*1024*1024) return "Image must be smaller than 15MB";
    return null;
  }
  return "Please upload a photo or video only";
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
    if(!f.type.startsWith("video")){notify("Only videos can be uploaded as Reels");return;}
    if(f.size>50*1024*1024){notify("Video must be smaller than 50MB");return;}
    setFile(f); setPreviewUrl(URL.createObjectURL(f));
  }
  async function submit(){
    if(!file){notify("Please choose a video first");return;}
    setBusy(true);
    try{
      const mediaUrl=await db.uploadMedia(file,user.userId);
      await db.createPost({userId:user.userId,caption:caption.trim(),mediaUrl,mediaType:"video",isReel:true});
      onDone();
    }catch(e){
      notify("Upload failed — please try again");
    } finally { setBusy(false); }
  }
  const inp={width:"100%",background:"#1C1233",border:"1px solid #2E1F4D",borderRadius:12,padding:"10px 14px",color:"#F4EEFF",fontSize:13,outline:"none",boxSizing:"border-box",resize:"none"};
  return (
    <div style={{position:"fixed",inset:0,zIndex:130,background:"rgba(0,0,0,.8)",display:"flex",flexDirection:"column",justifyContent:"flex-end"}}>
      <div style={{background:"#120A22",borderTop:"1px solid #2E1F4D",borderRadius:"20px 20px 0 0",padding:20}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
          <span style={{fontWeight:700,color:"#F4EEFF",fontSize:17,display:"flex",alignItems:"center",gap:8}}><Icon name="reel" size={18}/> Upload Reel</span>
          <button onClick={onClose} style={{background:"none",border:"none",color:"#9B8FC0",cursor:"pointer",display:"flex"}}><Icon name="close" size={20}/></button>
        </div>
        <input ref={fileRef} type="file" accept="video/*" style={{display:"none"}} onChange={onFileChange}/>
        {previewUrl?(
          <div style={{position:"relative",marginBottom:12,borderRadius:12,overflow:"hidden",background:"#000"}}>
            <video src={previewUrl} style={{width:"100%",maxHeight:180}} controls/>
            <button onClick={()=>{setFile(null);setPreviewUrl(null);}} style={{position:"absolute",top:6,right:6,background:"rgba(0,0,0,.6)",border:"none",borderRadius:"50%",width:24,height:24,cursor:"pointer",color:"#fff",display:"flex",alignItems:"center",justifyContent:"center"}}><Icon name="close" size={13}/></button>
          </div>
        ):(
          <button onClick={()=>fileRef.current?.click()} style={{width:"100%",height:100,border:"2px dashed #3A2A5C",borderRadius:12,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:6,marginBottom:12,background:"none",cursor:"pointer",color:"#9B8FC0"}}>
            <Icon name="upload" size={28} color="#A855F7"/><span style={{fontSize:13}}>Choose a video from gallery</span>
          </button>
        )}
        <textarea value={caption} onChange={e=>setCaption(e.target.value)} placeholder="Write a caption (optional)..." rows={2} style={{...inp,marginBottom:12}}/>
        <Btn onClick={submit} disabled={busy||!file} style={{width:"100%"}}>{busy?"Uploading...":"Post Reel"}</Btn>
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
  const [playing,setPlaying]=useState(true);
  const vRef=useRef(null);
  useEffect(()=>{ if(vRef.current){vRef.current.load();vRef.current.play().catch(()=>{}); setPlaying(true);} },[current]);
  function togglePlay(){
    const v=vRef.current; if(!v) return;
    if(v.paused){ v.play().catch(()=>{}); setPlaying(true); } else { v.pause(); setPlaying(false); }
  }

  async function handleLike(){
    const post=reels[current]; if(!post)return;
    const liked=post.likes?.includes(user.userId);
    try{ await db.toggleLike(post.postId,user.userId,liked); refreshFeed(); }catch(e){}
  }
  async function handleSendGift(gift){
    const post=reels[current]; if(!post)return;
    try{
      const newBal=await db.sendGift({fromId:user.userId,toId:post.userId,postId:post.postId,gift});
fireBurst({emoji:gift.emoji,name:gift.name,from:user.username,file:gift.file}); setGiftPost(null);
      window.dispatchEvent(new CustomEvent("lehar:balance",{detail:newBal}));
    }catch(e){ notify(e?.message==="INSUFFICIENT_COINS"?"Not enough coins":"Could not send gift"); }
  }
  async function handleDelete(post){
    try{ await db.deletePost(post.postId); setConfirmDelete(null); setCurrent(c=>Math.max(0,c-1)); refreshFeed(); notify("Reel deleted"); }
    catch(e){ notify("Could not delete"); }
  }

  if(reels.length===0) return (
    <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:12,color:"#9B8FC0"}}>
      <Icon name="reel" size={40} color="#9B8FC0"/><p>No Reels yet</p>
      <Btn onClick={()=>setShowUpload(true)}>Upload Reel</Btn>
      {showUpload&&<ReelUploadModal user={user} notify={notify} onClose={()=>setShowUpload(false)} onDone={()=>{setShowUpload(false);refreshFeed();notify("Reel uploaded!");}}/>}
    </div>
  );

  const post=reels[current]||reels[0];
  const isLiked=post.likes?.includes(user.userId);
  const canDelete=post.userId===user.userId||user.isAdmin;

  return (
    <div style={{flex:1,position:"relative",background:"#000",overflow:"hidden"}}>
      <video ref={vRef} src={post.mediaData} style={{width:"100%",height:"100%",objectFit:"cover"}} loop playsInline autoPlay muted={muted}/>
      <div style={{position:"absolute",inset:0,display:"flex",pointerEvents:"none"}}>
        <div style={{flex:1,pointerEvents:"auto"}} onClick={()=>setCurrent(c=>Math.max(0,c-1))}/>
        <div style={{flex:1.4,pointerEvents:"auto"}} onClick={togglePlay}/>
        <div style={{flex:1,pointerEvents:"auto"}} onClick={()=>setCurrent(c=>Math.min(reels.length-1,c+1))}/>
      </div>
      {!playing&&<div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",pointerEvents:"none"}}><div style={{background:"rgba(0,0,0,.45)",borderRadius:"50%",width:64,height:64,display:"flex",alignItems:"center",justifyContent:"center"}}><Icon name="play" size={28} color="#fff" fill="#fff"/></div></div>}
      <button onClick={()=>setMuted(m=>!m)} style={{position:"absolute",top:10,left:10,background:"rgba(0,0,0,.4)",border:"none",borderRadius:"50%",width:32,height:32,color:"#fff",cursor:"pointer",zIndex:5,display:"flex",alignItems:"center",justifyContent:"center"}}><Icon name={muted?"mute":"unmute"} size={15}/></button>
      <div style={{position:"absolute",right:12,bottom:100,display:"flex",flexDirection:"column",alignItems:"center",gap:18}}>
        <button onClick={handleLike} style={{display:"flex",flexDirection:"column",alignItems:"center",background:"none",border:"none",cursor:"pointer"}}>
          <Icon name="heart" size={26} color={isLiked?"#FF4D6D":"#fff"} fill={isLiked?"#FF4D6D":"none"} strokeWidth={1.6}/>
          <span style={{color:"#fff",fontSize:11}}>{post.likes?.length||0}</span>
        </button>
        <button onClick={()=>setCommentPost(post)} style={{display:"flex",flexDirection:"column",alignItems:"center",background:"none",border:"none",cursor:"pointer"}}>
          <Icon name="comment" size={24} color="#fff"/><span style={{color:"#fff",fontSize:11}}>{post.comments?.length||0}</span>
        </button>
        <button onClick={()=>setGiftPost(post)} style={{display:"flex",flexDirection:"column",alignItems:"center",background:"none",border:"none",cursor:"pointer"}}>
          <Icon name="gift" size={24} color="#FFD166"/><span style={{color:"#FFD166",fontSize:11}}>Gift</span>
        </button>
        {canDelete&&(
          <button onClick={()=>setConfirmDelete(post)} style={{display:"flex",flexDirection:"column",alignItems:"center",background:"none",border:"none",cursor:"pointer"}}>
            <Icon name="trash" size={22} color="#fff"/>
          </button>
        )}
      </div>
      <div style={{position:"absolute",bottom:80,left:12,right:60}}>
        <p style={{fontWeight:700,color:"#fff",fontSize:13}}>@{post.username}</p>
        {post.caption&&<p style={{color:"rgba(255,255,255,.8)",fontSize:12,marginTop:2}}>{post.caption}</p>}
        <button onClick={()=>setShowUpload(true)} style={{marginTop:8,display:"flex",alignItems:"center",gap:5,background:"rgba(255,255,255,.2)",border:"1px solid rgba(255,255,255,.3)",borderRadius:999,padding:"5px 10px",color:"#fff",fontSize:11,fontWeight:700,cursor:"pointer",backdropFilter:"blur(8px)"}}><Icon name="upload" size={13}/> Reel Upload</button>
      </div>
      <div style={{position:"absolute",top:10,right:10,background:"rgba(0,0,0,.4)",borderRadius:999,padding:"3px 10px",color:"#fff",fontSize:11}}>{current+1}/{reels.length}</div>
      {commentPost&&<CommentSheet post={reels.find(p=>p.postId===commentPost.postId)||commentPost} user={user} onClose={()=>setCommentPost(null)} onAddComment={async(text)=>{
        try{ await db.addComment(commentPost.postId,user.userId,text); refreshFeed(); }catch(e){}
      }} onReact={async(comment,reaction)=>{ try{ await db.setCommentReaction(comment.id,comment.reaction===reaction?null:reaction); refreshFeed(); }catch(e){} }} onDeleteComment={async(comment)=>{ try{ await db.deleteComment(comment.id); refreshFeed(); }catch(e){} }}/>}
      {giftPost&&<GiftSheet balance={user.coinBalance} onClose={()=>setGiftPost(null)} onSend={handleSendGift}/>}
      {showUpload&&<ReelUploadModal user={user} notify={notify} onClose={()=>setShowUpload(false)} onDone={()=>{setShowUpload(false);refreshFeed();notify("Reel uploaded!");}}/>}
      {confirmDelete&&<ConfirmDialog title="Delete this Reel?" message="This Reel will be permanently deleted." onConfirm={()=>handleDelete(confirmDelete)} onCancel={()=>setConfirmDelete(null)}/>}
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
    if(!file&&!caption.trim()){notify("Write something or choose media");return;}
    setBusy(true);
    try{
      let mediaUrl=null;
      if(file) mediaUrl=await db.uploadMedia(file,user.userId);
      const post=await db.createPost({userId:user.userId,caption:caption.trim(),mediaUrl,mediaType:file?mediaType:null,isReel:mediaType==="video"&&isReel});
      onDone(post);
    }catch(e){
      notify("Upload failed — please try again");
    } finally { setBusy(false); }
  }

  const inp={width:"100%",background:"#1C1233",border:"1px solid #2E1F4D",borderRadius:12,padding:"10px 14px",color:"#F4EEFF",fontSize:13,outline:"none",boxSizing:"border-box",resize:"none"};
  return (
    <div style={{padding:16}}>
      <input ref={fileRef} type="file" accept="image/*,video/*" style={{display:"none"}} onChange={onFileChange}/>
      {previewUrl?(
        <div style={{position:"relative",marginBottom:12,borderRadius:12,overflow:"hidden",background:"#000"}}>
          {mediaType==="video"?<video src={previewUrl} style={{width:"100%",maxHeight:240}} controls/>:<img src={previewUrl} alt="" style={{width:"100%",maxHeight:240,objectFit:"cover"}}/>}
          <button onClick={()=>{setFile(null);setPreviewUrl(null);setMediaType(null);setIsReel(false);}} style={{position:"absolute",top:6,right:6,background:"rgba(0,0,0,.6)",border:"none",borderRadius:"50%",width:26,height:26,cursor:"pointer",color:"#fff",display:"flex",alignItems:"center",justifyContent:"center"}}><Icon name="close" size={13}/></button>
        </div>
      ):(
        <button onClick={()=>fileRef.current?.click()} style={{width:"100%",height:100,border:"2px dashed #3A2A5C",borderRadius:12,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:6,marginBottom:12,background:"none",cursor:"pointer",color:"#9B8FC0"}}>
          <Icon name="upload" size={28} color="#A855F7"/><span style={{fontSize:13}}>Gallery se Photo ya Video (optional)</span>
        </button>
      )}
      <textarea value={caption} onChange={e=>setCaption(e.target.value)} placeholder="Write something... (text, status, etc.)" rows={4} style={{...inp,marginBottom:12}}/>
      {mediaType==="video"&&(
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",background:"#1C1233",border:"1px solid #2E1F4D",borderRadius:12,padding:"10px 14px",marginBottom:12}}>
          <span style={{color:"#D9CCF0",fontSize:13}}>Post as a Reel</span>
          <button onClick={()=>setIsReel(v=>!v)} style={{width:40,height:22,borderRadius:999,border:"none",background:isReel?"#FFD166":"#3A2A5C",cursor:"pointer",position:"relative",transition:"all .2s"}}>
            <div style={{width:18,height:18,background:"#fff",borderRadius:"50%",position:"absolute",top:2,left:isReel?20:2,transition:"all .2s"}}/>
          </button>
        </div>
      )}
      <Btn onClick={submit} disabled={busy} style={{width:"100%"}}>{busy?"Uploading...":"Post"}</Btn>
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
        notify("Camera/Mic permission denied — please allow access in browser settings");
      }
    })();
    return ()=>{ stream?.getTracks().forEach(t=>t.stop()); };
  },[]);

  async function startLive(){
    if(!previewStream){notify("Camera is not ready");return;}
    setBusy(true);
    try{
      const roomName=uid("room_");
      const post=await db.createLivePost({userId:user.userId,caption:title.trim(),roomName});
      onDone(post);
    }catch(e){
      notify("Could not start live stream");
    } finally { setBusy(false); }
  }

  const inp={width:"100%",background:"#1C1233",border:"1px solid #2E1F4D",borderRadius:12,padding:"10px 14px",color:"#F4EEFF",fontSize:13,outline:"none",boxSizing:"border-box"};
  return (
    <div style={{padding:16,display:"flex",flexDirection:"column",height:"100%"}}>
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:14}}>
        <WaveLogo size={26}/>
        <span style={{fontFamily:"'Sora',sans-serif",fontWeight:700,fontSize:15,color:"#F4EEFF"}}>Go Live</span>
      </div>
      <div style={{position:"relative",borderRadius:18,overflow:"hidden",background:"#000",aspectRatio:"9/14",marginBottom:14,border:"1px solid rgba(168,85,247,0.3)",boxShadow:"0 0 0 4px rgba(168,85,247,0.08)"}}>
        <video ref={videoRef} autoPlay playsInline muted style={{width:"100%",height:"100%",objectFit:"cover",transform:"scaleX(-1)"}}/>
        {previewStream&&<span style={{position:"absolute",top:12,left:12,background:"#E11D48",color:"#fff",fontSize:9,fontWeight:800,padding:"3px 8px",borderRadius:999,display:"flex",alignItems:"center",gap:3,letterSpacing:"0.03em"}}><span style={{width:5,height:5,borderRadius:"50%",background:"#fff",display:"inline-block"}}/> PREVIEW</span>}
        {!previewStream&&<div style={{position:"absolute",inset:0,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",color:"#9B8FC0",fontSize:13,gap:8}}><Icon name="camera" size={26} color="#3A2A5C"/>Loading camera...</div>}
      </div>
      <input value={title} onChange={e=>setTitle(e.target.value)} placeholder="Live title (optional)" style={{...inp,marginBottom:12}}/>
      <Btn onClick={startLive} disabled={busy||!previewStream} style={{width:"100%",background:"linear-gradient(135deg,#E11D48,#FF4D6D)",color:"#fff",display:"flex",alignItems:"center",justifyContent:"center",gap:8}}><Icon name="live" size={16} color="#fff"/> Start Live</Btn>
    </div>
  );
}

// ── Live Detail View ──────────────────────────────────────────────────────────
function LiveDetailView({post,posts,user,onBack,fireBurst,notify,onCloseLive,refreshFeed,onJoinCohost}){
  const [live,setLive]=useState(post);
  const [comments,setComments]=useState(post.comments||[]);
  const [text,setText]=useState("");
  const [showGift,setShowGift]=useState(false);
  const [connected,setConnected]=useState(false);
  const [showInvite,setShowInvite]=useState(false);
  const [cohostInfo,setCohostInfo]=useState(null);
  const [amCohost,setAmCohost]=useState(false);
  const [cohostChecked,setCohostChecked]=useState(false);
  const [incomingInvite,setIncomingInvite]=useState(null);
  const [participants,setParticipants]=useState(()=>new Set());
  const chatRef=useRef(null);
  const mainVideoRef=useRef(null);
  const guestVideoRef=useRef(null);
  const audioContainerRef=useRef(null);
  const roomRef=useRef(null);
  const isHost=user.userId===post.userId;

  useEffect(()=>{ chatRef.current?.scrollTo({top:chatRef.current.scrollHeight}); },[comments]);

  useEffect(()=>{
    (async()=>{ const fresh=await db.fetchPostById(post.postId); if(fresh) setComments(fresh.comments); })();
    const unsub=db.subscribeToPostChanges(async(payload)=>{
      if(payload.table==="comments"&&payload.new?.post_id===post.postId){
        const fresh=await db.fetchPostById(post.postId);
        if(fresh) setComments(fresh.comments); else { onCloseLive(); onBack(); }
      }
    });
    return unsub;
  },[post.postId]);

  useEffect(()=>{
    let mounted=true;
    (async()=>{
      const list=await db.getActiveCohosts(post.roomName);
      const other=list.find(c=>c.userId!==user.userId);
      if(mounted){ setCohostInfo(other||null); setAmCohost(list.some(c=>c.userId===user.userId)); setCohostChecked(true); }
    })();
    return ()=>{ mounted=false; };
  },[post.roomName,user.userId]);

  useEffect(()=>{
    if(!isHost) return;
    (async()=>{
      const reqs=await db.getMyCohostRequests(user.userId);
      if(reqs.length>0) setIncomingInvite(reqs[0]);
    })();
    const unsub=db.subscribeToCohostRequests(user.userId,(payload)=>{
      setIncomingInvite({ id:payload.new.id, roomName:payload.new.room_name, hostId:payload.new.host_id, hostUsername:"" });
    });
    return unsub;
  },[isHost,user.userId]);

  async function acceptInvite(){
    if(!incomingInvite) return;
    try{
      await db.respondCohostRequest(incomingInvite.id,true);
      const hostPost=posts.find(p=>p.userId===incomingInvite.hostId&&p.isLive);
      setIncomingInvite(null);
      if(hostPost) onJoinCohost(hostPost); else notify("Could not find host's live stream");
    }catch(e){ notify("Could not accept"); }
  }
  async function rejectInvite(){
    if(!incomingInvite) return;
    try{ await db.respondCohostRequest(incomingInvite.id,false); }catch(e){}
    setIncomingInvite(null);
  }
  async function inviteUser(targetUserId){
    try{
      await db.sendCohostRequest(post.roomName,user.userId,targetUserId);
      notify("Invite sent");
      setShowInvite(false);
    }catch(e){ notify("Could not send invite"); }
  }

  useEffect(()=>{
    if(!post.roomName||!cohostChecked) return;
    let room;
    const canPublish=isHost||amCohost;
    (async()=>{
      try{
        if(!LIVEKIT_URL){ notify("LiveKit URL not set (please add VITE_LIVEKIT_URL env var)"); return; }
        const token=await fetchLiveKitToken({room:post.roomName,identity:user.userId,name:user.username,canPublish});
        room=new Room();
        roomRef.current=room;

        function attachVideo(track,identity){
          const el=identity===post.userId?mainVideoRef.current:guestVideoRef.current;
          if(el) track.attach(el);
        }

        room.on(RoomEvent.TrackSubscribed,(track,_pub,participant)=>{
          if(track.kind===Track.Kind.Video){ attachVideo(track,participant.identity); }
          else if(track.kind===Track.Kind.Audio&&audioContainerRef.current){
            const el=track.attach(); el.autoplay=true; audioContainerRef.current.appendChild(el);
          }
        });
        room.on(RoomEvent.TrackUnsubscribed,(track)=>{ track.detach().forEach(el=>el.remove?.()); });
room.on(RoomEvent.ParticipantConnected,(p)=>{ setParticipants(prev=>new Set(prev).add(p.identity)); });
        room.on(RoomEvent.ParticipantDisconnected,(p)=>{ setParticipants(prev=>{ const s=new Set(prev); s.delete(p.identity); return s; }); });
        await room.connect(LIVEKIT_URL,token);
        const seed=new Set();
        room.remoteParticipants.forEach((p)=>seed.add(p.identity));
        if(canPublish) seed.add(user.userId);
        setParticipants(seed);
        setConnected(true);

        if(canPublish){
          const tracks=await createLocalTracks({audio:true,video:true});
          for(const t of tracks){
            await room.localParticipant.publishTrack(t);
            if(t.kind===Track.Kind.Video) attachVideo(t,user.userId);
          }
        }
      }catch(e){ notify("ERROR: "+(e?.message||String(e))); }
    })();
    return ()=>{ room?.disconnect(); };
  },[post.roomName,isHost,amCohost,cohostChecked,user.userId,user.username]);

  async function sendChat(){
    if(!text.trim())return;
    try{ await db.addComment(post.postId,user.userId,text.trim()); setText(""); }
    catch(e){ notify("Could not send message"); }
  }
  async function closeLive(){
    roomRef.current?.disconnect();
    try{ await db.endLivePost(post.postId); }catch(e){}
    onCloseLive(); onBack(); refreshFeed();
  }
  async function sendGift(gift){
    try{
      const newBal=await db.sendGift({fromId:user.userId,toId:live.userId,postId:post.postId,gift});
      fireBurst({emoji:gift.emoji,name:gift.name,from:user.username,file:gift.file}); setShowGift(false);
      window.dispatchEvent(new CustomEvent("lehar:balance",{detail:newBal}));
    }catch(e){ notify(e?.message==="INSUFFICIENT_COINS"?"Not enough coins":"Could not send gift"); }
  }
  const viewers=new Set(comments.map(c=>c.userId)).size+1;
  const hasGuest=[...participants].some(id=>id!==post.userId);
  const otherLiveUsers=(posts||[]).filter(p=>p.isLive&&p.userId!==post.userId&&p.userId!==user.userId);

  return (
    <div style={{display:"flex",flexDirection:"column",height:"100%"}}>
      <div ref={audioContainerRef} style={{display:"none"}}/>
      
      <div style={{flex:1,background:"#000",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",position:"relative",overflow:"hidden"}}>
        <button onClick={onBack} style={{position:"absolute",top:12,left:12,background:"rgba(0,0,0,.4)",border:"none",borderRadius:"50%",width:34,height:34,cursor:"pointer",color:"#fff",zIndex:5,display:"flex",alignItems:"center",justifyContent:"center"}}><Icon name="back" size={17}/></button>
        <div style={{position:"absolute",top:12,right:12,display:"flex",gap:8,zIndex:5}}>
          <div style={{background:"rgba(0,0,0,.4)",borderRadius:999,padding:"5px 10px",color:"#fff",fontSize:12,display:"flex",alignItems:"center",gap:5}}><Icon name="eye" size={13} color="#fff"/> {viewers}</div>
          {isHost&&!cohostInfo&&<button onClick={()=>setShowInvite(true)} style={{background:"#7C3AED",border:"none",borderRadius:999,padding:"5px 12px",color:"#fff",fontSize:11,fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",gap:4}}><Icon name="plus" size={12}/> Co-Host</button>}
          {isHost&&<button onClick={closeLive} style={{background:"#E11D48",border:"none",borderRadius:999,padding:"5px 12px",color:"#fff",fontSize:11,fontWeight:700,cursor:"pointer"}}>End Live</button>}
        </div>

<div style={{width:"100%",height:"100%",display:"flex",flexDirection:hasGuest?"column":undefined}}>
            <video ref={mainVideoRef} autoPlay playsInline muted={isHost} style={{width:"100%",height:hasGuest?"50%":"100%",objectFit:"cover",transform:isHost?"scaleX(-1)":"none"}}/>
            {hasGuest&&<video ref={guestVideoRef} autoPlay playsInline muted={amCohost} style={{width:"100%",height:"50%",objectFit:"cover",borderTop:"2px solid #2E1F4D",transform:amCohost?"scaleX(-1)":"none"}}/>}
          </div>
        

        {!connected&&(
          <div style={{position:"absolute",inset:0,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",background:"linear-gradient(180deg,#1A0E22,#120A22)"}}>
            <div style={{marginBottom:8,display:"flex",justifyContent:"center"}}><Icon name="live" size={44} color="#FF4D6D"/></div>
            <Avatar name={live.username} size={64} live pic={live.author?.profilePic}/>
            <p style={{marginTop:12,color:"#9B8FC0",fontSize:13}}>Stream se connect ho raha hai...</p>
          </div>
        )}
        {connected&&(
          <div style={{position:"absolute",bottom:8,left:12,background:"rgba(0,0,0,.4)",borderRadius:999,padding:"4px 10px",zIndex:5}}>
            <p style={{margin:0,fontWeight:700,color:"#F4EEFF",fontSize:13}}>{live.username}{cohostInfo?` & ${cohostInfo.username}`:""}{live.caption?` · ${live.caption}`:""}</p>
          </div>
        )}

        {incomingInvite&&(
          <div style={{position:"absolute",top:60,left:12,right:12,background:"#1C1233",border:"1px solid #7c3aed",borderRadius:14,padding:12,zIndex:6}}>
            <p style={{color:"#F4EEFF",fontSize:13,margin:"0 0 8px"}}>Someone has invited you to co-host</p>
            <div style={{display:"flex",gap:8}}>
              <Btn onClick={acceptInvite} style={{flex:1,padding:"7px",fontSize:12}}>Accept</Btn>
              <Btn onClick={rejectInvite} ghost style={{flex:1,padding:"7px",fontSize:12}}>Reject</Btn>
            </div>
          </div>
        )}

        {showInvite&&(
          <div style={{position:"absolute",inset:0,background:"rgba(0,0,0,.7)",zIndex:7,display:"flex",alignItems:"center",justifyContent:"center",padding:20}} onClick={()=>setShowInvite(false)}>
            <div style={{background:"#1C1233",border:"1px solid #2E1F4D",borderRadius:16,padding:16,width:"100%",maxWidth:320}} onClick={e=>e.stopPropagation()}>
              <p style={{color:"#F4EEFF",fontWeight:700,margin:"0 0 10px"}}>Who do you want to invite?</p>
              {otherLiveUsers.length===0&&<p style={{color:"#9B8FC0",fontSize:13}}>No one else is live right now</p>}
              {otherLiveUsers.map(p=>(
                <button key={p.postId} onClick={()=>inviteUser(p.userId)} style={{display:"flex",alignItems:"center",gap:8,width:"100%",padding:8,background:"#120A22",border:"1px solid #2E1F4D",borderRadius:10,marginBottom:6,cursor:"pointer"}}>
                  <Avatar name={p.username} size={28} live pic={p.author?.profilePic}/>
                  <span style={{color:"#F4EEFF",fontSize:13}}>{p.username}</span>
                </button>
              ))}
              <Btn ghost onClick={()=>setShowInvite(false)} style={{width:"100%",marginTop:4}}>Close</Btn>
            </div>
            </div>
        )}
      </div>
      <div style={{background:"#1C1233",borderTop:"1px solid #2E1F4D",display:"flex",flexDirection:"column",height:"42%"}}>
        <div ref={chatRef} style={{flex:1,overflowY:"auto",padding:"8px 12px",display:"flex",flexDirection:"column",gap:4}}>
          {comments.map((c)=>(
            <p key={c.id} style={{fontSize:13,color:c.isGift?"#FFD166":"#F4EEFF",margin:0}}>
              <span style={{fontWeight:700,color:"#F4EEFF"}}>{c.username}: </span>{c.text}
            </p>
          ))}
        </div>
        <div style={{display:"flex",gap:6,padding:8,borderTop:"1px solid #2E1F4D"}}>
          <input value={text} onChange={e=>setText(e.target.value)} onKeyDown={e=>e.key==="Enter"&&sendChat()} placeholder="Type a message..." style={{flex:1,background:"#120A22",border:"1px solid #2E1F4D",borderRadius:999,padding:"7px 12px",color:"#F4EEFF",fontSize:13,outline:"none"}}/>
          <button onClick={()=>setShowGift(true)} style={{background:"#FFD166",border:"none",borderRadius:"50%",width:34,height:34,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}><Icon name="gift" size={16} color="#120A22"/></button>
          <button onClick={sendChat} style={{background:"#2E1F4D",border:"none",borderRadius:"50%",width:34,height:34,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}><Icon name="send" size={15}/></button>
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
    <div style={{padding:16}}>
      <div style={{borderRadius:20,padding:"26px 20px",textAlign:"center",background:"linear-gradient(160deg,rgba(168,85,247,0.14),rgba(16,34,50,0.6))",border:"1px solid rgba(168,85,247,0.25)"}}>
        <div style={{display:"flex",justifyContent:"center",marginBottom:12}}><WaveLogo size={40}/></div>
        <button onClick={onStartLive} style={{display:"inline-flex",alignItems:"center",gap:8,background:"linear-gradient(135deg,#E11D48,#FF4D6D)",color:"#fff",border:"none",borderRadius:999,padding:"13px 28px",fontWeight:700,fontSize:14.5,cursor:"pointer",boxShadow:"0 10px 24px rgba(197,57,44,.3)"}}>
          <Icon name="live" size={16} color="#fff"/> Go Live Now
        </button>
        <p style={{color:"#9B8FC0",fontSize:12.5,marginTop:12}}>Start your live stream and receive gifts</p>
      </div>
    </div>
  );
  if(lives.length===0) return (
    <div style={{display:"flex",flexDirection:"column",height:"100%"}}>
      <GoLiveBar/>
      <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",color:"#9B8FC0",padding:"20px 30px"}}>
        <Icon name="clock" size={38} color="#3A2A5C"/>
        <p style={{fontFamily:"'Sora',sans-serif",fontWeight:700,color:"#F4EEFF",fontSize:15,marginTop:14,marginBottom:4}}>No one is live right now</p>
        <p style={{fontSize:12.5,color:"#9B8FC0",textAlign:"center"}}>Be the first to go live!</p>
      </div>
    </div>
  );
  return (
    <div style={{display:"flex",flexDirection:"column",height:"100%"}}>
      <GoLiveBar/>
      <div style={{padding:"0 16px 16px",display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
        {lives.map(p=>(
          <button key={p.postId} onClick={()=>onOpenLive(p)} style={{position:"relative",background:"#1C1233",border:"1px solid #2E1F4D",borderRadius:18,padding:"18px 12px 14px",display:"flex",flexDirection:"column",alignItems:"center",gap:8,cursor:"pointer",overflow:"hidden"}}>
            <span style={{position:"absolute",top:10,left:10,background:"#E11D48",color:"#fff",fontSize:9,fontWeight:800,padding:"3px 7px",borderRadius:999,display:"flex",alignItems:"center",gap:3,letterSpacing:"0.03em"}}>
              <span style={{width:5,height:5,borderRadius:"50%",background:"#fff",display:"inline-block"}}/> LIVE
            </span>
            <Avatar name={p.username} size={56} live pic={p.author?.profilePic}/>
            <p style={{fontWeight:700,color:"#F4EEFF",fontSize:13,margin:0,fontFamily:"'Sora',sans-serif"}}>{p.username}</p>
            <span style={{background:"rgba(168,85,247,0.14)",color:"#F472B6",fontSize:10.5,padding:"4px 10px",borderRadius:999,fontWeight:700}}>Join</span>
          </button>
        ))}
      </div>
    </div>
  );
}
// ── Search View ───────────────────────────────────────────────────────────────
function SearchView({user,notify,onOpenChat,onOpenProfile}){
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
      notify(r.already?"Request already sent":`Request sent to ${target.username}`);
    }catch(e){ notify("Could not send request"); }
  }
  const show=results.length>0?results:suggested;
  const inp={flex:1,background:"#1C1233",border:"1px solid #2E1F4D",borderRadius:12,padding:"10px 14px",color:"#F4EEFF",fontSize:13,outline:"none"};
  return (
    <div style={{padding:14}}>
      <div style={{display:"flex",gap:8,marginBottom:14}}>
        <input value={query} onChange={e=>setQuery(e.target.value)} onKeyDown={e=>e.key==="Enter"&&doSearch()} placeholder="Search by username..." style={inp}/>
        <button onClick={doSearch} style={{background:"#FFD166",border:"none",borderRadius:12,padding:"0 14px",cursor:"pointer",display:"flex",alignItems:"center",color:"#221705"}}><Icon name="search" size={17} color="#221705" strokeWidth={2}/></button>
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:8}}>
        {show.map(u=>(
          <div key={u.userId} style={{display:"flex",alignItems:"center",gap:10,padding:10,background:"#1C1233",borderRadius:14,cursor:"pointer"}} onClick={()=>onOpenProfile(u.userId)}>
            <Avatar name={u.username} size={38} pic={u.profilePic} verified={u.verified}/>
            <div style={{flex:1}}>
              <p style={{fontWeight:700,color:"#F4EEFF",fontSize:13,margin:0}}>{u.username}{u.verified&&<Icon name="verified" size={12} color="#A855F7" fill="#A855F7" strokeWidth={0}/>}</p>
              {u.bio&&<p style={{color:"#9B8FC0",fontSize:11,margin:0,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",maxWidth:150}}>{u.bio}</p>}
            </div>
            <button onClick={(e)=>{e.stopPropagation();onOpenChat({partnerId:u.userId,partnerUsername:u.username});}} style={{background:"#2E1F4D",border:"none",borderRadius:"50%",width:32,height:32,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}><Icon name="send" size={14}/></button>
            <button onClick={(e)=>{e.stopPropagation();sendFriendReq(u);}} disabled={sentIds[u.userId]} style={{background:"rgba(168,85,247,.2)",border:"none",borderRadius:"50%",width:32,height:32,cursor:sentIds[u.userId]?"default":"pointer",fontSize:14,opacity:sentIds[u.userId]?0.4:1}}>{sentIds[u.userId]?<Icon name="check" size={13}/>:<Icon name="plus" size={13}/>}</button>
          </div>
        ))}
        {show.length===0&&<p style={{color:"#9B8FC0",fontSize:13,textAlign:"center",padding:"24px 0"}}>No users found</p>}
      </div>
    </div>
  );
}

// ── Inbox View ────────────────────────────────────────────────────────────────
function InboxView({user,onOpenChat,notify,notifications,onOpenProfile}){
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
      notify(accept?`Added ${req.fromUsername} as friend`:"Request rejected");
      load();
    }catch(e){ notify("Something went wrong"); }
  }

  return (
    <div style={{display:"flex",flexDirection:"column",height:"100%"}}>
      <div style={{display:"flex",background:"#1C1233",borderRadius:12,padding:4,margin:14,gap:4}}>
        {[["msgs","Messages"],["requests",`Requests${requests.length?` (${requests.length})`:""}`],["friends","Friends"]].map(([id,label])=>(
          <button key={id} onClick={()=>setTab(id)} style={{flex:1,padding:8,borderRadius:8,border:"none",fontWeight:700,fontSize:11,background:tab===id?"#F4EEFF":"transparent",color:tab===id?"#120A22":"#9B8FC0",cursor:"pointer"}}>{label}</button>
        ))}
      </div>
      <div style={{flex:1,overflowY:"auto",padding:"0 14px 14px"}}>
        {tab==="msgs"&&(
          convs.length===0?<p style={{color:"#9B8FC0",fontSize:13,textAlign:"center",padding:"40px 0"}}>No messages</p>:
          convs.map(c=>(
            <button key={c.partnerId} onClick={()=>onOpenChat({partnerId:c.partnerId,partnerUsername:c.partnerUsername})} style={{display:"flex",alignItems:"center",gap:10,width:"100%",padding:10,background:"#1C1233",borderRadius:14,marginBottom:8,border:"none",cursor:"pointer",textAlign:"left"}}>
              <span onClick={(e)=>{e.stopPropagation();onOpenProfile(c.partnerId);}}><Avatar name={c.partnerUsername} size={40} pic={c.partnerProfilePic}/></span>
              <div style={{flex:1,overflow:"hidden"}}>
                <p style={{fontWeight:700,color:"#F4EEFF",fontSize:13,margin:0}}>{c.partnerUsername}</p>
                <p style={{color:"#9B8FC0",fontSize:12,margin:0,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{c.lastText}</p>
              </div>
              <span style={{color:"#9B8FC0",fontSize:10}}>{timeAgo(c.lastTs)}</span>
            </button>
          ))
        )}
        {tab==="requests"&&(
          requests.length===0?<p style={{color:"#9B8FC0",fontSize:13,textAlign:"center",padding:"40px 0"}}>No requests</p>:
          requests.map(r=>(
            <div key={r.id} style={{display:"flex",alignItems:"center",gap:10,padding:10,background:"#1C1233",borderRadius:14,marginBottom:8}}>
              <span onClick={()=>onOpenProfile(r.fromId)} style={{cursor:"pointer",display:"flex"}}><Avatar name={r.fromUsername} size={38} pic={r.profilePic} verified={r.verified}/></span>
              <p onClick={()=>onOpenProfile(r.fromId)} style={{flex:1,fontWeight:700,color:"#F4EEFF",fontSize:13,margin:0,cursor:"pointer"}}>{r.fromUsername}</p>
              <button onClick={()=>respond(r,true)} style={{background:"#A855F7",border:"none",borderRadius:8,padding:"6px 10px",color:"#fff",fontSize:11,fontWeight:700,cursor:"pointer",display:"flex"}}><Icon name="check" size={13}/></button>
              <button onClick={()=>respond(r,false)} style={{background:"#3A2A5C",border:"none",borderRadius:8,padding:"6px 10px",color:"#fff",fontSize:11,fontWeight:700,cursor:"pointer",display:"flex"}}><Icon name="close" size={13}/></button>
            </div>
          ))
        )}
        {tab==="friends"&&(
          friends.length===0?<p style={{color:"#9B8FC0",fontSize:13,textAlign:"center",padding:"40px 0"}}>No friends yet</p>:
          friends.map(f=>(
            <button key={f.userId} onClick={()=>onOpenProfile(f.userId)} style={{display:"flex",alignItems:"center",gap:10,width:"100%",padding:10,background:"#1C1233",borderRadius:14,marginBottom:8,border:"none",cursor:"pointer",textAlign:"left"}}>
              <Avatar name={f.username} size={38} pic={f.profilePic} verified={f.verified}/>
              <p style={{flex:1,fontWeight:700,color:"#F4EEFF",fontSize:13,margin:0}}>{f.username}</p>
              <span onClick={(e)=>{e.stopPropagation();onOpenChat({partnerId:f.userId,partnerUsername:f.username});}} style={{display:"flex",padding:4}}><Icon name="send" size={15}/></span>
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
      <div style={{display:"flex",alignItems:"center",gap:10,padding:"10px 14px",borderBottom:"1px solid #2E1F4D",background:"#120A22"}}>
        <button onClick={onBack} style={{background:"none",border:"none",color:"#9B8FC0",cursor:"pointer",display:"flex"}}><Icon name="back" size={20}/></button>
        <Avatar name={partner.partnerUsername} size={34}/>
        <p style={{fontWeight:700,color:"#F4EEFF",fontSize:14,margin:0}}>{partner.partnerUsername}</p>
      </div>
      <div ref={chatRef} style={{flex:1,overflowY:"auto",padding:"12px 14px",display:"flex",flexDirection:"column",gap:6}}>
        {msgs.length===0&&<p style={{color:"#9B8FC0",fontSize:13,textAlign:"center",padding:"24px 0"}}>No messages — start the conversation!</p>}
        {msgs.map(m=>(
          <div key={m.id} style={{display:"flex",justifyContent:m.fromId===user.userId?"flex-end":"flex-start"}}>
            <div style={{maxWidth:"75%",padding:"8px 12px",borderRadius:16,fontSize:13,background:m.fromId===user.userId?"#FFD166":"#1C1233",color:m.fromId===user.userId?"#120A22":"#F4EEFF"}}>
              {m.text}<span style={{display:"block",fontSize:9,opacity:.6,marginTop:2,textAlign:"right"}}>{timeAgo(m.ts)}</span>
            </div>
          </div>
        ))}
      </div>
      <div style={{display:"flex",gap:8,padding:10,borderTop:"1px solid #2E1F4D"}}>
        <input value={text} onChange={e=>setText(e.target.value)} onKeyDown={e=>e.key==="Enter"&&sendMsg()} placeholder="Type a message..." style={{flex:1,background:"#1C1233",border:"1px solid #2E1F4D",borderRadius:999,padding:"8px 14px",color:"#F4EEFF",fontSize:13,outline:"none"}}/>
        <button onClick={sendMsg} style={{background:"#FFD166",border:"none",borderRadius:"50%",width:36,height:36,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}><Icon name="send" size={16} color="#120A22"/></button>
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
    if(!pkr||pkr<MIN_TOPUP_PKR){notify(`Minimum top-up is Rs.${MIN_TOPUP_PKR.toLocaleString()}`);return;}
    setBusy(true);
    try{
      await db.createTransaction({userId:user.userId,type:"topup",amountPKR:pkr,coins:Math.floor(pkr*TOPUP_COINS_PER_PKR),method,reference:reference.trim()});
      setAmount(""); setReference(""); notify("Request sent — waiting for admin approval"); load();
    }catch(e){ notify("Could not send request"); } finally { setBusy(false); }
  }
  async function submitWithdraw(){
    const coins=parseInt(withdrawCoins,10);
    if(!coins||coins<=0){notify("Please enter a valid number of coins");return;}
    if(coins>user.coinBalance){notify("You don't have that many coins");return;}
    if(!withdrawNumber.trim()){notify("Enter number");return;}
    setBusy(true);
    try{
      await db.requestWithdraw({userId:user.userId,coins,method,reference:withdrawNumber.trim()});
      onRefreshUser(user.coinBalance-coins);
      setWithdrawCoins(""); setWithdrawNumber(""); notify("Withdraw request bhej di"); load();
    }catch(e){
      notify(e?.message==="INSUFFICIENT_COINS"?"You don't have that many coins":"Could not send request");
    } finally { setBusy(false); }
  }
  const inp={width:"100%",background:"#1C1233",border:"1px solid #2E1F4D",borderRadius:12,padding:"10px 14px",color:"#F4EEFF",fontSize:13,outline:"none",boxSizing:"border-box"};
  return (
    <div style={{padding:14,overflowY:"auto"}}>
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
        <Icon name="star" size={17} color="#FFD166" fill="#FFD166" strokeWidth={1.3}/>
        <span style={{fontFamily:"monospace",fontSize:24,fontWeight:900,color:"#FFD166"}}>{user.coinBalance}</span>
        <span style={{color:"#9B8FC0",fontSize:13}}>coins</span>
      </div>
      <div style={{background:"#1C1233",border:"1px solid #2E1F4D",borderRadius:12,padding:10,marginBottom:12,fontSize:12,color:"#9B8FC0"}}>
        Buy: Rs.20 = 1 coin (min Rs.3,000) | Cash Out: 1 coin = Rs.12
      </div>
      <div style={{display:"flex",background:"#1C1233",borderRadius:12,padding:4,marginBottom:12,gap:4}}>
        {["buy","withdraw"].map(t=><button key={t} onClick={()=>setTab(t)} style={{flex:1,padding:8,borderRadius:8,border:"none",fontWeight:700,fontSize:12,background:tab===t?"#F4EEFF":"transparent",color:tab===t?"#120A22":"#9B8FC0",cursor:"pointer"}}>{t==="buy"?"Buy Coins":"Cash Out"}</button>)}
      </div>
      {tab==="buy"?(
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          <div style={{display:"flex",gap:6}}>
            {Object.keys(OWNER_PAYMENT).map(m=><button key={m} onClick={()=>setMethod(m)} style={{flex:1,padding:"8px 4px",borderRadius:10,border:`1px solid ${method===m?"#FFD166":"#2E1F4D"}`,background:"none",color:method===m?"#FFD166":"#9B8FC0",fontWeight:700,fontSize:11,cursor:"pointer"}}>{m}</button>)}
          </div>
          <div style={{background:"#1C1233",border:"1px solid rgba(212,175,106,.4)",borderRadius:12,padding:12}}>
            <p style={{color:"#9B8FC0",fontSize:11,margin:"0 0 4px"}}>Is number par payment bhejein:</p>
            <p style={{fontFamily:"monospace",fontSize:18,fontWeight:900,color:"#F4EEFF",margin:0}}>{OWNER_PAYMENT[method]}</p>
          </div>
          <input value={amount} onChange={e=>setAmount(e.target.value)} type="number" placeholder="How much did you send (Rs.)?" style={inp}/>
          {amount&&!isNaN(amount)&&<p style={{color:"#FFD166",fontSize:12,fontFamily:"monospace"}}>≈ {Math.floor(parseFloat(amount)*TOPUP_COINS_PER_PKR)} coins milengi</p>}
          <input value={reference} onChange={e=>setReference(e.target.value)} placeholder="Transaction ID / reference (optional)" style={inp}/>
          <Btn onClick={submitTopup} disabled={busy} style={{width:"100%"}}>Maine Payment Bhej Diya</Btn>
        </div>
      ):(
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          <input value={withdrawCoins} onChange={e=>setWithdrawCoins(e.target.value)} type="number" placeholder="How many coins to withdraw?" style={inp}/>
          {withdrawCoins&&!isNaN(withdrawCoins)&&<p style={{color:"#FFD166",fontSize:12,fontFamily:"monospace"}}>≈ Rs. {(parseInt(withdrawCoins,10)/WITHDRAW_COINS_PER_PKR).toFixed(0)} milenge</p>}
          <div style={{display:"flex",gap:6}}>
            {Object.keys(OWNER_PAYMENT).map(m=><button key={m} onClick={()=>setMethod(m)} style={{flex:1,padding:"8px 4px",borderRadius:10,border:`1px solid ${method===m?"#FFD166":"#2E1F4D"}`,background:"none",color:method===m?"#FFD166":"#9B8FC0",fontWeight:700,fontSize:11,cursor:"pointer"}}>{m}</button>)}
          </div>
          <input value={withdrawNumber} onChange={e=>setWithdrawNumber(e.target.value)} placeholder="Your account number" style={inp}/>
          <Btn onClick={submitWithdraw} disabled={busy} style={{width:"100%"}}>Cash Out Request</Btn>
        </div>
      )}
      {myTx.length>0&&(
        <div style={{marginTop:18}}>
          <h3 style={{color:"#F4EEFF",fontSize:14,margin:"0 0 8px"}}>History</h3>
          {myTx.map(t=>(
            <div key={t.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 0",borderBottom:"1px solid #2E1F4D"}}>
              <div>
                <p style={{margin:0,color:"#D9CCF0",fontSize:12,fontWeight:600}}>{t.type==="topup"?"Top-up":"Withdraw"} • Rs.{t.amountPKR}</p>
                <p style={{margin:0,color:"#9B8FC0",fontSize:10}}>{timeAgo(t.createdAt)} ago</p>
              </div>
              <span style={{fontSize:10,fontWeight:700,padding:"2px 8px",borderRadius:999,background:t.status==="approved"?"rgba(34,197,94,.15)":t.status==="rejected"?"rgba(239,68,68,.15)":"rgba(212,175,106,.15)",color:t.status==="approved"?"#4ade80":t.status==="rejected"?"#f87171":"#fbbf24"}}>{t.status}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Profile View ──────────────────────────────────────────────────────────────
// ── Follow list (followers / following) ────────────────────────────────────
function FollowListModal({title,users,onClose,onOpenProfile}){
  return (
    <div style={{position:"fixed",inset:0,zIndex:150,background:"rgba(0,0,0,.6)",display:"flex",alignItems:"flex-end"}} onClick={onClose}>
      <div style={{background:"#1C1233",borderRadius:"20px 20px 0 0",width:"100%",maxHeight:"70vh",display:"flex",flexDirection:"column"}} onClick={e=>e.stopPropagation()}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"14px 16px",borderBottom:"1px solid #2E1F4D"}}>
          <span style={{fontWeight:700,color:"#F4EEFF",fontFamily:"'Sora',sans-serif"}}>{title}</span>
          <button onClick={onClose} style={{background:"none",border:"none",color:"#9B8FC0",cursor:"pointer",display:"flex"}}><Icon name="close" size={18}/></button>
        </div>
        <div style={{overflowY:"auto",padding:"6px 16px 20px"}}>
          {users.length===0&&<p style={{textAlign:"center",color:"#9B8FC0",fontSize:13,padding:"24px 0"}}>Nobody here yet</p>}
          {users.map(u=>(
            <button key={u.userId} onClick={()=>{onClose();onOpenProfile(u.userId);}} style={{display:"flex",alignItems:"center",gap:10,width:"100%",padding:"10px 4px",background:"none",border:"none",borderBottom:"1px solid #2E1F4D",cursor:"pointer"}}>
              <Avatar name={u.username} size={40} pic={u.profilePic} verified={u.verified}/>
              <span style={{color:"#F4EEFF",fontSize:13.5,fontWeight:600}}>{u.username}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── View someone else's profile ─────────────────────────────────────────────
function UserProfileView({userId,currentUser,onBack,notify,onOpenChat,onOpenProfile}){
  const [profile,setProfile]=useState(null);
  const [posts,setPosts]=useState([]);
  const [counts,setCounts]=useState({followers:0,following:0});
  const [following,setFollowing]=useState(false);
  const [busy,setBusy]=useState(false);
  const [mediaPost,setMediaPost]=useState(null);
  const [listModal,setListModal]=useState(null); // "followers" | "following" | null
  const [listUsers,setListUsers]=useState([]);

  const load=useCallback(async()=>{
    const [p,pl,c,f]=await Promise.all([
      db.getUserById(userId),
      db.fetchUserPosts(userId),
      db.getFollowCounts(userId),
      db.isFollowing(currentUser.userId,userId),
    ]);
    setProfile(p); setPosts(pl); setCounts(c); setFollowing(f);
  },[userId,currentUser.userId]);
  useEffect(()=>{ load(); },[load]);

  async function toggleFollow(){
    setBusy(true);
    try{
      if(following){ await db.unfollowUser(currentUser.userId,userId); setFollowing(false); setCounts(c=>({...c,followers:Math.max(0,c.followers-1)})); }
      else{ await db.followUser(currentUser.userId,userId); setFollowing(true); setCounts(c=>({...c,followers:c.followers+1})); }
    }catch(e){ notify("Could not update follow status"); }
    finally{ setBusy(false); }
  }
  async function openList(kind){
    const list = kind==="followers" ? await db.getFollowers(userId) : await db.getFollowing(userId);
    setListUsers(list); setListModal(kind);
  }

  if(!profile) return <div style={{padding:40,textAlign:"center",color:"#9B8FC0"}}>Loading...</div>;
  const mediaPosts=posts.filter(p=>!p.isReel);

  return (
    <div style={{padding:16}}>
      <button onClick={onBack} style={{background:"none",border:"none",color:"#9B8FC0",cursor:"pointer",display:"flex",alignItems:"center",gap:6,marginBottom:14,fontSize:13}}><Icon name="back" size={16}/> Back</button>
      <div style={{display:"flex",alignItems:"center",gap:14,marginBottom:14}}>
        <Avatar name={profile.username} size={64} pic={profile.profilePic} verified={profile.verified}/>
        <div style={{flex:1}}>
          <p style={{fontWeight:800,color:"#F4EEFF",fontSize:17,margin:0,display:"flex",alignItems:"center",gap:5}}>{profile.username}{profile.verified&&<Icon name="verified" size={15} color="#A855F7" fill="#A855F7" strokeWidth={0}/>}</p>
          <p style={{color:"#9B8FC0",fontSize:12,margin:"3px 0 0"}}>{profile.bio||"No bio yet"}</p>
        </div>
      </div>

      <div style={{display:"flex",gap:8,marginBottom:16}}>
        <Btn onClick={toggleFollow} disabled={busy} style={following?{flex:1,background:"transparent",border:"1px solid #3A2A5C",color:"#F4EEFF"}:{flex:1}}>{following?"Following":"Follow"}</Btn>
        <Btn ghost onClick={()=>onOpenChat({partnerId:profile.userId,partnerUsername:profile.username})} style={{flex:1}}>Message</Btn>
      </div>

      <div style={{display:"flex",gap:18,marginBottom:14}}>
        <span style={{color:"#9B8FC0",fontSize:13}}>Posts <span style={{color:"#FFD166",fontWeight:700}}>{mediaPosts.length}</span></span>
        <button onClick={()=>openList("followers")} style={{background:"none",border:"none",cursor:"pointer",color:"#9B8FC0",fontSize:13,padding:0}}>Followers <span style={{color:"#FFD166",fontWeight:700}}>{counts.followers}</span></button>
        <button onClick={()=>openList("following")} style={{background:"none",border:"none",cursor:"pointer",color:"#9B8FC0",fontSize:13,padding:0}}>Following <span style={{color:"#FFD166",fontWeight:700}}>{counts.following}</span></button>
      </div>

      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:6}}>
        {mediaPosts.map(p=>(
          <button key={p.postId} onClick={()=>p.mediaData?setMediaPost(p):null} style={{position:"relative",aspectRatio:"1",background:"#1C1233",border:"1px solid #2E1F4D",borderRadius:10,overflow:"hidden",display:"flex",alignItems:"center",justifyContent:"center",cursor:p.mediaData?"pointer":"default",padding:0}}>
            {p.mediaData&&p.mediaType==="image"?<img src={p.mediaData} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/>
            :p.mediaData&&p.mediaType==="video"?(
              <>
                <video src={p.mediaData} style={{width:"100%",height:"100%",objectFit:"cover"}} muted/>
                <span style={{position:"absolute",top:4,right:4,background:"rgba(0,0,0,.55)",borderRadius:6,width:20,height:20,display:"flex",alignItems:"center",justifyContent:"center"}}><Icon name="play" size={9} color="#F4EEFF" fill="#F4EEFF"/></span>
              </>
            )
            :<p style={{fontSize:10,color:"#9B8FC0",textAlign:"center",padding:6,margin:0}}>{p.caption?.slice(0,80)||"Post"}</p>}
          </button>
        ))}
        {mediaPosts.length===0&&<p style={{gridColumn:"1/-1",textAlign:"center",color:"#9B8FC0",fontSize:12,padding:"20px 0"}}>No posts</p>}
      </div>

      {mediaPost&&<MediaViewerModal post={mediaPost} onClose={()=>setMediaPost(null)}/>}
      {listModal&&<FollowListModal title={listModal==="followers"?"Followers":"Following"} users={listUsers} onClose={()=>setListModal(null)} onOpenProfile={onOpenProfile}/>}
    </div>
  );
}

function ProfileView({user,onLogout,onGoWallet,notify,onUserUpdate,onOpenProfile}){
  const [editing,setEditing]=useState(false);
  const [bio,setBio]=useState(user.bio||"");
  const [newPass,setNewPass]=useState("");
  const [myPosts,setMyPosts]=useState([]);
  const [confirmDelete,setConfirmDelete]=useState(null);
  const [mediaPost,setMediaPost]=useState(null);
  const [uploadingAvatar,setUploadingAvatar]=useState(false);
  const [counts,setCounts]=useState({followers:0,following:0});
  const [listModal,setListModal]=useState(null);
  const [listUsers,setListUsers]=useState([]);
  const avatarRef=useRef(null);

  const loadPosts=useCallback(async()=>{
    try{ setMyPosts(await db.fetchUserPosts(user.userId)); }catch(e){}
  },[user.userId]);
  useEffect(()=>{ loadPosts(); },[loadPosts]);
  useEffect(()=>{ db.getFollowCounts(user.userId).then(setCounts); },[user.userId]);

  async function openList(kind){
    const list = kind==="followers" ? await db.getFollowers(user.userId) : await db.getFollowing(user.userId);
    setListUsers(list); setListModal(kind);
  }

  async function saveBio(){
    try{ await db.updateProfile(user.userId,{bio}); onUserUpdate({...user,bio}); setEditing(false); notify("Profile updated"); }
    catch(e){ notify("Could not update"); }
  }
  async function changePassword(){
    if(newPass.length<6){notify("Password must be at least 6 characters");return;}
    try{ await db.changePassword(newPass); setNewPass(""); notify("Password changed"); }
    catch(e){ notify("Could not change password"); }
  }
  async function onAvatarChange(e){
    const f=e.target.files?.[0]; if(!f)return;
    if(!f.type.startsWith("image")){notify("Please upload an image only");return;}
    if(f.size>10*1024*1024){notify("Image must be smaller than 10MB");return;}
    setUploadingAvatar(true);
    try{
      const url=await db.uploadAvatar(f,user.userId);
      await db.updateProfile(user.userId,{profilePic:url});
      onUserUpdate({...user,profilePic:url});
      notify("Profile picture updated");
    }catch(e){
      notify("Profile picture upload failed — please try again");
    } finally { setUploadingAvatar(false); }
  }
  async function handleDelete(post){
    try{ await db.deletePost(post.postId); setConfirmDelete(null); loadPosts(); notify("Post deleted"); }
    catch(e){ notify("Could not delete"); }
  }

  const myMediaPosts=myPosts.filter(p=>!p.isReel);
  const myReels=myPosts.filter(p=>p.isReel);
  const inp={width:"100%",background:"#120A22",border:"1px solid #2E1F4D",borderRadius:10,padding:"8px 12px",color:"#F4EEFF",fontSize:13,outline:"none",boxSizing:"border-box"};

  return (
    <div style={{padding:16}}>
      <div style={{display:"flex",alignItems:"center",gap:14,marginBottom:14}}>
        <div style={{position:"relative"}}>
          <Avatar name={user.username} size={64} pic={user.profilePic} verified={user.verified}/>
          <input ref={avatarRef} type="file" accept="image/*" style={{display:"none"}} onChange={onAvatarChange}/>
          <button onClick={()=>avatarRef.current?.click()} disabled={uploadingAvatar} style={{position:"absolute",bottom:-2,right:-2,background:"#FFD166",border:"2px solid #120A22",borderRadius:"50%",width:24,height:24,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>{uploadingAvatar?"…":<Icon name="camera" size={12} color="#120A22"/>}</button>
        </div>
        <div style={{flex:1}}>
          <p style={{fontWeight:800,color:"#F4EEFF",fontSize:17,margin:0,display:"flex",alignItems:"center",gap:5}}>{user.username}{user.verified&&<Icon name="verified" size={15} color="#A855F7" fill="#A855F7" strokeWidth={0}/>}</p>
          {!editing&&<p style={{color:"#9B8FC0",fontSize:12,margin:"3px 0 0"}}>{user.bio||"No bio yet"}</p>}
        </div>
        <button onClick={()=>setEditing(v=>!v)} style={{background:"none",border:"none",color:"#9B8FC0",cursor:"pointer",display:"flex"}}><Icon name="edit" size={17}/></button>
      </div>

      {editing&&(
        <div style={{background:"#1C1233",border:"1px solid #2E1F4D",borderRadius:14,padding:12,marginBottom:14}}>
          <textarea value={bio} onChange={e=>setBio(e.target.value)} placeholder="Write a bio..." rows={2} style={{...inp,marginBottom:8,resize:"none"}}/>
          <Btn onClick={saveBio} style={{width:"100%",padding:"8px",marginBottom:10}}>Save Bio</Btn>
          <input value={newPass} onChange={e=>setNewPass(e.target.value)} type="password" placeholder="New password" style={{...inp,marginBottom:8}}/>
          <Btn onClick={changePassword} style={{width:"100%",padding:"9px",display:"flex",alignItems:"center",justifyContent:"center",gap:7}}><Icon name="lock" size={15} color="currentColor"/> Change Password</Btn>
        </div>
      )}

      <button onClick={onGoWallet} style={{width:"100%",display:"flex",alignItems:"center",justifyContent:"space-between",background:"#1C1233",border:"1px solid #FFD166",borderRadius:12,padding:"12px 14px",cursor:"pointer",marginBottom:12}}>
        <span style={{color:"#F4EEFF",fontSize:13,fontWeight:600,display:"flex",alignItems:"center",gap:6}}><Icon name="wallet" size={15} color="#FFD166"/> Wallet</span>
        <span style={{color:"#FFD166",fontWeight:700,fontFamily:"monospace"}}>{user.coinBalance} coins</span>
      </button>

      <div style={{display:"flex",gap:16,marginBottom:10}}>
        <span style={{color:"#9B8FC0",fontSize:13}}>Posts <span style={{color:"#FFD166",fontWeight:700}}>{myMediaPosts.length}</span></span>
        <span style={{color:"#9B8FC0",fontSize:13}}>Reels <span style={{color:"#FFD166",fontWeight:700}}>{myReels.length}</span></span>
        <button onClick={()=>openList("followers")} style={{background:"none",border:"none",cursor:"pointer",color:"#9B8FC0",fontSize:13,padding:0}}>Followers <span style={{color:"#FFD166",fontWeight:700}}>{counts.followers}</span></button>
        <button onClick={()=>openList("following")} style={{background:"none",border:"none",cursor:"pointer",color:"#9B8FC0",fontSize:13,padding:0}}>Following <span style={{color:"#FFD166",fontWeight:700}}>{counts.following}</span></button>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:6}}>
        {myPosts.map(p=>(
          <button key={p.postId} onClick={()=>p.mediaData?setMediaPost(p):null} onContextMenu={(e)=>{e.preventDefault();setConfirmDelete(p);}} style={{position:"relative",aspectRatio:"1",background:"#1C1233",border:"1px solid #2E1F4D",borderRadius:10,overflow:"hidden",display:"flex",alignItems:"center",justifyContent:"center",cursor:p.mediaData?"pointer":"default",padding:0}}>
            {p.mediaData&&p.mediaType==="image"?<img src={p.mediaData} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/>
            :p.mediaData&&p.mediaType==="video"?(
              <>
                <video src={p.mediaData} style={{width:"100%",height:"100%",objectFit:"cover"}} muted/>
                <span style={{position:"absolute",top:4,right:4,background:"rgba(0,0,0,.55)",borderRadius:6,width:20,height:20,display:"flex",alignItems:"center",justifyContent:"center"}}><Icon name="play" size={9} color="#F4EEFF" fill="#F4EEFF"/></span>
              </>
            )
            :<p style={{fontSize:10,color:"#9B8FC0",textAlign:"center",padding:6,margin:0,overflow:"hidden",display:"-webkit-box",WebkitLineClamp:4,WebkitBoxOrient:"vertical"}}>{p.caption?.slice(0,80)||"Post"}</p>}
            <button onClick={(e)=>{e.stopPropagation();setConfirmDelete(p);}} style={{position:"absolute",top:2,left:2,background:"rgba(0,0,0,.6)",border:"none",borderRadius:6,width:20,height:20,color:"#fff",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}><Icon name="trash" size={11}/></button>
          </button>
        ))}
        {myPosts.length===0&&<p style={{gridColumn:"1/-1",textAlign:"center",color:"#9B8FC0",fontSize:12,padding:"20px 0"}}>No posts</p>}
      </div>

      <Btn onClick={onLogout} ghost style={{width:"100%",padding:"9px",marginTop:18,display:"flex",alignItems:"center",justifyContent:"center",gap:7}}><Icon name="logout" size={15}/> Logout</Btn>

      {mediaPost&&<MediaViewerModal post={mediaPost} onClose={()=>setMediaPost(null)}/>}
      {confirmDelete&&<ConfirmDialog title="Delete this post?" message="This post will be permanently deleted." onConfirm={()=>handleDelete(confirmDelete)} onCancel={()=>setConfirmDelete(null)}/>}
      {listModal&&<FollowListModal title={listModal==="followers"?"Followers":"Following"} users={listUsers} onClose={()=>setListModal(null)} onOpenProfile={onOpenProfile}/>}
    </div>
  );
}

// ── Admin Panel ───────────────────────────────────────────────────────────────
function AdminPanel({onExit,notify}){
  const [txs,setTxs]=useState([]);
  const load=useCallback(async()=>{ setTxs(await db.getAllTransactions()); },[]);
  useEffect(()=>{ load(); const t=setInterval(load,4000); return ()=>clearInterval(t); },[load]);

  async function approveTopup(tx){ try{ await db.adminApproveTopup(tx.id); load(); }catch(e){ notify("Could not approve"); } }
  async function rejectTopup(tx){ try{ await db.adminRejectTopup(tx.id); load(); }catch(e){ notify("Could not reject"); } }
  async function markWithdrawPaid(tx){ try{ await db.adminApproveWithdraw(tx.id); load(); }catch(e){ notify("Could not update"); } }
  async function rejectWithdraw(tx){ try{ await db.adminRejectWithdraw(tx.id); load(); }catch(e){ notify("Could not reject"); } }

  const pending=txs.filter(t=>t.status==="pending");
  const totalIn=txs.filter(t=>t.type==="topup"&&t.status==="approved").reduce((s,t)=>s+Number(t.amountPKR),0);
  const totalOut=txs.filter(t=>t.type==="withdraw"&&t.status==="approved").reduce((s,t)=>s+Number(t.amountPKR),0);
  return (
    <div style={{padding:14,overflowY:"auto",height:"100%"}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
        <h2 style={{color:"#F4EEFF",fontWeight:800,margin:0,fontSize:18,display:"flex",alignItems:"center",gap:8,fontFamily:"'Sora',sans-serif"}}><Icon name="shield" size={19} color="#FFD166"/> Admin Panel</h2>
        <button onClick={onExit} style={{color:"#9B8FC0",background:"none",border:"none",cursor:"pointer",fontSize:13}}>Exit</button>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:16}}>
        {[["Total Received","Rs."+totalIn.toFixed(0),"#F472B6"],["Total Pay-out","Rs."+totalOut.toFixed(0),"#FF8FA3"]].map(([l,v,c])=>(
          <div key={l} style={{background:"#1C1233",border:"1px solid #2E1F4D",borderRadius:12,padding:12}}>
            <p style={{color:"#9B8FC0",fontSize:11,margin:0}}>{l}</p>
            <p style={{fontFamily:"monospace",fontSize:18,fontWeight:900,color:c,margin:0}}>{v}</p>
          </div>
        ))}
        <div style={{background:"#1C1233",border:"1px solid #FFD166",borderRadius:12,padding:12,gridColumn:"1/-1"}}>
          <p style={{color:"#9B8FC0",fontSize:11,margin:0}}>Margin (Kamai)</p>
          <p style={{fontFamily:"monospace",fontSize:22,fontWeight:900,color:"#FFD166",margin:0}}>Rs.{(totalIn-totalOut).toFixed(0)}</p>
        </div>
      </div>
      <h3 style={{color:"#F4EEFF",margin:"0 0 8px",fontWeight:700}}>Pending ({pending.length})</h3>
      {pending.length===0&&<p style={{color:"#9B8FC0",fontSize:13}}>No pending requests</p>}
      {pending.map(t=>(
        <div key={t.id} style={{background:"#1C1233",border:"1px solid #2E1F4D",borderRadius:12,padding:12,marginBottom:10}}>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
            <span style={{fontWeight:700,color:"#F4EEFF",fontSize:13}}>{t.username}</span>
            <span style={{fontSize:11,fontWeight:700,padding:"2px 8px",borderRadius:999,background:t.type==="topup"?"rgba(5,150,105,.2)":"rgba(124,58,237,.2)",color:t.type==="topup"?"#F472B6":"#F472B6"}}>{t.type==="topup"?"Top-up":"Withdraw"}</span>
          </div>
          <p style={{color:"#D9CCF0",fontSize:12,margin:"0 0 8px"}}>Rs.{t.amountPKR} • {t.coins} coins • {t.method}{t.reference?` • ${t.reference}`:""}</p>
          <div style={{display:"flex",gap:8}}>
            {t.type==="topup"?<>
              <Btn onClick={()=>approveTopup(t)} style={{flex:1,padding:"7px",fontSize:12}}>Approve</Btn>
              <Btn onClick={()=>rejectTopup(t)} ghost style={{flex:1,padding:"7px",fontSize:12}}>Reject</Btn>
            </>:<>
              <Btn onClick={()=>markWithdrawPaid(t)} style={{flex:1,padding:"7px",fontSize:12,display:"flex",alignItems:"center",justifyContent:"center",gap:5}}><Icon name="cash" size={13}/> Paid</Btn>
              <Btn onClick={()=>rejectWithdraw(t)} ghost style={{flex:1,padding:"7px",fontSize:12}}>Reject</Btn>
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
  const [viewUserId,setViewUserId]=useState(null);

  const notify=useCallback((text)=>{ setToast(text); setTimeout(()=>setToast(""),2200); },[]);
const fireBurst=useCallback((b)=>{ setBurst({...b,key:Date.now()}); setTimeout(()=>setBurst(null), 15000); },[]);
  const openUserProfile=useCallback((uid)=>{
    if(user&&uid===user.userId){ setViewUserId(null); setTab("profile"); }
    else { setViewUserId(uid); }
  },[user]);

  // ── Bootstrapping: watch auth state ──────────────────────────────────────
  useEffect(()=>{
    let mounted=true;
    supabase.auth.getSession().then(({data})=>{ if(mounted) setSession(data.session||null); });
    const { data:sub } = supabase.auth.onAuthStateChange((_event,sess)=>{ if(mounted) setSession(sess); });
    return ()=>{ mounted=false; sub.subscription.unsubscribe(); };
  },[]);

  useEffect(()=>{
    if(session===undefined) return;
    if(session===null){ setUser(null); return; }
    (async()=>{
      const profile=await db.getMyProfile();
      setUser(profile);
    })();
  },[session]);

  // ── Feed loading + realtime refresh ──────────────────────────────────────
  const refreshFeed=useCallback(async()=>{
    try{
      const [feed,reels,lives]=await Promise.all([db.fetchFeed(),db.fetchReels(),db.fetchLivePosts()]);
      const map=new Map();
      [...feed,...reels,...lives].forEach(p=>map.set(p.postId,p));
      setPosts(Array.from(map.values()).sort((a,b)=>b.createdAt-a.createdAt));
    }catch(e){ /* network blip — will retry next time */ }
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

  if(session===undefined||(session&&!user)){
    return <div style={{minHeight:"100vh",background:"#120A22",display:"flex",alignItems:"center",justifyContent:"center",color:"#9B8FC0"}}>Loading...</div>;
  }
  if(!user){
    return (
      <div style={{minHeight:"100vh",background:"#120A22"}}>
        <AuthScreen notify={notify}/>
        <Toast text={toast}/>
        <style>{GLOBAL_CSS}</style>
      </div>
    );
  }

  if(showAdmin && user.isAdmin){
    return (
      <div style={{minHeight:"100vh",background:"#120A22"}}>
        <AdminPanel onExit={()=>setShowAdmin(false)} notify={notify}/>
        <Toast text={toast}/>
        <style>{GLOBAL_CSS}</style>
      </div>
    );
  }

  if(activeLive){
    return (
      <div style={{minHeight:"100vh",background:"#120A22"}}>
        <LiveDetailView post={activeLive} posts={posts} user={user} onBack={()=>setActiveLive(null)} fireBurst={fireBurst} notify={notify} onCloseLive={closeLive} refreshFeed={refreshFeed} onJoinCohost={openLive}/>
        <GiftBurst burst={burst}/>
        <Toast text={toast}/>
        <style>{GLOBAL_CSS}</style>
      </div>
    );
  }

  if(chatPartner){
    return (
      <div style={{minHeight:"100vh",background:"#120A22"}}>
        <ChatView user={user} partner={chatPartner} onBack={()=>setChatPartner(null)}/>
        <Toast text={toast}/>
        <style>{GLOBAL_CSS}</style>
      </div>
    );
  }

  if(viewUserId){
    return (
      <div style={{minHeight:"100vh",background:"#120A22"}}>
        <UserProfileView userId={viewUserId} currentUser={user} onBack={()=>setViewUserId(null)} notify={notify} onOpenChat={setChatPartner} onOpenProfile={openUserProfile}/>
        <Toast text={toast}/>
        <style>{GLOBAL_CSS}</style>
      </div>
    );
  }

  const TABS=[
    ["home","home"],["live","live"],["reels","reel"],["search","search"],["inbox","chat"],["profile","user"],
  ];

  return (
    <div style={{minHeight:"100vh",background:"#120A22",display:"flex",flexDirection:"column"}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"12px 16px",borderBottom:"1px solid #1C1233",position:"sticky",top:0,background:"#120A22",zIndex:30}}>
        <span style={{fontWeight:700,fontSize:20,color:"#F4EEFF",fontFamily:"'Sora',sans-serif",display:"flex",alignItems:"center",gap:8}}>
          <WaveLogo size={30}/>
          {APP_NAME}
        </span>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <CoinPill value={user.coinBalance} onClick={()=>setTab("wallet")}/>
          <button onClick={toggleNotifs} style={{position:"relative",background:"none",border:"none",cursor:"pointer",display:"flex",padding:6,color:"#F4EEFF"}}>
            <Icon name="bell" size={19}/>
            {unreadCount>0&&<span style={{position:"absolute",top:-2,right:-2,background:"#FF4D6D",color:"#fff",fontSize:9,fontWeight:700,borderRadius:999,padding:"1px 5px"}}>{unreadCount}</span>}
          </button>
          {user.isAdmin&&<button onClick={()=>setShowAdmin(true)} style={{background:"none",border:"none",cursor:"pointer",display:"flex",padding:6,color:"#FFD166"}}><Icon name="shield" size={17}/></button>}
        </div>
      </div>

      {notifOpen&&(
        <div style={{position:"fixed",top:56,right:14,zIndex:40,background:"#1C1233",border:"1px solid #2E1F4D",borderRadius:14,width:260,maxHeight:320,overflowY:"auto",boxShadow:"0 8px 30px rgba(0,0,0,.5)"}}>
          {notifications.length===0&&<p style={{color:"#9B8FC0",fontSize:12,padding:14,margin:0}}>No notifications</p>}
          {notifications.map(n=>(
            <div key={n.id} style={{padding:"10px 14px",borderBottom:"1px solid #2E1F4D",fontSize:12,color:n.read?"#9B8FC0":"#F4EEFF"}}>
              {n.body}
              <div style={{fontSize:10,color:"#9B8FC0",marginTop:2}}>{timeAgo(n.ts)} ago</div>
            </div>
          ))}
        </div>
      )}

      <div style={{flex:1,overflowY:"auto",paddingBottom:70,display:"flex",flexDirection:tab==="reels"||tab==="live"&&activeLive?"column":undefined}}>
        {tab==="home"&&<FeedView posts={posts} user={user} refreshFeed={refreshFeed} notify={notify} fireBurst={fireBurst} onOpenLive={openLive} onOpenProfile={openUserProfile}/>}
        {tab==="live"&&<LiveFeedView posts={posts} user={user} onOpenLive={openLive} onStartLive={()=>setTab("golive")}/>}
        {tab==="golive"&&<GoLiveView user={user} notify={notify} onDone={(post)=>{ refreshFeed(); setTab("live"); openLive(post); }}/>}
        {tab==="reels"&&<ReelsView posts={posts} user={user} notify={notify} refreshFeed={refreshFeed} fireBurst={fireBurst}/>}
        {tab==="search"&&<SearchView user={user} notify={notify} onOpenChat={setChatPartner} onOpenProfile={openUserProfile}/>}
        {tab==="inbox"&&<InboxView user={user} onOpenChat={setChatPartner} notify={notify} notifications={notifications} onOpenProfile={openUserProfile}/>}
        {tab==="profile"&&<ProfileView user={user} onLogout={handleLogout} onGoWallet={()=>setTab("wallet")} notify={notify} onUserUpdate={setUser} onOpenProfile={openUserProfile}/>}
        {tab==="wallet"&&<WalletView user={user} notify={notify} onRefreshUser={(bal)=>setUser(u=>({...u,coinBalance:bal}))}/>}
        {tab==="create"&&<CreateView user={user} notify={notify} onDone={()=>{ refreshFeed(); setTab("home"); notify("Posted!"); }}/>}
      </div>

      <div style={{position:"fixed",bottom:0,left:0,right:0,background:"#120A22",borderTop:"1px solid #1C1233",display:"flex",alignItems:"center",justifyContent:"space-around",padding:"8px 4px calc(8px + env(safe-area-inset-bottom))",zIndex:30}}>
        {TABS.slice(0,3).map(([id,icon])=>(
          <button key={id} onClick={()=>setTab(id)} style={{background:"none",border:"none",cursor:"pointer",display:"flex",opacity:tab===id?1:0.5,padding:6,color:tab===id?"#A855F7":"#9B8FC0"}}><Icon name={icon} size={20}/></button>
        ))}
        <button onClick={()=>setTab("create")} style={{background:"linear-gradient(135deg,#A855F7,#EC4899)",border:"none",borderRadius:16,width:44,height:44,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",color:"#fff",marginTop:-16,boxShadow:"0 10px 26px rgba(236,72,153,.45)"}}><Icon name="plus" size={21} color="#fff" strokeWidth={2.4}/></button>
        {TABS.slice(3).map(([id,icon])=>(
          <button key={id} onClick={()=>setTab(id)} style={{background:"none",border:"none",cursor:"pointer",display:"flex",opacity:tab===id?1:0.5,padding:6,color:tab===id?"#A855F7":"#9B8FC0"}}><Icon name={icon} size={20}/></button>
        ))}
      </div>

      <GiftBurst burst={burst}/>
      <Toast text={toast}/>
      <style>{GLOBAL_CSS}</style>
    </div>
  );
}

const GLOBAL_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Sora:wght@600;700;800&family=Inter:wght@400;500;600;700&display=swap');
  * { box-sizing: border-box; }
  body { margin:0; font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background:#120A22; }
  h1,h2,h3 { font-family: 'Sora', sans-serif; }
  @keyframes giftPop { 0%{transform:scale(.4);opacity:0;} 15%{transform:scale(1.15);opacity:1;} 80%{transform:scale(1);opacity:1;} 100%{transform:scale(.9);opacity:0;} }
  ::-webkit-scrollbar { width:0; height:0; }
`;
