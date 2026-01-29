const me = localStorage.getItem("me");
const password = localStorage.getItem("password");

if (!me || !password) {
  location.href = "/";
}

socket.emit("login", { username: me, password }, res => {
  if (!res.ok) {
    alert("Login failed");
    localStorage.clear();
    location.href = "/";
  }
});

const socket = io({ transports: ["websocket"] });


const inbox = document.getElementById("inbox");
const messagesDiv = document.getElementById("messages");
const header = document.getElementById("chatHeader");
const input = document.getElementById("msg");

let currentChat = null;
let state = { online: [], lastSeen: {} };

/* ================= USERS ================= */
socket.on("userList", data => {
  state = data;
  inbox.innerHTML = "";

  [...new Set([...data.online, ...Object.keys(data.lastSeen)])]
    .filter(u => u !== me)
    .forEach(u => {
      const div = document.createElement("div");
      div.className = "inbox-user";
      if (u === currentChat) div.classList.add("active");

      div.innerHTML = `
        <div class="name">${u}</div>
        <div class="status">
          ${data.online.includes(u)
            ? "Online"
            : `Last seen ${new Date(data.lastSeen[u]).toLocaleTimeString()}`
          }
        </div>
      `;

      div.onclick = () => openChat(u);
      inbox.appendChild(div);
    });
});

/* ================= CHAT ================= */
function openChat(user) {
  currentChat = user;
  messagesDiv.innerHTML = "";

  header.innerHTML = `
    <div>${user}</div>
    <div class="status">
      ${state.online.includes(user)
        ? "Online"
        : "Offline"}
    </div>
  `;

  socket.emit("loadMessages", user, msgs => {
    msgs.forEach(showMessage);
    socket.emit("read", user);
  });
}

/* ================= SEND ================= */
function send(e) {
  if (e.key === "Enter" && input.value && currentChat) {
    socket.emit("sendMessage", {
      to: currentChat,
      text: input.value
    });
    input.value = "";
  }
}

/* ================= RECEIVE ================= */
socket.on("message", msg => {
  if (
    msg.fromUser === currentChat ||
    msg.toUser === currentChat
  ) {
    showMessage(msg);
  }
});

/* ================= READ ================= */
socket.on("read", ({ by }) => {
  if (by === currentChat) {
    socket.emit("loadMessages", currentChat, msgs => {
      messagesDiv.innerHTML = "";
      msgs.forEach(showMessage);
    });
  }
});

/* ================= UI ================= */
function showMessage(m) {
  const bubble = document.createElement("div");
  bubble.className =
    "message " + (m.fromUser === me ? "sent" : "received");

  bubble.innerText = m.text;

  const meta = document.createElement("div");
  meta.className = "meta";

  let time = new Date(m.time).toLocaleTimeString();

  if (m.fromUser === me) {
    meta.innerText =
      `✓ ${time}` +
      (m.read && m.readTime
        ? `\n✓✓ ${new Date(m.readTime).toLocaleTimeString()}`
        : "");
  } else {
    meta.innerText = time;
  }

  bubble.appendChild(meta);
  messagesDiv.appendChild(bubble);
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

