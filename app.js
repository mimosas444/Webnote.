// ═══════════════════════════════════════════
//  WEBNOTE — app.js
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

// ── Config ──────────────────────────────
const firebaseConfig = {
  apiKey: "AIzaSyASaooIcRrY2mwZiI3j5VwjHmmzY8XLIag",
  authDomain: "webnote-63e2b.firebaseapp.com",
  projectId: "webnote-63e2b",
  storageBucket: "webnote-63e2b.firebasestorage.app",
  messagingSenderId: "756128668649",
  appId: "1:756128668649:web:da1ac2ec48f661d1688978"
};

const app  = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getFirestore(app);

// ── URL params ──────────────────────────
const urlParams  = new URLSearchParams(window.location.search);
const targetUser = urlParams.get("user");

// ── State ───────────────────────────────
let allMessages  = [];
let currentFilter = "all";
let isGridView   = true;
let currentUser  = null;
let currentUsername = "";

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
  Object.values(pages).forEach(p => { p.style.display = "none"; p.classList.remove("active"); });
  pages[name].style.display = "flex";
  pages[name].classList.add("active");
}

// ─ Navbar ─
const navLoginBtn  = document.getElementById("nav-login-btn");
const navSignupBtn = document.getElementById("nav-signup-btn");
const navUser      = document.getElementById("nav-user");
const navUsername  = document.getElementById("nav-username");
const navAvatarLetter = document.getElementById("nav-avatar-letter");
const navLogoutBtn = document.getElementById("nav-logout-btn");

// ─ Auth tabs ─
const tabLogin   = document.getElementById("tab-login");
const tabSignup  = document.getElementById("tab-signup");
const tabSlider  = document.getElementById("tab-slider");
const formLogin  = document.getElementById("form-login");
const formSignup = document.getElementById("form-signup");

// ─ Login ─
const loginEmail    = document.getElementById("login-email");
const loginPassword = document.getElementById("login-password");
const loginError    = document.getElementById("login-error");
const loginSubmit   = document.getElementById("login-submit");

// ─ Signup ─
const signupUsername = document.getElementById("signup-username");
const signupEmail    = document.getElementById("signup-email");
const signupPassword = document.getElementById("signup-password");
const signupError    = document.getElementById("signup-error");
const signupSubmit   = document.getElementById("signup-submit");

// ─ Dashboard ─
const shareLink    = document.getElementById("share-link");
const copyLinkBtn  = document.getElementById("copy-link-btn");
const shareWa      = document.getElementById("share-wa");
const shareTw      = document.getElementById("share-tw");
const shareIg      = document.getElementById("share-ig");
const shareSnap    = document.getElementById("share-snap");
const messagesContainer = document.getElementById("messages-container");
const emptyState   = document.getElementById("empty-state");
const dashCount    = document.getElementById("dash-count");
const statTotal    = document.getElementById("stat-total");
const statToday    = document.getElementById("stat-today");
const statWeek     = document.getElementById("stat-week");
const refreshBtn   = document.getElementById("refresh-btn");

// ─ Send ─
const sendAvatarEl       = document.getElementById("send-avatar");
const sendUsernameDisplay = document.getElementById("send-username-display");
const sendMessage        = document.getElementById("send-message");
const sendSubmit         = document.getElementById("send-submit");
const sendError          = document.getElementById("send-error");
const sendSuccess        = document.getElementById("send-success");
const charCountEl        = document.getElementById("char-count");

// ─ Toast ─
const toast = document.getElementById("toast");

// ════════════════════════════════════════
//  TOAST
// ════════════════════════════════════════
function showToast(msg, duration = 2600) {
  toast.textContent = msg;
  toast.classList.remove("hidden");
  requestAnimationFrame(() => toast.classList.add("show"));
  setTimeout(() => {
    toast.classList.remove("show");
    setTimeout(() => toast.classList.add("hidden"), 300);
  }, duration);
}

