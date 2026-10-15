import type {
  LectureSource,
  PageReference,
  SelectedPassageExplanation,
  StudyExplanation,
  TechnicalConceptExplanation,
} from '@workspace/api-client-react';
import type { Chat } from '@/lib/db';

// A pre-generated notebook so first-time visitors can explore the core
// interactions (underlined terms, concept tabs, follow-ups) without an API key.

export const DEMO_SOURCE_ID = 'demo-floating-point-lecture';
const DEMO_SOURCE_NAME = 'Floating-Point Lecture.pdf';

const DEMO_PAGES = [
  {
    pageNumber: 1,
    text: String.raw`Representing Real Numbers. A normalized floating-point number has the form x = ±(1.d1 d2 ... dt)_2 × 2^e. IEEE 754 double precision stores 1 sign bit, 11 exponent bits and 52 fraction bits, giving a 53-bit significand once the implicit leading 1 is counted.`,
  },
  {
    pageNumber: 2,
    text: String.raw`Rounding. Every real number x in range is rounded to the nearest double: fl(x) = x(1 + δ) with |δ| ≤ u. Many decimal fractions such as 0.1 have infinite binary expansions, 0.1 = 0.000110011001100..._2, and must be rounded when stored.`,
  },
  {
    pageNumber: 3,
    text: String.raw`Machine Epsilon. ε_mach = 2^-52 ≈ 2.22 × 10^-16 is the gap between 1 and the next larger double. The unit roundoff u = ε_mach / 2 bounds the relative error of a single rounding.`,
  },
  {
    pageNumber: 4,
    text: String.raw`Cancellation. Subtracting nearly equal numbers cancels their leading digits and leaves mostly rounding error. Example: (1 + 10^-15) − 1 evaluates to 1.1102230246251565 × 10^-15, a relative error of about 11%. Never test floats with ==; use |a − b| ≤ tol · max(|a|, |b|).`,
  },
];

export const DEMO_SOURCE: LectureSource = {
  id: DEMO_SOURCE_ID,
  name: DEMO_SOURCE_NAME,
  type: 'pdf',
  text: DEMO_PAGES.map((page) => page.text).join('\n\n'),
  pageCount: DEMO_PAGES.length,
  pages: DEMO_PAGES,
};

function cite(pageNumber: number, excerpt: string): PageReference {
  return { sourceId: DEMO_SOURCE_ID, sourceName: DEMO_SOURCE_NAME, pageNumber, excerpt };
}

const DEMO_QUESTION = 'Why does 0.1 + 0.2 not equal 0.3 in most programming languages?';

