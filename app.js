// ═══════════════════════════════════════════
//  WEBNOTE — app.js  v5
// ═══════════════════════════════════════════

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getAuth, createUserWithEmailAndPassword,
  signInWithEmailAndPassword, signOut, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  getFirestore, doc, setDoc, getDoc, addDoc, updateDoc, deleteDoc,
  collection, query, where, orderBy, getDocs, serverTimestamp,
  arrayUnion, arrayRemove
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyASaooIcRrY2mwZiI3j5VwjHmmzY8XLIag",
  authDomain: "webnote-63e2b.firebaseapp.com",
  projectId: "webnote-63e2b",
  storageBucket: "webnote-63e2b.firebasestorage.app",
  messagingSenderId: "756128668649",
  appId: "1:756128668649:web:da1ac2ec48f661d1688978"
};

const ADMIN_UID = "pOEobpTzahTB8kLhWKw54K0BDSW2";
const fireApp = initializeApp(firebaseConfig);
const auth    = getAuth(fireApp);
const db      = getFirestore(fireApp);

let currentUser = null, currentUsername = "", currentShareLink = "";
let allMessages = [], currentFilter = "all", isGridView = true;
let qrGenerated = false, qrVisible = false, isAdmin = false, selectedEmoji = "📢";

const urlParams  = new URLSearchParams(window.location.search);
const targetUser = urlParams.get("user");

// ── THEME ──
const savedTheme = localStorage.getItem("wn-theme") || "light";
document.documentElement.setAttribute("data-theme", savedTheme);
updateThemeIcon(savedTheme);
$("themeToggle")?.addEventListener("click", () => {
  const next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", next);
  localStorage.setItem("wn-theme", next);
  updateThemeIcon(next);
  if (qrVisible) { qrGenerated = false; generateQR(); }
  showToast(next === "dark" ? "Thème sombre 🌙" : "Thème clair ☀️");
});
function updateThemeIcon(t) { const i = $("theme-ico"); if (i) i.textContent = t === "dark" ? "☀️" : "🌙"; }

// ── DATETIME ──
function updateDatetime() {
  const now  = new Date();
  const date = now.toLocaleDateString("fr-FR", { weekday:"long", day:"numeric", month:"long" });
  const time = now.toLocaleTimeString("fr-FR", { hour:"2-digit", minute:"2-digit" });
  ["auth-datetime","send-datetime"].forEach(id => {
    const el = $(id); if (el) { el.style.whiteSpace = "pre-line"; el.textContent = date + "\n" + time; }
  });
}
updateDatetime(); setInterval(updateDatetime, 30000);

// ── PAGES ──
const pages = { landing:$("page-landing"), auth:$("page-auth"), dashboard:$("page-dashboard"), community:$("page-community"), admin:$("page-admin"), send:$("page-send") };
function showPage(name) {
  Object.values(pages).forEach(p => { if (p) { p.style.display="none"; p.classList.remove("active"); } });
  const page = pages[name]; if (!page) return;
  page.style.display = "flex"; void page.offsetWidth; page.classList.add("active");
  document.querySelectorAll(".nav-tab, .mob-btn").forEach(b => b.classList.toggle("active", b.dataset.page === name));
}
document.querySelectorAll(".nav-tab, .mob-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    if (!currentUser) return;
    const t = btn.dataset.page;
    if (t === "admin" && !isAdmin) return;
    showPage(t);
    if (t === "community") loadCommunity();
    if (t === "admin") loadAdminPanel();
  });
});

// ── AUTH STATE ──
onAuthStateChanged(auth, async (user) => {
  if (targetUser) { await loadSendPage(targetUser); return; }
  if (user) {
    currentUser = user; isAdmin = user.uid === ADMIN_UID;
    $("nav-login-btn")?.classList.add("hidden");
    $("nav-signup-btn")?.classList.add("hidden");
    $("nav-user")?.classList.remove("hidden");
    if ($("nav-tabs")) $("nav-tabs").style.display = "flex";
    $("mobile-nav")?.classList.remove("hidden");
    document.querySelectorAll(".admin-only").forEach(el => el.classList.toggle("hidden", !isAdmin));
    const userDoc = await getDoc(doc(db,"users",user.uid));
    currentUsername = userDoc.exists() ? userDoc.data().username : (user.email?.split("@")[0] || "user");
    $("nav-username").textContent = "@" + currentUsername;
    $("nav-avatar-letter").textContent = currentUsername[0].toUpperCase();
    $("dash-username-title").textContent = currentUsername;
    $("dash-avatar").textContent = currentUsername[0].toUpperCase();
    resetDashboard(); await loadDashboard(); showPage("dashboard");
    const ls=$("login-submit"); if(ls){ls.disabled=false;ls.querySelector("span").textContent="Se connecter";}
    const ss=$("signup-submit"); if(ss){ss.disabled=false;ss.querySelector("span").textContent="Créer mon compte";}
  } else {
    currentUser=null; currentUsername=""; isAdmin=false; allMessages=[];
    $("nav-login-btn")?.classList.remove("hidden");
    $("nav-signup-btn")?.classList.remove("hidden");
    $("nav-user")?.classList.add("hidden");
    if ($("nav-tabs")) $("nav-tabs").style.display = "none";
    $("mobile-nav")?.classList.add("hidden");
    showPage("landing");
  }
});

function resetDashboard() {
  const qrEl=$("qr-code-el"); if(qrEl) qrEl.innerHTML="";
  qrGenerated=false; qrVisible=false; $("qr-wrap")?.classList.add("hidden");
  currentFilter="all"; isGridView=true;
  ["stat-total","stat-today","stat-week"].forEach(id => { const el=$(id); if(el) el.textContent="0"; });
  document.querySelectorAll(".pill").forEach(p => p.classList.remove("active"));
  $("filter-all")?.classList.add("active");
}

// ── LANDING ──
$("landing-start-btn")?.addEventListener("click", () => { showAuthTab("signup"); showPage("auth"); });
$("landing-login-btn")?.addEventListener("click", () => { showAuthTab("login");  showPage("auth"); });
$("nav-login-btn")?.addEventListener("click",     () => { showAuthTab("login");  showPage("auth"); });
$("nav-signup-btn")?.addEventListener("click",    () => { showAuthTab("signup"); showPage("auth"); });

