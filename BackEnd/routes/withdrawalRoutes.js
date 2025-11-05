const express = require("express");
const router = express.Router();
const withdrawalController = require("../controllers/withdrawalController");
const authorize = require("../middlewares/authMiddleware");

router.post(
  "/",
  authorize("instructor"),
  withdrawalController.createWithdrawalRequest
);
router.put(
  "/:id",
  authorize("instructor", "admin"),
  withdrawalController.updateWithdrawalStatus
);
router.get(
  "/",
  authorize("instructor", "admin"),
  withdrawalController.getWithdrawalRequests
);

module.exports = router;
