// ═══════════════════════════════════════════
//  SE9SI.  — app.js
//  Pseudo + code à 6 chiffres, anonyme, sur Firebase/Firestore.
// ═══════════════════════════════════════════

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  getFirestore, doc, getDoc, setDoc, updateDoc,
  collection, addDoc, getDocs, query, orderBy, serverTimestamp, deleteDoc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// ⚠️ Même projet Firebase que ton site précédent (mêmes clés).
const firebaseConfig = {
  apiKey: "AIzaSyASaooIcRrY2mwZiI3j5VwjHmmzY8XLIag",
  authDomain: "webnote-63e2b.firebaseapp.com",
  projectId: "webnote-63e2b",
  storageBucket: "webnote-63e2b.firebasestorage.app",
  messagingSenderId: "756128668649",
  appId: "1:756128668649:web:da1ac2ec48f661d1688978"
};

// Le pseudo "anonymous" est le compte admin (code : 909018)
const ADMIN_USERNAMES = ["anonymous"];
const PIN_LENGTH = 6;

const fireApp = initializeApp(firebaseConfig);
const auth    = getAuth(fireApp);
const db      = getFirestore(fireApp);

let currentUsername = "";
let isAdmin = false;
let allQuestions = [];
let currentFilter = "all";
let isGridView = true;
let qrGenerated = false, qrVisible = false;
let bootHidden = false;
let authReady = false;

const urlParams  = new URLSearchParams(window.location.search);
const targetUser = urlParams.get("to") || urlParams.get("user");

// ── THEME ──
const savedTheme = localStorage.getItem("s9-theme") || "light";
document.documentElement.setAttribute("data-theme", savedTheme);
updateThemeIcon(savedTheme);
$("theme-toggle")?.addEventListener("click", () => {
  const next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", next);
  localStorage.setItem("s9-theme", next);
  updateThemeIcon(next);
  if (qrVisible) { qrGenerated = false; generateQR(); }
});
function updateThemeIcon(t){ const i=$("theme-ico"); if(i) i.textContent = t==="dark" ? "☀️" : "🌙"; }

// ── DATETIME ──
function updateDatetime(){
  const now=new Date();
  const date=now.toLocaleDateString("fr-FR",{weekday:"long",day:"numeric",month:"long"});
  const time=now.toLocaleTimeString("fr-FR",{hour:"2-digit",minute:"2-digit"});
  ["auth-datetime","ask-datetime"].forEach(id=>{ const el=$(id); if(el){ el.style.whiteSpace="pre-line"; el.textContent=date+"\n"+time; } });
}
updateDatetime(); setInterval(updateDatetime,30000);

// ── BOOT SKELETON ──
function hideBoot(){ if(bootHidden) return; bootHidden=true; const el=$("boot"); if(el){ el.classList.add("boot-hide"); setTimeout(()=>el.remove(),450); } }
setTimeout(hideBoot, 5000);

// ── PAGES ──
const pages = { landing:$("page-landing"), auth:$("page-auth"), dashboard:$("page-dashboard"), community:$("page-community"), admin:$("page-admin"), ask:$("page-ask") };
function showPage(name){
  Object.values(pages).forEach(p=>{ if(p){ p.style.display="none"; p.classList.remove("active"); } });
  const page=pages[name]; if(!page) return;
  page.style.display="flex"; void page.offsetWidth; page.classList.add("active");
  window.scrollTo(0,0);
  document.querySelectorAll(".nav-tab,.mob-btn").forEach(b=>b.classList.toggle("active", b.dataset.page===name));
}
document.querySelectorAll(".nav-tab,.mob-btn").forEach(btn=>{
  btn.addEventListener("click", ()=>{
    if(!currentUsername) return;
    const t=btn.dataset.page;
    if(t==="admin" && !isAdmin) return;
    showPage(t);
    if(t==="dashboard") fetchQuestions();
    if(t==="community") loadCommunity();
    if(t==="admin") loadAdminPanel();
  });
});

// ── CRYPTO ──
async function hashPin(pin, username){
  const enc=new TextEncoder().encode("se9si::"+username+"::"+pin);
  const buf=await crypto.subtle.digest("SHA-256", enc);
  return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,"0")).join("");
}

// ── INIT ──
(async function boot(){
  try{
    await new Promise((resolve,reject)=>{
      onAuthStateChanged(auth, user=>{ if(user){ authReady=true; resolve(); } }, reject);
      signInAnonymously(auth).catch(reject);
    });
  }catch(e){
    console.error("Auth anonyme impossible :", e);
    showToast("⚠️ Connexion au serveur impossible. Vérifie ta connexion.");
    hideBoot();
    return;
  }

  if(targetUser){ await loadAskPage(targetUser); hideBoot(); return; }

  const saved = localStorage.getItem("s9-username");
  if(saved){
    try{
      const snap = await getDoc(doc(db,"users",saved));
      if(snap.exists()){ await enterDashboard(saved); hideBoot(); return; }
    }catch(e){ console.error(e); }
    localStorage.removeItem("s9-username");
  }
  showPage("landing");
  hideBoot();
})();

// ── LANDING → AUTH ──
$("start-btn")?.addEventListener("click", ()=>showPage("auth"));
$("login-btn-landing")?.addEventListener("click", ()=>showPage("auth"));
$("nav-login-btn")?.addEventListener("click", ()=>showPage("auth"));

