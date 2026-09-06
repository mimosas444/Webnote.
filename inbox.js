// ═══════════════════════════════════════════
//  WEBNOTE — inbox.js  (messages reçus / communauté / admin)  v6
// ═══════════════════════════════════════════
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  getFirestore, doc, setDoc, getDoc, addDoc, updateDoc, deleteDoc,
  collection, query, where, orderBy, getDocs, serverTimestamp, arrayUnion, arrayRemove
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyASaooIcRrY2mwZiI3j5VwjHmmzY8XLIag",
  authDomain: "webnote-63e2b.firebaseapp.com",
  projectId: "webnote-63e2b",
  storageBucket: "webnote-63e2b.firebasestorage.app",
  messagingSenderId: "756128668649",
  appId: "1:756128668649:web:da1ac2ec48f661d1688978"
};
const ADMIN_EMAIL = "kennysauvegardej3@gmail.com";

const fireApp = initializeApp(firebaseConfig);
const auth = getAuth(fireApp);
const db = getFirestore(fireApp);
const DEVICE_TZ = Intl.DateTimeFormat().resolvedOptions().timeZone;
function $(id){ return document.getElementById(id); }

let currentUser=null, currentUsername="", currentShareLink="", allMessages=[], currentFilter="all", isGridView=true, qrGenerated=false, qrVisible=false, isAdmin=false, selectedEmoji="📢";

const savedTheme = localStorage.getItem("wn-theme") || "light";
document.documentElement.setAttribute("data-theme", savedTheme);
updateThemeIcon(savedTheme);
$("themeToggle")?.addEventListener("click", () => {
  const next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", next);
  localStorage.setItem("wn-theme", next);
  updateThemeIcon(next);
  if (qrVisible) { qrGenerated = false; generateQR(); }
});
function updateThemeIcon(t){ const ico=$("theme-ico"); if(ico) ico.textContent = t==="dark"?"☀️":"🌙"; }

function hideBootSplash(){ const el=$("boot-splash"); if(!el||el.classList.contains("hide"))return; el.classList.add("hide"); setTimeout(()=>el.remove(),450); }

const pages = { dashboard: $("page-dashboard"), community: $("page-community"), admin: $("page-admin") };
function showPage(name){
  Object.values(pages).forEach(p=>{ if(p){ p.style.display="none"; p.classList.remove("active"); } });
  const page = pages[name]; if(!page) return;
  page.style.display="block"; void page.offsetWidth; page.classList.add("active");
  document.querySelectorAll(".nav-tab").forEach(b=>b.classList.toggle("active", b.dataset.page===name));
  if (name==="community") loadCommunity();
  if (name==="admin") loadAdminPanel();
}
document.querySelectorAll(".nav-tab").forEach(btn=>{
  btn.addEventListener("click", ()=>{
    const t = btn.dataset.page;
    if (t==="admin" && !isAdmin) return;
    showPage(t);
  });
});

onAuthStateChanged(auth, async (user) => {
  if (!user) { window.location.href = "index.html"; return; }
  currentUser = user;
  isAdmin = user.email === ADMIN_EMAIL;
  document.querySelectorAll(".admin-only").forEach(el => el.classList.toggle("hidden", !isAdmin));

  const userDoc = await getDoc(doc(db,"users",user.uid));
  currentUsername = userDoc.exists() ? userDoc.data().username : (user.email?.split("@")[0] || "user");
  $("nav-username").textContent = `@${currentUsername}`;
  $("nav-avatar-letter").textContent = currentUsername[0].toUpperCase();
  $("dash-username-title").textContent = currentUsername;
  $("dash-avatar").textContent = currentUsername[0].toUpperCase();

  showPage("dashboard");
  hideBootSplash();
  await loadDashboard();
});

$("nav-logout-btn")?.addEventListener("click", () => signOut(auth));
$("back-to-chat")?.addEventListener("click", () => window.location.href = "dashboard.html");

function setDashboardLoading(loading){ $("dash-skeleton")?.classList.toggle("hidden", !loading); $("dash-content")?.classList.toggle("hidden", loading); }

