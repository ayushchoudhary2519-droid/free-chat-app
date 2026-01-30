const socket = io();

const me = localStorage.getItem("me");
if (!me) location.href = "/";

const inbox = document.getElementById("inbox");
const messagesDiv = document.getElementById("messages");
const header = document.getElementById("chatHeader");
const msgInput = document.getElementById("msg");
const sendBtn = document.getElementById("sendBtn");

let currentChat = null;
let unread = {};
let typingTimeout = null;

// LOGIN
socket.emit("login", me, res => {
  if (!res.ok) location.href = "/";
});

// USER LIST
socket.on("userList", users => {
  inbox.innerHTML = "";

  users
    .filter(u => u.name !== me)
    .forEach(u => {
      const div = document.createElement("div");
      div.className = "inbox-user";
      if (u.name === currentChat) div.classList.add("active");

      const badge = unread[u.name]
        ? `<span class="badge">${unread[u.name]}</span>`
        : "";

      const status = u.online
        ? "Online"
        : u.lastSeen
        ? "Last seen " + new Date(u.lastSeen).toLocaleTimeString()
        : "Offline";

      div.innerHTML = `
        <div class="name">${u.name} ${badge}</div>
        <div class="status">${status}</div>
      `;

      div.onclick = () => openChat(u.name);
      inbox.appendChild(div);
    });
});

// OPEN CHAT
function openChat(user) {
  currentChat = user;
  unread[user] = 0;
  messagesDiv.innerHTML = "";
  header.textContent = user;

  socket.emit("activeChat", user);
  socket.emit("loadMessages", user, msgs => {
    msgs.forEach(showMessage);
    socket.emit("readMessages", user);
  });
}

// SEND
function send(e) {
  if (e.key === "Enter") sendClick();
}

function sendClick() {
  if (!msgInput.value || !currentChat) return;

  socket.emit("sendMessage", {
    to: currentChat,
    text: msgInput.value
  });

  msgInput.value = "";
  updateSendState();
}

// RECEIVE MESSAGE
socket.on("message", msg => {
  if (msg.from === currentChat || msg.to === currentChat) {
    showMessage(msg);
    if (msg.from === currentChat) {
      socket.emit("readMessages", currentChat);
    }
  } else {
    unread[msg.from] = (unread[msg.from] || 0) + 1;
  }
});

// READ UPDATE
socket.on("readUpdate", () => {
  socket.emit("loadMessages", currentChat, msgs => {
    messagesDiv.innerHTML = "";
    msgs.forEach(showMessage);
  });
});

// TYPING
msgInput.addEventListener("input", () => {
  updateSendState();
  if (!currentChat) return;

  socket.emit("typing", currentChat);
  clearTimeout(typingTimeout);
  typingTimeout = setTimeout(() => {
    socket.emit("stopTyping", currentChat);
  }, 800);
});

socket.on("typing", user => {
  if (user === currentChat) {
    header.innerHTML = `${user} <span class="typing">typing…</span>`;
  }
});

socket.on("stopTyping", user => {
  if (user === currentChat) header.textContent = user;
});

// UI
function showMessage(m) {
  const bubble = document.createElement("div");
  bubble.className =
    "message " + (m.from === me ? "sent" : "received");

  const text = document.createElement("div");
  text.textContent = m.text;

  const meta = document.createElement("div");
  meta.className = "meta";

  if (m.from === me) {
    let metaText = `✓ ${new Date(m.time).toLocaleTimeString()}`;

    if (m.read && m.readTime) {
      metaText += `  ✓✓ ${new Date(m.readTime).toLocaleTimeString()}`;
    }

    meta.textContent = metaText;
  } else {
    meta.textContent = new Date(m.time).toLocaleTimeString();
  }

  bubble.appendChild(text);
  bubble.appendChild(meta);
  messagesDiv.appendChild(bubble);
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
}


// SEND BUTTON STATE
function updateSendState() {
  sendBtn.disabled = !msgInput.value.trim();
}
updateSendState();
