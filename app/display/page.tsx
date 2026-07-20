import { redirect } from "next/navigation";

// 「受付/チェックイン」と統合されたため、旧URLをブックマークしている場合に備えて
// /checkin へリダイレクトする(削除して404にはしない)。
export default function DisplayPage() {
  redirect("/checkin");
}
