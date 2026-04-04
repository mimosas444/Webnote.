// ═══════════════════════════════════════════
//  WEBNOTE — app.js  (version complète)
// ═══════════════════════════════════════════

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getAuth, createUserWithEmailAndPassword,
  signInWithEmailAndPassword, signOut, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  getFirestore, doc, setDoc, getDoc, addDoc,
  collection, query, where, orderBy, getDocs, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// ── Config Firebase ──────────────────────
const firebaseConfig = {
  apiKey: "AIzaSyASaooIcRrY2mwZiI3j5VwjHmmzY8XLIag",
  authDomain: "webnote-63e2b.firebaseapp.com",
  projectId: "webnote-63e2b",
  storageBucket: "webnote-63e2b.firebasestorage.app",
  messagingSenderId: "756128668649",
  appId: "1:756128668649:web:da1ac2ec48f661d1688978"
};

const fireApp = initializeApp(firebaseConfig);
const auth    = getAuth(fireApp);
const db      = getFirestore(fireApp);

// ── URL params ───────────────────────────
const urlParams  = new URLSearchParams(window.location.search);
const targetUser = urlParams.get("user");

// ── State ────────────────────────────────
let allMessages     = [];
let currentFilter   = "all";
let isGridView      = true;
let currentUser     = null;
let currentUsername = "";
let currentShareLink = "";
let qrGenerated     = false;
let qrVisible       = false;
let authReady       = false; // ← FIX: évite les re-renders parasites

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
  // Re-gen QR si ouvert
  if (qrVisible) { qrGenerated = false; generateQR(); }
  showToast(next === "dark" ? "Thème sombre activé 🌙" : "Thème clair activé ☀️");
});

function updateThemeIcon(theme) {
  const ico = document.getElementById("theme-ico");
  if (ico) ico.textContent = theme === "dark" ? "☀️" : "🌙";
}

// ════════════════════════════════════════
//  PAGES
// ════════════════════════════════════════
const pages = {
  landing:   document.getElementById("page-landing"),
  auth:      document.getElementById("page-auth"),
  dashboard: document.getElementById("page-dashboard"),
  send:      document.getElementById("page-send"),
};

function showPage(name) {
  Object.values(pages).forEach(p => {
    p.style.display = "none";
    p.classList.remove("active");
  });
  const page = pages[name];
  page.style.display = "flex";
  // Force reflow avant d'ajouter la classe pour que l'animation rejoue
  void page.offsetWidth;
  page.classList.add("active");
}

// ── Navbar refs ──
const navLoginBtn     = document.getElementById("nav-login-btn");
const navSignupBtn    = document.getElementById("nav-signup-btn");
const navUser         = document.getElementById("nav-user");
const navUsername     = document.getElementById("nav-username");
const navAvatarLetter = document.getElementById("nav-avatar-letter");
const navLogoutBtn    = document.getElementById("nav-logout-btn");

// ── Auth tabs ──
const tabLogin   = document.getElementById("tab-login");
const tabSignup  = document.getElementById("tab-signup");
const tabSlider  = document.getElementById("tab-slider");
const formLogin  = document.getElementById("form-login");
const formSignup = document.getElementById("form-signup");

// ── Login ──
const loginEmail    = document.getElementById("login-email");
const loginPassword = document.getElementById("login-password");
const loginError    = document.getElementById("login-error");
const loginSubmit   = document.getElementById("login-submit");

// ── Signup ──
const signupUsername = document.getElementById("signup-username");
const signupEmail    = document.getElementById("signup-email");
const signupPassword = document.getElementById("signup-password");
const signupError    = document.getElementById("signup-error");
const signupSubmit   = document.getElementById("signup-submit");

// ── Dashboard ──
const shareLink       = document.getElementById("share-link");
const copyLinkBtn     = document.getElementById("copy-link-btn");
const messagesContainer = document.getElementById("messages-container");
const emptyState      = document.getElementById("empty-state");
const dashCount       = document.getElementById("dash-count");
const statTotal       = document.getElementById("stat-total");
const statToday       = document.getElementById("stat-today");
const statWeek        = document.getElementById("stat-week");

// ── Send ──
const sendAvatarEl        = document.getElementById("send-avatar");
const sendUsernameDisplay = document.getElementById("send-username-display");
const sendMessage         = document.getElementById("send-message");
const sendSubmit          = document.getElementById("send-submit");
const sendError           = document.getElementById("send-error");
const sendSuccess         = document.getElementById("send-success");
const charCountEl         = document.getElementById("char-count");

