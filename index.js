import express from "express";
import { createServer } from "http"; // Changed import
import { Server } from "socket.io";
import path from "path";
import { fileURLToPath } from "url";
import { MongoClient } from "mongodb";
import { urlencoded } from "express";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 3500;

const app = express();
const httpServer = createServer(app); // Changed instantiation

app.use(express.static(path.join(__dirname, "public")));

const uri =
  "mongodb://root:password@103.85.58.94:27017/?directConnection=true&appName=mongosh+2.1.3&authSource=admin&replicaSet=rs0";
const client = new MongoClient(uri);
const database = client.db("monitoring");
const haikus = database.collection("room");
const simulateAsyncPause = () =>
  new Promise((resolve) => {
    setTimeout(() => resolve(), 1000);
  });

let changeStream;

async function run() {
  try {
    await client.connect(); // Connect to MongoDB

    // Open a Change Stream on the "haikus" collection
    changeStream = haikus.watch();
    // Set up a change stream listener when change events are emitted
    changeStream.on("change", (next) => {
      // Print any change event
      console.log("received a change to the collection: \t", next);
    });

    // Pause before inserting a document
    await simulateAsyncPause();
    // Insert a new document into the collection
    // await haikus.updateOne(
    //   { title: "room1" }, // Specify the filter for the document to update
    //   {
    //     $set: {
    //       participant: ["rio"],
    //       content: "Updated content here", // Update the content field
    //     },
    //   }
    // );
    // await haikus.insertOne({
    //   // Corrected variable name
    //   title: "Record of a Shriveled Datum",
    //   content: "No bytes, no problem. Just insert a document, in MongoDB",
    // });
    // Pause before closing the change stream
    // await simulateAsyncPause();
    // Close the change stream and print a message to the console when it is closed
  } finally {
    // Close the database connection on completion or error
  }
}

run().catch(console.dir);

const io = new Server(httpServer, {
  cors: {
    origin:
      process.env.NODE_ENV === "production"
        ? false
        : ["http://localhost:5500", "http://127.0.0.1:5500"],
  },
});

// Parse URL-encoded bodies (as sent by HTML forms)
app.use(express.urlencoded({ extended: true })); // Changed to express.urlencoded
app.post("/joinRoom", async (req, res) => {
  // Extract room, key, and user from request body
  const { room, key, user } = req.body;
  // Log the values to check if they are received correctly
  console.log("Received data - user:", user, "room:", room, "key:", key);

  try {
    // Check if the user is in the whitelist for the specified room
    const roomData = await haikus.findOne({ title: room });
    if (roomData) {
      if (
        roomData.whitelist_participant &&
        roomData.whitelist_participant.includes(user) &&
        roomData.key === key
      ) {
        // User is in the participant whitelist and key matches
        console.log(`${user} is in the participant whitelist for room ${room}`);
        // Send a response back to the client with status 200
        res.status(200).send({
          message: `User ${user} joined room ${room} as an participant with key ${key}`,
          status: 200,
          type: "participant",
        });
      } else if (
        roomData.whitelist_observer &&
        roomData.whitelist_observer.includes(user) &&
        roomData.key === key
      ) {
        // User is in the observer whitelist and key matches
        console.log(`${user} is in the observer whitelist for room ${room}`);
        // Send a response back to the client with status 200
        res.status(200).send({
          message: `User ${user} joined room ${room} as an observer with key ${key}`,
          status: 200,
          type: "observer",
        });
      } else {
        // User is not in either whitelist or key does not match
        console.log(
          `${user} is not in the whitelist for room ${room} as participant or observer, or key is incorrect`
        );
        res.status(403).send({
          message: `User ${user} is not authorized to join room ${room}`,
          status: 403,
          type: "",
        });
      }
    } else {
      // Room not found
      console.log(`Room ${room} not found`);
      res
        .status(404)
        .send({ message: `Room ${room} not found`, status: 404, type: "" });
    }
  } catch (error) {
    // Handle errors
    console.error("Error occurred while checking whitelist:", error);
    res
      .status(500)
      .send({ message: "Internal server error", status: 500, type: "" });
  }
});

var room = [];

