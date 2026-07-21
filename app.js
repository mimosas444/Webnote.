// ═══════════════════════════════════════════
//  SE9SI.  — app.js  v3
//  Aligné sur tes règles Firestore réelles :
//   - users/{username}  (doc ID = pseudo, pas un uid)
//     create: auth != null && le doc n'existe pas encore (unicité atomique)
//     update: auth != null
//   - users/{username}/questions/{qid}
//     create: ouvert à tous (le lien public marche sans compte)
//     read/update/delete: auth != null
//   - announcements: read public, write si auth != null
//
//  Auth: email/password Firebase RÉELLE (email synthétique
//  pseudo@se9si.local, mot de passe = code à 6 chiffres). On n'utilise
//  PAS signInAnonymously (dépend d'un provider qui peut ne pas être
//  activé) — email/password est le mécanisme déjà prouvé fonctionnel.
// ═══════════════════════════════════════════

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword,
  signOut, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  getFirestore, doc, getDoc, setDoc, updateDoc, deleteDoc,
  collection, addDoc, getDocs, query, orderBy, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyASaooIcRrY2mwZiI3j5VwjHmmzY8XLIag",
  authDomain: "webnote-63e2b.firebaseapp.com",
  projectId: "webnote-63e2b",
  storageBucket: "webnote-63e2b.firebasestorage.app",
  messagingSenderId: "756128668649",
  appId: "1:756128668649:web:da1ac2ec48f661d1688978"
};

const ADMIN_USERNAMES = ["anonymous"];
const EMAIL_DOMAIN = "@se9si.local";

const fireApp = initializeApp(firebaseConfig);
const auth    = getAuth(fireApp);
const db      = getFirestore(fireApp);

let currentUser = null, currentUsername = "";
let isAdmin = false;
let allQuestions = [];
let currentFilter = "all";
let qrGenerated = false, qrVisible = false;
let bootHidden = false;

const urlParams  = new URLSearchParams(window.location.search);
const targetUser = urlParams.get("to") || urlParams.get("user");

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

function hideBoot(){
  if (bootHidden) return; bootHidden = true;
  const el = $("boot"); if (el) { el.classList.add("boot-hide"); setTimeout(()=>el.remove(),450); }
}
setTimeout(hideBoot, 5000);

const pages = {
  landing:$("page-landing"), auth:$("page-auth"), dashboard:$("page-dashboard"),
  feed:$("page-feed"), admin:$("page-admin"), ask:$("page-ask")
};
function showPage(name){
  Object.values(pages).forEach(p=>{ if(p){ p.style.display="none"; p.classList.remove("active"); } });
  const page = pages[name]; if(!page) return;
  page.style.display="flex"; void page.offsetWidth; page.classList.add("active");
  window.scrollTo(0,0);
  document.querySelectorAll(".nav-tab,.mob-btn").forEach(b=>b.classList.toggle("active", b.dataset.page===name));
}
document.querySelectorAll(".nav-tab,.mob-btn").forEach(btn=>{
  btn.addEventListener("click", ()=>{
    const t = btn.dataset.page;
    if(!currentUser) return;
    if(t==="admin" && !isAdmin) return;
    showPage(t);
    if(t==="dashboard") fetchQuestions();
    if(t==="feed") loadFeed();
    if(t==="admin") loadAdminFeed();
  });
});
$("landing-about-btn")?.addEventListener("click", ()=>{
  document.querySelector(".mock-window")?.scrollIntoView({behavior:"smooth"});
});

if (targetUser) {
  loadAskPage(targetUser).catch(e=>console.error("askPage:",e)).finally(hideBoot);
} else {
  onAuthStateChanged(auth, async (user) => {
    if (user) {
      currentUser = user;
      currentUsername = (user.email || "").split("@")[0];
      isAdmin = ADMIN_USERNAMES.includes(currentUsername.toLowerCase());
      await enterDashboard();
    } else {
      currentUser = null; currentUsername=""; isAdmin=false; allQuestions=[];
      $("nav-login-btn")?.classList.remove("hidden");
      $("nav-user")?.classList.add("hidden");
      $("nav-tabs").style.display="none";
      $("mobile-nav")?.classList.add("hidden");
      showPage("landing");
    }
    hideBoot();
  });
}

