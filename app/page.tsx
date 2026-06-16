import { redirect } from "next/navigation";

export default function Home() {
  // If your login is in app/(auth)/login/page.tsx, redirect to /login
  redirect("/login");
}