"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useRef, useState, useTransition, type ReactNode } from "react";

import type { ActionResult } from "@/lib/validation/common";

import { buttonClasses, type ButtonSize, type ButtonVariant } from "./button";
import { useToast } from "./toast";

/**
 * 確認ダイアログ付きの操作ボタン（ネイティブ <dialog> でフォーカス管理・Esc クローズに対応）。
 */
export function ConfirmButton({
  action,
  title,
  description,
  confirmLabel,
  children,
  variant = "secondary",
  confirmVariant = "primary",
  size = "md",
  disabled,
}: {
  action: () => Promise<ActionResult<unknown>>;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  children: ReactNode;
  variant?: ButtonVariant;
  confirmVariant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const toast = useToast();
  const titleId = useId();
  const descriptionId = useId();

  function open() {
    setError(null);
    dialogRef.current?.showModal();
  }

  function close() {
    if (!pending) dialogRef.current?.close();
  }

  function confirm() {
    startTransition(async () => {
      try {
        const result = await action();
        if (result.ok) {
          dialogRef.current?.close();
          toast.success(result.message);
          if (result.redirectTo) router.push(result.redirectTo);
          else router.refresh();
        } else {
          setError(result.message);
          toast.error(result.message);
        }
      } catch (caught) {
        console.error("[confirm] action failed", caught);
        const message = "通信に失敗しました。もう一度お試しください。";
        setError(message);
        toast.error(message);
      }
    });
  }

  return (
    <>
      <button type="button" onClick={open} disabled={disabled} className={buttonClasses(variant, size)}>
        {children}
      </button>
      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        onCancel={(event) => {
          if (pending) event.preventDefault();
        }}
        className="m-auto w-[calc(100%-2rem)] max-w-md rounded-lg border border-slate-200 p-0 shadow-xl"
      >
        <div className="p-5">
          <h2 id={titleId} className="text-base font-semibold text-slate-900">
            {title}
          </h2>
          <div id={descriptionId} className="mt-2 text-sm text-slate-600">
            {description}
          </div>
          {error ? (
            <p role="alert" className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              {error}
            </p>
          ) : null}
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-100 bg-slate-50 px-5 py-3">
          <button type="button" onClick={close} disabled={pending} className={buttonClasses("secondary")} autoFocus>
            戻る
          </button>
          <button type="button" onClick={confirm} disabled={pending} className={buttonClasses(confirmVariant)}>
            {pending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
            {pending ? "処理中…" : confirmLabel}
          </button>
        </div>
      </dialog>
    </>
  );
}
