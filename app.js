// ═══════════════════════════════════════════
//  WEBNOTE — app.js  (landing / auth / send)  v6
// ═══════════════════════════════════════════

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getAuth, createUserWithEmailAndPassword,
  signInWithEmailAndPassword, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  getFirestore, doc, setDoc, getDoc, addDoc,
  collection, query, where, getDocs, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

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

const DEVICE_TZ = Intl.DateTimeFormat().resolvedOptions().timeZone;
const urlParams  = new URLSearchParams(window.location.search);
const targetUser = urlParams.get("user");

function $(id) { return document.getElementById(id); }

// ── THEME ──
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
  $("ico-moon")?.classList.toggle("hidden", t === "dark");
  $("ico-sun")?.classList.toggle("hidden", t !== "dark");
}

function hideBootSplash() {
  const el = $("boot-splash"); if (!el || el.classList.contains("hide")) return;
  el.classList.add("hide"); setTimeout(() => el.remove(), 450);
}

const pages = { landing: $("page-landing"), auth: $("page-auth"), send: $("page-send") };
function showPage(name) {
  Object.values(pages).forEach(p => { if (p) { p.style.display = "none"; p.classList.remove("active"); } });
  const page = pages[name]; if (!page) return;
  page.style.display = "flex"; void page.offsetWidth; page.classList.add("active");
}

// ── AUTH STATE ──
onAuthStateChanged(auth, async (user) => {
  if (targetUser) { await loadSendPage(targetUser); hideBootSplash(); return; }
  if (user) {
    // Connecté → direction la page "Mes messages" (messages anonymes)
    window.location.href = "inbox.html";
    return;
  }
  showPage("landing"); hideBootSplash();
});

// ── LANDING ──
$("landing-start-btn")?.addEventListener("click", () => { showAuthTab("signup"); showPage("auth"); });
$("landing-login-btn")?.addEventListener("click", () => { showAuthTab("login");  showPage("auth"); });

function showAuthTab(tab) {
  const sl = $("tab-slider"), fl = $("form-login"), fs = $("form-signup");
  const tl = $("tab-login"), ts = $("tab-signup");
  if (tab === "login") {
    tl.classList.add("active"); ts.classList.remove("active");
    fl.classList.remove("hidden"); fs.classList.add("hidden");
    sl.classList.remove("right"); $("login-error")?.classList.add("hidden");
  } else {
    ts.classList.add("active"); tl.classList.remove("active");
    fs.classList.remove("hidden"); fl.classList.add("hidden");
    sl.classList.add("right"); $("signup-error")?.classList.add("hidden");
  }
}
$("tab-login")?.addEventListener("click", () => showAuthTab("login"));
$("tab-signup")?.addEventListener("click", () => showAuthTab("signup"));
$("switch-to-signup")?.addEventListener("click", () => showAuthTab("signup"));
$("switch-to-login")?.addEventListener("click", () => showAuthTab("login"));

document.querySelectorAll(".eye-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    const inp = $(btn.dataset.target); const isPwd = inp.type === "password";
    inp.type = isPwd ? "text" : "password";
    btn.querySelector(".eye-open")?.classList.toggle("hidden", isPwd);
    btn.querySelector(".eye-closed")?.classList.toggle("hidden", !isPwd);
  });
});

const sbars = ["sbar1","sbar2","sbar3","sbar4"].map(id => $(id));
const SI = [{label:"",cls:""},{label:"Faible",cls:"weak"},{label:"Moyen",cls:"fair"},{label:"Bon",cls:"good"},{label:"Fort 💪",cls:"strong"}];
function pwdScore(p){let s=0;if(p.length>=6)s++;if(p.length>=10)s++;if(/[A-Z]/.test(p)&&/[a-z]/.test(p))s++;if(/[0-9]/.test(p)||/[^A-Za-z0-9]/.test(p))s++;return s;}
$("signup-password")?.addEventListener("input", () => {
  const sc = pwdScore($("signup-password").value);
  sbars.forEach((b,i) => { if(!b) return; b.className="sbar"; if(i<sc) b.classList.add(SI[sc].cls); });
  if ($("strength-label")) $("strength-label").textContent = $("signup-password").value ? SI[sc].label : "";
});

