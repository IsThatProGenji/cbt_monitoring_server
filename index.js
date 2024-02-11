import express from "express";
import { createServer } from "http"; // Changed import
import { Server } from "socket.io";
import path from "path";
import { fileURLToPath } from "url";
import { MongoClient } from "mongodb";

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
          participant.onfocus = "didalam aplikasi"; // Set onFocus to 'didalam aplikasi'
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
          onfocus: "didalam aplikasi", // Set onFocus to 'didalam aplikasi'
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
        onfocus: "didalam aplikasi", // Set onFocus to 'didalam aplikasi'
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
          emitRoom(roomName); // Emit the filtered room
          console.log(`${name} ${socket.id} onFocus updated: ${data}`);
          console.log(JSON.stringify(room, null, 2));
        }
      }
    }
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

  // Function to emit only the filtered room
  function emitRoom(roomName) {
    let filteredRoom = room.filter((entry) => entry.room === roomName);
    io.to(roomName).emit("monitor", filteredRoom);
  }
});

httpServer.listen(PORT, () => {
  console.log(`listening on port ${PORT}`);
});
