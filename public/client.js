/* ================== SOCKET ================== */
const socket = io({
  transports: ["websocket"]
});

/* ================== STATE ================== */
const me = localStorage.getItem("me");

const inbox = document.getElementById("inbox");
const messagesDiv = document.getElementById("messages");
const header = document.getElementById("chatHeader");
const msgInput = document.getElementById("msg");

let currentChat = null;
let usersState = { online: [], lastSeen: {} };
let isTabVisible = true;

/* ================== TAB VISIBILITY ================== */
document.addEventListener("visibilitychange", () => {
  isTabVisible = !document.hidden;

  if (currentChat && isTabVisible) {
    socket.emit("read", currentChat);
  }
});

/* ================== USER LIST ================== */
socket.on("userList", data => {
  usersState = data;
  inbox.innerHTML = "";

  data.online.forEach(username => {
    if (username === me) return;

    const div = document.createElement("div");
    div.className = "inbox-user";
    if (username === currentChat) div.classList.add("active");

    div.innerHTML = `
      <div class="name">${username}</div>
      <div class="status">Online</div>
    `;

    div.onclick = () => openChat(username);
    inbox.appendChild(div);
  });

  Object.keys(data.lastSeen).forEach(username => {
    if (username === me || data.online.includes(username)) return;

    const div = document.createElement("div");
    div.className = "inbox-user";

    div.innerHTML = `
      <div class="name">${username}</div>
      <div class="status">
        Last seen ${new Date(data.lastSeen[username]).toLocaleTimeString()}
      </div>
    `;

    div.onclick = () => openChat(username);
    inbox.appendChild(div);
  });
});

/* ================== OPEN CHAT ================== */
function openChat(user) {
  currentChat = user;
  messagesDiv.innerHTML = "";

  const isOnline = usersState.online.includes(user);
  const lastSeen = usersState.lastSeen[user];

  header.innerHTML = `
    <div>${user}</div>
    <div class="status">
      ${isOnline ? "Online" : lastSeen ? `Last seen ${new Date(lastSeen).toLocaleTimeString()}` : ""}
    </div>
  `;

  socket.emit("loadMessages", user, msgs => {
    msgs.forEach(showMessage);
    socket.emit("read", user);
  });
}

/* ================== SEND MESSAGE ================== */
function send(e) {
  if (e.key === "Enter" && msgInput.value && currentChat) {
    socket.emit("sendMessage", {
      to: currentChat,
      text: msgInput.value
    });
    msgInput.value = "";
  }
}

/* ================== RECEIVE MESSAGE ================== */
socket.on("message", msg => {
  if (
    msg.from === currentChat ||
    msg.to === currentChat
  ) {
    showMessage(msg);
  }

  if (
    msg.from === currentChat &&
    msg.to === me &&
    isTabVisible
  ) {
    socket.emit("read", msg.from);
  }
});

/* ================== READ RECEIPT UPDATE ================== */
socket.on("read", data => {
  if (data.by === currentChat) {
    socket.emit("loadMessages", currentChat, msgs => {
      messagesDiv.innerHTML = "";
      msgs.forEach(showMessage);
    });
  }
});

/* ================== UI ================== */
function showMessage(m) {
  const bubble = document.createElement("div");
  bubble.classList.add(
    "message",
    m.fromUser === me ? "sent" : "received"
  );

  bubble.textContent = m.text;

  const meta = document.createElement("div");
  meta.className = "meta";

  const sentTime = new Date(m.time).toLocaleTimeString();

  if (m.fromUser === me) {
    meta.innerText =
      `✓ ${sentTime}` +
      (m.read && m.readTime
        ? `\n✓✓ ${new Date(m.readTime).toLocaleTimeString()}`
        : "");
  } else {
    meta.innerText = sentTime;
  }

  bubble.appendChild(meta);
  messagesDiv.appendChild(bubble);
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
}