// ── AUTH ──
function showAuthTab(tab) {
  const sl=$("tab-slider"),fl=$("form-login"),fs=$("form-signup"),tl=$("tab-login"),ts=$("tab-signup");
  if (tab === "login") {
    tl.classList.add("active"); ts.classList.remove("active"); fl.classList.remove("hidden"); fs.classList.add("hidden"); sl.classList.remove("right"); $("login-error")?.classList.add("hidden");
  } else {
    ts.classList.add("active"); tl.classList.remove("active"); fs.classList.remove("hidden"); fl.classList.add("hidden"); sl.classList.add("right"); $("signup-error")?.classList.add("hidden");
  }
}
$("tab-login")?.addEventListener("click",        () => showAuthTab("login"));
$("tab-signup")?.addEventListener("click",       () => showAuthTab("signup"));
$("switch-to-signup")?.addEventListener("click", () => showAuthTab("signup"));
$("switch-to-login")?.addEventListener("click",  () => showAuthTab("login"));

document.querySelectorAll(".eye-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    const inp=$(btn.dataset.target); const isPwd=inp.type==="password"; inp.type=isPwd?"text":"password";
    btn.querySelector(".eye-open").classList.toggle("hidden",isPwd);
    btn.querySelector(".eye-closed").classList.toggle("hidden",!isPwd);
  });
});

const sbars=["sbar1","sbar2","sbar3","sbar4"].map(id=>$(id));
const SI=[{label:"",cls:""},{label:"Faible",cls:"weak"},{label:"Moyen",cls:"fair"},{label:"Bon",cls:"good"},{label:"Fort 💪",cls:"strong"}];
function pwdScore(p){let s=0;if(p.length>=6)s++;if(p.length>=10)s++;if(/[A-Z]/.test(p)&&/[a-z]/.test(p))s++;if(/[0-9]/.test(p)||/[^A-Za-z0-9]/.test(p))s++;return s;}
$("signup-password")?.addEventListener("input",()=>{
  const sc=pwdScore($("signup-password").value);
  sbars.forEach((b,i)=>{b.className="sbar";if(i<sc)b.classList.add(SI[sc].cls);});
  $("strength-label").textContent=$("signup-password").value?SI[sc].label:"";
});

$("signup-submit")?.addEventListener("click",async()=>{
  const username=$("signup-username").value.trim().toLowerCase().replace(/\s+/g,"_");
  const email=$("signup-email").value.trim(), password=$("signup-password").value;
  const err=$("signup-error"); err.classList.add("hidden");
  if(!username||username.length<3) return showErr(err,"Pseudo trop court (min. 3 car.)");
  if(!email||!password) return showErr(err,"Remplis tous les champs.");
  if(password.length<6) return showErr(err,"Mot de passe trop court (min. 6).");
  const existing=await getDocs(query(collection(db,"users"),where("username","==",username)));
  if(!existing.empty) return showErr(err,"Ce pseudo est déjà pris.");
  $("signup-submit").querySelector("span").textContent="Création…"; $("signup-submit").disabled=true;
  try{
    const cred=await createUserWithEmailAndPassword(auth,email,password);
    await setDoc(doc(db,"users",cred.user.uid),{username,email,uid:cred.user.uid,createdAt:serverTimestamp()});
  }catch(e){$("signup-submit").querySelector("span").textContent="Créer mon compte";$("signup-submit").disabled=false;showErr(err,fbErr(e.code));}
});

$("login-submit")?.addEventListener("click",async()=>{
  const email=$("login-email").value.trim(),password=$("login-password").value;
  const err=$("login-error"); err.classList.add("hidden");
  if(!email||!password) return showErr(err,"Remplis tous les champs.");
  $("login-submit").querySelector("span").textContent="Connexion…"; $("login-submit").disabled=true;
  try{await signInWithEmailAndPassword(auth,email,password);}
  catch(e){$("login-submit").querySelector("span").textContent="Se connecter";$("login-submit").disabled=false;showErr(err,fbErr(e.code));}
});
$("nav-logout-btn")?.addEventListener("click",()=>signOut(auth));

// ── DASHBOARD ──
async function loadDashboard(){
  const base=window.location.origin+window.location.pathname;
  currentShareLink=base+"?user="+encodeURIComponent(currentUsername);
  if($("share-link")) $("share-link").textContent=currentShareLink;

  // Inject OG tags for user link (for WhatsApp/Insta previews when user shares their link)
  setMetaTag("og:title", "Webnote — Envoie-moi un message anonyme \uD83C\uDFAD");
  setMetaTag("og:description", "Envoie un message anonyme à @"+currentUsername+" — personne ne saura que c'est toi.");
  setMetaTag("og:image", "https://i.postimg.cc/C5BSD4fV/copilot-image-1775360474606.png");
  setMetaTag("og:url", currentShareLink);
  setMetaTag("twitter:title", "Webnote — Envoie-moi un message anonyme \uD83C\uDFAD");
  setMetaTag("twitter:description", "Envoie un message anonyme à @"+currentUsername);
  setMetaTag("twitter:image", "https://i.postimg.cc/C5BSD4fV/copilot-image-1775360474606.png");
  replaceEl("copy-link-btn",b=>b.addEventListener("click",()=>{navigator.clipboard.writeText(currentShareLink).then(()=>showToast("✅ Lien copié !"));}));
  replaceEl("share-wa",b=>b.addEventListener("click",()=>window.open("https://wa.me/?text="+encodeURIComponent("Envoie-moi un message anonyme 👀\n"+currentShareLink),"_blank")));
  replaceEl("share-tw",b=>b.addEventListener("click",()=>window.open("https://twitter.com/intent/tweet?text="+encodeURIComponent("Envoie-moi un message anonyme 👀 "+currentShareLink),"_blank")));
  replaceEl("share-ig",b=>b.addEventListener("click",()=>{navigator.clipboard.writeText(currentShareLink).then(()=>showToast("✅ Copié ! Mets dans ta bio Insta 📸"));}));
  replaceEl("share-snap",b=>b.addEventListener("click",()=>{navigator.clipboard.writeText(currentShareLink).then(()=>showToast("✅ Copié pour Snap 👻"));}));
  replaceEl("qr-toggle-btn",b=>b.addEventListener("click",toggleQR));
  replaceEl("qr-dl-btn",b=>b.addEventListener("click",downloadQR));
  replaceEl("refresh-btn",b=>b.addEventListener("click",async()=>{
    b.style.transition="transform .5s"; b.style.transform="rotate(360deg)";
    setTimeout(()=>{b.style.transform="";b.style.transition="";},500);
    await fetchMessages(); showToast("✅ Actualisé !");
  }));
  replaceEl("export-btn",b=>b.addEventListener("click",exportMessages));
  ["all","today","week","unread"].forEach(f=>replaceEl("filter-"+f,b=>b.addEventListener("click",()=>setFilter(f))));
  replaceEl("view-grid",b=>b.addEventListener("click",()=>setView(true)));
  replaceEl("view-list",b=>b.addEventListener("click",()=>setView(false)));
  const si=$("search-input"); if(si) si.addEventListener("input",e=>renderMessages(e.target.value.toLowerCase().trim()));
  await fetchMessages();
}