// ── PIN INPUT (6 boîtes, auto-avance) ──
const pinBoxes = Array.from(document.querySelectorAll(".pin-box"));
pinBoxes.forEach((box,i)=>{
  box.addEventListener("input", ()=>{
    box.value = box.value.replace(/[^0-9]/g,"").slice(0,1);
    if(box.value && pinBoxes[i+1]) pinBoxes[i+1].focus();
  });
  box.addEventListener("keydown", e=>{
    if(e.key==="Backspace" && !box.value && pinBoxes[i-1]) pinBoxes[i-1].focus();
  });
  box.addEventListener("paste", e=>{
    const text=(e.clipboardData||window.clipboardData).getData("text").replace(/[^0-9]/g,"");
    if(!text) return;
    e.preventDefault();
    text.slice(0,PIN_LENGTH).split("").forEach((ch,idx)=>{ if(pinBoxes[idx]) pinBoxes[idx].value=ch; });
    const last = Math.min(text.length,PIN_LENGTH)-1;
    if(pinBoxes[last]) pinBoxes[last].focus();
  });
});
function getPin(){ return pinBoxes.map(b=>b.value).join(""); }
function clearPin(){ pinBoxes.forEach(b=>b.value=""); pinBoxes[0]?.focus(); }

// ── LOGIN / SIGNUP UNIFIÉ ──
$("auth-submit")?.addEventListener("click", async ()=>{
  const username = $("auth-username").value.trim().toLowerCase().replace(/\s+/g,"");
  const pin = getPin();
  const err = $("auth-error"); err.classList.add("hidden");

  if(!authReady) return showErr(err,"Connexion au serveur en cours… réessaie dans une seconde.");
  if(!/^[a-z0-9_.]+$/i.test(username)) return showErr(err,"Le pseudo ne peut contenir que lettres, chiffres, _ et .");
  if(username.length<3) return showErr(err,"Pseudo trop court (min. 3 caractères).");
  if(pin.length!==PIN_LENGTH) return showErr(err,"Le code doit faire "+PIN_LENGTH+" chiffres.");

  const btn=$("auth-submit"); btn.disabled=true; btn.querySelector("span").textContent="Vérification…";
  try{
    const ref = doc(db,"users",username);
    const snap = await getDoc(ref);
    const pinHash = await hashPin(pin, username);

    if(!snap.exists()){
      // SIGNUP — création auto, pseudo garanti unique (ID de doc = pseudo)
      await setDoc(ref, { username, pinHash, createdAt: serverTimestamp() });
      await addDoc(collection(db,"users",username,"questions"), {
        name:"Se9si 👋", question:"Salut ! Tu recevras toutes tes questions ici. Bonne chance 🚨",
        opened:false, createdAt: serverTimestamp()
      });
      await enterDashboard(username);
      showToast("🎉 Compte créé !");
    } else {
      const data = snap.data();
      if(data.pinHash !== pinHash){
        btn.disabled=false; btn.querySelector("span").textContent="Continuer"; clearPin();
        return showErr(err,"Pseudo ou code incorrect.");
      }
      await enterDashboard(username);
      showToast("✅ Connecté !");
    }
  }catch(e){
    console.error(e);
    btn.disabled=false; btn.querySelector("span").textContent="Continuer";
    if(e.code==="permission-denied"){
      showErr(err,"Accès refusé par le serveur. Les règles Firestore doivent être mises à jour (voir console).");
    } else if(e.code==="unavailable"){
      showErr(err,"Serveur injoignable. Vérifie ta connexion internet.");
    } else {
      showErr(err,"Erreur. Réessaie.");
    }
  }
});

async function enterDashboard(username){
  currentUsername = username;
  localStorage.setItem("s9-username", username);
  isAdmin = ADMIN_USERNAMES.includes(username);

  $("nav-login-btn")?.classList.add("hidden");
  $("nav-user")?.classList.remove("hidden");
  $("nav-tabs").style.display="flex";
  $("mobile-nav")?.classList.remove("hidden");
  document.querySelectorAll(".admin-only").forEach(el=>el.classList.toggle("hidden", !isAdmin));

  $("nav-avatar").textContent = username[0].toUpperCase();
  $("nav-uname").textContent = "@"+username;
  $("dash-avatar").textContent = username[0].toUpperCase();
  $("dash-username").textContent = username;

  const base = window.location.origin + window.location.pathname;
  const link = base + "?to=" + encodeURIComponent(username);
  $("share-link").textContent = link;

  wireDashboardActions(link);
  showPage("dashboard");
  await fetchQuestions();
}

$("logout-btn")?.addEventListener("click", ()=>{
  localStorage.removeItem("s9-username");
  currentUsername=""; isAdmin=false; allQuestions=[];
  $("nav-login-btn")?.classList.remove("hidden");
  $("nav-user")?.classList.add("hidden");
  $("nav-tabs").style.display="none";
  $("mobile-nav")?.classList.add("hidden");
  document.querySelectorAll(".admin-only").forEach(el=>el.classList.add("hidden"));
  showPage("landing");
  showToast("👋 Déconnecté");
});

