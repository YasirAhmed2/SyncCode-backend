import mongoose, { Schema, Document } from "mongoose";

export interface IUser extends Document {
  name: string;
  email: string;
  password?: string;
  provider: "local" | "google" | "github";

  // OTP-based forgot password
  otp?: string;
  otpExpire?: Date;

  // Reset password (JWT / token based)
  resetPasswordToken?: string;
  resetPasswordExpire?: Date;

  isEmailVerified: boolean;

  createdAt: Date;
  updatedAt: Date;
}

const UserSchema: Schema<IUser> = new Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true
    },

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      index: true
    },

    password: {
      type: String,
      minlength: 6
    },

    provider: {
      type: String,
      enum: ["local", "google", "github"],
      default: "local"
    },

    // OTP fields
    otp: {
      type: String
    },

    otpExpire: {
      type: Date
    },

    // Reset token fields
    resetPasswordToken: {
      type: String
    },

    resetPasswordExpire: {
      type: Date
    },

    isEmailVerified: {
      type: Boolean,
      default: false
    }
  },
  {
    timestamps: true
  }
);

export default mongoose.model<IUser>("User", UserSchema);