function openAuthPage(){
  $("auth-username").value="";
  clearPin();
  $("auth-error")?.classList.add("hidden");
  $("auth-mode-banner")?.classList.add("hidden");
  resetStatus();
  showPage("auth");
}
$("start-btn")?.addEventListener("click", openAuthPage);
$("login-btn-landing")?.addEventListener("click", openAuthPage);
$("nav-login-btn")?.addEventListener("click", openAuthPage);

const pinBoxes = Array.from(document.querySelectorAll(".pin-box"));
pinBoxes.forEach((box,i)=>{
  box.addEventListener("input", ()=>{
    box.value = box.value.replace(/[^0-9]/g,"").slice(0,1);
    if(box.value && pinBoxes[i+1]) pinBoxes[i+1].focus();
  });
  box.addEventListener("keydown", (e)=>{
    if(e.key==="Backspace" && !box.value && pinBoxes[i-1]) pinBoxes[i-1].focus();
  });
  box.addEventListener("paste", (e)=>{
    const txt=(e.clipboardData||window.clipboardData).getData("text").replace(/[^0-9]/g,"");
    if(!txt) return; e.preventDefault();
    txt.slice(0,pinBoxes.length).split("").forEach((c,j)=>{ if(pinBoxes[j]) pinBoxes[j].value=c; });
    (pinBoxes[Math.min(txt.length,pinBoxes.length-1)]||pinBoxes[pinBoxes.length-1]).focus();
  });
});
function getPin(){ return pinBoxes.map(b=>b.value).join(""); }
function clearPin(){ pinBoxes.forEach(b=>b.value=""); pinBoxes[0]?.focus(); }

// ── VÉRIF PSEUDO EN DIRECT (rend l'écran connexion/inscription plus clair) ──
let usernameCheckTimer=null, knownUsernameState=null; // null | "free" | "taken"
$("auth-username")?.addEventListener("input", ()=>{
  const status = $("auth-username-status");
  const banner = $("auth-mode-banner");
  const raw = $("auth-username").value.trim().toLowerCase();
  knownUsernameState = null;
  banner?.classList.add("hidden");
  clearTimeout(usernameCheckTimer);

  if(!raw){ resetStatus(); return; }
  if(raw.includes(" ")){ setStatus("Pas d'espace dans le pseudo.","err"); return; }
  if(raw.length<5){ setStatus("Min. 5 caractères, sans espace — lettres, chiffres, _ uniquement.",""); return; }
  if(!/^[a-z0-9_]+$/.test(raw)){ setStatus("Lettres, chiffres et _ uniquement.","err"); return; }

  setStatus("Vérification…","");
  usernameCheckTimer = setTimeout(async ()=>{
    try{
      const snap = await getDoc(doc(db,"users",raw));
      if(snap.exists()){
        knownUsernameState="taken";
        setStatus("👋 Ce pseudo existe déjà — entre ton code pour te connecter.","info");
        showBanner("login","👋 Connexion à un compte existant");
      } else {
        knownUsernameState="free";
        setStatus("✅ Pseudo disponible — un compte sera créé à la validation.","ok");
        showBanner("signup","✨ Création d'un nouveau compte");
      }
    }catch(e){
      console.error("check pseudo:",e);
      setStatus("Min. 5 caractères, sans espace — lettres, chiffres, _ uniquement.","");
    }
  }, 450);
});
function setStatus(msg,cls){
  const el=$("auth-username-status"); if(!el) return;
  el.textContent=msg; el.className="field-hint"+(cls?" "+cls:"");
}
function resetStatus(){ setStatus("Min. 5 caractères, sans espace — lettres, chiffres, _ uniquement.",""); }
function showBanner(kind,msg){
  const b=$("auth-mode-banner"); if(!b) return;
  b.textContent=msg; b.className="auth-mode-banner "+kind; b.classList.remove("hidden");
}