function toggleQR(){
  qrVisible=!qrVisible; $("qr-wrap")?.classList.toggle("hidden",!qrVisible);
  const b=$("qr-toggle-btn");
  if(b) b.innerHTML=qrVisible
    ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg> Masquer le QR'
    : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg> Afficher le QR Code';
  if(qrVisible) generateQR();
}
function generateQR(){
  if(qrGenerated||!currentShareLink)return;
  const c=$("qr-code-el");if(!c)return;c.innerHTML="";
  try{new QRCode(c,{text:currentShareLink,width:160,height:160,colorDark:"#000000",colorLight:"#ffffff",correctLevel:QRCode.CorrectLevel.M});qrGenerated=true;}
  catch(e){console.error("QR:",e);}
}
function downloadQR(){
  const canvas=$("qr-code-el")?.querySelector("canvas"),img=$("qr-code-el")?.querySelector("img");
  const src=canvas?canvas.toDataURL("image/png"):img?.src;
  if(!src){showToast("Génère le QR d'abord !");return;}
  const a=document.createElement("a");a.href=src;a.download="webnote-qrcode.png";a.click();
  showToast("📱 QR téléchargé !");
}

async function fetchMessages(){
  try{
    const q=query(collection(db,"messages"),where("recipientId","==",currentUser.uid),orderBy("createdAt","desc"));
    const snap=await getDocs(q);
    allMessages=snap.docs.map(d=>({id:d.id,...d.data()}));
    updateStats(); buildChart(); renderMessages();
  }catch(e){console.error("fetchMessages:",e);}
}

function setFilter(f){
  currentFilter=f;
  document.querySelectorAll(".pill").forEach(p=>p.classList.remove("active"));
  $("filter-"+f)?.classList.add("active"); renderMessages();
}
function setView(grid){
  isGridView=grid;
  $("view-grid")?.classList.toggle("active",grid);
  $("view-list")?.classList.toggle("active",!grid);
  $("messages-container")?.classList.toggle("list-view",!grid);
}

function updateStats(){
  const now=new Date(),today=new Date(now.getFullYear(),now.getMonth(),now.getDate());
  const week=new Date(today); week.setDate(today.getDate()-7);
  animateCount($("stat-total"),allMessages.length);
  animateCount($("stat-today"),allMessages.filter(m=>m.createdAt&&m.createdAt.toDate()>=today).length);
  animateCount($("stat-week"),allMessages.filter(m=>m.createdAt&&m.createdAt.toDate()>=week).length);
  const dc=$("dash-count");
  if(dc) dc.textContent=allMessages.length===0?"Aucun message pour l'instant.":allMessages.length+" message"+(allMessages.length>1?"s":"")+" reçu"+(allMessages.length>1?"s":"");
}
function animateCount(el,target){
  if(!el)return; let cur=0; const step=Math.ceil(target/20)||1;
  const t=setInterval(()=>{cur=Math.min(cur+step,target);el.textContent=cur;if(cur>=target)clearInterval(t);},40);
}

function buildChart(){
  const chart=$("act-chart");if(!chart)return;
  const days=[];
  for(let i=6;i>=0;i--){const d=new Date();d.setDate(d.getDate()-i);days.push({key:d.toDateString(),lbl:d.toLocaleDateString("fr-FR",{weekday:"short"}).slice(0,3),count:0});}
  allMessages.forEach(m=>{if(!m.createdAt)return;const day=days.find(d=>d.key===m.createdAt.toDate().toDateString());if(day)day.count++;});
  const total=days.reduce((a,d)=>a+d.count,0);
  const at=$("act-total");if(at)at.textContent=total;
  const max=Math.max(...days.map(d=>d.count),1);
  chart.innerHTML="";
  days.forEach(d=>{
    const col=document.createElement("div");col.className="bar-col";
    const bar=document.createElement("div");bar.className="bar"+(d.count===0?" empty":"");
    bar.style.height="0%"; setTimeout(()=>{bar.style.height=(d.count===0?5:Math.max(Math.round(d.count/max*100),8))+"%";},80);
    const lbl=document.createElement("div");lbl.className="bar-day";lbl.textContent=d.lbl;
    col.appendChild(bar);col.appendChild(lbl);chart.appendChild(col);
  });
}

