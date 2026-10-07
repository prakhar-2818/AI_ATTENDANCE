require("dotenv").config();

const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");

const authRoutes = require("./routes/auth");
const studentRoutes = require("./routes/students");
const calendarRoutes = require("./routes/calendar");
const attendanceRoutes = require("./routes/attendance");

const app = express();

app.use(cors());
app.use(express.json({ limit: "10mb" }));

app.get("/", (req, res) => {
    res.json({
        success: true,
        message: "FaceAttend Backend is Running"
    });
});

app.get("/api/health", (req, res) => {
    res.json({
        success: true,
        server: "running",
        database:
            mongoose.connection.readyState === 1
                ? "connected"
                : "disconnected"
    });
});

app.use("/api/auth", authRoutes);
app.use("/api/students", studentRoutes);
app.use("/api/calendar", calendarRoutes);
app.use("/api/attendance", attendanceRoutes);

const PORT = process.env.PORT || 5000;

mongoose
    .connect(process.env.MONGO_URI)
    .then(() => {
        console.log("MongoDB Connected");

        app.listen(PORT, () => {
            console.log(`Server running on http://localhost:${PORT}`);
        });
    })
    .catch((error) => {
        console.log("MongoDB Connection Error:");
        console.log(error.message);
    });