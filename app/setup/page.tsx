import { redirect } from "next/navigation";

// 「整理券 発行」と統合され「イベント準備・発行」になったため、旧URLをブックマークしている
// 場合に備えて /event へリダイレクトする(削除して404にはしない)。
export default function SetupPage() {
  redirect("/event");
}
