const express = require("express");
const axios = require("axios");
const FormData = require("form-data");
const multer = require("multer");

const Attendance = require("../models/Attendance");
const User = require("../models/User");
const CalendarSlot = require("../models/CalendarSlot");
const DeletedAttendance = require("../models/DeletedAttendance");

const {
    auth,
    adminOnly
} = require("../middleware/auth");

const router = express.Router();


/* =====================================================
   MULTER
===================================================== */

const upload = multer({
    storage: multer.memoryStorage()
});


/* =====================================================
   HELPER
===================================================== */

function getCurrentTime() {
    const now = new Date();

    return now
        .toTimeString()
        .slice(0, 5);
}


function getCurrentDate() {
    const now = new Date();

    const year = now.getFullYear();

    const month = String(
        now.getMonth() + 1
    ).padStart(2, "0");

    const day = String(
        now.getDate()
    ).padStart(2, "0");

    return `${year}-${month}-${day}`;
}


function getCurrentDay() {
    const days = [
        "Sunday",
        "Monday",
        "Tuesday",
        "Wednesday",
        "Thursday",
        "Friday",
        "Saturday"
    ];

    return days[new Date().getDay()];
}


/* =====================================================
   AUTO MARK ABSENT
===================================================== */

async function autoMarkAbsent() {

    try {

        const date = getCurrentDate();

        const currentTime = getCurrentTime();

        const currentDay = getCurrentDay();


        const finishedSlots =
            await CalendarSlot.find({
                day: currentDay
            });


        const students =
            await User.find({
                role: "student"
            });


        for (const slot of finishedSlots) {

            /*
                Only process finished slots.
            */

            if (slot.endTime > currentTime) {
                continue;
            }


            /*
                IMPORTANT:

                If admin intentionally deleted
                attendance for this exact slot,
                DO NOT create Absent again.
            */

            const deletedSlot =
                await DeletedAttendance.findOne({

                    date: date,

                    subject: slot.subject,

                    startTime: slot.startTime,

                    endTime: slot.endTime

                });


            if (deletedSlot) {
                continue;
            }


            for (const student of students) {

                const existing =
                    await Attendance.findOne({

                        studentId:
                            student.userId,

                        subject:
                            slot.subject,

                        date:
                            date,

                        startTime:
                            slot.startTime,

                        endTime:
                            slot.endTime

                    });


                if (existing) {
                    continue;
                }


                await Attendance.create({

                    student:
                        student._id,

                    studentId:
                        student.userId,

                    studentName:
                        student.name,

                    subject:
                        slot.subject,

                    date:
                        date,

                    time:
                        slot.startTime,

                    startTime:
                        slot.startTime,

                    endTime:
                        slot.endTime,

                    status:
                        "Absent",

                    verification:
                        "system",

                    livenessPassed:
                        false

                });

            }

        }

    }
    catch (error) {

        console.log(
            "AUTO ABSENT ERROR:"
        );

        console.log(
            error.message
        );

    }
}


/* =====================================================
   FACE RECOGNITION
===================================================== */

router.post(
    "/recognize",
    auth,
    adminOnly,
    upload.single("image"),

    async function(req, res) {

        try {

            if (!req.file) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Image is required"

                });

            }


            const formData =
                new FormData();


            formData.append(
                "image",
                req.file.buffer,
                {
                    filename: "face.jpg",

                    contentType:
                        req.file.mimetype
                }
            );


            const response =
                await axios.post(
                    "http://127.0.0.1:8000/process-face",
                    formData,
                    {
                        headers:
                            formData.getHeaders()
                    }
                );


            const aiData =
                response.data;


            if (
                !aiData ||
                !aiData.embedding
            ) {

                return res.json({

                    success: false,

                    message:
                        "Face not detected"

                });

            }


            const detectedEmbedding =
                aiData.embedding;


            const students =
                await User.find({

                    role: "student",

                    faceRegistered: true,

                    faceEmbedding: {
                        $exists: true,
                        $ne: null
                    }

                });


            let bestStudent = null;

            let bestSimilarity = -1;


            for (const student of students) {

                const stored =
                    student.faceEmbedding;


                if (
                    !stored ||
                    !stored.length
                ) {
                    continue;
                }


                let dot = 0;

                let normA = 0;

                let normB = 0;


                const length =
                    Math.min(
                        detectedEmbedding.length,
                        stored.length
                    );


                for (
                    let i = 0;
                    i < length;
                    i++
                ) {

                    dot +=
                        detectedEmbedding[i] *
                        stored[i];

                    normA +=
                        detectedEmbedding[i] *
                        detectedEmbedding[i];

                    normB +=
                        stored[i] *
                        stored[i];

                }


                if (
                    normA === 0 ||
                    normB === 0
                ) {
                    continue;
                }


                const similarity =
                    dot /
                    (
                        Math.sqrt(normA) *
                        Math.sqrt(normB)
                    );


                if (
                    similarity >
                    bestSimilarity
                ) {

                    bestSimilarity =
                        similarity;

                    bestStudent =
                        student;

                }

            }


            if (
                !bestStudent ||
                bestSimilarity < 0.45
            ) {

                return res.json({

                    success: false,

                    message:
                        "Face not recognized",

                    confidence:
                        bestSimilarity

                });

            }


            return res.json({

                success: true,

                student: {

                    _id:
                        bestStudent._id,

                    userId:
                        bestStudent.userId,

                    name:
                        bestStudent.name

                },

                confidence:
                    bestSimilarity

            });

        }
        catch (error) {

            console.log(
                "FACE RECOGNITION ERROR:"
            );

            console.log(
                error.response?.data ||
                error.message
            );


            return res.status(500).json({

                success: false,

                message:
                    "Face recognition failed"

            });

        }

    }
);


