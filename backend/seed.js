require("dotenv").config();

const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const User = require("./models/User");
const CalendarSlot = require("./models/CalendarSlot");

async function seed() {

    try {

        await mongoose.connect(
            process.env.MONGO_URI
        );

        console.log("MongoDB Connected");


        // ADMIN
        const adminPassword =
            await bcrypt.hash(
                "admin123",
                10
            );

        await User.updateOne(

            {
                userId: "admin001"
            },

            {
                $set: {

                    name: "Admin Teacher",

                    passwordHash:
                        adminPassword,

                    role: "admin",

                    email:
                        "admin@faceattend.com"
                }
            },

            {
                upsert: true
            }
        );


        // STUDENT 1
        const studentPassword =
            await bcrypt.hash(
                "123456",
                10
            );

        await User.updateOne(

            {
                userId: "stu001"
            },

            {
                $set: {

                    name: "Rahul Sharma",

                    passwordHash:
                        studentPassword,

                    role: "student",

                    email:
                        "rahul@faceattend.com"
                }
            },

            {
                upsert: true
            }
        );


        // STUDENT 2
        await User.updateOne(

            {
                userId: "stu002"
            },

            {
                $set: {

                    name: "Aman Kumar",

                    passwordHash:
                        studentPassword,

                    role: "student",

                    email:
                        "aman@faceattend.com"
                }
            },

            {
                upsert: true
            }
        );


        // SAMPLE CALENDAR
        const count =
            await CalendarSlot.countDocuments();

        if (count === 0) {

            await CalendarSlot.insertMany([

                {
                    day: "Monday",
                    subject: "Data Structures",
                    startTime: "09:00",
                    endTime: "10:00"
                },

                {
                    day: "Monday",
                    subject: "DBMS",
                    startTime: "10:00",
                    endTime: "11:00"
                },

                {
                    day: "Monday",
                    subject: "Operating Systems",
                    startTime: "12:00",
                    endTime: "13:00"
                }
            ]);

            console.log(
                "Sample calendar added"
            );
        }

        console.log("Seed completed");

    } catch (error) {

        console.log(error.message);

    } finally {

        await mongoose.disconnect();
    }
}

seed();