// ════════════════════════════════════════
//  EYE TOGGLE (mot de passe)
// ════════════════════════════════════════
document.querySelectorAll(".eye-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    const input = document.getElementById(btn.dataset.target);
    const isPassword = input.type === "password";
    input.type = isPassword ? "text" : "password";
    btn.querySelector(".eye-open").classList.toggle("hidden", isPassword);
    btn.querySelector(".eye-closed").classList.toggle("hidden", !isPassword);
  });
});

// ════════════════════════════════════════
//  PASSWORD STRENGTH
// ════════════════════════════════════════
const sbars = [
  document.getElementById("sbar1"),
  document.getElementById("sbar2"),
  document.getElementById("sbar3"),
  document.getElementById("sbar4"),
];
const strengthLabel = document.getElementById("strength-label");

function getStrength(pwd) {
  let score = 0;
  if (pwd.length >= 6)  score++;
  if (pwd.length >= 10) score++;
  if (/[A-Z]/.test(pwd) && /[a-z]/.test(pwd)) score++;
  if (/[0-9]/.test(pwd) || /[^A-Za-z0-9]/.test(pwd)) score++;
  return score;
}

const strengthInfo = [
  { label: "", cls: "" },
  { label: "Faible",    cls: "weak" },
  { label: "Moyen",     cls: "fair" },
  { label: "Bon",       cls: "good" },
  { label: "Fort 💪",  cls: "strong" },
];

signupPassword.addEventListener("input", () => {
  const score = getStrength(signupPassword.value);
  sbars.forEach((b, i) => {
    b.className = "sbar";
    if (i < score) b.classList.add(strengthInfo[score].cls);
  });
  strengthLabel.textContent = signupPassword.value ? strengthInfo[score].label : "";
});

// ════════════════════════════════════════
//  AUTH STATE
// ════════════════════════════════════════
onAuthStateChanged(auth, async (user) => {
  if (targetUser) {
    await loadSendPage(targetUser);
    return;
  }
  if (user) {
    currentUser = user;
    navLoginBtn.classList.add("hidden");
    navSignupBtn.classList.add("hidden");
    navUser.classList.remove("hidden");

    const userDoc = await getDoc(doc(db, "users", user.uid));
    currentUsername = userDoc.exists() ? userDoc.data().username : user.email;
    navUsername.textContent = `@${currentUsername}`;
    navAvatarLetter.textContent = currentUsername[0].toUpperCase();

    document.getElementById("dash-username-title").textContent = currentUsername;
    document.getElementById("dash-avatar").textContent = currentUsername[0].toUpperCase();

    await loadDashboard(user, currentUsername);
    showPage("dashboard");
  } else {
    currentUser = null;
    navLoginBtn.classList.remove("hidden");
    navSignupBtn.classList.remove("hidden");
    navUser.classList.add("hidden");
    showPage("landing");
  }
});

// ════════════════════════════════════════
//  LANDING
// ════════════════════════════════════════
document.getElementById("landing-start-btn").addEventListener("click", () => {
  showAuthTab("signup");
  showPage("auth");
});
navLoginBtn.addEventListener("click",  () => { showAuthTab("login");  showPage("auth"); });
navSignupBtn.addEventListener("click", () => { showAuthTab("signup"); showPage("auth"); });

// ════════════════════════════════════════
//  AUTH TABS
// ════════════════════════════════════════
function showAuthTab(tab) {
  if (tab === "login") {
    tabLogin.classList.add("active");
    tabSignup.classList.remove("active");
    formLogin.classList.remove("hidden");
    formSignup.classList.add("hidden");
    tabSlider.classList.remove("right");
  } else {
    tabSignup.classList.add("active");
    tabLogin.classList.remove("active");
    formSignup.classList.remove("hidden");
    formLogin.classList.add("hidden");
    tabSlider.classList.add("right");
  }
}
tabLogin.addEventListener("click",  () => showAuthTab("login"));
tabSignup.addEventListener("click", () => showAuthTab("signup"));

// ════════════════════════════════════════
//  INSCRIPTION
// ════════════════════════════════════════
signupSubmit.addEventListener("click", async () => {
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
  } catch (err) {
    signupSubmit.querySelector("span").textContent = "Créer mon compte";
    signupSubmit.disabled = false;
    showErr(signupError, firebaseErrMsg(err.code));
  }
});

