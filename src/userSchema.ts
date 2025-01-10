import mongoose, { Schema } from "mongoose";
import { postDocument } from "./postSchema";

export interface UserDocument{
    _id: string;
    username: string;
    profilePhoto : string;
    description : string;
    email: string;
    password: string;
    posts : postDocument[]
}

const UserSchema = new Schema<UserDocument>({
    username: {
        type: String,
        required: true,
        unique : true
        },
        profilePhoto: {
            type: String,
            default: ''
            },
        description : String,
        email: {
            type: String,
            required: true
        },
        password: {
            type: String,
            required: true
        },
        posts :[ {
            type : Schema.Types.ObjectId,
            ref: 'Post',

        }]
})

export const User = mongoose.model('User', UserSchema);