// ── DASHBOARD ACTIONS ──
function wireDashboardActions(link){
  replaceEl("copy-link-btn", b=>b.addEventListener("click", ()=>{
    navigator.clipboard.writeText(link).then(()=>showToast("✅ Lien copié !"));
  }));
  replaceEl("share-wa", b=>b.addEventListener("click", ()=>{
    window.open("https://wa.me/?text="+encodeURIComponent("Pose-moi une question anonyme 👀 "+link),"_blank");
  }));
  replaceEl("share-img", b=>b.addEventListener("click", ()=>openShareModal(
    "Pose-moi n'importe quelle question 👀", link
  )));
  replaceEl("qr-toggle-btn", b=>b.addEventListener("click", toggleQR));
  replaceEl("qr-dl-btn", b=>b.addEventListener("click", downloadQR));
  replaceEl("refresh-btn", b=>b.addEventListener("click", async ()=>{
    await fetchQuestions(); showToast("✅ Actualisé !");
  }));
  replaceEl("export-btn", b=>b.addEventListener("click", exportQuestions));
  replaceEl("filter-all", b=>b.addEventListener("click", ()=>setFilter("all")));
  replaceEl("filter-unread", b=>b.addEventListener("click", ()=>setFilter("unread")));
  replaceEl("view-grid", b=>b.addEventListener("click", ()=>setView(true)));
  replaceEl("view-list", b=>b.addEventListener("click", ()=>setView(false)));
  const si=$("search-input"); if(si) si.addEventListener("input", e=>renderQuestions(e.target.value.toLowerCase().trim()));
}

function toggleQR(){
  qrVisible=!qrVisible;
  $("qr-wrap")?.classList.toggle("hidden", !qrVisible);
  const b=$("qr-toggle-btn");
  if(b) b.innerHTML = qrVisible
    ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg> Masquer le QR'
    : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><line x1="14" y1="14" x2="14.01" y2="14"/><line x1="18" y1="14" x2="18.01" y2="14"/><line x1="14" y1="18" x2="14.01" y2="18"/><line x1="18" y1="18" x2="18.01" y2="18"/></svg> Afficher le QR Code';
  if(qrVisible) generateQR();
}
function generateQR(){
  if(qrGenerated) return;
  const c=$("qr-code-el"); if(!c) return; c.innerHTML="";
  const link=$("share-link").textContent;
  try{ new QRCode(c,{text:link,width:160,height:160,colorDark:"#000000",colorLight:"#ffffff",correctLevel:QRCode.CorrectLevel.M}); qrGenerated=true; }
  catch(e){ console.error("QR:",e); }
}
function downloadQR(){
  const canvas=$("qr-code-el")?.querySelector("canvas"), img=$("qr-code-el")?.querySelector("img");
  const src = canvas ? canvas.toDataURL("image/png") : img?.src;
  if(!src){ showToast("Ouvre le QR d'abord !"); return; }
  const a=document.createElement("a"); a.href=src; a.download="se9si-qrcode.png"; a.click();
  showToast("📱 QR téléchargé !");
}

// ── SKELETON HELPERS ──
function setStatsLoading(loading){ document.querySelectorAll(".stat-card").forEach(c=>c.classList.toggle("is-loading", loading)); }
function setQLoading(loading){ $("q-skeleton")?.classList.toggle("hidden", !loading); $("messages-container")?.classList.toggle("hidden", loading); }

// ── FETCH QUESTIONS ──
async function fetchQuestions(){
  setStatsLoading(true); setQLoading(true);
  try{
    const snap = await getDocs(query(collection(db,"users",currentUsername,"questions"), orderBy("createdAt","desc")));
    allQuestions = snap.docs.map(d=>({id:d.id, ...d.data()}));
    updateStats(); buildChart(); renderQuestions();
  }catch(e){ console.error("fetchQuestions:",e); showToast("⚠️ Impossible de charger les questions."); }
  finally{ setStatsLoading(false); setQLoading(false); }
}

function setFilter(f){
  currentFilter=f;
  document.querySelectorAll(".pill").forEach(p=>p.classList.remove("active"));
  $("filter-"+f)?.classList.add("active");
  renderQuestions($("search-input")?.value.toLowerCase().trim()||"");
}
function setView(grid){
  isGridView=grid;
  $("view-grid")?.classList.toggle("active",grid);
  $("view-list")?.classList.toggle("active",!grid);
  $("messages-container")?.classList.toggle("list-view",!grid);
}

function updateStats(){
  const now=new Date(), today=new Date(now.getFullYear(),now.getMonth(),now.getDate());
  animateCount($("stat-total"), allQuestions.length);
  animateCount($("stat-unread"), allQuestions.filter(q=>!q.opened).length);
  animateCount($("stat-today"), allQuestions.filter(q=>q.createdAt && q.createdAt.toDate()>=today).length);
  const dc=$("dash-count");
  if(dc) dc.textContent = allQuestions.length===0 ? "Aucune question pour l'instant." : allQuestions.length+" question"+(allQuestions.length>1?"s":"")+" reçue"+(allQuestions.length>1?"s":"");
}
function animateCount(el,target){
  if(!el) return; let cur=0; const step=Math.ceil(target/20)||1;
  const t=setInterval(()=>{cur=Math.min(cur+step,target); el.textContent=cur; if(cur>=target) clearInterval(t);},40);
}

