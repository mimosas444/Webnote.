// ═══════════════════════════════════════════
//  WEBNOTE — app.js
// ═══════════════════════════════════════════

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  addDoc,
  collection,
  query,
  where,
  orderBy,
  getDocs,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// ── Firebase config ──────────────────────
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

// ═══════════════════════════════════════════
//  ROUTING — détecte ?user=xxx dans l'URL
// ═══════════════════════════════════════════
const urlParams  = new URLSearchParams(window.location.search);
const targetUser = urlParams.get("user"); // page d'envoi public

// ════════════════════════════════════════════
//  PAGES & ÉLÉMENTS
// ════════════════════════════════════════════
const pages = {
  landing:   document.getElementById("page-landing"),
  auth:      document.getElementById("page-auth"),
  dashboard: document.getElementById("page-dashboard"),
  send:      document.getElementById("page-send"),
};

function showPage(name) {
  Object.values(pages).forEach(p => {
    p.classList.remove("active");
    p.style.display = "none";
  });
  pages[name].style.display = "flex";
  pages[name].classList.add("active");
}

// navbar
const navLoginBtn  = document.getElementById("nav-login-btn");
const navSignupBtn = document.getElementById("nav-signup-btn");
const navUser      = document.getElementById("nav-user");
const navUsername  = document.getElementById("nav-username");
const navLogoutBtn = document.getElementById("nav-logout-btn");

// auth tabs
const tabLogin    = document.getElementById("tab-login");
const tabSignup   = document.getElementById("tab-signup");
const formLogin   = document.getElementById("form-login");
const formSignup  = document.getElementById("form-signup");

// login
const loginEmail    = document.getElementById("login-email");
const loginPassword = document.getElementById("login-password");
const loginError    = document.getElementById("login-error");
const loginSubmit   = document.getElementById("login-submit");

// signup
const signupUsername = document.getElementById("signup-username");
const signupEmail    = document.getElementById("signup-email");
const signupPassword = document.getElementById("signup-password");
const signupError    = document.getElementById("signup-error");
const signupSubmit   = document.getElementById("signup-submit");

// dashboard
const shareLink      = document.getElementById("share-link");
const copyLinkBtn    = document.getElementById("copy-link-btn");
const shareWa        = document.getElementById("share-wa");
const shareTw        = document.getElementById("share-tw");
const messagesContainer = document.getElementById("messages-container");
const emptyState     = document.getElementById("empty-state");
const dashCount      = document.getElementById("dash-count");

// send
const sendAvatarEl      = document.getElementById("send-avatar");
const sendUsernameDisplay = document.getElementById("send-username-display");
const sendMessage       = document.getElementById("send-message");
const sendSubmit        = document.getElementById("send-submit");
const sendError         = document.getElementById("send-error");
const sendSuccess       = document.getElementById("send-success");
const charCountEl       = document.getElementById("char-count");

// toast
const toast = document.getElementById("toast");

// ════════════════════════════════════════════
//  TOAST
// ════════════════════════════════════════════
function showToast(msg, duration = 2500) {
  toast.textContent = msg;
  toast.classList.remove("hidden");
  toast.classList.add("show");
  setTimeout(() => {
    toast.classList.remove("show");
    setTimeout(() => toast.classList.add("hidden"), 300);
  }, duration);
}

// ════════════════════════════════════════════
//  AUTH STATE
// ════════════════════════════════════════════
onAuthStateChanged(auth, async (user) => {
  if (targetUser) {
    // PAGE PUBLIQUE D'ENVOI — peu importe si connecté ou pas
    await loadSendPage(targetUser);
    return;
  }

  if (user) {
    // Connecté → dashboard
    navLoginBtn.classList.add("hidden");
    navSignupBtn.classList.add("hidden");
    navUser.classList.remove("hidden");

    const userDoc = await getDoc(doc(db, "users", user.uid));
    const username = userDoc.exists() ? userDoc.data().username : user.email;
    navUsername.textContent = `@${username}`;

    await loadDashboard(user, username);
    showPage("dashboard");
  } else {
    // Non connecté
    navLoginBtn.classList.remove("hidden");
    navSignupBtn.classList.remove("hidden");
    navUser.classList.add("hidden");
    showPage("landing");
  }
});

