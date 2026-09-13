import { calculateJanCheckDigit } from "../../src/lib/validation/common";
import type { Rng } from "./random";

/**
 * デモ用の商品カタログ生成。
 * メーカー・ブランド・仕入先・JAN はすべて架空（JAN はインストアコード帯 "2" 始まり）。
 */

export type StorageType = "room_temperature" | "refrigerated" | "frozen";

type Item = {
  name: string;
  kana: string;
  storage?: StorageType;
  shelf?: [number, number];
  unit?: string;
  price?: [number, number];
  demand?: [number, number];
};

type Size = { label: string; amount: number; unit: string; factor: number; spec: string };

type SubSpec = {
  top: string;
  index: number;
  name: string;
  weight: number;
  storage: StorageType;
  shelf: [number, number];
  unit: string;
  price: [number, number];
  costRatio: [number, number];
  casePacks: number[];
  demand: [number, number];
  makers: string[];
  items: Item[];
  sizes: Size[];
};

export const CATEGORY_TREE: { code: string; name: string; subs: string[] }[] = [
  { code: "DRINK", name: "飲料", subs: ["水", "お茶", "コーヒー", "炭酸飲料", "ジュース", "エナジードリンク"] },
  { code: "DAIRY", name: "乳製品", subs: ["牛乳", "乳飲料", "ヨーグルト", "チーズ", "バター"] },
  { code: "FROZEN", name: "冷凍食品", subs: ["冷凍惣菜", "冷凍麺", "冷凍デザート"] },
  { code: "MEAT", name: "精肉", subs: ["精肉加工品"] },
  { code: "FISH", name: "鮮魚", subs: ["水産加工品"] },
  { code: "VEG", name: "野菜", subs: ["野菜加工品"] },
  { code: "FRUIT", name: "果物", subs: ["果物加工品"] },
  { code: "PROCESSED", name: "加工食品", subs: ["レトルト", "缶詰", "惣菜"] },
  { code: "SEASONING", name: "調味料", subs: ["基礎調味料", "たれ・ソース"] },
  { code: "SNACK", name: "菓子", subs: ["スナック", "チョコレート", "デザート"] },
  { code: "BREAD", name: "パン", subs: ["食パン", "菓子パン"] },
  { code: "RICE", name: "米・麺", subs: ["米", "麺"] },
  { code: "GENERAL", name: "一般食品", subs: ["乾物", "シリアル"] },
  { code: "OTHER", name: "その他", subs: ["その他"] },
];

export const MAKERS: Record<string, { name: string; brands: [string, string][] }> = {
  yamanami: { name: "やまなみ飲料", brands: [["やまなみ", "ヤマナミ"], ["清流の雫", "セイリュウノシズク"]] },
  hoshizora: { name: "ほしぞらドリンク", brands: [["ほしぞら", "ホシゾラ"], ["スパークル星", "スパークルボシ"]] },
  tsubasa: { name: "つばさ珈琲", brands: [["つばさ珈琲", "ツバサコーヒー"], ["朝焼けブレンド", "アサヤケブレンド"]] },
  midori: { name: "みどり茶園", brands: [["みどり茶園", "ミドリチャエン"], ["茶摘み日和", "チャツミビヨリ"]] },
  himawari: { name: "ひまわり乳業", brands: [["ひまわり", "ヒマワリ"], ["まきば便り", "マキバダヨリ"]] },
  kogen: { name: "高原ミルク工房", brands: [["高原ミルク", "コウゲンミルク"], ["しろやぎ", "シロヤギ"]] },
  shirokuma: { name: "しろくま冷凍食品", brands: [["しろくまキッチン", "シロクマキッチン"], ["こおりの国", "コオリノクニ"]] },
  satsunan: { name: "あさひミートフーズ", brands: [["あさひハム", "アサヒハム"], ["いぶし屋", "イブシヤ"]] },
  kuroshio: { name: "黒潮水産加工", brands: [["黒潮の幸", "クロシオノサチ"], ["浜の匠", "ハマノタクミ"]] },
  hinata: { name: "ひなた農産加工", brands: [["ひなた畑", "ヒナタバタケ"], ["旬彩", "シュンサイ"]] },
  minatomachi: { name: "港町缶詰", brands: [["港町キッチン", "ミナトマチキッチン"], ["うみかぜ", "ウミカゼ"]] },
  sakura: { name: "さくらデリカ", brands: [["さくらデリ", "サクラデリ"], ["おふくろ膳", "オフクロゼン"]] },
  kinwan: { name: "水鏡醸造", brands: [["水鏡", "ミズカガミ"], ["蔵の雫", "クラノシズク"]] },
  kazami: { name: "風見ソース", brands: [["風見", "カザミ"], ["炭火だれ本舗", "スミビダレホンポ"]] },
  hinataya: { name: "ひなたや製菓", brands: [["ひなたや", "ヒナタヤ"], ["ぽりっと", "ポリット"]] },
  luna: { name: "ルナ製菓", brands: [["ルナショコラ", "ルナショコラ"], ["カカオの丘", "カカオノオカ"]] },
  komugi: { name: "こむぎ日和ベーカリー", brands: [["こむぎ日和", "コムギビヨリ"], ["ふんわり堂", "フンワリドウ"]] },
  aoba: { name: "あおば製麺", brands: [["あおば", "アオバ"], ["手打ち庵", "テウチアン"]] },
  minaminoho: { name: "稔りの穂米穀", brands: [["稔りの穂", "ミノリノホ"], ["つやひかり", "ツヤヒカリ"]] },
  kotohogi: { name: "ことほぎ食品", brands: [["ことほぎ", "コトホギ"], ["朝の実り", "アサノミノリ"]] },
  mamekichi: { name: "まめ吉食品", brands: [["まめ吉", "マメキチ"], ["白雪とうふ", "シラユキトウフ"]] },
  soyokaze: { name: "そよかぜデザート", brands: [["そよかぜ", "ソヨカゼ"], ["ぷるるん", "プルルン"]] },
};

const s = (label: string, amount: number, unit: string, factor: number, spec: string): Size => ({ label, amount, unit, factor, spec });
const i = (name: string, kana: string, extra: Omit<Item, "name" | "kana"> = {}): Item => ({ name, kana, ...extra });

