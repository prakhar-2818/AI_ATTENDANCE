const express = require("express");

const CalendarSlot =
    require("../models/CalendarSlot");

const {
    auth,
    adminOnly
} = require("../middleware/auth");

const router = express.Router();


// GET ALL SLOTS
router.get("/", auth, async (req, res) => {

    try {

        const slots =
            await CalendarSlot.find()
                .sort({
                    day: 1,
                    startTime: 1
                });

        res.json({
            success: true,
            slots
        });

    } catch (error) {

        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});


// ADD SLOT
router.post("/", auth, adminOnly, async (req, res) => {

    try {

        const {
            day,
            subject,
            startTime,
            endTime
        } = req.body;

        if (
            !day ||
            !subject ||
            !startTime ||
            !endTime
        ) {

            return res.status(400).json({
                success: false,
                message: "All fields are required"
            });
        }

        if (startTime >= endTime) {

            return res.status(400).json({
                success: false,
                message: "End time must be after start time"
            });
        }

        const overlap =
            await CalendarSlot.findOne({
                day,

                startTime: {
                    $lt: endTime
                },

                endTime: {
                    $gt: startTime
                }
            });

        if (overlap) {

            return res.status(409).json({
                success: false,
                message: "Time overlaps with another slot"
            });
        }

        const slot =
            await CalendarSlot.create({
                day,
                subject,
                startTime,
                endTime
            });

        res.status(201).json({
            success: true,
            slot
        });

    } catch (error) {

        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});


// DELETE SLOT
router.delete(
    "/:id",
    auth,
    adminOnly,
    async (req, res) => {

        try {

            const slot =
                await CalendarSlot.findByIdAndDelete(
                    req.params.id
                );

            if (!slot) {

                return res.status(404).json({
                    success: false,
                    message: "Slot not found"
                });
            }

            res.json({
                success: true,
                message: "Slot deleted"
            });

        } catch (error) {

            res.status(500).json({
                success: false,
                message: error.message
            });
        }
    }
);


// GET CURRENT ACTIVE SUBJECT
router.get(
    "/active",
    auth,
    async (req, res) => {

        try {

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

            const day = days[now.getDay()];

            const currentTime =
                String(now.getHours())
                    .padStart(2, "0")
                + ":" +
                String(now.getMinutes())
                    .padStart(2, "0");

            const slot =
                await CalendarSlot.findOne({

                    day,

                    startTime: {
                        $lte: currentTime
                    },

                    endTime: {
                        $gt: currentTime
                    }
                });

            res.json({

                success: true,

                active: Boolean(slot),

                day,

                currentTime,

                slot: slot || null
            });

        } catch (error) {

            res.status(500).json({
                success: false,
                message: error.message
            });
        }
    }
);

module.exports = router;