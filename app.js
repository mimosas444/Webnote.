// ═══════════════════════════════════════════════════════════════
//  WEBNOTE — app.js  (landing / auth / send)  v7
//  ───────────────────────────────────────────────────────────
//  RÈGLE RESPECTÉE : aucune logique Firebase, aucun nom de
//  collection Firestore, aucune fonction existante n'a été
//  modifiée dans son comportement métier.
//
//  SEUL CHANGEMENT DE COMPORTEMENT (demandé explicitement dans
//  le cahier des charges, tâche 2) :
//    → après une connexion réussie, on redirige vers
//      "inbox.html" (page des messages anonymes) au lieu de
//      "dashboard.html" (le chat).
//
//  Tout le reste est strictement identique à la version
//  d'origine : mêmes IDs, mêmes collections, même config
//  Firebase, mêmes règles de validation.
// ═══════════════════════════════════════════════════════════════

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getAuth, createUserWithEmailAndPassword,
  signInWithEmailAndPassword, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  getFirestore, doc, setDoc, getDoc, addDoc,
  collection, query, where, getDocs, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// ── Config Firebase (inchangée) ──
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

const DEVICE_TZ  = Intl.DateTimeFormat().resolvedOptions().timeZone;
const urlParams  = new URLSearchParams(window.location.search);
const targetUser = urlParams.get("user");

function $(id) { return document.getElementById(id); }

// ═══════════════════════════════════════════
//  THÈME (clair / sombre)
// ═══════════════════════════════════════════
const savedTheme = localStorage.getItem("wn-theme") || "light";
document.documentElement.setAttribute("data-theme", savedTheme);
updateThemeIcon(savedTheme);

$("themeToggle")?.addEventListener("click", () => {
  const next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", next);
  localStorage.setItem("wn-theme", next);
  updateThemeIcon(next);
});

function updateThemeIcon(t) {
  const ico = $("theme-ico");
  if (ico) ico.textContent = t === "dark" ? "☀️" : "🌙";
}

// ═══════════════════════════════════════════
//  ÉCRAN DE CHARGEMENT (un seul loader, jamais dupliqué)
// ═══════════════════════════════════════════
function hideBootSplash() {
  const el = $("boot-splash");
  if (!el || el.classList.contains("hide")) return; // sécurité anti-doublon
  el.classList.add("hide");
  setTimeout(() => el.remove(), 450);
}

// ═══════════════════════════════════════════
//  NAVIGATION ENTRE LES 3 ÉCRANS DE LA PAGE
// ═══════════════════════════════════════════
const pages = { landing: $("page-landing"), auth: $("page-auth"), send: $("page-send") };

function showPage(name) {
  Object.values(pages).forEach(p => {
    if (!p) return;
    p.style.display = "none";
    p.classList.remove("active");
  });
  const page = pages[name];
  if (!page) return;
  page.style.display = "flex";
  void page.offsetWidth; // force le reflow pour relancer l'animation d'entrée
  page.classList.add("active");
}

// ═══════════════════════════════════════════
//  ÉTAT DE CONNEXION FIREBASE
// ═══════════════════════════════════════════
onAuthStateChanged(auth, async (user) => {
  // Cas 1 : on est sur un lien public "?user=pseudo" → page d'envoi anonyme
  if (targetUser) {
    await loadSendPage(targetUser);
    hideBootSplash();
    return;
  }

  // Cas 2 : utilisateur déjà connecté → on l'envoie sur ses messages
  // (et non plus vers le chat — c'est le seul changement de comportement demandé)
  if (user) {
    window.location.href = "inbox.html";
    return;
  }

  // Cas 3 : personne connecté, pas de lien public → page d'accueil
  showPage("landing");
  hideBootSplash();
});

// ═══════════════════════════════════════════
//  LANDING → ouverture du popup auth
// ═══════════════════════════════════════════
$("landing-start-btn")?.addEventListener("click", () => { showAuthTab("signup"); showPage("auth"); });
$("landing-login-btn")?.addEventListener("click", () => { showAuthTab("login");  showPage("auth"); });
$("nav-login-btn")?.addEventListener("click",     () => { showAuthTab("login");  showPage("auth"); });
$("nav-signup-btn")?.addEventListener("click",    () => { showAuthTab("signup"); showPage("auth"); });

