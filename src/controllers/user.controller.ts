import { Response } from "express";
import { AuthRequest } from "../middlewares/auth.middleware.js";
import User  from "../models/user.mongo.js";

export const getMyProfile = async (req:AuthRequest, res:Response) => {
  try {
    const _id =req.user?.userId;
    console.log("Fetching profile for userId:", _id);
    const user = await User.findById(_id).select(
      "name email iat"
    );

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.status(200).json({
      success: true,
      user,
    });
  } catch (error) {
    console.error("Error fetching profile:", error);
    res.status(500).json({ message: "Server error" });
  }
};


export const updateMyProfile = async (req, res: Response) => {
  try {
    const userId = req.user?.userId;
console.log("Updating profile for userId:", userId);
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const { name, email } = req.body;
    if (!name && !email) {
      return res
        .status(400)
        .json({ message: "Nothing to update" });
    }

    const updateData: { name?: string; email?: string } = {};

    if (name) updateData.name = name;
    if (email) updateData.email = email;

    if (email) {
      const emailExists = await User.findOne({
        email,
        _id: { $ne: userId },
      });

      if (emailExists) {
        return res
          .status(409)
          .json({ message: "Email already in use" });
      }
    }

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      updateData,
      { new: true, runValidators: true }
    ).select("name email");

    if (!updatedUser) {
      return res.status(404).json({ message: "User not found" });
    }

    res.status(200).json({
      success: true,
      message: "Profile updated successfully",
      user: updatedUser,
    });
  } catch (error) {
    console.error("Update profile error:", error);
    res.status(500).json({ message: "Server error" });
  }
};