io.on("connection", async (socket) => {
  var roomName;
  var name;
  var type;

  socket.on("join", (data) => {
    roomName = data["room"];
    name = data["name"];
    type = data["type"];
    socket.join(roomName); // Join the specific room
    // Check if the participant/observer is already in the room
    let roomIndex = room.findIndex((entry) => entry.room === roomName);
    if (roomIndex !== -1) {
      let participant = room[roomIndex][type].find(
        (participant) => participant.name === name
      );
      if (participant) {
        // If participant/observer is already in the room but disconnected, mark as connected
        if (participant.status === "disconnected") {
          participant.status = "connected";
          participant.onfocus = "didalam aplikasi";
          // Set onFocus to 'didalam aplikasi'
          emitRoom(roomName); // Emit the filtered room
          console.log(
            `${type} ${name} ${socket.id} reconnected to room: ${roomName}`
          );
        } else {
          console.log(
            `${type} ${name} ${socket.id} is already in room: ${roomName}`
          );
        }
      } else {
        // Add participant/observer to the room
        room[roomIndex][type].push({
          name: name,
          status: "connected",
          onfocus: "didalam aplikasi",
          limit: 3, //// Set onFocus to 'didalam aplikasi'
        });
        emitRoom(roomName); // Emit the filtered room
        console.log(
          `${type} ${name} ${socket.id} connected to room: ${roomName}`
        );
      }
    } else {
      // Add new room and participant/observer
      room.push({
        room: roomName,
        observer: [],
        participant: [],
      });
      room[room.length - 1][type].push({
        name: name,
        status: "connected",
        onfocus: "didalam aplikasi",
        limit: 3, // Set onFocus to 'didalam aplikasi'
      });
      emitRoom(roomName); // Emit the filtered room
      console.log(
        `${type} ${name} ${socket.id} connected to new room: ${roomName}`
      );
    }

    console.log(JSON.stringify(room, null, 2));
  });

  socket.on("onfocus", (data) => {
    // Update onFocus data when participant sends focus status
    if (roomName && name) {
      let roomIndex = room.findIndex((entry) => entry.room === roomName);
      if (roomIndex !== -1) {
        let participantIndex = room[roomIndex].participant.findIndex(
          (participant) => participant.name === name
        );
        if (participantIndex !== -1) {
          room[roomIndex].participant[participantIndex].onfocus = data;
          emitUser(
            roomName,
            room[roomIndex].participant[participantIndex].name + "limit",
            room[roomIndex].participant[participantIndex].limit
          );
          if (
            room[roomIndex].participant[participantIndex].limit > 0 &&
            data === "diluar aplikasi"
          ) {
            room[roomIndex].participant[participantIndex].limit =
              room[roomIndex].participant[participantIndex].limit - 1;
          }

          emitRoom(roomName); // Emit the filtered room
          console.log(`${name} ${socket.id} onFocus updated: ${data}`);
          console.log(JSON.stringify(room, null, 2));
        }
      }
    }
  });

  socket.on("kickUser", (user) => {
    emitUser(roomName, user + "kick", "kicked");
  });
  socket.on("endRoom", () => {
    io.to(roomName).emit("endRoom", "endRoom");
    console.log("endRoom");
  });

  socket.on("disconnecting", () => {
    // Update participant/observer's status to "disconnected" when they disconnect
    if (roomName && name) {
      let roomIndex = room.findIndex((entry) => entry.room === roomName);
      if (roomIndex !== -1) {
        // Check if the disconnecting participant/observer is an observer or a participant
        let disconnectingType = room[roomIndex].observer.find(
          (observer) => observer.name === name
        )
          ? "observer"
          : "participant";
        let disconnectingIndex = room[roomIndex][disconnectingType].findIndex(
          (participant) => participant.name === name
        );
        if (disconnectingIndex !== -1) {
          if (
            room[roomIndex][disconnectingType][disconnectingIndex].limit > 0
          ) {
            room[roomIndex][disconnectingType][disconnectingIndex].limit =
              room[roomIndex][disconnectingType][disconnectingIndex].limit - 1;
          }

          room[roomIndex][disconnectingType][disconnectingIndex].status =
            "disconnected";
          room[roomIndex][disconnectingType][disconnectingIndex].onfocus =
            "diluar aplikasi"; // Set onFocus to 'diluar aplikasi'
        }
      }
    }

    socket.leave(roomName);
    emitRoom(roomName); // Emit the filtered room
    console.log(`${name} ${socket.id} disconnected from ${roomName}`);
    console.log(JSON.stringify(room, null, 2));
  });

  function emitUser(roomName, name, value) {
    io.to(roomName).emit(name, value);
  }
  // Function to emit only the filtered room
  function emitRoom(roomName) {
    let filteredRoom = room.filter((entry) => entry.room === roomName);
    io.to(roomName).emit("monitor", filteredRoom);
  }
});

httpServer.listen(PORT, () => {
  console.log(`listening on port ${PORT}`);
});