const SUBS: SubSpec[] = [
  // ---- 飲料 ----
  {
    top: "DRINK", index: 1, name: "水", weight: 30, storage: "room_temperature", shelf: [365, 730], unit: "本",
    price: [88, 118], costRatio: [0.55, 0.68], casePacks: [24, 6], demand: [4, 14], makers: ["yamanami", "hoshizora"],
    items: [i("天然水", "テンネンスイ"), i("軟水ミネラルウォーター", "ナンスイミネラルウォーター"), i("アルカリイオン水", "アルカリイオンスイ"), i("強炭酸水", "キョウタンサンスイ"), i("炭酸水 レモン", "タンサンスイレモン"), i("深層水", "シンソウスイ")],
    sizes: [s("500ml", 500, "ml", 1, "ペットボトル"), s("2L", 2, "L", 1.9, "ペットボトル"), s("1L", 1, "L", 1.4, "ペットボトル")],
  },
  {
    top: "DRINK", index: 2, name: "お茶", weight: 45, storage: "room_temperature", shelf: [270, 365], unit: "本",
    price: [118, 158], costRatio: [0.55, 0.68], casePacks: [24], demand: [3, 12], makers: ["midori", "yamanami"],
    items: [i("緑茶", "リョクチャ"), i("濃いめ緑茶", "コイメリョクチャ"), i("ほうじ茶", "ホウジチャ"), i("麦茶", "ムギチャ"), i("玄米茶", "ゲンマイチャ"), i("ジャスミン茶", "ジャスミンチャ"), i("烏龍茶", "ウーロンチャ"), i("ルイボスティー", "ルイボスティー"), i("紅茶 無糖", "コウチャムトウ"), i("ミルクティー", "ミルクティー")],
    sizes: [s("500ml", 500, "ml", 1, "ペットボトル"), s("600ml", 600, "ml", 1.1, "ペットボトル"), s("2L", 2, "L", 2.1, "ペットボトル")],
  },
  {
    top: "DRINK", index: 3, name: "コーヒー", weight: 45, storage: "room_temperature", shelf: [180, 365], unit: "本",
    price: [108, 168], costRatio: [0.52, 0.66], casePacks: [24, 30], demand: [2, 9], makers: ["tsubasa"],
    items: [i("ブラック無糖", "ブラックムトウ"), i("微糖", "ビトウ"), i("カフェオレ", "カフェオレ"), i("深煎りブラック", "フカイリブラック"), i("エスプレッソラテ", "エスプレッソラテ"), i("キャラメルラテ", "キャラメルラテ"), i("ドリップバッグ ブレンド", "ドリップバッグブレンド", { unit: "箱", price: [398, 598], demand: [0.5, 2] }), i("レギュラーコーヒー 粉", "レギュラーコーヒーコナ", { unit: "袋", price: [598, 998], demand: [0.3, 1.5] })],
    sizes: [s("185g缶", 185, "g", 1, "缶"), s("280ml", 280, "ml", 1.2, "ボトル缶"), s("500ml", 500, "ml", 1.3, "ペットボトル")],
  },
  {
    top: "DRINK", index: 4, name: "炭酸飲料", weight: 35, storage: "room_temperature", shelf: [150, 270], unit: "本",
    price: [128, 178], costRatio: [0.55, 0.68], casePacks: [24], demand: [2, 10], makers: ["hoshizora"],
    items: [i("サイダー", "サイダー"), i("ジンジャーエール", "ジンジャーエール"), i("コーラ", "コーラ"), i("グレープソーダ", "グレープソーダ"), i("メロンソーダ", "メロンソーダ"), i("レモンスカッシュ", "レモンスカッシュ"), i("ゼロカロリーサイダー", "ゼロカロリーサイダー")],
    sizes: [s("350ml缶", 350, "ml", 0.8, "缶"), s("500ml", 500, "ml", 1, "ペットボトル"), s("1.5L", 1.5, "L", 1.8, "ペットボトル")],
  },
  {
    top: "DRINK", index: 5, name: "ジュース", weight: 40, storage: "room_temperature", shelf: [120, 270], unit: "本",
    price: [128, 238], costRatio: [0.55, 0.7], casePacks: [24, 12, 6], demand: [1.5, 7], makers: ["yamanami", "hinata"],
    items: [i("オレンジ100%", "オレンジヒャクパーセント"), i("りんご100%", "リンゴヒャクパーセント"), i("ぶどう100%", "ブドウヒャクパーセント"), i("野菜ジュース", "ヤサイジュース"), i("トマトジュース 食塩無添加", "トマトジュースショクエンムテンカ"), i("グレープフルーツ", "グレープフルーツ"), i("ピーチネクター", "ピーチネクター"), i("スムージー ミックスベリー", "スムージーミックスベリー", { storage: "refrigerated", shelf: [14, 21], demand: [1, 4] }), i("しぼりたてオレンジ チルド", "シボリタテオレンジチルド", { storage: "refrigerated", shelf: [10, 16], demand: [1, 4] })],
    sizes: [s("200ml", 200, "ml", 0.6, "紙パック"), s("500ml", 500, "ml", 1, "ペットボトル"), s("1L", 1, "L", 1.6, "紙パック")],
  },
  {
    top: "DRINK", index: 6, name: "エナジードリンク", weight: 15, storage: "room_temperature", shelf: [270, 365], unit: "本",
    price: [168, 238], costRatio: [0.58, 0.7], casePacks: [24], demand: [1, 6], makers: ["hoshizora"],
    items: [i("エナジーチャージ", "エナジーチャージ"), i("エナジーチャージ ゼロ", "エナジーチャージゼロ"), i("ビタミンショット", "ビタミンショット"), i("スポーツドリンク", "スポーツドリンク"), i("経口補水飲料", "ケイコウホスイインリョウ")],
    sizes: [s("250ml缶", 250, "ml", 1, "缶"), s("355ml缶", 355, "ml", 1.2, "缶"), s("500ml", 500, "ml", 0.9, "ペットボトル")],
  },
  // ---- 乳製品 ----
  {
    top: "DAIRY", index: 1, name: "牛乳", weight: 20, storage: "refrigerated", shelf: [7, 12], unit: "本",
    price: [178, 288], costRatio: [0.68, 0.78], casePacks: [12, 6], demand: [5, 18], makers: ["himawari", "kogen"],
    items: [i("成分無調整牛乳", "セイブンムチョウセイギュウニュウ"), i("低脂肪牛乳", "テイシボウギュウニュウ"), i("特濃牛乳", "トクノウギュウニュウ"), i("ジャージー牛乳", "ジャージーギュウニュウ"), i("おいしい低温殺菌牛乳", "オイシイテイオンサッキンギュウニュウ")],
    sizes: [s("1000ml", 1000, "ml", 1, "紙パック"), s("500ml", 500, "ml", 0.6, "紙パック"), s("200ml", 200, "ml", 0.35, "紙パック")],
  },
  {
    top: "DAIRY", index: 2, name: "乳飲料", weight: 30, storage: "refrigerated", shelf: [10, 20], unit: "本",
    price: [98, 198], costRatio: [0.6, 0.72], casePacks: [12, 6], demand: [2, 9], makers: ["himawari", "kogen"],
    items: [i("コーヒー牛乳", "コーヒーギュウニュウ"), i("いちごミルク", "イチゴミルク"), i("のむヨーグルト プレーン", "ノムヨーグルトプレーン"), i("のむヨーグルト ブルーベリー", "ノムヨーグルトブルーベリー"), i("乳酸菌飲料", "ニュウサンキンインリョウ"), i("バナナオレ", "バナナオレ"), i("抹茶ラテ", "マッチャラテ")],
    sizes: [s("200ml", 200, "ml", 0.8, "紙パック"), s("500ml", 500, "ml", 1.2, "紙パック"), s("1000ml", 1000, "ml", 1.9, "紙パック")],
  },
  {
    top: "DAIRY", index: 3, name: "ヨーグルト", weight: 40, storage: "refrigerated", shelf: [14, 21], unit: "個",
    price: [98, 238], costRatio: [0.6, 0.72], casePacks: [12, 8, 6], demand: [2, 10], makers: ["himawari", "kogen", "soyokaze"],
    items: [i("プレーンヨーグルト", "プレーンヨーグルト"), i("加糖ヨーグルト", "カトウヨーグルト"), i("ギリシャ風ヨーグルト", "ギリシャフウヨーグルト"), i("アロエヨーグルト", "アロエヨーグルト"), i("ブルーベリーヨーグルト", "ブルーベリーヨーグルト"), i("低脂肪ヨーグルト", "テイシボウヨーグルト"), i("フルーツミックスヨーグルト", "フルーツミックスヨーグルト")],
    sizes: [s("400g", 400, "g", 1, "カップ"), s("75g×4", 300, "g", 0.9, "4連カップ"), s("110g", 110, "g", 0.55, "カップ")],
  },
  {
    top: "DAIRY", index: 4, name: "チーズ", weight: 30, storage: "refrigerated", shelf: [60, 180], unit: "個",
    price: [248, 498], costRatio: [0.6, 0.72], casePacks: [12, 6], demand: [0.8, 4], makers: ["kogen", "himawari"],
    items: [i("スライスチーズ", "スライスチーズ"), i("とろけるスライスチーズ", "トロケルスライスチーズ"), i("ピザ用シュレッドチーズ", "ピザヨウシュレッドチーズ"), i("カマンベールチーズ", "カマンベールチーズ"), i("クリームチーズ", "クリームチーズ"), i("粉チーズ", "コナチーズ", { storage: "room_temperature", shelf: [180, 365] }), i("ベビーチーズ", "ベビーチーズ"), i("モッツァレラ", "モッツァレラ", { shelf: [20, 30] })],
    sizes: [s("7枚入", 126, "g", 1, "袋"), s("200g", 200, "g", 1.3, "袋"), s("100g", 100, "g", 0.8, "箱")],
  },
  {
    top: "DAIRY", index: 5, name: "バター", weight: 12, storage: "refrigerated", shelf: [120, 180], unit: "個",
    price: [298, 598], costRatio: [0.68, 0.78], casePacks: [12], demand: [0.5, 3], makers: ["kogen", "himawari"],
    items: [i("有塩バター", "ユウエンバター"), i("食塩不使用バター", "ショクエンフシヨウバター"), i("発酵バター", "ハッコウバター"), i("ソフトタイプマーガリン", "ソフトタイプマーガリン")],
    sizes: [s("200g", 200, "g", 1, "箱"), s("100g", 100, "g", 0.6, "箱"), s("450g", 450, "g", 1.8, "カップ")],
  },
  // ---- 冷凍食品 ----
  {
    top: "FROZEN", index: 1, name: "冷凍惣菜", weight: 45, storage: "frozen", shelf: [240, 365], unit: "袋",
    price: [258, 498], costRatio: [0.58, 0.7], casePacks: [12, 10], demand: [1, 6], makers: ["shirokuma"],
    items: [i("から揚げ", "カラアゲ"), i("ぎょうざ", "ギョウザ"), i("えびシューマイ", "エビシューマイ"), i("ハンバーグ", "ハンバーグ"), i("コロッケ", "コロッケ"), i("チャーハン", "チャーハン"), i("ミックスベジタブル", "ミックスベジタブル"), i("ブロッコリー", "ブロッコリー"), i("枝豆", "エダマメ"), i("お弁当用ひとくちグラタン", "オベントウヨウヒトクチグラタン")],
    sizes: [s("300g", 300, "g", 1, "袋"), s("500g", 500, "g", 1.5, "袋"), s("6個入", 6, "個", 0.8, "トレー")],
  },
  {
    top: "FROZEN", index: 2, name: "冷凍麺", weight: 20, storage: "frozen", shelf: [270, 365], unit: "袋",
    price: [198, 398], costRatio: [0.58, 0.7], casePacks: [12], demand: [1, 5], makers: ["shirokuma", "aoba"],
    items: [i("讃岐風うどん", "サヌキフウウドン"), i("鍋焼きうどん", "ナベヤキウドン"), i("醤油ラーメン", "ショウユラーメン"), i("焼きそば", "ヤキソバ"), i("ナポリタン", "ナポリタン"), i("ちゃんぽん", "チャンポン")],
    sizes: [s("5食入", 5, "食", 1, "袋"), s("1食", 1, "食", 0.6, "トレー"), s("3食入", 3, "食", 0.8, "袋")],
  },
  {
    top: "FROZEN", index: 3, name: "冷凍デザート", weight: 20, storage: "frozen", shelf: [365, 730], unit: "個",
    price: [128, 498], costRatio: [0.55, 0.68], casePacks: [24, 8], demand: [1, 6], makers: ["shirokuma", "soyokaze"],
    items: [i("バニラアイス", "バニラアイス"), i("抹茶アイス", "マッチャアイス"), i("チョコモナカ", "チョコモナカ"), i("かき氷 いちご", "カキゴオリイチゴ"), i("フルーツシャーベット", "フルーツシャーベット"), i("白くま風練乳アイス", "シロクマフウレンニュウアイス")],
    sizes: [s("120ml", 120, "ml", 1, "カップ"), s("6本入", 6, "本", 2.5, "箱"), s("2L", 2, "L", 3.2, "カップ")],
  },
  // ---- 精肉・鮮魚・野菜・果物 ----
  {
    top: "MEAT", index: 1, name: "精肉加工品", weight: 40, storage: "refrigerated", shelf: [20, 45], unit: "パック",
    price: [198, 498], costRatio: [0.6, 0.72], casePacks: [10, 6], demand: [1.5, 7], makers: ["satsunan"],
    items: [i("ロースハム", "ロースハム"), i("あらびきウインナー", "アラビキウインナー"), i("ハーフベーコン", "ハーフベーコン"), i("焼豚", "ヤキブタ"), i("サラダチキン プレーン", "サラダチキンプレーン", { shelf: [14, 25] }), i("国産豚ソーセージ", "コクサンブタソーセージ"), i("ローストビーフ", "ローストビーフ", { shelf: [10, 15] }), i("肉みそ", "ニクミソ")],
    sizes: [s("4枚入", 4, "枚", 1, "パック"), s("120g", 120, "g", 1, "パック"), s("2袋入", 2, "袋", 1.6, "パック")],
  },
  {
    top: "FISH", index: 1, name: "水産加工品", weight: 35, storage: "refrigerated", shelf: [7, 20], unit: "パック",
    price: [148, 498], costRatio: [0.6, 0.72], casePacks: [10, 6], demand: [1, 6], makers: ["kuroshio"],
    items: [i("さつま揚げ", "サツマアゲ"), i("焼ちくわ", "ヤキチクワ"), i("紅白かまぼこ", "コウハクカマボコ"), i("ちりめんじゃこ", "チリメンジャコ"), i("塩さば切身", "シオサバキリミ", { shelf: [4, 6] }), i("甘塩さけ切身", "アマシオサケキリミ", { shelf: [4, 6] }), i("明太子", "メンタイコ", { shelf: [10, 15] }), i("かつお角煮", "カツオカクニ", { storage: "room_temperature", shelf: [90, 180] })],
    sizes: [s("5枚入", 5, "枚", 1, "パック"), s("80g", 80, "g", 0.8, "パック"), s("2切入", 2, "切", 1.3, "パック")],
  },
  {
    top: "VEG", index: 1, name: "野菜加工品", weight: 30, storage: "refrigerated", shelf: [3, 5], unit: "袋",
    price: [98, 298], costRatio: [0.58, 0.7], casePacks: [10, 6], demand: [2, 9], makers: ["hinata"],
    items: [i("千切りキャベツ", "センギリキャベツ"), i("カットサラダ ミックス", "カットサラダミックス"), i("カット野菜 炒め用", "カットヤサイイタメヨウ"), i("もやし", "モヤシ", { shelf: [2, 3], price: [38, 48], demand: [5, 15] }), i("たくあん", "タクアン", { shelf: [30, 60] }), i("白菜キムチ", "ハクサイキムチ", { shelf: [20, 30] }), i("きゅうり浅漬け", "キュウリアサヅケ", { shelf: [7, 10] }), i("蒸し大豆", "ムシダイズ", { storage: "room_temperature", shelf: [120, 180] })],
    sizes: [s("150g", 150, "g", 1, "袋"), s("250g", 250, "g", 1.4, "袋"), s("300g", 300, "g", 1.6, "パック")],
  },
  {
    top: "FRUIT", index: 1, name: "果物加工品", weight: 20, storage: "refrigerated", shelf: [3, 5], unit: "パック",
    price: [198, 498], costRatio: [0.58, 0.7], casePacks: [8, 6], demand: [1, 5], makers: ["hinata"],
    items: [i("カットフルーツ ミックス", "カットフルーツミックス"), i("カットメロン", "カットメロン"), i("カットパイン", "カットパイン"), i("いちごジャム", "イチゴジャム", { storage: "room_temperature", shelf: [270, 365] }), i("マーマレード", "マーマレード", { storage: "room_temperature", shelf: [270, 365] }), i("冷凍ブルーベリー", "レイトウブルーベリー", { storage: "frozen", shelf: [365, 540] })],
    sizes: [s("200g", 200, "g", 1, "カップ"), s("350g", 350, "g", 1.5, "パック"), s("150g", 150, "g", 0.8, "カップ")],
  },
  // ---- 加工食品 ----
  {
    top: "PROCESSED", index: 1, name: "レトルト", weight: 45, storage: "room_temperature", shelf: [365, 730], unit: "個",
    price: [148, 398], costRatio: [0.58, 0.7], casePacks: [30, 10], demand: [1, 5], makers: ["kotohogi", "sakura"],
    items: [i("ビーフカレー 中辛", "ビーフカレーチュウカラ"), i("ビーフカレー 甘口", "ビーフカレーアマクチ"), i("キーマカレー", "キーマカレー"), i("親子丼の素", "オヤコドンノモト"), i("中華丼の素", "チュウカドンノモト"), i("ミートソース", "ミートソース"), i("おかゆ 白がゆ", "オカユシロガユ"), i("パックごはん", "パックゴハン", { price: [128, 198], demand: [3, 10] }), i("クリームシチュー", "クリームシチュー")],
    sizes: [s("1人前", 1, "食", 1, "パウチ"), s("3食パック", 3, "食", 2.5, "箱"), s("2人前", 2, "食", 1.7, "パウチ")],
  },
  {
    top: "PROCESSED", index: 2, name: "缶詰", weight: 40, storage: "room_temperature", shelf: [730, 1095], unit: "缶",
    price: [98, 398], costRatio: [0.58, 0.7], casePacks: [24, 48], demand: [0.8, 4], makers: ["minatomachi"],
    items: [i("ツナ油漬け", "ツナアブラヅケ"), i("ツナ水煮", "ツナミズニ"), i("さば水煮", "サバミズニ"), i("さば味噌煮", "サバミソニ"), i("いわし蒲焼", "イワシカバヤキ"), i("焼き鳥 たれ", "ヤキトリタレ"), i("コーン ホール", "コーンホール"), i("みかん缶", "ミカンカン"), i("白桃缶", "ハクトウカン"), i("トマト缶 カット", "トマトカンカット")],
    sizes: [s("70g×3", 210, "g", 1.6, "3缶パック"), s("190g", 190, "g", 1, "缶"), s("400g", 400, "g", 1.3, "缶")],
  },
  {
    top: "PROCESSED", index: 3, name: "惣菜", weight: 30, storage: "refrigerated", shelf: [2, 4], unit: "パック",
    price: [198, 498], costRatio: [0.5, 0.62], casePacks: [1], demand: [2, 8], makers: ["sakura"],
    items: [i("ポテトサラダ", "ポテトサラダ"), i("ひじき煮", "ヒジキニ"), i("きんぴらごぼう", "キンピラゴボウ"), i("筑前煮", "チクゼンニ"), i("だし巻き玉子", "ダシマキタマゴ"), i("鶏の照り焼き", "トリノテリヤキ"), i("春雨サラダ", "ハルサメサラダ"), i("おからの煮物", "オカラノニモノ")],
    sizes: [s("150g", 150, "g", 1, "パック"), s("250g", 250, "g", 1.5, "パック"), s("小盛", 100, "g", 0.7, "パック")],
  },
  // ---- 調味料 ----
  {
    top: "SEASONING", index: 1, name: "基礎調味料", weight: 40, storage: "room_temperature", shelf: [365, 730], unit: "本",
    price: [158, 598], costRatio: [0.6, 0.72], casePacks: [12, 6], demand: [0.6, 3], makers: ["kinwan"],
    items: [i("こいくち醤油", "コイクチショウユ"), i("甘口さしみ醤油", "アマクチサシミショウユ"), i("麦みそ", "ムギミソ", { unit: "個", shelf: [180, 270] }), i("合わせみそ", "アワセミソ", { unit: "個", shelf: [180, 270] }), i("米酢", "コメズ"), i("本みりん", "ホンミリン"), i("料理酒", "リョウリシュ"), i("上白糖", "ジョウハクトウ", { unit: "袋", shelf: [1095, 1095] }), i("食塩", "ショクエン", { unit: "袋", shelf: [1095, 1095] }), i("キャノーラ油", "キャノーラアブラ")],
    sizes: [s("1L", 1, "L", 1.4, "ペットボトル"), s("500ml", 500, "ml", 1, "ペットボトル"), s("750g", 750, "g", 1.2, "袋")],
  },
  {
    top: "SEASONING", index: 2, name: "たれ・ソース", weight: 40, storage: "room_temperature", shelf: [180, 365], unit: "本",
    price: [198, 448], costRatio: [0.58, 0.7], casePacks: [12], demand: [0.6, 3], makers: ["kazami", "kinwan"],
    items: [i("焼肉のたれ 中辛", "ヤキニクノタレチュウカラ"), i("とんかつソース", "トンカツソース"), i("ウスターソース", "ウスターソース"), i("ケチャップ", "ケチャップ"), i("マヨネーズ", "マヨネーズ"), i("ごまドレッシング", "ゴマドレッシング"), i("和風ドレッシング", "ワフウドレッシング"), i("ポン酢", "ポンズ"), i("めんつゆ 3倍濃縮", "メンツユサンバイノウシュク"), i("白だし", "シロダシ")],
    sizes: [s("300ml", 300, "ml", 1, "ボトル"), s("500g", 500, "g", 1.2, "ボトル"), s("1L", 1, "L", 1.7, "ペットボトル")],
  },
  // ---- 菓子 ----
  {
    top: "SNACK", index: 1, name: "スナック", weight: 45, storage: "room_temperature", shelf: [120, 180], unit: "袋",
    price: [98, 248], costRatio: [0.6, 0.72], casePacks: [12, 24], demand: [1, 6], makers: ["hinataya"],
    items: [i("ポテトチップス うすしお", "ポテトチップスウスシオ"), i("ポテトチップス のりしお", "ポテトチップスノリシオ"), i("コーンスナック", "コーンスナック"), i("えびせんべい", "エビセンベイ"), i("かりんとう", "カリントウ"), i("柿の種", "カキノタネ"), i("さつまいもチップス", "サツマイモチップス"), i("ソフトせんべい", "ソフトセンベイ"), i("ポップコーン キャラメル", "ポップコーンキャラメル")],
    sizes: [s("60g", 60, "g", 1, "袋"), s("135g", 135, "g", 1.8, "袋"), s("小袋6袋入", 6, "袋", 2.2, "袋")],
  },
  {
    top: "SNACK", index: 2, name: "チョコレート", weight: 30, storage: "room_temperature", shelf: [180, 365], unit: "個",
    price: [128, 398], costRatio: [0.58, 0.7], casePacks: [10, 20], demand: [0.8, 5], makers: ["luna"],
    items: [i("ミルクチョコレート", "ミルクチョコレート"), i("ハイカカオ72%", "ハイカカオナナジュウニパーセント"), i("アーモンドチョコ", "アーモンドチョコ"), i("ホワイトチョコ", "ホワイトチョコ"), i("いちごチョコ", "イチゴチョコ"), i("チョコクッキー", "チョコクッキー")],
    sizes: [s("50g", 50, "g", 1, "箱"), s("大袋 180g", 180, "g", 2.4, "袋"), s("12枚入", 12, "枚", 1.8, "箱")],
  },
  {
    top: "SNACK", index: 3, name: "デザート", weight: 25, storage: "refrigerated", shelf: [7, 20], unit: "個",
    price: [98, 298], costRatio: [0.55, 0.68], casePacks: [12, 6], demand: [1.5, 7], makers: ["soyokaze"],
    items: [i("カスタードプリン", "カスタードプリン"), i("焼きプリン", "ヤキプリン"), i("コーヒーゼリー", "コーヒーゼリー"), i("みかんゼリー", "ミカンゼリー", { storage: "room_temperature", shelf: [120, 180] }), i("杏仁豆腐", "アンニンドウフ"), i("わらび餅", "ワラビモチ", { shelf: [3, 5] }), i("シュークリーム", "シュークリーム", { shelf: [2, 3] }), i("バウムクーヘン", "バウムクーヘン", { storage: "room_temperature", shelf: [30, 60] })],
    sizes: [s("1個", 1, "個", 1, "カップ"), s("3個パック", 3, "個", 2.2, "パック"), s("大容量", 1, "個", 1.6, "カップ")],
  },
  // ---- パン ----
  {
    top: "BREAD", index: 1, name: "食パン", weight: 15, storage: "room_temperature", shelf: [4, 5], unit: "袋",
    price: [158, 298], costRatio: [0.58, 0.7], casePacks: [1], demand: [3, 12], makers: ["komugi"],
    items: [i("食パン", "ショクパン"), i("超熟風食パン", "チョウジュクフウショクパン"), i("全粒粉食パン", "ゼンリュウフンショクパン"), i("山型食パン", "ヤマガタショクパン"), i("レーズン食パン", "レーズンショクパン")],
    sizes: [s("6枚切", 6, "枚", 1, "袋"), s("8枚切", 8, "枚", 1, "袋"), s("4枚切", 4, "枚", 0.9, "袋")],
  },
  {
    top: "BREAD", index: 2, name: "菓子パン", weight: 35, storage: "room_temperature", shelf: [3, 5], unit: "個",
    price: [108, 198], costRatio: [0.55, 0.68], casePacks: [1], demand: [1.5, 7], makers: ["komugi"],
    items: [i("あんぱん", "アンパン"), i("クリームパン", "クリームパン"), i("メロンパン", "メロンパン"), i("カレーパン", "カレーパン"), i("チョコデニッシュ", "チョコデニッシュ"), i("ロールパン", "ロールパン", { unit: "袋" }), i("バターロール", "バターロール", { unit: "袋" }), i("ツナマヨパン", "ツナマヨパン"), i("ジャムマーガリンコッペ", "ジャムマーガリンコッペ")],
    sizes: [s("1個", 1, "個", 1, "袋"), s("4個入", 4, "個", 1.9, "袋"), s("大きめ", 1, "個", 1.3, "袋")],
  },
  // ---- 米・麺 ----
  {
    top: "RICE", index: 1, name: "米", weight: 20, storage: "room_temperature", shelf: [180, 365], unit: "袋",
    price: [1580, 4280], costRatio: [0.72, 0.82], casePacks: [4, 2], demand: [0.3, 2.5], makers: ["minaminoho"],
    items: [i("ヒノヒカリ", "ヒノヒカリ"), i("コシヒカリ", "コシヒカリ"), i("無洗米 ブレンド", "ムセンマイブレンド"), i("もち米", "モチゴメ"), i("雑穀米ブレンド", "ザッコクマイブレンド", { price: [398, 798] })],
    sizes: [s("5kg", 5, "kg", 1, "袋"), s("2kg", 2, "kg", 0.45, "袋"), s("10kg", 10, "kg", 1.9, "袋")],
  },
  {
    top: "RICE", index: 2, name: "麺", weight: 35, storage: "room_temperature", shelf: [365, 730], unit: "袋",
    price: [98, 398], costRatio: [0.58, 0.7], casePacks: [20, 12], demand: [0.8, 5], makers: ["aoba"],
    items: [i("そうめん", "ソウメン"), i("ざるそば", "ザルソバ"), i("乾燥うどん", "カンソウウドン"), i("スパゲッティ 1.6mm", "スパゲッティイッテンロクミリ"), i("袋麺 醤油味", "フクロメンショウユアジ"), i("カップ麺 とんこつ", "カップメントンコツ", { unit: "個" }), i("ゆでうどん", "ユデウドン", { storage: "refrigerated", shelf: [10, 14], demand: [2, 7] }), i("生ラーメン 豚骨", "ナマラーメントンコツ", { storage: "refrigerated", shelf: [7, 12] })],
    sizes: [s("300g", 300, "g", 1, "袋"), s("5食入", 5, "食", 1.6, "袋"), s("1食", 1, "食", 0.5, "袋")],
  },
  // ---- 一般食品 ----
  {
    top: "GENERAL", index: 1, name: "乾物", weight: 25, storage: "room_temperature", shelf: [180, 365], unit: "袋",
    price: [158, 498], costRatio: [0.6, 0.72], casePacks: [10, 20], demand: [0.5, 2.5], makers: ["kotohogi"],
    items: [i("かつお節パック", "カツオブシパック"), i("だし昆布", "ダシコンブ"), i("乾燥わかめ", "カンソウワカメ"), i("切り干し大根", "キリボシダイコン"), i("干ししいたけ", "ホシシイタケ"), i("焼きのり", "ヤキノリ"), i("ごま 白", "ゴマシロ"), i("高野豆腐", "コウヤドウフ")],
    sizes: [s("20g", 20, "g", 1, "袋"), s("50g", 50, "g", 1.6, "袋"), s("10袋入", 10, "袋", 1.8, "袋")],
  },
  {
    top: "GENERAL", index: 2, name: "シリアル", weight: 13, storage: "room_temperature", shelf: [240, 365], unit: "袋",
    price: [298, 698], costRatio: [0.6, 0.72], casePacks: [8, 6], demand: [0.5, 2.5], makers: ["kotohogi"],
    items: [i("フルーツグラノーラ", "フルーツグラノーラ"), i("コーンフレーク", "コーンフレーク"), i("オートミール", "オートミール"), i("玄米フレーク", "ゲンマイフレーク"), i("ミューズリー", "ミューズリー")],
    sizes: [s("400g", 400, "g", 1, "袋"), s("750g", 750, "g", 1.6, "袋"), s("220g", 220, "g", 0.65, "箱")],
  },
  // ---- その他 ----
  {
    top: "OTHER", index: 1, name: "その他", weight: 10, storage: "refrigerated", shelf: [5, 10], unit: "パック",
    price: [88, 298], costRatio: [0.62, 0.75], casePacks: [10, 6], demand: [3, 12], makers: ["mamekichi"],
    items: [i("絹ごし豆腐", "キヌゴシトウフ"), i("木綿豆腐", "モメンドウフ"), i("納豆 小粒", "ナットウコツブ"), i("たまご Mサイズ", "タマゴエムサイズ", { shelf: [14, 21], price: [238, 298] }), i("こんにゃく", "コンニャク", { shelf: [60, 90] }), i("油揚げ", "アブラアゲ")],
    sizes: [s("300g", 300, "g", 1, "パック"), s("3個パック", 3, "個", 1, "パック"), s("10個入", 10, "個", 1.4, "パック")],
  },
];

