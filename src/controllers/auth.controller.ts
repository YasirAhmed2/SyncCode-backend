
import bcrypt from "bcrypt";
import User from "@/models/user.mongo.js";
import { generateToken } from "../utils/jwt.utils.js";

import * as crypto from "crypto";

import { sendEmail } from "../services/email.service.js";

async function Signup(userData) {

  // const { name, email, password } = req.body;
 



  const hashedPassword = await bcrypt.hash(userData.password, 10);

  const userCreated = new User({
    name: userData.name,
    email: userData.email,

    password: hashedPassword,
    provider: "local",
    isEmailVerified: false
  });




  const otp = Math.floor(100000 + Math.random() * 900000).toString();

  const hashedOtp = crypto
    .createHash("sha256")
    .update(otp)
    .digest("hex");

  userCreated.otp = hashedOtp;
  userCreated.otpExpire = new Date(Date.now() + 5 * 60 * 1000);

  const user = await userCreated.save();
  // await user.save();


  await sendEmail(
    user.email,
    "Verify Your SyncCode Account",
    `
      <h2>Email Verification</h2>
      <p>Your verification OTP is:</p>
      <h1>${otp}</h1>
      <p>This OTP will expire in 5 minutes.</p>
    `
  );


  const signedData = await generateToken({
    userId: user._id.toString(),
    name: user.name,
    email: user.email,
    isEmailVerified: user.isEmailVerified,
  });
  return {
    _id: user._id,
    name: user.name,
    email: user.email,
    isEmailVerified: user.isEmailVerified,
    signedData,

  };

};





export const verifyEmailOtp = async (req, res) => {
  const { email, otp } = req.body;

  const hashedOtp = crypto
    .createHash("sha256")
    .update(otp)
    .digest("hex");

  const user = await User.findOne({
    email,
    otp: hashedOtp,
    otpExpire: { $gt: new Date() }
  });

  if (!user) {
    return res.status(400).json({ message: "Invalid or expired OTP" });
  }

  user.isEmailVerified = true;
  user.otp = undefined;
  user.otpExpire = undefined;

  await user.save();

  res.json({ message: "Email verified successfully" });
};



async function Signin(userData) {
  try {
    const userExists = await User.findOne({
      email: userData.email,
    }).exec();

    if (!userExists) {
      return null;
    }

    if (!userExists.isEmailVerified) {
      throw new Error("EMAIL_NOT_VERIFIED");
    }


    const passwordCheck = bcrypt.compareSync(
      userData.password,
      userExists.password
    );

    if (!passwordCheck) {
      return null;
    }

    const signedData = await generateToken({
      userId: userExists._id.toString(),
      name: userExists.name,
      email: userExists.email,
    });

    return {
      userId: userExists._id.toString(),
      name: userExists.name,
      email: userExists.email,
      signedData,
    };

  } catch (error) {
    console.error("Signin ERROR: ", error);

    if (error.message === "EMAIL_NOT_VERIFIED") {
      throw error;
    }

    return null;
  }
}

export { Signup, Signin };


export const sendOtp = async (req, res) => {
  // ts@-ignore
  const { email } = req.body;

  const user = await User.findOne({ email });
  if (!user) {

    return res.status(404).json({ message: "User not found" });
  }

  const otp = Math.floor(100000 + Math.random() * 900000).toString();

  const hashedOtp = crypto
    .createHash("sha256")
    .update(otp)
    .digest("hex");

  user.otp = hashedOtp;
  user.otpExpire = new Date(Date.now() + 5 * 60 * 1000);

  await user.save();

  await sendEmail(
    user.email,
    "SyncCode Password Reset OTP",
    `
      <h2>Password Reset OTP</h2>
      <p>Your OTP is:</p>
      <h1>${otp}</h1>
      <p>This OTP will expire in 5 minutes.</p>
    `
  );

  res.json({ message: "OTP sent to email" });
};


export const verifyOtp = async (req, res) => {
  const { email, otp } = req.body;

  const hashedOtp = crypto
    .createHash("sha256")
    .update(otp)
    .digest("hex");

  const user = await User.findOne({
    email,
    otp: hashedOtp,
    otpExpire: { $gt: new Date() }
  });

  if (!user) {
    return res.status(400).json({ message: "Invalid or expired OTP" });
  }

  const resetToken = generateToken(
    { userId: user._id },
    "10m"
  );

  user.otp = undefined;
  user.otpExpire = undefined;
  await user.save();

  res.cookie("auth_jwt", resetToken, {
    httpOnly: true,
    secure: true,
    sameSite: "none",
    maxAge: 10 * 60 * 1000
  });

  res.json({ message: "OTP verified", resetToken });
};


export const resetPassword = async (req, res) => {
  const { newPassword } = req.body;

  const user = await User.findById(req.user.userId);
  if (!user) {
    return res.status(404).json({ message: "User not found" });
  }

  user.password = await bcrypt.hash(newPassword, 10);
  await user.save();

  res.clearCookie("auth_jwt");

  res.json({ message: "Password reset successful" });
};

export const logoutUser = (req, res) => {
  res.clearCookie("auth_jwt");
  res.json({ msg: "Logged out successfully" });
}


