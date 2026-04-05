// ═══════════════════════════════════════════
//  WEBNOTE — app.js  (Full featured)
// ═══════════════════════════════════════════

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getAuth, createUserWithEmailAndPassword,
  signInWithEmailAndPassword, signOut, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  getFirestore, doc, setDoc, getDoc, addDoc, updateDoc, deleteDoc,
  collection, query, where, orderBy, getDocs, serverTimestamp, arrayUnion, arrayRemove
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// ── Config ───────────────────────────────
const firebaseConfig = {
  apiKey: "AIzaSyASaooIcRrY2mwZiI3j5VwjHmmzY8XLIag",
  authDomain: "webnote-63e2b.firebaseapp.com",
  projectId: "webnote-63e2b",
  storageBucket: "webnote-63e2b.firebasestorage.app",
  messagingSenderId: "756128668649",
  appId: "1:756128668649:web:da1ac2ec48f661d1688978"
};

const ADMIN_UID = "anonymous"; // ← Remplace par ton vrai UID après première connexion

const fireApp = initializeApp(firebaseConfig);
const auth    = getAuth(fireApp);
const db      = getFirestore(fireApp);

// ── State ────────────────────────────────
let currentUser     = null;
let currentUsername = "";
let currentShareLink = "";
let allMessages     = [];
let currentFilter   = "all";
let isGridView      = true;
let qrGenerated     = false;
let qrVisible       = false;
let currentPage     = "dashboard";
let isAdmin         = false;
let selectedEmoji   = "📢";
let voterIds        = new Set(); // IDs des sondages déjà votés

const urlParams  = new URLSearchParams(window.location.search);
const targetUser = urlParams.get("user");

// ════════════════════════════════════════
//  THEME
// ════════════════════════════════════════
const savedTheme = localStorage.getItem("wn-theme") || "light";
document.documentElement.setAttribute("data-theme", savedTheme);
updateThemeIcon(savedTheme);

document.getElementById("themeToggle")?.addEventListener("click", () => {
  const curr = document.documentElement.getAttribute("data-theme");
  const next = curr === "dark" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", next);
  localStorage.setItem("wn-theme", next);
  updateThemeIcon(next);
  if (qrVisible) { qrGenerated = false; generateQR(); }
  showToast(next === "dark" ? "Thème sombre 🌙" : "Thème clair ☀️");
});

function updateThemeIcon(t) {
  const ico = document.getElementById("theme-ico");
  if (ico) ico.textContent = t === "dark" ? "☀️" : "🌙";
}

// ════════════════════════════════════════
//  PAGES ROUTING
// ════════════════════════════════════════
const pages = {
  landing:   document.getElementById("page-landing"),
  auth:      document.getElementById("page-auth"),
  dashboard: document.getElementById("page-dashboard"),
  community: document.getElementById("page-community"),
  admin:     document.getElementById("page-admin"),
  send:      document.getElementById("page-send"),
};

function showPage(name) {
  Object.values(pages).forEach(p => { if (p) { p.style.display = "none"; p.classList.remove("active"); } });
  const page = pages[name];
  if (!page) return;
  page.style.display = "flex";
  void page.offsetWidth;
  page.classList.add("active");
  currentPage = name;

  // Sync nav tabs
  document.querySelectorAll(".nav-tab, .mob-btn").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.page === name);
  });
}

// Nav tab clicks
document.querySelectorAll(".nav-tab, .mob-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    if (!currentUser) return;
    const target = btn.dataset.page;
    if (target === "admin" && !isAdmin) return;
    showPage(target);
    if (target === "community") loadCommunity();
    if (target === "admin") loadAdminPanel();
  });
});

// ════════════════════════════════════════
//  AUTH STATE — FIX reconnexion sans reload
// ════════════════════════════════════════
onAuthStateChanged(auth, async (user) => {
  if (targetUser) {
    await loadSendPage(targetUser);
    return;
  }

  if (user) {
    currentUser = user;

    // Check admin
    isAdmin = user.uid === ADMIN_UID;

    // Navbar
    $("nav-login-btn")?.classList.add("hidden");
    $("nav-signup-btn")?.classList.add("hidden");
    $("nav-user")?.classList.remove("hidden");
    $("nav-tabs")?.style.setProperty("display", "flex");
    $("mobile-nav")?.classList.remove("hidden");

    // Admin nav items
    document.querySelectorAll(".admin-only").forEach(el => {
      el.classList.toggle("hidden", !isAdmin);
    });

    // Get user data
    const userDoc = await getDoc(doc(db, "users", user.uid));
    currentUsername = userDoc.exists() ? userDoc.data().username : (user.email?.split("@")[0] || "user");

    $("nav-username").textContent = `@${currentUsername}`;
    $("nav-avatar-letter").textContent = currentUsername[0].toUpperCase();
    $("dash-username-title").textContent = currentUsername;
    $("dash-avatar").textContent = currentUsername[0].toUpperCase();

    // Reset
    resetDashboard();

    // Load first page
    await loadDashboard();
    showPage("dashboard");

    // Reset auth buttons
    resetAuthButtons();

  } else {
    currentUser = null;
    currentUsername = "";
    isAdmin = false;
    allMessages = [];

    $("nav-login-btn")?.classList.remove("hidden");
    $("nav-signup-btn")?.classList.remove("hidden");
    $("nav-user")?.classList.add("hidden");
    if ($("nav-tabs")) $("nav-tabs").style.display = "none";
    $("mobile-nav")?.classList.add("hidden");

    showPage("landing");
  }
});