// ── Toast ──
const toast = document.getElementById("toast");

// ════════════════════════════════════════
//  TOAST
// ════════════════════════════════════════
function showToast(msg, duration = 2600) {
  toast.textContent = msg;
  toast.classList.remove("hidden");
  requestAnimationFrame(() => toast.classList.add("show"));
  clearTimeout(toast._t);
  toast._t = setTimeout(() => {
    toast.classList.remove("show");
    setTimeout(() => toast.classList.add("hidden"), 300);
  }, duration);
}

// ════════════════════════════════════════
//  EYE TOGGLE
// ════════════════════════════════════════
document.querySelectorAll(".eye-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    const input = document.getElementById(btn.dataset.target);
    const isPwd = input.type === "password";
    input.type = isPwd ? "text" : "password";
    btn.querySelector(".eye-open").classList.toggle("hidden", isPwd);
    btn.querySelector(".eye-closed").classList.toggle("hidden", !isPwd);
  });
});

// ════════════════════════════════════════
//  PASSWORD STRENGTH
// ════════════════════════════════════════
const sbars = ["sbar1","sbar2","sbar3","sbar4"].map(id => document.getElementById(id));
const strengthLabel = document.getElementById("strength-label");
const SI = [
  { label: "", cls: "" },
  { label: "Faible",   cls: "weak" },
  { label: "Moyen",    cls: "fair" },
  { label: "Bon",      cls: "good" },
  { label: "Fort 💪", cls: "strong" },
];
function pwdScore(p) {
  let s = 0;
  if (p.length >= 6)  s++;
  if (p.length >= 10) s++;
  if (/[A-Z]/.test(p) && /[a-z]/.test(p)) s++;
  if (/[0-9]/.test(p) || /[^A-Za-z0-9]/.test(p)) s++;
  return s;
}
signupPassword?.addEventListener("input", () => {
  const score = pwdScore(signupPassword.value);
  sbars.forEach((b, i) => {
    b.className = "sbar";
    if (i < score) b.classList.add(SI[score].cls);
  });
  strengthLabel.textContent = signupPassword.value ? SI[score].label : "";
});

// ════════════════════════════════════════
//  AUTH STATE — FIX reconnexion sans reload
// ════════════════════════════════════════
onAuthStateChanged(auth, async (user) => {
  // Page d'envoi publique — ignorer auth
  if (targetUser) {
    if (!authReady) { authReady = true; await loadSendPage(targetUser); }
    return;
  }

  authReady = true;

  if (user) {
    currentUser = user;

    // Navbar
    navLoginBtn.classList.add("hidden");
    navSignupBtn.classList.add("hidden");
    navUser.classList.remove("hidden");

    // Récupérer username
    const userDoc = await getDoc(doc(db, "users", user.uid));
    currentUsername = userDoc.exists() ? userDoc.data().username : (user.email?.split("@")[0] || "user");

    navUsername.textContent = `@${currentUsername}`;
    navAvatarLetter.textContent = currentUsername[0].toUpperCase();
    document.getElementById("dash-username-title").textContent = currentUsername;
    document.getElementById("dash-avatar").textContent = currentUsername[0].toUpperCase();

    // Reset état du dashboard pour éviter les doublons
    resetDashboard();

    await loadDashboard(user, currentUsername);
    showPage("dashboard");

    // Réactiver les boutons auth (pour reconnexion)
    if (loginSubmit) { loginSubmit.disabled = false; loginSubmit.querySelector("span").textContent = "Se connecter"; }
    if (signupSubmit) { signupSubmit.disabled = false; signupSubmit.querySelector("span").textContent = "Créer mon compte"; }

  } else {
    currentUser = null;
    currentUsername = "";
    allMessages = [];
    qrGenerated = false;
    qrVisible = false;

    navLoginBtn.classList.remove("hidden");
    navSignupBtn.classList.remove("hidden");
    navUser.classList.add("hidden");

    showPage("landing");
  }
});

function resetDashboard() {
  // Réinitialiser QR
  const qrEl = document.getElementById("qr-code-el");
  if (qrEl) qrEl.innerHTML = "";
  qrGenerated = false;
  qrVisible = false;
  const qrWrap = document.getElementById("qr-wrap");
  const qrBtn  = document.getElementById("qr-toggle-btn");
  if (qrWrap) qrWrap.classList.add("hidden");
  if (qrBtn) qrBtn.textContent = "☰ Afficher le QR Code";

  // Reset stats
  if (statTotal) statTotal.textContent = "0";
  if (statToday) statToday.textContent = "0";
  if (statWeek)  statWeek.textContent  = "0";

  // Reset filtre
  currentFilter = "all";
  isGridView = true;
}