$("auth-submit")?.addEventListener("click", async ()=>{
  const username = $("auth-username").value.trim().toLowerCase();
  const pin = getPin();
  const err = $("auth-error"); err.classList.add("hidden");

  if(username.includes(" ")) return showErr(err,"Pas d'espace dans le pseudo.");
  if(username.length<5) return showErr(err,"Pseudo trop court (min. 5 caractères).");
  if(!/^[a-z0-9_]+$/.test(username)) return showErr(err,"Lettres, chiffres et _ uniquement.");
  if(pin.length!==6) return showErr(err,"Le code doit faire 6 chiffres.");

  const btn=$("auth-submit"); btn.disabled=true;
  btn.querySelector("span").textContent = knownUsernameState==="taken" ? "Connexion…" : "Création du compte…";
  const syntheticEmail = username + EMAIL_DOMAIN;

  try{
    const userRef = doc(db,"users",username);
    const userSnap = await getDoc(userRef);

    if (!userSnap.exists()){
      const cred = await createUserWithEmailAndPassword(auth, syntheticEmail, pin);
      await setDoc(userRef, { username, uid:cred.user.uid, createdAt:serverTimestamp() });
      await addDoc(collection(db,"users",username,"questions"), {
        name:"Se9si 👋",
        message:"Salut ! Tu recevras toutes tes questions ici. Bonne chance 🚨",
        opened:false, createdAt: serverTimestamp()
      });
      showToast("🎉 Compte créé !");
    } else {
      try{
        await signInWithEmailAndPassword(auth, syntheticEmail, pin);
        showToast("✅ Connecté !");
      }catch(e){
        btn.disabled=false; btn.querySelector("span").textContent="Continuer"; clearPin();
        return showErr(err, e.code==="auth/too-many-requests" ? "Trop de tentatives, réessaie plus tard." : "Pseudo ou code incorrect.");
      }
    }
  }catch(e){
    console.error(e);
    btn.disabled=false; btn.querySelector("span").textContent="Continuer";
    if(e.code==="auth/email-already-in-use") showErr(err,"Ce pseudo est déjà pris (réessaie de te connecter).");
    else if(e.code==="permission-denied") showErr(err,"Ce pseudo vient d'être pris par quelqu'un d'autre.");
    else showErr(err,"Erreur de connexion. Réessaie.");
  }
});

async function enterDashboard(){
  $("nav-login-btn")?.classList.add("hidden");
  $("nav-user")?.classList.remove("hidden");
  $("nav-tabs").style.display="flex";
  $("mobile-nav")?.classList.remove("hidden");
  document.querySelectorAll(".admin-only").forEach(el=>el.classList.toggle("hidden", !isAdmin));

  $("nav-avatar").textContent = currentUsername[0].toUpperCase();
  $("nav-uname").textContent = "@"+currentUsername;
  $("dash-avatar").textContent = currentUsername[0].toUpperCase();
  $("dash-username").textContent = currentUsername;

  const base = window.location.origin + window.location.pathname;
  const link = base + "?to=" + encodeURIComponent(currentUsername);
  $("share-link").textContent = link;

  wireDashboardActions(link);
  showPage("dashboard");
  const btn=$("auth-submit"); if(btn){ btn.disabled=false; btn.querySelector("span").textContent="Continuer"; }
  await fetchQuestions();
}

