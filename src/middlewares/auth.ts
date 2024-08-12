import { User } from "../models/user.js";
import ErrorHandler from "../utils/utility-class.js";
import { TryCatch } from "./error.js";

// Middleware to make sure only admin is allowed
export const adminOnly = TryCatch(async (req, res, next) => {
  const { id } = req.query; // eg.. api/v1/user/setger?key=24   here setger= is params and key=24 is query which is writtern after question mark (?)

  if (!id) return next(new ErrorHandler("Login First", 401));

  const user = await User.findById(id);

  if (!user) return next(new ErrorHandler("invalid Id", 401));

  if (user.role != "admin")
    return next(new ErrorHandler("Only admin can access this", 403)); // 403 - forbidden, if not admin access

  next();
});