export type GeneratedProduct = {
  id: string;
  sku: string;
  janCode: string;
  productName: string;
  productNameKana: string;
  manufacturer: string;
  brand: string;
  topCode: string;
  subCode: string;
  specification: string;
  contentAmount: number;
  contentUnit: string;
  salesUnit: string;
  purchaseUnit: string;
  unitsPerCase: number;
  costPrice: number;
  sellingPrice: number;
  taxRate: number;
  storageType: StorageType;
  temperatureMin: number | null;
  temperatureMax: number | null;
  shelfLifeDays: number;
  expirationWarningDays: number;
  referenceDemand: number;
  orderLotSize: number;
  storageLocationNote: string;
};

function jpyPrice(value: number): number {
  // 日本の売価らしく末尾8円に寄せる
  const rounded = Math.max(38, Math.round(value / 10) * 10 - 2);
  return rounded;
}

function warningDays(shelf: number): number {
  if (shelf <= 7) return 1;
  if (shelf <= 30) return 3;
  if (shelf <= 180) return 14;
  return 30;
}

function temperature(storage: StorageType): [number | null, number | null] {
  if (storage === "refrigerated") return [0, 10];
  if (storage === "frozen") return [null, -18];
  return [null, null];
}

const STORAGE_NOTES: Record<StorageType, string[]> = {
  room_temperature: ["常温倉庫 A棚", "常温倉庫 B棚", "バックヤード 常温ラック", "売場下ストッカー"],
  refrigerated: ["冷蔵庫 1番", "冷蔵庫 2番", "ウォークイン冷蔵庫", "乳製品冷蔵ケース裏"],
  frozen: ["冷凍庫 F1", "冷凍庫 F2", "ウォークイン冷凍庫"],
};