function buildChart(){
  const chart=$("act-chart"); if(!chart) return;
  const days=[];
  for(let i=6;i>=0;i--){ const d=new Date(); d.setDate(d.getDate()-i); days.push({key:d.toDateString(), lbl:d.toLocaleDateString("fr-FR",{weekday:"short"}).slice(0,2), count:0}); }
  allQuestions.forEach(q=>{ if(!q.createdAt) return; const day=days.find(d=>d.key===q.createdAt.toDate().toDateString()); if(day) day.count++; });
  const total=days.reduce((a,d)=>a+d.count,0);
  const at=$("act-total"); if(at) at.textContent=total;
  const max=Math.max(...days.map(d=>d.count),1);
  chart.innerHTML="";
  days.forEach(d=>{
    const col=document.createElement("div"); col.className="bar-col";
    const bar=document.createElement("div"); bar.className="bar"+(d.count===0?" empty":"");
    bar.style.height="0%"; setTimeout(()=>{ bar.style.height=(d.count===0?5:Math.max(Math.round(d.count/max*100),8))+"%"; },80);
    const lbl=document.createElement("div"); lbl.className="bar-day"; lbl.textContent=d.lbl;
    col.appendChild(bar); col.appendChild(lbl); chart.appendChild(col);
  });
}

function renderQuestions(searchTerm=""){
  const container=$("messages-container"); if(!container) return;
  container.innerHTML="";
  let filtered=[...allQuestions];
  if(currentFilter==="unread") filtered=filtered.filter(q=>!q.opened);
  if(searchTerm) filtered=filtered.filter(q=> (q.question||"").toLowerCase().includes(searchTerm) || (q.name||"").toLowerCase().includes(searchTerm));

  if(filtered.length===0){
    container.innerHTML='<div class="empty-state"><div class="empty-icon">📭</div><p>Aucune question ici.</p></div>';
    return;
  }

  const cutoff24 = new Date(Date.now()-86400000);
  filtered.forEach((q,i)=>{
    const card=document.createElement("div");
    card.className="msg-card fade-up"; card.style.animationDelay=Math.min(i*0.04,0.4)+"s";
    const name = q.name || "Anonyme";
    const isNew = !q.opened;
    card.innerHTML =
      '<div class="msg-header">'+
        '<div class="msg-name"><span class="msg-avatar-mini">'+escHtml(name[0]||"?")+'</span>'+escHtml(name)+'</div>'+
        (isNew?'<span class="msg-badge new">🆕 Nouveau</span>':'')+
      '</div>'+
      '<div class="msg-text">'+escHtml(q.question||"")+'</div>'+
      '<div class="msg-footer">'+
        '<div class="msg-time">'+(q.createdAt?formatDate(q.createdAt.toDate()):"À l'instant")+'</div>'+
        '<div class="msg-actions-row">'+
          '<button class="msg-action-btn" data-act="share" title="Partager"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg></button>'+
          '<button class="msg-action-btn" data-act="copy" title="Copier"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></button>'+
          '<button class="msg-action-btn danger" data-act="delete" title="Supprimer"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0-1 14a2 2 0 01-2 2H7a2 2 0 01-2-2L4 6"/></svg></button>'+
        '</div>'+
      '</div>';

    if(!q.opened) card.addEventListener("click", ()=>markOpened(q.id), {once:true});
    card.querySelector('[data-act="share"]').addEventListener("click", e=>{ e.stopPropagation(); openShareModal(q.question, ""); });
    card.querySelector('[data-act="copy"]').addEventListener("click", e=>{ e.stopPropagation(); navigator.clipboard.writeText(q.question).then(()=>showToast("📋 Copié !")); });
    card.querySelector('[data-act="delete"]').addEventListener("click", async e=>{
      e.stopPropagation();
      if(!confirm("Supprimer cette question ?")) return;
      try{
        await deleteDoc(doc(db,"users",currentUsername,"questions",q.id));
        allQuestions = allQuestions.filter(x=>x.id!==q.id);
        updateStats(); buildChart(); renderQuestions(searchTerm);
        showToast("🗑️ Supprimée.");
      }catch(err){ console.error(err); showToast("⚠️ Erreur lors de la suppression."); }
    });
    container.appendChild(card);
  });
}

async function markOpened(id){
  const qItem = allQuestions.find(q=>q.id===id);
  if(!qItem || qItem.opened) return;
  qItem.opened = true;
  try{ await updateDoc(doc(db,"users",currentUsername,"questions",id), {opened:true}); }catch(e){ console.error(e); }
  updateStats();
  renderQuestions($("search-input")?.value.toLowerCase().trim()||"");
}

function exportQuestions(){
  if(!allQuestions.length){ showToast("⚠️ Aucune question à exporter !"); return; }
  const sorted=[...allQuestions].sort((a,b)=>(a.createdAt?.toMillis()||0)-(b.createdAt?.toMillis()||0));
  const lines=["Se9si — Questions anonymes","Exporté : "+new Date().toLocaleString("fr-FR"),"Total : "+sorted.length+" question(s)","─".repeat(36),""];
  sorted.forEach((q,i)=>{ lines.push("["+(i+1)+"] "+(q.createdAt?q.createdAt.toDate().toLocaleString("fr-FR"):"—")+" — "+(q.name||"Anonyme")); lines.push('"'+q.question+'"'); lines.push(""); });
  const blob=new Blob([lines.join("\n")],{type:"text/plain;charset=utf-8"});
  const a=document.createElement("a"); a.href=URL.createObjectURL(blob); a.download="se9si-"+new Date().toISOString().slice(0,10)+".txt"; a.click(); URL.revokeObjectURL(a.href);
  showToast("📄 Export téléchargé !");
}

