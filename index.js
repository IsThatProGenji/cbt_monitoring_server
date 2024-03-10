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
const jawaban = database.collection("jawaban");
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
    changeStream = jawaban.watch();
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
app.use(express.urlencoded({ extended: true })); // Changed to express.urlencoded
app.post("/joinRoom", async (req, res) => {
  console.log("Join Room");
  // Extract room, key, and user_id from request body
  const { room, key, user_id } = req.body; // Changed from user to user_id
  // Log the values to check if they are received correctly
  console.log("Received data - user_id:", user_id, "room:", room, "key:", key); // Updated from user to user_id

  try {
    // Check if the user is in the whitelist for the specified room
    const roomData = await haikus.findOne({ title: room });
    if (roomData) {
      // Check if the room status is "publish"
      if (roomData.status !== "publish") {
        console.log(`Room ${room} is not published`);
        return res.status(403).send({
          message: `Room ${room} is not published. Users cannot join.`,
          status: 403,
          type: "",
        });
      }

      if (
        roomData.whitelist_partisipant &&
        roomData.whitelist_partisipant.some((item) => item.id == user_id) && // Changed from user to user_id
        roomData.key === key
      ) {
        // User is in the participant whitelist and key matches
        console.log(
          `${user_id} is in the participant whitelist for room ${room}`
        ); // Updated from user to user_id

        // Fetch the response list jawaban if id_user, id_soal, and id_room are found
        try {
          const jawabanData = await jawaban.findOne(
            {
              id_soal: parseInt(roomData.idsoal),
              id_room: parseInt(roomData.idroom),
              id_user: parseInt(user_id),
            },
            {
              _id: 0, // Exclude the _id field from the result
              "questions.question_index": 1, // Include only the question_index field
              "questions.answer_question.answer_index": 1, // Include only the answer_index field inside the answer_question array
            }
          );

          if (jawabanData && jawabanData.questions.length > 0) {
            const jawaban = jawabanData.questions.map((question) => ({
              question_index: question.question_index,
              answer_index: question.answer_question[0].answer_index, // Assuming there's only one answer per question
            }));

            console.log("Jawaban data found:", jawabanData);
            // Send a response back to the client with status 200
            res.status(200).send({
              message: `User ${user_id} joined room ${room} as a participant with key ${key}`,
              status: 200,
              type: "participant",
              idsoal: roomData.idsoal,
              idroom: roomData.idroom,
              jawaban: jawaban,
              list_soal: roomData.list_soal,
            });
          } else {
            console.log("No jawaban data found for the user");
            // Send a response back to the client with status 200 but without jawaban data
            res.status(200).send({
              message: `User ${user_id} joined room ${room} as a participant with key ${key}`,
              status: 200,
              type: "participant",
              idsoal: roomData.idsoal,
              idroom: roomData.idroom,
              jawaban: [],
              list_soal: roomData.list_soal,
            });
          }
        } catch (error) {
          console.error("Error occurred while fetching jawaban data:", error);
          res
            .status(500)
            .send({ message: "Internal server error", status: 500, type: "" });
        }
      } else if (
        roomData.whitelist_observer &&
        roomData.whitelist_observer.some((item) => item.id == user_id) && // Changed from user to user_id
        roomData.key === key
      ) {
        // User is in the observer whitelist and key matches
        console.log(`${user_id} is in the observer whitelist for room ${room}`); // Updated from user to user_id
        // Send a response back to the client with status 200
        res.status(200).send({
          message: `User ${user_id} joined room ${room} as an observer with key ${key}`, // Updated from user to user_id
          status: 200,
          type: "observer",
        });
      } else {
        // User is not in either whitelist or key does not match
        console.log(
          `${user_id} is not in the whitelist for room ${room} as participant or observer, or key is incorrect`
        );
        res.status(403).send({
          message: `User ${user_id} is not authorized to join room ${room}`, // Updated from user to user_id
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
  var nama;
  socket.on("join", (data) => {
    roomName = data["room"];
    name = data["name"];
    type = data["type"];
    nama = data["nama"];
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
          emitRoom(roomName);
          emitUser(roomName, participant.name + "limit", participant.limit); // Emit the filtered room
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
          nama: nama,
          status: "connected",
          onfocus: "didalam aplikasi",
          limit: 3,
          //// Set onFocus to 'didalam aplikasi'
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
        nama: nama,
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
  socket.on("reconnect", (data) => {
    if (roomName && name) {
      let roomIndex = room.findIndex((entry) => entry.room === roomName);
      if (roomIndex !== -1) {
        let participantIndex = room[roomIndex].participant.findIndex(
          (participant) => participant.name === name
        );
        emitUser(
          roomName,
          room[roomIndex].participant[participantIndex].name + "limit",
          room[roomIndex].participant[participantIndex].limit
        );
        if (participantIndex !== -1) {
          const maxLimit = 3;
          if (room[roomIndex].participant[participantIndex].limit < maxLimit) {
            room[roomIndex].participant[participantIndex].limit =
              room[roomIndex].participant[participantIndex].limit + 1;
          }

          emitRoom(roomName); // Emit the filtered room
          console.log(`${name} ${socket.id} limit updated:`);
          console.log(JSON.stringify(room, null, 2));
        }
      }
    }
  });
  socket.on("answer", async (data) => {
    console.log(data);

    const existingDocument = await jawaban.findOne({
      id_soal: data.idsoal,
      id_room: data.idroom,
      id_user: data.iduser,
    });

    if (existingDocument) {
      // If the document already exists
      const existingQuestion = existingDocument.questions.find(
        (question) => question.question_index === data.questionindex
      );

      if (existingQuestion) {
        // If the question index already exists, update the answer index
        await jawaban.updateOne(
          {
            id_soal: data.idsoal,
            id_room: data.idroom,
            id_user: data.iduser,
            "questions.question_index": data.questionindex,
          },
          {
            $set: {
              "questions.$.answer_question": [
                {
                  title: data.answer["title"],
                  value: data.answer["value"],
                  answer_index: data.answerindex,
                },
              ],
            },
          }
        );
      } else {
        // If the question index doesn't exist, add a new question
        await jawaban.updateOne(
          {
            id_soal: data.idsoal,
            id_room: data.idroom,
            id_user: data.iduser,
          },
          {
            $push: {
              questions: {
                question: data.question,
                type: "type_1",
                question_index: data.questionindex,
                options: data.option,
                answer_question: [
                  {
                    title: data.answer["title"],
                    value: data.answer["value"],
                    answer_index: data.answerindex,
                  },
                ],
              },
            },
          }
        );
      }
    } else {
      // If the document doesn't exist, insert a new one
      await jawaban.insertOne({
        id_soal: data.idsoal,
        id_room: data.idroom,
        id_user: data.iduser,
        questions: [
          {
            question: data.question,
            type: "type_1",
            question_index: data.questionindex,
            options: data.option,
            answer_question: [
              {
                title: data.answer["title"],
                value: data.answer["value"],
                answer_index: data.answerindex,
              },
            ],
          },
        ],
      });
    }
  });

  socket.on("kickUser", (user) => {
    emitUser(roomName, user + "kick", "kicked");
  });
  socket.on("resetUser", (userName) => {
    if (roomName && userName) {
      let roomIndex = room.findIndex((entry) => entry.room === roomName);
      if (roomIndex !== -1) {
        // Search for the user in the participant array
        let participantIndex = room[roomIndex].participant.findIndex(
          (participant) => participant.name === userName
        );
        if (participantIndex !== -1) {
          // Reset the participant's limit to 3
          room[roomIndex].participant[participantIndex].limit = 3;

          console.log(`Reset ${userName}'s limit to 3`);
          emitRoom(roomName); // Emit the filtered room
          return; // Exit the function after resetting the limit
        }

        // Search for the user in the observer array
        let observerIndex = room[roomIndex].observer.findIndex(
          (observer) => observer.name === userName
        );
        if (observerIndex !== -1) {
          // Reset the observer's limit to 3
          room[roomIndex].observer[observerIndex].limit = 3;

          console.log(`Reset ${userName}'s limit to 3`);
          emitRoom(roomName); // Emit the filtered room
          return; // Exit the function after resetting the limit
        }

        console.log(`User ${userName} not found in room ${roomName}`);
      } else {
        console.log(`Room ${roomName} not found`);
      }
    } else {
      console.log(`Invalid room or user name provided`);
    }
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