$("logout-btn")?.addEventListener("click", async ()=>{
  await signOut(auth);
  showPage("landing");
  showToast("👋 Déconnecté");
});

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
  replaceEl("qr-toggle", b=>b.addEventListener("click", toggleQR));
  replaceEl("qr-dl", b=>b.addEventListener("click", downloadQR));
  replaceEl("export-btn", b=>b.addEventListener("click", exportQuestions));
  replaceEl("refresh-btn", b=>b.addEventListener("click", async ()=>{
    b.style.transition="transform .5s"; b.style.transform="rotate(360deg)";
    setTimeout(()=>{b.style.transform="";b.style.transition="";},500);
    await fetchQuestions(); showToast("✅ Actualisé !");
  }));
  replaceEl("filter-all", b=>b.addEventListener("click", ()=>setFilter("all")));
  replaceEl("filter-unread", b=>b.addEventListener("click", ()=>setFilter("unread")));
  replaceEl("filter-starred", b=>b.addEventListener("click", ()=>setFilter("starred")));
  const si = $("search-input"); if(si) si.addEventListener("input", e=>renderQuestions(e.target.value.toLowerCase().trim()));
}

function toggleQR(){
  qrVisible=!qrVisible;
  $("qr-wrap")?.classList.toggle("hidden", !qrVisible);
  const b=$("qr-toggle");
  if(b) b.textContent = qrVisible ? "✕ Masquer le QR" : "📱 Afficher le QR Code";
  if(qrVisible) generateQR();
}
function generateQR(){
  if(qrGenerated) return;
  const c=$("qr-el"); if(!c) return; c.innerHTML="";
  const link = $("share-link").textContent;
  try{ new QRCode(c,{text:link,width:150,height:150,colorDark:"#171410",colorLight:"#ffffff",correctLevel:QRCode.CorrectLevel.M}); qrGenerated=true; }
  catch(e){ console.error("QR:",e); }
}
function downloadQR(){
  const canvas=$("qr-el")?.querySelector("canvas"), img=$("qr-el")?.querySelector("img");
  const src = canvas ? canvas.toDataURL("image/png") : img?.src;
  if(!src){ showToast("Ouvre le QR d'abord !"); return; }
  const a=document.createElement("a"); a.href=src; a.download="se9si-qrcode.png"; a.click();
  showToast("📱 QR téléchargé !");
}

function exportQuestions(){
  if(!allQuestions.length){ showToast("⚠️ Rien à exporter !"); return; }
  const sorted=[...allQuestions].sort((a,b)=>(a.createdAt?.toMillis()||0)-(b.createdAt?.toMillis()||0));
  const lines=["Se9si. — Questions anonymes","Exporté : "+new Date().toLocaleString("fr-FR"),"Total : "+sorted.length,"─".repeat(36),""];
  sorted.forEach((q,i)=>{
    lines.push("["+(i+1)+"] "+(q.name||"Anonyme")+" — "+(q.createdAt?q.createdAt.toDate().toLocaleString("fr-FR"):"—"));
    lines.push('"'+q.message+'"');
    if(q.reply) lines.push("→ "+q.reply);
    lines.push("");
  });
  const blob=new Blob([lines.join("\n")],{type:"text/plain;charset=utf-8"});
  const a=document.createElement("a"); a.href=URL.createObjectURL(blob); a.download="se9si-"+new Date().toISOString().slice(0,10)+".txt"; a.click(); URL.revokeObjectURL(a.href);
  showToast("📄 Export téléchargé !");
}

function setStatsLoading(loading){ document.querySelectorAll(".stat-card").forEach(c=>c.classList.toggle("is-loading", loading)); }
function setQLoading(loading){
  $("q-skeleton")?.classList.toggle("hidden", !loading);
  $("q-list")?.classList.toggle("hidden", loading);
}

async function fetchQuestions(){
  setStatsLoading(true); setQLoading(true);
  try{
    const snap = await getDocs(query(collection(db,"users",currentUsername,"questions"), orderBy("createdAt","desc")));
    allQuestions = snap.docs.map(d=>({id:d.id, ...d.data()}));
    updateStats(); buildChart(); renderQuestions();
  }catch(e){ console.error("fetchQuestions:",e); showToast("⚠️ Erreur de chargement."); }
  finally{ setStatsLoading(false); setQLoading(false); }
}

