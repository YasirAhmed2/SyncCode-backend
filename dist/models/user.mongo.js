import mongoose, { Schema } from "mongoose";
const UserSchema = new Schema({
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
}, {
    timestamps: true
});
export default mongoose.model("User", UserSchema);