const DEMO_ANSWER: StudyExplanation = {
  title: 'Why 0.1 + 0.2 ≠ 0.3 in Floating Point',
  generatedAt: '2026-10-15T12:00:00.000Z',
  answerMarkdown: String.raw`Most languages store decimals as 64-bit **double-precision** numbers defined by the IEEE 754 standard. The surprise comes from a mismatch between the base you write numbers in (10) and the base the hardware uses (2).

### 1. 0.1 has no exact binary form

Just as $1/3 = 0.333\ldots$ never terminates in decimal, $0.1$ never terminates in base 2:

$$
0.1_{10} = 0.000110011001100\ldots_2
$$

A double keeps only 53 significant bits (the significand), so this infinite binary fraction is cut off and rounded to the nearest representable value:

| Written | Actually stored |
|---|---|
| ${'`'}0.1${'`'} | ${'`'}0.1000000000000000055511151231257827…${'`'} |
| ${'`'}0.2${'`'} | ${'`'}0.2000000000000000111022302462515654…${'`'} |
| ${'`'}0.3${'`'} | ${'`'}0.2999999999999999888977697537484346…${'`'} |

### 2. Small errors add up

Each stored value carries a tiny rounding error. Adding the stored versions of $0.1$ and $0.2$ lands on a different double than the one closest to $0.3$:

$$
\mathrm{fl}(0.1) + \mathrm{fl}(0.2) = 0.30000000000000004 \neq \mathrm{fl}(0.3)
$$

### 3. How big can the error be?

The gap between $1$ and the next larger double is called machine epsilon:

$$
\varepsilon_{\text{mach}} = 2^{-52} \approx 2.22 \times 10^{-16}
$$

Rounding a real number to a double introduces a relative error of at most $\varepsilon_{\text{mach}}/2$, so ${'`'}0.1 + 0.2${'`'} is off by only about $4.4 \times 10^{-17}$. That is harmless on its own, but subtracting two nearly equal numbers can magnify it, a problem called catastrophic cancellation.

### What to do in practice

- Never compare floats with ${'`'}==${'`'}; check $|a - b| \le \text{tol} \cdot \max(|a|, |b|)$ instead.
- Use a decimal or integer type (e.g. cents) for money.
- Rearrange formulas to avoid subtracting nearly equal quantities.`,
  terms: [
    {
      term: 'IEEE 754',
      contextSnippet: 'Most languages store decimals as 64-bit double-precision numbers defined by the IEEE 754 standard.',
      plainDefinition: 'The technical standard that defines how computers store and round floating-point numbers.',
    },
    {
      term: 'significand',
      contextSnippet: 'A double keeps only 53 significant bits (the significand).',
      plainDefinition: 'The part of a floating-point number that holds its significant digits.',
    },
    {
      term: 'binary fraction',
      contextSnippet: 'This infinite binary fraction is cut off and rounded to the nearest representable value.',
      plainDefinition: 'A fraction written in base 2, where each digit after the point is worth 1/2, 1/4, 1/8, and so on.',
    },
    {
      term: 'rounding error',
      contextSnippet: 'Each stored value carries a tiny rounding error.',
      plainDefinition: 'The difference between a real number and the closest value the computer can actually store.',
    },
    {
      term: 'machine epsilon',
      contextSnippet: 'The gap between 1 and the next larger double is called machine epsilon.',
      plainDefinition: 'The smallest gap between 1 and the next representable floating-point number.',
    },
    {
      term: 'relative error',
      contextSnippet: 'Rounding a real number to a double introduces a relative error of at most ε/2.',
      plainDefinition: 'The size of an error measured as a fraction of the true value.',
    },
    {
      term: 'catastrophic cancellation',
      contextSnippet: 'Subtracting two nearly equal numbers can magnify it, a problem called catastrophic cancellation.',
      plainDefinition: 'A large loss of accuracy that happens when two nearly equal numbers are subtracted.',
    },
  ],
  sourceRefs: [
    cite(2, '0.1 = 0.000110011001100..._2, and must be rounded when stored.'),
    cite(3, 'ε_mach = 2^-52 ≈ 2.22 × 10^-16 is the gap between 1 and the next larger double.'),
    cite(4, 'Never test floats with ==; use |a − b| ≤ tol · max(|a|, |b|).'),
  ],
};