async function loadDashboard(){
  setDashboardLoading(true);
  const base = window.location.origin + window.location.pathname.replace(/inbox\.html$/, "index.html");
  currentShareLink = `${base}?user=${encodeURIComponent(currentUsername)}`;
  if ($("share-link")) $("share-link").textContent = currentShareLink;

  $("copy-link-btn")?.addEventListener("click", () => navigator.clipboard.writeText(currentShareLink).then(()=>showToast("Lien copié !")));
  $("share-wa")?.addEventListener("click", () => window.open(`https://wa.me/?text=${encodeURIComponent(`Envoie-moi un message anonyme 👀\n${currentShareLink}`)}`,"_blank"));
  $("share-tw")?.addEventListener("click", () => window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(`Envoie-moi un message anonyme 👀 ${currentShareLink}`)}`,"_blank"));
  $("share-ig")?.addEventListener("click", () => navigator.clipboard.writeText(currentShareLink).then(()=>showToast("Copié ! Colle-le dans ta bio Insta")));
  $("qr-toggle-btn")?.addEventListener("click", toggleQR);
  $("qr-dl-btn")?.addEventListener("click", downloadQR);
  $("refresh-btn")?.addEventListener("click", async (e) => {
    const b = e.currentTarget; b.classList.add("loading"); b.disabled = true;
    await fetchMessages();
    b.classList.remove("loading"); b.disabled = false;
    showToast("Actualisé !");
  });
  $("export-btn")?.addEventListener("click", exportMessages);
  ["all","today","week","unread"].forEach(f => $(`filter-${f}`)?.addEventListener("click", () => setFilter(f)));
  $("view-grid")?.addEventListener("click", () => setView(true));
  $("view-list")?.addEventListener("click", () => setView(false));
  $("search-input")?.addEventListener("input", e => renderMessages(e.target.value.toLowerCase().trim()));

  await fetchMessages();
  setDashboardLoading(false);
}

function toggleQR(){
  qrVisible = !qrVisible;
  $("qr-wrap")?.classList.toggle("hidden", !qrVisible);
  const b = $("qr-toggle-btn");
  if (b) b.innerHTML = qrVisible
    ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg> Masquer le QR Code`
    : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg> Afficher le QR Code`;
  if (qrVisible) generateQR();
}
function generateQR(){
  if (qrGenerated || !currentShareLink) return;
  const c = $("qr-code-el"); if (!c) return; c.innerHTML = "";
  try { new QRCode(c, { text: currentShareLink, width:160, height:160, colorDark:"#000000", colorLight:"#ffffff", correctLevel: QRCode.CorrectLevel.M }); qrGenerated = true; }
  catch(e){ console.error("QR:", e); }
}
function downloadQR(){
  const canvas = $("qr-code-el")?.querySelector("canvas"); const img = $("qr-code-el")?.querySelector("img");
  const src = canvas ? canvas.toDataURL("image/png") : img?.src;
  if (!src) return showToast("Génère le QR d'abord !");
  const a = document.createElement("a"); a.href = src; a.download = "webnote-qrcode.png"; a.click();
  showToast("QR Code téléchargé !");
}

async function fetchMessages(){
  try {
    const q = query(collection(db,"messages"), where("recipientId","==",currentUser.uid), orderBy("createdAt","desc"));
    const snap = await getDocs(q);
    allMessages = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    updateStats(); buildChart(); renderMessages();
  } catch(e){ console.error("fetchMessages:", e); }
}
function setFilter(f){ currentFilter = f; document.querySelectorAll(".pill").forEach(p=>p.classList.remove("active")); $(`filter-${f}`)?.classList.add("active"); renderMessages(); }
function setView(grid){ isGridView = grid; $("view-grid")?.classList.toggle("active",grid); $("view-list")?.classList.toggle("active",!grid); $("messages-container")?.classList.toggle("list-view",!grid); }

function updateStats(){
  const now = new Date(); const today = new Date(now.getFullYear(),now.getMonth(),now.getDate());
  const week = new Date(today); week.setDate(today.getDate()-7);
  animateCount($("stat-total"), allMessages.length);
  animateCount($("stat-today"), allMessages.filter(m=>m.createdAt && m.createdAt.toDate()>=today).length);
  animateCount($("stat-week"), allMessages.filter(m=>m.createdAt && m.createdAt.toDate()>=week).length);
  const dc = $("dash-count");
  if (dc) dc.textContent = allMessages.length===0 ? "Aucun message pour l'instant." : `${allMessages.length} message${allMessages.length>1?"s":""} reçu${allMessages.length>1?"s":""}`;
}
function animateCount(el, target){ if(!el) return; let cur=0; const step=Math.ceil(target/20)||1; const t=setInterval(()=>{ cur=Math.min(cur+step,target); el.textContent=cur; if(cur>=target) clearInterval(t); },40); }

function buildChart(){
  const chart = $("act-chart"); if(!chart) return;
  const days = [];
  for(let i=6;i>=0;i--){ const d=new Date(); d.setDate(d.getDate()-i); days.push({key:d.toDateString(), lbl:d.toLocaleDateString("fr-FR",{weekday:"short",timeZone:DEVICE_TZ}).slice(0,3), count:0}); }
  allMessages.forEach(m=>{ if(!m.createdAt) return; const day=days.find(d=>d.key===m.createdAt.toDate().toDateString()); if(day) day.count++; });
  const total = days.reduce((a,d)=>a+d.count,0);
  const at = $("act-total"); if(at) at.textContent = total;
  const max = Math.max(...days.map(d=>d.count),1);
  chart.innerHTML = "";
  days.forEach(d=>{
    const col = document.createElement("div"); col.className="bar-col";
    const bar = document.createElement("div"); bar.className="bar"+(d.count===0?" empty":"");
    bar.style.height="0%"; setTimeout(()=>{ bar.style.height=(d.count===0?5:Math.max(Math.round(d.count/max*100),8))+"%"; },80);
    const lbl = document.createElement("div"); lbl.className="bar-day"; lbl.textContent=d.lbl;
    col.appendChild(bar); col.appendChild(lbl); chart.appendChild(col);
  });
}

const ICO_CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
const ICO_SPARK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M18.4 5.6l-2.8 2.8M8.4 15.6l-2.8 2.8"/></svg>';
const ICO_CLOCK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15.5 14"/></svg>';
const ICO_REPLY = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/></svg>';

function linkify(str){
  return escHtml(str).replace(/(https?:\/\/[^\s<]+)/g, url => `<a href="${url}" target="_blank" rel="noopener noreferrer" class="msg-link">${url}</a>`);
}

function renderMessages(searchTerm=""){
  const container = $("messages-container"); if(!container) return;
  container.innerHTML = "";
  const now = new Date(), today = new Date(now.getFullYear(),now.getMonth(),now.getDate());
  const week = new Date(today); week.setDate(today.getDate()-7);
  const cutoff24 = new Date(now - 86400000);
  let filtered = [...allMessages];
  if (currentFilter==="today") filtered = filtered.filter(m=>m.createdAt && m.createdAt.toDate()>=today);
  if (currentFilter==="week") filtered = filtered.filter(m=>m.createdAt && m.createdAt.toDate()>=week);
  if (currentFilter==="unread") filtered = filtered.filter(m=>m.createdAt && m.createdAt.toDate()>=cutoff24);
  if (searchTerm) filtered = filtered.filter(m=>m.message?.toLowerCase().includes(searchTerm));
  if (filtered.length===0){ const emp=$("empty-state"); if(emp){ emp.classList.remove("hidden"); container.appendChild(emp); } return; }

  filtered.forEach((msg,i)=>{
    const card = document.createElement("div"); card.className="msg-card"; card.style.animationDelay=`${i*0.04}s`;
    const isNew = msg.createdAt && msg.createdAt.toDate()>=cutoff24;
    const badges = `${isNew?`<span class="msg-badge new">${ICO_SPARK}Nouveau</span>`:""}${msg.approved?`<span class="msg-badge approved">${ICO_CHECK}Approuvé</span>`:""}`;
    const replyHtml = msg.adminReply ? `<div class="msg-reply"><span class="msg-reply-lbl">${ICO_REPLY}Réponse de l'équipe</span>${linkify(msg.adminReply)}</div>` : "";
    card.innerHTML = `
      <div class="msg-header">${badges}</div>
      <div class="msg-text">${linkify(msg.message)}</div>
      ${replyHtml}
      <div class="msg-footer">
        <div class="msg-time">${ICO_CLOCK}${msg.createdAt ? formatDate(msg.createdAt.toDate()) : "À l'instant"}</div>
        <div class="msg-actions-row">
          <button class="msg-action-btn msg-share-btn" title="Partager"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg></button>
          <button class="msg-action-btn msg-copy-btn" title="Copier"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></button>
        </div>
      </div>`;
    card.querySelector(".msg-share-btn").addEventListener("click", () => openShareModal(msg.message));
    card.querySelector(".msg-copy-btn").addEventListener("click", () => navigator.clipboard.writeText(msg.message).then(()=>showToast("Message copié !")));
    container.appendChild(card);
  });
}

