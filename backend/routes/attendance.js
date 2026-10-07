const express = require("express");
const axios = require("axios");
const FormData = require("form-data");
const multer = require("multer");

const Attendance =
    require("../models/Attendance");

const User =
    require("../models/User");

const CalendarSlot =
    require("../models/CalendarSlot");

const {
    auth,
    adminOnly
} = require("../middleware/auth");

const router = express.Router();


// ==========================================
// MULTER CONFIGURATION
// ==========================================

const upload = multer({
    storage: multer.memoryStorage(),

    limits: {
        fileSize: 5 * 1024 * 1024
    },

    fileFilter: function (req, file, cb) {

        const allowedTypes = [
            "image/jpeg",
            "image/png",
            "image/jpg",
            "image/webp"
        ];

        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error("Only image files are allowed"));
        }
    }
});


// ==========================================
// RECOGNIZE FACE
// ==========================================

router.post(
    "/recognize",
    auth,
    adminOnly,
    upload.single("image"),

    async (req, res) => {

        try {

            // ----------------------------------
            // CHECK IMAGE
            // ----------------------------------

            if (!req.file) {

                return res.status(400).json({
                    success: false,
                    message: "Image is required"
                });

            }


            // ----------------------------------
            // SEND IMAGE TO PYTHON AI
            // ----------------------------------

            const form = new FormData();

            form.append(
                "image",
                req.file.buffer,
                {
                    filename: "live-frame.jpg",
                    contentType: req.file.mimetype
                }
            );


            const aiResponse =
                await axios.post(

                    "http://127.0.0.1:8000/process-face",

                    form,

                    {
                        headers:
                            form.getHeaders(),

                        maxContentLength:
                            Infinity,

                        maxBodyLength:
                            Infinity,

                        timeout: 30000
                    }
                );


            const aiData =
                aiResponse.data;


            // ----------------------------------
            // AI FAILED
            // ----------------------------------

            if (!aiData.success) {

                return res.json({

                    success: false,

                    message:
                        aiData.message

                });

            }


            const liveEmbedding =
                aiData.embedding;


            // ----------------------------------
            // CHECK EMBEDDING
            // ----------------------------------

            if (
                !liveEmbedding ||
                !Array.isArray(liveEmbedding)
            ) {

                return res.status(500).json({

                    success: false,

                    message:
                        "AI embedding not received"

                });

            }


            // ==================================
            // GET REGISTERED STUDENTS
            // ==================================

            const students =
                await User.find({

                    role: "student",

                    faceRegistered: true,

                    faceEmbedding: {
                        $ne: null
                    }

                }).select(
                    "userId name faceEmbedding"
                );


            if (students.length === 0) {

                return res.json({

                    success: false,

                    message:
                        "No registered student faces found"

                });

            }


            // ==================================
            // COSINE SIMILARITY
            // ==================================

            function cosineSimilarity(a, b) {

                let dot = 0;

                let magnitudeA = 0;

                let magnitudeB = 0;


                for (
                    let i = 0;
                    i < a.length;
                    i++
                ) {

                    dot +=
                        a[i] * b[i];

                    magnitudeA +=
                        a[i] * a[i];

                    magnitudeB +=
                        b[i] * b[i];

                }


                if (
                    magnitudeA === 0 ||
                    magnitudeB === 0
                ) {

                    return 0;

                }


                return dot /
                    (
                        Math.sqrt(
                            magnitudeA
                        ) *
                        Math.sqrt(
                            magnitudeB
                        )
                    );
            }


            // ==================================
            // FIND BEST MATCH
            // ==================================

            let bestStudent = null;

            let bestScore = -1;


            for (
                const student of students
            ) {

                if (
                    !student.faceEmbedding ||
                    student.faceEmbedding.length !==
                    liveEmbedding.length
                ) {

                    continue;

                }


                const score =
                    cosineSimilarity(
                        liveEmbedding,
                        student.faceEmbedding
                    );


                if (
                    score > bestScore
                ) {

                    bestScore = score;

                    bestStudent = student;

                }

            }


            // ==================================
            // MATCH THRESHOLD
            // ==================================

            const MATCH_THRESHOLD = 0.45;


            if (
                !bestStudent ||
                bestScore < MATCH_THRESHOLD
            ) {

                return res.json({

                    success: false,

                    message:
                        "Face not recognized",

                    confidence:
                        bestScore

                });

            }


            // ==================================
            // FACE RECOGNIZED
            // ==================================

            return res.json({

                success: true,

                message:
                    "Face recognized",

                student: {

                    userId:
                        bestStudent.userId,

                    name:
                        bestStudent.name

                },

                confidence:
                    bestScore

            });


        } catch (error) {

            console.log(
                "RECOGNITION ERROR:"
            );

            console.log(
                error.response?.data ||
                error.message
            );


            return res.status(500).json({

                success: false,

                message:
                    error.response?.data?.message ||
                    error.message

            });

        }

    }
);


