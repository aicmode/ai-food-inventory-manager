"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import {
  createContext,
  startTransition,
  useActionState,
  useContext,
  useId,
  useRef,
  type ComponentProps,
  type FormEvent,
  type ReactNode,
} from "react";

import type { ActionResult } from "@/lib/validation/common";

import { buttonClasses, type ButtonVariant } from "./button";
import { useToast } from "./toast";

export type FormAction<T = undefined> = (previous: ActionResult<T> | null, formData: FormData) => Promise<ActionResult<T>>;

type FormState = { result: ActionResult<unknown> | null; pending: boolean };

const FormStateContext = createContext<FormState>({ result: null, pending: false });

export function useFormState(): FormState {
  return useContext(FormStateContext);
}

export function useFieldError(name: string): string | undefined {
  const { result } = useFormState();
  if (!result || result.ok) return undefined;
  return result.fieldErrors?.[name]?.[0];
}

/**
 * Server Action 用フォーム。
 * - 送信中は pending、結果はトーストとフィールドエラーで表示
 * - React のフォーム自動リセットを避け、エラー時に入力値を保持する
 * - 成功時は redirectTo へ遷移、または画面を更新
 */
export function ActionForm<T>({
  action,
  children,
  className,
  onSuccess,
  refreshOnSuccess = true,
  resetOnSuccess = false,
  confirmMessage,
  ...props
}: Omit<ComponentProps<"form">, "action" | "onSubmit" | "children"> & {
  action: FormAction<T>;
  children: ReactNode;
  onSuccess?: (result: ActionResult<T> & { ok: true }) => void;
  refreshOnSuccess?: boolean;
  resetOnSuccess?: boolean;
  confirmMessage?: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const formRef = useRef<HTMLFormElement>(null);

  const [result, dispatch, pending] = useActionState<ActionResult<T> | null, FormData>(async (previous, formData) => {
    try {
      const next = await action(previous, formData);
      if (next.ok) {
        toast.success(next.message);
        onSuccess?.(next);
        if (resetOnSuccess) formRef.current?.reset();
        if (next.redirectTo) router.push(next.redirectTo);
        else if (refreshOnSuccess) router.refresh();
      } else {
        toast.error(next.message);
      }
      return next;
    } catch (error) {
      console.error("[form] action failed", error);
      const message = "通信に失敗しました。ネットワーク接続を確認して、もう一度お試しください。";
      toast.error(message);
      return { ok: false, message };
    }
  }, null);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    if (confirmMessage && !window.confirm(confirmMessage)) return;
    const submitter = event.nativeEvent instanceof SubmitEvent ? event.nativeEvent.submitter : null;
    const formData = new FormData(event.currentTarget, submitter);
    startTransition(() => dispatch(formData));
  }

  return (
    <FormStateContext.Provider value={{ result, pending }}>
      <form ref={formRef} onSubmit={handleSubmit} className={className} noValidate {...props}>
        {result && !result.ok ? (
          <p role="alert" className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {result.message}
          </p>
        ) : null}
        {children}
      </form>
    </FormStateContext.Provider>
  );
}

export function SubmitButton({
  children,
  pendingLabel = "処理中…",
  variant = "primary",
  className = "",
  name,
  value,
}: {
  children: ReactNode;
  pendingLabel?: string;
  variant?: ButtonVariant;
  className?: string;
  name?: string;
  value?: string;
}) {
  const { pending } = useFormState();
  return (
    <button type="submit" name={name} value={value} disabled={pending} aria-disabled={pending} className={buttonClasses(variant, "md", className)}>
      {pending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
      {pending ? pendingLabel : children}
    </button>
  );
}

// -----------------------------------------------------------------------------
// フォーム項目（label と input を id で関連付け、エラーを aria-describedby で通知）
// -----------------------------------------------------------------------------
export const inputClass =
  "block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 focus:outline-none disabled:bg-slate-100 aria-[invalid=true]:border-red-500";

type FieldShellProps = {
  label: string;
  name: string;
  required?: boolean;
  hint?: ReactNode;
  className?: string;
  errorName?: string;
  children: (props: { id: string; describedBy: string | undefined; invalid: boolean }) => ReactNode;
};

export function FieldShell({ label, name, required, hint, className = "", errorName, children }: FieldShellProps) {
  const id = useId();
  const error = useFieldError(errorName ?? name);
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-slate-700">
        {label}
        {required ? (
          <span className="ml-1 text-xs text-red-700">
            *<span className="sr-only">必須</span>
          </span>
        ) : null}
      </label>
      {children({ id, describedBy, invalid: Boolean(error) })}
      {hint ? (
        <p id={hintId} className="mt-1 text-xs text-slate-500">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="mt-1 text-xs text-red-700">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function TextField({
  label,
  name,
  required,
  hint,
  className,
  errorName,
  ...inputProps
}: Omit<ComponentProps<"input">, "id" | "name"> & {
  label: string;
  name: string;
  hint?: ReactNode;
  errorName?: string;
}) {
  return (
    <FieldShell label={label} name={name} required={required} hint={hint} className={className} errorName={errorName}>
      {({ id, describedBy, invalid }) => (
        <input
          id={id}
          name={name}
          required={required}
          aria-invalid={invalid}
          aria-describedby={describedBy}
          className={inputClass}
          {...inputProps}
        />
      )}
    </FieldShell>
  );
}

export function SelectField({
  label,
  name,
  required,
  hint,
  className,
  options,
  placeholder,
  errorName,
  ...selectProps
}: Omit<ComponentProps<"select">, "id" | "name" | "children"> & {
  label: string;
  name: string;
  hint?: ReactNode;
  options: { value: string; label: string }[];
  placeholder?: string;
  errorName?: string;
}) {
  return (
    <FieldShell label={label} name={name} required={required} hint={hint} className={className} errorName={errorName}>
      {({ id, describedBy, invalid }) => (
        <select
          id={id}
          name={name}
          required={required}
          aria-invalid={invalid}
          aria-describedby={describedBy}
          className={inputClass}
          {...selectProps}
        >
          {placeholder !== undefined ? <option value="">{placeholder}</option> : null}
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      )}
    </FieldShell>
  );
}

export function TextareaField({
  label,
  name,
  required,
  hint,
  className,
  ...textareaProps
}: Omit<ComponentProps<"textarea">, "id" | "name"> & { label: string; name: string; hint?: ReactNode }) {
  return (
    <FieldShell label={label} name={name} required={required} hint={hint} className={className}>
      {({ id, describedBy, invalid }) => (
        <textarea
          id={id}
          name={name}
          required={required}
          aria-invalid={invalid}
          aria-describedby={describedBy}
          className={inputClass}
          rows={3}
          {...textareaProps}
        />
      )}
    </FieldShell>
  );
}

export function CheckboxField({
  label,
  name,
  defaultChecked,
  hint,
}: {
  label: string;
  name: string;
  defaultChecked?: boolean;
  hint?: string;
}) {
  const id = useId();
  return (
    <div className="flex items-start gap-2">
      <input
        id={id}
        name={name}
        type="checkbox"
        defaultChecked={defaultChecked}
        className="mt-0.5 size-4 rounded border-slate-300 text-emerald-700 focus:ring-emerald-600"
        aria-describedby={hint ? `${id}-hint` : undefined}
      />
      <div>
        <label htmlFor={id} className="text-sm font-medium text-slate-700">
          {label}
        </label>
        {hint ? (
          <p id={`${id}-hint`} className="text-xs text-slate-500">
            {hint}
          </p>
        ) : null}
      </div>
    </div>
  );
}
