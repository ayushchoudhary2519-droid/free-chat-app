const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const crypto = require("crypto");
const Database = require("better-sqlite3");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));

/* ================= DATABASE ================= */
const db = new Database("chat.db");

db.prepare(`
CREATE TABLE IF NOT EXISTS users (
  username TEXT PRIMARY KEY,
  password TEXT
)`).run();

db.prepare(`
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  fromUser TEXT,
  toUser TEXT,
  text TEXT,
  time TEXT,
  read INTEGER,
  readTime TEXT
)`).run();

/* ================= HELPERS ================= */
const hash = p =>
  crypto.createHash("sha256").update(p).digest("hex");

/* ================= STATE ================= */
const sockets = {};
const lastSeen = {};

/* ================= SOCKET ================= */
io.on("connection", socket => {
  let me = null;

  socket.on("login", ({ username, password }, cb) => {
    const user = db
      .prepare("SELECT * FROM users WHERE username=?")
      .get(username);

    if (!user) {
      db.prepare(
        "INSERT INTO users VALUES (?,?)"
      ).run(username, hash(password));
    } else if (user.password !== hash(password)) {
      return cb({ ok: false });
    }

    me = username;
    sockets[me] = socket;
    delete lastSeen[me];

    cb({ ok: true });
    broadcastUsers();
  });

  socket.on("sendMessage", ({ to, text }) => {
    if (!me || !text) return;

    const time = new Date().toISOString();

    db.prepare(`
      INSERT INTO messages 
      (fromUser,toUser,text,time,read,readTime)
      VALUES (?,?,?,?,0,NULL)
    `).run(me, to, text, time);

    const msg = {
      fromUser: me,
      toUser: to,
      text,
      time,
      read: 0,
      readTime: null
    };

    if (sockets[to]) sockets[to].emit("message", msg);
    socket.emit("message", msg);
  });

  socket.on("loadMessages", (other, cb) => {
    const rows = db.prepare(`
      SELECT * FROM messages
      WHERE (fromUser=? AND toUser=?)
         OR (fromUser=? AND toUser=?)
      ORDER BY id
    `).all(me, other, other, me);

    cb(rows);
  });

  socket.on("read", other => {
    const readTime = new Date().toISOString();

    db.prepare(`
      UPDATE messages
      SET read=1, readTime=?
      WHERE fromUser=? AND toUser=? AND read=0
    `).run(readTime, other, me);

    if (sockets[other]) {
      sockets[other].emit("read", { by: me });
    }
  });

  socket.on("disconnect", () => {
    if (me) {
      lastSeen[me] = new Date().toISOString();
      delete sockets[me];
      broadcastUsers();
    }
  });
});

/* ================= USERS ================= */
function broadcastUsers() {
  io.emit("userList", {
    online: Object.keys(sockets),
    lastSeen
  });
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () =>
  console.log("Server running on", PORT)
);