$("signup-submit")?.addEventListener("click", async () => {
  const username = $("signup-username").value.trim().toLowerCase().replace(/\s+/g,"_");
  const email    = $("signup-email").value.trim();
  const password = $("signup-password").value;
  const err      = $("signup-error");
  err.classList.add("hidden");
  if (!username || username.length < 3) return showErr(err, "Pseudo trop court (min. 3 car.)");
  if (!email || !password) return showErr(err, "Remplis tous les champs.");
  if (password.length < 6) return showErr(err, "Mot de passe trop court (min. 6).");
  const existing = await getDocs(query(collection(db,"users"), where("username","==",username)));
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

$("login-submit")?.addEventListener("click", async () => {
  const email = $("login-email").value.trim(), password = $("login-password").value;
  const err = $("login-error"); err.classList.add("hidden");
  if (!email || !password) return showErr(err, "Remplis tous les champs.");
  $("login-submit").querySelector("span").textContent = "Connexion…";
  $("login-submit").disabled = true;
  try { await signInWithEmailAndPassword(auth, email, password); }
  catch (e) {
    $("login-submit").querySelector("span").textContent = "Se connecter";
    $("login-submit").disabled = false;
    showErr(err, fbErr(e.code));
  }
});

// ── SEND PAGE ──
async function loadSendPage(username) {
  showPage("send");
  $("send-skeleton")?.classList.remove("hidden");
  $("send-content")?.classList.add("hidden");
  $("send-notfound")?.classList.add("hidden");

  let rd = null;
  try {
    const q = query(collection(db,"users"), where("username","==",username));
    const snap = await getDocs(q);
    if (!snap.empty) rd = snap.docs[0].data();
  } catch (e) { console.error("loadSendPage:", e); }

  await new Promise(r => setTimeout(r, 250));
  $("send-skeleton")?.classList.add("hidden");

  if (!rd) { $("send-notfound")?.classList.remove("hidden"); return; }

  $("send-content")?.classList.remove("hidden");
  if ($("send-username-display")) $("send-username-display").textContent = `@${rd.username}`;
  if ($("send-avatar")) $("send-avatar").textContent = rd.username[0].toUpperCase();

  $("send-message")?.addEventListener("input", () => { if ($("char-count")) $("char-count").textContent = $("send-message").value.length; });
  $("send-submit")?.addEventListener("click", async () => {
    const msg = $("send-message")?.value.trim();
    $("send-error")?.classList.add("hidden");
    if (!msg || msg.length < 2) return showErr($("send-error"), "Le message est trop court.");
    const span = $("send-submit").querySelector("span"); if (span) span.textContent = "Envoi…";
    $("send-submit").disabled = true;
    try {
      await addDoc(collection(db,"messages"), { message: msg, recipientId: rd.uid, recipientUsername: rd.username, approved: false, adminReply: null, createdAt: serverTimestamp() });
      $("send-submit")?.classList.add("hidden");
      $("send-message")?.closest(".input-wrap")?.classList.add("hidden");
      document.querySelector(".char-count")?.classList.add("hidden");
      $("send-success")?.classList.remove("hidden");
    } catch (e) {
      if (span) span.textContent = "Envoyer anonymement 🤍";
      $("send-submit").disabled = false;
      showErr($("send-error"), "Erreur. Réessaie.");
    }
  });
}

function showErr(el, msg) { if (!el) return; el.textContent = msg; el.classList.remove("hidden"); }
function fbErr(code) {
  const m = { "auth/email-already-in-use":"Email déjà utilisé.","auth/invalid-email":"Email invalide.","auth/weak-password":"Mot de passe trop faible.","auth/user-not-found":"Aucun compte avec cet email.","auth/wrong-password":"Mot de passe incorrect.","auth/invalid-credential":"Email ou mot de passe incorrect.","auth/too-many-requests":"Trop de tentatives. Réessaie plus tard." };
  return m[code] || "Une erreur s'est produite.";
}