function exportMessages(){
  if (!allMessages.length) { showToast("Aucun message à exporter !"); return; }
  const sorted = [...allMessages].sort((a,b)=>(a.createdAt?.toMillis()||0)-(b.createdAt?.toMillis()||0));
  const lines = ["Webnote — Messages anonymes",`Exporté : ${new Date().toLocaleString("fr-FR",{timeZone:DEVICE_TZ})}`,`Total : ${sorted.length} message(s)`,"─".repeat(36),""];
  sorted.forEach((m,i)=>{ lines.push(`[${i+1}] ${m.createdAt?m.createdAt.toDate().toLocaleString("fr-FR",{timeZone:DEVICE_TZ}):"—"}`); lines.push(`"${m.message}"`); if(m.adminReply) lines.push(`→ Réponse : ${m.adminReply}`); lines.push(""); });
  const blob = new Blob([lines.join("\n")], { type:"text/plain;charset=utf-8" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `webnote-${new Date().toISOString().slice(0,10)}.txt`; a.click(); URL.revokeObjectURL(a.href);
  showToast("Export téléchargé !");
}

// ── COMMUNITY ──
async function loadCommunity(){ await Promise.all([loadAnnouncements(), loadPolls(), loadFeatureRequests()]); }

async function loadAnnouncements(){
  const list = $("announcements-list"); if(!list) return;
  try {
    const snap = await getDocs(query(collection(db,"announcements"), orderBy("createdAt","desc")));
    if (snap.empty) { list.innerHTML = `<div class="empty-state"><div class="empty-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11l18-5v14L3 15v-4z"/><path d="M6 15v4a2 2 0 0 0 2 2h1v-6"/></svg></div><p>Aucun communiqué pour l'instant.</p></div>`; return; }
    list.innerHTML = "";
    snap.forEach(d=>{
      const data = d.data();
      const card = document.createElement("div"); card.className="ann-card";
      const date = data.createdAt ? data.createdAt.toDate().toLocaleDateString("fr-FR",{day:"numeric",month:"long",year:"numeric",timeZone:DEVICE_TZ}) : "";
      card.innerHTML = `<div class="ann-header"><div class="ann-emoji">${data.emoji||"📢"}</div><div><div class="ann-title">${escHtml(data.title)}</div><div class="ann-date">${date}</div></div></div><div class="ann-body">${linkify(data.body)}</div>`;
      list.appendChild(card);
    });
  } catch(e){ console.error(e); }
}

async function loadPolls(){
  const list = $("polls-list"); if(!list) return;
  try {
    const snap = await getDocs(query(collection(db,"polls"), where("active","==",true), orderBy("createdAt","desc")));
    if (snap.empty) { list.innerHTML = `<div class="empty-state"><div class="empty-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18M7 15v3M12 10v8M17 6v12"/></svg></div><p>Aucun sondage actif.</p></div>`; return; }
    list.innerHTML = "";
    snap.forEach(d=>list.appendChild(buildPollCard(d.id, d.data())));
  } catch(e){ console.error(e); }
}
function buildPollCard(pollId, data){
  const card = document.createElement("div"); card.className="poll-card";
  const voters = data.voters || [];
  const hasVoted = currentUser && voters.includes(currentUser.uid);
  const totalVotes = (data.options||[]).reduce((a,o)=>a+(o.votes||0),0);
  let optionsHtml = "";
  (data.options||[]).forEach((opt,i)=>{
    const pct = totalVotes>0 ? Math.round((opt.votes||0)/totalVotes*100) : 0;
    optionsHtml += `<div class="poll-option ${hasVoted?"voted":""}" data-idx="${i}"><div class="poll-bar" style="width:${hasVoted?pct:0}%"></div><div class="poll-option-inner"><span class="poll-option-text">${escHtml(opt.text)}</span>${hasVoted?`<span class="poll-option-pct">${pct}%</span>`:""}</div></div>`;
  });
  card.innerHTML = `<div class="poll-question">${escHtml(data.question)}</div><div class="poll-options">${optionsHtml}</div><div class="poll-total">${totalVotes} vote${totalVotes!==1?"s":""}${hasVoted?" · Tu as voté":""}</div>`;
  if (!hasVoted && currentUser) card.querySelectorAll(".poll-option").forEach(opt=>opt.addEventListener("click",()=>votePoll(pollId, parseInt(opt.dataset.idx))));
  return card;
}
async function votePoll(pollId, idx){
  if (!currentUser) return showToast("Connecte-toi pour voter !");
  try {
    const ref = doc(db,"polls",pollId); const snap = await getDoc(ref); const current = snap.data();
    if (current.voters?.includes(currentUser.uid)) return showToast("Tu as déjà voté !");
    const options = [...(current.options||[])];
    options[idx] = { ...options[idx], votes: (options[idx].votes||0)+1 };
    await updateDoc(ref, { options, voters: arrayUnion(currentUser.uid) });
    showToast("Vote enregistré !"); loadPolls();
  } catch(e){ console.error(e); showToast("Erreur lors du vote."); }
}

async function loadFeatureRequests(){
  const list = $("features-list"); if(!list) return;
  try {
    const snap = await getDocs(query(collection(db,"features"), orderBy("votes","desc")));
    list.innerHTML = "";
    if (snap.empty) { list.innerHTML = `<div class="empty-state" style="padding:26px 0"><div class="empty-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7c.5.4.8 1 .8 1.6v.7h6.4v-.7c0-.6.3-1.2.8-1.6A7 7 0 0 0 12 2z"/></svg></div><p>Sois le premier à proposer !</p></div>`; return; }
    snap.forEach(d=>{
      const data = d.data();
      const hasVoted = currentUser && (data.voters||[]).includes(currentUser.uid);
      const item = document.createElement("div"); item.className="feature-item";
      const badgesHtml = data.approved ? `<span class="feature-badge approved">${ICO_CHECK}Approuvé</span>` : '<span class="feature-badge pending">En attente</span>';
      const replyHtml = data.adminReply ? `<div class="feature-reply"><span class="feature-reply-lbl">${ICO_REPLY}Réponse Webnote</span>${linkify(data.adminReply)}</div>` : "";
      item.innerHTML = `<div class="feature-votes"><button class="vote-btn ${hasVoted?"voted":""}">▲</button><div class="vote-count">${data.votes||0}</div></div><div class="feature-info"><div class="feature-text">${escHtml(data.text)}</div><div class="feature-meta">${data.createdAt?formatDate(data.createdAt.toDate()):""}</div><div class="feature-badges">${badgesHtml}</div>${replyHtml}</div>`;
      item.querySelector(".vote-btn").addEventListener("click", ()=>voteFeature(d.id, hasVoted, data.votes||0));
      list.appendChild(item);
    });
  } catch(e){ console.error(e); }
}
$("feature-submit-btn")?.addEventListener("click", async () => {
  const inp = $("feature-input"); if(!inp) return;
  const text = inp.value.trim();
  if (!text || text.length<5) return showToast("Trop court !");
  if (!currentUser) return showToast("Connecte-toi d'abord !");
  const btn = $("feature-submit-btn");
  btn.querySelector("span").textContent="Envoi…"; btn.disabled=true;
  try { await addDoc(collection(db,"features"), { text, votes:0, voters:[], approved:false, adminReply:null, authorId:currentUser.uid, createdAt:serverTimestamp() }); inp.value=""; showToast("Suggestion envoyée !"); loadFeatureRequests(); }
  catch(e){ showToast("Erreur. Réessaie."); }
  btn.querySelector("span").textContent="Proposer"; btn.disabled=false;
});
async function voteFeature(featureId, hasVoted, currentVotes){
  if (!currentUser) return showToast("Connecte-toi pour voter !");
  try {
    const ref = doc(db,"features",featureId);
    const newVotes = hasVoted ? Math.max(0,currentVotes-1) : currentVotes+1;
    if (hasVoted) await updateDoc(ref, { votes:newVotes, voters:arrayRemove(currentUser.uid) });
    else await updateDoc(ref, { votes:newVotes, voters:arrayUnion(currentUser.uid) });
    loadFeatureRequests();
  } catch(e){ console.error(e); }
}

// ── ADMIN PANEL ──
async function loadAdminPanel(){
  if (!isAdmin) return;
  await Promise.all([loadAdminAnnouncements(), loadAdminPolls(), loadAdminFeedback()]);
  document.querySelectorAll(".admin-tab").forEach(tab=>{
    tab.onclick = () => {
      document.querySelectorAll(".admin-tab").forEach(t=>t.classList.remove("active"));
      document.querySelectorAll(".admin-panel").forEach(p=>p.classList.remove("active"));
      tab.classList.add("active");
      $(`atab-${tab.dataset.atab}`)?.classList.add("active");
    };
  });
  document.querySelectorAll(".emoji-opt").forEach(opt=>{
    opt.onclick = () => { document.querySelectorAll(".emoji-opt").forEach(o=>o.classList.remove("active")); opt.classList.add("active"); selectedEmoji = opt.dataset.emoji; };
  });
  $("ann-submit").onclick = async () => {
    const title = $("ann-title").value.trim(), body = $("ann-body").value.trim();
    if (!title || !body) return showToast("Titre et message requis !");
    const btn = $("ann-submit"); btn.querySelector("span").textContent="Publication…"; btn.disabled=true;
    try { await addDoc(collection(db,"announcements"), { title, body, emoji:selectedEmoji, authorId:currentUser.uid, createdAt:serverTimestamp() }); $("ann-title").value=""; $("ann-body").value=""; showToast("Communiqué publié !"); loadAdminAnnouncements(); }
    catch(e){ showToast("Erreur."); }
    btn.querySelector("span").textContent="Publier le communiqué"; btn.disabled=false;
  };
  $("poll-submit").onclick = async () => {
    const question = $("poll-question").value.trim();
    const rawOptions = $("poll-options").value.trim().split("\n").map(s=>s.trim()).filter(Boolean);
    if (!question || rawOptions.length<2) return showToast("Question + min. 2 options !");
    const btn = $("poll-submit"); btn.querySelector("span").textContent="Création…"; btn.disabled=true;
    try { await addDoc(collection(db,"polls"), { question, options: rawOptions.map(text=>({text,votes:0})), voters:[], active:true, authorId:currentUser.uid, createdAt:serverTimestamp() }); $("poll-question").value=""; $("poll-options").value=""; showToast("Sondage créé !"); loadAdminPolls(); }
    catch(e){ showToast("Erreur."); }
    btn.querySelector("span").textContent="Créer le sondage"; btn.disabled=false;
  };
}
async function loadAdminAnnouncements(){
  const list = $("admin-announcements-list"); if(!list) return;
  const snap = await getDocs(query(collection(db,"announcements"), orderBy("createdAt","desc")));
  list.innerHTML = "";
  if (snap.empty) { list.innerHTML = '<p style="color:var(--tx3);font-size:.8rem;padding:10px 0">Aucun communiqué.</p>'; return; }
  snap.forEach(d=>{
    const data = d.data();
    const item = document.createElement("div"); item.className="admin-item";
    const date = data.createdAt ? data.createdAt.toDate().toLocaleDateString("fr-FR",{timeZone:DEVICE_TZ}) : "";
    item.innerHTML = `<div class="admin-item-header"><div><div class="admin-item-text">${data.emoji||"📢"} ${escHtml(data.title)}</div><div class="admin-item-meta">${date}</div></div></div><div class="admin-item-actions"><button class="admin-action delete">Supprimer</button></div>`;
    item.querySelector(".delete").onclick = async () => { if(!confirm("Supprimer ?")) return; await deleteDoc(doc(db,"announcements",d.id)); showToast("Supprimé."); loadAdminAnnouncements(); };
    list.appendChild(item);
  });
}
async function loadAdminPolls(){
  const list = $("admin-polls-list"); if(!list) return;
  const snap = await getDocs(query(collection(db,"polls"), orderBy("createdAt","desc")));
  list.innerHTML = "";
  if (snap.empty) { list.innerHTML = '<p style="color:var(--tx3);font-size:.8rem;padding:10px 0">Aucun sondage.</p>'; return; }
  snap.forEach(d=>{
    const data = d.data();
    const total = (data.options||[]).reduce((a,o)=>a+(o.votes||0),0);
    const date = data.createdAt ? data.createdAt.toDate().toLocaleDateString("fr-FR",{timeZone:DEVICE_TZ}) : "";
    const item = document.createElement("div"); item.className="admin-item";
    item.innerHTML = `<div class="admin-item-header"><div><div class="admin-item-text">${escHtml(data.question)}</div><div class="admin-item-meta">${total} vote(s) · ${date} · ${data.active?"Actif":"Inactif"}</div></div></div><div class="admin-item-actions"><button class="admin-action approve">${data.active?"Désactiver":"Activer"}</button><button class="admin-action delete">Supprimer</button></div>`;
    item.querySelector(".approve").onclick = async () => { await updateDoc(doc(db,"polls",d.id), { active: !data.active }); showToast(data.active?"Sondage désactivé.":"Sondage activé !"); loadAdminPolls(); };
    item.querySelector(".delete").onclick = async () => { if(!confirm("Supprimer ?")) return; await deleteDoc(doc(db,"polls",d.id)); showToast("Supprimé."); loadAdminPolls(); };
    list.appendChild(item);
  });
}
async function loadAdminFeedback(){
  const list = $("admin-feedback-list"); if(!list) return;
  const snap = await getDocs(query(collection(db,"features"), orderBy("votes","desc")));
  list.innerHTML = "";
  const pending = snap.docs.filter(d=>!d.data().approved).length;
  const badge = $("feedback-count"); if(badge) badge.textContent = pending;
  const navBadge = $("admin-badge"); if(navBadge){ navBadge.textContent = pending; navBadge.style.display = pending>0?"":"none"; }
  if (snap.empty) { list.innerHTML = `<div class="empty-state" style="padding:26px 0"><div class="empty-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7c.5.4.8 1 .8 1.6v.7h6.4v-.7c0-.6.3-1.2.8-1.6A7 7 0 0 0 12 2z"/></svg></div><p>Aucune suggestion.</p></div>`; return; }
  snap.forEach(d=>{
    const data = d.data();
    const date = data.createdAt ? data.createdAt.toDate().toLocaleDateString("fr-FR",{timeZone:DEVICE_TZ}) : "";
    const replyHtml = data.adminReply ? `<div class="feature-reply"><span class="feature-reply-lbl">${ICO_REPLY}Réponse publiée</span>${linkify(data.adminReply)}</div>` : "";
    const item = document.createElement("div"); item.className="admin-item";
    item.innerHTML = `<div class="admin-item-header"><div><div class="admin-item-text">${escHtml(data.text)}</div><div class="admin-item-meta">${data.votes||0} vote(s) · ${date}${data.approved?" · Approuvé":""}</div></div></div>${replyHtml}<div class="admin-item-actions"><button class="admin-action approve">${data.approved?"Retirer":"Approuver"}</button><button class="admin-action reply">Répondre</button><button class="admin-action delete">Supprimer</button></div><div class="admin-reply-form hidden" id="rf-${d.id}"><div class="input-wrap textarea-wrap"><textarea placeholder="Réponse publique…" rows="3"></textarea></div><button class="btn-primary" style="font-size:.78rem;padding:8px 15px;margin-top:4px;align-self:flex-end">Publier</button></div>`;
    item.querySelector(".approve").onclick = async () => { await updateDoc(doc(db,"features",d.id), { approved: !data.approved }); showToast(data.approved?"Retrait effectué.":"Approuvé !"); loadAdminFeedback(); };
    item.querySelector(".reply").onclick = () => $(`rf-${d.id}`)?.classList.toggle("hidden");
    item.querySelector(".btn-primary").onclick = async () => { const ta=$(`rf-${d.id}`)?.querySelector("textarea"); const reply=ta?.value.trim(); if(!reply) return showToast("Écris une réponse !"); await updateDoc(doc(db,"features",d.id), { adminReply: reply }); showToast("Réponse publiée !"); loadAdminFeedback(); };
    item.querySelector(".delete").onclick = async () => { if(!confirm("Supprimer ?")) return; await deleteDoc(doc(db,"features",d.id)); showToast("Supprimé."); loadAdminFeedback(); };
    list.appendChild(item);
  });
}

// ── TOAST & HELPERS ──
function showToast(msg, duration=2600){
  const t=$("toast"); if(!t) return; t.textContent=msg; t.classList.remove("hidden");
  requestAnimationFrame(()=>t.classList.add("show"));
  clearTimeout(t._t); t._t = setTimeout(()=>{ t.classList.remove("show"); setTimeout(()=>t.classList.add("hidden"),300); }, duration);
}
function escHtml(str){ return String(str).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); }
function formatDate(date){
  const now = new Date(); const diff = Math.floor((now-date)/1000);
  if (diff<0) return "À l'instant"; if (diff<60) return "À l'instant";
  if (diff<3600) return `Il y a ${Math.floor(diff/60)} min`;
  if (diff<86400) return `Il y a ${Math.floor(diff/3600)}h`;
  if (diff<604800){ const days=Math.floor(diff/86400); return `Il y a ${days} jour${days>1?"s":""}`; }
  return date.toLocaleDateString("fr-FR",{ day:"numeric", month:"short", hour:"2-digit", minute:"2-digit", timeZone: DEVICE_TZ });
}

// ── SHARE MESSAGE AS IMAGE ──
let capturedImageBlob=null, capturedImageUrl=null;
function openShareModal(message){
  capturedImageBlob=null; capturedImageUrl=null;
  const msgEl = $("shr-msg-text"); if (msgEl) msgEl.textContent = message;
  $("shr-overlay")?.classList.remove("hidden");
  setTimeout(() => generateShareImage(), 250);
}
function closeShareModal(){
  $("shr-overlay")?.classList.add("hidden");
  capturedImageBlob=null;
  if (capturedImageUrl) { URL.revokeObjectURL(capturedImageUrl); capturedImageUrl=null; }
}
$("shr-overlay")?.addEventListener("click", e => { if (e.target===$("shr-overlay")) closeShareModal(); });
$("shr-close")?.addEventListener("click", closeShareModal);

async function generateShareImage(){
  const card = $("shr-card");
  if (!card || typeof html2canvas==="undefined") { showToast("Erreur de génération !"); return; }
  const loader = $("shr-preview-loader"); loader?.classList.remove("hidden");
  try {
    const canvas = await html2canvas(card, { scale:3, useCORS:true, allowTaint:true, backgroundColor:null, logging:false, imageTimeout:10000 });
    const previewCanvas = $("shr-canvas");
    if (previewCanvas) { previewCanvas.width=canvas.width; previewCanvas.height=canvas.height; const ctx=previewCanvas.getContext("2d"); ctx.clearRect(0,0,previewCanvas.width,previewCanvas.height); ctx.drawImage(canvas,0,0); }
    await new Promise(resolve => { canvas.toBlob(blob => { if (blob) { capturedImageBlob=blob; capturedImageUrl=URL.createObjectURL(blob); } resolve(); }, "image/png"); });
  } catch(e){ console.error(e); showToast("Erreur de génération !"); }
  finally { loader?.classList.add("hidden"); }
}
async function handleDownload(){
  if (!capturedImageUrl) { await generateShareImage(); await new Promise(r=>setTimeout(r,800)); }
  if (!capturedImageUrl) return showToast("Réessaie !");
  const a=document.createElement("a"); a.href=capturedImageUrl; a.download="message-webnote.png"; a.click();
  showToast("Image enregistrée !");
}
async function handleCopyImage(){
  if (!capturedImageBlob) { await generateShareImage(); await new Promise(r=>setTimeout(r,800)); }
  if (!capturedImageBlob) return showToast("Réessaie !");
  try { if (navigator.clipboard && window.ClipboardItem) { await navigator.clipboard.write([new ClipboardItem({"image/png":capturedImageBlob})]); showToast("Image copiée !"); } else handleDownload(); }
  catch(e){ handleDownload(); }
}
$("shr-dl-btn")?.addEventListener("click", handleDownload);
$("shr-copy-btn")?.addEventListener("click", handleCopyImage);