// Keyed by lowercase term so lookups match however the term was clicked.
export const DEMO_CONCEPTS: Record<string, TechnicalConceptExplanation> = {
  'ieee 754': {
    title: 'IEEE 754',
    answerMarkdown: String.raw`**IEEE 754** is the standard almost every CPU and programming language follows for storing real numbers in a fixed number of bits.

### Why it matters

Before the standard (1985), different machines rounded differently, so the same program could print different answers on different hardware. IEEE 754 makes floating-point results reproducible.

### How a double is laid out

A 64-bit double splits its bits into three fields:

| Field | Bits | Role |
|---|---|---|
| Sign | 1 | Positive or negative |
| Exponent | 11 | Scales the number by a power of 2 |
| Fraction | 52 | The digits of the significand |

The value is $(-1)^{s} \times 1.f_2 \times 2^{e - 1023}$. The leading $1$ is implicit, so the significand has 53 bits of precision.

### Example

The number $6.5 = 1.101_2 \times 2^2$ is stored with sign $0$, exponent $2 + 1023 = 1025$, and fraction bits $101000\ldots$. Because the standard also fixes the rounding rules, every compliant machine introduces exactly the same rounding error.`,
    prerequisiteTerms: ['significand', 'rounding error'],
    sourceRefs: [cite(1, 'IEEE 754 double precision stores 1 sign bit, 11 exponent bits and 52 fraction bits')],
  },
  significand: {
    title: 'Significand',
    answerMarkdown: String.raw`The **significand** (also called the mantissa) is the part of a floating-point number that holds its significant digits. The exponent only says where the binary point goes.

### How it works

Every nonzero double is normalized to the form

$$
x = \pm 1.d_1 d_2 \ldots d_{52} \times 2^{e}
$$

The digits $1.d_1 d_2 \ldots d_{52}$ are the significand. The leading $1$ is always there, so it is not stored, which is why a double has 53 bits of precision but only 52 fraction bits.

### Why it matters

The number of significand bits sets the precision. With 53 bits, consecutive doubles near $1$ are $2^{-52}$ apart; that spacing is machine epsilon. A value that needs more bits, such as any binary fraction that repeats forever, has to be rounded.

### Example

$12 = 1.1_2 \times 2^3$, so its significand is $1.1_2$ (that is, $1.5$) and its exponent is $3$.`,
    prerequisiteTerms: ['machine epsilon', 'binary fraction'],
    sourceRefs: [cite(1, 'giving a 53-bit significand once the implicit leading 1 is counted.')],
  },
  'binary fraction': {
    title: 'Binary Fractions',
    answerMarkdown: String.raw`A **binary fraction** is a number written in base 2 with digits after the point. Each position is worth half the one before it:

$$
0.b_1 b_2 b_3 \ldots_2 = \frac{b_1}{2} + \frac{b_2}{4} + \frac{b_3}{8} + \cdots
$$

### Which fractions terminate?

A fraction terminates in base 2 only if, in lowest terms, its denominator is a power of 2.

- $0.5 = \tfrac{1}{2} = 0.1_2$ terminates.
- $0.375 = \tfrac{3}{8} = 0.011_2$ terminates.
- $0.1 = \tfrac{1}{10}$ has a factor of 5 in the denominator, so it repeats forever: $0.000110011001100\ldots_2$.

### Why it matters

A double has room for only 53 significand bits, so a repeating binary fraction must be cut off. That cut is the rounding error behind ${'`'}0.1 + 0.2 != 0.3${'`'}.`,
    prerequisiteTerms: ['significand', 'rounding error'],
    sourceRefs: [cite(2, 'Many decimal fractions such as 0.1 have infinite binary expansions')],
  },
  'rounding error': {
    title: 'Rounding Error',
    answerMarkdown: String.raw`A **rounding error** is the difference between a real number and the closest value a computer can actually store.

### How it works

Floating-point numbers are a finite set of points on the number line. Any real number $x$ that falls between two of them is rounded to the nearest one, written $\mathrm{fl}(x)$:

$$
\mathrm{fl}(x) = x(1 + \delta), \qquad |\delta| \le \frac{\varepsilon_{\text{mach}}}{2}
$$

The bound on $|\delta|$ is a bound on the relative error, and it comes straight from machine epsilon.

### Why it matters

One rounding is tiny, about $10^{-16}$ relative. Real programs perform billions of operations, and errors can accumulate or be magnified, most dramatically through catastrophic cancellation.

### Example

$\mathrm{fl}(0.1) = 0.1000000000000000055511\ldots$, a rounding error of about $5.6 \times 10^{-18}$.`,
    prerequisiteTerms: ['relative error', 'machine epsilon', 'catastrophic cancellation'],
    sourceRefs: [cite(2, 'fl(x) = x(1 + δ) with |δ| ≤ u.')],
  },
  'machine epsilon': {
    title: 'Machine Epsilon',
    answerMarkdown: String.raw`**Machine epsilon** is the gap between $1$ and the next larger floating-point number. For IEEE 754 doubles:

$$
\varepsilon_{\text{mach}} = 2^{-52} \approx 2.22 \times 10^{-16}
$$

### Why that value?

The significand has 52 fraction bits. The smallest step you can take from $1.000\ldots0_2$ is flipping the last bit, which adds $2^{-52}$.

### Why it matters

Machine epsilon measures the precision of the format. Rounding to the nearest double gives a relative error of at most $\varepsilon_{\text{mach}}/2$ (the *unit roundoff*), so it is the natural yardstick for "close enough" tolerances.

### Example

In JavaScript, ${'`'}Number.EPSILON${'`'} is exactly this value, and

$$
1 + 2^{-53} = 1 \quad \text{(in floating point)}
$$

because $2^{-53}$ is too small to change the last bit of the significand.`,
    prerequisiteTerms: ['significand', 'relative error', 'IEEE 754'],
    sourceRefs: [cite(3, 'ε_mach = 2^-52 ≈ 2.22 × 10^-16 is the gap between 1 and the next larger double.')],
  },
  'relative error': {
    title: 'Relative Error',
    answerMarkdown: String.raw`**Relative error** measures an error as a fraction of the true value:

$$
\text{relative error} = \frac{|\hat{x} - x|}{|x|}
$$

where $x$ is the true value and $\hat{x}$ is the approximation.

### Why not just absolute error?

An error of $0.001$ is negligible when measuring the distance to the Moon and enormous when measuring the width of a hair. Relative error captures *how many correct digits* you have, independent of scale.

### Why it matters for floating point

Floating-point spacing grows with magnitude, so rounding error is roughly constant in *relative* terms: about $10^{-16}$ for doubles, set by machine epsilon. A relative error near $10^{-16}$ means about 16 correct decimal digits.

### Example

Catastrophic cancellation can turn a $10^{-16}$ relative error into one of $11\%$, which is why the lecture's $(1 + 10^{-15}) - 1$ example is so striking.`,
    prerequisiteTerms: ['machine epsilon', 'catastrophic cancellation'],
    sourceRefs: [cite(3, 'The unit roundoff u = ε_mach / 2 bounds the relative error of a single rounding.')],
  },
  'catastrophic cancellation': {
    title: 'Catastrophic Cancellation',
    answerMarkdown: String.raw`**Catastrophic cancellation** is the large loss of accuracy that happens when you subtract two nearly equal numbers that already contain rounding error.

### How it works

The leading digits of the two numbers match, so they cancel. What remains are the trailing digits, which are exactly where the rounding error lives. The absolute error is unchanged, but the result is now tiny, so the relative error explodes.

### Example

$$
(1 + 10^{-15}) - 1 = 1.1102230246251565 \times 10^{-15}
$$

The true answer is $10^{-15}$, so the result is about $11\%$ wrong, even though each input was stored to 16 digits.

### How to avoid it

Rewrite the formula so the subtraction disappears. For small $x$, the identity

$$
1 - \cos x = 2\sin^2(x/2)
$$

lets you compute the right-hand side at full accuracy, while evaluating $1 - \cos x$ directly loses almost every digit.`,
    prerequisiteTerms: ['rounding error', 'relative error'],
    sourceRefs: [cite(4, 'Subtracting nearly equal numbers cancels their leading digits and leaves mostly rounding error.')],
  },
};

