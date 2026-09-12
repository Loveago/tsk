import { redirect } from "next/navigation";

// The top-tab navigation starts at "Send Order" — the overview lives in My Order Reports.
export default function DashboardIndexPage() {
  redirect("/dashboard/send");
}