export function generateProducts(rng: Rng, total: number): GeneratedProduct[] {
  const weightSum = SUBS.reduce((sum, sub) => sum + sub.weight, 0);
  const counts = SUBS.map((sub) => Math.max(1, Math.round((sub.weight / weightSum) * total)));
  // 合計を total に合わせる
  let diff = total - counts.reduce((a, b) => a + b, 0);
  for (let idx = 0; diff !== 0; idx = (idx + 1) % counts.length) {
    if (diff > 0) {
      counts[idx] += 1;
      diff -= 1;
    } else if (counts[idx] > 1) {
      counts[idx] -= 1;
      diff += 1;
    }
  }

  const products: GeneratedProduct[] = [];
  const usedJan = new Set<string>();

  SUBS.forEach((sub, subIdx) => {
    const target = counts[subIdx];
    const names = new Set<string>();
    let attempts = 0;
    let seq = 0;
    while (seq < target && attempts < target * 200) {
      attempts += 1;
      const makerKey = rng.pick(sub.makers);
      const maker = MAKERS[makerKey];
      const [brand, brandKana] = rng.pick(maker.brands);
      const item = rng.pick(sub.items);
      const size = rng.pick(sub.sizes);
      const productName = `${brand} ${item.name} ${size.label}`;
      if (names.has(productName)) continue;
      names.add(productName);
      seq += 1;

      const storage = item.storage ?? sub.storage;
      const shelfRange = item.shelf ?? (item.storage && item.storage !== sub.storage ? [180, 365] : sub.shelf);
      const shelfLifeDays = rng.int(shelfRange[0], shelfRange[1]);
      const priceRange = item.price ?? sub.price;
      const sellingPrice = jpyPrice(rng.range(priceRange[0], priceRange[1]) * size.factor);
      const costPrice = Math.round(sellingPrice * rng.range(sub.costRatio[0], sub.costRatio[1]) * 100) / 100;
      const unitsPerCase = rng.pick(sub.casePacks);
      const demandRange = item.demand ?? sub.demand;
      // 大容量ほど売れにくい
      const referenceDemand = Math.round((rng.range(demandRange[0], demandRange[1]) / Math.sqrt(size.factor)) * 100) / 100;
      const salesUnit = item.unit ?? sub.unit;
      const [tmin, tmax] = temperature(storage);

      let janCode = "";
      do {
        const body = `2${rng.digits(11)}`;
        janCode = `${body}${calculateJanCheckDigit(body)}`;
      } while (usedJan.has(janCode));
      usedJan.add(janCode);

      products.push({
        id: rng.uuid(),
        sku: `${sub.top}-${String(sub.index).padStart(2, "0")}-${String(seq).padStart(4, "0")}`,
        janCode,
        productName,
        productNameKana: `${brandKana}${item.kana}`,
        manufacturer: maker.name,
        brand,
        topCode: sub.top,
        subCode: `${sub.top}-${String(sub.index).padStart(2, "0")}`,
        specification: unitsPerCase > 1 ? `${size.spec} ${size.label}（${unitsPerCase}${salesUnit}/ケース）` : `${size.spec} ${size.label}`,
        contentAmount: size.amount,
        contentUnit: size.unit,
        salesUnit,
        purchaseUnit: unitsPerCase > 1 ? "ケース" : salesUnit,
        unitsPerCase,
        costPrice,
        sellingPrice,
        taxRate: 8,
        storageType: storage,
        temperatureMin: tmin,
        temperatureMax: tmax,
        shelfLifeDays,
        expirationWarningDays: warningDays(shelfLifeDays),
        referenceDemand,
        orderLotSize: unitsPerCase,
        storageLocationNote: rng.pick(STORAGE_NOTES[storage]),
      });
    }
  });

  return products;
}

