
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));

/*
  In-memory state
*/
const users = {};   // username -> socket.id
const sockets = {}; // socket.id -> username
const messages = {}; // "a|b" -> [{from,to,text,time}]

function convoKey(a, b) {
  return [a, b].sort().join("|");
}

function broadcastUsers() {
  io.emit(
    "userList",
    Object.keys(users) // array of usernames
  );
}

io.on("connection", socket => {
  console.log("connected:", socket.id);

  // SEND CURRENT USERS TO NEW CLIENT
  socket.emit("userList", Object.keys(users));

  // ---------- LOGIN ----------
  socket.on("login", (username, cb) => {
    if (!username) return;

    users[username] = socket.id;
    sockets[socket.id] = username;

    console.log("login:", username);

    cb({ ok: true });
    broadcastUsers();
  });

  // ---------- SEND MESSAGE ----------
  socket.on("sendMessage", ({ to, text }) => {
    const from = sockets[socket.id];
    if (!from || !to || !text) return;

    const key = convoKey(from, to);
    if (!messages[key]) messages[key] = [];

    const msg = {
      from,
      to,
      text,
      time: Date.now()
    };

    messages[key].push(msg);

    // send to receiver
    if (users[to]) {
      io.to(users[to]).emit("message", msg);
    }

    // echo back to sender
    socket.emit("message", msg);
  });

  // ---------- LOAD HISTORY ----------
  socket.on("loadMessages", (other, cb) => {
    const me = sockets[socket.id];
    if (!me || !other) return cb([]);

    const key = convoKey(me, other);
    cb(messages[key] || []);
  });

  // ---------- DISCONNECT ----------
  socket.on("disconnect", () => {
    const me = sockets[socket.id];
    if (!me) return;

    delete sockets[socket.id];
    delete users[me];

    console.log("disconnect:", me);
    broadcastUsers();
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log("Server running on port", PORT);
});