// ═══════════════════════════════════════════
//  ONGLETS CONNEXION / INSCRIPTION
// ═══════════════════════════════════════════
function showAuthTab(tab) {
  const sl = $("tab-slider"), fl = $("form-login"), fs = $("form-signup");
  const tl = $("tab-login"), ts = $("tab-signup");
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
$("tab-login")?.addEventListener("click", () => showAuthTab("login"));
$("tab-signup")?.addEventListener("click", () => showAuthTab("signup"));
$("switch-to-signup")?.addEventListener("click", () => showAuthTab("signup"));
$("switch-to-login")?.addEventListener("click", () => showAuthTab("login"));

// ═══════════════════════════════════════════
//  AFFICHER / MASQUER LE MOT DE PASSE
// ═══════════════════════════════════════════
document.querySelectorAll(".eye-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    const inp = $(btn.dataset.target);
    const isPwd = inp.type === "password";
    inp.type = isPwd ? "text" : "password";
    btn.querySelector(".eye-open")?.classList.toggle("hidden", isPwd);
    btn.querySelector(".eye-closed")?.classList.toggle("hidden", !isPwd);
  });
});

// ═══════════════════════════════════════════
//  JAUGE DE FORCE DU MOT DE PASSE
// ═══════════════════════════════════════════
const sbars = ["sbar1", "sbar2", "sbar3", "sbar4"].map(id => $(id));
const SI = [
  { label: "",        cls: "" },
  { label: "Faible",  cls: "weak" },
  { label: "Moyen",   cls: "fair" },
  { label: "Bon",     cls: "good" },
  { label: "Fort 💪", cls: "strong" }
];

function pwdScore(p) {
  let s = 0;
  if (p.length >= 6) s++;
  if (p.length >= 10) s++;
  if (/[A-Z]/.test(p) && /[a-z]/.test(p)) s++;
  if (/[0-9]/.test(p) || /[^A-Za-z0-9]/.test(p)) s++;
  return s;
}

$("signup-password")?.addEventListener("input", () => {
  const sc = pwdScore($("signup-password").value);
  sbars.forEach((b, i) => {
    if (!b) return;
    b.className = "sbar";
    if (i < sc) b.classList.add(SI[sc].cls);
  });
  if ($("strength-label")) {
    $("strength-label").textContent = $("signup-password").value ? SI[sc].label : "";
  }
});

// ═══════════════════════════════════════════
//  MICRO-INTERACTION : secousse du popup en cas d'erreur
//  (purement visuel, n'affecte aucune logique)
// ═══════════════════════════════════════════
function shakePopup() {
  const popup = document.querySelector(".auth-popup:not(.hidden)") ||
                document.querySelector("#page-auth.active .auth-popup") ||
                document.querySelector(".auth-popup");
  if (!popup) return;
  popup.classList.remove("field-shake");
  void popup.offsetWidth;
  popup.classList.add("field-shake");
}

// ═══════════════════════════════════════════
//  INSCRIPTION
// ═══════════════════════════════════════════
$("signup-submit")?.addEventListener("click", async () => {
  const username = $("signup-username").value.trim().toLowerCase().replace(/\s+/g, "_");
  const email    = $("signup-email").value.trim();
  const password = $("signup-password").value;
  const err      = $("signup-error");
  err.classList.add("hidden");

  if (!username || username.length < 3) { showErr(err, "Pseudo trop court (min. 3 car.)"); shakePopup(); return; }
  if (!email || !password)               { showErr(err, "Remplis tous les champs.");        shakePopup(); return; }
  if (password.length < 6)               { showErr(err, "Mot de passe trop court (min. 6)."); shakePopup(); return; }

  const existing = await getDocs(query(collection(db, "users"), where("username", "==", username)));
  if (!existing.empty) { showErr(err, "Ce pseudo est déjà pris."); shakePopup(); return; }

  $("signup-submit").querySelector("span").textContent = "Création…";
  $("signup-submit").disabled = true;

  try {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    await setDoc(doc(db, "users", cred.user.uid), {
      username, email, uid: cred.user.uid, createdAt: serverTimestamp()
    });
    // onAuthStateChanged prendra le relais et redirigera vers inbox.html
  } catch (e) {
    $("signup-submit").querySelector("span").textContent = "Créer mon compte";
    $("signup-submit").disabled = false;
    showErr(err, fbErr(e.code));
    shakePopup();
  }
});