const DEMO_FOLLOW_UP: SelectedPassageExplanation = {
  title: 'Why 0.5 Is Exact but 0.1 Is Not',
  answerMarkdown: String.raw`The difference comes down to the denominator. A number can be stored exactly only if it is a binary fraction that terminates within the 53 bits of the significand.

- $0.5 = \tfrac{1}{2}$, and $2$ is a power of 2, so in binary it is simply $0.1_2$. One bit, stored exactly.
- $0.1 = \tfrac{1}{10} = \tfrac{1}{2 \cdot 5}$. The factor of $5$ can never be expressed with powers of 2, so the binary digits repeat forever: $0.000110011001100\ldots_2$.

This is the same reason $\tfrac{1}{3}$ repeats in decimal: $3$ does not divide any power of $10$.

**Rule of thumb:** a fraction terminates in base 2 exactly when its denominator (in lowest terms) is a power of 2. So $0.25$, $0.375$ and $0.5$ are exact, while $0.1$, $0.2$ and $0.3$ all pick up a tiny rounding error.`,
  terms: [
    {
      term: 'binary fraction',
      contextSnippet: 'A number can be stored exactly only if it is a binary fraction that terminates.',
      plainDefinition: 'A fraction written in base 2, where each digit after the point is worth 1/2, 1/4, 1/8, and so on.',
    },
    {
      term: 'significand',
      contextSnippet: 'within the 53 bits of the significand.',
      plainDefinition: 'The part of a floating-point number that holds its significant digits.',
    },
    {
      term: 'rounding error',
      contextSnippet: 'while 0.1, 0.2 and 0.3 all pick up a tiny rounding error.',
      plainDefinition: 'The difference between a real number and the closest value the computer can actually store.',
    },
  ],
  sourceRefs: [cite(2, 'Many decimal fractions such as 0.1 have infinite binary expansions')],
};

export function getDemoConcept(sources: LectureSource[], term: string): TechnicalConceptExplanation | undefined {
  if (!sources.some((source) => source.id === DEMO_SOURCE_ID)) return undefined;
  return DEMO_CONCEPTS[term.trim().toLowerCase()];
}

export function createDemoChat(): Chat {
  const now = Date.now();
  const chatTabId = crypto.randomUUID();
  const followUpTabId = crypto.randomUUID();
  return {
    id: crypto.randomUUID(),
    title: 'Demo: Floating-Point Arithmetic',
    createdAt: now,
    updatedAt: now,
    sources: [DEMO_SOURCE],
    history: [
      { id: crypto.randomUUID(), type: 'user', content: DEMO_QUESTION, timestamp: now },
      { id: crypto.randomUUID(), type: 'ai', content: DEMO_ANSWER.title, explanation: DEMO_ANSWER, timestamp: now },
    ],
    tabs: [
      { id: chatTabId, type: 'chat', title: 'Chat' },
      {
        id: followUpTabId,
        type: 'follow-up',
        title: 'Q: Why is 0.5 exact but 0.1 is not?',
        selectedText: 'Just as 1/3 = 0.333… never terminates in decimal, 0.1 never terminates in base 2',
        question: 'Why is 0.5 exact but 0.1 is not?',
        answerContext: DEMO_ANSWER.answerMarkdown,
        explanation: DEMO_FOLLOW_UP,
      },
    ],
    activeTabId: chatTabId,
  };
}