function resetAuthButtons() {
  const ls = $("login-submit"); if (ls) { ls.disabled = false; ls.querySelector("span").textContent = "Se connecter"; }
  const ss = $("signup-submit"); if (ss) { ss.disabled = false; ss.querySelector("span").textContent = "Créer mon compte"; }
}

function resetDashboard() {
  const qrEl = $("qr-code-el"); if (qrEl) qrEl.innerHTML = "";
  qrGenerated = false; qrVisible = false;
  $("qr-wrap")?.classList.add("hidden");
  currentFilter = "all"; isGridView = true;
  if ($("stat-total")) $("stat-total").textContent = "0";
  if ($("stat-today")) $("stat-today").textContent = "0";
  if ($("stat-week"))  $("stat-week").textContent  = "0";
  document.querySelectorAll(".pill").forEach(p => p.classList.remove("active"));
  $("filter-all")?.classList.add("active");
}

// ════════════════════════════════════════
//  LANDING
// ════════════════════════════════════════
$("landing-start-btn")?.addEventListener("click", () => { showAuthTab("signup"); showPage("auth"); });
$("landing-login-btn")?.addEventListener("click", () => { showAuthTab("login");  showPage("auth"); });
$("nav-login-btn")?.addEventListener("click",     () => { showAuthTab("login");  showPage("auth"); });
$("nav-signup-btn")?.addEventListener("click",    () => { showAuthTab("signup"); showPage("auth"); });

// ════════════════════════════════════════
//  AUTH TABS
// ════════════════════════════════════════
function showAuthTab(tab) {
  const tl = $("tab-login"), ts = $("tab-signup"), sl = $("tab-slider");
  const fl = $("form-login"), fs = $("form-signup");
  if (tab === "login") {
    tl.classList.add("active"); ts.classList.remove("active");
    fl.classList.remove("hidden"); fs.classList.add("hidden");
    sl.classList.remove("right");
    $("login-error")?.classList.add("hidden");
  } else {
    ts.classList.add("active"); tl.classList.remove("active");
    fs.classList.remove("hidden"); fl.classList.add("hidden");
    sl.classList.add("right");
    $("signup-error")?.classList.add("hidden");
  }
}
$("tab-login")?.addEventListener("click",  () => showAuthTab("login"));
$("tab-signup")?.addEventListener("click", () => showAuthTab("signup"));

// ── Eye toggle ──
document.querySelectorAll(".eye-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    const inp = $(btn.dataset.target);
    const isPwd = inp.type === "password";
    inp.type = isPwd ? "text" : "password";
    btn.querySelector(".eye-open").classList.toggle("hidden", isPwd);
    btn.querySelector(".eye-closed").classList.toggle("hidden", !isPwd);
  });
});

// ── Password strength ──
const sbars = ["sbar1","sbar2","sbar3","sbar4"].map(id => $(id));
const SI = [{label:"",cls:""},{label:"Faible",cls:"weak"},{label:"Moyen",cls:"fair"},{label:"Bon",cls:"good"},{label:"Fort 💪",cls:"strong"}];
function pwdScore(p) { let s=0; if(p.length>=6)s++; if(p.length>=10)s++; if(/[A-Z]/.test(p)&&/[a-z]/.test(p))s++; if(/[0-9]/.test(p)||/[^A-Za-z0-9]/.test(p))s++; return s; }
$("signup-password")?.addEventListener("input", () => {
  const sc = pwdScore($("signup-password").value);
  sbars.forEach((b,i) => { b.className="sbar"; if(i<sc) b.classList.add(SI[sc].cls); });
  $("strength-label").textContent = $("signup-password").value ? SI[sc].label : "";
});

// ════════════════════════════════════════
//  INSCRIPTION
// ════════════════════════════════════════
$("signup-submit")?.addEventListener("click", async () => {
  const username = $("signup-username").value.trim().toLowerCase().replace(/\s+/g,"_");
  const email    = $("signup-email").value.trim();
  const password = $("signup-password").value;
  const err = $("signup-error");
  err.classList.add("hidden");
  if (!username || username.length < 3) return showErr(err, "Pseudo trop court (min. 3 car.)");
  if (!email || !password) return showErr(err, "Remplis tous les champs.");
  if (password.length < 6) return showErr(err, "Mot de passe trop court (min. 6).");
  const q = query(collection(db,"users"), where("username","==",username));
  const existing = await getDocs(q);
  if (!existing.empty) return showErr(err, "Ce pseudo est déjà pris.");
  $("signup-submit").querySelector("span").textContent = "Création…";
  $("signup-submit").disabled = true;
  try {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    await setDoc(doc(db,"users",cred.user.uid), { username, email, uid: cred.user.uid, createdAt: serverTimestamp() });
  } catch (e) {
    $("signup-submit").querySelector("span").textContent = "Créer mon compte";
    $("signup-submit").disabled = false;
    showErr(err, fbErr(e.code));
  }
});

// ════════════════════════════════════════
//  CONNEXION
// ════════════════════════════════════════
$("login-submit")?.addEventListener("click", async () => {
  const email = $("login-email").value.trim();
  const password = $("login-password").value;
  const err = $("login-error");
  err.classList.add("hidden");
  if (!email || !password) return showErr(err, "Remplis tous les champs.");
  $("login-submit").querySelector("span").textContent = "Connexion…";
  $("login-submit").disabled = true;
  try {
    await signInWithEmailAndPassword(auth, email, password);
  } catch (e) {
    $("login-submit").querySelector("span").textContent = "Se connecter";
    $("login-submit").disabled = false;
    showErr(err, fbErr(e.code));
  }
});

