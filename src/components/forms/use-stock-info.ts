"use client";

import { useRef, useState } from "react";

import { getStockInfoAction, type StockInfo } from "@/app/(app)/inventory/stock-actions";

/** 拠点×商品の在庫情報を取得（最新のリクエスト結果だけを反映） */
export function useStockInfo() {
  const [info, setInfo] = useState<StockInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const requestId = useRef(0);

  async function load(locationId: string | undefined, productId: string | undefined) {
    const current = ++requestId.current;
    if (!locationId || !productId) {
      setInfo(null);
      setError(null);
      return;
    }
    setLoading(true);
    try {
      const result = await getStockInfoAction(locationId, productId);
      if (current !== requestId.current) return;
      if (result.ok && result.data) {
        setInfo(result.data);
        setError(null);
      } else {
        setInfo(null);
        setError(result.message);
      }
    } catch (caught) {
      console.error("[stock-info] load failed", caught);
      if (current === requestId.current) {
        setInfo(null);
        setError("在庫情報を取得できませんでした。");
      }
    } finally {
      if (current === requestId.current) setLoading(false);
    }
  }

  return { info, error, loading, load };
}