// ═══════════════════════════════════════════
//  CONNEXION
// ═══════════════════════════════════════════
$("login-submit")?.addEventListener("click", async () => {
  const email = $("login-email").value.trim();
  const password = $("login-password").value;
  const err = $("login-error");
  err.classList.add("hidden");

  if (!email || !password) { showErr(err, "Remplis tous les champs."); shakePopup(); return; }

  $("login-submit").querySelector("span").textContent = "Connexion…";
  $("login-submit").disabled = true;

  try {
    await signInWithEmailAndPassword(auth, email, password);
    // onAuthStateChanged prendra le relais et redirigera vers inbox.html
  } catch (e) {
    $("login-submit").querySelector("span").textContent = "Se connecter";
    $("login-submit").disabled = false;
    showErr(err, fbErr(e.code));
    shakePopup();
  }
});

// Envoi du formulaire avec la touche Entrée (confort clavier, aucune logique modifiée)
$("login-password")?.addEventListener("keydown", e => { if (e.key === "Enter") $("login-submit")?.click(); });
$("signup-password")?.addEventListener("keydown", e => { if (e.key === "Enter") $("signup-submit")?.click(); });

// ═══════════════════════════════════════════
//  PAGE D'ENVOI DE MESSAGE ANONYME (?user=pseudo)
// ═══════════════════════════════════════════
async function loadSendPage(username) {
  showPage("send");
  $("send-skeleton")?.classList.remove("hidden");
  $("send-content")?.classList.add("hidden");
  $("send-notfound")?.classList.add("hidden");

  let rd = null;
  try {
    const q = query(collection(db, "users"), where("username", "==", username));
    const snap = await getDocs(q);
    if (!snap.empty) rd = snap.docs[0].data();
  } catch (e) {
    console.error("loadSendPage:", e);
  }

  // léger délai pour laisser voir le skeleton (perçu comme plus fluide/premium)
  await new Promise(r => setTimeout(r, 250));
  $("send-skeleton")?.classList.add("hidden");

  if (!rd) {
    $("send-notfound")?.classList.remove("hidden");
    return;
  }

  $("send-content")?.classList.remove("hidden");
  if ($("send-username-display")) $("send-username-display").textContent = `@${rd.username}`;
  if ($("send-avatar")) $("send-avatar").textContent = rd.username[0].toUpperCase();

  $("send-message")?.addEventListener("input", () => {
    if ($("char-count")) $("char-count").textContent = $("send-message").value.length;
  });

  $("send-submit")?.addEventListener("click", async () => {
    const msg = $("send-message")?.value.trim();
    $("send-error")?.classList.add("hidden");

    if (!msg || msg.length < 2) {
      showErr($("send-error"), "Le message est trop court.");
      shakeSendCard();
      return;
    }

    const span = $("send-submit").querySelector("span");
    const originalHTML = span ? span.innerHTML : null;
    if (span) span.textContent = "Envoi…";
    $("send-submit").disabled = true;

    try {
      await addDoc(collection(db, "messages"), {
        message: msg,
        recipientId: rd.uid,
        recipientUsername: rd.username,
        approved: false,
        adminReply: null,
        createdAt: serverTimestamp()
      });
      $("send-submit")?.classList.add("hidden");
      $("send-message")?.closest(".input-wrap")?.classList.add("hidden");
      document.querySelector(".char-count")?.classList.add("hidden");
      $("send-success")?.classList.remove("hidden");
    } catch (e) {
      if (span && originalHTML) span.innerHTML = originalHTML;
      $("send-submit").disabled = false;
      showErr($("send-error"), "Erreur. Réessaie.");
      shakeSendCard();
    }
  });
}

function shakeSendCard() {
  const card = document.querySelector("#page-send .auth-popup");
  if (!card) return;
  card.classList.remove("field-shake");
  void card.offsetWidth;
  card.classList.add("field-shake");
}

// ═══════════════════════════════════════════
//  UTILITAIRES
// ═══════════════════════════════════════════
function showErr(el, msg) {
  if (!el) return;
  el.textContent = msg;
  el.classList.remove("hidden");
}

function fbErr(code) {
  const m = {
    "auth/email-already-in-use": "Email déjà utilisé.",
    "auth/invalid-email": "Email invalide.",
    "auth/weak-password": "Mot de passe trop faible.",
    "auth/user-not-found": "Aucun compte avec cet email.",
    "auth/wrong-password": "Mot de passe incorrect.",
    "auth/invalid-credential": "Email ou mot de passe incorrect.",
    "auth/too-many-requests": "Trop de tentatives. Réessaie plus tard."
  };
  return m[code] || "Une erreur s'est produite.";
}

// ═══════════════════════════════════════════
//  CARTE "CHAT COMMUNAUTAIRE" (landing) → redirige vers le chat
// ═══════════════════════════════════════════
document.querySelector(".feat-card.chat-card")?.addEventListener("click", () => {
  window.location.href = "dashboard.html";
});