// -----------------------------------------------------------------------------
// 仕入先
// -----------------------------------------------------------------------------
type SupplierType = {
  suffix: string;
  categories: string[];
  lead: [number, number];
  /** 発注曜日（0=日） */
  orderDays: number[];
  paymentTerms: string;
  minimumOrderAmount: number;
};

const SUPPLIER_TYPES: SupplierType[] = [
  { suffix: "飲料販売", categories: ["DRINK"], lead: [2, 3], orderDays: [2], paymentTerms: "月末締め翌月末払い", minimumOrderAmount: 10000 },
  { suffix: "デイリー流通", categories: ["DAIRY", "OTHER"], lead: [1, 1], orderDays: [1, 3, 5], paymentTerms: "20日締め翌月10日払い", minimumOrderAmount: 5000 },
  { suffix: "冷凍食品販売", categories: ["FROZEN"], lead: [2, 3], orderDays: [3], paymentTerms: "月末締め翌月末払い", minimumOrderAmount: 15000 },
  { suffix: "ミート", categories: ["MEAT"], lead: [1, 2], orderDays: [1, 4], paymentTerms: "月末締め翌月20日払い", minimumOrderAmount: 8000 },
  { suffix: "水産", categories: ["FISH"], lead: [1, 1], orderDays: [1, 3, 5], paymentTerms: "15日締め当月末払い", minimumOrderAmount: 5000 },
  { suffix: "青果", categories: ["VEG", "FRUIT"], lead: [1, 1], orderDays: [1, 3, 5], paymentTerms: "15日締め当月末払い", minimumOrderAmount: 3000 },
  { suffix: "食品販売", categories: ["PROCESSED", "GENERAL"], lead: [3, 4], orderDays: [4], paymentTerms: "月末締め翌月末払い", minimumOrderAmount: 20000 },
  { suffix: "物産", categories: ["SEASONING", "GENERAL"], lead: [3, 5], orderDays: [2], paymentTerms: "月末締め翌々月10日払い", minimumOrderAmount: 20000 },
  { suffix: "製菓卸", categories: ["SNACK"], lead: [2, 4], orderDays: [4], paymentTerms: "月末締め翌月末払い", minimumOrderAmount: 10000 },
  { suffix: "ベーカリー商会", categories: ["BREAD"], lead: [1, 1], orderDays: [1, 3, 5], paymentTerms: "月末締め翌月15日払い", minimumOrderAmount: 3000 },
  { suffix: "米穀", categories: ["RICE"], lead: [2, 3], orderDays: [2], paymentTerms: "月末締め翌月末払い", minimumOrderAmount: 20000 },
  { suffix: "フードサービス", categories: ["PROCESSED", "OTHER"], lead: [1, 2], orderDays: [1, 3, 5], paymentTerms: "20日締め翌月10日払い", minimumOrderAmount: 5000 },
  { suffix: "商事", categories: ["SEASONING", "PROCESSED", "SNACK"], lead: [3, 5], orderDays: [3], paymentTerms: "月末締め翌月末払い", minimumOrderAmount: 30000 },
  { suffix: "乳業販売", categories: ["DAIRY"], lead: [1, 2], orderDays: [2, 5], paymentTerms: "月末締め翌月末払い", minimumOrderAmount: 8000 },
];

