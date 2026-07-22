import { redirect } from "next/navigation";

// 「イベント準備」と統合され「イベント準備・発行」になったため、旧URLをブックマークしている
// 場合に備えて /event の整理券発行モードへリダイレクトする(削除して404にはしない)。
export default function IssuePage() {
  redirect("/event?mode=issue");
}
