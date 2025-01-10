import mongoose, { Schema } from "mongoose";
import { UserDocument } from "./userSchema";

export interface postDocument{
    title: string;
    content?: string;
    image : string;
    category ?: "Dresses" | "Outwear" | "Footwear" | "Tops" | "Bottomwear" | "Accessories",
    likeCount : number;
    owner : UserDocument
}

const PostSchema = new Schema<postDocument>({
    title: {type: String, required: true},
    content: {type: String, required: true},
    image: {type: String, 
        default:"https://img.freepik.com/premium-vector/default-image-icon-vector-missing-picture-page-website-design-mobile-app-no-photo-available_87543-11093.jpg?w=826"
    },
    likeCount: {type: Number, default: 0},
    category : {type : String},
    owner : {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true
    }
})

export const Post = mongoose.model("Post",PostSchema)