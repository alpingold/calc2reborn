# Content escalations

Questions the checking pass held back, and how each was settled. A question is held when the checker's own answer differs from the key, when it suspects a transcription error, or when it rejects a draft it cannot repair. See `docs/solution-checking-guide.md`.

## Settled

| Question | Why it was held | Outcome |
|---|---|---|
| `f2024-final-q04` | The checker answered D (statements I and II only); the key is A (all four). Statements III and IV use the limit comparison test with a limit of 0, which the basic test (a positive finite limit) does not cover. | The key stands. The course teaches the extended test: card `L23` "Limit Comparison gives $c = 0$. What can you conclude?" covers a limit of 0 with a convergent comparison series. The solution says so and names it as the trap. Settled 2026-11-10. |
| `s2024-final-q17` | The checker's blind answer was D (no $p$ converges); the key is C ($p < -1$). | The key stands. The checker reported the slip as its own: with $u = \ln x$ the integral $\int_{\ln 3}^{\infty} u^p\,du$ converges exactly for $p < -1$. Held only because the grade file gave no reason. Settled 2026-11-10. |
| `f2022-e3-q12` | The draft was rejected. It bounded $e^{-c}$ on $[-0.1, 0]$ and got $e^{0.1}/6000$, and flagged the stored answer $\frac{1}{6000}$ as only the nearest choice. | The stored answer stands. The estimate of $e^{-0.1}$ is $f(0.1)$ for $f(x) = e^{-x}$, so $c$ lies in $[0, 0.1]$, $M = 1$, and the bound is exactly $\frac{1}{6000}$. The solution was written by hand. Settled 2026-11-10. |

## Open

None.

## Lesson-tag notes

Suggestions from the checker that hold nothing back.

- `s2024-e1-q12`: the hinged bar fits L9 and L10 only loosely.
- `s2024-final-q07`: the circle $r = \cos\theta + \sin\theta$ would also fit L33; it is tagged to L34 only.

## Batches

| Batch | Exams | Questions | Pass | Fix | Reject | Held | Blind answer differed from key |
|---|---|---|---|---|---|---|---|
| Pilot | `f2018-e1` | 12 | 12 | 0 | 0 | 0 | 0 |
| 1 | `f2024-e1`, `f2024-e2`, `f2024-e3`, `f2024-final`, `f2025-e1`, `f2025-e2`, `f2025-e3`, `f2025-final` | 115 | 105 | 10 | 0 | 1 | 1 |
| 2 | `s2024-e1`, `s2024-e2`, `s2024-e3`, `s2024-final`, `f2023-e1`, `f2023-e2`, `f2023-e3`, `f2023-final` | 122 | 105 | 17 | 0 | 0 | 2, both the checker's own slips |
| 3 | `f2022-e1`, `f2022-e2`, `f2022-e3`, `f2022-final`, `s2023-e1`, `s2023-e2`, `s2023-e3`, `s2023-final` | 121 | 112 | 8 | 1 | 1 | 0 |