// ==========================================
// MARK ATTENDANCE
// ==========================================

router.post(
    "/mark",
    auth,
    adminOnly,

    async (req, res) => {

        try {

            const {
                studentId,
                subject,
                livenessPassed,
                confidence
            } = req.body;


            // ----------------------------------
            // BASIC VALIDATION
            // ----------------------------------

            if (!studentId || !subject) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Student ID and subject required"

                });

            }


            // ----------------------------------
            // LIVENESS MUST PASS
            // ----------------------------------

            if (!livenessPassed) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Liveness verification failed"

                });

            }


            // ----------------------------------
            // FIND STUDENT
            // ----------------------------------

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


            // ----------------------------------
            // CURRENT DATE / TIME
            // ----------------------------------

            const now = new Date();


            const days = [
                "Sunday",
                "Monday",
                "Tuesday",
                "Wednesday",
                "Thursday",
                "Friday",
                "Saturday"
            ];


            const day =
                days[now.getDay()];


            const date =
                now.getFullYear() +
                "-" +
                String(
                    now.getMonth() + 1
                ).padStart(2, "0") +
                "-" +
                String(
                    now.getDate()
                ).padStart(2, "0");


            const time =
                String(
                    now.getHours()
                ).padStart(2, "0") +
                ":" +
                String(
                    now.getMinutes()
                ).padStart(2, "0");


            // ==================================
            // CHECK ACTIVE SUBJECT
            // ==================================

            const activeSlot =
                await CalendarSlot.findOne({

                    day,

                    subject,

                    startTime: {
                        $lte: time
                    },

                    endTime: {
                        $gt: time
                    }

                });


            if (!activeSlot) {

                return res.status(400).json({

                    success: false,

                    message:
                        "This subject is not active right now"

                });

            }


            // ==================================
            // CHECK DUPLICATE
            // ==================================

            const existing =
                await Attendance.findOne({

                    studentId,

                    subject,

                    date

                });


            if (existing) {

                return res.json({

                    success: true,

                    alreadyMarked: true,

                    message:
                        `${student.name} is already marked`,

                    attendance:
                        existing

                });

            }


            // ==================================
            // CREATE ATTENDANCE
            // ==================================

            const attendance =
                await Attendance.create({

                    student:
                        student._id,

                    studentId:
                        student.userId,

                    studentName:
                        student.name,

                    subject,

                    date,

                    time,

                    status:
                        "Present",

                    verification:
                        "face",

                    livenessPassed:
                        true,

                    confidence:
                        confidence || null

                });


            // ==================================
            // RESPONSE
            // ==================================

            res.status(201).json({

                success: true,

                alreadyMarked: false,

                message:
                    `${student.name} marked Present`,

                attendance

            });


        } catch (error) {

            console.log(
                "MARK ATTENDANCE ERROR:"
            );

            console.log(error);


            res.status(500).json({

                success: false,

                message:
                    error.message

            });

        }

    }
);


// ==========================================
// GET ALL ATTENDANCE
// ==========================================

router.get(
    "/",
    auth,

    async (req, res) => {

        try {

            const filter = {};


            if (req.query.date) {

                filter.date =
                    req.query.date;

            }


            if (req.query.subject) {

                filter.subject =
                    req.query.subject;

            }


            if (req.query.status) {

                filter.status =
                    req.query.status;

            }


            const attendance =
                await Attendance.find(
                    filter
                ).sort({

                    date: -1,

                    time: -1

                });


            res.json({

                success: true,

                attendance

            });


        } catch (error) {

            res.status(500).json({

                success: false,

                message:
                    error.message

            });

        }

    }
);


// ==========================================
// GET STUDENT ATTENDANCE
// ==========================================

router.get(
    "/student/:studentId",
    auth,

    async (req, res) => {

        try {

            // Student can only see own attendance
            if (
                req.user.role === "student" &&
                req.user.userId !==
                req.params.studentId
            ) {

                return res.status(403).json({

                    success: false,

                    message:
                        "You can only view your own attendance"

                });

            }


            const records =
                await Attendance.find({

                    studentId:
                        req.params.studentId

                }).sort({

                    date: -1,

                    time: -1

                });


            res.json({

                success: true,

                attendance:
                    records

            });


        } catch (error) {

            res.status(500).json({

                success: false,

                message:
                    error.message

            });

        }

    }
);


module.exports = router;