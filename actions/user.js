"use server";

import { db } from "@/lib/prisma";
import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { generateAIInsights } from "./dashboard";

export async function updateUser(data) {
  // DEBUG LOG — this will tell us the real problem in Vercel logs
  try {
    const debugAuth = auth();
    console.log("DEBUG AUTH RESULT:", debugAuth);
  } catch (e) {
    console.error("DEBUG AUTH THREW:", e);
  }

  try {
    const { userId } = auth(); // Clerk auth() is NOT async
    if (!userId) {
      console.error("updateUser: Missing userId");
      return { ok: false, error: "UNAUTHORIZED" };
    }

    // Find user by clerkUserId
    const user = await db.user.findUnique({
      where: { clerkUserId: userId },
    });

    if (!user) {
      console.error("updateUser: User not found for clerkUserId:", userId);
      return { ok: false, error: "USER_NOT_FOUND" };
    }

    // Ensure industry insight exists BEFORE transaction
    let insight = await db.industryInsight.findUnique({
      where: { industry: data.industry },
    });

    if (!insight) {
      try {
        const ai = await generateAIInsights(data.industry);
        insight = await db.industryInsight.create({
          data: {
            industry: data.industry,
            ...ai,
            nextUpdate: new Date(Date.now() + 7 * 24 * 3600 * 1000),
          },
        });
      } catch (err) {
        console.error("generateAIInsights failed:", err);
      }
    }

    // Only update user inside tx
    const result = await db.$transaction(async (tx) => {
      const updatedUser = await tx.user.update({
        where: { id: user.id },
        data: {
          industry: data.industry,
          experience: data.experience,
          bio: data.bio,
          skills: data.skills,
        },
      });

      return updatedUser; // <-- IMPORTANT FIX
    });

    revalidatePath("/");
    return { ok: true, data: result };
  } catch (error) {
    console.error("updateUser FAILED:", {
      message: error?.message,
      code: error?.code,
      stack: error?.stack,
      dataKeys: Object.keys(data || {}),
    });
    return { ok: false, error: "UPDATE_FAILED" };
  }
}