// ── Déconnexion ──
$("nav-logout-btn")?.addEventListener("click", () => signOut(auth));

// ════════════════════════════════════════
//  DASHBOARD
// ════════════════════════════════════════
async function loadDashboard() {
  const base = window.location.origin + window.location.pathname;
  currentShareLink = `${base}?user=${encodeURIComponent(currentUsername)}`;
  if ($("share-link")) $("share-link").textContent = currentShareLink;

  // One-time event listeners (clone to avoid duplicates)
  replaceEl("copy-link-btn", btn => btn.addEventListener("click", () => {
    navigator.clipboard.writeText(currentShareLink).then(() => showToast("✅ Lien copié !"));
  }));
  replaceEl("share-wa", btn => btn.addEventListener("click", () => window.open(`https://wa.me/?text=${encodeURIComponent(`Envoie-moi un message anonyme 👀\n${currentShareLink}`)}`, "_blank")));
  replaceEl("share-tw", btn => btn.addEventListener("click", () => window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(`Envoie-moi un message anonyme 👀 ${currentShareLink}`)}`, "_blank")));
  replaceEl("share-ig", btn => btn.addEventListener("click", () => { navigator.clipboard.writeText(currentShareLink).then(() => showToast("✅ Copié ! Colle dans ta bio Insta 📸")); }));
  replaceEl("share-snap", btn => btn.addEventListener("click", () => { navigator.clipboard.writeText(currentShareLink).then(() => showToast("✅ Copié pour Snap 👻")); }));
  replaceEl("qr-toggle-btn", btn => btn.addEventListener("click", toggleQR));
  replaceEl("qr-dl-btn", btn => btn.addEventListener("click", downloadQR));
  replaceEl("refresh-btn", btn => btn.addEventListener("click", async () => {
    btn.style.transform = "rotate(360deg)"; btn.style.transition = "transform .5s";
    setTimeout(() => { btn.style.transform = ""; btn.style.transition = ""; }, 500);
    await fetchMessages(); showToast("✅ Actualisé !");
  }));
  replaceEl("export-btn", btn => btn.addEventListener("click", exportMessages));

  // Filters
  ["all","today","week","unread"].forEach(f => {
    replaceEl(`filter-${f}`, btn => btn.addEventListener("click", () => setFilter(f)));
  });

  // View toggle
  replaceEl("view-grid", btn => btn.addEventListener("click", () => setView(true)));
  replaceEl("view-list", btn => btn.addEventListener("click", () => setView(false)));

  // Search
  const si = $("search-input");
  if (si) si.addEventListener("input", e => renderMessages(e.target.value.toLowerCase().trim()));

  await fetchMessages();
}

// ── QR ──────────────────────────────────
function toggleQR() {
  qrVisible = !qrVisible;
  $("qr-wrap")?.classList.toggle("hidden", !qrVisible);
  const btn = $("qr-toggle-btn");
  if (btn) btn.innerHTML = qrVisible
    ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg> Masquer le QR Code`
    : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><line x1="14" y1="14" x2="14.01" y2="14"/><line x1="18" y1="14" x2="18.01" y2="14"/><line x1="14" y1="18" x2="14.01" y2="18"/><line x1="18" y1="18" x2="18.01" y2="18"/></svg> Afficher le QR Code`;
  if (qrVisible) generateQR();
}
function generateQR() {
  if (qrGenerated || !currentShareLink) return;
  const container = $("qr-code-el"); if (!container) return;
  container.innerHTML = "";
  try { new QRCode(container, { text: currentShareLink, width: 160, height: 160, colorDark: "#000000", colorLight: "#ffffff", correctLevel: QRCode.CorrectLevel.M }); qrGenerated = true; }
  catch (e) { console.error("QR:", e); }
}
function downloadQR() {
  const canvas = $("qr-code-el")?.querySelector("canvas");
  const img    = $("qr-code-el")?.querySelector("img");
  const src    = canvas ? canvas.toDataURL("image/png") : img?.src;
  if (!src) return showToast("Génère le QR d'abord !");
  const a = document.createElement("a"); a.href = src; a.download = "webnote-qrcode.png"; a.click();
  showToast("📱 QR Code téléchargé !");
}

// ── MESSAGES ────────────────────────────
async function fetchMessages() {
  try {
    const q = query(collection(db,"messages"), where("recipientId","==",currentUser.uid), orderBy("createdAt","desc"));
    const snap = await getDocs(q);
    allMessages = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    updateStats(); buildChart(); renderMessages();
  } catch (e) { console.error("fetchMessages:", e); }
}

function setFilter(f) {
  currentFilter = f;
  document.querySelectorAll(".pill").forEach(p => p.classList.remove("active"));
  $(`filter-${f}`)?.classList.add("active");
  renderMessages();
}

function setView(grid) {
  isGridView = grid;
  $("view-grid")?.classList.toggle("active", grid);
  $("view-list")?.classList.toggle("active", !grid);
  $("messages-container")?.classList.toggle("list-view", !grid);
}

function updateStats() {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const week  = new Date(today); week.setDate(today.getDate() - 7);
  animateCount($("stat-total"), allMessages.length);
  animateCount($("stat-today"), allMessages.filter(m => m.createdAt && m.createdAt.toDate() >= today).length);
  animateCount($("stat-week"),  allMessages.filter(m => m.createdAt && m.createdAt.toDate() >= week).length);
  const dc = $("dash-count");
  if (dc) dc.textContent = allMessages.length === 0 ? "Aucun message pour l'instant." : `${allMessages.length} message${allMessages.length > 1 ? "s" : ""} reçu${allMessages.length > 1 ? "s" : ""}`;
}

function animateCount(el, target) {
  if (!el) return; let cur = 0; const step = Math.ceil(target / 20) || 1;
  const t = setInterval(() => { cur = Math.min(cur + step, target); el.textContent = cur; if (cur >= target) clearInterval(t); }, 40);
}

function buildChart() {
  const chart = $("act-chart"); if (!chart) return;
  const days = [];
  for (let i = 6; i >= 0; i--) { const d = new Date(); d.setDate(d.getDate() - i); days.push({ key: d.toDateString(), lbl: d.toLocaleDateString("fr-FR",{weekday:"short"}).slice(0,3), count: 0 }); }
  allMessages.forEach(m => { if (!m.createdAt) return; const dk = m.createdAt.toDate().toDateString(); const day = days.find(d => d.key === dk); if (day) day.count++; });
  const total = days.reduce((a,d) => a + d.count, 0);
  const actTotal = $("act-total"); if (actTotal) actTotal.textContent = total;
  const max = Math.max(...days.map(d => d.count), 1);
  chart.innerHTML = "";
  days.forEach(d => {
    const col = document.createElement("div"); col.className = "bar-col";
    const bar = document.createElement("div"); bar.className = "bar" + (d.count === 0 ? " empty" : "");
    bar.style.height = "0%";
    setTimeout(() => { bar.style.height = (d.count === 0 ? 5 : Math.max(Math.round(d.count / max * 100), 8)) + "%"; }, 80);
    const lbl = document.createElement("div"); lbl.className = "bar-day"; lbl.textContent = d.lbl;
    col.appendChild(bar); col.appendChild(lbl); chart.appendChild(col);
  });
}

function renderMessages(searchTerm = "") {
  const container = $("messages-container"); if (!container) return;
  container.innerHTML = "";
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const week  = new Date(today); week.setDate(today.getDate() - 7);
  const cutoff24 = new Date(now - 86400000);

  let filtered = [...allMessages];
  if (currentFilter === "today")  filtered = filtered.filter(m => m.createdAt && m.createdAt.toDate() >= today);
  if (currentFilter === "week")   filtered = filtered.filter(m => m.createdAt && m.createdAt.toDate() >= week);
  if (currentFilter === "unread") filtered = filtered.filter(m => m.createdAt && m.createdAt.toDate() >= cutoff24);
  if (searchTerm) filtered = filtered.filter(m => m.message?.toLowerCase().includes(searchTerm));

  if (filtered.length === 0) {
    const emp = $("empty-state"); if (emp) { emp.classList.remove("hidden"); container.appendChild(emp); } return;
  }

  filtered.forEach((msg, i) => {
    const card = document.createElement("div");
    card.className = "msg-card";
    card.style.animationDelay = `${i * 0.04}s`;
    const timeLabel = msg.createdAt ? formatDate(msg.createdAt.toDate()) : "À l'instant";
    const isNew = msg.createdAt && msg.createdAt.toDate() >= cutoff24;
    const badges = `
      ${isNew ? '<span class="msg-badge new">🆕 Nouveau</span>' : ""}
      ${msg.approved ? '<span class="msg-badge approved">✅ Approuvé</span>' : ""}
    `;
    const replyHtml = msg.adminReply ? `
      <div class="msg-reply">
        <span class="msg-reply-lbl">Réponse de l'équipe</span>
        ${escHtml(msg.adminReply)}
      </div>
    ` : "";
    card.innerHTML = `
      <div class="msg-header"><div class="msg-badges">${badges}</div></div>
      <div class="msg-text">${escHtml(msg.message)}</div>
      ${replyHtml}
      <div class="msg-footer">
        <div class="msg-time">🕐 ${timeLabel}</div>
      </div>
    `;
    container.appendChild(card);
  });
}

// ── EXPORT ──────────────────────────────
function exportMessages() {
  if (!allMessages.length) { showToast("⚠️ Aucun message à exporter !"); return; }
  const sorted = [...allMessages].sort((a,b) => (a.createdAt?.toMillis()||0) - (b.createdAt?.toMillis()||0));
  const lines = ["╔══════════════════════════════════╗","║  Webnote — Messages anonymes     ║","╚══════════════════════════════════╝",`Exporté : ${new Date().toLocaleString("fr-FR")}`,`Total : ${sorted.length} message(s)`,"─".repeat(36),""];
  sorted.forEach((m,i) => { const t = m.createdAt ? m.createdAt.toDate().toLocaleString("fr-FR") : "—"; lines.push(`[${i+1}] ${t}`); lines.push(`"${m.message}"`); if (m.adminReply) lines.push(`→ Réponse : ${m.adminReply}`); lines.push(""); });
  const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `webnote-${new Date().toISOString().slice(0,10)}.txt`; a.click(); URL.revokeObjectURL(a.href);
  showToast("📄 Export téléchargé !");
}

// ════════════════════════════════════════
//  COMMUNITY PAGE
// ════════════════════════════════════════
async function loadCommunity() {
  await Promise.all([loadAnnouncements(), loadPolls(), loadFeatureRequests()]);
}

// ── Announcements ──
async function loadAnnouncements() {
  const list = $("announcements-list"); if (!list) return;
  try {
    const q = query(collection(db, "announcements"), orderBy("createdAt", "desc"));
    const snap = await getDocs(q);
    if (snap.empty) { list.innerHTML = '<div class="empty-state"><div class="empty-icon">📭</div><p>Aucun communiqué pour l\'instant.</p></div>'; return; }
    list.innerHTML = "";
    snap.forEach(d => {
      const data = d.data();
      const card = document.createElement("div");
      card.className = "ann-card";
      const date = data.createdAt ? data.createdAt.toDate().toLocaleDateString("fr-FR", { day:"numeric", month:"long", year:"numeric" }) : "";
      card.innerHTML = `
        <div class="ann-header">
          <div class="ann-emoji">${data.emoji || "📢"}</div>
          <div class="ann-meta">
            <div class="ann-title">${escHtml(data.title)}</div>
            <div class="ann-date">${date}</div>
          </div>
        </div>
        <div class="ann-body">${escHtml(data.body)}</div>
      `;
      list.appendChild(card);
    });
  } catch (e) { console.error("loadAnnouncements:", e); }
}

// ── Polls ──
async function loadPolls() {
  const list = $("polls-list"); if (!list) return;
  try {
    const q = query(collection(db, "polls"), where("active", "==", true), orderBy("createdAt", "desc"));
    const snap = await getDocs(q);
    if (snap.empty) { list.innerHTML = '<div class="empty-state"><div class="empty-icon">📊</div><p>Aucun sondage actif.</p></div>'; return; }
    list.innerHTML = "";
    snap.forEach(d => {
      const data = d.data();
      list.appendChild(buildPollCard(d.id, data));
    });
  } catch (e) { console.error("loadPolls:", e); }
}

function buildPollCard(pollId, data) {
  const card = document.createElement("div");
  card.className = "poll-card";
  const voters = data.voters || [];
  const hasVoted = currentUser && voters.includes(currentUser.uid);
  const totalVotes = (data.options || []).reduce((a, o) => a + (o.votes || 0), 0);

  let optionsHtml = "";
  (data.options || []).forEach((opt, i) => {
    const pct = totalVotes > 0 ? Math.round((opt.votes || 0) / totalVotes * 100) : 0;
    optionsHtml += `
      <div class="poll-option ${hasVoted ? "voted" : ""}" data-poll="${pollId}" data-idx="${i}">
        <div class="poll-bar" style="width:${hasVoted ? pct : 0}%"></div>
        <div class="poll-option-inner">
          <span class="poll-option-text">${escHtml(opt.text)}</span>
          ${hasVoted ? `<span class="poll-option-pct">${pct}%</span>` : ""}
        </div>
      </div>
    `;
  });

  card.innerHTML = `
    <div class="poll-question">${escHtml(data.question)}</div>
    <div class="poll-options">${optionsHtml}</div>
    <div class="poll-total">${totalVotes} vote${totalVotes !== 1 ? "s" : ""}${hasVoted ? " · Déjà voté ✓" : ""}</div>
  `;

  if (!hasVoted && currentUser) {
    card.querySelectorAll(".poll-option").forEach(opt => {
      opt.addEventListener("click", () => votePoll(pollId, parseInt(opt.dataset.idx), data));
    });
  }
  return card;
}

async function votePoll(pollId, idx, data) {
  if (!currentUser) { showToast("Connecte-toi pour voter !"); return; }
  try {
    const ref = doc(db, "polls", pollId);
    const snap = await getDoc(ref);
    const current = snap.data();
    if (current.voters?.includes(currentUser.uid)) { showToast("Tu as déjà voté !"); return; }
    const options = [...(current.options || [])];
    options[idx] = { ...options[idx], votes: (options[idx].votes || 0) + 1 };
    await updateDoc(ref, { options, voters: arrayUnion(currentUser.uid) });
    showToast("✅ Vote enregistré !");
    loadPolls();
  } catch (e) { console.error("votePoll:", e); showToast("Erreur lors du vote."); }
}

// ── Feature requests ──
async function loadFeatureRequests() {
  const list = $("features-list"); if (!list) return;
  try {
    const q = query(collection(db, "features"), orderBy("votes", "desc"));
    const snap = await getDocs(q);
    list.innerHTML = "";
    if (snap.empty) { list.innerHTML = '<div class="empty-state" style="padding:30px 0"><div class="empty-icon">💡</div><p>Sois le premier à proposer !</p></div>'; return; }
    snap.forEach(d => {
      const data = d.data();
      const hasVoted = currentUser && (data.voters || []).includes(currentUser.uid);
      const item = document.createElement("div");
      item.className = "feature-item";
      const badgesHtml = data.approved ? '<span class="feature-badge approved">✅ Approuvé</span>' : '<span class="feature-badge pending">En attente</span>';
      const replyHtml  = data.adminReply ? `<div class="feature-reply"><span class="feature-reply-lbl">Réponse Webnote</span>${escHtml(data.adminReply)}</div>` : "";
      const date = data.createdAt ? formatDate(data.createdAt.toDate()) : "";
      item.innerHTML = `
        <div class="feature-votes">
          <button class="vote-btn ${hasVoted ? "voted" : ""}" data-id="${d.id}">▲</button>
          <div class="vote-count">${data.votes || 0}</div>
        </div>
        <div class="feature-info">
          <div class="feature-text">${escHtml(data.text)}</div>
          <div class="feature-meta">${date}</div>
          <div class="feature-badges">${badgesHtml}</div>
          ${replyHtml}
        </div>
      `;
      item.querySelector(".vote-btn").addEventListener("click", () => voteFeature(d.id, hasVoted));
      list.appendChild(item);
    });
  } catch (e) { console.error("loadFeatureRequests:", e); }
}

replaceEl("feature-submit-btn", btn => btn?.addEventListener("click", async () => {
  const inp = $("feature-input"); if (!inp) return;
  const text = inp.value.trim();
  if (!text || text.length < 5) return showToast("⚠️ Trop court !");
  if (!currentUser) return showToast("Connecte-toi d'abord !");
  btn.querySelector("span").textContent = "Envoi…"; btn.disabled = true;
  try {
    await addDoc(collection(db,"features"), { text, votes: 0, voters: [], approved: false, adminReply: null, authorId: currentUser.uid, createdAt: serverTimestamp() });
    inp.value = ""; showToast("💡 Suggestion envoyée !");
    loadFeatureRequests();
  } catch (e) { showToast("Erreur. Réessaie."); }
  btn.querySelector("span").textContent = "Proposer"; btn.disabled = false;
}));

async function voteFeature(featureId, hasVoted) {
  if (!currentUser) return showToast("Connecte-toi pour voter !");
  try {
    const ref = doc(db,"features",featureId);
    if (hasVoted) {
      await updateDoc(ref, { votes: (await getDoc(ref)).data().votes - 1, voters: arrayRemove(currentUser.uid) });
    } else {
      await updateDoc(ref, { votes: (await getDoc(ref)).data().votes + 1, voters: arrayUnion(currentUser.uid) });
    }
    loadFeatureRequests();
  } catch (e) { console.error("voteFeature:", e); }
}

// ════════════════════════════════════════
//  ADMIN PANEL
// ════════════════════════════════════════
async function loadAdminPanel() {
  if (!isAdmin) return;
  await Promise.all([loadAdminAnnouncements(), loadAdminPolls(), loadAdminFeedback()]);

  // Admin tabs
  document.querySelectorAll(".admin-tab").forEach(tab => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".admin-tab").forEach(t => t.classList.remove("active"));
      document.querySelectorAll(".admin-panel").forEach(p => p.classList.remove("active"));
      tab.classList.add("active");
      $(`atab-${tab.dataset.atab}`)?.classList.add("active");
    });
  });

  // Emoji picker
  document.querySelectorAll(".emoji-opt").forEach(opt => {
    opt.addEventListener("click", () => {
      document.querySelectorAll(".emoji-opt").forEach(o => o.classList.remove("active"));
      opt.classList.add("active");
      selectedEmoji = opt.dataset.emoji;
    });
  });

  // Publish announcement
  replaceEl("ann-submit", btn => btn?.addEventListener("click", async () => {
    const title = $("ann-title").value.trim();
    const body  = $("ann-body").value.trim();
    if (!title || !body) return showToast("⚠️ Titre et message requis !");
    btn.querySelector("span").textContent = "Publication…"; btn.disabled = true;
    try {
      await addDoc(collection(db,"announcements"), { title, body, emoji: selectedEmoji, authorId: currentUser.uid, createdAt: serverTimestamp() });
      $("ann-title").value = ""; $("ann-body").value = "";
      showToast("📢 Communiqué publié !");
      loadAdminAnnouncements();
    } catch (e) { showToast("Erreur."); }
    btn.querySelector("span").textContent = "Publier le communiqué"; btn.disabled = false;
  }));

  // Create poll
  replaceEl("poll-submit", btn => btn?.addEventListener("click", async () => {
    const question = $("poll-question").value.trim();
    const rawOptions = $("poll-options").value.trim().split("\n").map(s => s.trim()).filter(Boolean);
    if (!question || rawOptions.length < 2) return showToast("⚠️ Question + min. 2 options !");
    btn.querySelector("span").textContent = "Création…"; btn.disabled = true;
    try {
      const options = rawOptions.map(text => ({ text, votes: 0 }));
      await addDoc(collection(db,"polls"), { question, options, voters: [], active: true, authorId: currentUser.uid, createdAt: serverTimestamp() });
      $("poll-question").value = ""; $("poll-options").value = "";
      showToast("📊 Sondage créé !");
      loadAdminPolls();
    } catch (e) { showToast("Erreur."); }
    btn.querySelector("span").textContent = "Créer le sondage"; btn.disabled = false;
  }));
}

async function loadAdminAnnouncements() {
  const list = $("admin-announcements-list"); if (!list) return;
  const q = query(collection(db,"announcements"), orderBy("createdAt","desc"));
  const snap = await getDocs(q);
  list.innerHTML = "";
  snap.forEach(d => {
    const data = d.data();
    const item = document.createElement("div"); item.className = "admin-item";
    const date = data.createdAt ? data.createdAt.toDate().toLocaleDateString("fr-FR") : "";
    item.innerHTML = `
      <div class="admin-item-header">
        <div>
          <div class="admin-item-text">${data.emoji || "📢"} ${escHtml(data.title)}</div>
          <div class="admin-item-meta">${date}</div>
        </div>
      </div>
      <div class="admin-item-actions">
        <button class="admin-action delete" data-id="${d.id}">🗑️ Supprimer</button>
      </div>
    `;
    item.querySelector(".delete").addEventListener("click", async () => {
      if (!confirm("Supprimer ce communiqué ?")) return;
      await deleteDoc(doc(db,"announcements",d.id));
      showToast("🗑️ Communiqué supprimé."); loadAdminAnnouncements();
    });
    list.appendChild(item);
  });
  if (snap.empty) list.innerHTML = '<p style="color:var(--tx3);font-size:.82rem;padding:10px 0">Aucun communiqué publié.</p>';
}

async function loadAdminPolls() {
  const list = $("admin-polls-list"); if (!list) return;
  const q = query(collection(db,"polls"), orderBy("createdAt","desc"));
  const snap = await getDocs(q);
  list.innerHTML = "";
  snap.forEach(d => {
    const data = d.data();
    const item = document.createElement("div"); item.className = "admin-item";
    const totalVotes = (data.options||[]).reduce((a,o) => a + (o.votes||0), 0);
    const date = data.createdAt ? data.createdAt.toDate().toLocaleDateString("fr-FR") : "";
    item.innerHTML = `
      <div class="admin-item-header">
        <div>
          <div class="admin-item-text">${escHtml(data.question)}</div>
          <div class="admin-item-meta">${totalVotes} vote(s) · ${date} · ${data.active ? "✅ Actif" : "⏸ Inactif"}</div>
        </div>
      </div>
      <div class="admin-item-actions">
        <button class="admin-action approve" data-id="${d.id}" data-active="${data.active}">${data.active ? "⏸ Désactiver" : "▶️ Activer"}</button>
        <button class="admin-action delete" data-id="${d.id}">🗑️ Supprimer</button>
      </div>
    `;
    item.querySelector(".approve").addEventListener("click", async () => {
      await updateDoc(doc(db,"polls",d.id), { active: !data.active });
      showToast(data.active ? "Sondage désactivé." : "Sondage activé !"); loadAdminPolls();
    });
    item.querySelector(".delete").addEventListener("click", async () => {
      if (!confirm("Supprimer ce sondage ?")) return;
      await deleteDoc(doc(db,"polls",d.id)); showToast("🗑️ Supprimé."); loadAdminPolls();
    });
    list.appendChild(item);
  });
  if (snap.empty) list.innerHTML = '<p style="color:var(--tx3);font-size:.82rem;padding:10px 0">Aucun sondage créé.</p>';
}

async function loadAdminFeedback() {
  const list = $("admin-feedback-list"); if (!list) return;
  const q = query(collection(db,"features"), orderBy("votes","desc"));
  const snap = await getDocs(q);
  list.innerHTML = "";

  // Update badge
  const pending = snap.docs.filter(d => !d.data().approved).length;
  const badge = $("feedback-count"); if (badge) badge.textContent = pending;
  const navBadge = $("admin-badge"); if (navBadge) { navBadge.textContent = pending; navBadge.style.display = pending > 0 ? "" : "none"; }

  if (snap.empty) { list.innerHTML = '<div class="empty-state" style="padding:30px 0"><div class="empty-icon">💡</div><p>Aucune suggestion reçue.</p></div>'; return; }

  snap.forEach(d => {
    const data = d.data();
    const item = document.createElement("div"); item.className = "admin-item";
    const date = data.createdAt ? data.createdAt.toDate().toLocaleDateString("fr-FR") : "";
    const replyHtml = data.adminReply ? `<div class="feature-reply"><span class="feature-reply-lbl">Réponse publiée</span>${escHtml(data.adminReply)}</div>` : "";
    item.innerHTML = `
      <div class="admin-item-header">
        <div>
          <div class="admin-item-text">${escHtml(data.text)}</div>
          <div class="admin-item-meta">${data.votes || 0} vote(s) · ${date} ${data.approved ? "· ✅ Approuvé" : ""}</div>
        </div>
      </div>
      ${replyHtml}
      <div class="admin-item-actions">
        <button class="admin-action approve" data-id="${d.id}" data-approved="${data.approved}">${data.approved ? "❌ Retirer approbation" : "✅ Approuver"}</button>
        <button class="admin-action reply" data-id="${d.id}">✏️ Répondre</button>
        <button class="admin-action delete" data-id="${d.id}">🗑️ Supprimer</button>
      </div>
      <div class="admin-reply-form hidden" id="reply-form-${d.id}">
        <div class="input-wrap textarea-wrap"><textarea placeholder="Ta réponse publique à cette suggestion…" rows="3"></textarea></div>
        <button class="btn-primary">Publier la réponse</button>
      </div>
    `;

    // Approve
    item.querySelector(".approve").addEventListener("click", async () => {
      await updateDoc(doc(db,"features",d.id), { approved: !data.approved });
      showToast(data.approved ? "Approbation retirée." : "✅ Suggestion approuvée !");
      loadAdminFeedback();
    });

    // Reply toggle
    item.querySelector(".reply").addEventListener("click", () => {
      $(`reply-form-${d.id}`)?.classList.toggle("hidden");
    });

    // Publish reply
    item.querySelector(".btn-primary")?.addEventListener("click", async () => {
      const ta = $(`reply-form-${d.id}`)?.querySelector("textarea");
      const reply = ta?.value.trim();
      if (!reply) return showToast("Écris une réponse !");
      await updateDoc(doc(db,"features",d.id), { adminReply: reply });
      showToast("✏️ Réponse publiée !"); loadAdminFeedback();
    });

    // Delete
    item.querySelector(".delete").addEventListener("click", async () => {
      if (!confirm("Supprimer cette suggestion ?")) return;
      await deleteDoc(doc(db,"features",d.id)); showToast("🗑️ Supprimé."); loadAdminFeedback();
    });

    list.appendChild(item);
  });
}

// ════════════════════════════════════════
//  SEND PAGE (publique)
// ════════════════════════════════════════
async function loadSendPage(username) {
  showPage("send");
  $("nav-login-btn")?.classList.remove("hidden");
  $("nav-signup-btn")?.classList.remove("hidden");

  const q = query(collection(db,"users"), where("username","==",username));
  const snap = await getDocs(q);

  if (snap.empty) {
    if ($("send-username-display")) $("send-username-display").textContent = "utilisateur introuvable";
    if ($("send-avatar")) $("send-avatar").textContent = "?";
    if ($("send-submit")) $("send-submit").disabled = true;
    return;
  }

  const recipientData = snap.docs[0].data();
  if ($("send-username-display")) $("send-username-display").textContent = `@${recipientData.username}`;
  if ($("send-avatar")) $("send-avatar").textContent = recipientData.username[0].toUpperCase();

  $("send-message")?.addEventListener("input", () => { if ($("char-count")) $("char-count").textContent = $("send-message").value.length; });

  $("send-submit")?.addEventListener("click", async () => {
    const msg = $("send-message")?.value.trim();
    $("send-error")?.classList.add("hidden");
    if (!msg || msg.length < 2) return showErr($("send-error"), "Le message est trop court.");
    const span = $("send-submit").querySelector("span");
    if (span) span.textContent = "Envoi…";
    $("send-submit").disabled = true;
    try {
      await addDoc(collection(db,"messages"), { message: msg, recipientId: recipientData.uid, recipientUsername: recipientData.username, approved: false, adminReply: null, createdAt: serverTimestamp() });
      $("send-submit")?.classList.add("hidden");
      $("send-message")?.closest(".input-wrap")?.classList.add("hidden");
      document.querySelector(".char-count")?.classList.add("hidden");
      $("send-error")?.classList.add("hidden");
      $("send-success")?.classList.remove("hidden");
    } catch (e) {
      if (span) span.textContent = "Envoyer anonymement 🤍";
      $("send-submit").disabled = false;
      showErr($("send-error"), "Erreur. Réessaie.");
    }
  });
}

// ════════════════════════════════════════
//  TOAST
// ════════════════════════════════════════
function showToast(msg, duration = 2600) {
  const t = $("toast"); if (!t) return;
  t.textContent = msg; t.classList.remove("hidden");
  requestAnimationFrame(() => t.classList.add("show"));
  clearTimeout(t._t);
  t._t = setTimeout(() => { t.classList.remove("show"); setTimeout(() => t.classList.add("hidden"), 300); }, duration);
}

// ════════════════════════════════════════
//  MODAL
// ════════════════════════════════════════
$("modal-overlay")?.addEventListener("click", e => { if (e.target === $("modal-overlay")) closeModal(); });
$("modal-close")?.addEventListener("click", closeModal);
function closeModal() { $("modal-overlay")?.classList.add("hidden"); }

// ════════════════════════════════════════
//  HELPERS
// ════════════════════════════════════════
function $(id) { return document.getElementById(id); }

function replaceEl(id, fn) {
  const el = $(id); if (!el) return;
  const clone = el.cloneNode(true);
  el.parentNode?.replaceChild(clone, el);
  fn(clone);
}

function showErr(el, msg) { if (!el) return; el.textContent = msg; el.classList.remove("hidden"); }

function escHtml(str) {
  return String(str)
    .replace(/&/g,"&amp;").replace(/</g,"&lt;")
    .replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

function formatDate(date) {
  const diff = Math.floor((Date.now() - date) / 1000);
  if (diff < 60)    return "À l'instant";
  if (diff < 3600)  return `Il y a ${Math.floor(diff/60)} min`;
  if (diff < 86400) return `Il y a ${Math.floor(diff/3600)}h`;
  return date.toLocaleDateString("fr-FR", { day:"numeric", month:"short", hour:"2-digit", minute:"2-digit" });
}

function fbErr(code) {
  const m = { "auth/email-already-in-use":"Email déjà utilisé.", "auth/invalid-email":"Email invalide.", "auth/weak-password":"Mot de passe trop faible.", "auth/user-not-found":"Aucun compte avec cet email.", "auth/wrong-password":"Mot de passe incorrect.", "auth/invalid-credential":"Email ou mot de passe incorrect.", "auth/too-many-requests":"Trop de tentatives. Réessaie plus tard." };
  return m[code] || "Une erreur s'est produite.";
}

// ════════════════════════════════════════
//  DATETIME — auth & send popup clocks
// ════════════════════════════════════════
function updateDatetime() {
  const now = new Date();
  const date = now.toLocaleDateString("fr-FR", { weekday:"long", day:"numeric", month:"long" });
  const time = now.toLocaleTimeString("fr-FR", { hour:"2-digit", minute:"2-digit", second:"2-digit" });
  const str = `${date}\n${time}`;

  // Top-right corner
  ["auth-datetime","send-datetime"].forEach(id => {
    const el = $(id); if (el) el.textContent = `${date} · ${time}`;
  });
  // Inside popup
  ["auth-datetime-popup","send-datetime-popup"].forEach(id => {
    const el = $(id); if (el) el.innerHTML = `${date}<br/>${time}`;
  });
}
updateDatetime();
setInterval(updateDatetime, 1000);

