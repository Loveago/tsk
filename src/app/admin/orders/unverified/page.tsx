import { redirect } from "next/navigation";

export default function AdminOrdersUnverifiedPage() {
  redirect("/admin/orders?view=unverified");
}
