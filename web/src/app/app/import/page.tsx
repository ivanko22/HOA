import { redirect } from "next/navigation";

/** Legacy path — financial CSV imports now live under /app/imports. */
export default function LegacyImportRedirect() {
  redirect("/app/imports");
}