// ── COMMUNITY (annonces + suggestions) ──
async function loadCommunity(){ await Promise.all([loadAnnouncements(), loadFeatureRequests()]); }

async function loadAnnouncements(){
  const list=$("announcements-list"); if(!list) return;
  $("feed-skeleton")?.classList.remove("hidden"); list.classList.add("hidden");
  try{
    const snap = await getDocs(query(collection(db,"announcements"), orderBy("createdAt","desc")));
    if(snap.empty){ list.innerHTML='<div class="empty-state"><div class="empty-icon">📭</div><p>Aucune annonce pour l\'instant.</p></div>'; }
    else{
      list.innerHTML="";
      snap.forEach(d=>{
        const data=d.data();
        const date = data.createdAt ? data.createdAt.toDate().toLocaleDateString("fr-FR",{day:"numeric",month:"long"}) : "";
        const card=document.createElement("div"); card.className="ann-card glass fade-up";
        card.innerHTML='<div class="ann-header"><div class="ann-emoji">'+(data.emoji||"📢")+'</div><div class="ann-meta"><div class="ann-title">'+escHtml(data.title)+'</div><div class="ann-date">'+date+'</div></div></div><div class="ann-body">'+escHtml(data.body)+'</div>';
        list.appendChild(card);
      });
    }
  }catch(e){ console.error(e); }
  finally{ $("feed-skeleton")?.classList.add("hidden"); list.classList.remove("hidden"); }
}

function votedFeatures(){ try{ return JSON.parse(localStorage.getItem("s9-voted-features")||"[]"); }catch(e){ return []; } }
function addVotedFeature(id){ const v=votedFeatures(); if(!v.includes(id)){ v.push(id); localStorage.setItem("s9-voted-features", JSON.stringify(v)); } }

async function loadFeatureRequests(){
  const list=$("features-list"); if(!list) return;
  try{
    const snap = await getDocs(query(collection(db,"features"), orderBy("votes","desc")));
    list.innerHTML="";
    if(snap.empty){ list.innerHTML='<div class="empty-state" style="padding:26px 0"><div class="empty-icon">💡</div><p>Sois le premier !</p></div>'; return; }
    const voted = votedFeatures();
    snap.forEach(d=>{
      const data=d.data(); const hasVoted = voted.includes(d.id);
      const item=document.createElement("div"); item.className="feature-item";
      const badgesHtml = data.approved ? '<span class="feature-badge approved">✅ Approuvé</span>' : '<span class="feature-badge pending">En attente</span>';
      const replyHtml = data.adminReply ? '<div class="feature-reply"><span class="feature-reply-lbl">Réponse Se9si</span>'+escHtml(data.adminReply)+'</div>' : "";
      item.innerHTML =
        '<div class="feature-votes"><button class="vote-btn '+(hasVoted?"voted":"")+'" style="width:32px;height:32px;border-radius:9px;background:var(--surface);border:1.5px solid var(--bd2);cursor:pointer;font-size:.82rem">▲</button><div class="vote-count" style="text-align:center;font-size:.74rem;font-weight:800;color:var(--accent);margin-top:3px">'+(data.votes||0)+'</div></div>'+
        '<div class="feature-info"><div class="feature-text">'+escHtml(data.text)+'</div><div class="feature-badges">'+badgesHtml+'</div>'+replyHtml+'</div>';
      item.querySelector(".vote-btn").addEventListener("click", ()=>voteFeature(d.id, hasVoted, data.votes||0));
      list.appendChild(item);
    });
  }catch(e){ console.error(e); }
}

replaceEl("feature-submit-btn", btn=>btn?.addEventListener("click", async ()=>{
  const inp=$("feature-input"); if(!inp) return;
  const text=inp.value.trim();
  if(!text||text.length<5) return showToast("⚠️ Trop court !");
  if(!currentUsername) return showToast("Connecte-toi d'abord !");
  btn.querySelector("span").textContent="Envoi…"; btn.disabled=true;
  try{
    await addDoc(collection(db,"features"), {text, votes:0, approved:false, adminReply:null, authorUsername:currentUsername, createdAt:serverTimestamp()});
    inp.value=""; showToast("💡 Suggestion envoyée !"); loadFeatureRequests();
  }catch(e){ console.error(e); showToast("⚠️ Erreur."); }
  btn.querySelector("span").textContent="Proposer"; btn.disabled=false;
}));

async function voteFeature(featureId, hasVoted, currentVotes){
  if(hasVoted){ showToast("Tu as déjà voté !"); return; }
  try{
    await updateDoc(doc(db,"features",featureId), {votes: currentVotes+1});
    addVotedFeature(featureId);
    loadFeatureRequests();
  }catch(e){ console.error(e); showToast("⚠️ Erreur."); }
}