// ════════════════════════════════════════
//  CONNEXION
// ════════════════════════════════════════
loginSubmit.addEventListener("click", async () => {
  const email    = loginEmail.value.trim();
  const password = loginPassword.value;

  loginError.classList.add("hidden");
  if (!email || !password) return showErr(loginError, "Remplis tous les champs.");

  loginSubmit.querySelector("span").textContent = "Connexion…";
  loginSubmit.disabled = true;

  try {
    await signInWithEmailAndPassword(auth, email, password);
  } catch (err) {
    loginSubmit.querySelector("span").textContent = "Se connecter";
    loginSubmit.disabled = false;
    showErr(loginError, firebaseErrMsg(err.code));
  }
});

// ════════════════════════════════════════
//  DÉCONNEXION
// ════════════════════════════════════════
navLogoutBtn.addEventListener("click", async () => {
  await signOut(auth);
  showPage("landing");
});

// ════════════════════════════════════════
//  DASHBOARD
// ════════════════════════════════════════
async function loadDashboard(user, username) {
  const base = window.location.origin + window.location.pathname;
  const link = `${base}?user=${encodeURIComponent(username)}`;
  shareLink.textContent = link;

  // Copier
  copyLinkBtn.onclick = () => {
    navigator.clipboard.writeText(link).then(() => showToast("✅ Lien copié !"));
  };

  // WhatsApp
  shareWa.onclick = () => {
    window.open(`https://wa.me/?text=${encodeURIComponent(`Envoie-moi un message anonyme 👀\n${link}`)}`, "_blank");
  };

  // Twitter
  shareTw.onclick = () => {
    window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(`Envoie-moi un message anonyme 👀 ${link}`)}`, "_blank");
  };

  // Instagram (copier)
  shareIg.onclick = () => {
    navigator.clipboard.writeText(link).then(() => showToast("✅ Lien copié ! Colle-le dans ta bio Insta 📸"));
  };

  // Snapchat (copier)
  shareSnap.onclick = () => {
    navigator.clipboard.writeText(link).then(() => showToast("✅ Lien copié ! Partage-le sur Snap 👻"));
  };

  // Refresh
  refreshBtn.onclick = async () => {
    refreshBtn.style.transform = "rotate(360deg)";
    await fetchMessages(user);
    setTimeout(() => refreshBtn.style.transform = "", 500);
  };

  // Filtres
  document.getElementById("filter-all").onclick   = () => setFilter("all");
  document.getElementById("filter-today").onclick = () => setFilter("today");
  document.getElementById("filter-week").onclick  = () => setFilter("week");

  // Vue grille / liste
  document.getElementById("view-grid").onclick = () => setView(true);
  document.getElementById("view-list").onclick = () => setView(false);

  await fetchMessages(user);
}

async function fetchMessages(user) {
  const q = query(
    collection(db, "messages"),
    where("recipientId", "==", user.uid),
    orderBy("createdAt", "desc")
  );
  const snap = await getDocs(q);
  allMessages = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  updateStats();
  renderMessages();
}

function setFilter(f) {
  currentFilter = f;
  ["filter-all","filter-today","filter-week"].forEach(id => {
    document.getElementById(id).classList.remove("active");
  });
  document.getElementById(`filter-${f}`).classList.add("active");
  renderMessages();
}

function setView(grid) {
  isGridView = grid;
  document.getElementById("view-grid").classList.toggle("active", grid);
  document.getElementById("view-list").classList.toggle("active", !grid);
  messagesContainer.classList.toggle("list-view", !grid);
  renderMessages();
}

function updateStats() {
  const now   = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const week  = new Date(today); week.setDate(today.getDate() - 7);

  const todayMsgs = allMessages.filter(m => m.createdAt && m.createdAt.toDate() >= today);
  const weekMsgs  = allMessages.filter(m => m.createdAt && m.createdAt.toDate() >= week);

  animateCount(statTotal, allMessages.length);
  animateCount(statToday, todayMsgs.length);
  animateCount(statWeek,  weekMsgs.length);

  dashCount.textContent = allMessages.length === 0
    ? "Aucun message pour l'instant."
    : `${allMessages.length} message${allMessages.length > 1 ? "s" : ""} reçu${allMessages.length > 1 ? "s" : ""}`;
}

function animateCount(el, target) {
  let current = 0;
  const step = Math.ceil(target / 20);
  const timer = setInterval(() => {
    current = Math.min(current + step, target);
    el.textContent = current;
    if (current >= target) clearInterval(timer);
  }, 40);
}

function renderMessages() {
  messagesContainer.innerHTML = "";

  const now   = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const week  = new Date(today); week.setDate(today.getDate() - 7);

  let filtered = allMessages;
  if (currentFilter === "today") {
    filtered = allMessages.filter(m => m.createdAt && m.createdAt.toDate() >= today);
  } else if (currentFilter === "week") {
    filtered = allMessages.filter(m => m.createdAt && m.createdAt.toDate() >= week);
  }

  if (filtered.length === 0) {
    messagesContainer.appendChild(emptyState);
    return;
  }

  filtered.forEach((msg, i) => {
    const card = document.createElement("div");
    card.className = "msg-card";
    card.style.animationDelay = `${i * 0.05}s`;
    const timeLabel = msg.createdAt ? formatDate(msg.createdAt.toDate()) : "À l'instant";
    card.innerHTML = `
      <div class="msg-text">${escapeHtml(msg.message)}</div>
      <div class="msg-time">🕐 ${timeLabel}</div>
    `;
    messagesContainer.appendChild(card);
  });
}

// ════════════════════════════════════════
//  SEND PAGE (publique)
// ════════════════════════════════════════
async function loadSendPage(username) {
  showPage("send");
  navLoginBtn.classList.remove("hidden");
  navSignupBtn.classList.remove("hidden");
  navUser.classList.add("hidden");

  const q = query(collection(db, "users"), where("username", "==", username));
  const snap = await getDocs(q);

  if (snap.empty) {
    sendUsernameDisplay.textContent = "utilisateur introuvable";
    sendAvatarEl.textContent = "?";
    sendSubmit.disabled = true;
    return;
  }

  const recipientData = snap.docs[0].data();
  const recipientId   = recipientData.uid;

  sendUsernameDisplay.textContent = `@${recipientData.username}`;
  sendAvatarEl.textContent = recipientData.username[0].toUpperCase();

  sendMessage.addEventListener("input", () => {
    charCountEl.textContent = sendMessage.value.length;
  });

  sendSubmit.addEventListener("click", async () => {
    const msg = sendMessage.value.trim();
    sendError.classList.add("hidden");
    if (!msg || msg.length < 2) return showErr(sendError, "Le message est trop court.");

    sendSubmit.querySelector("span").textContent = "Envoi…";
    sendSubmit.disabled = true;

    try {
      await addDoc(collection(db, "messages"), {
        message: msg,
        recipientId,
        recipientUsername: recipientData.username,
        createdAt: serverTimestamp()
      });

      sendSubmit.classList.add("hidden");
      sendMessage.closest(".input-wrap")?.classList.add("hidden");
      document.querySelector(".char-count").classList.add("hidden");
      sendSuccess.classList.remove("hidden");
    } catch (err) {
      sendSubmit.querySelector("span").textContent = "Envoyer anonymement 🤍";
      sendSubmit.disabled = false;
      showErr(sendError, "Erreur lors de l'envoi. Réessaie.");
    }
  });
}

// ════════════════════════════════════════
//  HELPERS
// ════════════════════════════════════════
function showErr(el, msg) {
  el.textContent = msg;
  el.classList.remove("hidden");
}

function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function formatDate(date) {
  const diff = Math.floor((Date.now() - date) / 1000);
  if (diff < 60)    return "À l'instant";
  if (diff < 3600)  return `Il y a ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `Il y a ${Math.floor(diff / 3600)}h`;
  return date.toLocaleDateString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

function firebaseErrMsg(code) {
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

