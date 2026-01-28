window.lastUsers = [];
const socket = io({ autoConnect: false });
const me = localStorage.getItem("me");

const inbox = document.getElementById("inbox");
const messagesDiv = document.getElementById("messages");
const header = document.getElementById("chatHeader");

let currentChat = null;
let isTabVisible = true;

socket.connect();
socket.emit("identify", me);

// ---------- TAB VISIBILITY ----------
document.addEventListener("visibilitychange", () => {
  isTabVisible = !document.hidden;

  if (currentChat && isTabVisible) {
    socket.emit("activeChat", currentChat);
    socket.emit("read", currentChat);
  } else {
    socket.emit("activeChat", null);
  }
});

// ---------- INBOX ----------
socket.on("userList", users => {
  window.lastUsers = users; 
  inbox.innerHTML = "";

  users
    .filter(u => u.name !== me)
    .forEach(u => {
      const div = document.createElement("div");
      div.className = "inbox-user";
      if (u.name === currentChat) div.classList.add("active");

      const status = u.online
        ? "Online"
        : u.lastSeen
          ? `Last seen ${new Date(u.lastSeen).toLocaleTimeString()}`
          : "Offline";

      div.innerHTML = `
        <div class="name">${u.name}</div>
        <div class="status">${status}</div>
      `;

      div.onclick = () => openChat(u.name);
      inbox.appendChild(div);
    });
});


// ---------- OPEN CHAT ----------
function openChat(user) {
  currentChat = user;
  const userObj = window.lastUsers?.find(u => u.name === user);
header.innerHTML = `
  <div>${user}</div>
  <div class="status">
    ${userObj?.online ? "Online" : userObj?.lastSeen
      ? `Last seen ${new Date(userObj.lastSeen).toLocaleTimeString()}`
      : ""}
  </div>
`;

  messagesDiv.innerHTML = "";

  socket.emit("activeChat", user);
  socket.emit("read", user);

  socket.emit("loadMessages", user, msgs => {
    msgs.forEach(showMessage);
  });
}

// ---------- SEND ----------
function send(e) {
  if (e.key === "Enter" && msg.value && currentChat) {
    socket.emit("sendMessage", {
      to: currentChat,
      text: msg.value
    });
    msg.value = "";
  }
}

// ---------- RECEIVE ----------
socket.on("message", msg => {
  if (msg.from === currentChat || msg.to === currentChat) {
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

// ---------- READ UPDATE ----------
socket.on("read", user => {
  if (user === currentChat) {
    messagesDiv.innerHTML = "";
    socket.emit("loadMessages", user, msgs => {
      msgs.forEach(showMessage);
    });
  }
});

// ---------- UI ----------
function showMessage(m) {
  const bubble = document.createElement("div");
  bubble.classList.add(
    "message",
    m.from === me ? "sent" : "received"
  );

  bubble.textContent = m.text;

  const meta = document.createElement("div");
  meta.className = "meta";

  const sentTime = new Date(m.sentAt).toLocaleTimeString();

  if (m.from === me) {
    meta.innerText =
      `✓ ${sentTime}` +
      (m.read && m.readAt
        ? `\n✓✓ ${new Date(m.readAt).toLocaleTimeString()}`
        : "");
  } else {
    meta.textContent = sentTime;
  }

  bubble.appendChild(meta);
  messagesDiv.appendChild(bubble);
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
}
