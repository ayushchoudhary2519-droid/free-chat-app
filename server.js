const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const fs = require("fs");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));

/* ---------- FILE PERSISTENCE ---------- */
const USERS_FILE = "./users.json";
const MESSAGES_FILE = "./messages.json";

function loadJSON(file, fallback) {
  if (!fs.existsSync(file)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function saveJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

/* ---------- STATE ---------- */
const users = loadJSON(USERS_FILE, {}); 
const messages = loadJSON(MESSAGES_FILE, {});
const sockets = {};        // socket.id -> username
const userSockets = {};    // username -> socket
const activeChat = {};     // username -> username

function convoKey(a, b) {
  return [a, b].sort().join("|");
}

function broadcastUsers() {
  io.emit(
    "userList",
    Object.keys(users).map(name => ({
      name,
      online: users[name].online,
      lastSeen: users[name].lastSeen
    }))
  );
}

/* ---------- SOCKET ---------- */
io.on("connection", socket => {
  let me = null;

  broadcastUsers();

  // LOGIN
  socket.on("login", (username, cb) => {
    me = username;
    sockets[socket.id] = username;
    userSockets[username] = socket;

    if (!users[username]) {
      users[username] = { online: true, lastSeen: null };
    } else {
      users[username].online = true;
      users[username].lastSeen = null;
    }

    saveJSON(USERS_FILE, users);
    cb({ ok: true });
    broadcastUsers();
  });

  // SEND MESSAGE
  socket.on("sendMessage", ({ to, text }) => {
    if (!me || !to || !text) return;

    const key = convoKey(me, to);
    if (!messages[key]) messages[key] = [];

    const msg = {
      id: Date.now() + Math.random(),
      from: me,
      to,
      text,
      time: Date.now(),
      read: false
    };

    messages[key].push(msg);
    saveJSON(MESSAGES_FILE, messages);

    socket.emit("message", msg);
    if (userSockets[to]) userSockets[to].emit("message", msg);
  });

  // LOAD HISTORY
  socket.on("loadMessages", (other, cb) => {
    const key = convoKey(me, other);
    cb(messages[key] || []);
  });

  // READ RECEIPTS
  // READ RECEIPTS
socket.on("readMessages", other => {
  if (!me) return;

  const key = convoKey(me, other);
  if (!messages[key]) return;

  const now = Date.now();

  messages[key].forEach(m => {
    if (m.to === me && !m.read) {
      m.read = true;
      m.readTime = now;
    }
  });

  saveJSON(MESSAGES_FILE, messages);

  if (userSockets[other]) {
    userSockets[other].emit("readUpdate", {
      by: me,
      time: now
    });
  }
});


  // TYPING
  socket.on("typing", to => {
    if (userSockets[to]) userSockets[to].emit("typing", me);
  });

  socket.on("stopTyping", to => {
    if (userSockets[to]) userSockets[to].emit("stopTyping", me);
  });

  // ACTIVE CHAT
  socket.on("activeChat", other => {
    activeChat[me] = other;
  });

  // DISCONNECT
  socket.on("disconnect", () => {
    if (!me) return;

    users[me].online = false;
    users[me].lastSeen = Date.now();
    delete sockets[socket.id];
    delete userSockets[me];
    delete activeChat[me];

    saveJSON(USERS_FILE, users);
    broadcastUsers();
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log("Server running on port", PORT);
});
