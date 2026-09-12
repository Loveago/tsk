import { redirect } from "next/navigation";

export default function ApiDocsRedirect() {
  redirect("/dashboard/api?tab=docs");
}