/* =====================================================
   MARK ATTENDANCE
===================================================== */

router.post(
    "/mark",
    auth,
    adminOnly,

    async function(req, res) {

        try {

            const {
                studentId,
                livenessPassed,
                confidence
            } = req.body;


            if (!studentId) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Student ID is required"

                });

            }


            if (!livenessPassed) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Liveness verification failed"

                });

            }


            const date =
                getCurrentDate();

            const currentTime =
                getCurrentTime();

            const currentDay =
                getCurrentDay();


            const slots =
                await CalendarSlot.find({
                    day: currentDay
                });


            const activeSlot =
                slots.find(function(slot) {

                    return (
                        currentTime >=
                        slot.startTime

                        &&

                        currentTime <
                        slot.endTime
                    );

                });


            if (!activeSlot) {

                return res.status(400).json({

                    success: false,

                    message:
                        "No active subject for current time"

                });

            }


            const student =
                await User.findOne({

                    userId: studentId,

                    role: "student"

                });


            if (!student) {

                return res.status(404).json({

                    success: false,

                    message:
                        "Student not found"

                });

            }


            /*
                If this exact slot was previously
                deleted, remove the delete marker
                because attendance is being marked again.
            */

            await DeletedAttendance.deleteOne({

                date: date,

                subject:
                    activeSlot.subject,

                startTime:
                    activeSlot.startTime,

                endTime:
                    activeSlot.endTime

            });


            const existing =
                await Attendance.findOne({

                    studentId:
                        student.userId,

                    subject:
                        activeSlot.subject,

                    date:
                        date,

                    startTime:
                        activeSlot.startTime,

                    endTime:
                        activeSlot.endTime

                });


            if (existing) {

                if (
                    existing.status ===
                    "Present"
                ) {

                    return res.json({

                        success: true,

                        alreadyMarked: true,

                        message:
                            `${student.name} attendance already marked`

                    });

                }


                existing.status =
                    "Present";

                existing.time =
                    currentTime;

                existing.verification =
                    "face";

                existing.livenessPassed =
                    true;

                existing.confidence =
                    confidence ?? null;


                await existing.save();


                return res.json({

                    success: true,

                    message:
                        `${student.name} attendance marked Present`

                });

            }


            await Attendance.create({

                student:
                    student._id,

                studentId:
                    student.userId,

                studentName:
                    student.name,

                subject:
                    activeSlot.subject,

                date:
                    date,

                time:
                    currentTime,

                startTime:
                    activeSlot.startTime,

                endTime:
                    activeSlot.endTime,

                status:
                    "Present",

                verification:
                    "face",

                livenessPassed:
                    true,

                confidence:
                    confidence ?? null

            });


            return res.json({

                success: true,

                message:
                    `${student.name} attendance marked Present`,

                student: {

                    userId:
                        student.userId,

                    name:
                        student.name

                },

                subject:
                    activeSlot.subject,

                startTime:
                    activeSlot.startTime,

                endTime:
                    activeSlot.endTime

            });

        }
        catch (error) {

            console.log(
                "MARK ATTENDANCE ERROR:"
            );

            console.log(error);


            if (
                error.code === 11000
            ) {

                return res.status(409).json({

                    success: false,

                    message:
                        "Attendance already exists for this slot"

                });

            }


            return res.status(500).json({

                success: false,

                message:
                    error.message

            });

        }

    }
);


/* =====================================================
   GET ATTENDANCE
===================================================== */