const SUPPLIER_PREFIXES = [
  "みなみ", "あけぼの", "しおかぜ", "ひだまり", "こがね", "たちばな", "かすみ", "はやぶさ", "すずらん", "もみじ",
  "わかば", "ときわ", "あかつき", "いぶき", "さつき", "やまびこ", "なぎさ", "ほたる", "つくし", "こだま",
  "そよぎ", "あまね", "ひばり", "かがり", "ゆうなぎ", "しらさぎ", "あさぎ", "なごみ", "つむぎ", "みやび",
  "はるか", "こはく", "さざなみ", "あおい", "すばる", "ひので", "くすのき", "かえで", "しずく", "ともしび",
  "えにし", "たまゆら", "いろは", "かなで", "みずほ", "やよい", "ふたば", "きらら", "まほろ", "ゆずりは",
];

const KANA_PREFIX: Record<string, string> = {};

const SUPPLIER_REGIONS = [
  { prefecture: "北海道", city: "札幌市", postalPrefix: "060", phonePrefix: "011" },
  { prefecture: "宮城県", city: "仙台市", postalPrefix: "980", phonePrefix: "022" },
  { prefecture: "埼玉県", city: "さいたま市", postalPrefix: "330", phonePrefix: "048" },
  { prefecture: "千葉県", city: "千葉市", postalPrefix: "260", phonePrefix: "043" },
  { prefecture: "東京都", city: "江東区", postalPrefix: "135", phonePrefix: "03" },
  { prefecture: "神奈川県", city: "横浜市", postalPrefix: "220", phonePrefix: "045" },
  { prefecture: "新潟県", city: "新潟市", postalPrefix: "950", phonePrefix: "025" },
  { prefecture: "石川県", city: "金沢市", postalPrefix: "920", phonePrefix: "076" },
  { prefecture: "静岡県", city: "静岡市", postalPrefix: "420", phonePrefix: "054" },
  { prefecture: "愛知県", city: "名古屋市", postalPrefix: "450", phonePrefix: "052" },
  { prefecture: "京都府", city: "京都市", postalPrefix: "600", phonePrefix: "075" },
  { prefecture: "大阪府", city: "大阪市", postalPrefix: "530", phonePrefix: "06" },
  { prefecture: "兵庫県", city: "神戸市", postalPrefix: "650", phonePrefix: "078" },
  { prefecture: "岡山県", city: "岡山市", postalPrefix: "700", phonePrefix: "086" },
  { prefecture: "広島県", city: "広島市", postalPrefix: "730", phonePrefix: "082" },
  { prefecture: "香川県", city: "高松市", postalPrefix: "760", phonePrefix: "087" },
  { prefecture: "福岡県", city: "福岡市", postalPrefix: "810", phonePrefix: "092" },
  { prefecture: "熊本県", city: "熊本市", postalPrefix: "860", phonePrefix: "096" },
  { prefecture: "鹿児島県", city: "鹿児島市", postalPrefix: "890", phonePrefix: "099" },
  { prefecture: "沖縄県", city: "那覇市", postalPrefix: "900", phonePrefix: "098" },
];