function renderMessages(searchTerm=""){
  const container=$("messages-container");if(!container)return;
  container.innerHTML="";
  const now=new Date(),today=new Date(now.getFullYear(),now.getMonth(),now.getDate());
  const week=new Date(today);week.setDate(today.getDate()-7);
  const cutoff24=new Date(now-86400000);
  let filtered=[...allMessages];
  if(currentFilter==="today")  filtered=filtered.filter(m=>m.createdAt&&m.createdAt.toDate()>=today);
  if(currentFilter==="week")   filtered=filtered.filter(m=>m.createdAt&&m.createdAt.toDate()>=week);
  if(currentFilter==="unread") filtered=filtered.filter(m=>m.createdAt&&m.createdAt.toDate()>=cutoff24);
  if(searchTerm) filtered=filtered.filter(m=>m.message?.toLowerCase().includes(searchTerm));
  if(filtered.length===0){const emp=$("empty-state");if(emp){emp.classList.remove("hidden");container.appendChild(emp);}return;}

  filtered.forEach((msg,i)=>{
    const card=document.createElement("div");
    card.className="msg-card"; card.style.animationDelay=i*0.04+"s";
    const isNew=msg.createdAt&&msg.createdAt.toDate()>=cutoff24;
    const badges=(isNew?'<span class="msg-badge new">🆕 Nouveau</span>':"")+(msg.approved?'<span class="msg-badge approved">✅ Approuvé</span>':"");
    const replyHtml=msg.adminReply?'<div class="msg-reply"><span class="msg-reply-lbl">Réponse de l\'équipe</span>'+escHtml(msg.adminReply)+'</div>':"";
    // Reactions state for this card (local)
    const reacts = { "❤️": msg._r1||0, "😂": msg._r2||0, "🔥": msg._r3||0, "😮": msg._r4||0 };
    const reactHtml = Object.entries(reacts).map(([em,n]) =>
      `<button class="react-btn" data-em="${em}">${em}${n>0?'<span class="react-n">'+n+'</span>':''}</button>`
    ).join('');

    card.innerHTML=
      '<div class="msg-header">'+badges+'</div>'+
      '<div class="msg-text">'+escHtml(msg.message)+'</div>'+
      replyHtml+
      '<div class="msg-reactions">'+reactHtml+'</div>'+
      '<div class="msg-footer">'+
        '<div class="msg-time">'+( msg.createdAt?formatDate(msg.createdAt.toDate()):"À l\'instant" )+'</div>'+
        '<div class="msg-actions-row">'+
          '<button class="msg-action-btn msg-share-btn">'+
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg></button>'+
          '<button class="msg-action-btn msg-copy-btn">'+
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></button>'+
        '</div>'+
      '</div>';

    // Reactions — local toggle animation
    card.querySelectorAll(".react-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        btn.classList.toggle("reacted");
        btn.style.transform = "scale(1.4)";
        setTimeout(() => { btn.style.transform = ""; }, 220);
        const em = btn.dataset.em;
        reacts[em] = btn.classList.contains("reacted") ? (reacts[em]||0)+1 : Math.max(0,(reacts[em]||1)-1);
        const n = reacts[em];
        btn.innerHTML = em + (n > 0 ? '<span class="react-n">'+n+'</span>' : '');
      });
    });

    card.querySelector(".msg-share-btn").addEventListener("click",()=>openShareModal(msg.message));
    card.querySelector(".msg-copy-btn").addEventListener("click",()=>{
      navigator.clipboard.writeText(msg.message).then(()=>showToast("📋 Copié !"));
    });
    container.appendChild(card);
  });
}

function exportMessages(){
  if(!allMessages.length){showToast("⚠️ Aucun message à exporter !");return;}
  const sorted=[...allMessages].sort((a,b)=>(a.createdAt?.toMillis()||0)-(b.createdAt?.toMillis()||0));
  const lines=["Webnote — Messages anonymes","Exporté : "+new Date().toLocaleString("fr-FR"),"Total : "+sorted.length+" message(s)","─".repeat(36),""];
  sorted.forEach((m,i)=>{lines.push("["+(i+1)+"] "+(m.createdAt?m.createdAt.toDate().toLocaleString("fr-FR"):"—"));lines.push('"'+m.message+'"');if(m.adminReply)lines.push("→ "+m.adminReply);lines.push("");});
  const blob=new Blob([lines.join("\n")],{type:"text/plain;charset=utf-8"});
  const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="webnote-"+new Date().toISOString().slice(0,10)+".txt";a.click();URL.revokeObjectURL(a.href);
  showToast("📄 Export téléchargé !");
}

// ── COMMUNITY ──
async function loadCommunity(){ await Promise.all([loadAnnouncements(),loadPolls(),loadFeatureRequests()]); }

async function loadAnnouncements(){
  const list=$("announcements-list");if(!list)return;
  try{
    const snap=await getDocs(query(collection(db,"announcements"),orderBy("createdAt","desc")));
    if(snap.empty){list.innerHTML='<div class="empty-state"><div class="empty-icon">📭</div><p>Aucun communiqué.</p></div>';return;}
    list.innerHTML="";
    snap.forEach(d=>{
      const data=d.data();const card=document.createElement("div");card.className="ann-card";
      const date=data.createdAt?data.createdAt.toDate().toLocaleDateString("fr-FR",{day:"numeric",month:"long",year:"numeric"}):"";
      card.innerHTML='<div class="ann-header"><div class="ann-emoji">'+(data.emoji||"📢")+'</div><div class="ann-meta"><div class="ann-title">'+escHtml(data.title)+'</div><div class="ann-date">'+date+'</div></div></div><div class="ann-body">'+escHtml(data.body)+'</div>';
      list.appendChild(card);
    });
  }catch(e){console.error(e);}
}

async function loadPolls(){
  const list=$("polls-list");if(!list)return;
  try{
    const snap=await getDocs(query(collection(db,"polls"),where("active","==",true),orderBy("createdAt","desc")));
    if(snap.empty){list.innerHTML='<div class="empty-state"><div class="empty-icon">📊</div><p>Aucun sondage actif.</p></div>';return;}
    list.innerHTML="";snap.forEach(d=>list.appendChild(buildPollCard(d.id,d.data())));
  }catch(e){console.error(e);}
}

function buildPollCard(pollId,data){
  const card=document.createElement("div");card.className="poll-card";
  const voters=data.voters||[];const hasVoted=currentUser&&voters.includes(currentUser.uid);
  const totalVotes=(data.options||[]).reduce((a,o)=>a+(o.votes||0),0);
  let optHtml="";
  (data.options||[]).forEach((opt,i)=>{
    const pct=totalVotes>0?Math.round((opt.votes||0)/totalVotes*100):0;
    optHtml+='<div class="poll-option '+(hasVoted?"voted":"")+" data-poll=\""+pollId+"\" data-idx=\""+i+"\">"+'<div class="poll-bar" style="width:'+(hasVoted?pct:0)+'%"></div><div class="poll-option-inner"><span class="poll-option-text">'+escHtml(opt.text)+'</span>'+(hasVoted?'<span class="poll-option-pct">'+pct+'%</span>':"")+'</div></div>';
  });
  card.innerHTML='<div class="poll-question">'+escHtml(data.question)+'</div><div class="poll-options">'+optHtml+'</div><div class="poll-total">'+totalVotes+' vote'+(totalVotes!==1?"s":"")+(hasVoted?" · Tu as voté ✓":"")+'</div>';
  if(!hasVoted&&currentUser) card.querySelectorAll(".poll-option").forEach(opt=>opt.addEventListener("click",()=>votePoll(pollId,parseInt(opt.dataset.idx),data)));
  return card;
}