// ════════════════════════════════════════
//  LANDING
// ════════════════════════════════════════
document.getElementById("landing-start-btn")?.addEventListener("click", () => {
  showAuthTab("signup"); showPage("auth");
});
navLoginBtn?.addEventListener("click",  () => { showAuthTab("login");  showPage("auth"); });
navSignupBtn?.addEventListener("click", () => { showAuthTab("signup"); showPage("auth"); });

// ════════════════════════════════════════
//  AUTH TABS
// ════════════════════════════════════════
function showAuthTab(tab) {
  if (tab === "login") {
    tabLogin.classList.add("active"); tabSignup.classList.remove("active");
    formLogin.classList.remove("hidden"); formSignup.classList.add("hidden");
    tabSlider.classList.remove("right");
    loginError.classList.add("hidden");
  } else {
    tabSignup.classList.add("active"); tabLogin.classList.remove("active");
    formSignup.classList.remove("hidden"); formLogin.classList.add("hidden");
    tabSlider.classList.add("right");
    signupError.classList.add("hidden");
  }
}
tabLogin?.addEventListener("click",  () => showAuthTab("login"));
tabSignup?.addEventListener("click", () => showAuthTab("signup"));

// ════════════════════════════════════════
//  INSCRIPTION
// ════════════════════════════════════════
signupSubmit?.addEventListener("click", async () => {
  const username = signupUsername.value.trim().toLowerCase().replace(/\s+/g, "_");
  const email    = signupEmail.value.trim();
  const password = signupPassword.value;

  signupError.classList.add("hidden");
  if (!username || username.length < 3) return showErr(signupError, "Pseudo trop court (min. 3 caractères).");
  if (!email || !password) return showErr(signupError, "Remplis tous les champs.");
  if (password.length < 6) return showErr(signupError, "Mot de passe trop court (min. 6 caractères).");

  const q = query(collection(db, "users"), where("username", "==", username));
  const existing = await getDocs(q);
  if (!existing.empty) return showErr(signupError, "Ce pseudo est déjà pris.");

  signupSubmit.querySelector("span").textContent = "Création…";
  signupSubmit.disabled = true;

  try {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    await setDoc(doc(db, "users", cred.user.uid), {
      username, email, uid: cred.user.uid, createdAt: serverTimestamp()
    });
    // onAuthStateChanged prend le relais automatiquement
  } catch (err) {
    signupSubmit.querySelector("span").textContent = "Créer mon compte";
    signupSubmit.disabled = false;
    showErr(signupError, firebaseErr(err.code));
  }
});

// ════════════════════════════════════════
//  CONNEXION
// ════════════════════════════════════════
loginSubmit?.addEventListener("click", async () => {
  const email    = loginEmail.value.trim();
  const password = loginPassword.value;

  loginError.classList.add("hidden");
  if (!email || !password) return showErr(loginError, "Remplis tous les champs.");

  loginSubmit.querySelector("span").textContent = "Connexion…";
  loginSubmit.disabled = true;

  try {
    await signInWithEmailAndPassword(auth, email, password);
    // onAuthStateChanged va gérer la suite — pas besoin de faire quoi que ce soit ici
  } catch (err) {
    loginSubmit.querySelector("span").textContent = "Se connecter";
    loginSubmit.disabled = false;
    showErr(loginError, firebaseErr(err.code));
  }
});

// ════════════════════════════════════════
//  DÉCONNEXION
// ════════════════════════════════════════
navLogoutBtn?.addEventListener("click", async () => {
  await signOut(auth);
  // onAuthStateChanged va détecter user=null et afficher landing
});

