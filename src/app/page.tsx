import type { Metadata } from "next";
import { ArrowRight, Boxes, CalendarClock, ChartNoAxesCombined, CheckCircle2, MapPin, PackageCheck, Recycle, Sparkles, Truck } from "lucide-react";
import Link from "next/link";

import { getContactUrl } from "@/lib/app-mode";

export const metadata: Metadata = {
  title: "食品在庫・発注業務を、もっとシンプルに。",
  description: "在庫・賞味期限・廃棄・発注を一元管理し、AI発注提案で日々の判断を支援する食品事業者向け業務システム。",
};

const FEATURES = [
  { icon: Boxes, title: "在庫管理", text: "店舗・倉庫ごとの在庫数量と金額を一元管理" },
  { icon: CalendarClock, title: "賞味期限・ロット", text: "期限間近と期限切れを把握し、FEFOで先入れ出庫" },
  { icon: PackageCheck, title: "入出庫・棚卸", text: "入庫、出庫、移動、棚卸の履歴をまとめて確認" },
  { icon: Recycle, title: "廃棄管理", text: "廃棄理由と金額を可視化し、ロスの確認を支援" },
  { icon: Truck, title: "発注管理", text: "仕入先別の発注書と入荷状況を管理" },
  { icon: Sparkles, title: "AI発注提案", text: "欠品・過剰在庫・廃棄リスクから発注判断を支援" },
  { icon: MapPin, title: "複数拠点", text: "全国の複数店舗・物流拠点を横断して把握" },
  { icon: ChartNoAxesCombined, title: "ダッシュボード", text: "重要な状況と次に確認すべき業務をひと目で把握" },
];

const BENEFITS = [
  { title: "欠品リスクの早期把握", text: "在庫日数と入荷予定から、欠品しそうな商品を優先度順に確認できます。" },
  { title: "過剰在庫の削減を支援", text: "消化に日数がかかる在庫を可視化し、発注量の見直しにつなげます。" },
  { title: "賞味期限の管理", text: "ロット単位で期限間近・期限切れを把握し、先に出すべき在庫が分かります。" },
  { title: "廃棄ロスの可視化", text: "廃棄の数量・金額・理由を記録し、月ごとの推移を振り返れます。" },
  { title: "発注判断の効率化", text: "推奨数量と根拠を一覧で確認し、候補を選んで発注書を作成できます。" },
  { title: "複数拠点の一元管理", text: "店舗と物流拠点の在庫を同じ画面で切り替えて確認できます。" },
];