async function votePoll(pollId,idx,data){
  if(!currentUser){showToast("Connecte-toi pour voter !");return;}
  try{
    const ref=doc(db,"polls",pollId);const snap=await getDoc(ref);const cur=snap.data();
    if(cur.voters?.includes(currentUser.uid)){showToast("Tu as déjà voté !");return;}
    const options=[...(cur.options||[])];options[idx]={...options[idx],votes:(options[idx].votes||0)+1};
    await updateDoc(ref,{options,voters:arrayUnion(currentUser.uid)});
    showToast("✅ Vote enregistré !");loadPolls();
  }catch(e){console.error(e);showToast("Erreur.");}
}

async function loadFeatureRequests(){
  const list=$("features-list");if(!list)return;
  try{
    const snap=await getDocs(query(collection(db,"features"),orderBy("votes","desc")));
    list.innerHTML="";
    if(snap.empty){list.innerHTML='<div class="empty-state" style="padding:26px 0"><div class="empty-icon">💡</div><p>Sois le premier !</p></div>';return;}
    snap.forEach(d=>{
      const data=d.data();const hasVoted=currentUser&&(data.voters||[]).includes(currentUser.uid);
      const item=document.createElement("div");item.className="feature-item";
      const badgesHtml=data.approved?'<span class="feature-badge approved">✅ Approuvé</span>':'<span class="feature-badge pending">En attente</span>';
      const replyHtml=data.adminReply?'<div class="feature-reply"><span class="feature-reply-lbl">Réponse Webnote</span>'+escHtml(data.adminReply)+'</div>':"";
      item.innerHTML='<div class="feature-votes"><button class="vote-btn '+(hasVoted?"voted":"")+'">▲</button><div class="vote-count">'+(data.votes||0)+'</div></div><div class="feature-info"><div class="feature-text">'+escHtml(data.text)+'</div><div class="feature-badges">'+badgesHtml+'</div>'+replyHtml+'</div>';
      item.querySelector(".vote-btn").addEventListener("click",()=>voteFeature(d.id,hasVoted,data.votes||0));
      list.appendChild(item);
    });
  }catch(e){console.error(e);}
}

replaceEl("feature-submit-btn",btn=>btn?.addEventListener("click",async()=>{
  const inp=$("feature-input");if(!inp)return;
  const text=inp.value.trim();
  if(!text||text.length<5)return showToast("⚠️ Trop court !");
  if(!currentUser)return showToast("Connecte-toi d'abord !");
  btn.querySelector("span").textContent="Envoi…";btn.disabled=true;
  try{await addDoc(collection(db,"features"),{text,votes:0,voters:[],approved:false,adminReply:null,authorId:currentUser.uid,createdAt:serverTimestamp()});inp.value="";showToast("💡 Suggestion envoyée !");loadFeatureRequests();}
  catch(e){showToast("Erreur.");}
  btn.querySelector("span").textContent="Proposer";btn.disabled=false;
}));

async function voteFeature(featureId,hasVoted,currentVotes){
  if(!currentUser)return showToast("Connecte-toi pour voter !");
  try{
    const ref=doc(db,"features",featureId);
    const newVotes=hasVoted?Math.max(0,currentVotes-1):currentVotes+1;
    if(hasVoted)await updateDoc(ref,{votes:newVotes,voters:arrayRemove(currentUser.uid)});
    else await updateDoc(ref,{votes:newVotes,voters:arrayUnion(currentUser.uid)});
    loadFeatureRequests();
  }catch(e){console.error(e);}
}

// ── ADMIN ──
async function loadAdminPanel(){
  if(!isAdmin)return;
  await Promise.all([loadAdminAnnouncements(),loadAdminPolls(),loadAdminFeedback()]);
  document.querySelectorAll(".admin-tab").forEach(tab=>{
    tab.addEventListener("click",()=>{
      document.querySelectorAll(".admin-tab").forEach(t=>t.classList.remove("active"));
      document.querySelectorAll(".admin-panel").forEach(p=>p.classList.remove("active"));
      tab.classList.add("active");$("atab-"+tab.dataset.atab)?.classList.add("active");
    });
  });
  document.querySelectorAll(".emoji-opt").forEach(opt=>{
    opt.addEventListener("click",()=>{document.querySelectorAll(".emoji-opt").forEach(o=>o.classList.remove("active"));opt.classList.add("active");selectedEmoji=opt.dataset.emoji;});
  });
  replaceEl("ann-submit",btn=>btn?.addEventListener("click",async()=>{
    const title=$("ann-title").value.trim(),body=$("ann-body").value.trim();
    if(!title||!body)return showToast("⚠️ Requis !");
    btn.querySelector("span").textContent="Publication…";btn.disabled=true;
    try{await addDoc(collection(db,"announcements"),{title,body,emoji:selectedEmoji,authorId:currentUser.uid,createdAt:serverTimestamp()});$("ann-title").value="";$("ann-body").value="";showToast("📢 Publié !");loadAdminAnnouncements();}
    catch(e){showToast("Erreur.");}
    btn.querySelector("span").textContent="Publier le communiqué";btn.disabled=false;
  }));
  replaceEl("poll-submit",btn=>btn?.addEventListener("click",async()=>{
    const question=$("poll-question").value.trim();
    const rawOptions=$("poll-options").value.trim().split("\n").map(s=>s.trim()).filter(Boolean);
    if(!question||rawOptions.length<2)return showToast("⚠️ Question + min. 2 options !");
    btn.querySelector("span").textContent="Création…";btn.disabled=true;
    try{await addDoc(collection(db,"polls"),{question,options:rawOptions.map(text=>({text,votes:0})),voters:[],active:true,authorId:currentUser.uid,createdAt:serverTimestamp()});$("poll-question").value="";$("poll-options").value="";showToast("📊 Sondage créé !");loadAdminPolls();}
    catch(e){showToast("Erreur.");}
    btn.querySelector("span").textContent="Créer le sondage";btn.disabled=false;
  }));
}