// ── ADMIN ──
async function loadAdminPanel(){
  if(!isAdmin) return;
  await Promise.all([loadAdminAnnouncements(), loadAdminFeedback()]);
  document.querySelectorAll(".admin-tab").forEach(tab=>{
    tab.onclick = ()=>{
      document.querySelectorAll(".admin-tab").forEach(t=>t.classList.remove("active"));
      document.querySelectorAll(".admin-panel").forEach(p=>p.classList.remove("active"));
      tab.classList.add("active"); $("atab-"+tab.dataset.atab)?.classList.add("active");
    };
  });
  document.querySelectorAll(".emoji-opt").forEach(opt=>{
    opt.onclick = ()=>{ document.querySelectorAll(".emoji-opt").forEach(o=>o.classList.remove("active")); opt.classList.add("active"); };
  });
  replaceEl("ann-submit", btn=>btn?.addEventListener("click", async ()=>{
    const title=$("ann-title").value.trim(), body=$("ann-body").value.trim();
    const emoji = document.querySelector(".emoji-opt.active")?.dataset.emoji || "📢";
    if(!title||!body) return showToast("⚠️ Titre + message requis.");
    btn.disabled=true; btn.querySelector("span").textContent="Publication…";
    try{
      await addDoc(collection(db,"announcements"), {title, body, emoji, author:currentUsername, createdAt:serverTimestamp()});
      $("ann-title").value=""; $("ann-body").value="";
      showToast("📢 Publié !"); loadAdminAnnouncements();
    }catch(e){ console.error(e); showToast("⚠️ Erreur."); }
    btn.disabled=false; btn.querySelector("span").textContent="Publier l'annonce";
  }));
}

async function loadAdminAnnouncements(){
  const list=$("admin-announcements-list"); if(!list) return;
  const snap = await getDocs(query(collection(db,"announcements"), orderBy("createdAt","desc")));
  list.innerHTML="";
  if(snap.empty){ list.innerHTML='<p style="color:var(--tx3);font-size:.8rem">Aucune annonce.</p>'; return; }
  snap.forEach(d=>{
    const data=d.data();
    const date = data.createdAt ? data.createdAt.toDate().toLocaleDateString("fr-FR") : "";
    const item=document.createElement("div"); item.className="admin-item";
    item.innerHTML='<div class="admin-item-header"><div><div class="admin-item-text">'+(data.emoji||"📢")+" "+escHtml(data.title)+'</div><div class="admin-item-meta">'+date+'</div></div></div><div class="admin-item-actions"><button class="admin-action delete">🗑️ Supprimer</button></div>';
    item.querySelector(".delete").addEventListener("click", async ()=>{ if(!confirm("Supprimer ?")) return; await deleteDoc(doc(db,"announcements",d.id)); showToast("🗑️ Supprimé."); loadAdminAnnouncements(); });
    list.appendChild(item);
  });
}

async function loadAdminFeedback(){
  const list=$("admin-feedback-list"); if(!list) return;
  const snap = await getDocs(query(collection(db,"features"), orderBy("votes","desc")));
  list.innerHTML="";
  const pending = snap.docs.filter(d=>!d.data().approved).length;
  const badge=$("feedback-count"); if(badge) badge.textContent=pending;
  const navBadge=$("admin-badge"); if(navBadge){ navBadge.textContent=pending; navBadge.style.display = pending>0 ? "" : "none"; }
  if(snap.empty){ list.innerHTML='<div class="empty-state" style="padding:26px 0"><div class="empty-icon">💡</div><p>Aucune suggestion.</p></div>'; return; }
  snap.forEach(d=>{
    const data=d.data();
    const date = data.createdAt ? data.createdAt.toDate().toLocaleDateString("fr-FR") : "";
    const replyHtml = data.adminReply ? '<div class="feature-reply"><span class="feature-reply-lbl">Réponse publiée</span>'+escHtml(data.adminReply)+'</div>' : "";
    const item=document.createElement("div"); item.className="admin-item";
    item.innerHTML =
      '<div class="admin-item-header"><div><div class="admin-item-text">'+escHtml(data.text)+'</div><div class="admin-item-meta">'+(data.votes||0)+' vote(s) · '+date+(data.approved?" · ✅":"")+'</div></div></div>'+replyHtml+
      '<div class="admin-item-actions"><button class="admin-action approve">'+(data.approved?"❌ Retirer":"✅ Approuver")+'</button><button class="admin-action reply">✏️ Répondre</button><button class="admin-action delete">🗑️</button></div>'+
      '<div class="admin-reply-form hidden" id="rf-'+d.id+'"><div class="input-wrap textarea-wrap"><textarea placeholder="Réponse publique…" rows="3"></textarea></div><button class="btn-primary" style="font-size:.78rem;padding:8px 15px;margin-top:4px;align-self:flex-end">Publier</button></div>';
    item.querySelector(".approve").addEventListener("click", async ()=>{ await updateDoc(doc(db,"features",d.id), {approved: !data.approved}); showToast(data.approved?"Retrait.":"✅ Approuvé !"); loadAdminFeedback(); });
    item.querySelector(".reply").addEventListener("click", ()=>$("rf-"+d.id)?.classList.toggle("hidden"));
    item.querySelector(".btn-primary").addEventListener("click", async ()=>{
      const ta=$("rf-"+d.id)?.querySelector("textarea"); const reply=ta?.value.trim();
      if(!reply) return showToast("Écris une réponse !");
      await updateDoc(doc(db,"features",d.id), {adminReply:reply}); showToast("✏️ Réponse publiée !"); loadAdminFeedback();
    });
    item.querySelector(".delete").addEventListener("click", async ()=>{ if(!confirm("Supprimer ?")) return; await deleteDoc(doc(db,"features",d.id)); showToast("🗑️ Supprimé."); loadAdminFeedback(); });
    list.appendChild(item);
  });
}