function setFilter(f){
  currentFilter=f;
  document.querySelectorAll(".pill").forEach(p=>p.classList.remove("active"));
  const map={all:"filter-all",unread:"filter-unread",starred:"filter-starred"};
  $(map[f])?.classList.add("active");
  renderQuestions();
}

function updateStats(){
  const now=new Date(), today=new Date(now.getFullYear(),now.getMonth(),now.getDate());
  const unread=allQuestions.filter(q=>!q.opened).length;
  animateCount($("stat-total"), allQuestions.length);
  animateCount($("stat-unread"), unread);
  animateCount($("stat-today"), allQuestions.filter(q=>q.createdAt && q.createdAt.toDate()>=today).length);
  const dc=$("dash-count");
  if(dc) dc.textContent = allQuestions.length===0 ? "Aucune question pour l'instant." : allQuestions.length+" question"+(allQuestions.length>1?"s":"")+" reçue"+(allQuestions.length>1?"s":"");
  ["dash-badge","dash-badge-mob"].forEach(id=>{
    const b=$(id); if(!b) return;
    b.textContent=unread; b.classList.toggle("hidden", unread===0);
  });
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
  const container=$("q-list"); if(!container) return;
  container.innerHTML="";
  let filtered=[...allQuestions];
  if(currentFilter==="unread") filtered=filtered.filter(q=>!q.opened);
  if(currentFilter==="starred") filtered=filtered.filter(q=>q.starred);
  if(searchTerm) filtered=filtered.filter(q=> (q.message||"").toLowerCase().includes(searchTerm) || (q.name||"").toLowerCase().includes(searchTerm));

  if(filtered.length===0){
    container.innerHTML='<div class="empty-state"><div class="empty-ico">📭</div><p>Aucune question ici.</p></div>';
    return;
  }

  filtered.forEach((q,i)=>{
    const card=document.createElement("div");
    card.className="q-card card fade-up"+(!q.opened?" unread":"");
    card.style.animationDelay=Math.min(i*0.04,0.4)+"s";
    const name = q.name || "Anonyme";
    const replyHtml = q.reply ? '<div class="q-reply"><span class="q-reply-lbl">Ta réponse</span>'+escHtml(q.reply)+'</div>' : "";
    card.innerHTML =
      '<div class="q-name"><span class="q-avatar-mini">'+escHtml(name[0]||"?")+'</span>'+escHtml(name)+'</div>'+
      '<div class="q-text">'+escHtml(q.message||"")+'</div>'+
      replyHtml+
      '<div class="q-foot">'+
        '<div class="q-time">'+(q.createdAt?formatDate(q.createdAt.toDate()):"À l'instant")+'</div>'+
        '<div class="q-actions">'+
          '<button class="q-star'+(q.starred?" starred":"")+'" data-act="star" title="Favori">'+(q.starred?"⭐":"☆")+'</button>'+
          '<button class="q-action" data-act="reply" title="Répondre"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z"/></svg></button>'+
          '<button class="q-action" data-act="share" title="Partager"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg></button>'+
          '<button class="q-action" data-act="copy" title="Copier"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></button>'+
          '<button class="q-action" data-act="delete" title="Supprimer"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0-1 14a2 2 0 01-2 2H7a2 2 0 01-2-2L4 6"/></svg></button>'+
        '</div>'+
      '</div>';

    if(!q.opened) card.addEventListener("click", ()=>markOpened(q.id), {once:true});

    card.querySelector('[data-act="star"]').addEventListener("click", async e=>{
      e.stopPropagation();
      const newVal = !q.starred; q.starred=newVal;
      try{ await updateDoc(doc(db,"users",currentUsername,"questions",q.id), {starred:newVal}); }catch(err){ console.error(err); }
      renderQuestions(searchTerm);
    });
    card.querySelector('[data-act="share"]').addEventListener("click", e=>{ e.stopPropagation(); openShareModal(q.message, ""); });
    card.querySelector('[data-act="copy"]').addEventListener("click", e=>{ e.stopPropagation(); navigator.clipboard.writeText(q.message).then(()=>showToast("📋 Copié !")); });
    card.querySelector('[data-act="reply"]').addEventListener("click", e=>{
      e.stopPropagation();
      if(card.querySelector(".q-reply-form")) { card.querySelector(".q-reply-form").remove(); return; }
      const form=document.createElement("div"); form.className="q-reply-form";
      form.innerHTML='<textarea placeholder="Écris ta réponse…">'+escHtml(q.reply||"")+'</textarea><button class="btn btn-primary" style="padding:9px 14px;font-size:.78rem"><span>OK</span></button>';
      form.querySelector("button").addEventListener("click", async ev=>{
        ev.stopPropagation();
        const val=form.querySelector("textarea").value.trim();
        try{ await updateDoc(doc(db,"users",currentUsername,"questions",q.id), {reply: val||null}); q.reply=val||null; renderQuestions(searchTerm); showToast("✅ Réponse enregistrée !"); }
        catch(err){ console.error(err); showToast("Erreur."); }
      });
      card.querySelector(".q-foot").insertAdjacentElement("beforebegin", form);
    });
    card.querySelector('[data-act="delete"]').addEventListener("click", async e=>{
      e.stopPropagation();
      if(!confirm("Supprimer cette question ?")) return;
      try{
        await deleteDoc(doc(db,"users",currentUsername,"questions",q.id));
        allQuestions = allQuestions.filter(x=>x.id!==q.id);
        updateStats(); buildChart(); renderQuestions(searchTerm);
        showToast("🗑️ Supprimée.");
      }catch(err){ console.error(err); showToast("Erreur."); }
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

async function loadFeed(){
  $("feed-skeleton")?.classList.remove("hidden");
  $("feed-list")?.classList.add("hidden");
  try{
    const snap = await getDocs(query(collection(db,"announcements"), orderBy("createdAt","desc")));
    const list = $("feed-list");
    if(snap.empty){ list.innerHTML='<div class="empty-state"><div class="empty-ico">📭</div><p>Aucune annonce pour l\'instant.</p></div>'; }
    else{
      list.innerHTML="";
      snap.forEach(d=>{
        const data=d.data();
        const date = data.createdAt ? data.createdAt.toDate().toLocaleDateString("fr-FR",{day:"numeric",month:"long"}) : "";
        const item=document.createElement("div"); item.className="ann-feed-item card fade-up";
        item.innerHTML = '<div class="ann-item-head"><div class="ann-item-title"><span class="ann-emoji">'+(data.emoji||"📢")+'</span>'+escHtml(data.title)+'</div><div class="ann-item-date">'+date+'</div></div><div style="font-size:.86rem;color:var(--ink-soft);line-height:1.6">'+escHtml(data.body)+'</div>';
        list.appendChild(item);
      });
    }
  }catch(e){ console.error(e); }
  finally{ $("feed-skeleton")?.classList.add("hidden"); $("feed-list")?.classList.remove("hidden"); }
}

replaceEl("ann-submit", btn=>btn?.addEventListener("click", async ()=>{
  const title=$("ann-title").value.trim(), body=$("ann-body").value.trim();
  if(!title||!body) return showToast("⚠️ Titre + message requis.");
  btn.disabled=true; btn.querySelector("span").textContent="Publication…";
  try{
    await addDoc(collection(db,"announcements"), {title, body, emoji:"📢", author:currentUsername, createdAt:serverTimestamp()});
    $("ann-title").value=""; $("ann-body").value="";
    showToast("📢 Publié !");
    loadAdminFeed();
  }catch(e){ console.error(e); showToast("Erreur."); }
  btn.disabled=false; btn.querySelector("span").textContent="Publier";
}));

async function loadAdminFeed(){
  const list=$("admin-ann-list"); if(!list) return;
  const snap = await getDocs(query(collection(db,"announcements"), orderBy("createdAt","desc")));
  list.innerHTML="";
  if(snap.empty){ list.innerHTML='<p style="color:var(--ink-faint);font-size:.82rem">Aucune annonce.</p>'; return; }
  snap.forEach(d=>{
    const data=d.data();
    const date = data.createdAt ? data.createdAt.toDate().toLocaleDateString("fr-FR") : "";
    const item=document.createElement("div"); item.className="ann-item card";
    item.innerHTML = '<div class="ann-item-head"><div><div class="ann-item-title">'+(data.emoji||"📢")+" "+escHtml(data.title)+'</div><div class="ann-item-date">'+date+'</div></div><button class="admin-del">🗑️</button></div>';
    item.querySelector(".admin-del").addEventListener("click", async ()=>{
      if(!confirm("Supprimer ?")) return;
      await deleteDoc(doc(db,"announcements",d.id));
      showToast("🗑️ Supprimé."); loadAdminFeed();
    });
    list.appendChild(item);
  });
}

async function loadAskPage(username){
  showPage("ask");
  $("nav-login-btn")?.classList.remove("hidden");
  const uname = (username||"").trim().toLowerCase();

  if(!uname){
    $("ask-username").textContent="lien invalide";
    if($("ask-submit")) $("ask-submit").disabled=true;
    return;
  }

  // On affiche tout de suite le pseudo depuis l'URL — n'attend pas Firestore,
  // donc la page ne reste jamais bloquée sur "…" même si la lecture échoue.
  $("ask-username").textContent = "@"+uname;
  $("ask-avatar").textContent = uname[0].toUpperCase();

  // Vérif d'existence best-effort, juste pour prévenir en cas de faute de frappe.
  // Ne bloque JAMAIS l'envoi : la sous-collection questions accepte l'écriture
  // même si ce lookup échoue ou est lent (cf. tes rules : create est ouvert).
  getDoc(doc(db,"users",uname)).then(snap=>{
    if(!snap.exists()) showToast("⚠️ Pseudo introuvable pour l'instant — vérifie le lien avant d'envoyer.");
  }).catch(e=>console.error("lookup pseudo:",e));

  $("ask-question")?.addEventListener("input", ()=>{ $("ask-charcount").textContent = $("ask-question").value.length; });

  $("ask-submit")?.addEventListener("click", async ()=>{
    const name = $("ask-name").value.trim();
    const question = $("ask-question").value.trim();
    $("ask-error")?.classList.add("hidden");
    if(!question || question.length<2) return showErr($("ask-error"),"Ta question est trop courte.");

    const btn=$("ask-submit"); btn.disabled=true; btn.querySelector("span").textContent="Envoi…";
    try{
      await addDoc(collection(db,"users",uname,"questions"), {
        name: name || "Anonyme", message: question,
        opened:false, createdAt: serverTimestamp()
      });
      $("ask-form")?.classList.add("hidden");
      $("ask-success")?.classList.remove("hidden");
    }catch(e){
      console.error("envoi question:",e);
      btn.disabled=false; btn.querySelector("span").textContent="Envoyer anonymement 🤍";
      showErr($("ask-error"),"Erreur d'envoi. Vérifie ta connexion et réessaie.");
    }
  });
}

let shrBlob=null;

function openShareModal(text, link){
  shrBlob=null;
  $("shr-overlay")?.classList.remove("hidden");
  $("shr-loader")?.classList.remove("hidden");
  setTimeout(()=>{
    drawShareCard(text, link, $("shr-canvas"), blob=>{ shrBlob=blob; $("shr-loader")?.classList.add("hidden"); });
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
  const bgCol = dark ? "#14120E" : "#FAF5EC";
  const inkCol = dark ? "#F5F0E6" : "#171410";
  const accentCol = "#FF5A36";

  ctx.fillStyle=bgCol; ctx.fillRect(0,0,W,H);
  ctx.fillStyle = dark ? "rgba(245,240,230,.05)" : "rgba(23,20,16,.06)";
  for(let y=40;y<H;y+=34){ for(let x=40;x<W;x+=34){ ctx.beginPath(); ctx.arc(x,y,2,0,Math.PI*2); ctx.fill(); } }

  const pad=64, cx=pad, cy=pad*2.2, cw=W-pad*2, ch=H-pad*4.6, r=40;
  ctx.fillStyle = dark ? "#211E18" : "#FFFFFF";
  rrect(ctx,cx,cy,cw,ch,r); ctx.fill();
  ctx.lineWidth=6; ctx.strokeStyle=inkCol; rrect(ctx,cx,cy,cw,ch,r); ctx.stroke();
  ctx.save(); ctx.globalCompositeOperation="destination-over";
  ctx.fillStyle=accentCol; rrect(ctx,cx+14,cy+14,cw,ch,r); ctx.fill();
  ctx.restore();

  ctx.fillStyle=accentCol; rrect(ctx,cx+50,cy+56,64,64,16); ctx.fill();
  ctx.lineWidth=4; ctx.strokeStyle=inkCol; rrect(ctx,cx+50,cy+56,64,64,16); ctx.stroke();
  ctx.font="700 34px 'Space Grotesk',Arial,sans-serif"; ctx.fillStyle=inkCol; ctx.textBaseline="middle";
  ctx.fillText("🔒",cx+70,cy+90);
  ctx.font="700 46px 'Space Grotesk',Arial,sans-serif"; ctx.fillText("se9si.",cx+132,cy+92);

  ctx.font="bold 180px Georgia,serif"; ctx.fillStyle=accentCol; ctx.globalAlpha=.25;
  ctx.textBaseline="top"; ctx.fillText("\u201C",cx+40,cy+150); ctx.globalAlpha=1;

  ctx.font="600 50px Arial,sans-serif"; ctx.fillStyle=inkCol; ctx.textBaseline="top";
  const msgX=cx+56, msgY=cy+300, msgW=cw-112, lineH=72;
  const lines=wrapText(ctx, text, msgW);
  const maxL=Math.floor((ch-460)/lineH);
  let show=lines.slice(0,maxL);
  if(lines.length>maxL && show.length>0){
    let last=show[show.length-1];
    while(ctx.measureText(last+"…").width>msgW && last.length>0) last=last.slice(0,-1);
    show[show.length-1]=last+"…";
  }
  show.forEach((line,i)=>ctx.fillText(line,msgX,msgY+i*lineH));

  const divY=cy+ch-180;
  ctx.strokeStyle = dark ? "rgba(245,240,230,.18)" : "rgba(23,20,16,.14)";
  ctx.lineWidth=2;
  ctx.beginPath(); ctx.moveTo(cx+56,divY); ctx.lineTo(cx+cw-56,divY); ctx.stroke();

  const fy=divY+40;
  ctx.font="800 26px Arial,sans-serif"; ctx.fillStyle=accentCol; ctx.textBaseline="top";
  ctx.fillText("QUESTION ANONYME",cx+56,fy);
  ctx.font="600 24px Arial,sans-serif"; ctx.fillStyle = dark ? "rgba(245,240,230,.55)" : "rgba(23,20,16,.5)";
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
$("shr-dl")?.addEventListener("click", async ()=>{
  const blob=await getBlob(); if(!blob){ showToast("⚠️ Patiente encore !"); return; }
  const url=URL.createObjectURL(blob);
  const a=document.createElement("a"); a.href=url; a.download="se9si-question.jpg"; a.click();
  setTimeout(()=>URL.revokeObjectURL(url),2000);
  showToast("✅ Image enregistrée !");
});
$("shr-copy")?.addEventListener("click", async ()=>{
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

function showToast(msg,duration=2600){
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
  if(diff<60) return "À l'instant";
  if(diff<3600) return "Il y a "+Math.floor(diff/60)+" min";
  if(diff<86400) return "Il y a "+Math.floor(diff/3600)+"h";
  if(diff<604800){ const d=Math.floor(diff/86400); return "Il y a "+d+" jour"+(d>1?"s":""); }
  return date.toLocaleDateString("fr-FR",{day:"numeric",month:"short"});
}