async function loadAdminAnnouncements(){
  const list=$("admin-announcements-list");if(!list)return;
  const snap=await getDocs(query(collection(db,"announcements"),orderBy("createdAt","desc")));
  list.innerHTML="";
  if(snap.empty){list.innerHTML='<p style="color:var(--tx3);font-size:.8rem">Aucun communiqué.</p>';return;}
  snap.forEach(d=>{
    const data=d.data();const item=document.createElement("div");item.className="admin-item";
    const date=data.createdAt?data.createdAt.toDate().toLocaleDateString("fr-FR"):"";
    item.innerHTML='<div class="admin-item-header"><div><div class="admin-item-text">'+(data.emoji||"📢")+" "+escHtml(data.title)+'</div><div class="admin-item-meta">'+date+'</div></div></div><div class="admin-item-actions"><button class="admin-action delete">🗑️ Supprimer</button></div>';
    item.querySelector(".delete").addEventListener("click",async()=>{if(!confirm("Supprimer ?"))return;await deleteDoc(doc(db,"announcements",d.id));showToast("🗑️ Supprimé.");loadAdminAnnouncements();});
    list.appendChild(item);
  });
}

async function loadAdminPolls(){
  const list=$("admin-polls-list");if(!list)return;
  const snap=await getDocs(query(collection(db,"polls"),orderBy("createdAt","desc")));
  list.innerHTML="";
  if(snap.empty){list.innerHTML='<p style="color:var(--tx3);font-size:.8rem">Aucun sondage.</p>';return;}
  snap.forEach(d=>{
    const data=d.data();const total=(data.options||[]).reduce((a,o)=>a+(o.votes||0),0);
    const date=data.createdAt?data.createdAt.toDate().toLocaleDateString("fr-FR"):"";
    const item=document.createElement("div");item.className="admin-item";
    item.innerHTML='<div class="admin-item-header"><div><div class="admin-item-text">'+escHtml(data.question)+'</div><div class="admin-item-meta">'+total+' vote(s) · '+date+" · "+(data.active?"✅ Actif":"⏸ Inactif")+'</div></div></div><div class="admin-item-actions"><button class="admin-action approve">'+(data.active?"⏸ Désactiver":"▶️ Activer")+'</button><button class="admin-action delete">🗑️</button></div>';
    item.querySelector(".approve").addEventListener("click",async()=>{await updateDoc(doc(db,"polls",d.id),{active:!data.active});showToast(data.active?"Désactivé.":"✅ Activé !");loadAdminPolls();});
    item.querySelector(".delete").addEventListener("click",async()=>{if(!confirm("Supprimer ?"))return;await deleteDoc(doc(db,"polls",d.id));showToast("🗑️ Supprimé.");loadAdminPolls();});
    list.appendChild(item);
  });
}

async function loadAdminFeedback(){
  const list=$("admin-feedback-list");if(!list)return;
  const snap=await getDocs(query(collection(db,"features"),orderBy("votes","desc")));
  list.innerHTML="";
  const pending=snap.docs.filter(d=>!d.data().approved).length;
  const badge=$("feedback-count");if(badge)badge.textContent=pending;
  const navBadge=$("admin-badge");if(navBadge){navBadge.textContent=pending;navBadge.style.display=pending>0?"":"none";}
  if(snap.empty){list.innerHTML='<div class="empty-state" style="padding:26px 0"><div class="empty-icon">💡</div><p>Aucune suggestion.</p></div>';return;}
  snap.forEach(d=>{
    const data=d.data();const date=data.createdAt?data.createdAt.toDate().toLocaleDateString("fr-FR"):"";
    const replyHtml=data.adminReply?'<div class="feature-reply"><span class="feature-reply-lbl">Réponse publiée</span>'+escHtml(data.adminReply)+'</div>':"";
    const item=document.createElement("div");item.className="admin-item";
    item.innerHTML='<div class="admin-item-header"><div><div class="admin-item-text">'+escHtml(data.text)+'</div><div class="admin-item-meta">'+(data.votes||0)+' vote(s) · '+date+(data.approved?" · ✅":"")+'</div></div></div>'+replyHtml+'<div class="admin-item-actions"><button class="admin-action approve">'+(data.approved?"❌ Retirer":"✅ Approuver")+'</button><button class="admin-action reply">✏️</button><button class="admin-action delete">🗑️</button></div><div class="admin-reply-form hidden" id="rf-'+d.id+'"><div class="input-wrap textarea-wrap"><textarea placeholder="Réponse publique…" rows="3"></textarea></div><button class="btn-primary" style="font-size:.78rem;padding:8px 15px;margin-top:4px;align-self:flex-end">Publier</button></div>';
    item.querySelector(".approve").addEventListener("click",async()=>{await updateDoc(doc(db,"features",d.id),{approved:!data.approved});showToast(data.approved?"Retrait.":"✅ Approuvé !");loadAdminFeedback();});
    item.querySelector(".reply").addEventListener("click",()=>$("rf-"+d.id)?.classList.toggle("hidden"));
    item.querySelector(".btn-primary").addEventListener("click",async()=>{const ta=$("rf-"+d.id)?.querySelector("textarea");const reply=ta?.value.trim();if(!reply)return showToast("Écris une réponse !");await updateDoc(doc(db,"features",d.id),{adminReply:reply});showToast("✏️ Réponse publiée !");loadAdminFeedback();});
    item.querySelector(".delete").addEventListener("click",async()=>{if(!confirm("Supprimer ?"))return;await deleteDoc(doc(db,"features",d.id));showToast("🗑️ Supprimé.");loadAdminFeedback();});
    list.appendChild(item);
  });
}

