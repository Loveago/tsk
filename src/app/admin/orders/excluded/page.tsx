import { redirect } from "next/navigation";

export default function AdminOrdersExcludedPage() {
  redirect("/admin/orders?view=excluded");
}
