require("dotenv").config();

const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const User = require("./models/User");
const CalendarSlot = require("./models/CalendarSlot");

async function seed() {
    try {
        await mongoose.connect(process.env.MONGO_URI);

        console.log("MongoDB Connected");

        // =========================
        // ADMIN
        // =========================

        const adminPassword = await bcrypt.hash(
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
                    email: "admin@faceattend.com",
                    passwordHash: adminPassword,
                    role: "admin",
                    faceRegistered: false,
                    faceImage: null,
                    faceEmbedding: null
                }
            },
            {
                upsert: true
            }
        );

        console.log("Admin created/updated");


        // =========================
        // SAMPLE CALENDAR
        // =========================

        const count = await CalendarSlot.countDocuments();

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

            console.log("Sample calendar added");
        } else {
            console.log("Calendar already exists, skipping");
        }


        console.log("Seed completed successfully");

    } catch (error) {
        console.log("Seed Error:");
        console.log(error.message);

    } finally {
        await mongoose.disconnect();
    }
}

seed();