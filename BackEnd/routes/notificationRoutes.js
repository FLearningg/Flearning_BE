const notificationController = require("../controllers/notificationController");

const router = require("express").Router();

router.get("/:userId", notificationController.getNotifications);

router.put("/:userId", notificationController.updateAllStatusNotification);

module.exports = router;