// ════════════════════════════════════════
//  DASHBOARD
// ════════════════════════════════════════
async function loadDashboard(user, username) {
  // Générer lien unique
  const base = window.location.origin + window.location.pathname;
  currentShareLink = `${base}?user=${encodeURIComponent(username)}`;
  if (shareLink) shareLink.textContent = currentShareLink;

  // Copier lien
  copyLinkBtn?.addEventListener("click", () => {
    navigator.clipboard.writeText(currentShareLink).then(() => showToast("✅ Lien copié !"));
  });

  // Partage WhatsApp
  document.getElementById("share-wa")?.addEventListener("click", () => {
    window.open(`https://wa.me/?text=${encodeURIComponent(`Envoie-moi un message anonyme 👀\n${currentShareLink}`)}`, "_blank");
  });
  // Twitter
  document.getElementById("share-tw")?.addEventListener("click", () => {
    window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(`Envoie-moi un message anonyme 👀 ${currentShareLink}`)}`, "_blank");
  });
  // Instagram
  document.getElementById("share-ig")?.addEventListener("click", () => {
    navigator.clipboard.writeText(currentShareLink).then(() => showToast("✅ Lien copié ! Mets-le dans ta bio Instagram 📸"));
  });
  // Snapchat
  document.getElementById("share-snap")?.addEventListener("click", () => {
    navigator.clipboard.writeText(currentShareLink).then(() => showToast("✅ Lien copié pour Snapchat 👻"));
  });

  // QR Code
  document.getElementById("qr-toggle-btn")?.addEventListener("click", toggleQR);
  document.getElementById("qr-dl-btn")?.addEventListener("click", downloadQR);

  // Refresh
  document.getElementById("refresh-btn")?.addEventListener("click", async () => {
    const btn = document.getElementById("refresh-btn");
    btn.style.transition = "transform 0.5s";
    btn.style.transform = "rotate(360deg)";
    setTimeout(() => { btn.style.transform = ""; }, 500);
    await fetchMessages(user);
    showToast("✅ Messages actualisés !");
  });

  // Filtres
  document.getElementById("filter-all")?.addEventListener("click",    () => setFilter("all"));
  document.getElementById("filter-today")?.addEventListener("click",  () => setFilter("today"));
  document.getElementById("filter-week")?.addEventListener("click",   () => setFilter("week"));
  document.getElementById("filter-unread")?.addEventListener("click", () => setFilter("unread"));

  // Vue
  document.getElementById("view-grid")?.addEventListener("click", () => setView(true));
  document.getElementById("view-list")?.addEventListener("click", () => setView(false));

  // Recherche
  document.getElementById("search-input")?.addEventListener("input", (e) => {
    renderMessages(e.target.value.toLowerCase().trim());
  });

  // Export
  document.getElementById("export-btn")?.addEventListener("click", exportMessages);

  await fetchMessages(user);
}

// ── QR CODE ────────────────────────────
function toggleQR() {
  qrVisible = !qrVisible;
  const qrWrap = document.getElementById("qr-wrap");
  const qrBtn  = document.getElementById("qr-toggle-btn");

  if (qrVisible) {
    qrWrap.classList.remove("hidden");
    qrBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg> Masquer le QR Code`;
    generateQR();
  } else {
    qrWrap.classList.add("hidden");
    qrBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><line x1="14" y1="14" x2="14.01" y2="14"/><line x1="18" y1="14" x2="18.01" y2="14"/><line x1="14" y1="18" x2="14.01" y2="18"/><line x1="18" y1="18" x2="18.01" y2="18"/></svg> Afficher le QR Code`;
  }
}

function generateQR() {
  if (qrGenerated || !currentShareLink) return;
  const container = document.getElementById("qr-code-el");
  if (!container) return;
  container.innerHTML = "";

  try {
    new QRCode(container, {
      text: currentShareLink,
      width: 160, height: 160,
      colorDark: "#000000",
      colorLight: "#ffffff",
      correctLevel: QRCode.CorrectLevel.M,
    });
    qrGenerated = true;
  } catch (e) {
    console.error("QR error:", e);
  }
}

function downloadQR() {
  const canvas = document.getElementById("qr-code-el")?.querySelector("canvas");
  const img    = document.getElementById("qr-code-el")?.querySelector("img");
  if (canvas) {
    const a = document.createElement("a");
    a.href = canvas.toDataURL("image/png");
    a.download = "webnote-qrcode.png"; a.click();
    showToast("📱 QR Code téléchargé !");
  } else if (img) {
    const a = document.createElement("a");
    a.href = img.src; a.download = "webnote-qrcode.png"; a.click();
    showToast("📱 QR Code téléchargé !");
  } else {
    showToast("Génère le QR d'abord !");
  }
}

// ── FETCH & RENDER ──────────────────────
async function fetchMessages(user) {
  try {
    const q = query(
      collection(db, "messages"),
      where("recipientId", "==", user.uid),
      orderBy("createdAt", "desc")
    );
    const snap = await getDocs(q);
    allMessages = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    updateStats();
    buildChart();
    renderMessages();
  } catch (err) {
    console.error("fetchMessages:", err);
  }
}

function setFilter(f) {
  currentFilter = f;
  ["filter-all","filter-today","filter-week","filter-unread"].forEach(id => {
    document.getElementById(id)?.classList.remove("active");
  });
  document.getElementById(`filter-${f}`)?.classList.add("active");
  renderMessages();
}

function setView(grid) {
  isGridView = grid;
  document.getElementById("view-grid")?.classList.toggle("active", grid);
  document.getElementById("view-list")?.classList.toggle("active", !grid);
  messagesContainer?.classList.toggle("list-view", !grid);
}

function updateStats() {
  const now   = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const week  = new Date(today); week.setDate(today.getDate() - 7);

  const todayCount = allMessages.filter(m => m.createdAt && m.createdAt.toDate() >= today).length;
  const weekCount  = allMessages.filter(m => m.createdAt && m.createdAt.toDate() >= week).length;

  animateCount(statTotal, allMessages.length);
  animateCount(statToday, todayCount);
  animateCount(statWeek,  weekCount);

  if (dashCount) {
    dashCount.textContent = allMessages.length === 0
      ? "Aucun message pour l'instant."
      : `${allMessages.length} message${allMessages.length > 1 ? "s" : ""} reçu${allMessages.length > 1 ? "s" : ""}`;
  }
}

function animateCount(el, target) {
  if (!el) return;
  let cur = 0;
  const step = Math.ceil(target / 20) || 1;
  const t = setInterval(() => {
    cur = Math.min(cur + step, target);
    el.textContent = cur;
    if (cur >= target) clearInterval(t);
  }, 40);
}

function buildChart() {
  const chart = document.getElementById("act-chart");
  if (!chart) return;
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    days.push({ key: d.toDateString(), lbl: d.toLocaleDateString("fr-FR", { weekday: "short" }).slice(0, 3), count: 0 });
  }
  allMessages.forEach(m => {
    if (!m.createdAt) return;
    const dk = m.createdAt.toDate().toDateString();
    const day = days.find(d => d.key === dk);
    if (day) day.count++;
  });
  const total = days.reduce((a, d) => a + d.count, 0);
  const actTotal = document.getElementById("act-total");
  if (actTotal) actTotal.textContent = total;
  const max = Math.max(...days.map(d => d.count), 1);
  chart.innerHTML = "";
  days.forEach(d => {
    const pct = Math.round((d.count / max) * 100);
    const col = document.createElement("div"); col.className = "bar-col";
    const bar = document.createElement("div");
    bar.className = "bar" + (d.count === 0 ? " empty" : "");
    bar.style.height = "0%";
    setTimeout(() => { bar.style.height = (d.count === 0 ? 5 : Math.max(pct, 8)) + "%"; }, 80);
    const lbl = document.createElement("div"); lbl.className = "bar-day"; lbl.textContent = d.lbl;
    col.appendChild(bar); col.appendChild(lbl); chart.appendChild(col);
  });
}

function renderMessages(searchTerm = "") {
  if (!messagesContainer) return;
  messagesContainer.innerHTML = "";

  const now   = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const week  = new Date(today); week.setDate(today.getDate() - 7);

  let filtered = [...allMessages];

  // Filtre période
  if (currentFilter === "today") {
    filtered = filtered.filter(m => m.createdAt && m.createdAt.toDate() >= today);
  } else if (currentFilter === "week") {
    filtered = filtered.filter(m => m.createdAt && m.createdAt.toDate() >= week);
  } else if (currentFilter === "unread") {
    const cutoff = new Date(now - 24 * 60 * 60 * 1000);
    filtered = filtered.filter(m => m.createdAt && m.createdAt.toDate() >= cutoff);
  }

  // Recherche
  if (searchTerm) {
    filtered = filtered.filter(m => m.message?.toLowerCase().includes(searchTerm));
  }

  if (filtered.length === 0) {
    messagesContainer.appendChild(emptyState);
    emptyState.classList.remove("hidden");
    return;
  }
  emptyState.classList.add("hidden");

  filtered.forEach((msg, i) => {
    const card = document.createElement("div");
    card.className = "msg-card";
    card.style.animationDelay = `${i * 0.04}s`;
    const timeLabel = msg.createdAt ? formatDate(msg.createdAt.toDate()) : "À l'instant";
    card.innerHTML = `
      <div class="msg-text">${escapeHtml(msg.message)}</div>
      <div class="msg-time">🕐 ${timeLabel}</div>
    `;
    messagesContainer.appendChild(card);
  });
}

// ── EXPORT ──────────────────────────────
function exportMessages() {
  if (!allMessages.length) { showToast("⚠️ Aucun message à exporter !"); return; }
  const sorted = [...allMessages].sort((a, b) => (a.createdAt?.toMillis() || 0) - (b.createdAt?.toMillis() || 0));
  const lines = [
    "╔══════════════════════════════════════╗",
    "║  Webnote — Messages anonymes reçus  ║",
    "╚══════════════════════════════════════╝",
    `Exporté le : ${new Date().toLocaleString("fr-FR")}`,
    `Total : ${sorted.length} message(s)`,
    "━".repeat(40), "",
  ];
  sorted.forEach((m, i) => {
    const t = m.createdAt ? m.createdAt.toDate().toLocaleString("fr-FR") : "—";
    lines.push(`[${i + 1}] ${t}`);
    lines.push(`"${m.message}"`);
    lines.push("");
  });
  lines.push("━".repeat(40));
  lines.push("Webnote · webnote.");
  const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `webnote-messages-${new Date().toISOString().slice(0,10)}.txt`;
  a.click(); URL.revokeObjectURL(a.href);
  showToast("📄 Export téléchargé !");
}

// ════════════════════════════════════════
//  SEND PAGE (publique)
// ════════════════════════════════════════
async function loadSendPage(username) {
  showPage("send");
  navLoginBtn?.classList.remove("hidden");
  navSignupBtn?.classList.remove("hidden");
  navUser?.classList.add("hidden");

  const q = query(collection(db, "users"), where("username", "==", username));
  const snap = await getDocs(q);

  if (snap.empty) {
    if (sendUsernameDisplay) sendUsernameDisplay.textContent = "utilisateur introuvable";
    if (sendAvatarEl) sendAvatarEl.textContent = "?";
    if (sendSubmit) sendSubmit.disabled = true;
    return;
  }

  const recipientData = snap.docs[0].data();
  const recipientId   = recipientData.uid;

  if (sendUsernameDisplay) sendUsernameDisplay.textContent = `@${recipientData.username}`;
  if (sendAvatarEl) sendAvatarEl.textContent = recipientData.username[0].toUpperCase();

  sendMessage?.addEventListener("input", () => {
    if (charCountEl) charCountEl.textContent = sendMessage.value.length;
  });

  sendSubmit?.addEventListener("click", async () => {
    const msg = sendMessage?.value.trim();
    sendError?.classList.add("hidden");
    if (!msg || msg.length < 2) return showErr(sendError, "Le message est trop court.");

    const span = sendSubmit.querySelector("span");
    if (span) span.textContent = "Envoi…";
    sendSubmit.disabled = true;

    try {
      await addDoc(collection(db, "messages"), {
        message: msg,
        recipientId,
        recipientUsername: recipientData.username,
        createdAt: serverTimestamp()
      });
      sendSubmit?.classList.add("hidden");
      sendMessage?.closest(".input-wrap")?.classList.add("hidden");
      document.querySelector(".char-count")?.classList.add("hidden");
      sendSuccess?.classList.remove("hidden");
    } catch (err) {
      const span = sendSubmit.querySelector("span");
      if (span) span.textContent = "Envoyer anonymement 🤍";
      sendSubmit.disabled = false;
      showErr(sendError, "Erreur lors de l'envoi. Réessaie.");
    }
  });
}

// ════════════════════════════════════════
//  HELPERS
// ════════════════════════════════════════
function showErr(el, msg) {
  if (!el) return;
  el.textContent = msg;
  el.classList.remove("hidden");
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g,"&amp;").replace(/</g,"&lt;")
    .replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

function formatDate(date) {
  const diff = Math.floor((Date.now() - date) / 1000);
  if (diff < 60)    return "À l'instant";
  if (diff < 3600)  return `Il y a ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `Il y a ${Math.floor(diff / 3600)}h`;
  return date.toLocaleDateString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

function firebaseErr(code) {
  const map = {
    "auth/email-already-in-use": "Cet email est déjà utilisé.",
    "auth/invalid-email":        "Email invalide.",
    "auth/weak-password":        "Mot de passe trop faible.",
    "auth/user-not-found":       "Aucun compte avec cet email.",
    "auth/wrong-password":       "Mot de passe incorrect.",
    "auth/invalid-credential":   "Email ou mot de passe incorrect.",
    "auth/too-many-requests":    "Trop de tentatives. Réessaie plus tard.",
  };
  return map[code] || "Une erreur s'est produite. Réessaie.";
}

