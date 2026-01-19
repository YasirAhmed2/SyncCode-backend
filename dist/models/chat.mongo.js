import mongoose, { Schema } from "mongoose";
const chatSchema = new Schema({
    roomId: {
        type: String,
        required: true,
    },
    sender: {
        type: Schema.Types.ObjectId,
        ref: "User",
        required: true,
    },
    message: {
        type: String,
        required: true,
        trim: true,
    },
}, { timestamps: true });
export default mongoose.model("Chat", chatSchema);