// ── SEND PAGE ──
async function loadSendPage(username){
  showPage("send");
  $("nav-login-btn")?.classList.remove("hidden");$("nav-signup-btn")?.classList.remove("hidden");
  const snap=await getDocs(query(collection(db,"users"),where("username","==",username)));
  if(snap.empty){if($("send-username-display"))$("send-username-display").textContent="introuvable";if($("send-submit"))$("send-submit").disabled=true;return;}
  const rd=snap.docs[0].data();
  if($("send-username-display"))$("send-username-display").textContent="@"+rd.username;
  if($("send-avatar"))$("send-avatar").textContent=rd.username[0].toUpperCase();
  $("send-message")?.addEventListener("input",()=>{if($("char-count"))$("char-count").textContent=$("send-message").value.length;});
  $("send-submit")?.addEventListener("click",async()=>{
    const msg=$("send-message")?.value.trim();
    $("send-error")?.classList.add("hidden");
    if(!msg||msg.length<2)return showErr($("send-error"),"Le message est trop court.");
    const span=$("send-submit").querySelector("span");if(span)span.textContent="Envoi…";
    $("send-submit").disabled=true;
    try{
      await addDoc(collection(db,"messages"),{message:msg,recipientId:rd.uid,recipientUsername:rd.username,approved:false,adminReply:null,createdAt:serverTimestamp()});
      $("send-submit")?.classList.add("hidden");
      $("send-message")?.closest(".input-wrap")?.classList.add("hidden");
      document.querySelector(".char-count")?.classList.add("hidden");
      $("send-success")?.classList.remove("hidden");
    }catch(e){if(span)span.textContent="Envoyer anonymement 🤍";$("send-submit").disabled=false;showErr($("send-error"),"Erreur. Réessaie.");}
  });
}

// ════════════════════════════════════════
//  SHARE — Pure Canvas (JPEG, no html2canvas)
//  JPEG = no transparency = no sticker bug on WhatsApp
// ════════════════════════════════════════
const BG_URL = "https://i.postimg.cc/C5BSD4fV/copilot-image-1775360474606.png";
const bgImg  = new Image();
bgImg.crossOrigin = "anonymous";
bgImg.src = BG_URL;

let shrBlob = null;

// ── Open modal ──
function openShareModal(message) {
  shrBlob = null;
  $("shr-overlay")?.classList.remove("hidden");
  $("shr-preview-loader")?.classList.remove("hidden");
  setTimeout(() => {
    drawShareCard(message, $("shr-canvas"), blob => {
      shrBlob = blob;
      $("shr-preview-loader")?.classList.add("hidden");
    });
  }, 150);
}

function closeShareModal() { $("shr-overlay")?.classList.add("hidden"); shrBlob = null; }
$("shr-overlay")?.addEventListener("click", e => { if (e.target === $("shr-overlay")) closeShareModal(); });
$("shr-close")?.addEventListener("click", closeShareModal);

// ── Core draw ──
function drawShareCard(message, canvas, callback) {
  if (!canvas) { if (callback) callback(null); return; }
  const W = 1080, H = 1350;
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d");

  const draw = () => {
    // Background image (cover)
    if (bgImg.complete && bgImg.naturalWidth > 0) {
      const ir=bgImg.naturalWidth/bgImg.naturalHeight, cr=W/H;
      let sx=0,sy=0,sw=bgImg.naturalWidth,sh=bgImg.naturalHeight;
      if(ir>cr){sw=sh*cr;sx=(bgImg.naturalWidth-sw)/2;}
      else{sh=sw/cr;sy=(bgImg.naturalHeight-sh)/2;}
      ctx.drawImage(bgImg,sx,sy,sw,sh,0,0,W,H);
    } else {
      const g=ctx.createLinearGradient(0,0,W,H);
      g.addColorStop(0,"#0d0b2e");g.addColorStop(.5,"#1a1050");g.addColorStop(1,"#2d0b50");
      ctx.fillStyle=g;ctx.fillRect(0,0,W,H);
    }
    // Overlay
    const ov=ctx.createLinearGradient(0,0,0,H);
    ov.addColorStop(0,"rgba(5,4,20,.62)");ov.addColorStop(.5,"rgba(10,8,35,.46)");ov.addColorStop(1,"rgba(5,4,20,.72)");
    ctx.fillStyle=ov;ctx.fillRect(0,0,W,H);
    // Glass panel
    const pad=70,cx=pad,cy=pad*2.5,cw=W-pad*2,ch=H-pad*5,r=60;
    rrect(ctx,cx,cy,cw,ch,r);ctx.fillStyle="rgba(255,255,255,.07)";ctx.fill();
    ctx.strokeStyle="rgba(255,255,255,.12)";ctx.lineWidth=2;ctx.stroke();
    // Top gradient border
    const tg=ctx.createLinearGradient(cx,cy,cx+cw,cy);
    tg.addColorStop(0,"rgba(99,102,241,0)");tg.addColorStop(.3,"rgba(99,102,241,.9)");
    tg.addColorStop(.7,"rgba(168,85,247,.9)");tg.addColorStop(1,"rgba(99,102,241,0)");
    ctx.strokeStyle=tg;ctx.lineWidth=4;
    ctx.beginPath();ctx.moveTo(cx+r,cy);ctx.lineTo(cx+cw-r,cy);ctx.stroke();
    // Logo icon
    const lx=cx+52,ly=cy+70;
    const lg=ctx.createLinearGradient(lx,ly-30,lx+60,ly+30);
    lg.addColorStop(0,"#6366f1");lg.addColorStop(1,"#a855f7");
    rrect(ctx,lx,ly-30,60,60,15);ctx.fillStyle=lg;ctx.fill();
    ctx.font="700 48px Georgia,serif";ctx.fillStyle="rgba(255,255,255,.9)";
    ctx.textBaseline="middle";ctx.fillText("webnote.",lx+76,ly);
    // Quote mark
    ctx.font="bold 200px Georgia,serif";ctx.fillStyle="rgba(99,102,241,.2)";
    ctx.textBaseline="top";ctx.fillText("\u201C",cx+42,cy+155);
    // Message (word wrapped)
    ctx.font="500 52px Arial,sans-serif";ctx.fillStyle="#f0f0ff";ctx.textBaseline="top";
    const msgX=cx+58,msgY=cy+285,msgW=cw-116,lineH=76;
    const lines=wrapText(ctx,message,msgW);
    const maxL=Math.floor((ch-410)/lineH);
    let show=lines.slice(0,maxL);
    if(lines.length>maxL&&show.length>0){
      let last=show[show.length-1];
      while(ctx.measureText(last+"…").width>msgW&&last.length>0)last=last.slice(0,-1);
      show[show.length-1]=last+"…";
    }
    show.forEach((line,i)=>ctx.fillText(line,msgX,msgY+i*lineH));
    // Divider
    const divY=cy+ch-175;
    ctx.strokeStyle="rgba(255,255,255,.1)";ctx.lineWidth=1.5;
    ctx.beginPath();ctx.moveTo(cx+58,divY);ctx.lineTo(cx+cw-58,divY);ctx.stroke();
    // Footer
    const fy=divY+46;
    ctx.font="700 27px Arial,sans-serif";ctx.fillStyle="rgba(255,255,255,.35)";ctx.textBaseline="top";
    ctx.fillText("MESSAGE ANONYME",cx+58,fy);
    ctx.font="500 25px Arial,sans-serif";ctx.fillStyle="rgba(160,140,255,.68)";
    ctx.fillText("webnote \xB7 mimosas444.github.io/Webnote.",cx+58,fy+42);
    ctx.font="62px serif";ctx.fillText("\uD83C\uDFAD",cx+cw-110,fy+6);
    // Export JPEG (solid, no transparency = no sticker on WA)
    canvas.toBlob(b=>{if(callback)callback(b);},"image/jpeg",0.94);
  };

  if(bgImg.complete&&bgImg.naturalWidth>0) draw();
  else{bgImg.onload=draw;bgImg.onerror=draw;}
}