// ── ASK PAGE (public, sans compte) ──
async function loadAskPage(username){
  showPage("ask");
  $("nav-login-btn")?.classList.remove("hidden");
  username = username.trim().toLowerCase();
  let snap;
  try{ snap = await getDoc(doc(db,"users",username)); }
  catch(e){ console.error(e); $("ask-username").textContent="erreur de chargement"; $("ask-submit").disabled=true; return; }

  if(!snap.exists()){
    $("ask-username").textContent="introuvable";
    $("ask-submit").disabled=true;
    return;
  }
  const data = snap.data();
  $("ask-username").textContent = "@"+data.username;
  $("ask-avatar").textContent = data.username[0].toUpperCase();

  $("ask-question")?.addEventListener("input", ()=>{ $("ask-charcount").textContent = $("ask-question").value.length; });

  $("ask-submit")?.addEventListener("click", async ()=>{
    const name = $("ask-name").value.trim();
    const question = $("ask-question").value.trim();
    $("ask-error")?.classList.add("hidden");
    if(!question || question.length<2) return showErr($("ask-error"),"Ta question est trop courte.");

    const btn=$("ask-submit"); btn.disabled=true; btn.querySelector("span").textContent="Envoi…";
    try{
      await addDoc(collection(db,"users",data.username,"questions"), {
        name: name || "Anonyme", question, opened:false, createdAt: serverTimestamp()
      });
      $("ask-form")?.classList.add("hidden");
      $("ask-success")?.classList.remove("hidden");
    }catch(e){
      console.error(e);
      btn.disabled=false; btn.querySelector("span").textContent="Envoyer anonymement 🤍";
      showErr($("ask-error"),"Erreur. Réessaie.");
    }
  });
}

// ════════════════════════════════════════
//  SHARE — canvas, brandé Se9si
// ════════════════════════════════════════
let shrBlob=null;

function openShareModal(text, link){
  shrBlob=null;
  $("shr-overlay")?.classList.remove("hidden");
  $("shr-preview-loader")?.classList.remove("hidden");
  setTimeout(()=>{
    drawShareCard(text, link, $("shr-canvas"), blob=>{ shrBlob=blob; $("shr-preview-loader")?.classList.add("hidden"); });
  }, 120);
}
function closeShareModal(){ $("shr-overlay")?.classList.add("hidden"); shrBlob=null; }
$("shr-overlay")?.addEventListener("click", e=>{ if(e.target===$("shr-overlay")) closeShareModal(); });
$("shr-close")?.addEventListener("click", closeShareModal);

function drawShareCard(text, link, canvas, callback){
  if(!canvas){ if(callback) callback(null); return; }
  const W=1080, H=1350;
  canvas.width=W; canvas.height=H;
  const ctx=canvas.getContext("2d");
  const dark = document.documentElement.getAttribute("data-theme")==="dark";

  const g=ctx.createLinearGradient(0,0,W,H);
  if(dark){ g.addColorStop(0,"#07071a"); g.addColorStop(.5,"#0f0d20"); g.addColorStop(1,"#12091a"); }
  else{ g.addColorStop(0,"#dde8ff"); g.addColorStop(.5,"#ede9ff"); g.addColorStop(1,"#fce4ec"); }
  ctx.fillStyle=g; ctx.fillRect(0,0,W,H);

  const pad=64, cx=pad, cy=pad*2.2, cw=W-pad*2, ch=H-pad*4.6, r=44;
  rrect(ctx,cx,cy,cw,ch,r);
  ctx.fillStyle = dark ? "rgba(255,255,255,.06)" : "rgba(255,255,255,.62)";
  ctx.fill();
  ctx.lineWidth=1.5; ctx.strokeStyle = dark ? "rgba(255,255,255,.12)" : "rgba(255,255,255,.9)"; ctx.stroke();

  const tg=ctx.createLinearGradient(cx,cy,cx+cw,cy);
  tg.addColorStop(0,"rgba(92,110,248,0)"); tg.addColorStop(.3,"rgba(92,110,248,.9)"); tg.addColorStop(.7,"rgba(192,132,252,.9)"); tg.addColorStop(1,"rgba(92,110,248,0)");
  ctx.strokeStyle=tg; ctx.lineWidth=4;
  ctx.beginPath(); ctx.moveTo(cx+r,cy); ctx.lineTo(cx+cw-r,cy); ctx.stroke();

  // logo
  const lx=cx+50, ly=cy+68;
  const lg=ctx.createLinearGradient(lx,ly-28,lx+56,ly+28);
  lg.addColorStop(0,"#5c6ef8"); lg.addColorStop(1,"#c084fc");
  rrect(ctx,lx,ly-28,56,56,14); ctx.fillStyle=lg; ctx.fill();
  const inkCol = dark ? "#f0f0ff" : "#1a1a2e";
  ctx.font="700 42px Georgia,serif"; ctx.fillStyle=inkCol; ctx.textBaseline="middle";
  ctx.fillText("se9si.",lx+72,ly);

  // giant quote
  ctx.font="bold 170px Georgia,serif"; ctx.fillStyle="rgba(92,110,248,.22)"; ctx.textBaseline="top";
  ctx.fillText("\u201C",cx+42,cy+150);

  // text
  ctx.font="500 48px Arial,sans-serif"; ctx.fillStyle=inkCol; ctx.textBaseline="top";
  const msgX=cx+56, msgY=cy+295, msgW=cw-112, lineH=70;
  const lines=wrapText(ctx, text, msgW);
  const maxL=Math.floor((ch-450)/lineH);
  let show=lines.slice(0,maxL);
  if(lines.length>maxL && show.length>0){
    let last=show[show.length-1];
    while(ctx.measureText(last+"…").width>msgW && last.length>0) last=last.slice(0,-1);
    show[show.length-1]=last+"…";
  }
  show.forEach((line,i)=>ctx.fillText(line,msgX,msgY+i*lineH));

  const divY=cy+ch-175;
  ctx.strokeStyle = dark ? "rgba(255,255,255,.1)" : "rgba(26,26,46,.12)";
  ctx.lineWidth=1.5;
  ctx.beginPath(); ctx.moveTo(cx+56,divY); ctx.lineTo(cx+cw-56,divY); ctx.stroke();

  const fy=divY+42;
  ctx.font="800 26px Arial,sans-serif"; ctx.fillStyle="#5c6ef8"; ctx.textBaseline="top";
  ctx.fillText("QUESTION ANONYME",cx+56,fy);
  ctx.font="600 24px Arial,sans-serif"; ctx.fillStyle = dark ? "rgba(240,240,255,.5)" : "rgba(26,26,46,.45)";
  ctx.fillText(link || "se9si.", cx+56, fy+40);

  canvas.toBlob(b=>{ if(callback) callback(b); }, "image/jpeg", 0.94);
}

