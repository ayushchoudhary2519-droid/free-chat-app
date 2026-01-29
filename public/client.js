const socket = io();

const me = localStorage.getItem("me");
if (!me) {
  location.href = "/";
}

const inbox = document.getElementById("inbox");
const messagesDiv = document.getElementById("messages");
const header = document.getElementById("chatHeader");
const msgInput = document.getElementById("msg");

let currentChat = null;

// ---------- LOGIN ----------
socket.emit("login", me, res => {
  if (!res.ok) {
    alert("Login failed");
    location.href = "/";
  }
});

// ---------- USER LIST ----------
socket.on("userList", users => {
  inbox.innerHTML = "";

  users
    .filter(name => name !== me)
    .forEach(name => {
      const div = document.createElement("div");
      div.className = "inbox-user";
      if (name === currentChat) div.classList.add("active");

      div.textContent = name;
      div.onclick = () => openChat(name);

      inbox.appendChild(div);
    });
});

// ---------- OPEN CHAT ----------
function openChat(user) {
  currentChat = user;
  header.textContent = user;
  messagesDiv.innerHTML = "";

  socket.emit("loadMessages", user, msgs => {
    msgs.forEach(showMessage);
  });
}

// ---------- SEND ----------
function send(e) {
  if (e.key === "Enter" && msgInput.value && currentChat) {
    socket.emit("sendMessage", {
      to: currentChat,
      text: msgInput.value
    });
    msgInput.value = "";
  }
}

// ---------- RECEIVE ----------
socket.on("message", msg => {
  if (
    msg.from === currentChat ||
    msg.to === currentChat
  ) {
    showMessage(msg);
  }
});

// ---------- UI ----------
function showMessage(m) {
  const bubble = document.createElement("div");
  bubble.className =
    "message " + (m.from === me ? "sent" : "received");

  bubble.textContent = m.text;

  const meta = document.createElement("div");
  meta.className = "meta";
  meta.textContent = new Date(m.time).toLocaleTimeString();

  bubble.appendChild(meta);
  messagesDiv.appendChild(bubble);
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
}