router.get(
    "/",
    auth,
    adminOnly,

    async function(req, res) {

        try {

            await autoMarkAbsent();


            const {
                date,
                subject,
                status
            } = req.query;


            const filter = {};


            if (date) {
                filter.date = date;
            }


            if (subject) {
                filter.subject = subject;
            }


            if (status) {
                filter.status = status;
            }


            const attendance =
                await Attendance.find(filter)
                    .sort({
                        date: -1,
                        startTime: 1,
                        time: 1
                    });


            return res.json({

                success: true,

                attendance:
                    attendance

            });

        }
        catch (error) {

            console.log(
                "GET ATTENDANCE ERROR:"
            );

            console.log(error);


            return res.status(500).json({

                success: false,

                message:
                    error.message

            });

        }

    }
);


/* =====================================================
   GET STUDENT ATTENDANCE
===================================================== */

router.get(
    "/student/:studentId",

    auth,

    async function(req, res) {

        try {

            if (
                req.user.role ===
                "student"

                &&

                req.user.userId !==
                req.params.studentId
            ) {

                return res.status(403).json({

                    success: false,

                    message:
                        "Access denied"

                });

            }


            await autoMarkAbsent();


            const records =
                await Attendance.find({

                    studentId:
                        req.params.studentId

                })
                .sort({

                    date: -1,

                    startTime: 1

                });


            return res.json({

                success: true,

                attendance:
                    records

            });

        }
        catch (error) {

            return res.status(500).json({

                success: false,

                message:
                    error.message

            });

        }

    }
);


/* =====================================================
   MANUAL PRESENT / ABSENT
===================================================== */

router.patch(
    "/:id",

    auth,
    adminOnly,

    async function(req, res) {

        try {

            const {
                status
            } = req.body;


            if (
                ![
                    "Present",
                    "Absent"
                ].includes(status)
            ) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Invalid attendance status"

                });

            }


            const attendance =
                await Attendance.findById(
                    req.params.id
                );


            if (!attendance) {

                return res.status(404).json({

                    success: false,

                    message:
                        "Attendance record not found"

                });

            }


            attendance.status =
                status;

            attendance.verification =
                "manual";

            attendance.livenessPassed =
                false;


            await attendance.save();


            /*
                Remove delete marker because
                admin has manually created/changed
                attendance for this exact slot.
            */

            await DeletedAttendance.deleteOne({

                date:
                    attendance.date,

                subject:
                    attendance.subject,

                startTime:
                    attendance.startTime,

                endTime:
                    attendance.endTime

            });


            return res.json({

                success: true,

                message:
                    `Attendance marked ${status}`

            });

        }
        catch (error) {

            console.log(
                "UPDATE ATTENDANCE ERROR:"
            );

            console.log(error);


            return res.status(500).json({

                success: false,

                message:
                    error.message

            });

        }

    }
);


/* =====================================================
   DELETE ATTENDANCE BY EXACT DATE + SLOT
===================================================== */

router.delete(
    "/delete-by-date-slot",

    auth,
    adminOnly,

    async function(req, res) {

        try {

            const {
                date,
                subject,
                startTime,
                endTime
            } = req.query;


            console.log(
                "===================================="
            );

            console.log(
                "DELETE ATTENDANCE REQUEST"
            );

            console.log(
                "Date:",
                date
            );

            console.log(
                "Subject:",
                subject
            );

            console.log(
                "Start:",
                startTime
            );

            console.log(
                "End:",
                endTime
            );


            if (
                !date ||
                !subject ||
                !startTime ||
                !endTime
            ) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Date, subject, start time and end time are required"

                });

            }


            /*
                Create deletion marker FIRST.

                This prevents autoMarkAbsent()
                from recreating Absent records.
            */

            await DeletedAttendance.findOneAndUpdate(

                {
                    date:
                        date,

                    subject:
                        subject,

                    startTime:
                        startTime,

                    endTime:
                        endTime

                },

                {
                    $set: {

                        date:
                            date,

                        subject:
                            subject,

                        startTime:
                            startTime,

                        endTime:
                            endTime

                    }
                },

                {
                    upsert: true,

                    new: true
                }

            );


            /*
                Delete attendance for exact slot.
            */

            const result =
                await Attendance.deleteMany({

                    date:
                        date,

                    subject:
                        subject,

                    startTime:
                        startTime,

                    endTime:
                        endTime

                });


            console.log(
                "DELETED COUNT:",
                result.deletedCount
            );

            console.log(
                "===================================="
            );


            return res.json({

                success: true,

                message:
                    `${result.deletedCount} attendance records deleted successfully`,

                deletedCount:
                    result.deletedCount

            });

        }
        catch (error) {

            console.log(
                "DELETE ATTENDANCE ERROR:"
            );

            console.log(error);


            return res.status(500).json({

                success: false,

                message:
                    error.message

            });

        }

    }
);


/* =====================================================
   AUTO ABSENT TIMER
===================================================== */

setInterval(
    autoMarkAbsent,
    60 * 1000
);


/*
    Run once when backend starts.
*/

autoMarkAbsent();


module.exports = router;