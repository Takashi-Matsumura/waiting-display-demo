import { redirect } from "next/navigation";

// 「イベント準備」に統合されたため、旧URLをブックマークしている場合に備えて
// /setup へリダイレクトする(削除して404にはしない)。
export default function PreparePage() {
  redirect("/setup");
}
