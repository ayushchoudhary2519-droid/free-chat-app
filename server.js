const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const crypto = require("crypto");
const sqlite3 = require("sqlite3").verbose();

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));

/* ================= DATABASE ================= */

const db = new sqlite3.Database("./chat.db");

db.run(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    password_hash TEXT,
    created_at TEXT
  )
`);

db.run(`
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sender TEXT,
    receiver TEXT,
    text TEXT,
    sentAt TEXT,
    readAt TEXT
  )
`);

/* ================= MEMORY ================= */

const sockets = {}; // username -> socket
const lastSeen = {}; // username -> timestamp

/* ================= HELPERS ================= */

function hash(pw) {
  return crypto.createHash("sha256").update(pw).digest("hex");
}

function broadcastUsers() {
  db.all(`SELECT username FROM users`, [], (err, rows) => {
    const payload = rows.map(r => ({
      name: r.username,
      online: !!sockets[r.username],
      lastSeen: lastSeen[r.username] || null
    }));
    io.emit("userList", payload);
  });
}

/* ================= SOCKET LOGIC ================= */

io.on("connection", socket => {
  let currentUser = null;
  socket.activeChat = null;

  /* ---- LOGIN (PERMANENT ACCOUNTS) ---- */
  socket.on("login", ({ username, password }, cb) => {
    if (Object.keys(sockets).length >= 10) {
      return cb({ ok: false, error: "Server full (10 users online)" });
    }

    db.get(
      `SELECT * FROM users WHERE username = ?`,
      [username],
      (err, row) => {
        if (row) {
          if (row.password_hash !== hash(password)) {
            return cb({ ok: false, error: "Wrong password" });
          }
          cb({ ok: true });
        } else {
          db.run(
            `INSERT INTO users (username, password_hash, created_at)
             VALUES (?, ?, ?)`,
            [username, hash(password), new Date().toISOString()],
            () => cb({ ok: true })
          );
        }
      }
    );
  });

  /* ---- IDENTIFY SOCKET ---- */
  socket.on("identify", username => {
    currentUser = username;
    sockets[username] = socket;
    broadcastUsers();
  });

  socket.on("activeChat", user => {
    socket.activeChat = user;
  });

  /* ---- LOAD CHAT HISTORY ---- */
  socket.on("loadMessages", (other, cb) => {
    db.all(
      `SELECT * FROM messages
       WHERE (sender=? AND receiver=?)
          OR (sender=? AND receiver=?)
       ORDER BY sentAt`,
      [currentUser, other, other, currentUser],
      (err, rows) => {
        cb(
          rows.map(r => ({
            from: r.sender,
            to: r.receiver,
            text: r.text,
            sentAt: r.sentAt,
            read: !!r.readAt,
            readAt: r.readAt
          }))
        );
      }
    );
  });

  /* ---- SEND MESSAGE ---- */
  socket.on("sendMessage", ({ to, text }) => {
    if (!currentUser) return;

    const sentAt = new Date().toISOString();

    db.run(
      `INSERT INTO messages (sender, receiver, text, sentAt, readAt)
       VALUES (?, ?, ?, ?, NULL)`,
      [currentUser, to, text, sentAt]
    );

    const msg = {
      from: currentUser,
      to,
      text,
      sentAt,
      read: false,
      readAt: null
    };

    socket.emit("message", msg);
    if (sockets[to]) sockets[to].emit("message", msg);
  });

  /* ---- READ RECEIPTS ---- */
  socket.on("read", other => {
    const readTime = new Date().toISOString();

    db.run(
      `UPDATE messages
       SET readAt=?
       WHERE sender=? AND receiver=? AND readAt IS NULL`,
      [readTime, other, currentUser],
      () => {
        if (sockets[other]) {
          sockets[other].emit("read", currentUser);
        }
      }
    );
  });

  /* ---- DISCONNECT ---- */
  socket.on("disconnect", () => {
    if (currentUser) {
      lastSeen[currentUser] = new Date().toISOString();
      delete sockets[currentUser];
      broadcastUsers();
    }
  });
});

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log("Server running on port", PORT);
});