function wrapText(ctx,text,maxW){
  const words=(text||"").split(" "); const lines=[]; let line="";
  for(const w of words){ const test=line?line+" "+w:w; if(ctx.measureText(test).width>maxW && line){ lines.push(line); line=w; } else line=test; }
  if(line) lines.push(line);
  return lines;
}
function rrect(ctx,x,y,w,h,r){
  ctx.beginPath(); ctx.moveTo(x+r,y); ctx.lineTo(x+w-r,y);
  ctx.quadraticCurveTo(x+w,y,x+w,y+r); ctx.lineTo(x+w,y+h-r);
  ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h); ctx.lineTo(x+r,y+h);
  ctx.quadraticCurveTo(x,y+h,x,y+h-r); ctx.lineTo(x,y+r);
  ctx.quadraticCurveTo(x,y,x+r,y); ctx.closePath();
}

async function getBlob(){
  if(shrBlob) return shrBlob;
  for(let i=0;i<40;i++){ await new Promise(r=>setTimeout(r,100)); if(shrBlob) return shrBlob; }
  return null;
}
$("shr-dl-btn")?.addEventListener("click", async ()=>{
  const blob=await getBlob(); if(!blob){ showToast("⚠️ Patiente encore !"); return; }
  const url=URL.createObjectURL(blob);
  const a=document.createElement("a"); a.href=url; a.download="se9si-question.jpg"; a.click();
  setTimeout(()=>URL.revokeObjectURL(url),2000);
  showToast("✅ Image enregistrée !");
});
$("shr-copy-btn")?.addEventListener("click", async ()=>{
  const blob=await getBlob(); if(!blob){ showToast("⚠️ Patiente !"); return; }
  try{
    if(navigator.clipboard?.write && window.ClipboardItem){
      await navigator.clipboard.write([new ClipboardItem({"image/png":blob})]);
      showToast("✅ Copiée ! Colle dans Insta/Snap 📋"); return;
    }
  }catch(e){}
  const url=URL.createObjectURL(blob);
  const a=document.createElement("a"); a.href=url; a.download="se9si-question.jpg"; a.click();
  setTimeout(()=>URL.revokeObjectURL(url),2000);
  showToast("✅ Image enregistrée !");
});

// ════════════════════════════════════════
//  HELPERS
// ════════════════════════════════════════
function showToast(msg,duration=2800){
  const t=$("toast"); if(!t) return;
  t.textContent=msg; t.classList.remove("hidden");
  requestAnimationFrame(()=>t.classList.add("show"));
  clearTimeout(t._t);
  t._t=setTimeout(()=>{ t.classList.remove("show"); setTimeout(()=>t.classList.add("hidden"),300); }, duration);
}
function $(id){ return document.getElementById(id); }
function replaceEl(id,fn){ const el=$(id); if(!el) return; const clone=el.cloneNode(true); el.parentNode?.replaceChild(clone,el); fn(clone); }
function showErr(el,msg){ if(!el) return; el.textContent=msg; el.classList.remove("hidden"); }
function escHtml(str){ return String(str).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); }
function formatDate(date){
  const now=new Date(); const diff=Math.floor((now.getTime()-date.getTime())/1000);
  if(diff<0) return "À l'instant";
  if(diff<60) return "À l'instant";
  if(diff<3600) return "Il y a "+Math.floor(diff/60)+" min";
  if(diff<86400) return "Il y a "+Math.floor(diff/3600)+"h";
  if(diff<604800){ const d=Math.floor(diff/86400); return "Il y a "+d+" jour"+(d>1?"s":""); }
  return date.toLocaleDateString("fr-FR",{day:"numeric",month:"short"});
}