// ════════════════════════════════════════════
//  LANDING
// ════════════════════════════════════════════
document.getElementById("landing-start-btn").addEventListener("click", () => {
  showAuthTab("signup");
  showPage("auth");
});

navLoginBtn.addEventListener("click", () => { showAuthTab("login"); showPage("auth"); });
navSignupBtn.addEventListener("click", () => { showAuthTab("signup"); showPage("auth"); });

// ════════════════════════════════════════════
//  AUTH TABS
// ════════════════════════════════════════════
function showAuthTab(tab) {
  if (tab === "login") {
    tabLogin.classList.add("active");
    tabSignup.classList.remove("active");
    formLogin.classList.remove("hidden");
    formSignup.classList.add("hidden");
  } else {
    tabSignup.classList.add("active");
    tabLogin.classList.remove("active");
    formSignup.classList.remove("hidden");
    formLogin.classList.add("hidden");
  }
}

tabLogin.addEventListener("click",  () => showAuthTab("login"));
tabSignup.addEventListener("click", () => showAuthTab("signup"));

// ════════════════════════════════════════════
//  INSCRIPTION
// ════════════════════════════════════════════
signupSubmit.addEventListener("click", async () => {
  const username = signupUsername.value.trim().toLowerCase().replace(/\s+/g, "_");
  const email    = signupEmail.value.trim();
  const password = signupPassword.value;

  signupError.classList.add("hidden");

  if (!username || username.length < 3) {
    return showErr(signupError, "Pseudo trop court (min. 3 caractères).");
  }
  if (!email || !password) {
    return showErr(signupError, "Remplis tous les champs.");
  }
  if (password.length < 6) {
    return showErr(signupError, "Mot de passe trop court (min. 6 caractères).");
  }

  // Vérifier si username déjà pris
  const usernameQuery = query(collection(db, "users"), where("username", "==", username));
  const existingUsers = await getDocs(usernameQuery);
  if (!existingUsers.empty) {
    return showErr(signupError, "Ce pseudo est déjà pris. Choisis-en un autre.");
  }

  signupSubmit.disabled = true;
  signupSubmit.textContent = "Création…";

  try {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    await setDoc(doc(db, "users", cred.user.uid), {
      username,
      email,
      uid: cred.user.uid,
      createdAt: serverTimestamp()
    });
    // onAuthStateChanged va prendre le relais
  } catch (err) {
    signupSubmit.disabled = false;
    signupSubmit.textContent = "Créer mon compte";
    showErr(signupError, firebaseErrMsg(err.code));
  }
});

// ════════════════════════════════════════════
//  CONNEXION
// ════════════════════════════════════════════
loginSubmit.addEventListener("click", async () => {
  const email    = loginEmail.value.trim();
  const password = loginPassword.value;

  loginError.classList.add("hidden");

  if (!email || !password) {
    return showErr(loginError, "Remplis tous les champs.");
  }

  loginSubmit.disabled = true;
  loginSubmit.textContent = "Connexion…";

  try {
    await signInWithEmailAndPassword(auth, email, password);
  } catch (err) {
    loginSubmit.disabled = false;
    loginSubmit.textContent = "Se connecter";
    showErr(loginError, firebaseErrMsg(err.code));
  }
});

// ════════════════════════════════════════════
//  DÉCONNEXION
// ════════════════════════════════════════════
navLogoutBtn.addEventListener("click", async () => {
  await signOut(auth);
  showPage("landing");
});

// ════════════════════════════════════════════
//  DASHBOARD
// ════════════════════════════════════════════
async function loadDashboard(user, username) {
  // Générer le lien de partage
  const base = window.location.origin + window.location.pathname;
  const link = `${base}?user=${encodeURIComponent(username)}`;
  shareLink.textContent = link;

  // Bouton copier
  copyLinkBtn.onclick = () => {
    navigator.clipboard.writeText(link).then(() => showToast("✅ Lien copié !"));
  };

  // WhatsApp
  shareWa.onclick = () => {
    const text = encodeURIComponent(`Envoie-moi un message anonyme 👀\n${link}`);
    window.open(`https://wa.me/?text=${text}`, "_blank");
  };

  // Twitter / X
  shareTw.onclick = () => {
    const text = encodeURIComponent(`Envoie-moi un message anonyme 👀 ${link}`);
    window.open(`https://twitter.com/intent/tweet?text=${text}`, "_blank");
  };

  // Charger les messages
  await refreshMessages(user);
}

