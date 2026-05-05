"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  CONSENT_ITEMS,
  CONSENT_SUMMARY,
  MANUAL_FALLBACK_STEPS,
  type ConsentItemId,
  type ConsentItemValues,
} from "@/lib/consent-copy";

const INITIAL_ITEMS = CONSENT_ITEMS.reduce((acc, item) => {
  acc[item.id] = false;
  return acc;
}, {} as ConsentItemValues);

export function ConsentForm({ nextPath, defaultName }: { nextPath: string; defaultName: string }) {
  const router = useRouter();
  const [items, setItems] = useState<ConsentItemValues>(INITIAL_ITEMS);
  const [signedName, setSignedName] = useState("");
  const [activeDetailId, setActiveDetailId] = useState<ConsentItemId | null>(null);
  const [showManualFallback, setShowManualFallback] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isPending, startTransition] = useTransition();

  const allChecked = useMemo(() => CONSENT_ITEMS.every((item) => items[item.id]), [items]);
  const canSubmit = allChecked && signedName.trim().length > 0 && !isSubmitting && !isPending;
  const activeDetail = CONSENT_ITEMS.find((item) => item.id === activeDetailId) ?? null;

  function setAll(nextChecked: boolean) {
    setItems(
      CONSENT_ITEMS.reduce((acc, item) => {
        acc[item.id] = nextChecked;
        return acc;
      }, {} as ConsentItemValues),
    );
  }

  function setItem(id: ConsentItemId, checked: boolean) {
    setItems((current) => ({
      ...current,
      [id]: checked,
    }));
  }

  async function submitConsent() {
    setMessage(null);
    setShowManualFallback(false);
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/consent", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          signedName,
          items,
        }),
      });

      const data = (await response.json()) as { error?: string };

      if (!response.ok) {
        setMessage(data.error ?? "동의 이력을 저장하지 못했습니다.");
        setShowManualFallback(true);
        return;
      }

      startTransition(() => {
        router.replace(nextPath);
        router.refresh();
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="check-screen consent-screen">
      <section className="check-card consent-card">
        <div className="check-card-head">
          <div>
            <h1 className="check-title">필수 동의</h1>
            <div className="check-date">자동 앱 기반 입·출문 사용 전 확인</div>
          </div>
        </div>

        <div className="notice small consent-summary">
          <ul>
            {CONSENT_SUMMARY.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>

        <label className="consent-all-row">
          <input
            type="checkbox"
            checked={allChecked}
            onChange={(event) => setAll(event.target.checked)}
          />
          <span>전체 동의</span>
        </label>

        <div className="consent-item-list">
          {CONSENT_ITEMS.map((item) => (
            <div key={item.id} className="consent-item-row">
              <label>
                <input
                  type="checkbox"
                  checked={items[item.id]}
                  onChange={(event) => setItem(item.id, event.target.checked)}
                />
                <span>{item.label}</span>
              </label>
              <button
                type="button"
                className="consent-detail-button"
                onClick={() => setActiveDetailId(item.id)}
              >
                상세보기
              </button>
            </div>
          ))}
        </div>

        <label className="field consent-signature-field">
          이름 입력
          <input
            value={signedName}
            onChange={(event) => setSignedName(event.target.value)}
            placeholder={defaultName || "이름을 입력하세요"}
            autoComplete="name"
          />
        </label>

        {message ? <div className="error-box">{message}</div> : null}

        <div className="consent-actions">
          <button
            type="button"
            className="button-subtle"
            onClick={() => {
              setShowManualFallback(true);
              setMessage("자동 앱 기반 입·출문을 사용할 수 없습니다. 아래 수동 입·출문 절차를 진행하세요.");
            }}
          >
            동의하지 않음
          </button>
          <button
            type="button"
            className="button"
            disabled={!canSubmit}
            onClick={() => {
              void submitConsent();
            }}
          >
            동의하고 계속
          </button>
        </div>

        {showManualFallback ? (
          <div className="notice small manual-fallback-box">
            <strong>자동 앱 기반 입·출문을 사용할 수 없습니다. 아래 수동 입·출문 절차를 진행하세요.</strong>
            <ol>
              {MANUAL_FALLBACK_STEPS.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          </div>
        ) : null}
      </section>

      {activeDetail ? (
        <div className="consent-modal-backdrop" role="presentation" onClick={() => setActiveDetailId(null)}>
          <div
            className="consent-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="consent-detail-title"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 id="consent-detail-title">{activeDetail.label}</h2>
            <p>{activeDetail.detail}</p>
            <button type="button" className="button-subtle" onClick={() => setActiveDetailId(null)}>
              닫기
            </button>
          </div>
        </div>
      ) : null}
    </main>
  );
}
