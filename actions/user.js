"use server";

import { db } from "@/lib/prisma";
import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { generateAIInsights } from "./dashboard";

/**
 * Safely update user profile.
 * Returns an object { ok: boolean, data?, error? } instead of throwing raw errors.
 */
export async function updateUser(data) {
  try {
    // Clerk auth() is synchronous on the server
    const { userId } = auth();
    if (!userId) {
      console.error("updateUser: missing userId from auth()");
      return { ok: false, error: "UNAUTHORIZED" };
    }

    // Find local user record by clerkUserId
    const user = await db.user.findUnique({
      where: { clerkUserId: userId },
    });

    if (!user) {
      console.error("updateUser: user not found for clerkUserId:", userId);
      return { ok: false, error: "USER_NOT_FOUND" };
    }

    // Ensure industryInsight exists BEFORE the transaction.
    // generateAIInsights may call external APIs — do that outside tx to avoid long transactions.
    let industryInsight = await db.industryInsight.findUnique({
      where: { industry: data.industry },
    });

    if (!industryInsight) {
      try {
        const insights = await generateAIInsights(data.industry);
        industryInsight = await db.industryInsight.create({
          data: {
            industry: data.industry,
            ...insights,
            nextUpdate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          },
        });
      } catch (err) {
        // If AI generation fails, log and continue — we still allow profile update
        console.error("updateUser: generateAIInsights/create failed:", err);
      }
    }

    // Perform the user update inside a transaction (only user update here)
    const result = await db.$transaction(
      async (tx) => {
        const updatedUser = await tx.user.update({
          where: { id: user.id },
          data: {
            industry: data.industry,
            experience: data.experience,
            bio: data.bio,
            skills: data.skills,
          },
        });

        return { updatedUser };
      },
      { timeout: 10000 }
    );

    // Revalidate the home page cache
    try {
      revalidatePath("/");
    } catch (err) {
      // Non-fatal: log but don't fail the update
      console.warn("updateUser: revalidatePath error:", err);
    }

    // Return the updated user
    return { ok: true, data: result.updatedUser };
  } catch (error) {
    // Log full error to Vercel with context so you can inspect stack trace
    console.error("updateUser: FAILED", {
      message: error?.message,
      name: error?.name,
      code: error?.code,
      stack: error?.stack,
      inputKeys: Object.keys(data || {}),
    });
    // Return controlled error object
    return { ok: false, error: error?.message ?? "FAILED_TO_UPDATE_PROFILE" };
  }
}

export async function getUserOnboardingStatus() {
  try {
    const { userId } = auth();
    if (!userId) {
      console.error("getUserOnboardingStatus: missing userId");
      return { isOnboarded: false, ok: false, error: "UNAUTHORIZED" };
    }

    const user = await db.user.findUnique({
      where: { clerkUserId: userId },
      select: { industry: true },
    });

    if (!user) {
      // user not found — not onboarded
      return { isOnboarded: false, ok: false, error: "USER_NOT_FOUND" };
    }

    return { isOnboarded: !!user.industry, ok: true };
  } catch (error) {
    console.error("getUserOnboardingStatus: ERROR", {
      message: error?.message,
      stack: error?.stack,
    });
    return { isOnboarded: false, ok: false, error: "FAILED_TO_CHECK_ONBOARDING" };
  }
}