async function refreshMessages(user) {
  messagesContainer.innerHTML = "";

  const q = query(
    collection(db, "messages"),
    where("recipientId", "==", user.uid),
    orderBy("createdAt", "desc")
  );

  const snapshot = await getDocs(q);

  if (snapshot.empty) {
    messagesContainer.appendChild(emptyState);
    dashCount.textContent = "Aucun message pour l'instant.";
    return;
  }

  dashCount.textContent = `${snapshot.size} message${snapshot.size > 1 ? "s" : ""} reçu${snapshot.size > 1 ? "s" : ""}`;

  snapshot.forEach((docSnap) => {
    const data = docSnap.data();
    const card = document.createElement("div");
    card.className = "msg-card";

    const timeLabel = data.createdAt
      ? formatDate(data.createdAt.toDate())
      : "À l'instant";

    card.innerHTML = `
      <div class="msg-text">${escapeHtml(data.message)}</div>
      <div class="msg-time">${timeLabel}</div>
    `;

    messagesContainer.appendChild(card);
  });
}

// ════════════════════════════════════════════
//  PAGE ENVOI (PUBLIQUE)
// ════════════════════════════════════════════
async function loadSendPage(username) {
  showPage("send");

  // Masquer navbar auth buttons — tout le monde peut envoyer
  navLoginBtn.classList.remove("hidden");
  navSignupBtn.classList.remove("hidden");
  navUser.classList.add("hidden");

  // Récupérer l'utilisateur cible par username
  const q = query(collection(db, "users"), where("username", "==", username));
  const snap = await getDocs(q);

  if (snap.empty) {
    sendUsernameDisplay.textContent = "utilisateur introuvable";
    sendAvatarEl.textContent = "?";
    sendSubmit.disabled = true;
    return;
  }

  const recipientDoc  = snap.docs[0];
  const recipientData = recipientDoc.data();
  const recipientId   = recipientData.uid;

  sendUsernameDisplay.textContent = `@${recipientData.username}`;
  sendAvatarEl.textContent = recipientData.username[0].toUpperCase();

  // Compteur de caractères
  sendMessage.addEventListener("input", () => {
    charCountEl.textContent = sendMessage.value.length;
  });

  // Envoi
  sendSubmit.addEventListener("click", async () => {
    const msg = sendMessage.value.trim();
    sendError.classList.add("hidden");

    if (!msg || msg.length < 2) {
      return showErr(sendError, "Le message est trop court.");
    }

    sendSubmit.disabled = true;
    sendSubmit.textContent = "Envoi…";

    try {
      await addDoc(collection(db, "messages"), {
        message: msg,
        recipientId,
        recipientUsername: recipientData.username,
        createdAt: serverTimestamp()
      });

      sendSubmit.classList.add("hidden");
      sendMessage.classList.add("hidden");
      document.querySelector(".char-count").classList.add("hidden");
      sendSuccess.classList.remove("hidden");

    } catch (err) {
      sendSubmit.disabled = false;
      sendSubmit.textContent = "Envoyer anonymement";
      showErr(sendError, "Erreur lors de l'envoi. Réessaie.");
      console.error(err);
    }
  });
}

// ════════════════════════════════════════════
//  HELPERS
// ════════════════════════════════════════════
function showErr(el, msg) {
  el.textContent = msg;
  el.classList.remove("hidden");
}

function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatDate(date) {
  const now = new Date();
  const diff = Math.floor((now - date) / 1000);
  if (diff < 60)  return "À l'instant";
  if (diff < 3600) return `Il y a ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `Il y a ${Math.floor(diff / 3600)}h`;
  return date.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

function firebaseErrMsg(code) {
  const map = {
    "auth/email-already-in-use":    "Cet email est déjà utilisé.",
    "auth/invalid-email":           "Email invalide.",
    "auth/weak-password":           "Mot de passe trop faible.",
    "auth/user-not-found":          "Aucun compte trouvé avec cet email.",
    "auth/wrong-password":          "Mot de passe incorrect.",
    "auth/invalid-credential":      "Email ou mot de passe incorrect.",
    "auth/too-many-requests":       "Trop de tentatives. Réessaie plus tard.",
  };
  return map[code] || "Une erreur s'est produite. Réessaie.";
}

