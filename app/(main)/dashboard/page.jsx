import { getIndustryInsights } from "@/actions/dashboard";
import DashboardView from "./_component/dashboard-view";
import { getUserOnboardingStatus } from "@/actions/user";
import { redirect } from "next/navigation";

export default async function DashboardPage() {
  // 1) Check onboarding status safely
  let isOnboarded = false;
  try {
    const status = await getUserOnboardingStatus();
    // Defensive: ensure shape exists
    isOnboarded = Boolean(status?.isOnboarded);
  } catch (err) {
    // Log full error to Vercel so you can inspect stack trace in logs
    console.error("DashboardPage: getUserOnboardingStatus error:", err);
    // If we can't verify onboarding, show an error UI instead of throwing
    return (
      <div className="container mx-auto p-6">
        <h2 className="text-xl font-semibold mb-2">Unable to verify account</h2>
        <p className="mb-4">
          We couldn't verify your account status right now. Please try again in a few moments.
        </p>
      </div>
    );
  }

  // 2) If not onboarded, redirect to onboarding page
  if (!isOnboarded) {
    redirect("/onboarding");
  }

  // 3) Fetch insights safely
  let insights = [];
  let insightsFetchError = false;
  try {
    const result = await getIndustryInsights();
    insights = result ?? [];
  } catch (err) {
    insightsFetchError = true;
    // Log full error + any useful context
    console.error("DashboardPage: getIndustryInsights error:", err);
    // keep going: render the dashboard with an empty list and an error flag
  }

  return (
    <div className="container mx-auto">
      {/* DashboardView should accept `fetchError` and show a message if true */}
      <DashboardView insights={insights} fetchError={insightsFetchError} />
    </div>
  );
}
