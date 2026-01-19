import mongoose, { Schema } from "mongoose";
const roomSchema = new Schema({
    roomId: {
        type: String,
        required: true,
        unique: true,
        index: true,
    },
    createdBy: {
        type: Schema.Types.ObjectId,
        ref: "User",
        required: true,
    },
    participants: [
        {
            type: Schema.Types.ObjectId,
            ref: "User",
        },
    ],
    code: {
        type: String,
        default: "",
    },
    language: {
        type: String,
        enum: ["javascript", "python"],
        default: "javascript",
    },
}, {
    timestamps: true,
});
const Room = mongoose.model("Room", roomSchema);
export default Room;
