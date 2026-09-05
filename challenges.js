import { getDatabase, ref, set, get, remove, onValue }
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";
import { getAuth, onAuthStateChanged }
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { initializeApp, getApps }
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";

const firebaseConfig = {
  apiKey: "AIzaSyAUdXVlmN9xhhIzubK0MTtGO3hA9JkHClA",
  authDomain: "faithchess.firebaseapp.com",
  databaseURL: "https://faithchess-default-rtdb.firebaseio.com",
  projectId: "faithchess",
  storageBucket: "faithchess.firebasestorage.app",
  messagingSenderId: "132292001988",
  appId: "1:132292001988:web:3c9b7227f1b09766b48991"
};

const app  = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
const db   = getDatabase(app);
const auth = getAuth(app);

let myUid      = null;
let myUsername = null;

// ── Toast ───────────────────────────────────────────────────
function showToast(msg) {
  const el = document.createElement("div");
  el.className = "app-toast";
  el.setAttribute("role", "status");
  el.style.cssText = `
    position:fixed;bottom:20px;right:20px;
    background:var(--bg2,#222);color:var(--text2,#fff);
    padding:10px 14px;border-radius:8px;z-index:9999;
    font-size:13px;border:1px solid var(--border,#333);
    font-family:'Outfit',sans-serif;
  `;
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2500);
}

// ── Update inbox UI ─────────────────────────────────────────
function updateInbox(challenges) {
  const listEl  = document.getElementById("inboxList");
  const badge   = document.getElementById("inboxBadge");
  if (!listEl || !badge) return;

  const entries = Object.entries(challenges);

  if (entries.length === 0) {
    badge.classList.add("hidden");
    listEl.replaceChildren();
    const empty = document.createElement("div");
    empty.className = "cog-item cog-note";
    empty.textContent = "No pending challenges";
    listEl.appendChild(empty);
    return;
  }

  badge.textContent = entries.length;
  badge.classList.remove("hidden");
  listEl.replaceChildren();

  for (const [fromUid, data] of entries) {
    const item = document.createElement("div");
    item.className = "challenge-item";
    const label = document.createElement("div");
    label.className = "challenge-label";
    label.textContent = `⚔ ${data?.fromUsername || "Player"}`;
    const actions = document.createElement("div");
    actions.className = "challenge-actions";
    const accept = document.createElement("button");
    accept.type = "button";
    accept.className = "challenge-accept";
    accept.textContent = "Accept";
    const decline = document.createElement("button");
    decline.type = "button";
    decline.className = "challenge-decline";
    decline.textContent = "Decline";
    actions.append(accept, decline);
    item.append(label, actions);
    accept.onclick = e => {
      e.stopPropagation();
      acceptChallenge(fromUid, data);
    };
    decline.onclick = e => {
      e.stopPropagation();
      declineChallenge(fromUid);
    };
    listEl.appendChild(item);
  }
}

// ── Send Challenge ──────────────────────────────────────────
window.sendChallenge = async function(toUid, toUsername) {
  if (!myUid) {
    showToast("Log in to send a challenge");
    return false;
  }

  try {
    const already = await get(ref(db, `challenges/${toUid}/${myUid}`));
    if (already.exists()) { showToast("Already challenged"); return false; }

    await set(ref(db, `challenges/${toUid}/${myUid}`), {
      fromUid: myUid,
      fromUsername: myUsername,
      toUid,
      toUsername,
      sentAt: Date.now(),
    });

    showToast(`Challenge sent to ${toUsername}!`);
    return true;
  } catch (error) {
    console.error("Challenge could not be sent.", error);
    showToast("Challenge could not be sent. Try again.");
    return false;
  }
};

// ── Accept Challenge ────────────────────────────────────────
async function acceptChallenge(fromUid, data) {
  const gameId = crypto.randomUUID();

  await set(ref(db, `games/${gameId}`), {
    white:     { uid: fromUid, username: data.fromUsername },
    black:     { uid: myUid,   username: myUsername },
    moves:     [],
    status:    "playing",
    createdAt: Date.now(),
  });

  await set(ref(db, `users/${fromUid}/currentGame`), gameId);
  await set(ref(db, `users/${myUid}/currentGame`),   gameId);
  await remove(ref(db, `challenges/${myUid}/${fromUid}`));

  window.location.href = `play.html?challenge=${gameId}&color=black`;
}

// ── Decline Challenge ───────────────────────────────────────
async function declineChallenge(fromUid) {
  await remove(ref(db, `challenges/${myUid}/${fromUid}`));
  showToast("Challenge declined");
}

// ── Listen for incoming challenges ──────────────────────────
function listenForChallenges(uid) {
  onValue(ref(db, `challenges/${uid}`), snap => {
    updateInbox(snap.val() || {});
  });
}

// ── Init ────────────────────────────────────────────────────
onAuthStateChanged(auth, async user => {
  if (!user) return;
  myUid = user.uid;
  const snap = await get(ref(db, `users/${user.uid}/username`));
  myUsername = snap.val() || user.email;
  listenForChallenges(myUid);
});
