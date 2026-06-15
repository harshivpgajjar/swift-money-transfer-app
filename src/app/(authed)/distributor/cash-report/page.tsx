import { redirect } from "next/navigation";

export default function CashReportRedirect() {
  redirect("/distributor/reports?tab=cash");
}