export type GeneratedSupplier = {
  id: string;
  code: string;
  companyName: string;
  contactName: string;
  email: string;
  phone: string;
  postalCode: string;
  prefecture: string;
  city: string;
  address: string;
  paymentTerms: string;
  minimumOrderAmount: number;
  leadTimeDays: number;
  orderDays: number[];
  categories: string[];
};

const FAMILY_NAMES = ["佐藤", "鈴木", "高橋", "田中", "伊藤", "渡辺", "山本", "中村", "小林", "加藤", "吉田", "山田", "松本", "井上", "木村"];
const GIVEN_NAMES = ["健太", "美咲", "大輔", "由美", "翔", "千尋", "誠", "彩", "拓也", "恵"];

export function generateSuppliers(rng: Rng, count: number): GeneratedSupplier[] {
  const suppliers: GeneratedSupplier[] = [];
  const prefixes = rng.shuffle(SUPPLIER_PREFIXES);
  const regions = rng.shuffle(SUPPLIER_REGIONS);
  for (let n = 0; n < count; n += 1) {
    const type = SUPPLIER_TYPES[n % SUPPLIER_TYPES.length];
    const prefix = prefixes[n % prefixes.length];
    const form = rng.pick(["株式会社", "有限会社", "株式会社"]);
    const companyName = form === "有限会社" ? `${form}${prefix}${type.suffix}` : `${prefix}${type.suffix}${form}`;
    const region = regions[n % regions.length];
    const code = `SUP-${String(n + 1).padStart(3, "0")}`;
    suppliers.push({
      id: rng.uuid(),
      code,
      companyName,
      contactName: `${rng.pick(FAMILY_NAMES)} ${rng.pick(GIVEN_NAMES)}`,
      email: `order-${code.toLowerCase()}@example.com`,
      phone: `${region.phonePrefix}-${rng.digits(region.phonePrefix.length === 2 ? 4 : 3)}-${rng.digits(4)}`,
      postalCode: `${region.postalPrefix}-${rng.digits(4)}`,
      prefecture: region.prefecture,
      city: region.city,
      address: `${rng.pick(["港町", "卸本町", "流通団地", "臨海", "新栄町", "工業団地"])}${rng.int(1, 9)}-${rng.int(1, 30)}（デモ用架空住所）`,
      paymentTerms: type.paymentTerms,
      minimumOrderAmount: type.minimumOrderAmount,
      leadTimeDays: rng.int(type.lead[0], type.lead[1]),
      orderDays: type.orderDays,
      categories: type.categories,
    });
    KANA_PREFIX[code] = prefix;
  }
  return suppliers;
}

