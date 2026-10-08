import { Request, Response, NextFunction } from "express";
import { ObjectId } from "mongodb";
import { getDatabase } from "./db.ts";

// Compatibility routes accept resource IDs in bodies/query strings rather than URL params.
export function ownResource(
  collection: string,
  field: string,
  source: "body" | "query" | "params",
) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const id = req[source]?.[field];
    if (typeof id !== "string" || !ObjectId.isValid(id))
      return res
        .status(400)
        .json({ success: false, message: `A valid ${field} is required.` });
    try {
      const doc = await getDatabase()
        .collection(collection)
        .findOne({ _id: new ObjectId(id) });
      if (!doc)
        return res
          .status(404)
          .json({ success: false, message: "Resource not found." });
      if (
        req.user?.role === "teacher" &&
        String(doc.teacherId) !== req.user.userId
      )
        return res
          .status(403)
          .json({
            success: false,
            message: "You do not have access to this resource.",
          });
      next();
    } catch (error) {
      next(error);
    }
  };
}
