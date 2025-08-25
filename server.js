// FoxChat2 Backend - server.js
// Node.js + Express + Socket.io

const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Odalar RAM üzerinde tutuluyor (kalıcı değil)
let rooms = {};

io.on("connection", (socket) => {
    let currentRoom = null;
    let username = null;

    // Odaya giriş
    socket.on("joinRoom", ({ room, user, password }) => {
        // Eğer oda yoksa oluştur
        if (!rooms[room]) {
            rooms[room] = {
                users: {},
                messages: [],
                password: null,
                admin: socket.id
            };
        }

        // Şifre kontrolü
        if (rooms[room].password && rooms[room].password !== password) {
            socket.emit("roomError", "Yanlış şifre!");
            return;
        }

        // Kullanıcıyı ekle
        currentRoom = room;
        username = user;

        // Aynı isim varsa numaralandır
        let duplicateCount = Object.values(rooms[room].users).filter(u => u.startsWith(user)).length;
        if (duplicateCount > 0) {
            username = `${user}(${duplicateCount})`;
        }

        rooms[room].users[socket.id] = username;
        socket.join(room);

        socket.emit("roomJoined", {
            room,
            messages: rooms[room].messages,
            admin: rooms[room].admin === socket.id
        });

        io.to(room).emit("systemMessage", `${username} odaya katıldı.`);
    });

    // Mesaj gönderme
    socket.on("chatMessage", (msg) => {
        if (!currentRoom) return;

        let message = {
            user: username,
            text: msg,
            time: new Date().toLocaleTimeString()
        };

        // Mesajları sınırla (max 200)
        rooms[currentRoom].messages.push(message);
        if (rooms[currentRoom].messages.length > 200) {
            rooms[currentRoom].messages.shift();
        }

        io.to(currentRoom).emit("chatMessage", message);
    });

    // Admin komutları
    socket.on("adminCommand", ({ command, args }) => {
        if (!currentRoom) return;
        if (rooms[currentRoom].admin !== socket.id) {
            socket.emit("systemMessage", "Admin değilsin!");
            return;
        }

        switch (command) {
            case "/setpassword":
                rooms[currentRoom].password = args[0] || null;
                io.to(currentRoom).emit("systemMessage", "Oda şifresi güncellendi.");
                break;
            case "/kick":
                let userToKick = args[0];
                let kickSocket = Object.keys(rooms[currentRoom].users).find(
                    id => rooms[currentRoom].users[id] === userToKick
                );
                if (kickSocket) {
                    io.to(kickSocket).emit("roomError", "Odadan atıldınız.");
                    io.sockets.sockets.get(kickSocket).leave(currentRoom);
                    delete rooms[currentRoom].users[kickSocket];
                    io.to(currentRoom).emit("systemMessage", `${userToKick} odadan atıldı.`);
                }
                break;
            case "/maxuser":
                // Basit: sadece bilgilendirme (gerçek limit için logic eklenebilir)
                io.to(currentRoom).emit("systemMessage", `Maksimum kullanıcı: ${args[0]}`);
                break;
            case "/setadmin":
                let newAdmin = args[0];
                let targetSocket = Object.keys(rooms[currentRoom].users).find(
                    id => rooms[currentRoom].users[id] === newAdmin
                );
                if (targetSocket) {
                    rooms[currentRoom].admin = targetSocket;
                    io.to(currentRoom).emit("systemMessage", `${newAdmin} artık admin.`);
                }
                break;
        }
    });

    // Kullanıcı çıkınca
    socket.on("disconnect", () => {
        if (!currentRoom || !rooms[currentRoom]) return;

        io.to(currentRoom).emit("systemMessage", `${username} odadan çıktı.`);
        delete rooms[currentRoom].users[socket.id];

        // Eğer admin çıktıysa yeni admin seç
        if (rooms[currentRoom].admin === socket.id) {
            let userIds = Object.keys(rooms[currentRoom].users);
            if (userIds.length > 0) {
                rooms[currentRoom].admin = userIds[Math.floor(Math.random() * userIds.length)];
                let newAdminName = rooms[currentRoom].users[rooms[currentRoom].admin];
                io.to(currentRoom).emit("systemMessage", `${newAdminName} yeni admin oldu.`);
            }
        }

        // Eğer oda boşaldıysa sil
        if (Object.keys(rooms[currentRoom].users).length === 0) {
            delete rooms[currentRoom];
        }
    });
});

// Sunucu başlat
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`FoxChat2 Backend çalışıyor: http://localhost:${PORT}`);
});