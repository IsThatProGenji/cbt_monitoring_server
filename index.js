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
  "mongodb://admin:password@157.15.164.53:27017/?serverSelectionTimeoutMS=2000&appName=mongosh+2.1.3&authSource=admin&replicaSet=rs0&directConnection=true";
const client = new MongoClient(uri);
const database = client.db("monitoring");
const haikus = database.collection("room");
const jawaban = database.collection("jawaban");
const jawaban_new = database.collection("jawaban_new");
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
      // if (roomData.status !== "publish") {
      //   console.log(`Room ${room} is not published`);
      //   return res.status(403).send({
      //     message: `Room ${room} is not published. Users cannot join.`,
      //     status: 403,
      //     type: "",
      //   });
      // }
      let countdown = {};
      if (roomData.status === "live") {
        // Calculate the end time based on the start date and duration
        const endTime = new Date(
          roomData.startAt.getTime() +
            roomData.duration.hours * 3600000 +
            roomData.duration.minutes * 60000 +
            roomData.duration.seconds * 1000
        );
        // Calculate the remaining time in milliseconds
        const durationMs = endTime.getTime() - new Date().getTime();
        // Convert milliseconds to hours, minutes, and seconds
        countdown.hours = Math.floor(durationMs / (1000 * 60 * 60));
        countdown.minutes = Math.floor(
          (durationMs % (1000 * 60 * 60)) / (1000 * 60)
        );
        countdown.seconds = Math.floor((durationMs % (1000 * 60)) / 1000);
      }

      if (
        (countdown.hours > 0 ||
          countdown.minutes > 0 ||
          countdown.seconds > 0) &&
        roomData.whitelist_partisipant &&
        roomData.whitelist_partisipant.some((item) => item.id == user_id) && // Changed from user to user_id
        roomData.key === key &&
        roomData.status === "live"
      ) {
        // User is in the participant whitelist, key matches, and countdown is greater than 0
        console.log(
          `${user_id} is in the participant whitelist for room ${room}`
        ); // Updated from user to user_id

        // Fetch the response list jawaban if id_user, id_soal, and id_room are found
        try {
          const jawabanData = await jawaban_new.findOne(
            {
              id_soal: parseInt(roomData.idsoal),
              id_room: parseInt(roomData.idroom),
              id_user: parseInt(user_id),
            },
            {
              _id: 0, // Exclude the _id field from the result
              "answer.questionIndex": 1, // Include only the questionIndex field in the answer array
              "answer.answerIndex": 1, // Include only the answerIndex field in the answer array
              "answer.answerTitle": 1, // Include the answerTitle field in the answer array
            }
          );

          if (jawabanData && jawabanData.answer.length > 0) {
            const jawaban = jawabanData.answer
              .filter((ans) => parseInt(ans.answerIndex) !== 0) // Filter out answers with answerIndex of 0
              .map((ans) => ({
                question_index: ans.questionIndex,
                answer_index: parseInt(ans.answerIndex),
                answer_title: ans.answerTitle,
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
              countdown: countdown,
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
              countdown: countdown,
            });
          }
        } catch (error) {
          console.error("Error fetching jawaban data:", error);
          // Send a response back to the client with status 500 in case of an error
          res.status(500).send({
            message: "An error occurred while fetching jawaban data",
            status: 500,
          });
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
          countdown: countdown ?? {},
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
  socket.on("join", async (data) => {
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
        if (participant.status === "Disconnected") {
          participant.status = "Connected";
          participant.onfocus = "Didalam Aplikasi";
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
          status: "Connected",
          onfocus: "Didalam Aplikasi",
          limit: 3,
          answered: 0,
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
        status: "Connected",
        onfocus: "Didalam Aplikasi",
        limit: 3, // Set onFocus to 'didalam aplikasi'
        answered: 0,
      });
      emitRoom(roomName); // Emit the filtered room

      console.log(
        `${type} ${name} ${socket.id} connected to new room: ${roomName}`
      );
    }
    emitRoom(roomName);

    const roomData = await haikus.findOne({ title: roomName });

    if (roomData) {
      let countdown = {};
      if (roomData.status === "live") {
        // Calculate the end time based on the start date and duration
        const endTime = new Date(
          roomData.startAt.getTime() +
            roomData.duration.hours * 3600000 +
            roomData.duration.minutes * 60000 +
            roomData.duration.seconds * 1000
        );
        // Calculate the remaining time in milliseconds
        const durationMs = endTime.getTime() - new Date().getTime();
        // Convert milliseconds to hours, minutes, and seconds
        countdown.hours = Math.floor(durationMs / (1000 * 60 * 60));
        countdown.minutes = Math.floor(
          (durationMs % (1000 * 60 * 60)) / (1000 * 60)
        );
        countdown.seconds = Math.floor((durationMs % (1000 * 60)) / 1000);
      } else {
        countdown.hours = 0;
        countdown.minutes = 0;
        countdown.seconds = 0;
      }
      // Emit the countdown
      io.to(roomName).emit("countdown", {
        hours: countdown.hours,
        minutes: countdown.minutes,
        seconds: countdown.seconds,
      });
      emitRoom(roomName);
      // console.log(JSON.stringify(room, null, 2));
    }
    // console.log(JSON.stringify(room, null, 2));
  });
  socket.on("leaveRoom", () => {
    socket.leave(roomName); // Leave the specific room
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

          if (
            room[roomIndex].participant[participantIndex].limit > 0 &&
            data === "Diluar Aplikasi"
          ) {
            room[roomIndex].participant[participantIndex].limit =
              room[roomIndex].participant[participantIndex].limit - 1;
          }
          emitUser(
            roomName,
            room[roomIndex].participant[participantIndex].name + "limit",
            room[roomIndex].participant[participantIndex].limit
          );
          emitRoom(roomName); // Emit the filtered room
          console.log(`${name} ${socket.id} onFocus updated: ${data}`);
          // console.log(JSON.stringify(room, null, 2));
        }
      }
    }
  });

  // socket.on("answer", async (data) => {
  //   // console.log(data);

  //   const existingDocument = await jawaban.findOne({
  //     id_soal: data.idsoal,
  //     id_room: data.idroom,
  //     id_user: data.iduser,
  //   });

  //   if (existingDocument) {
  //     // If the document already exists
  //     const existingQuestion = existingDocument.questions.find(
  //       (question) => question.question_index === data.questionindex
  //     );

  //     if (existingQuestion) {
  //       // If the question index already exists, update the answer index
  //       await jawaban.updateOne(
  //         {
  //           id_soal: data.idsoal,
  //           id_room: data.idroom,
  //           id_user: data.iduser,
  //           "questions.question_index": data.questionindex,
  //         },
  //         {
  //           $set: {
  //             "questions.$.answer_question": [
  //               {
  //                 title: data.answer["title"],
  //                 value: data.answer["value"],
  //                 answer_index: data.answerindex,
  //               },
  //             ],
  //           },
  //         }
  //       );
  //     } else {
  //       // If the question index doesn't exist, add a new question
  //       await jawaban.updateOne(
  //         {
  //           id_soal: data.idsoal,
  //           id_room: data.idroom,
  //           id_user: data.iduser,
  //         },
  //         {
  //           $push: {
  //             questions: {
  //               question: data.question,
  //               type: "type_1",
  //               question_index: data.questionindex,
  //               options: data.option,
  //               answer_question: [
  //                 {
  //                   title: data.answer["title"],
  //                   value: data.answer["value"],
  //                   answer_index: data.answerindex,
  //                 },
  //               ],
  //             },
  //           },
  //         }
  //       );
  //     }
  //   } else {
  //     // If the document doesn't exist, insert a new one
  //     await jawaban.insertOne({
  //       id_soal: data.idsoal,
  //       id_room: data.idroom,
  //       id_user: data.iduser,
  //       questions: [
  //         {
  //           question: data.question,
  //           type: "type_1",
  //           question_index: data.questionindex,
  //           options: data.option,
  //           answer_question: [
  //             {
  //               title: data.answer["title"],
  //               value: data.answer["value"],
  //               answer_index: data.answerindex,
  //             },
  //           ],
  //         },
  //       ],
  //     });
  //   }
  // });
  socket.on("answer_new", async (data) => {
    try {
      // Fetch the room data from the database
      const roomData = await haikus.findOne({ title: data.room });
      const questions = roomData.list_soal.body[0].questions;
      var datas = data;

      // Map questions by their index for easy access
      const questionsMap = {};
      questions.forEach((question) => {
        questionsMap[question.index] = question;
      });

      let correctAnswersCount = 0;
      let answeredQuestionsCount = 0; // Variable to count answered questions

      // Iterate through each answer and compare with the answer keys
      datas.answer.forEach((answer) => {
        const question = questionsMap[answer.questionIndex];
        console.log(question.answer_keys);
        var correctAnswerIndex = "";

        // Check if the question has answer keys
        if (question) {
          if (
            question.answer_keys &&
            question.answer_keys.index !== undefined &&
            question.answer_keys.index !== null
          ) {
            var correctAnswerIndex = question.answer_keys.index.toString();
            // Now you can safely use correctAnswerIndex
          } // Assuming single correct answer
          console.log(question.answer_keys.index);

          // Update the answer status
          answer.status =
            answer.answerIndex === correctAnswerIndex ? "correct" : "false";
          if (answer.status === "correct") {
            correctAnswersCount++;
          }

          // Add correct answer details to the answer object
          answer.correctAnswerIndex = correctAnswerIndex;
          answer.correctAnswerTitle = question.answer_keys.title;

          // Check if the question has been answered
          if (answer.answerIndex !== "0") {
            answeredQuestionsCount++;
          }
        }
      });
      let roomIndex = room.findIndex((entry) => entry.room === roomName);
      let participantIndex = room[roomIndex].participant.findIndex(
        (participant) => participant.name === name
      );
      room[roomIndex].participant[participantIndex].answered =
        answeredQuestionsCount;
      emitRoom(roomName);
      // Calculate the grade out of 100
      const totalQuestions = datas.answer.length;
      const grade = (correctAnswersCount / totalQuestions) * 100;

      // Add the grade and answered questions count to the data
      datas.grade = grade;
      datas.answeredQuestionsCount = answeredQuestionsCount; // Add the answered questions count to datas

      // Upsert the data into the jawaban_new collection
      await jawaban_new.updateOne(
        {
          id_soal: data.id_soal,
          id_room: data.id_room,
          id_user: data.id_user,
        },
        { $set: datas },
        { upsert: true }
      );

      console.log("Data upserted successfully:", datas);
    } catch (error) {
      console.error("Error processing answer_new event:", error);
    }
    // console.log(data);
  });

  socket.on("finishUser", (user) => {
    let roomIndex = room.findIndex((entry) => entry.room === roomName);
    let participantIndex = room[roomIndex].participant.findIndex(
      (participant) => participant.name === name
    );
    room[roomIndex].participant[participantIndex].limit = 0;
    room[roomIndex].participant[participantIndex].status = "Finished";

    console.log(`Finish ${user}'s limit to 0`);

    emitRoom(roomName);
    emitUser(roomName, name + "limit", 0); // Emit the filtered room
  });

  socket.on("kickUser", (user) => {
    let roomIndex = room.findIndex((entry) => entry.room === roomName);
    let participantIndex = room[roomIndex].participant.findIndex(
      (participant) => participant.name === user
    );
    room[roomIndex].participant[participantIndex].limit = 0;
    emitRoom(roomName);
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

  socket.on("endRoom", async () => {
    try {
      // Check the current status of the room
      const roomData = await haikus.findOne({ title: roomName });

      if (roomData) {
        // If the room is currently published, change its status to "live"
        if (roomData.status === "live") {
          // Get today's date
          const today = new Date();
          // Update the room status to "live" and set the start date to today's date
          await haikus.updateOne(
            { title: roomName },
            {
              $set: {
                status: "finish",
                finishedAt: today,
              },
            }
          );
          // Calculate the end time based on the start date and duratio
          io.to(roomName).emit("endRoom", "endRoom");
          // Emit the countdown
          io.to(roomName).emit("countdown", {
            hours: 0,
            minutes: 0,
            seconds: 0,
          });
          console.log("Room finished and status updated to finish.");
        }
      } else {
        console.log("Room not found.");
      }
    } catch (error) {
      console.error("Error starting room:", error);
    }
    console.log("endRoom");
  });

  socket.on("startRoom", async () => {
    try {
      // Check the current status of the room
      const roomData = await haikus.findOne({ title: roomName });

      if (roomData) {
        // If the room is currently published, change its status to "live"
        if (roomData.status === "publish") {
          // Get today's date
          const today = new Date();
          // Update the room status to "live" and set the start date to today's date
          await haikus.updateOne(
            { title: roomName },
            {
              $set: {
                status: "live",
                startAt: today,
              },
            }
          );
          // Calculate the end time based on the start date and duration
          const endTime = new Date(
            today.getTime() +
              roomData.duration.hours * 3600000 +
              roomData.duration.minutes * 60000 +
              roomData.duration.seconds * 1000
          );
          // Calculate the remaining time in milliseconds
          const durationMs = endTime.getTime() - today.getTime();
          // Convert milliseconds to hours, minutes, and seconds
          const hours = Math.floor(durationMs / (1000 * 60 * 60));
          const minutes = Math.floor(
            (durationMs % (1000 * 60 * 60)) / (1000 * 60)
          );
          const seconds = Math.floor((durationMs % (1000 * 60)) / 1000);

          // Emit the countdown
          io.to(roomName).emit("countdown", {
            hours: hours,
            minutes: minutes,
            seconds: seconds,
          });
          console.log("Room started and status updated to live.");
        } else if (roomData.status === "live") {
          // Calculate the end time based on the start date and duration
          const endTime = new Date(
            roomData.startAt.getTime() +
              roomData.duration.hours * 3600000 +
              roomData.duration.minutes * 60000 +
              roomData.duration.seconds * 1000
          );
          // Calculate the remaining time in milliseconds
          const durationMs = endTime.getTime() - new Date().getTime();
          // Convert milliseconds to hours, minutes, and seconds
          const hours = Math.floor(durationMs / (1000 * 60 * 60));
          const minutes = Math.floor(
            (durationMs % (1000 * 60 * 60)) / (1000 * 60)
          );
          const seconds = Math.floor((durationMs % (1000 * 60)) / 1000);

          // Emit the countdown
          io.to(roomName).emit("countdown", {
            hours: hours,
            minutes: minutes,
            seconds: seconds,
          });
          console.log("Room is already live.");
        }
      } else {
        console.log("Room not found.");
      }
    } catch (error) {
      console.error("Error starting room:", error);
    }
  });

  socket.on("checkStatus", async () => {
    try {
      // Check the current status of the room
      const roomData = await haikus.findOne({ title: roomName });

      if (roomData) {
        // If the room is currently published, change its status to "live"
        if (roomData.status === "live") {
          // Get today's date
          const today = new Date();

          // Calculate the end time based on the start date and duration
          const endTime = new Date(
            roomData.startAt.getTime() +
              roomData.duration.hours * 3600000 +
              roomData.duration.minutes * 60000 +
              roomData.duration.seconds * 1000
          );
          // Calculate the remaining time in milliseconds
          const durationMs = endTime.getTime() - today.getTime();
          // Convert milliseconds to hours, minutes, and seconds
          const hours = Math.floor(durationMs / (1000 * 60 * 60));
          const minutes = Math.floor(
            (durationMs % (1000 * 60 * 60)) / (1000 * 60)
          );
          const seconds = Math.floor((durationMs % (1000 * 60)) / 1000);

          // Emit the countdown
          io.to(roomName).emit("countdown", {
            hours: hours,
            minutes: minutes,
            seconds: seconds,
          });
        } else if (roomData.status === "finish") {
          // Calculate the end time based on the start date and duration
          // Emit the countdown
          io.to(roomName).emit("countdown", {
            hours: 0,
            minutes: 0,
            seconds: 0,
          });
        }
      } else {
        io.to(roomName).emit("countdown", {
          hours: 0,
          minutes: 0,
          seconds: 0,
        });
      }
    } catch (error) {
      console.error("Error starting room:", error);
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
          // if (
          //   room[roomIndex][disconnectingType][disconnectingIndex].limit > 0
          // ) {
          //   room[roomIndex][disconnectingType][disconnectingIndex].limit =
          //     room[roomIndex][disconnectingType][disconnectingIndex].limit - 1;
          // }

          room[roomIndex][disconnectingType][disconnectingIndex].status =
            "Disconnected";
          room[roomIndex][disconnectingType][disconnectingIndex].onfocus =
            "Diluar Aplikasi"; // Set onFocus to 'diluar aplikasi'
        }
      }
    }
    console.log(`${name} ${socket.id} disconnected from ${roomName}`);
    // console.log(JSON.stringify(room, null, 2));

    emitRoom(roomName); // Emit the filtered room
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