function wrapText(ctx,text,maxW){
  const words=text.split(" ");const lines=[];let line="";
  for(const w of words){const test=line?line+" "+w:w;if(ctx.measureText(test).width>maxW&&line){lines.push(line);line=w;}else line=test;}
  if(line)lines.push(line);return lines;
}
function rrect(ctx,x,y,w,h,r){
  ctx.beginPath();ctx.moveTo(x+r,y);ctx.lineTo(x+w-r,y);
  ctx.quadraticCurveTo(x+w,y,x+w,y+r);ctx.lineTo(x+w,y+h-r);
  ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h);ctx.lineTo(x+r,y+h);
  ctx.quadraticCurveTo(x,y+h,x,y+h-r);ctx.lineTo(x,y+r);
  ctx.quadraticCurveTo(x,y,x+r,y);ctx.closePath();
}

async function getBlob(){
  if(shrBlob)return shrBlob;
  for(let i=0;i<40;i++){await new Promise(r=>setTimeout(r,100));if(shrBlob)return shrBlob;}
  return null;
}

// Modal buttons
$("shr-dl-btn")?.addEventListener("click",async()=>{
  const blob=await getBlob();if(!blob){showToast("⚠️ Patiente encore !");return;}
  const url=URL.createObjectURL(blob);
  const a=document.createElement("a");a.href=url;a.download="message-webnote.jpg";a.click();
  setTimeout(()=>URL.revokeObjectURL(url),2000);showToast("✅ Image enregistrée !");
});

$("shr-copy-btn")?.addEventListener("click",async()=>{
  const blob=await getBlob();if(!blob){showToast("⚠️ Patiente !");return;}
  try{
    if(navigator.clipboard?.write&&window.ClipboardItem){
      await navigator.clipboard.write([new ClipboardItem({"image/png":blob})]);
      showToast("✅ Copiée ! Colle dans Insta/Snap 📋");return;
    }
  }catch(e){}
  const url=URL.createObjectURL(blob);
  const a=document.createElement("a");a.href=url;a.download="message-webnote.jpg";a.click();
  setTimeout(()=>URL.revokeObjectURL(url),2000);showToast("✅ Image enregistrée !");
});

async function directSaveImage(message){
  return new Promise(resolve=>{
    const canvas=document.createElement("canvas");
    drawShareCard(message,canvas,blob=>{
      if(!blob){resolve(false);return;}
      const url=URL.createObjectURL(blob);
      const a=document.createElement("a");a.href=url;a.download="message-webnote.jpg";a.click();
      setTimeout(()=>URL.revokeObjectURL(url),2000);resolve(true);
    });
  });
}

// ════════════════════════════════════════
//  HELPERS
// ════════════════════════════════════════
function showToast(msg,duration=2600){
  const t=$("toast");if(!t)return;
  t.textContent=msg;t.classList.remove("hidden");
  requestAnimationFrame(()=>t.classList.add("show"));
  clearTimeout(t._t);
  t._t=setTimeout(()=>{t.classList.remove("show");setTimeout(()=>t.classList.add("hidden"),300);},duration);
}
function $(id){return document.getElementById(id);}
function replaceEl(id,fn){const el=$(id);if(!el)return;const clone=el.cloneNode(true);el.parentNode?.replaceChild(clone,el);fn(clone);}
function showErr(el,msg){if(!el)return;el.textContent=msg;el.classList.remove("hidden");}
function escHtml(str){return String(str).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");}

// Inject / update a meta tag dynamically
function setMetaTag(property, content) {
  let el = document.querySelector('meta[property="'+property+'"]') || document.querySelector('meta[name="'+property+'"]');
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(property.startsWith("twitter") ? "name" : "property", property);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

// Fixed formatDate — uses device local time (correct for any timezone, Haiti included)
function formatDate(date){
  const now=new Date();
  const diff=Math.floor((now.getTime()-date.getTime())/1000);
  if(diff<0)     return "À l'instant";
  if(diff<60)    return "À l'instant";
  if(diff<3600)  return "Il y a "+Math.floor(diff/60)+" min";
  if(diff<86400) return "Il y a "+Math.floor(diff/3600)+"h";
  if(diff<604800){const d=Math.floor(diff/86400);return "Il y a "+d+" jour"+(d>1?"s":"");}
  return date.toLocaleDateString("fr-FR",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"});
}
function fbErr(code){
  const m={"auth/email-already-in-use":"Email déjà utilisé.","auth/invalid-email":"Email invalide.","auth/weak-password":"Mot de passe trop faible.","auth/user-not-found":"Aucun compte.","auth/wrong-password":"Mot de passe incorrect.","auth/invalid-credential":"Email ou mot de passe incorrect.","auth/too-many-requests":"Trop de tentatives."};
  return m[code]||"Une erreur s'est produite.";
}
