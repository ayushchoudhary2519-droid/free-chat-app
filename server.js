const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const crypto = require("crypto");
const Database = require("better-sqlite3");

// ------------------ APP SETUP ------------------
const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));

// ------------------ DATABASE ------------------
const db = new Database("chat.db");

// USERS TABLE
db.prepare(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    password_hash TEXT,
    created_at TEXT
  )
`).run();

// MESSAGES TABLE
db.prepare(`
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fromUser TEXT,
    toUser TEXT,
    text TEXT,
    time TEXT,
    read INTEGER,
    readTime TEXT
  )
`).run();

// ------------------ HELPERS ------------------
function hashPassword(password) {
  return crypto.createHash("sha256").update(password).digest("hex");
}

function convoKey(a, b) {
  return [a, b].sort().join("|");
}

// ------------------ STATE ------------------
const sockets = {};
const lastSeen = {};

// ------------------ SOCKET.IO ------------------
io.on("connection", socket => {
  let currentUser = null;

  // ---------- LOGIN ----------
  socket.on("login", ({ username, password }, cb) => {
    const hash = hashPassword(password);

    let user = db
      .prepare("SELECT * FROM users WHERE username=?")
      .get(username);

    if (!user) {
      db.prepare(
        "INSERT INTO users (username, password_hash, created_at) VALUES (?,?,?)"
      ).run(username, hash, new Date().toISOString());
    } else if (user.password_hash !== hash) {
      return cb({ ok: false, error: "Invalid password" });
    }

    currentUser = username;
    sockets[username] = socket;
    delete lastSeen[username];

    cb({ ok: true });
    broadcastUsers();
  });

  // ---------- SEND MESSAGE ----------
  socket.on("sendMessage", ({ to, text }) => {
    if (!currentUser) return;

    const time = new Date().toISOString();

    db.prepare(
      `INSERT INTO messages 
       (fromUser, toUser, text, time, read, readTime)
       VALUES (?,?,?,?,?,?)`
    ).run(currentUser, to, text, time, 0, null);

    const msg = {
      from: currentUser,
      to,
      text,
      time,
      read: false,
      readTime: null
    };

    if (sockets[to]) sockets[to].emit("message", msg);
    socket.emit("message", msg);
  });

  // ---------- LOAD HISTORY ----------
  socket.on("loadMessages", (other, cb) => {
    if (!currentUser) return;

    const rows = db.prepare(
      `SELECT * FROM messages
       WHERE (fromUser=? AND toUser=?)
       OR (fromUser=? AND toUser=?)
       ORDER BY id`
    ).all(currentUser, other, other, currentUser);

    cb(rows);
  });

  // ---------- READ RECEIPT ----------
  socket.on("read", other => {
    if (!currentUser) return;

    const readTime = new Date().toISOString();

    db.prepare(
      `UPDATE messages
       SET read=1, readTime=?
       WHERE fromUser=? AND toUser=? AND read=0`
    ).run(readTime, other, currentUser);

    if (sockets[other]) {
      sockets[other].emit("read", {
        by: currentUser,
        time: readTime
      });
    }
  });

  // ---------- DISCONNECT ----------
  socket.on("disconnect", () => {
    if (currentUser) {
      lastSeen[currentUser] = new Date().toISOString();
      delete sockets[currentUser];
      broadcastUsers();
    }
  });
});

// ------------------ USER LIST ------------------
function broadcastUsers() {
  io.emit("userList", {
    online: Object.keys(sockets),
    lastSeen
  });
}

// ------------------ START SERVER ------------------
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log("Server running on port", PORT);
});