export default function HomePage() {
  const contactUrl = getContactUrl();
  return (
    <main className="min-h-screen bg-white text-slate-900">
      <header className="border-b border-slate-200">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2 font-semibold">
            <span className="flex size-9 items-center justify-center rounded-lg bg-emerald-700 text-white"><Boxes className="size-5" aria-hidden="true" /></span>
            <span>AI食品在庫・発注管理</span>
          </Link>
          <Link href="/dashboard" className="rounded-md px-3 py-2 text-sm font-semibold text-emerald-800 hover:bg-emerald-50">販売デモを見る</Link>
        </div>
      </header>

      <section className="border-b border-slate-200 bg-gradient-to-b from-emerald-50/80 to-white">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-20 sm:px-6 lg:grid-cols-[1.15fr_0.85fr] lg:items-center lg:py-28">
          <div>
            <p className="mb-4 inline-flex rounded-full border border-emerald-200 bg-white px-3 py-1 text-xs font-semibold text-emerald-800">食品事業者向け 在庫・発注業務システム</p>
            <h1 className="max-w-3xl text-4xl leading-tight font-bold tracking-tight sm:text-5xl">食品在庫・発注業務を、<span className="text-emerald-700">もっとシンプルに。</span></h1>
            <p className="mt-6 max-w-2xl text-base leading-8 text-slate-600 sm:text-lg">在庫、賞味期限、廃棄、発注をひとつの画面で一元管理。AI発注提案が、欠品の見逃しや過剰発注を抑える日々の判断を支援します。</p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link href="/dashboard" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-emerald-700 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-800">無料デモを見る<ArrowRight className="size-4" aria-hidden="true" /></Link>
              {contactUrl ? <a href={contactUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center justify-center rounded-md border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50">導入について相談する</a> : null}
            </div>
            <p className="mt-3 text-xs text-slate-500">ログイン不要。固定サンプルデータで実際の業務画面を操作できます。</p>
          </div>
          <div className="rounded-2xl border border-emerald-100 bg-white p-5 shadow-xl shadow-emerald-950/5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4"><div><p className="text-sm font-semibold">フレッシュマート ONE</p><p className="text-xs text-slate-500">全国4拠点の販売デモ</p></div><span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-800">DEMO</span></div>
            <dl className="mt-5 grid grid-cols-2 gap-3">{[["商品", "1,000 SKU"], ["拠点", "4 拠点"], ["仕入先", "40 社"], ["管理対象", "ロット・期限"]].map(([label, value]) => <div key={label} className="rounded-lg bg-slate-50 p-4"><dt className="text-xs text-slate-500">{label}</dt><dd className="mt-1 text-lg font-bold text-slate-900">{value}</dd></div>)}</dl>
            <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4"><p className="text-xs font-semibold text-amber-900">発注判断を支援</p><p className="mt-1 text-sm text-amber-900">在庫・需要・入荷予定・賞味期限から、推奨数量と理由を確認できます。</p></div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20" aria-labelledby="features-title">
        <div className="max-w-2xl"><p className="text-sm font-semibold text-emerald-700">主要機能</p><h2 id="features-title" className="mt-2 text-3xl font-bold tracking-tight">食品在庫の業務をひとつにつなぐ</h2><p className="mt-3 leading-7 text-slate-600">スーパー、飲食店、食品小売、卸、惣菜店、カフェ、ベーカリーなど、小〜中規模事業者の運用を想定しています。</p></div>
        <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{FEATURES.map(({ icon: Icon, title, text }) => <li key={title} className="rounded-xl border border-slate-200 p-5"><Icon className="size-5 text-emerald-700" aria-hidden="true" /><h3 className="mt-4 font-semibold">{title}</h3><p className="mt-2 text-sm leading-6 text-slate-600">{text}</p></li>)}</ul>
      </section>

      <section className="border-t border-slate-200 bg-emerald-950 text-white" aria-labelledby="benefits-title">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
          <div className="max-w-2xl"><p className="text-sm font-semibold text-emerald-300">導入で目指せること</p><h2 id="benefits-title" className="mt-2 text-3xl font-bold tracking-tight">日々の確認と判断にかかる手間を減らす</h2><p className="mt-3 leading-7 text-emerald-100/80">効果は運用状況によって異なります。判断材料をそろえ、確認漏れを防ぐ仕組みづくりを支援します。</p></div>
          <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{BENEFITS.map(({ title, text }) => <li key={title} className="flex gap-3 rounded-xl border border-white/10 bg-white/5 p-5"><CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-300" aria-hidden="true" /><div><h3 className="font-semibold">{title}</h3><p className="mt-1.5 text-sm leading-6 text-emerald-100/80">{text}</p></div></li>)}</ul>
        </div>
      </section>

      <section className="border-t border-slate-200 bg-slate-50"><div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-6 px-4 py-12 sm:px-6 lg:flex-row lg:items-center"><div><h2 className="text-2xl font-bold">実際の業務画面をお試しください</h2><p className="mt-2 text-sm text-slate-600">検索・絞り込み・拠点切替・発注候補選択・主要業務の疑似操作を確認できます。</p></div><div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row"><Link href="/dashboard" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-emerald-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-800">無料デモを見る<ArrowRight className="size-4" aria-hidden="true" /></Link>{contactUrl ? <a href={contactUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center justify-center rounded-md border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-100">導入について相談する</a> : null}</div></div></section>

      <footer className="border-t border-slate-200">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-6 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p>© AI食品在庫・発注管理</p>
          <p>デモの商品・仕入先・拠点はすべて架空のサンプルデータです。操作内容は共有データに保存されません。</p>
        </div>
      </footer>
    </main>
  );
}