export type SeedLocation = {
  code: string;
  name: string;
  type: "store" | "warehouse";
  postalCode: string;
  prefecture: string;
  city: string;
  address: string;
  phone: string;
  demandFactor: number;
  carryRate: number;
};

export const SEED_LOCATIONS: SeedLocation[] = [
  { code: "TYO", name: "東京中央店", type: "store", postalCode: "100-0005", prefecture: "東京都", city: "千代田区", address: "丸の内1-1（デモ用架空住所）", phone: "03-0000-0001", demandFactor: 1.25, carryRate: 0.85 },
  { code: "OSA", name: "大阪梅田店", type: "store", postalCode: "530-0001", prefecture: "大阪府", city: "大阪市北区", address: "梅田1-1（デモ用架空住所）", phone: "06-0000-0002", demandFactor: 1.0, carryRate: 0.72 },
  { code: "FUK", name: "福岡天神店", type: "store", postalCode: "810-0001", prefecture: "福岡県", city: "福岡市中央区", address: "天神1-1（デモ用架空住所）", phone: "092-000-0003", demandFactor: 0.8, carryRate: 0.68 },
  { code: "SPK", name: "札幌物流センター", type: "warehouse", postalCode: "060-0908", prefecture: "北海道", city: "札幌市東区", address: "北八条東1-1（デモ用架空住所）", phone: "011-000-0010", demandFactor: 1.6, carryRate: 0.45 },
];
