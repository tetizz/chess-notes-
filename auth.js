import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getDatabase, ref, set, onValue, get } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyAUdXVlmN9xhhIzubK0MTtGO3hA9JkHClA",
  authDomain: "faithchess.firebaseapp.com",
  databaseURL: "https://faithchess-default-rtdb.firebaseio.com",
  projectId: "faithchess",
  storageBucket: "faithchess.firebasestorage.app",
  messagingSenderId: "132292001988",
  appId: "1:132292001988:web:3c9b7227f1b09766b48991",
};

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
const db = getDatabase(app);
const auth = getAuth(app);

window.firebaseDb = db;
window.firebaseRef = ref;
window.firebaseSet = set;
window.firebaseOnValue = onValue;
window.firebaseAuth = auth;
window.firebaseSignOut = signOut;
window.firebaseOnAuthChanged = onAuthStateChanged;

const NAV_TITLES = {
  dev: { label: "DEV", color: "#74ebcb" },
  gm: { label: "GM", color: "#f0c040" },
  im: { label: "IM", color: "#d8d8d8" },
  fm: { label: "FM", color: "#d4956a" },
  cm: { label: "CM", color: "#7ecf7e" },
  nm: { label: "NM", color: "#7ab8e0" },
  mod: { label: "Mod", color: "#f08080" },
};

function menuLink(label, href) {
  const link = document.createElement("a");
  link.className = "cog-item";
  link.href = href;
  link.textContent = label;
  link.setAttribute("role", "menuitem");
  return link;
}

function signedOutMenu(dropdown) {
  dropdown.replaceChildren(
    menuLink("Log in", "login.html"),
    menuLink("Create account", "signup.html"),
  );
}

function signedInMenu(dropdown, username, titleInfo) {
  const userRow = document.createElement("div");
  userRow.className = "cog-item cog-user";
  userRow.textContent = username;
  if (titleInfo) {
    const title = document.createElement("span");
    title.className = "nav-title";
    title.style.color = titleInfo.color;
    title.textContent = titleInfo.label;
    userRow.prepend(title);
  }

  const settingsLink = menuLink("Settings", "settings.html");
  const signOutBtn = document.createElement("button");
  signOutBtn.type = "button";
  signOutBtn.id = "signOutBtn";
  signOutBtn.className = "cog-item";
  signOutBtn.setAttribute("role", "menuitem");
  signOutBtn.textContent = "Sign out";
  signOutBtn.addEventListener("click", async () => {
    signOutBtn.disabled = true;
    signOutBtn.textContent = "Signing out…";
    try {
      await signOut(auth);
      window.location.reload();
    } catch (error) {
      signOutBtn.disabled = false;
      signOutBtn.textContent = "Try signing out again";
      console.error("Sign out failed.", error);
    }
  });

  dropdown.replaceChildren(userRow, settingsLink, signOutBtn);
}

onAuthStateChanged(auth, async user => {
  const dropdown = document.getElementById("cogDropdown");
  const navUser = document.getElementById("navUsername");
  if (!dropdown) return;

  if (!user) {
    navUser?.classList.add("hidden");
    signedOutMenu(dropdown);
    return;
  }

  let username = user.email || "Player";
  let titleInfo = null;
  try {
    const [usernameSnap, titleSnap, avatarSnap] = await Promise.all([
      get(ref(db, `users/${user.uid}/username`)),
      get(ref(db, `users/${user.uid}/title`)),
      get(ref(db, `users/${user.uid}/avatarUrl`)),
    ]);
    username = usernameSnap.val() || username;
    titleInfo = NAV_TITLES[titleSnap.val()] || null;
    window.myAvatarUrl = avatarSnap.val() || null;
  } catch (error) {
    console.warn("Signed in, but profile details are temporarily unavailable.", error);
  }

  if (navUser) {
    navUser.textContent = username;
    navUser.classList.remove("hidden");
  }
  signedInMenu(dropdown, username, titleInfo);
}, error => {
  console.warn("Authentication status is temporarily unavailable.", error);
});
